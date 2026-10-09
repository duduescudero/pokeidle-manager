export const saleDefaults=()=>({enabled:false,minutes:60,mode:'all'});
export function validateSale(v){if(!v||typeof v.enabled!=='boolean'||!Number.isSafeInteger(v.minutes)||v.minutes<1||v.minutes>10080)throw Error('Escolha um intervalo de 1 a 10.080 minutos.');return {enabled:v.enabled,minutes:v.minutes,mode:'all'};}
const expShare=70050;
export function depotStock(s){
  const locks=s?.automation?.pokemonTravado;
  const known=!!s&&Number.isSafeInteger(s.activeId)&&Array.isArray(s.pokemons)&&Array.isArray(locks)&&locks.every(id=>Number.isSafeInteger(id)&&id>0)&&s.pokemons.every(p=>p&&Number.isSafeInteger(p.id)&&p.id>0&&Object.hasOwn(p,'slot'));
  if(!known)return {known:false,count:null,collection:null,team:null,eligible:[],protected:null,message:'Aguardando a lista completa do Depot e da Coleção. Vendas bloqueadas.'};
  const collection=new Set(locks),all=s.pokemons.filter(p=>p.slot===null&&p.id!==s.activeId&&!collection.has(p.id));
  const eligible=all.filter(p=>Number(p.heldItemId)!==expShare&&!p.colecao&&!p.naColecao&&!p.travado);
  const eligibleIds=new Set(eligible.map(p=>p.id));
  const row=p=>({id:p.id,name:String(p.apelido||p.nome||'Pokémon').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,60),level:p.level??null,shiny:!!p.shiny,potencia:p.potencia??1,protected:!eligibleIds.has(p.id)});
  return {known:true,count:all.length,collection:s.pokemons.filter(p=>collection.has(p.id)).length,team:s.pokemons.filter(p=>p.slot!==null||p.id===s.activeId).length,protected:all.length-eligible.length,valuable:eligible.filter(p=>p.shiny||Number(p.potencia)>=5).length,eligible:eligible.map(row),pokemon:all.slice(0,200).map(row),message:'Venda de todo o Depot. Coleção, equipe e Exp. Share equipadas excluídas.'};
}
export class DepotSeller{
  constructor({send,persist,notice=()=>{},guard={},now=Date.now}){Object.assign(this,{send,persist,notice,now});this.config=saleDefaults();this.guard={lastRun:guard.lastRun??0,fault:guard.fault??'',pending:null};if(guard.pending)this.guard.fault='Venda anterior sem confirmação. Confira o Depot antes de liberar.';this.queue=[];this.lastSend=0;}
  save(){this.persist(this.guard);}
  block(text){this.queue=[];this.guard.pending=null;this.guard.fault=text;this.save();this.notice(text);}
  disconnected(){this.queue=[];if(this.guard.pending)this.block('Conexão caiu durante uma venda. Confira o Depot antes de liberar.');}
  begin(state,fresh,manual=false,ids=null){if(!fresh)throw Error('Conecte a conta e aguarde um estado atualizado antes de vender.');if(this.guard.fault)throw Error(this.guard.fault);if(this.guard.pending||this.queue.length)throw Error('Já há uma venda em andamento.');const stock=depotStock(state);if(!stock.known)throw Error(stock.message);const selected=stock.eligible.filter(p=>ids===null||(typeof ids==='number'?p.id<=ids:ids.includes(p.id)));if(!selected.length)return 0;const ateId=selected.reduce((max,p)=>Math.max(max,p.id),0);const selectedIds=new Set(selected.map(p=>p.id)),range=stock.eligible.filter(p=>p.id<=ateId);if(range.some(p=>!selectedIds.has(p.id)))throw Error('O Depot mudou. Atualize a janela e confirme novamente a venda de todo o lote.');this.queue=selected.map(p=>p.id);this.guard.lastRun=this.now();this.save();this.notice(`${manual?'Venda manual':'Venda automática'}: lote de ${this.queue.length} Pokémon do Depot. Coleção excluída.`);return this.queue.length;}
  tick(state,fresh){
    if(!fresh)return;const stock=depotStock(state);if(!stock.known)return;const now=this.now(),pending=this.guard.pending;
    if(pending){const ids=pending.ids??[pending.id];const currentIds=new Set(state.pokemons.map(p=>p.id));if(ids.every(id=>!currentIds.has(id))){this.guard.pending=null;this.save();this.notice(`Venda em lote confirmada: ${ids.length} Pokémon saíram do Depot.`);}else if(now-pending.at>20000)this.block('Venda em lote sem confirmação completa em 20 segundos. Confira o Depot antes de liberar.');return;}
    if(this.guard.fault)return;if(!this.queue.length&&this.config.enabled&&now-this.guard.lastRun>=this.config.minutes*60000)this.begin(state,true);
    if(!this.queue.length||now-this.lastSend<2500)return;
    const queuedIds=new Set(this.queue),collectionIds=new Set(state.automation.pokemonTravado);const selected=stock.eligible.filter(p=>queuedIds.has(p.id));if(selected.length!==this.queue.length){this.queue=[];this.notice('O Depot ou a Coleção mudou antes do envio. Venda cancelada; confirme o lote atualizado.');return;}
    const ateId=this.queue.reduce((max,id)=>Math.max(max,id),0);const range=state.pokemons.filter(p=>p.slot===null&&p.id!==state.activeId&&!collectionIds.has(p.id)&&p.id<=ateId&&Number(p.heldItemId)!==expShare);
    if(range.length!==selected.length||range.some(p=>!queuedIds.has(p.id))){this.queue=[];this.notice('O lote mudou antes do envio. Venda cancelada para preservar Pokémon fora da seleção.');return;}
    // Same bulk request as the game. No collection unlock, move, or individual sale.
    this.guard.pending={ids:[...this.queue],ateId,at:now};this.save();this.queue=[];this.lastSend=now;this.send({t:'shop.sellAllPokemons',ateId});
  }
}
