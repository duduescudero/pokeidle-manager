import { randomUUID } from 'node:crypto';

export function mutedLivesPage(lives) {
  const names=[...new Set(lives.map(l=>l.login))];
  if(!names.length||names.length>32||names.some(n=>typeof n!=='string'||!/^\w{1,25}$/.test(n)))throw Error('Canais Twitch inválidos.');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel de lives · PokeIdle Manager</title>
  <style>body{margin:0;background:#0d111b;color:#eaf0f9;font:16px Segoe UI,sans-serif}main{max-width:1400px;margin:auto;padding:24px}h1{margin:0 0 10px}p{color:#a6b4c9;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:24px}section{background:#171d2b;border:1px solid #2a3245;border-radius:14px;padding:16px;min-width:0}h2{margin:0 0 12px;font-size:20px}a{color:#b59cff}iframe{border:0;width:100%;height:340px;border-radius:8px}.chat{height:300px;margin-top:12px}details{margin-top:14px}summary{cursor:pointer;color:#b59cff;padding:8px 0}section p{font-size:14px}main>p{max-width:950px}</style>
  <main><h1>Seu painel de lives</h1><p>Os players iniciam mutados. Se não começarem, clique em Play. Os chats começam recolhidos; abra “Mostrar chat” para entrar com a Twitch vinculada ao jogo. O bônus continua sendo confirmado no painel pelo PokeIdle; abrir esta página não garante XP. Se o player ou o login falhar, use “Abrir canal normal”.</p><div class="grid">${names.map(n=>`<section><h2>${n}</h2><iframe title="Live ${n}" src="https://player.twitch.tv/?channel=${n}&parent=localhost&muted=true&autoplay=true" allow="autoplay; fullscreen" allowfullscreen></iframe><details><summary>Mostrar chat / entrar na Twitch</summary><iframe class="chat" title="Chat ${n}" src="https://www.twitch.tv/embed/${n}/chat?parent=localhost"></iframe></details><p><a href="https://www.twitch.tv/${n}" target="_blank" rel="noopener noreferrer">Abrir canal normal ↗</a></p></section>`).join('')}</div><p>Mantenha esta página aberta enquanto assistir. Ela usa navegador e internet; fechar o painel do bot não fecha as lives.</p></main></html>`;
}

export class LivePages {
  constructor(){this.pages=new Map();}
  create(lives){const id=randomUUID();this.pages.set(id,{html:mutedLivesPage(lives),at:Date.now()});while(this.pages.size>32)this.pages.delete(this.pages.keys().next().value);return id;}
  get(id){const p=this.pages.get(id);if(!p||Date.now()-p.at>86400000){this.pages.delete(id);return null;}return p.html;}
}
