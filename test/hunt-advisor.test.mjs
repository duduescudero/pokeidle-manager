import {existsSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommendHunts,createHuntAdvisor,effectiveness,moveCooldown,xpPerKill,guideXpPerKill,mapThroughput,xpMultipliers} from '../src/hunt-advisor.mjs';

const species=(id,type,base=[60,60,60,60,60,60])=>({id,name:type,types:[type],base,moves:[{type,category:'special',power:100,cooldown:30000,level:1}]});
const data={updatedAt:'2026-10-07',types:{FIRE:{GRASS:2,WATER:.5},WATER:{FIRE:2},GRASS:{FIRE:.5}},species:[species(1,'FIRE'),species(2,'GRASS'),species(3,'WATER')],hunts:[{slug:'grass',species:[[2,15]]},{slug:'water',species:[[3,15]]},{slug:'locked',species:[[2,15]]}]};
const hunts=[{slug:'grass',name:'Grass',level:50},{slug:'water',name:'Water',level:50},{slug:'locked',name:'Locked',level:100}];
function state(){return {level:80,activeId:1,pokemons:[{id:1,speciesId:1,nome:'Fogo',level:100,stats:{atk:400,spAtk:400,def:800,spDef:800},ivs:{speed:32},maxHp:10000}],automation:{autoPotion:false,potionIds:[204]},items:{204:10}};}
test('known official combat and reward anchors, immunities and dual types',()=>{
  assert.equal(xpPerKill(40),968);assert.equal(xpPerKill(150),13508);assert.equal(xpPerKill(300),Math.round(13500*2**1.25));
  assert.equal(moveCooldown(60000,200,32),55.8);
  assert.equal(effectiveness('FIRE',['GRASS','GRASS'],data.types),2.5);
  assert.equal(effectiveness('FIRE',['WATER'],data.types),1/3);
  assert.equal(effectiveness('NORMAL',['GHOST'],{NORMAL:{GHOST:0}}),0);
});
test('ranks type advantage using the actual active stats and only server-unlocked hunts',()=>{
  const s=state(),before=JSON.stringify(s);const result=recommendHunts(s,hunts,{},[],data);
  assert.equal(result.available,true);assert.equal(result.rows[0].slug,'grass');
  assert.ok(result.rows[0].xpHour>result.rows[1].xpHour);assert.ok(result.rows.every(r=>r.level<=80));
  assert.ok(result.rows.every(r=>Number.isFinite(r.xpHour)&&r.xpHour>0));
  assert.equal(JSON.stringify(s),before);assert.ok(!JSON.stringify(result).includes('token'));
});
test('different active species reverses matchup recommendation and cooldown carry stays deterministic',()=>{
  const s=state();s.pokemons[0].speciesId=3;
  const routes=[{slug:'fire',name:'Fire',level:50},{slug:'grass',name:'Grass',level:50}];
  const catalog={...data,hunts:[...data.hunts,{slug:'fire',species:[[1,15]]}]};
  const a=recommendHunts(s,routes,{},[],catalog),b=recommendHunts(s,routes,{},[],catalog);
  assert.equal(a.rows[0].slug,'fire');assert.deepEqual(a,b);
});
test('missing or unknown Pokémon data does not manufacture recommendations',()=>{
  const s=state();delete s.pokemons[0].stats;
  assert.equal(recommendHunts(s,hunts,{},[],data).available,false);
  s.pokemons[0].speciesId=999;assert.equal(recommendHunts(s,hunts,{},[],data).available,false);
  assert.equal(recommendHunts(null,hunts,{},[],data).available,false);
  assert.equal(recommendHunts(state(),hunts,{},[],null).available,false);
});
test('supported IV/quality fallback derives stats while direct server stats take precedence',()=>{
  const s=state(),p=s.pokemons[0];delete p.stats;p.ivs={hp:32,atk:32,def:32,spAtk:32,spDef:32,speed:32};p.quality=1.2;p.potencia=2;
  assert.equal(recommendHunts(s,hunts,{},[],data).derived,true);
  p.stats={atk:400,spAtk:400,def:800,spDef:800};assert.equal(recommendHunts(s,hunts,{},[],data).derived,false);
});
test('lethal routes are not recommended and healing requires automation and stock',()=>{
  const s=state();s.pokemons[0].maxHp=5;s.pokemons[0].stats.def=1;s.pokemons[0].stats.spDef=1;
  const result=recommendHunts(s,hunts,{},[],data);
  assert.ok(result.rows.every(r=>r.risk==='alto'));assert.deepEqual(result.recommended,[]);
  const fresh=state();fresh.automation.autoPotion=true;
  const potions=[{id:204,heal:3000,price:135,category:'heal'}];
  const healing=recommendHunts(fresh,hunts,{},potions,data);
  assert.equal(healing.healing,true);assert.ok(healing.rows[0].potionCost>0);
  fresh.items[204]=0;assert.equal(recommendHunts(fresh,hunts,{},potions,data).healing,false);
  fresh.items[204]=10;fresh.automation.autoPotion=false;assert.equal(recommendHunts(fresh,hunts,{},potions,data).healing,false);
});
test('server catalog is authoritative: local-only and missing species routes are skipped',()=>{
  const routes=[...hunts,{slug:'missing',name:'Missing',level:50}];
  const catalog={...data,hunts:[...data.hunts,{slug:'missing',species:[[999,15]]},{slug:'local-only',species:[[2,15]]}]};
  const result=recommendHunts(state(),routes,{},[],catalog);
  assert.equal(result.skipped,1);assert.ok(result.rows.every(r=>r.slug!=='missing'&&r.slug!=='local-only'));
});
test('advisor cache refreshes build, level, healing stock and server changes, ignoring HP/XP noise',()=>{
  const s=state(),advise=createHuntAdvisor(data),a=advise(s,hunts,{},[]);
  s.pokemons[0].hp=123;s.pokemons[0].xp=500;assert.equal(advise(s,hunts,{},[]),a);
  s.pokemons[0].stats.spAtk=800;const b=advise(s,hunts,{},[]);assert.notEqual(b,a);
  s.level=100;const c=advise(s,hunts,{},[]);assert.notEqual(c,b);assert.ok(c.rows.some(r=>r.slug==='locked'));
  assert.notEqual(advise(s,hunts,{hpMultiplier:10},[]),c);
});
test('injected catalog works with server route slugs',()=>{
  const s=state();s.level=300;s.pokemons[0].speciesId=3;s.pokemons[0].nome='Venusaur';s.pokemons[0].level=280;
  const result=recommendHunts(s,[{slug:'ancient_pupitar',name:'Ancient Pupitar',level:150},{slug:'caterpie',name:'Caterpie',level:1}],{},[],{...data,hunts:[{slug:'ancient_pupitar',species:[[2,150]]},{slug:'caterpie',species:[[2,1]]}]});
  assert.equal(result.available,true);assert.ok(result.rows.some(r=>r.slug==='ancient_pupitar'));assert.ok(result.updatedAt);
});
test('public guide XP and geometry are used rather than a uniform level-only reward',()=>{
  assert.equal(guideXpPerKill(10,'diglett',{measuredXp:{diglett:84}}),84);
  assert.equal(guideXpPerKill(10,'unknown',{}),112);
  const fast=mapThroughput('route',100,2,false,{distances:[1,2,3],origin:'medido'});
  const slow=mapThroughput('route',100,2,false,{distances:[50,60,70],origin:'medido'});
  assert.ok(fast.rate>slow.rate);assert.equal(fast.estimated,false);
  const capped=mapThroughput('route',100,0,false,{distances:[1,2,3],wave:[60,90]});assert.ok(capped.rate<=180);
});
test('only enabled stocked potions count; the configured threshold affects overheal costs',()=>{
  const s=state();s.automation.autoPotion=true;s.automation.potionIds=[204];s.automation.hpLimiar=.2;
  const potions=[{id:204,name:'Ultimate',category:'heal',heal:30000,price:135}];
  const low=recommendHunts(s,hunts,{},potions,data);s.automation.hpLimiar=.8;
  const high=recommendHunts(s,hunts,{},potions,data);assert.ok(high.rows[0].potionCost>low.rows[0].potionCost);
  s.automation.potionIds=[];assert.equal(recommendHunts(s,hunts,{},potions,data).healing,false);
});
test('known bonuses have separate trainer/Pokémon channels and expire correctly',()=>{
  const s={level:10,loja:{vip:true,vipAte:2000,boosts:{xp:2000}},guild:{boostAte:2000},guildBonusPct:10,twitch:{assistindo:true,pctAtual:15},evento:{terminaEm:2000,xpPokemonPct:20,xpTreinadorPct:10},kick:{bonus:{pokexp:2000},pct:10}};
  const active=xpMultipliers(s,{boosts:[{key:'xp',mult:1.5}]},1000);
  assert.ok(Math.abs(active.trainer-1.5*1.1*1.1*1.15*1.5*1.1)<1e-8);
  assert.ok(Math.abs(active.pokemon-1.5*1.1*1.1*1.15*1.2*1.1)<1e-8);
  assert.equal(xpMultipliers(s,{},3000).trainer,1.1*1.15);
});
test('optional local catalog: Squirtle guide reference', {skip: !existsSync(new URL('../data/hunt-catalog.json', import.meta.url))}, ()=>{
  const s={level:10,activeId:1,pokemons:[{id:1,speciesId:7,nome:'Squirtle',level:10,quality:1.493,potencia:2,shiny:false,ivs:{hp:26,atk:31,def:17,spAtk:27,spDef:23,speed:22}}],automation:{autoPotion:true,potionIds:[201],hpLimiar:.31},items:{201:10000}};
  const routes=['diglett','slugma','swinub','abra','spearow','spinarak','sentret','paras','remoraid'].map(slug=>({slug,name:slug,level:slug==='paras'?1:10}));
  const result=recommendHunts(s,routes,{},[{id:201,name:'Great Potion',category:'heal',heal:150,price:10}]);
  assert.deepEqual(result.recommended.slice(0,5),['diglett','slugma','swinub','abra','spearow']);
  const reference={diglett:45500,slugma:35900,swinub:26700,abra:15600,spearow:14800};
  for(const [slug,xp] of Object.entries(reference)){const row=result.rows.find(r=>r.slug===slug);assert.ok(Math.abs(row.xpHour/xp-1)<.03,slug+' XP differs more than 3%');}
  const diglett=result.rows[0];assert.ok(diglett.potionCost>2400&&diglett.potionCost<3100);assert.ok(diglett.potionsHour<400);
});
