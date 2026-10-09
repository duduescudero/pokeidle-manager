import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {get} from 'node:http';
import {createDemoServer} from '../src/demo-server.mjs';

async function withDemo(check) {
  const app=createDemoServer();app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  try{await check({...app,url:`http://127.0.0.1:${app.server.address().port}`});}
  finally{await new Promise(resolve=>app.server.close(resolve));}
}
test('demo serves fictitious state without loading account storage',()=>withDemo(async({url,key})=>{
  const response=await fetch(url+'/api/state',{headers:{'X-Manager-Key':key}});
  assert.equal(response.status,200);const state=await response.json();assert.equal(state.demo,true);assert.equal(state.accounts.length,4);
  assert.equal(state.accounts[0].nick,'Treinador exemplo');assert.ok(state.log.every(entry=>entry.text.startsWith('[Exemplo fictício]')));
  assert.equal(JSON.stringify(state).includes(key),false);
}));
test('demo rejects authenticated purchases, imports and shutdown without changing state',()=>withDemo(async({url,key})=>{
  const headers={'X-Manager-Key':key,'Content-Type':'application/json'};
  const before=await (await fetch(url+'/api/state',{headers})).text();
  for(const action of ['import','start','config','depot-sell','shutdown']){
    const response=await fetch(url+'/api/action',{method:'POST',headers,body:JSON.stringify({action,slot:1})});assert.equal(response.status,405);
  }
  assert.equal(await (await fetch(url+'/api/state',{headers})).text(),before);
}));
test('demo refuses unauthorized state reads, wrong hosts and unknown pages',()=>withDemo(async({url})=>{
  assert.equal((await fetch(url+'/api/state')).status,403);
  const status=await new Promise((resolve,reject)=>get(url,{headers:{Host:'example.org'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject));
  assert.equal(status,403);
  assert.equal((await fetch(url+'/other')).status,404);
}));
test('demo page is self-contained, labeled and protected from framing',()=>withDemo(async({url})=>{
  const response=await fetch(url);const html=await response.text();assert.equal(response.status,200);
  assert.match(html,/Todos os dados abaixo são fictícios/);assert.equal(html.includes('__API_KEY__'),false);
  assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(response.headers.get('cache-control'),'no-store');
}));
