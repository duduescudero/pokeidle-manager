const validLogin = value => typeof value === 'string' && /^[a-zA-Z0-9_]{1,25}$/.test(value);
const clean = value => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

export function twitchStatus(tw, connected) {
  if (!tw || typeof tw !== 'object') return { known: false, fresh: false, linked: false, active: false, lives: [], watching: [] };
  const official = new Map();
  for (const channel of Array.isArray(tw.oficiais) ? tw.oficiais : []) {
    if (validLogin(channel?.login)) official.set(channel.login.toLowerCase(), channel);
  }
  const watching = (Array.isArray(tw.assistindoEm) ? tw.assistindoEm : []).filter(validLogin).map(s => s.toLowerCase());
  const lives = [];
  const seen = new Set();
  for (const live of Array.isArray(tw.lives) ? tw.lives : []) {
    if (!validLogin(live?.login)) continue;
    const login = live.login.toLowerCase();
    if (seen.has(login)) continue;
    seen.add(login);
    const info = { ...official.get(login), ...live };
    // If live lacks the flag, use the official-channel flag instead.
    const bonus = live.bonus ?? official.get(login)?.bonus;
    lives.push({ login, name: clean(info.nome || login), bonus: bonus === true,
      watching: watching.includes(login), url: `https://www.twitch.tv/${login}` });
  }
  const linked = validLogin(tw.login);
  const active = linked && tw.assistindo === true;
  const rawPct = Number(tw.pctAtual) || Number(tw.pct);
  const percent = active && Number.isFinite(rawPct) && rawPct > 0 ? rawPct : null;
  return { known: true, fresh: !!connected, linked, login: linked ? tw.login : null,
    active, percent, count: Number.isSafeInteger(tw.emLives) && tw.emLives >= 0 ? tw.emLives : watching.length,
    watching, lives };
}

export function twitchFeedback(tw) {
  if (!tw?.known) return 'Twitch: aguardando informação do jogo';
  const stale = tw.fresh ? '' : ' (última leitura; conta desconectada)';
  if (!tw.linked) return `Twitch: conta não vinculada — vincule pelo jogo${stale}`;
  if (tw.active) {
    const pct = tw.percent == null ? 'percentual não informado' : `+${tw.percent.toLocaleString('pt-BR')}% XP`;
    return `Twitch: bônus ATIVO, ${pct} | ${tw.count} live(s) detectada(s) | conta ${clean(tw.login)}${stale}`;
  }
  return `Twitch: bônus INATIVO | conta ${clean(tw.login)} | ${tw.lives.filter(l => l.bonus).length} live(s) com bônus no ar${stale}`;
}
