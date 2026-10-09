import { EventEmitter } from 'node:events';
import { createMerger } from './state.mjs';
import { FarmMetrics } from './metrics.mjs';
import { HuntObservations } from './hunt-observations.mjs';

export class GameClient extends EventEmitter {
  constructor(session, { Socket = WebSocket, saveSession = () => {}, device } = {}) {
    super();
    this.session = session;
    this.Socket = Socket;
    this.saveSession = saveSession;
    this.device = device;
    this.status = 'parada';
    this.events = 0;
    this.attempt = 0;
    this.catalog = [];
    this.hunts = [];
    this.captures = [];
    this.metrics = new FarmMetrics();
    this.huntObservations = new HuntObservations();
  }
  start() {
    if (this.ws || this.retry) return;
    this.stopped = false;
    this.countReconnectGap = false;
    this.connect();
  }
  setStatus(status) { this.status = status; this.emit('status', status); }
  send(message) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(message));
  }
  huntGate() {
    const s=this.state;
    if(!s||this.status!=='conectada'||Date.now()-this.lastStateAt>10000)return {ready:false,message:'aguardando estado atualizado'};
    if(s.boss?.arena||s.mistico||s.pvp?.arena||s.casa?.dentro)return {ready:false,message:'aguardando sair da arena ou da casa'};
    // Server timestamps avoid depending on the user's Windows clock. Do not
    // extrapolate combat expiry: another hit could have happened in transit.
    if(!Number.isFinite(s.servidorAgora))return {ready:false,message:'aguardando relógio do servidor'};
    if(!this.lastCombatStateAt||Date.now()-this.lastCombatStateAt>1500)return {ready:false,message:'aguardando liberação atualizada do servidor'};
    if(this.huntDoorUntil>s.servidorAgora)return {ready:false,message:'aguardando intervalo de troca de rota'};
    if(!s.noCentro&&s.huntSlug){
      if(!Number.isFinite(s.centroLivreEm))return {ready:false,message:'aguardando liberação do combate'};
      if(s.centroLivreEm>s.servidorAgora||this.damageAfterState)return {ready:false,message:'aguardando janela sem combate (3 s ou fim da onda)'};
    }
    return {ready:true,message:'Troca liberada'};
  }
  validateHuntSelection(slug) {
    if(this.status!=='conectada'||this.ws?.readyState!==1||!this.state||Date.now()-this.lastStateAt>10000) throw Error('Conecte a conta e aguarde o estado atualizado antes de trocar a hunt.');
    const hunt=this.hunts.find(h=>h.slug===slug);
    if(!hunt) throw Error('Escolha uma hunt da lista recebida do jogo.');
    if(!Number.isFinite(this.state.level)||this.state.level<hunt.level) throw Error('Seu treinador ainda não tem o nível necessário.');
    if(this.routePending) throw Error('Aguarde a confirmação da troca anterior.');
    if(this.state.huntSlug===slug&&!this.state.noCentro) throw Error('Esta conta já está nessa hunt.');
    return hunt;
  }
  queueManualHunt(slug) {
    const hunt=this.validateHuntSelection(slug);
    if(this.routeUncertain)throw Error('Confira a hunt atual antes de tentar outra troca sem confirmação.');
    this.routeQueued={slug,name:hunt.name};
    this.emit('notice',`Troca manual para ${hunt.name} agendada. Aguardando o jogo liberar a saída do combate.`);
    this.flushManualHunt();
  }
  cancelManualHunt() {
    if(!this.routeQueued)return;
    this.routeQueued=null;this.emit('notice','Troca manual agendada cancelada.');
  }
  flushManualHunt() {
    const queued=this.routeQueued;if(!queued||this.routePending)return;
    if(this.state?.huntSlug===queued.slug&&!this.state.noCentro){this.routeQueued=null;return;}
    if(!this.huntGate().ready)return;
    this.routeQueued=null;
    try {this.selectHunt(queued.slug);}
    catch {this.emit('notice','Troca manual cancelada: confira a conexão, o nível e a hunt atual antes de tentar novamente.');}
  }
  selectHunt(slug) {
    const hunt=this.validateHuntSelection(slug);
    const gate=this.huntGate();if(!gate.ready)throw Error(gate.message);
    this.routeUncertain=false;
    this.routePending=slug;
    this.routeTimer=setTimeout(()=>{this.routeUncertain=true;this.routePending=null;this.routeTimer=null;this.emit('notice','Troca de hunt sem confirmação. Confira a rota atual antes de tentar novamente.');},15000);
    this.routeTimer.unref?.();
    this.send({t:'hunt.select',slug});
    this.emit('notice',`Troca para ${hunt.name} solicitada. Aguardando confirmação do jogo.`);
  }
  confirmHunt() {
    if(this.routePending&&this.state?.huntSlug===this.routePending&&!this.state.noCentro){clearTimeout(this.routeTimer);this.routeTimer=null;this.routePending=null;this.emit('notice','Nova hunt confirmada pelo jogo.');}
  }
  connect() {
    if (this.stopped) return;
    this.setStatus('conectando');
    this.state = null;
    this.damageAfterState=false;this.huntDoorUntil=0;
    this.merge = createMerger();
    this.lastGame = Date.now();
    const ws = new this.Socket('wss://pokeidle.io/');
    this.ws = ws;
    const opening = setTimeout(() => ws.close(), 20000);
    ws.addEventListener('open', () => {
      clearTimeout(opening);
      this.send({ t: 'hello', nick: this.session.nick, token: this.session.token,
        delta: 1, dispositivo: this.device ?? null });
    });
    ws.addEventListener('message', ({ data }) => {
      if (this.ws !== ws) return;
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (m.t === 'pong') return;
      if (m.t === 'sessao.renovada') {
        if (typeof m.token === 'string' && m.token) {
          this.session = { ...this.session, token: m.token };
          try { this.saveSession(this.session); }
          catch { this.emit('notice', 'Não foi possível salvar a sessão renovada.'); this.stop(); }
        }
        return;
      }
      this.lastGame = Date.now();
      if (m.t === 'welcome') {
        this.metrics.resume(this.countReconnectGap);this.countReconnectGap=false;
        this.attempt = 0;
        this.state = this.merge(m.estado);
        this.lastStateAt=Date.now();
        this.lastCombatStateAt=Number.isFinite(m.estado?.servidorAgora)?Date.now():0;
        this.damageAfterState=false;
        // Read-only combat metadata for the local route estimator; never expose credentials.
        this.huntCombat={types:m.tabelaTipos??{},amplification:m.ampliacaoHunt,hpMultiplier:m.multHpSelvagem,damageMultiplier:m.multDanoSelvagem,boosts:(m.tiposBoost??[]).filter(b=>['xp','pokexp'].includes(b.chave)&&Number.isFinite(b.mult)).map(b=>({key:b.chave,mult:b.mult}))};
        this.hunts=(Array.isArray(m.hunts)?m.hunts:[]).filter(h=>typeof h?.slug==='string'&&h.slug.length<=120&&!/[\x00-\x1f]/.test(h.slug)&&Number.isSafeInteger(h.nivel)&&h.nivel>=0).map(h=>({slug:h.slug,name:String(h.nome??h.slug).replace(/[\x00-\x1f]/g,' ').slice(0,100),level:h.nivel}));
        this.catalog = (m.catalogoBolas ?? []).filter(b => b.compravel).map(b => ({ kind: 'ball', id: b.id, name: b.nome, price: b.priceGold }));
        this.customItems = m.itensNossos ?? [];
        this.serverPrices = m.itensCompraveis ?? [];
        this.baseline ??= { gold: this.state?.gold, at: Date.now() };
        this.setStatus('conectada');
        this.send({ t: 'cliente.economia', ativo: true });
      } else if (m.t === 'estado') {this.state = this.merge(m.estado);this.lastStateAt=Date.now();if(Number.isFinite(m.estado?.servidorAgora)&&(Number.isFinite(this.state?.centroLivreEm)||this.state?.noCentro===true)){this.damageAfterState=false;this.lastCombatStateAt=Date.now();}this.confirmHunt();}
      else if (m.t === 'batalha') {
        const events = Array.isArray(m.ev) ? m.ev : [];
        this.events += events.length;
        for (const e of events) {
          if(e?.k==='ataque')this.damageAfterState=true;
          if(e?.k==='hunt')this.huntDoorUntil=Math.max(this.huntDoorUntil??0,Number(e.trocaLivreEm)||0);
          this.metrics.event(e);
          this.huntObservations.event(e);
          if (e?.k !== 'capturado' || !e.pokemon || typeof e.pokemon !== 'object') continue;
          const p = e.pokemon;
          if (p.id != null && this.captures.some(c => c.id === p.id)) continue;
          this.captures.unshift({id:p.id ?? null,name:String(p.nome ?? 'Pokémon').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,60),level:Number.isSafeInteger(p.level) ? p.level : null,shiny:!!p.shiny,at:Date.now()});
          this.captures.length = Math.min(20,this.captures.length);
        }
      }
      else if (m.t === 'erro') {
        // Never print raw server messages that might contain credentials.
        this.emit('notice', 'Servidor retornou um erro; conta pausada para revisão.');
        this.stop();
      }
      if (m.t === 'welcome' || m.t === 'estado') this.emit('state', this.state);
    });
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastGame > 35000) ws.close();
      else this.send({ t: 'ping' });
    }, 25000);
    ws.addEventListener('error', () => {});
    ws.addEventListener('close', ({ code }) => {
      clearTimeout(opening);
      clearInterval(this.heartbeat);
      if (this.ws !== ws) return;
      this.ws = null;
      this.cancelManualHunt();
      this.metrics.pause();
      this.huntObservations.pause();
      this.emit('disconnected');
      if (this.stopped) return;
      if (code === 4001 || code === 4003) {
        this.stopped = true;
        this.setStatus(code === 4001 ? 'pausada: outra sessão assumiu' : 'pausada: acesso recusado');
        return;
      }
      this.countReconnectGap=true;
      this.setStatus('aguardando reconexão');
      const delay = Math.min(60000, 1500 * 2 ** Math.min(this.attempt++, 6)) + Math.random() * 1000;
      this.retry = setTimeout(() => { this.retry = null; this.connect(); }, delay);
    });
  }
  stop() {
    this.cancelManualHunt();
    clearTimeout(this.routeTimer);this.routeTimer=null;this.routePending=null;
    this.metrics.pause();
    this.huntObservations.pause();
    this.emit('disconnected');
    this.stopped = true;
    clearTimeout(this.retry);
    this.retry = null;
    clearInterval(this.heartbeat);
    this.ws?.close();
    this.setStatus('parada');
  }
}
