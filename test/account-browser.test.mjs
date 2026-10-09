import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {AccountBrowsers,BrowserPipe,findBrowser,sessionScript} from '../src/account-browser.mjs';

function fakeChild(commands,{fail}={}) {
  const child=new EventEmitter();let buffer='';
  child.stdio=[null,null,null,new Writable({write(chunk,encoding,done){buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);commands.push(m);const result=m.method==='Target.createBrowserContext'?{browserContextId:'private-context'}:m.method==='Target.createTarget'?{targetId:'private-target'}:m.method==='Target.attachToTarget'?{sessionId:'private-session'}:{};queueMicrotask(()=>{child.stdio[4].write(JSON.stringify(fail===m.method?{id:m.id,error:{message:'never expose credential details'}}:{id:m.id,result})+'\0');if(m.method==='Browser.close')child.emit('exit',0);});}done();}}),new PassThrough()];
  child.kill=()=>child.emit('exit',0);return child;
}
test('isolated launch never puts a session in arguments and pauses only before navigation',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pokeidle-unit-'));const commands=[],launches=[];let child,paused=0,saved;
  const windows=new AccountBrowsers({directory,browser:()=>'/fixture/chrome.exe',launch:(exe,args,options)=>{launches.push({exe,args,options});return child=fakeChild(commands);}});
  try {
    await windows.open(2,{nick:'fixture',token:'secret-fixture'},{beforeNavigate:()=>{paused++;assert.equal(commands.at(-1).method,'Page.addScriptToEvaluateOnNewDocument');},saveSession:s=>saved=s});
    assert.equal(paused,1);assert.equal(windows.snapshot(2).active,true);assert.equal(launches[0].options.shell,false);
    assert.equal(launches[0].args.some(a=>a.includes('secret-fixture')||a.includes('remote-debugging-port')),false);
    assert.ok(launches[0].args.some(a=>a.startsWith('--user-data-dir=')));
    assert.deepEqual(commands.find(m=>m.method==='Target.createBrowserContext').params,{disposeOnDetach:false});
    assert.equal(commands.find(m=>m.method==='Page.navigate').params.url,'https://pokeidle.io/app');
    await windows.open(2,{nick:'fixture',token:'secret-fixture'});assert.equal(launches.length,1);
    const emitSession=(s,executionContextId=123)=>child.stdio[4].write(JSON.stringify({method:'Runtime.bindingCalled',sessionId:'private-session',params:{name:'__pokeidleSessionChanged',executionContextId,payload:JSON.stringify(s)}})+'\0');
    emitSession({nick:'fixture',token:'untrusted-origin'});assert.equal(saved,undefined);
    child.stdio[4].write(JSON.stringify({method:'Runtime.executionContextCreated',sessionId:'private-session',params:{context:{id:123,origin:'https://pokeidle.io',auxData:{isDefault:true}}}})+'\0');
    emitSession({nick:'other-account',token:'wrong'});assert.equal(saved,undefined);
    emitSession({nick:'fixture',token:'renewed-fixture'});assert.equal(saved.token,'renewed-fixture');
    await windows.closeAll();assert.equal(windows.active(2),false);
  }finally{await windows.closeAll();await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:30});}
});
test('failed browser setup exposes no credentials and does not pause before it is ready',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pokeidle-unit-'));let paused=0;
  const windows=new AccountBrowsers({directory,browser:()=>'/fixture/chrome.exe',launch:()=>fakeChild([],{fail:'Target.attachToTarget'})});
  try{await assert.rejects(()=>windows.open(1,{nick:'fixture',token:'fixture-secret'},{beforeNavigate:()=>paused++}),e=>!e.message.includes('fixture-secret')&&/Não consegui/.test(e.message));assert.equal(paused,0);assert.equal(windows.active(1),false);}
  finally{await windows.closeAll();await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:30});}
});
test('private pipe joins split frames and hides protocol error contents',async()=>{
  const child=new EventEmitter();child.stdio=[null,null,null,new PassThrough(),new PassThrough()];const pipe=new BrowserPipe(child);
  const request=pipe.call('Fixture');child.stdio[4].write('{"id":1,"res');child.stdio[4].write('ult":{"ok":true}}\0');assert.deepEqual(await request,{ok:true});
  const failed=pipe.call('Fixture');child.stdio[4].write('{"id":2,"error":{"message":"sensitive-fixture"}}\0');await assert.rejects(()=>failed,e=>!e.message.includes('sensitive-fixture'));
  pipe.end();await assert.rejects(()=>pipe.call('Fixture'),/fechada/);
});
test('session injection is origin restricted, escaped and preserves renewal/logout on reload',()=>{
  function sandbox(origin){class Storage{constructor(){this.values=new Map();}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}const messages=[];const window={__pokeidleSessionChanged:s=>messages.push(s)};window.top=window;return {Storage,window,location:{origin},localStorage:new Storage(),sessionStorage:new Storage(),messages};}
  const session={nick:'fixture"name',token:'fixture\\token\n"literal'},source=sessionScript(session),good=sandbox('https://pokeidle.io'),other=sandbox('https://example.com');
  runInNewContext(source,other);assert.equal(other.localStorage.getItem('sessao'),null);
  runInNewContext(source,good);assert.deepEqual(JSON.parse(good.localStorage.getItem('sessao')),session);
  good.localStorage.setItem('sessao',JSON.stringify({...session,token:'renewed'}));runInNewContext(source,good);assert.equal(JSON.parse(good.localStorage.getItem('sessao')).token,'renewed');
  good.localStorage.removeItem('sessao');runInNewContext(source,good);assert.equal(good.localStorage.getItem('sessao'),null);
  assert.throws(()=>sessionScript({nick:'fixture'}),/inválida/);
});
test('browser discovery chooses installed Chrome or Edge without a shell search',()=>{
  assert.match(findBrowser({},path=>path.includes('Google')),/chrome\.exe$/);
  assert.match(findBrowser({},path=>path.includes('Edge')),/msedge\.exe$/);
  assert.throws(()=>findBrowser({},()=>false),/Chrome.*Edge/);
});
test('shutdown during preparation cannot navigate or transfer the account afterwards',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'pokeidle-unit-'));const commands=[];let paused=0;
  const windows=new AccountBrowsers({directory,browser:()=>'/fixture/chrome.exe',launch:()=>fakeChild(commands)});
  try{const opening=windows.open(1,{nick:'fixture',token:'fixture-only'},{beforeNavigate:()=>paused++});await windows.closeAll();await assert.rejects(()=>opening,/Não consegui/);assert.equal(paused,0);assert.equal(commands.some(c=>c.method==='Page.navigate'),false);assert.equal(windows.active(1),false);}
  finally{await windows.closeAll();await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:30});}
});
