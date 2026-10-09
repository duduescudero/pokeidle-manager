import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HuntObservations} from '../src/hunt-observations.mjs';
const state=()=>({huntSlug:'diglett',activeId:1,pokemons:[{id:1,nome:'Squirtle',level:10}],automation:{autoPotion:true}});
test('measures rewards, potion consumption and death events, requires 15 actual connected minutes',()=>{
  let now=0;const tracker=new HuntObservations(()=>now);tracker.update(state(),true);
  tracker.event({k:'morte',quem:'selvagem',xpTreinador:84,xpPokemon:100});tracker.event({k:'cura',itemId:201});tracker.event({k:'morte',quem:'jogador'});
  for(now=1000;now<=900000;now+=1000)tracker.update(state(),true);now=900000;
  const row=tracker.snapshot()[0];assert.equal(row.minutes,15);assert.equal(row.ready,true);assert.equal(row.pokemonHour,400);assert.equal(row.potionsHour,4);assert.equal(row.deaths,1);
});
test('pause and route changes never attribute old elapsed time or rewards to a new route',()=>{
  let now=0;const tracker=new HuntObservations(()=>now);tracker.update(state(),true);now=5000;tracker.pause();now=300000;
  tracker.event({k:'morte',quem:'selvagem',xp:999});tracker.update({...state(),huntSlug:'slugma'},true);
  now+=5000;tracker.update({...state(),huntSlug:'slugma'},true);const rows=tracker.snapshot();
  assert.equal(rows[0].xpPokemon,0);assert.equal(rows[0].hunt,'slugma');assert.equal(rows[1].minutes,.1);assert.equal(rows[0].ready,false);
});
test('long timer gaps are excluded; level/build changes are marked instead of falsely validating a fixed build',()=>{
  let now=0;const tracker=new HuntObservations(()=>now);const s=state();tracker.update(s,true);now=600000;tracker.update(s,true);
  assert.equal(tracker.snapshot()[0].minutes,0);s.pokemons[0].level=11;now+=1000;tracker.update(s,true);
  assert.equal(tracker.snapshot()[0].buildChanged,true);assert.equal(tracker.snapshot()[0].maxLevel,11);
});
test('center and disconnected accounts do not accumulate farm samples',()=>{
  let now=0;const tracker=new HuntObservations(()=>now);tracker.update({...state(),noCentro:true},true);now=5000;tracker.event({k:'cura'});
  tracker.update(state(),false);assert.deepEqual(tracker.snapshot(),[]);
});
test('a fainting HP transition counts once even when the matching death event also arrives',()=>{
  let now=0;const tracker=new HuntObservations(()=>now),s=state();s.pokemons[0].hp=50;tracker.update(s,true);
  now=1000;s.pokemons[0].hp=0;tracker.update(s,true);tracker.event({k:'morte',quem:'jogador'});
  assert.equal(tracker.snapshot()[0].deaths,1);
  tracker.update(s,true);assert.equal(tracker.snapshot()[0].deaths,1);
});
