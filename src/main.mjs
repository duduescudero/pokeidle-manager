import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { GameClient } from './client.mjs';
import { Replenisher, defaults, validateConfig } from './replenish.mjs';
import { terminalSummary } from './terminal.mjs';
import { twitchStatus, twitchFeedback } from './twitch.mjs';
import { LivePages } from './twitch-view.mjs';
import { gameDetails, progress } from './metrics.mjs';
import { DepotSeller, depotStock, saleDefaults, validateSale } from './depot.mjs';
import { createHuntAdvisor } from './hunt-advisor.mjs';
import { AutoHunt } from './auto-hunt.mjs';
import { AccountBrowsers } from './account-browser.mjs';

const vault = fileURLToPath(new URL('../scripts/vault.ps1', import.meta.url));
const directory = join(process.env.LOCALAPPDATA, 'PokeidleManager');
mkdirSync(directory, { recursive: true });
const configFile = join(directory, 'manager.json');
let settings = {};
try { settings = JSON.parse(readFileSync(configFile, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw Error('manager.json ilegível. Preserve o arquivo e revise antes de iniciar.'); }
settings.device ??= randomUUID(); settings.accounts ??= {};
function save() { writeFileSync(`${configFile}.tmp`, JSON.stringify(settings,null,2)); renameSync(`${configFile}.tmp`,configFile); }
save();
function access(action,slot,session) {
  const r = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',vault,'-Action',action,'-Slot',String(slot)], {
    input: session ? JSON.stringify(session) : undefined, encoding:'utf8', windowsHide:true, timeout:15000,
  });
  if (r.status !== 0) throw Error(action === 'import' ? 'Falha na importação. Copie a sessão no Console do jogo e tente novamente.' : 'Falha ao acessar a sessão protegida.');
  return action === 'read' ? JSON.parse(r.stdout) : undefined;
}
const accounts = new Map(), log = [];
function notice(slot,text) { const at=Date.now();log.unshift({at,slot,text}); log.length = Math.min(log.length,60); console.log(`[${new Date(at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'})}] Conta ${slot}: ${text}`); }
const browserDirectory=join(directory,'browsers');mkdirSync(browserDirectory,{recursive:true});
const accountBrowsers=new AccountBrowsers({directory:browserDirectory,notice});
let items = [], catalogError = '';
try {
  const r = await fetch('https://pokeidle.io/assets/items.json', {signal:AbortSignal.timeout(12000)});
  if (!r.ok) throw Error();
  const data = await r.json(); items = data.items.filter(i => ['heal','revive'].includes(i.category) && i.npcPrice > 0);
} catch { catalogError = 'Catálogo de poções indisponível; compras desses itens bloqueadas até reiniciar.'; }
function catalog(c) {
  const prices = new Map((c.serverPrices ?? []).map(i => [i.itemId,i.preco]));
  const combined = new Map([...items,...(c.customItems ?? [])].map(i => [i.id,i]));
  return [...c.catalog,...[...combined.values()].filter(i => ['heal','revive'].includes(i.category) && i.npcPrice > 0)
    .map(i => ({kind:'item',id:i.id,name:i.name,category:i.category,price:prices.get(i.id) ?? i.npcPrice}))];
}
function load(slot) {
  if (accounts.has(slot)) return accounts.get(slot);
  const session = access('read',slot);
  for (const a of accounts.values()) if (a.client.session.nick.toLowerCase() === session.nick.toLowerCase()) throw Error('Conta já importada em outro slot.');
  const entry = settings.accounts[slot] ??= {config:defaults(),guard:{}};
  entry.config = validateConfig(entry.config);
  const client = new GameClient(session, {device:settings.device,saveSession:s => access('write',slot,s)});
  const replenish = new Replenisher({send:m => client.send(m),guard:entry.guard,persist:guard => {entry.guard=guard;save();},notice:text=>notice(slot,text)});
  replenish.config = entry.config;
  if(entry.saleConfig?.enabled&&entry.saleConfig.mode!=='all'){entry.saleConfig={...entry.saleConfig,enabled:false};notice(slot,'Venda em lote disponível. Revise o Depot e ative novamente a automação; agora inclui shiny e P5 fora da Coleção.');}
  entry.saleConfig=validateSale(entry.saleConfig??saleDefaults());
  const seller=new DepotSeller({send:m=>client.send(m),guard:entry.saleGuard,persist:guard=>{entry.saleGuard=guard;save();},notice:text=>notice(slot,text)});
  seller.config=entry.saleConfig;
  const autoHunt=new AutoHunt({notice:text=>notice(slot,text)});
  autoHunt.configure(entry.autoHunt===true);
  const a = {client,replenish,seller,autoHunt,advise:createHuntAdvisor()};
  a.tick = () => {
    client.huntObservations.update(client.state,client.status==='conectada'&&Date.now()-client.lastStateAt<10000);
    try { replenish.tick(client.state,catalog(client),client.status === 'conectada' && client.ws?.readyState === 1);seller.tick(client.state,client.status==='conectada'&&client.ws?.readyState===1&&Date.now()-client.lastStateAt<10000);
      const potions=catalog(client).filter(i=>i.category==='heal').map(i=>({...i,heal:[...items,...(client.customItems??[])].find(item=>item.id===i.id)?.healAmount}));
      client.flushManualHunt();
      if(autoHunt.enabled)autoHunt.tick(client,a.advise(client.state,client.hunts,client.huntCombat,potions));
    }
    catch { client.stop(); notice(slot,'Falha ao salvar controle das automações. Conta parada.'); }
  };
  client.on('state',a.tick);
  client.on('state', () => {
    const tw = twitchStatus(client.state?.twitch, client.status === 'conectada');
    const signature = JSON.stringify([tw.known,tw.linked,tw.login,tw.active,tw.percent,tw.count,tw.watching]);
    if (a.twitchSignature !== signature) {
      a.twitchSignature = signature;
      notice(slot,twitchFeedback(tw));
    }
  });
  client.on('disconnected',()=> {try {replenish.disconnected();} catch {replenish.guard.fault='Falha ao salvar controle de compras.';}});
  client.on('disconnected',()=>{try{seller.disconnected();}catch{seller.guard.fault='Falha ao salvar controle de vendas.';}});
  client.on('status',s=>notice(slot,s)); client.on('notice',s=>notice(slot,s));
  replenish.save(); accounts.set(slot,a); return a;
}
for (let slot=1;slot<=4;slot++) if (existsSync(join(directory,`account-${slot}.secret`))) {try {load(slot);} catch(e) {notice(slot,e.message);}}
const timer = setInterval(()=> {for (const a of accounts.values()) a.tick();},1000);
const feedbackTimer = setInterval(() => console.log(terminalSummary(snapshot())), 15000);
let previousCpu=process.cpuUsage(),previousCpuAt=Date.now(),cpuPercent=0;
function snapshot() {
  const now=Date.now();if(now-previousCpuAt>=1000){const current=process.cpuUsage();cpuPercent=100*(current.user+current.system-previousCpu.user-previousCpu.system)/((now-previousCpuAt)*1000);previousCpu=current;previousCpuAt=now;}
  return {runtime:{cpuPercent,memoryMb:process.memoryUsage().rss/1048576},catalogError,log,accounts:Array.from({length:4},(_,i)=> {
    const slot=i+1,a=accounts.get(slot),c=a?.client,s=c?.state;
    const active=s?.pokemons?.find(p=>p.id===s.activeId);
    const potionCatalog=c?catalog(c).filter(i=>i.category==='heal').map(i=>({...i,heal:[...items,...(c.customItems??[])].find(item=>item.id===i.id)?.healAmount})):[];
    return {slot,imported:!!a,nick:c?.session.nick,status:c?.status ?? 'não importada',browser:accountBrowsers.snapshot(slot),hunt:s?.huntSlug,hunts:c?.hunts??[],routePending:c?.routePending??null,routeQueued:c?.routeQueued??null,huntGate:c?.huntGate()??{ready:false,message:'Conecte a conta'},autoHunt:a?.autoHunt.snapshot()??{enabled:false,message:'Desligado'},huntAdvice:a?.advise(s,c.hunts,c.huntCombat,potionCatalog)??null,huntMeasurements:c?.huntObservations.snapshot()??[],gold:s?.gold,
      trainerLevel:s?.level ?? null,activePokemon:active ? {name:active.apelido || active.nome || 'Pokémon',level:active.level ?? null,shiny:!!active.shiny,xp:progress(active),hp:active.hp??null,maxHp:active.maxHp??null} : null,captures:c?.captures ?? [],
      ...gameDetails(s),metrics:c?.metrics.snapshot(catalog(c))??null,
      depot:depotStock(s),saleConfig:a?.seller.config??saleDefaults(),saleGuard:a?.seller.guard??{},saleQueued:a?.seller.queue.length??0,
      balls:s?.balls ?? {},items:s?.items ?? {},inCenter:!!s?.noCentro,gain:s && c.baseline ? s.gold-c.baseline.gold : null,events:c?.events ?? 0,
      age:c?.lastGame ? Math.round((Date.now()-c.lastGame)/1000) : null,config:a?.replenish.config ?? defaults(),guard:a?.replenish.guard ?? {},catalog:c ? catalog(c) : [],
      twitch:twitchStatus(s?.twitch,c?.status === 'conectada'),
      supplyMessage:a ? a.replenish.describe(s,catalog(c),c.status==='conectada') : 'Conecte uma conta para configurar suas compras.'};
  })};
}
const apiKey=randomBytes(24).toString('hex'),host='127.0.0.1:3847';
let desktop;
const commands = createInterface({ input: process.stdin, output: process.stdout });
function openDesktop() {
  if (desktop && desktop.exitCode === null && !desktop.killed) return console.log('O painel do Windows já está aberto.');
  const desktopEnv={...process.env,POKEIDLE_MANAGER_KEY:apiKey};
  // Windows PowerShell must build its own module path, including Forms helpers.
  for (const key of Object.keys(desktopEnv)) if(key.toLowerCase()==='psmodulepath') delete desktopEnv[key];
  desktop = spawn('powershell.exe', ['-NoProfile','-STA','-WindowStyle','Normal','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../desktop/desktop.ps1',import.meta.url))], {
    // This is the user-requested GUI: do not inherit SW_HIDE for its first window.
    windowsHide:false, env:desktopEnv, stdio:['ignore','pipe','pipe'],
  });
  desktop.stdout.on('data',data=> { if(data.toString().includes('PANEL_READY')) console.log('Painel Windows exibido. Procure PokeIdle Manager na barra de tarefas.'); });
  let failed=false;
  desktop.stderr.on('data',()=>{failed=true;});
  desktop.on('error',()=>console.log('Falha ao abrir o painel Windows. O painel web continua disponível.'));
  desktop.on('exit',code=>{console.log(code || failed ? 'Painel Windows retornou erro. Use o painel web enquanto revisamos.' : 'Painel Windows fechado. O bot continua; P + Enter reabre o painel.');});
}
commands.on('line',line=> { if(line.trim().toLowerCase()==='p') openDesktop(); });
commands.on('SIGINT',()=>shutdown());
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8').replace('__API_KEY__',apiKey);
const livePages=new LivePages();
const server=createServer(async(req,res)=> {
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const respond=(code,data)=> {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  if(req.method==='GET'&&req.headers.host==='localhost:3847'&&req.url.startsWith('/twitch/')&&/^[a-f0-9-]{36}$/.test(req.url.slice(8))) {
    const page=livePages.get(req.url.split('/').pop());
    if(!page)return respond(404,{error:'Reabra as lives pelo painel.'});
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-src https://player.twitch.tv https://www.twitch.tv; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(page);
  }
  if (req.headers.host !== host) return respond(403,{error:'Host inválido.'});
  if (req.method === 'GET' && req.url === '/') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
  if (req.headers['x-manager-key'] !== apiKey) return respond(403,{error:'Acesso negado.'});
  if (req.method === 'GET' && req.url === '/api/state') return respond(200,snapshot());
  if (req.method !== 'POST' || req.url !== '/api/action' || req.headers.origin !== `http://${host}` || !req.headers['content-type']?.startsWith('application/json')) return respond(403,{error:'Requisição inválida.'});
  try {
    let body=''; for await (const chunk of req) {body+=chunk;if(body.length>16384) throw Error('Requisição grande demais.');}
    const {slot,action,config}=JSON.parse(body);
    if (!Number.isInteger(slot) || slot<1 || slot>4) throw Error('Slot inválido.');
    // Desktop lifecycle only: use the existing graceful shutdown, as Ctrl+C does.
    if(action==='shutdown'){respond(200,{ok:true});setTimeout(shutdown,200);return;}
    if (action === 'import') {
      if(accountBrowsers.active(slot))throw Error('Feche a janela desta conta no navegador antes de importar.');
      if (accounts.get(slot)?.client.ws || accounts.get(slot)?.client.retry) throw Error('Pare a conta antes de importar.');
      access('import',slot);
      const renewed=access('read',slot),old=accounts.get(slot);
      if(!old || old.client.session.nick.toLowerCase()!==renewed.nick.toLowerCase()) settings.accounts[slot]={config:defaults(),guard:{}};
      save();
      accounts.delete(slot); load(slot); notice(slot,old && old.client.session.nick.toLowerCase()===renewed.nick.toLowerCase() ? 'Sessão renovada. Preferências de compra preservadas.' : 'Sessão importada e protegida no Windows. Compras desligadas.');
    } else {
      const a=accounts.get(slot); if(!a) throw Error('Importe a conta primeiro.');
      if(action === 'start') {if(accountBrowsers.active(slot))throw Error('Feche a janela desta conta no navegador antes de iniciar o bot.');a.client.start();}
      else if(action === 'stop') a.client.stop();
      else if(action==='browser-open') {
        if(!accountBrowsers.active(slot)&&(a.replenish.guard.pending||a.seller.guard.pending||a.client.routePending))throw Error('Aguarde a compra, venda ou troca de hunt pendente antes de abrir a conta no navegador.');
        await accountBrowsers.open(slot,a.client.session,{beforeNavigate:()=>{a.client.stop();notice(slot,'Farm pausado nesta conta para abrir no navegador.');},saveSession:s=>{access('write',slot,s);a.client.session=s;}});
      }
      else if(action === 'remove') {
        if(accountBrowsers.active(slot))throw Error('Feche a janela desta conta no navegador antes de remover.');
        a.client.stop();access('remove',slot);delete settings.accounts[slot];save();accounts.delete(slot);notice(slot,'Conta removida deste computador.');
      }
      else if(action === 'disable-purchases') {
        const clean={...a.replenish.config,enabled:false};settings.accounts[slot].config=clean;save();a.replenish.config=clean;a.replenish.guard.refills={};a.replenish.save();notice(slot,'Compras automáticas desligadas. Preferências preservadas.');
      }
      else if(action==='hunt-select'){
        a.client.validateHuntSelection(config?.slug);
        if(a.client.routeUncertain)throw Error('Confira a hunt atual antes de tentar outra troca sem confirmação.');
        settings.accounts[slot].autoHunt=false;save();a.autoHunt.configure(false);
        a.client.queueManualHunt(config?.slug);
        notice(slot,'Hunt escolhida manualmente. Auto melhor hunt desligado para preservar sua escolha.');
      }
      else if(action==='hunt-cancel'){a.client.cancelManualHunt();}
      else if(action==='hunt-auto'){
        if(typeof config?.enabled!=='boolean')throw Error('Configuração de Auto melhor hunt inválida.');
        settings.accounts[slot].autoHunt=config.enabled;save();a.autoHunt.configure(config.enabled);a.client.routeUncertain=false;if(config.enabled)a.client.cancelManualHunt();
        notice(slot,config.enabled?'Auto melhor hunt ligado: XP estimado, baixo risco e saída normal do combate.':'Auto melhor hunt desligado.');a.tick();
      }
      else if(action==='depot-sell'){const cutoff=config?.ateId;const ids=config?.ids;if(!((Number.isSafeInteger(cutoff)&&cutoff>0)||(Array.isArray(ids)&&ids.length<=5000&&ids.every(id=>Number.isSafeInteger(id)&&id>0))))throw Error('Seleção de venda inválida. Atualize a janela do Depot.');a.seller.begin(a.client.state,a.client.status==='conectada'&&a.client.ws?.readyState===1&&Date.now()-a.client.lastStateAt<10000,true,cutoff??ids);}
      else if(action==='depot-config'){const clean=validateSale(config);settings.accounts[slot].saleConfig=clean;save();a.seller.config=clean;if(!clean.enabled)a.seller.queue=[];else{a.seller.guard.lastRun=Date.now();a.seller.save();}notice(slot,clean.enabled?`Venda automática do Depot a cada ${clean.minutes} minutos. Coleção excluída.`:'Venda automática desligada.');}
      else if(action==='depot-review'){if(a.seller.guard.pending)throw Error('Aguarde o pedido em andamento.');a.seller.guard.fault='';a.seller.save();notice(slot,'Venda revisada pelo usuário. Bloqueio liberado.');}
      else if(action === 'config-all') {
        const source=validateConfig(config),remaining=Math.max(0,source.budget-a.replenish.guard.spent),updates=[];
        for(const [target,b] of accounts){
          const next=validateConfig({...source,budget:b.replenish.guard.spent+remaining}),available=catalog(b.client);
          if(next.enabled&&b.client.state&&available.length&&next.rules.some(r=>!available.some(i=>i.kind===r.kind&&i.id===r.id)))throw Error(`Conta ${target}: um item não está no catálogo. Nenhuma configuração foi aplicada.`);
          updates.push([target,b,next]);
        }
        const previous=settings.accounts;
        settings.accounts={...previous};for(const [target,,next] of updates)settings.accounts[target]={...previous[target],config:next};
        try{save();}catch(e){settings.accounts=previous;throw e;}
        for(const [target,b,next] of updates){b.replenish.config=next;notice(target,'Preferências de compras aplicadas a partir da conta '+slot+'. Gastos já registrados preservados.');}
      }
      else if(action === 'twitch.open') {
        const tw = twitchStatus(a.client.state?.twitch,a.client.status === 'conectada');
        if (!tw.fresh) throw Error('Conecte a conta para atualizar as lives.');
        if (!tw.linked) throw Error('Vincule sua Twitch nas configurações do jogo primeiro.');
        const lives = tw.lives.filter(l => l.bonus);
        if (!lives.length) throw Error('Nenhuma live com bônus confirmado está no ar.');
        const pageId=livePages.create(lives);
        const r=spawnSync('cmd.exe',['/c','start','','http://localhost:3847/twitch/'+pageId],{windowsHide:true,timeout:5000});
        if(r.status!==0)throw Error('Não foi possível abrir as lives. Confira o navegador padrão do Windows.');
        notice(slot,'Lives solicitadas no player sem som. Entre no chat com a Twitch vinculada; o jogo confirma o bônus.');
        return respond(200,{ok:true,count:lives.length});
      }
      else if(action === 'config') {
        const clean=validateConfig(config),available=catalog(a.client);
        if(clean.enabled && clean.rules.some(r=>!available.some(i=>i.kind===r.kind && i.id===r.id))) throw Error('Conecte a conta e escolha itens do catálogo atual.');
        settings.accounts[slot].config=clean;save();a.replenish.config=clean;
        notice(slot,clean.enabled ? 'Reposição ativada com os limites configurados.' : 'Reposição desativada.');
      } else if(action === 'reset') {
        if(a.replenish.guard.pending) throw Error('Espere a compra em andamento terminar.');
        a.replenish.reset();notice(slot,'Orçamento renovado e bloqueio liberado pelo usuário.');
      } else if(action === 'review') {
        if(a.replenish.guard.pending) throw Error('Aguarde a compra em andamento terminar.');
        a.replenish.guard.fault='';a.replenish.save();
        notice(slot,'Compra revisada pelo usuário. Compras automáticas liberadas, saldo de compras preservado.');
      } else throw Error('Ação desconhecida.');
    }
    respond(200,{ok:true});
  } catch(e) {respond(400,{error:e.message});}
});
server.on('error',()=> {console.error('Painel indisponível. Feche outra instância do gerenciador.');shutdown();process.exitCode=1;});
server.listen(3847,'127.0.0.1',()=> {
  console.log(`Painel: http://${host} — contas paradas até clicar em Iniciar.`);
  console.log('Resumo no terminal a cada 15 segundos. Pode fechar o navegador após iniciar as contas.');
  console.log(terminalSummary(snapshot()));
  console.log('P + Enter abre o painel Windows. Ctrl+C encerra o bot.');
  if (!process.env.POKEIDLE_NO_OPEN) openDesktop();
});
let shuttingDown=false;
function shutdown() {
  if(shuttingDown) return;
  shuttingDown=true;
  clearInterval(timer);clearInterval(feedbackTimer);commands.close();desktop?.kill();
  for(const a of accounts.values()) a.client.stop();server.close();
  void accountBrowsers.closeAll();
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

