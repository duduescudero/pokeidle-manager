import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Deliberately independent of main.mjs, GameClient, vault and game catalogs.
// No account storage, WebSocket or outgoing requests are used in the demo.
export function createDemoServer() {
  const key = randomBytes(24).toString('hex');
  const fixture = JSON.parse(readFileSync(new URL('../test/desktop-fixture.json', import.meta.url), 'utf8'));
  const snapshot = {...fixture, demo: true, catalogError: ''};
  snapshot.log = fixture.log.map(entry => ({...entry, text: `[Exemplo fictício] ${entry.text}`}));
  const html = readFileSync(new URL('../public/demo.html', import.meta.url), 'utf8').replace('__API_KEY__', key);
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const json = (status, data) => {res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}`) return json(403, {error: 'Host inválido.'});
    // Never accept a mutation, even if a client imitates the real desktop API.
    if (req.method !== 'GET') return json(405, {error: 'Demonstração: operações reais desabilitadas.'});
    if (req.url === '/') {res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});return res.end(html);}
    if (req.url !== '/api/state') return json(404, {error: 'Página não encontrada.'});
    if (req.headers['x-manager-key'] !== key) return json(403, {error: 'Acesso negado.'});
    json(200, snapshot);
  });
  server.requestTimeout = 5000;
  return {server, key};
}
