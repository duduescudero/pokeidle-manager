import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {EventEmitter} from 'node:events';

export function findBrowser(env=process.env,exists=existsSync) {
  const candidates=[join(env.PROGRAMFILES??'C:\\Program Files','Google/Chrome/Application/chrome.exe'),join(env['PROGRAMFILES(X86)']??'C:\\Program Files (x86)','Google/Chrome/Application/chrome.exe'),join(env.LOCALAPPDATA??'','Google/Chrome/Application/chrome.exe'),join(env['PROGRAMFILES(X86)']??'C:\\Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),join(env.PROGRAMFILES??'C:\\Program Files','Microsoft/Edge/Application/msedge.exe')];
  const executable=candidates.find(exists);if(!executable)throw Error('Instale Google Chrome ou Microsoft Edge para abrir uma conta isolada.');return executable;
}

// Chrome's private pipe carries session data only in memory. No debugging TCP
// port, credential URL, clipboard, plaintext session file or shell invocation.
export class BrowserPipe extends EventEmitter {
  constructor(child,{timeout=10000}={}) {
    super();this.child=child;this.timeout=timeout;this.next=0;this.pending=new Map();this.buffer='';
    child.stdio[4].setEncoding('utf8');
    child.stdio[4].on('data',chunk=>{this.buffer+=chunk;let end;while((end=this.buffer.indexOf('\0'))!==-1){const raw=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);let m;try{m=JSON.parse(raw);}catch{continue;}if(m.id){const p=this.pending.get(m.id);if(!p)continue;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error('O navegador recusou a preparação da janela.')):p.resolve(m.result??{});}else this.emit('event',m);}});
    child.stdio[3].on('error',()=>this.end());child.stdio[4].on('error',()=>this.end());child.stdio[4].on('end',()=>this.end());child.once('error',()=>this.end());child.once('exit',()=>this.end());
  }
  call(method,params={},sessionId) {
    if(this.closed)return Promise.reject(Error('A janela do navegador foi fechada.'));
    const id=++this.next;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('O navegador demorou para responder. Tente abrir novamente.'));},this.timeout);this.pending.set(id,{resolve,reject,timer});this.child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
  }
  end(){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('A janela do navegador foi fechada.'));}this.pending.clear();this.emit('closed');}
}

export function sessionScript(session,origin='https://pokeidle.io') {
  if(typeof session?.nick!=='string'||!session.nick||session.nick.length>100||typeof session?.token!=='string'||!session.token||session.token.length>16384)throw Error('Sessão da conta inválida. Importe novamente.');
  const clean={nick:session.nick,token:session.token};
  // Inject only on the exact game origin, before its auth code runs. Subsequent
  // loads preserve renewal/logout; the original session is never restored again.
  return `(()=>{if(location.origin!==${JSON.stringify(origin)}||window!==window.top)return;const put=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const r=put.call(this,k,v);if(this===localStorage&&k==='sessao'){try{window.__pokeidleSessionChanged(String(v));}catch{}}return r;};if(!sessionStorage.getItem('__pokeidleBotOpened')){localStorage.setItem('sessao',${JSON.stringify(JSON.stringify(clean))});localStorage.setItem('nick',${JSON.stringify(clean.nick)});sessionStorage.setItem('__pokeidleBotOpened','1');}})();`;
}

