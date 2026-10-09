import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutoHunt} from '../src/auto-hunt.mjs';

function fixture(){
  let now=100000;const sent=[];
  const client={status:'conectada',ws:{readyState:1},lastStateAt:now,state:{level:10,huntSlug:'old'},hunts:[{slug:'old',level:1},{slug:'best',level:10}],gate:true,huntGate(){return {ready:this.gate,message:'aguardando combate'};},selectHunt(slug){sent.push(slug);this.routePending=slug;}};
  const advice={available:true,recommended:['best'],rows:[{slug:'best',name:'Best',risk:'baixo',xpHour:200},{slug:'old',risk:'baixo',xpHour:100}]};
  const auto=new AutoHunt({now:()=>now});return {client,advice,auto,sent,advance(ms){now+=ms;client.lastStateAt=now;}};
}
test('auto is opt-in and waits for server release before sending once',()=>{
  const f=fixture();f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.auto.configure(true);f.client.gate=false;f.auto.tick(f.client,f.advice);assert.match(f.auto.message,/aguardando combate/);assert.deepEqual(f.sent,[]);
  f.client.gate=true;f.auto.tick(f.client,f.advice);f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,['best']);
  f.client.routePending=null;f.client.state.huntSlug='best';f.auto.tick(f.client,f.advice);assert.match(f.auto.message,/Já está/);
});
test('newly unlocked route waits for trainer level and recommendation safety',()=>{
  const f=fixture();f.auto.configure(true);f.client.state.level=9;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.client.state.level=10;f.advice.rows[0].risk='alto';f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.advice.rows[0].risk='baixo';f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,['best']);
});
test('small gains and quick changes do not churn between routes',()=>{
  const f=fixture();f.auto.configure(true);f.advice.rows[0].xpHour=104;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.advice.rows[0].xpHour=200;f.auto.tick(f.client,f.advice);f.client.routePending=null;
  f.advance(59000);f.auto.tick(f.client,f.advice);assert.equal(f.sent.length,1);
  f.advance(1000);f.auto.tick(f.client,f.advice);assert.equal(f.sent.length,2);
});
test('disconnects, stale states and ambiguous confirmations never cause retries',()=>{
  const f=fixture();f.auto.configure(true);f.client.status='parada';f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.client.status='conectada';f.client.lastStateAt=0;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.advance(1);f.client.routeUncertain=true;f.auto.tick(f.client,f.advice);f.client.routeUncertain=false;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.auto.configure(false);f.auto.configure(true);f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,['best']);
});
test('disable cancels waiting and missing or invalid estimates cannot select a hunt',()=>{
  const f=fixture();f.auto.configure(true);f.client.gate=false;f.auto.tick(f.client,f.advice);f.auto.configure(false);f.client.gate=true;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  f.auto.configure(true);f.auto.tick(f.client,null);f.advice.rows[0].xpHour=NaN;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);
  assert.throws(()=>f.auto.configure('yes'),/Informe/);
});
test('automatic selection preserves healing in the center',()=>{
  const f=fixture();f.auto.configure(true);f.client.state.noCentro=true;f.client.state.activeId=1;f.client.state.pokemons=[{id:1,hp:50,maxHp:84}];f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,[]);assert.match(f.auto.message,/cura completa/);
  f.client.state.pokemons[0].hp=84;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,['best']);
});
test('a new fully healed account can enter its saved best route from the center',()=>{
  const f=fixture();f.auto.configure(true);f.client.state.noCentro=true;f.client.state.huntSlug='best';f.client.state.activeId=1;f.client.state.pokemons=[{id:1,hp:84,maxHp:84}];
  f.auto.tick(f.client,f.advice);f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,['best']);assert.match(f.auto.message,/confirmação/);
});
test('an account without a previous route can select its first recommended farm',()=>{
  const f=fixture();f.auto.configure(true);f.client.state.huntSlug=null;f.auto.tick(f.client,f.advice);assert.deepEqual(f.sent,['best']);
});
