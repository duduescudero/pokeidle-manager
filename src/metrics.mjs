const n=v=>Number.isFinite(v) && v>=0 ? v : 0;
const clean=v=>String(v??'Item').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,60);
export function progress(p) {
  if(!p || ![p.xp,p.xpNivel,p.xpProximo].every(Number.isFinite)) return null;
  const total=Math.max(1,p.xpProximo-p.xpNivel),current=Math.max(0,p.xp-p.xpNivel);
  return {current,total,percent:Math.min(100,100*current/total)};
}
export class FarmMetrics {
  constructor(now=Date.now){this.now=now;this.connectedAt=null;this.ms=0;this.xpTrainer=0;this.xpPokemon=0;this.income=0;this.kills=0;this.catches=0;this.shinySeen=0;this.shinyCaught=0;this.used=new Map();this.drops=new Map();}
  resume(countGap=false){if(this.connectedAt===null){if(countGap&&this.pausedAt!=null)this.ms+=Math.max(0,this.now()-this.pausedAt);this.connectedAt=this.now();this.pausedAt=null;}}
  pause(){if(this.connectedAt!==null){this.ms+=this.now()-this.connectedAt;this.connectedAt=null;this.pausedAt=this.now();}}
  event(e){
    if(!e || typeof e!=='object')return;
    if((e.k==='morte'&&e.quem==='selvagem') || e.k==='bossMorto'){
      if(e.k==='morte')this.kills++;
      this.lastReward={xpTrainer:n(e.xpTreinador??e.xp),xpPokemon:n(e.xpPokemon??e.xp)};
      this.xpTrainer+=this.lastReward.xpTrainer;this.xpPokemon+=this.lastReward.xpPokemon;
      this.income+=e.k==='morte'?n(e.ouro)+n(e.ouroVendaAuto):n(e.valor);
      for(const d of Array.isArray(e.drops)?e.drops:[]){if(!d||this.drops.size>=64&&!this.drops.has(String(d.itemId??d.nome)))continue;const key=String(d.itemId??d.nome);const item=this.drops.get(key)??{name:clean(d.nome),qty:0};item.qty+=n(d.qtd)||1;this.drops.set(key,item);}
    }
    if(e.k==='capturado'){this.catches++;if(e.pokemon?.shiny)this.shinyCaught++;}
    if(e.k==='bola'&&e.shiny)this.shinySeen++;
    const kind=e.k==='bola'?'ball':['cura','revive'].includes(e.k)?'item':null,id=e.k==='bola'?e.ballId:e.itemId;
    if(kind&&Number.isSafeInteger(id)&&id>0){const key=`${kind}:${id}`,item=this.used.get(key)??{kind,id,qty:0};item.qty++;this.used.set(key,item);}
  }
  snapshot(catalog=[]){
    const uptimeMs=this.ms+(this.connectedAt===null?0:this.now()-this.connectedAt),ready=uptimeMs>=60000;
    const rate=v=>ready?Math.round(v*3600000/uptimeMs):null;
    let cost=0,costComplete=true;
    const used=[...this.used.values()].map(i=>{const item=catalog.find(c=>c.kind===i.kind&&c.id===i.id);const price=item?.price;if(!Number.isFinite(price)||price<=0)costComplete=false;else cost+=i.qty*price;return {...i,name:item?.name??`${i.kind==='ball'?'Bola':'Item'} ${i.id}`};});
    return {uptimeMs,ready,lastReward:this.lastReward??null,xpTrainer:this.xpTrainer,xpPokemon:this.xpPokemon,income:this.income,costEstimated:cost,costComplete,netEstimated:costComplete?this.income-cost:null,kills:this.kills,catches:this.catches,shinySeen:this.shinySeen,shinyCaught:this.shinyCaught,trainerHour:rate(this.xpTrainer),pokemonHour:rate(this.xpPokemon),goldHour:rate(this.income),netHour:costComplete?rate(this.income-cost):null,killsHour:rate(this.kills),catchesHour:rate(this.catches),used,drops:[...this.drops.values()].sort((a,b)=>b.qty-a.qty)};
  }
}
export function gameDetails(s,now=Date.now()){
  if(!s)return {trainerXp:null,bonuses:[],automation:'Aguardando estado do jogo'};
  const bonuses=[],loja=s.loja,kk=s.kick,ev=s.evento;
  if(loja)bonuses.push({name:'VIP',text:loja.vip&&(loja.vipAte==null||loja.vipAte>now||loja.vipAte===-1)?'+50% XP treinador e Pokémon':'Inativo',until:loja.vip?loja.vipAte:null});
  if(kk){const active=Object.entries(kk.bonus??{}).filter(([,until])=>until>now);bonuses.push({name:'Kick',text:active.length?active.map(([type])=>`${type}: +${n(kk.pct)}%`).join(' · '):(kk.vinculado??!!kk.login)?'Vinculada · sem bônus ativo':'Não vinculada'});}
  if(ev?.terminaEm>now)bonuses.push({name:'Evento',text:`+${n(ev.xpTreinadorPct)}% XP treinador · +${n(ev.xpPokemonPct)}% XP Pokémon · +${n(ev.farmPct)}% farm`,until:ev.terminaEm});
  const a=s.automation;
  const automation=a?['Bolas '+(a.autoBallSemParar||a.autoBall&&!a.autoBallAteCapturar?'sem parar':a.autoBallAteCapturar?'até capturar':'desligadas'),'Poção '+(a.autoPotion?'ligada':'desligada')+(Number.isFinite(a.hpLimiar)?` (HP < ${Math.round(a.hpLimiar*100)}%)`:''),'Revive '+(a.autoRevive?'ligado':'desligado'),'Voltar à hunt '+(a.autoVoltarHunt?'ligado':'desligado')].join(' · '):'Automações não informadas';
  return {trainerXp:progress(s),diamonds:s.diamonds??null,gems:s.orbs??null,bonuses,automation};
}
