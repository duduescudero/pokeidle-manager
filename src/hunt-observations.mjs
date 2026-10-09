// Passive validation only: no route, inventory, purchase or sale commands.
const amount=v=>Number.isFinite(v)&&v>=0?v:0;
export class HuntObservations {
  constructor(now=Date.now){this.now=now;this.records=[];this.active=null;this.last=this.now();}
  advance(){const now=this.now(),elapsed=now-this.last;if(this.active&&elapsed>=0&&elapsed<=10000)this.active.ms+=elapsed;this.last=now;}
  update(state,connected){
    this.advance();
    const p=state?.pokemons?.find(p=>p.id===state.activeId);
    if(connected&&p&&this.active?.pokemonId===p.id&&this.active.lastHp>0&&p.hp===0)this.death();
    if(!connected||!p||!state.huntSlug||state.noCentro){this.active=null;return;}
    const key=JSON.stringify([state.huntSlug,p.id,p.tmElemental,p.tmAoe,p.quality,p.potencia,p.shiny]);
    if(this.active?.key!==key){
      const row={key,hunt:state.huntSlug,pokemonId:p.id,pokemon:String(p.nome??'Pokémon').slice(0,80),minLevel:p.level,maxLevel:p.level,ms:0,kills:0,xpTrainer:0,xpPokemon:0,potions:0,deaths:0,startedAt:this.now(),buildChanged:false,configuration:JSON.stringify([p.stats,p.refino,state.automation,state.loja,state.evento,state.twitch?.pctAtual,state.guildBonusPct])};
      this.records.unshift(row);this.records.length=Math.min(32,this.records.length);this.active=row;
    }
    if(p.level!==this.active.minLevel)this.active.buildChanged=true;
    if(this.active.configuration!==JSON.stringify([p.stats,p.refino,state.automation,state.loja,state.evento,state.twitch?.pctAtual,state.guildBonusPct]))this.active.buildChanged=true;
    this.active.minLevel=Math.min(this.active.minLevel,p.level);this.active.maxLevel=Math.max(this.active.maxLevel,p.level);
    this.active.lastHp=p.hp;
  }
  death(){if(this.active&&(this.active.lastDeath==null||this.now()-this.active.lastDeath>1000)){this.active.deaths++;this.active.lastDeath=this.now();}}
  pause(){this.advance();this.active=null;}
  event(e){
    if(!this.active||!e)return;this.advance();
    if(e.k==='morte'&&e.quem==='selvagem'){this.active.kills++;this.active.xpTrainer+=amount(e.xpTreinador??e.xp);this.active.xpPokemon+=amount(e.xpPokemon??e.xp);}
    if(e.k==='cura')this.active.potions++;
    if(e.k==='morte'&&['jogador','pokemon','heroi'].includes(e.quem))this.death();
  }
  snapshot(){this.advance();return this.records.map(r=>{
    const rate=n=>r.ms>=60000?Math.round(n*3600000/r.ms):null;
    return {hunt:r.hunt,pokemon:r.pokemon,minutes:Number((r.ms/60000).toFixed(1)),ready:r.ms>=900000&&r.kills>0,minLevel:r.minLevel,maxLevel:r.maxLevel,buildChanged:r.buildChanged,kills:r.kills,xpTrainer:r.xpTrainer,xpPokemon:r.xpPokemon,potions:r.potions,deaths:r.deaths,trainerHour:rate(r.xpTrainer),pokemonHour:rate(r.xpPokemon),potionsHour:rate(r.potions),deathsHour:rate(r.deaths),startedAt:r.startedAt};
  });}
}
