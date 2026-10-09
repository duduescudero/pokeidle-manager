import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameClient } from '../src/client.mjs';

class FakeSocket extends EventTarget {
  readyState = 1;
  sent = [];
  constructor(url) { super(); this.url = url; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close(code = 1000) { this.readyState = 3; const e = new Event('close'); e.code = code; this.dispatchEvent(e); }
  message(data) { const e = new Event('message'); e.data = JSON.stringify(data); this.dispatchEvent(e); }
}
test('authenticates, enables economy and receives full state without buying', () => {
  const c = new GameClient({ nick: 'test', token: 'secret' }, { Socket: FakeSocket });
  c.start(); const ws = c.ws;
  ws.dispatchEvent(new Event('open'));
  ws.message({ t: 'welcome', estado: { gold: 50, balls: { 1: 10 } } });
  ws.message({ t: 'estado', estado: { gold: 60, balls: { 1: 9 } } });
  assert.equal(c.state.gold, 60);
  assert.deepEqual(ws.sent.map(m => m.t), ['hello', 'cliente.economia']);
  assert.equal(ws.sent[0].delta, 1);
  c.stop();
});
test('session takeover stops reconnects', () => {
  const c = new GameClient({ nick: 'test', token: 'secret' }, { Socket: FakeSocket });
  c.start(); c.ws.dispatchEvent(new Event('open')); c.ws.close(4001);
  assert.equal(c.stopped, true); assert.equal(c.retry, undefined);
  assert.match(c.status, /outra sessão/);
});
test('tracks only confirmed captures, newest first, with a bounded history',()=>{
  const c=new GameClient({nick:'test',token:'secret'},{Socket:FakeSocket});
  c.start();const ws=c.ws;
  ws.message({t:'batalha',ev:[{k:'escapou',pokemon:{id:99}},{k:'capturado',pokemon:{id:1,nome:'Pupitar',level:100,shiny:true}}]});
  assert.equal(c.captures.length,1);assert.equal(c.captures[0].shiny,true);
  ws.message({t:'batalha',ev:[{k:'capturado',pokemon:{id:1,nome:'Pupitar'}}]});
  assert.equal(c.captures.length,1);
  for(let id=2;id<=25;id++)ws.message({t:'batalha',ev:[{k:'capturado',pokemon:{id,nome:'Pokémon',level:5}}]});
  assert.equal(c.captures.length,20);assert.equal(c.captures[0].id,25);
  c.stop();
});
test('renewed credentials are saved and server errors pause', () => {
  let saved;
  const c = new GameClient({ nick: 'test', token: 'old' }, { Socket: FakeSocket, saveSession: s => saved = s });
  c.start(); c.ws.dispatchEvent(new Event('open'));
  c.ws.message({ t: 'sessao.renovada', token: 'new' });
  assert.equal(saved.token, 'new');
  c.ws.message({ t: 'erro', msg: 'do not log this' });
  assert.equal(c.stopped, true);
});
test('hunt change uses the server catalog and waits for confirmed state without changing automation',()=>{
  const c=new GameClient({nick:'test',token:'secret'},{Socket:FakeSocket});c.start();const ws=c.ws;
  ws.message({t:'welcome',hunts:[{slug:'old',nome:'Old hunt',nivel:1},{slug:'new',nome:'New hunt',nivel:10},{slug:'locked',nome:'Locked',nivel:100}],estado:{level:50,huntSlug:'old',servidorAgora:10000,centroLivreEm:10000,automation:{usarPocoes:true}}});
  assert.throws(()=>c.selectHunt('unknown'),/lista/);
  assert.throws(()=>c.selectHunt('locked'),/nível/);
  assert.throws(()=>c.selectHunt('old'),/já está/);
  c.selectHunt('new');assert.deepEqual(ws.sent.at(-1),{t:'hunt.select',slug:'new'});
  assert.equal(c.state.huntSlug,'old');assert.equal(c.routePending,'new');
  assert.throws(()=>c.selectHunt('new'),/confirmação/);
  ws.message({t:'estado',estado:{huntSlug:'new'}});
  assert.equal(c.routePending,null);assert.equal(c.state.automation.usarPocoes,true);c.stop();
  assert.throws(()=>c.selectHunt('old'),/Conecte/);
});
test('stale hunt state cannot send a change and stopping clears the pending request',()=>{
  const c=new GameClient({nick:'test',token:'secret'},{Socket:FakeSocket});c.start();const ws=c.ws;
  ws.message({t:'welcome',hunts:[{slug:'new',nome:'New',nivel:1}],estado:{level:10,huntSlug:'old',servidorAgora:10000,centroLivreEm:10000}});
  c.lastStateAt=Date.now()-11000;assert.throws(()=>c.selectHunt('new'),/atualizado/);
  c.lastStateAt=Date.now();c.selectHunt('new');c.stop();
  assert.equal(c.routePending,null);assert.equal(c.routeTimer,null);
  assert.equal(ws.sent.filter(m=>m.t==='hunt.select').length,1);
});
test('hunt gate honors damage, fresh server release, area cooldown and arenas',()=>{
  const c=new GameClient({nick:'test',token:'secret'},{Socket:FakeSocket});c.start();const ws=c.ws;
  try {
    ws.message({t:'welcome',hunts:[{slug:'new',nome:'New',nivel:1}],estado:{level:10,huntSlug:'old',servidorAgora:10000,centroLivreEm:13000}});
    assert.throws(()=>c.selectHunt('new'),/combate/);
    ws.message({t:'estado',estado:{servidorAgora:13000}});assert.equal(c.huntGate().ready,true);
    ws.message({t:'batalha',ev:[{k:'ataque'}]});assert.equal(c.huntGate().ready,false);
    ws.message({t:'estado',estado:{gold:100}});assert.equal(c.huntGate().ready,false);
    // Economy mode can release between waves earlier than three seconds.
    ws.message({t:'estado',estado:{servidorAgora:13100,centroLivreEm:13100}});assert.equal(c.huntGate().ready,true);
    ws.message({t:'batalha',ev:[{k:'hunt',trocaLivreEm:23000}]});assert.equal(c.huntGate().ready,false);
    ws.message({t:'estado',estado:{servidorAgora:23000,centroLivreEm:23000,boss:{arena:{key:'boss'}}}});assert.equal(c.huntGate().ready,false);
    ws.message({t:'estado',estado:{boss:null}});c.selectHunt('new');assert.equal(c.routePending,'new');
    assert.equal(ws.sent.some(m=>m.t==='centro.desistir'||m.t==='centro.ir'),false);
    c.lastCombatStateAt=Date.now()-1600;assert.equal(c.huntGate().ready,false);
  }finally{c.stop();}
});
test('manual hunt waits through combat, then sends exactly once and confirms normally',()=>{
  const c=new GameClient({nick:'fixture',token:'fixture-only'},{Socket:FakeSocket});c.start();const ws=c.ws;
  try{
    ws.message({t:'welcome',hunts:[{slug:'new',nome:'New hunt',nivel:10}],estado:{level:10,huntSlug:'old',servidorAgora:10000,centroLivreEm:13000}});
    c.queueManualHunt('new');assert.equal(c.routeQueued.slug,'new');assert.equal(c.routePending,undefined);assert.equal(ws.sent.some(m=>m.t==='hunt.select'),false);
    c.flushManualHunt();assert.equal(ws.sent.some(m=>m.t==='hunt.select'),false);
    ws.message({t:'estado',estado:{servidorAgora:13000}});c.flushManualHunt();c.flushManualHunt();assert.equal(c.routeQueued,null);assert.equal(c.routePending,'new');assert.equal(ws.sent.filter(m=>m.t==='hunt.select').length,1);
    ws.message({t:'estado',estado:{huntSlug:'new'}});assert.equal(c.routePending,null);
    assert.equal(ws.sent.some(m=>m.t==='centro.ir'||m.t==='centro.desistir'),false);
  }finally{c.stop();}
});
test('manual hunt can be cancelled and never survives a pause or disconnect',()=>{
  const c=new GameClient({nick:'fixture',token:'fixture-only'},{Socket:FakeSocket});c.start();const ws=c.ws;
  try{
    ws.message({t:'welcome',hunts:[{slug:'new',nome:'New',nivel:10}],estado:{level:10,huntSlug:'old',servidorAgora:10000,centroLivreEm:13000}});
    c.queueManualHunt('new');c.cancelManualHunt();assert.equal(c.routeQueued,null);
    assert.throws(()=>c.queueManualHunt('unknown'),/lista/);
    c.queueManualHunt('new');c.stop();assert.equal(c.routeQueued,null);c.flushManualHunt();assert.equal(ws.sent.some(m=>m.t==='hunt.select'),false);
  }finally{c.stop();}
});
test('manual entry into the saved hunt from the center is only confirmed after leaving it',()=>{
  const c=new GameClient({nick:'fixture',token:'fixture-only'},{Socket:FakeSocket});c.start();const ws=c.ws;
  try{
    ws.message({t:'welcome',hunts:[{slug:'geodude',nome:'Geodude',nivel:1}],estado:{level:1,huntSlug:'geodude',noCentro:true,servidorAgora:10000}});
    c.queueManualHunt('geodude');assert.deepEqual(ws.sent.at(-1),{t:'hunt.select',slug:'geodude'});assert.equal(c.routePending,'geodude');
    ws.message({t:'estado',estado:{servidorAgora:10500}});assert.equal(c.routePending,'geodude');
    c.flushManualHunt();assert.equal(ws.sent.filter(m=>m.t==='hunt.select').length,1);
    ws.message({t:'estado',estado:{noCentro:false,servidorAgora:11000}});assert.equal(c.routePending,null);
  }finally{c.stop();}
});
