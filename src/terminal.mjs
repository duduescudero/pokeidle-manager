const number = value => value == null ? '—' : Number(value).toLocaleString('pt-BR');
import { twitchFeedback } from './twitch.mjs';
const safeText = value => String(value ?? '—').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

export function terminalSummary(snapshot, now = new Date()) {
  const time = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const lines = [`\n[${time}] RESUMO DO BOT — funciona com o painel fechado`];
  const accounts = snapshot.accounts.filter(a => a.imported);
  if (!accounts.length) lines.push('Nenhuma conta importada. Abra o painel para adicionar uma conta.');
  for (const a of accounts) {
    const gain = a.gain == null ? '—' : `${a.gain >= 0 ? '+' : ''}${number(a.gain)}`;
    lines.push(`Conta ${a.slot} (${safeText(a.nick)}) | ${safeText(a.status)}`);
    lines.push(`  Hunt: ${safeText(a.hunt)} | Coins: ${number(a.gold)} | Variação: ${gain}`);
    lines.push(`  Treinador: nível ${number(a.trainerLevel)} | Em campo: ${a.activePokemon ? `${safeText(a.activePokemon.name)} · nível ${number(a.activePokemon.level)}` : '—'}`);
    const m=a.metrics;
    if(m){
      lines.push(`  XP/h treinador: ${number(m.trainerHour)} | Pokémon: ${number(m.pokemonHour)} | Lucro estimado/h: ${number(m.netHour)}`);
      lines.push(`  Abates: ${number(m.kills)} (${number(m.killsHour)}/h) | Capturas: ${number(m.catches)} (${number(m.catchesHour)}/h) | Shiny: ${number(m.shinyCaught)} capturados / ${number(m.shinySeen)} vistos`);
      lines.push(`  Receita do farm: ${number(m.income)} | Custo estimado de reposição: ${number(m.costEstimated)} | Resultado estimado: ${number(m.netEstimated)}`);
      lines.push(`  Consumidos: ${m.used.map(i=>`${safeText(i.name)} x${number(i.qty)}`).join(' | ')||'nenhum'} | Drops: ${m.drops.map(i=>`${safeText(i.name)} x${number(i.qty)}`).join(' | ')||'nenhum'}`);
      if(a.activePokemon)lines.push(`  HP: ${number(a.activePokemon.hp)}/${number(a.activePokemon.maxHp)} | XP: ${a.activePokemon.xp?.percent?.toFixed(1)??'—'}% | Diamantes: ${number(a.diamonds)} | Gemas: ${number(a.gems)}`);
      lines.push(`  Automações do jogo: ${safeText(a.automation)} | ${a.bonuses.map(b=>`${safeText(b.name)}: ${safeText(b.text)}`).join(' | ')}`);
    }
    if(a.captures?.length) lines.push(`  Capturas recentes: ${a.captures.slice(0,3).map(p=>`${p.shiny?'★ ':''}${safeText(p.name)} (nível ${number(p.level)})`).join(' | ')}`);
    lines.push(`  Eventos: ${number(a.events)} | Último sinal do jogo: ${a.age == null ? '—' : `${a.age}s atrás`}`);
    if(a.depot)lines.push(`  Depot: ${number(a.depot.count)} | Coleção protegida: ${number(a.depot.collection)} | Livres para venda: ${a.depot.known?a.depot.eligible.length:'—'} | Venda automática: ${a.saleConfig?.enabled?'a cada '+a.saleConfig.minutes+' min':'desligada'}${a.saleGuard?.fault?' | '+safeText(a.saleGuard.fault):''}`);
    const entries = new Map();
    for (const item of a.catalog) {
      const qty = (item.kind === 'ball' ? a.balls : a.items)[item.id];
      if (Number(qty) > 0 || a.config.rules.some(r => r.kind === item.kind && r.id === item.id)) {
        entries.set(`${item.kind}:${item.id}`, `${safeText(item.name)}: ${number(qty ?? 0)}`);
      }
    }
    // Ball stock is useful even before the catalog has been received.
    for (const [id, qty] of Object.entries(a.balls)) {
      if (!entries.has(`ball:${id}`) && Number(qty) > 0) entries.set(`ball:${id}`, `Bola ${id}: ${number(qty)}`);
    }
    lines.push(`  Estoque: ${[...entries.values()].join(' | ') || 'aguardando estado'}`);
    const status = a.guard.fault ? `precisa de revisão: ${safeText(a.guard.fault)}`
      : a.guard.pending ? 'aguardando o estoque atualizar' : a.config.enabled ? 'ligadas' : 'desligadas';
    lines.push(`  Compras automáticas: ${status} | Limite de gastos: ${a.config.unlimited ? 'sem limite' : number(Math.max(0,a.config.budget-(a.guard.spent??0))) + ' Coins disponíveis'} | Guardar na conta: ${number(a.config.reserve)}`);
    if(a.config.enabled && a.supplyMessage) lines.push(`  ${safeText(a.supplyMessage)}`);
    lines.push(`  ${twitchFeedback(a.twitch)}`);
    if (a.status !== 'conectada') lines.push('  Conta sem farm ativo neste gerenciador; os valores exibidos podem ser antigos.');
  }
  return lines.join('\n');
}
