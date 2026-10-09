export const defaults = () => ({ enabled: false, reserve: 1000000, budget: 100000, rules: [] });
const maxStock = 1000000000;
function plan(guard,r,before) {
  const refill=guard.refills?.[`${r.kind}:${r.id}`];
  if (!refill && before>=r.min) return null;
  const target=r.target ?? refill?.target ?? before+r.qty;
  return {target,qty:Math.min(9999,target-before)};
}
export function validateConfig(v) {
  if (!v || typeof v.enabled !== 'boolean' || !Array.isArray(v.rules) || v.rules.length > 12) throw Error('Configuração inválida.');
  for (const k of ['reserve', 'budget']) if (!Number.isSafeInteger(v[k]) || v[k] < 0) throw Error('Reserva e orçamento devem ser inteiros não negativos.');
  if (v.unlimited !== undefined && typeof v.unlimited !== 'boolean') throw Error('Opção de gasto sem limite inválida.');
  const keys = new Set();
  for (const r of v.rules) {
    const targetRule = r.target !== undefined;
    if (!['ball', 'item'].includes(r.kind) || !Number.isSafeInteger(r.id) || r.id < 1 || !Number.isSafeInteger(r.min) || r.min < 1 ||
        r.min > maxStock || (targetRule ? !Number.isSafeInteger(r.target) || r.target < r.min || r.target > maxStock || r.qty !== undefined : !Number.isSafeInteger(r.qty) || r.qty < 1 || r.qty > maxStock)) {
      throw Error('Use quantidades inteiras até 1 bilhão. O estoque desejado precisa ser maior ou igual ao mínimo.');
    }
    const key = `${r.kind}:${r.id}`;
    if (keys.has(key)) throw Error('Item duplicado.');
    keys.add(key);
  }
  return { enabled: v.enabled, reserve: v.reserve, budget: v.budget, ...(v.unlimited ? {unlimited:true} : {}), rules: v.rules.map(r => ({kind:r.kind,id:r.id,min:r.min,...(r.target !== undefined ? {target:r.target} : {qty:r.qty})})) };
}
export const stock = (s, r) => Number((r.kind === 'ball' ? s?.balls : s?.items)?.[r.id] ?? 0);
export class Replenisher {
  constructor({ send, persist, notice = () => {}, guard = {}, now = Date.now }) {
    Object.assign(this, { send, persist, notice, now });
    this.guard = { spent: guard.spent || 0, fault: guard.fault || '', pending: null, refills:guard.refills ?? {} };
    if (guard.pending) this.guard.fault = 'Compra anterior sem confirmação. Confira o estoque antes de liberar.';
    this.config = defaults(); this.lastPurchase = 0;
  }
  save() { this.persist(this.guard); }
  fault(text) { this.guard.fault = text; this.guard.pending = null; this.save(); this.notice(text); }
  disconnected() { if (this.guard.pending) this.fault('Conexão caiu durante uma compra. Confira o estoque antes de liberar.'); }
  reset() { this.guard = { spent: 0, fault: '', pending: null }; this.save(); }
  describe(state, catalog, connected) {
    if (this.guard.fault) return 'Uma compra precisa ser revisada antes de continuar.';
    if (this.guard.pending) return 'Pedido enviado. Aguardando o jogo atualizar o estoque.';
    if (!this.config.enabled) return 'Escolha os itens que o bot pode comprar por você.';
    if (!connected || !state) return 'Conecte a conta para acompanhar as compras.';
    if (!this.config.rules.length) return 'Nenhum item selecionado. Abra Compras automáticas.';
    if (!this.config.unlimited && this.guard.spent >= this.config.budget) return 'O limite de gastos foi atingido. Ajuste o valor disponível ou ative Gastar sem limite.';
    let reason = '';
    for (const r of this.config.rules) {
      if (!(r.kind === 'ball' ? state.balls : state.items)) { reason = 'Aguardando o estoque informado pelo jogo.'; continue; }
      const before = stock(state,r);
      const order=plan(this.guard,r,before);if(!order || order.qty<=0) continue;
      const item = catalog.find(i => i.kind === r.kind && i.id === r.id);
      if (!item || !Number.isSafeInteger(item.price) || item.price <= 0) { reason = 'Conecte para atualizar o preço dos itens escolhidos.'; continue; }
      const cost = item.price * order.qty;
      if (state.gold - cost < this.config.reserve) { reason = 'A compra usaria os Coins que você quer guardar. Aguardando mais saldo.'; continue; }
      if (!this.config.unlimited && this.guard.spent + cost > this.config.budget) { reason = 'O valor disponível não cobre a próxima compra. Ajuste o limite ou o estoque desejado.'; continue; }
      return 'Um item está acabando. O bot fará a próxima compra automaticamente.';
    }
    return reason || 'Estoque em dia. Nenhum item precisa ser comprado.';
  }
  tick(state, catalog, connected) {
    if (!connected || !state) return;
    const now = this.now(), p = this.guard.pending;
    if (p) {
      if (stock(state,p) > p.before) { this.guard.pending = null; const key=`${p.kind}:${p.id}`;if(this.guard.refills?.[key] && stock(state,p)>=this.guard.refills[key].target) delete this.guard.refills[key]; this.save(); this.notice(`Estoque aumentou após compra: ${p.name}, pedido de ${p.qty}.`); }
      else if (now - p.at > 20000) this.fault('Compra sem aumento de estoque em 20 segundos. Reposição bloqueada; confira no jogo.');
      return;
    }
    if (!this.config.enabled || this.guard.fault || now - this.lastPurchase < 30000) return;
    for (const r of this.config.rules) {
      if (!(r.kind === 'ball' ? state.balls : state.items)) continue;
      const before = stock(state,r);
      if (!Number.isFinite(before)) continue;
      const order=plan(this.guard,r,before);if(!order || order.qty<=0) continue;
      const item = catalog.find(i => i.kind === r.kind && i.id === r.id);
      if (!item || !Number.isSafeInteger(item.price) || item.price <= 0) continue;
      const qty = order.qty;
      if (!Number.isSafeInteger(qty) || qty < 1 || qty > 9999) continue;
      const cost = item.price * qty;
      if (!Number.isSafeInteger(cost) || !Number.isFinite(state.gold) || state.gold - cost < this.config.reserve || (!this.config.unlimited && this.guard.spent + cost > this.config.budget)) continue;
      // Write in-flight purchase before sending; a crash cannot silently repeat it.
      const key=`${r.kind}:${r.id}`;this.guard.refills ??= {};
      if(order.target-before>9999 || this.guard.refills[key]) this.guard.refills[key]={target:order.target};
      this.guard.pending = { ...r, qty, before, at: now, name: item.name }; this.guard.spent += cost;
      this.save(); this.lastPurchase = now;
      this.send({ t: 'shop.buy', kind: r.kind, id: r.id, qty });
      this.notice(`Compra solicitada: ${qty} ${item.name}, custo previsto ${cost} Coins.`);
      return;
    }
  }
}
