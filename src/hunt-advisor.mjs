import { readFileSync } from 'node:fs';
// Independent estimator. Public catalog contains facts, not the guide's simulator code.
let bundled=null;
try { bundled=JSON.parse(readFileSync(new URL('../data/hunt-catalog.json',import.meta.url),'utf8')); } catch {}
const keys=['hp','atk','def','spAtk','spDef','speed'];
const positive=v=>Number.isFinite(v)&&v>0;
const clean=v=>String(v??'Pokémon').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,100);
export function effectiveness(type,defenders,table,amplification=1.5) {
  const raw=[...new Set(defenders)].reduce((value,t)=>value*(table[type]?.[t]??(t===type&&!['NORMAL','GROUND','FLYING'].includes(t)?['GHOST','DRAGON'].includes(t)?2:.5:1)),1);
  return raw>1?1+(raw-1)*amplification:raw<1?raw/amplification:raw;
}
// Verified against the official public shared/cooldown-golpes.mjs on 2026-10-07.
export function moveCooldown(ms,baseSpeed,iv) {
  const potential=Math.min(7,baseSpeed<=120?baseSpeed/20:6+(baseSpeed-120)/40);
  return Math.round(ms*(1-potential*Math.min(32,Math.max(1,iv))/3200))/1000;
}
export function xpPerKill(level) {return level<=150?Math.floor(6*level*level/10)+8:Math.round(13500*(level/150)**1.25);}
function damage(level,power,attack,defense,stab,mult) {
  return (((2*level/5+2)*power*Math.max(1,attack)/Math.max(1,defense))/50+2)*(stab?1.5:1)*mult*0.925;
}
function profile(state,species) {
  const p=state?.pokemons?.find(p=>p.id===state.activeId);
  if(!p||!positive(p.level)) return {error:'Aguardando o Pokémon ativo do jogo.'};
  const sp=species.get(p.speciesId);
  if(!sp) return {error:'Esta espécie ainda não está no catálogo de recomendações.'};
  let stats=p.stats,derived=false;
  if(!['atk','def','spAtk','spDef'].every(k=>positive(stats?.[k]))) {
    if(!positive(p.quality)||!keys.every(k=>positive(p.ivs?.[k]))||!Number.isSafeInteger(p.potencia)||p.potencia<1||p.potencia>5) return {error:'O jogo ainda não enviou atributos, IVs e qualidade suficientes para recomendar.'};
    const multiplier=(1+[0,.05,.1,.25,1][p.potencia-1])*(p.shiny?3:1);
    stats=Object.fromEntries(keys.map((k,i)=>[k,Math.round((sp.base[i]+Math.max(0,Number(p.refino?.[k])||0)+2*p.ivs[k])*p.level/100*p.quality**(['hp','speed'].includes(k)?.95:.8)*multiplier)]));
    derived=true;
  }
  const hp=positive(p.maxHp)?p.maxHp:positive(stats.hp)?stats.hp*12:null;
  if(!hp||!positive(p.ivs?.speed)||p.ivs.speed>32) return {error:'Aguardando HP máximo e IV de Speed do Pokémon.'};
  return {p,sp,stats,hp,derived,iv:p.ivs.speed};
}
// Deterministic event simulation: persistent skill cooldowns across 32 opponents,
// overkill, basic attacks, and bounded work even on impossible matchups.
function fight(profile,target,level,rules) {
  const {p,sp,stats,iv}=profile;
  const wild=k=>(target.base[k]+32)*level/100;
  const multiplier=(type,types)=>effectiveness(type,types,rules.types,rules.amplification);
  const moves=sp.moves.filter(m=>m.level<=p.level).map(m=>({
    damage:damage(p.level,m.power,m.category==='physical'?stats.atk:stats.spAtk,wild(m.category==='physical'?2:4),sp.types.includes(m.type),multiplier(m.type,target.types)),
    cooldown:moveCooldown(m.cooldown,sp.base[5],iv)
  }));
  if(typeof p.tmElemental==='string'&&sp.types.includes(p.tmElemental))moves.push({damage:damage(p.level,2800,stats.spAtk,wild(4),true,multiplier(p.tmElemental,target.types)),cooldown:moveCooldown(60000,sp.base[5],iv)});
  const basic=damage(p.level,30,stats.atk,wild(2),true,multiplier(sp.types[0],target.types));
  const gap=Math.max(.4,.9-iv*.01),basicCooldown=Math.max(.4,2-iv*.01);
  const ready=moves.map(()=>0),queued=moves.map(()=>false),queue=[];let basicReady=0,time=0,total=0;
  for(let enemy=0;enemy<32;enemy++) {
    const hp=Math.max(24,(target.base[0]+2*(1+enemy))*level/100*12*rules.hpMultiplier);
    const begin=time;let remaining=hp,last=time,steps=0;
    while(remaining>0&&steps++<600) {
      for(let i=0;i<moves.length;i++)if(!queued[i]&&ready[i]<=time+1e-8){queue.push(i);queued[i]=true;}
      const i=queue.length?queue.shift():-1;
      if(i>=0){queued[i]=false;remaining-=moves[i].damage;ready[i]=time+moves[i].cooldown;last=time;time+=gap;}
      else if(basicReady<=time+1e-8){remaining-=basic;basicReady=time+basicCooldown;last=time;time+=gap;}
      else time=Math.min(basicReady,...ready);
    }
    if(remaining>0)return null;
    total+=last-begin;time=last+rules.idle;
  }
  const incoming=target.moves.map(m=>damage(level,m.power,wild(m.category==='physical'?1:3),m.category==='physical'?stats.def:stats.spDef,target.types.includes(m.type),multiplier(m.type,sp.types))*rules.damageMultiplier);
  const basicIncoming=damage(level,30,wild(1),stats.def,true,multiplier(target.types[0],sp.types))*rules.damageMultiplier;
  // Unknown wild attack selection and positioning are explicitly model assumptions.
  const skillAverage=incoming.length?incoming.reduce((s,d)=>s+d,0)/incoming.length:0;
  const wildDps=(skillAverage*.92+basicIncoming*.08)/1.5*1.4;
  return {seconds:total/32,incoming:wildDps,peak:Math.max(wildDps*1.5*1.6, basicIncoming/.925)};
}
export function guideXpPerKill(level,slug,data) {
  if(positive(data?.measuredXp?.[slug]))return data.measuredXp[slug];
  return level<=150?level*level+12:level<=1000?Math.round(22512*(level/150)**.98):Math.round(144617*(level/1000)**1.25);
}
// Geometry measurements constrain throughput; missing maps are visibly estimated.
export function mapThroughput(slug,level,seconds,aoe,map={},bike=0) {
  const step=.26/(1+Math.max(0,bike)),dists=map.distances??Array(15).fill((map.near??4.9)*2.22+9.7);
  const count=dists.length,average=dists.reduce((s,d)=>s+d,0)/count;
  const cycle=Math.max(1.8,seconds+1),slot=level>150?count*3600/(slug.endsWith('_sinnoh')?30:65):Infinity;
  let finish=0;
  for(const distance of [...dists].sort((a,b)=>a-b))finish=Math.max(finish+cycle+average*step*.31,distance*1.9*step/(1.9+step));
  let rate=Math.min(3600/cycle,count*3600/(finish+2.8),slot,map.wave?count*3600/map.wave[0]:Infinity);
  if(aoe)rate=Math.max(rate,Math.min(3600*2.2/cycle,slot,map.wave?count*3600/map.wave[0]:Infinity));
  // Recorded build-specific rates are not universal caps for every Pokémon.
  const low=Math.min(rate,count*3600/(map.wave?.[1]??75));
  return {rate,low,average,estimated:!map.distances||map.origin==='padrao'};
}
export function xpMultipliers(state,combat={},now=Date.now()) {
  const pct=v=>1+(Number.isFinite(v)&&v>0?v:0)/100;
  const shop=state?.loja??{},event=state?.evento??{},kick=state?.kick??{},twitch=state?.twitch??{};
  const vip=shop.vip&&(shop.vipAte===-1||shop.vipAte==null||shop.vipAte>now)?1.5:1;
  const guild=pct(state?.guildBonusPct)*(state?.guild?.boostAte>now?1.1:1);
  const tw=twitch.assistindo===true?pct(twitch.pctAtual??twitch.pct):1;
  const channel=key=>{
    const boost=shop.boosts?.[key]>now?(combat.boosts??[]).find(b=>b.key===key)?.mult??1:1;
    const kk=kick.bonus?.[key]>now?pct(kick.pct):1;
    const ev=event.terminaEm>now?pct(event[key==='xp'?'xpTreinadorPct':'xpPokemonPct']):1;
    const catchup=shop.atrasados?.alvo>state?.level&&positive(shop.atrasados.mult)?shop.atrasados.mult:1;
    return vip*guild*tw*boost*kk*ev*catchup;
  };
  return {trainer:channel('xp'),pokemon:channel('pokexp')};
}
export function recommendHunts(state,serverHunts,combat={},potions=[],data=bundled) {
  const empty=message=>({available:false,message,rows:[]});
  if(!data)return empty('Catálogo local indisponível. Você ainda pode escolher uma hunt manualmente.');
  if(!positive(state?.level)||!Array.isArray(serverHunts)||!serverHunts.length)return empty('Conecte a conta para receber as hunts e o nível do treinador.');
  const species=new Map(data.species.map(s=>[s.id,s])),routes=new Map(data.hunts.map(h=>[h.slug,h]));
  const player=profile(state,species);if(player.error)return empty(player.error);
  const types=combat.types&&Object.keys(combat.types).length?combat.types:data.types;
  const rules={types,amplification:positive(combat.amplification)?combat.amplification:1.5,hpMultiplier:positive(combat.hpMultiplier)?combat.hpMultiplier:5,damageMultiplier:positive(combat.damageMultiplier)?combat.damageMultiplier:1.8};
  const allowed=state.automation?.potionIds;
  const potion=state.automation?.autoPotion?potions.filter(i=>i.category==='heal'&&positive(i.heal)&&positive(i.price)&&(state.items?.[i.id]??0)>0&&Array.isArray(allowed)&&allowed.includes(i.id)).sort((a,b)=>allowed.indexOf(a.id)-allowed.indexOf(b.id))[0]:null;
  const multipliers=xpMultipliers(state,combat);
  const rows=[];let skipped=0;
  for(const server of serverHunts.filter(h=>Number.isFinite(h.level)&&h.level<=state.level)) {
    const route=routes.get(server.slug);
    if(!route?.species?.length||route.species.some(([id])=>!species.has(id))){skipped++;continue;}
    const weight=route.species.reduce((s,[,w])=>s+w,0);
    let seconds=0,incoming=0,peak=0,possible=true;
    rules.idle=1+2.6/(data.maps?.[server.slug]?.distances?.length??Math.min(16,weight));
    for(const [id,w] of route.species){const result=fight(player,species.get(id),server.level,rules);if(!result){possible=false;break;}seconds+=result.seconds*w/weight;incoming+=result.incoming*w/weight;peak=Math.max(peak,result.peak);}
    if(!possible||!Number.isFinite(seconds)||seconds>120){skipped++;continue;}
    const map=mapThroughput(server.slug,server.level,seconds,!!player.p.tmAoe,data.maps?.[server.slug]);
    const simultaneous=player.p.tmAoe?Math.min(15,1+map.rate*seconds/3600):1;
    const damagePerKill=incoming*seconds*simultaneous;
    const naturalLife=player.hp/Math.max(1e-6,damagePerKill);
    const killsPerLife=potion?(peak>=player.hp?player.hp/Math.max(1e-6,peak):999):naturalLife;
    const trigger=Number.isFinite(state.automation?.hpLimiar)?Math.max(.1,Math.min(.9,state.automation.hpLimiar)):.4;
    const risk=peak>=player.hp||killsPerLife<1?'alto':killsPerLife<5||seconds>60||(potion&&peak>player.hp*trigger)?'moderado':'baixo';
    const deathTime=3+map.average*.26,lifeSeconds=killsPerLife*3600/map.rate;
    const uptime=lifeSeconds/(lifeSeconds+deathTime),kills=map.rate*uptime;
    const effectiveHeal=potion?Math.min(potion.heal,player.hp*(1-trigger)):0;
    const potionsHour=potion?damagePerKill*kills/Math.max(1,effectiveHeal):0;
    const xpBase=guideXpPerKill(server.level,server.slug,data);
    rows.push({slug:server.slug,name:clean(server.name),region:route.region,level:server.level,xpHour:Math.round(kills*xpBase*multipliers.pokemon),trainerHour:Math.round(kills*xpBase*multipliers.trainer),xpBase,xpBasis:positive(data.measuredXp?.[server.slug])?'medido pelo guia':'curva estimada do guia',xpLow:Math.round(map.low*uptime*xpBase*multipliers.pokemon),mapEstimated:map.estimated,killsHour:Math.round(kills),deathsHour:Number((3600/(lifeSeconds+deathTime)).toFixed(1)),risk,seconds:Number(seconds.toFixed(1)),potionsHour:Math.ceil(potionsHour),potionCost:potion?Math.ceil(potionsHour*potion.price):0,killsPerLife:Number(killsPerLife.toFixed(1))});
  }
  rows.sort((a,b)=>a.xpHour===b.xpHour?a.slug.localeCompare(b.slug):b.xpHour-a.xpHour);
  const recommended=rows.filter(r=>r.risk==='baixo').slice(0,12);
  return {available:rows.length>0,message:rows.length?recommended.length?'Ranking por XP estimado com bônus conhecidos; recomendações de baixo risco.':'Nenhuma rota de baixo risco encontrada. Confira Todas as hunts com cuidado.':'Sem rotas calculáveis para esta ficha.',
    pokemon:clean(player.p.apelido||player.p.nome||player.sp.name),level:player.p.level,maxHp:player.hp,derived:player.derived,healing:!!potion,potionName:potion?.name??'',multipliers,aoe:!!player.p.tmAoe,updatedAt:data.updatedAt,skipped,rows:rows.slice(0,751),recommended:recommended.map(r=>r.slug),
    assumptions:'Base e geometria do guia; simulação local com cooldown atual do jogo. Estimativas com bônus conhecidos, não uma medição real.'};
}
// Cache ignores XP/gold/HP fluctuations; rebuild on relevant combat/build/stock changes.
export function createHuntAdvisor(data=bundled) {
  let signature,result;
  return (state,hunts,combat,potions)=>{
    const active=state?.pokemons?.find(p=>p.id===state.activeId);
    const key=JSON.stringify([state?.level,active&&{id:active.id,name:active.nome,nick:active.apelido,speciesId:active.speciesId,level:active.level,stats:active.stats,ivs:active.ivs,quality:active.quality,potencia:active.potencia,shiny:active.shiny,refino:active.refino,maxHp:active.maxHp,tmElemental:active.tmElemental,tmAoe:active.tmAoe},state?.automation,xpMultipliers(state,combat),potions?.map(i=>({...i,inStock:(state?.items?.[i.id]??0)>0})),hunts,combat]);
    if(key!==signature){result=recommendHunts(state,hunts,combat,potions,data);signature=key;}
    return result;
  };
}
