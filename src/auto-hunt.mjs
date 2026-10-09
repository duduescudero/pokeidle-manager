// Passive route automation: only use server-confirmed windows, never forfeit XP.
export class AutoHunt {
  constructor({notice=()=>{},now=Date.now}={}) { this.notice=notice;this.now=now;this.enabled=false;this.message='Desligado';this.lastChange=0; }
  configure(enabled) { if(typeof enabled!=='boolean')throw Error('Informe se Auto melhor hunt está ligado.');this.enabled=enabled;this.fault='';this.message=enabled?'Aguardando recomendação atualizada':'Desligado'; }
  tick(client,advice) {
    if(!this.enabled)return;
    if(client.routeQueued){this.message='Aguardando a troca escolhida manualmente';return;}
    if(this.fault){this.message=this.fault;return;}
    if(client.status!=='conectada'||client.ws?.readyState!==1||!client.state||this.now()-client.lastStateAt>10000){this.message='Aguardando conta conectada e atualizada';return;}
    if(client.routePending){this.message='Aguardando confirmação da nova hunt';return;}
    if(client.routeUncertain){this.fault=this.message='Troca sem confirmação. Desligue, confira a hunt e ative novamente.';return;}
    const inCenter=client.state.noCentro===true;
    if(inCenter){
      const active=client.state.pokemons?.find(p=>p.id===client.state.activeId);
      const maxHp=active?.maxHp>0?active.maxHp:active?.stats?.hp>0?active.stats.hp*12:advice?.maxHp;
      if(!Number.isFinite(active?.hp)||!Number.isFinite(maxHp)||maxHp<=0||active.hp<maxHp){this.message='Aguardando cura completa do Pokémon ativo no Centro';return;}
    }
    const best=advice?.rows?.find(r=>r.slug===advice?.recommended?.[0]&&r.risk==='baixo'&&Number.isFinite(r.xpHour)&&r.xpHour>0);
    if(!advice?.available||!best){this.message='Nenhuma recomendação de baixo risco disponível';return;}
    if(!client.hunts.some(h=>h.slug===best.slug&&h.level<=client.state.level)){this.message='Aguardando rota liberada pelo jogo';return;}
    const current=advice.rows.find(r=>r.slug===client.state.huntSlug);
    if(best.slug===client.state.huntSlug&&!inCenter){this.message='Já está na melhor hunt recomendada';return;}
    if(!inCenter&&current?.risk==='baixo'&&best.xpHour<current.xpHour*1.05){this.message='Mantendo hunt: ganho estimado menor que 5%';return;}
    if(this.lastChange&&this.now()-this.lastChange<60000){this.message='Estabilizando a hunt por 1 minuto';return;}
    this.target=best.slug;
    const gate=client.huntGate();
    if(!gate.ready){this.message=`${best.name??best.slug}: ${gate.message}`;return;}
    try {client.selectHunt(best.slug);this.lastChange=this.now();this.message='Aguardando confirmação da nova hunt';this.notice(`Auto melhor hunt: troca para ${best.name??best.slug}, por XP estimado e baixo risco.`);}
    catch {this.fault=this.message='Auto melhor hunt pausado. Confira os logs e ative novamente.';}
  }
  snapshot(){return {enabled:this.enabled,message:this.message,target:this.target??null};}
}
