import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Replenisher, validateConfig } from '../src/replenish.mjs';
import { createMerger } from '../src/state.mjs';

function fixture(guard) {
  let clock=100000, saved;
  const sent=[];
  const bot=new Replenisher({guard,now:()=>clock,send:m=>sent.push(m),persist:g=>saved=structuredClone(g)});
  bot.config={enabled:true,reserve:1000,budget:5000,rules:[{kind:'ball',id:4,min:100,qty:50}]};
  const state={gold:10000,balls:{4:90}};
  const catalog=[{kind:'ball',id:4,name:'Ultra',price:10}];
  return {bot,sent,state,catalog,time:()=>clock+=31000,saved:()=>saved};
}
test('respects reserve, budget, connection and stock threshold',()=> {
  const f=fixture();
  f.bot.tick(f.state,f.catalog,false);
  f.bot.tick({...f.state,gold:1200},f.catalog,true);
  f.bot.config.budget=499;f.bot.tick(f.state,f.catalog,true);
  f.bot.config.budget=5000;f.bot.tick({...f.state,balls:{4:100}},f.catalog,true);
  f.bot.tick({gold:10000},f.catalog,true);
  assert.equal(f.sent.length,0);
});
test('unlimited spending persists, bypasses the budget and still respects the reserve',()=> {
  const f=fixture({spent:9000});
  f.bot.config=validateConfig({...f.bot.config,budget:0,unlimited:true});
  assert.equal(validateConfig(JSON.parse(JSON.stringify(f.bot.config))).unlimited,true);
  assert.match(f.bot.describe(f.state,f.catalog,true),/automaticamente/);
  f.bot.tick({...f.state,gold:1200},f.catalog,true);
  assert.equal(f.sent.length,0);
  f.bot.tick(f.state,f.catalog,true);
  assert.equal(f.sent.length,1);
  assert.equal(f.saved().spent,9500);
  const limited=fixture({spent:9000});
  limited.bot.config=validateConfig({...f.bot.config,unlimited:false});
  limited.bot.tick(limited.state,limited.catalog,true);
  assert.equal(limited.sent.length,0);
  assert.throws(()=>validateConfig({...f.bot.config,unlimited:'true'}));
});
test('persists before send and waits for stock confirmation',()=> {
  const f=fixture();
  f.bot.tick(f.state,f.catalog,true);
  assert.equal(f.sent.length,1);assert.equal(f.saved().pending.before,90);assert.equal(f.saved().spent,500);
  f.bot.tick(f.state,f.catalog,true);assert.equal(f.sent.length,1);
  f.bot.tick({...f.state,balls:{4:139}},f.catalog,true);
  assert.equal(f.bot.guard.pending,null);
  f.bot.tick(f.state,f.catalog,true);assert.equal(f.sent.length,1);
});
test('timeout and disconnect do not retry ambiguous purchases',()=> {
  for(const reason of ['timeout','disconnect']){
    const f=fixture();f.bot.tick(f.state,f.catalog,true);
    if(reason==='timeout'){f.time();f.bot.tick(f.state,f.catalog,true);}else f.bot.disconnected();
    f.time();f.bot.tick(f.state,f.catalog,true);
    assert.equal(f.sent.length,1);assert.ok(f.bot.guard.fault);
    const restored=fixture(f.saved());restored.bot.tick(restored.state,restored.catalog,true);assert.equal(restored.sent.length,0);
  }
});
test('restart with in-flight purchase requires review and preserves spending',()=> {
  const f=fixture({spent:500,pending:{id:4}});f.bot.tick(f.state,f.catalog,true);
  assert.equal(f.sent.length,0);assert.equal(f.bot.guard.spent,500);assert.ok(f.bot.guard.fault);
});
test('failed persistence sends nothing',()=> {
  const f=fixture();f.bot.persist=()=>{throw Error('disk');};
  assert.throws(()=>f.bot.tick(f.state,f.catalog,true));assert.equal(f.sent.length,0);
});
test('fills to desired stock rather than buying a fixed lot',()=> {
  const f=fixture();f.bot.config.rules=[{kind:'ball',id:4,min:100,target:300}];
  f.bot.tick(f.state,f.catalog,true);
  assert.equal(f.sent[0].qty,210);assert.equal(f.saved().spent,2100);
  assert.deepEqual(validateConfig(f.bot.config).rules,f.bot.config.rules);
});
test('rejects target below threshold, oversized targets and mixed modes',()=> {
  const f=fixture();
  for(const rule of [{kind:'ball',id:4,min:100,target:50},{kind:'ball',id:4,min:100,target:1000000001},{kind:'ball',id:4,min:100,target:300,qty:5}]) assert.throws(()=>validateConfig({...f.bot.config,rules:[rule]}));
});
test('large restock continues in server-sized batches after crossing the minimum',()=>{
  const f=fixture();f.bot.config=validateConfig({...f.bot.config,unlimited:true,rules:[{kind:'ball',id:4,min:100,target:25000}]});
  const s={gold:1000000,balls:{4:90}};
  f.bot.tick(s,f.catalog,true);assert.equal(f.sent[0].qty,9999);
  s.balls[4]+=9999;f.bot.tick(s,f.catalog,true);f.time();f.bot.tick(s,f.catalog,true);
  assert.equal(f.sent[1].qty,9999);
  s.balls[4]+=9999;f.bot.tick(s,f.catalog,true);f.time();f.bot.tick(s,f.catalog,true);
  assert.equal(f.sent[2].qty,4912);
  s.balls[4]+=4912;f.bot.tick(s,f.catalog,true);f.time();f.bot.tick(s,f.catalog,true);
  assert.equal(f.sent.length,3);assert.deepEqual(f.bot.guard.refills,{});
});
test('large fixed quantity is split into batches and honors budget on each batch',()=>{
  const f=fixture();f.bot.config=validateConfig({...f.bot.config,budget:150000,rules:[{kind:'ball',id:4,min:100,qty:20000}]});
  f.bot.tick({...f.state,gold:1000000},f.catalog,true);assert.equal(f.sent[0].qty,9999);
  const s={gold:1000000,balls:{4:10089}};f.bot.tick(s,f.catalog,true);f.time();f.bot.tick(s,f.catalog,true);
  assert.equal(f.sent.length,1);assert.match(f.bot.describe(s,f.catalog,true),/não cobre/);
  assert.equal(f.saved().refills['ball:4'].target,20090);
});
test('explains why a low-stock item cannot be bought',()=> {
  const f=fixture();
  assert.match(f.bot.describe({...f.state,gold:1200},f.catalog,true),/guardar/);
  f.bot.config.budget=499;assert.match(f.bot.describe(f.state,f.catalog,true),/não cobre/);
  f.bot.config.budget=5000;assert.match(f.bot.describe({...f.state,balls:{4:150}},f.catalog,true),/Estoque em dia/);
});
test('rejects duplicates, fractional quantities and unsafe budgets',()=> {
  const f=fixture();assert.deepEqual(validateConfig(f.bot.config),f.bot.config);
  assert.throws(()=>validateConfig({...f.bot.config,budget:Infinity}));
  assert.throws(()=>validateConfig({...f.bot.config,rules:[...f.bot.config.rules,...f.bot.config.rules]}));
  assert.throws(()=>validateConfig({...f.bot.config,rules:[{kind:'item',id:200,min:100,qty:1.5}]}));
});
test('delta preserves balances and inventory, replaces arrays and deletes dex entries',()=> {
  const merge=createMerger();merge({cheio:true,gold:10,balls:{4:80},items:{200:40},pokemons:[{id:1,hp:10}],pokedex:{a:1,b:2}});
  const s=merge({gold:20,pkMud:[{id:1,hp:8},{id:2,hp:30}],dexFora:['a']});
  assert.equal(s.gold,20);assert.equal(s.balls[4],80);assert.equal(s.items[200],40);assert.equal(s.pokemons[0].hp,8);assert.equal(s.pokedex.a,undefined);
  assert.deepEqual(merge({pkFora:[1]}).pokemons,[{id:2,hp:30}]);
  assert.equal(merge({cheio:true,gold:5}).balls,undefined);
});
