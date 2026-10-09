// Opt-in integration check with a LOCAL fixture only. Never loads the game or
// any saved account. Runs a separate headless Chrome and closes it afterwards.
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {AccountBrowsers} from '../src/account-browser.mjs';
const directory=await mkdtemp(join(tmpdir(),'pokeidle-browser-check-'));
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local account browser fixture</title><h1>Local test</h1>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const browsers=new AccountBrowsers({directory,url,launch:(exe,args,opts)=>spawn(exe,[...args,'--headless=new'],opts)});
let saved,paused=0;
async function evaluate(slot,expression){const w=browsers.windows.get(slot);const r=await w.pipe.call('Runtime.evaluate',{expression,returnByValue:true},w.session);return r.result?.value;}
try {
  await browsers.open(1,{nick:'fixture-one',token:'fixture-only-1'},{beforeNavigate:()=>paused++,saveSession:s=>saved=s});
  await browsers.open(2,{nick:'fixture-two',token:'fixture-only-2'},{beforeNavigate:()=>paused++});
  for(let n=0;n<40;n++){if(await evaluate(1,"location.origin")===new URL(url).origin&&await evaluate(2,"location.origin")===new URL(url).origin)break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(paused,2);
  assert.equal(await evaluate(1,"JSON.parse(localStorage.getItem('sessao')).nick"),'fixture-one');
  assert.equal(await evaluate(2,"JSON.parse(localStorage.getItem('sessao')).nick"),'fixture-two');
  await browsers.open(1,{nick:'fixture-one',token:'fixture-only-1'});assert.equal(browsers.windows.size,2);
  await evaluate(1,"localStorage.setItem('sessao',JSON.stringify({nick:'fixture-one',token:'fixture-renewed'}))");
  for(let n=0;n<20&&!saved;n++)await new Promise(r=>setTimeout(r,50));
  assert.equal(saved?.token,'fixture-renewed');
  const first=browsers.windows.get(1);await first.pipe.call('Page.reload',{},first.session);
  for(let n=0;n<20;n++){await new Promise(r=>setTimeout(r,50));if(await evaluate(1,"document.readyState")==='complete')break;}
  assert.equal(await evaluate(1,"JSON.parse(localStorage.getItem('sessao')).token"),'fixture-renewed');
  await evaluate(1,"localStorage.removeItem('sessao')");await first.pipe.call('Page.reload',{},first.session);await new Promise(r=>setTimeout(r,300));
  assert.equal(await evaluate(1,"localStorage.getItem('sessao')"),null);
  assert.equal(await evaluate(2,"JSON.parse(localStorage.getItem('sessao')).nick"),'fixture-two');
  await first.pipe.call('Target.closeTarget',{targetId:first.target});
  for(let n=0;n<40&&browsers.active(1);n++)await new Promise(r=>setTimeout(r,50));
  assert.equal(browsers.active(1),false);assert.equal(browsers.active(2),true);
  console.log('Chrome OK: contas isoladas, sessão antes da página, renovação, logout, reutilização e fechamento. Nenhuma conta real utilizada.');
}finally{
  await browsers.closeAll();await new Promise(r=>setTimeout(r,500));server.close();
  // This exact temporary test root was created above, outside personal profiles.
  await rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
