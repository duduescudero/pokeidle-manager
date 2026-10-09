import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDemoServer} from './demo-server.mjs';

const useDesktop = process.argv.includes('--desktop');
if (useDesktop && process.platform !== 'win32') {
  console.error('A interface desktop precisa de Windows. Use npm run demo para o painel web.');
  process.exit(1);
}
const {server, key} = createDemoServer();
let desktop;
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'A porta 3848 está ocupada. Encerre a demonstração anterior.' : 'Não foi possível iniciar a demonstração.');
  process.exitCode = 1;
});
server.listen(3848, '127.0.0.1', () => {
  console.log('PokeIdle Manager — demonstração com dados fictícios.');
  console.log('Abra http://127.0.0.1:3848 no navegador. Ctrl+C encerra.');
  if (!useDesktop) return;
  const env = {...process.env, POKEIDLE_MANAGER_KEY: key};
  for (const name of Object.keys(env)) if (name.toLowerCase() === 'psmodulepath') delete env[name];
  desktop = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('../desktop/desktop.ps1', import.meta.url)), '-Demo'], {env, stdio: 'inherit'});
  desktop.on('error', () => {console.error('Não foi possível abrir Windows Forms. O painel web está disponível.');server.close();process.exitCode = 1;});
  desktop.on('exit', code => {server.close();process.exitCode = code ?? 1;});
});
function stop() {desktop?.kill();server.close();}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
