import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FarmMetrics,progress,gameDetails} from '../src/metrics.mjs';
test('rates count only connected time and use confirmed combat events',()=>{
 let now=0;const m=new FarmMetrics(()=>now);m.resume();now=30000;
 m.event({k:'morte',quem:'treinador',xp:999,ouro:999});
 m.event({k:'morte',quem:'selvagem',xpTreinador:100,xpPokemon:80,ouro:50,ouroVendaAuto:20,drops:[{itemId:4,nome:'Fire Orb',qtd:2}]});
 m.event({k:'bola',ballId:4,shiny:true});m.event({k:'capturado',pokemon:{shiny:true}});m.event({k:'cura',itemId:204});
 assert.equal(m.snapshot().trainerHour,null);m.pause();now=100000;m.resume();now=130000;
 const s=m.snapshot([{kind:'ball',id:4,name:'Ultra',price:10},{kind:'item',id:204,name:'Potion',price:20}]);
 assert.equal(s.uptimeMs,60000);assert.equal(s.trainerHour,6000);assert.equal(s.pokemonHour,4800);assert.equal(s.kills,1);assert.equal(s.catches,1);assert.equal(s.shinyCaught,1);assert.equal(s.shinySeen,1);assert.equal(s.netEstimated,40);assert.equal(s.drops[0].qty,2);
 m.pause();m.pause();now=200000;assert.equal(m.snapshot().uptimeMs,60000);
});
test('unknown prices never produce a misleading net estimate; progress uses level bounds',()=>{
 const m=new FarmMetrics();m.event({k:'revive',itemId:999});assert.equal(m.snapshot().netEstimated,null);
 assert.deepEqual(progress({xp:150,xpNivel:100,xpProximo:200}),{current:50,total:100,percent:50});assert.equal(progress({xp:500}),null);
});
test('bonuses and game automation reflect server fields and expiration',()=>{
 const s=gameDetails({loja:{vip:true,vipAte:5000},kick:{vinculado:true,pct:15,bonus:{xp:5000,shiny:500}},evento:{terminaEm:5000,xpTreinadorPct:20,xpPokemonPct:10,farmPct:5},automation:{autoPotion:true,autoBallSemParar:true}},1000);
 assert.equal(s.bonuses.length,3);assert.match(s.bonuses[1].text,/xp: \+15%/);assert.match(s.automation,/sem parar/);
 assert.equal(gameDetails({evento:{terminaEm:500}},1000).bonuses.length,0);
});

test('hourly net income matches game profit and becomes unknown when prices are missing',()=>{let now=0;const m=new FarmMetrics(()=>now);m.resume();m.event({k:'morte',quem:'selvagem',xpTreinador:24000,xpPokemon:18000,ouro:100});m.event({k:'bola',ballId:4});now=120000;const s=m.snapshot([{kind:'ball',id:4,price:150}]);assert.equal(s.trainerHour,720000);assert.equal(s.pokemonHour,540000);assert.equal(s.goldHour,3000);assert.equal(s.netHour,-1500);assert.equal(m.snapshot([]).netHour,null);});
test('reconnect gaps remain in the session clock while explicit pauses are excluded',()=>{let now=0;const m=new FarmMetrics(()=>now);m.resume();m.event({k:'morte',quem:'selvagem',xp:100});now=60000;m.pause();now=120000;m.resume(true);now=180000;assert.equal(m.snapshot().uptimeMs,180000);assert.equal(m.snapshot().trainerHour,2000);m.pause();now=360000;m.resume();assert.equal(m.snapshot().uptimeMs,180000);});