export class AccountBrowsers {
  constructor({directory,launch=spawn,browser=findBrowser,notice=()=>{},url='https://pokeidle.io/app'}={}) {this.directory=resolve(directory);this.launch=launch;this.browser=browser;this.notice=notice;this.url=url;this.windows=new Map();}
  active(slot){return this.windows.has(slot);}
  snapshot(slot){const w=this.windows.get(slot);return {active:!!w,opening:!!w?.opening,message:w?(w.opening?'Preparando navegador':'Conta aberta no navegador'):'Navegador fechado'};}
  async open(slot,session,{beforeNavigate=()=>{},saveSession=()=>{}}={}) {
    if(this.closing)throw Error('O bot está sendo encerrado.');
    if(!Number.isInteger(slot)||slot<1||slot>4)throw Error('Conta inválida.');
    const existing=this.windows.get(slot);
    if(existing){if(existing.opening)throw Error('A janela desta conta já está sendo preparada.');await existing.pipe.call('Target.activateTarget',{targetId:existing.target});return;}
    const script=sessionScript(session,new URL(this.url).origin),executable=this.browser();
    const record={opening:true,token:session.token,nick:session.nick};this.windows.set(slot,record);
    try {
      record.profile=await mkdtemp(join(this.directory,`browser-${slot}-`));
      record.child=this.launch(executable,[`--user-data-dir=${record.profile}`,'--remote-debugging-pipe','--no-startup-window','--no-first-run','--no-default-browser-check','--disable-background-mode'],{shell:false,windowsHide:false,stdio:['ignore','ignore','ignore','pipe','pipe']});
      const pipe=record.pipe=new BrowserPipe(record.child);
      record.child.once('exit',()=>{this.release(slot,record);});
      pipe.on('closed',()=>{this.release(slot,record);});
      const {browserContextId}=await pipe.call('Target.createBrowserContext',{disposeOnDetach:false});
      record.context=browserContextId;
      const {targetId}=await pipe.call('Target.createTarget',{url:'about:blank',browserContextId,newWindow:true});record.target=targetId;
      const {sessionId}=await pipe.call('Target.attachToTarget',{targetId,flatten:true});record.session=sessionId;
      await pipe.call('Runtime.enable',{},sessionId);
      await pipe.call('Runtime.addBinding',{name:'__pokeidleSessionChanged'},sessionId);
      const gameContexts=new Set(),gameOrigin=new URL(this.url).origin;
      pipe.on('event',m=>{
        if(m.sessionId===sessionId){
          if(m.method==='Runtime.executionContextCreated'&&m.params?.context?.origin===gameOrigin&&m.params.context.auxData?.isDefault)gameContexts.add(m.params.context.id);
          if(m.method==='Runtime.executionContextDestroyed')gameContexts.delete(m.params?.executionContextId);
          if(m.method==='Runtime.executionContextsCleared')gameContexts.clear();
        }
        if(m.method==='Runtime.bindingCalled'&&m.sessionId===sessionId&&gameContexts.has(m.params?.executionContextId)&&m.params?.name==='__pokeidleSessionChanged'){
          try {const s=JSON.parse(m.params.payload);if(s?.nick!==record.nick||typeof s.token!=='string'||!s.token||s.token.length>16384||s.token===record.token)return;saveSession({nick:s.nick,token:s.token});record.token=s.token;}
          catch {this.notice(slot,'Não consegui salvar a sessão renovada do navegador. Reimporte a conta antes de voltar ao bot.');}
        }
        if(m.method==='Target.targetDestroyed'&&m.params?.targetId===targetId){pipe.call('Browser.close').catch(()=>{});}
      });
      await pipe.call('Target.setDiscoverTargets',{discover:true});
      await pipe.call('Page.enable',{},sessionId);
      await pipe.call('Page.addScriptToEvaluateOnNewDocument',{source:script},sessionId);
      if(this.closing)throw Error('O bot está sendo encerrado.');
      await beforeNavigate();
      const result=await pipe.call('Page.navigate',{url:this.url},sessionId);
      if(result.errorText)throw Error('Não consegui carregar o jogo. Confira a internet e tente novamente.');
      await pipe.call('Target.activateTarget',{targetId});record.opening=false;
      this.notice(slot,'Conta aberta em janela anônima isolada. Feche essa janela e clique em Iniciar para voltar ao bot.');
    } catch {
      if(record.pipe&&!record.pipe.closed)await record.pipe.call('Browser.close').catch(()=>{});
      record.child?.kill();await this.release(slot,record);
      throw Error('Não consegui abrir a conta no navegador. Confira Chrome/Edge e tente novamente. A conta permanece pausada se a transferência já começou.');
    }
  }
  async release(slot,record) {
    if(record.released)return;record.released=true;
    if(this.windows.get(slot)===record)this.windows.delete(slot);
    if(record.profile){
      // Only delete the exact temporary profile created by this operation.
      const rel=relative(this.directory,resolve(record.profile));
      if(rel&&!rel.startsWith('..')&&!isAbsolute(rel)&&/^browser-[1-4]-[^\\/]+$/.test(rel))await rm(record.profile,{recursive:true,force:true,maxRetries:8,retryDelay:250}).catch(()=>{});
    }
  }
  async closeAll(){this.closing=true;await Promise.allSettled([...this.windows.values()].map(w=>w.pipe?.call('Browser.close')));}
}
