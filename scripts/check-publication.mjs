import {readdirSync,readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const failures=[];
function walk(directory){for(const entry of readdirSync(directory,{withFileTypes:true})){
  if(['.git','node_modules','dist'].includes(entry.name))continue;
  const path=resolve(directory,entry.name),name=relative(root,path).replaceAll('\\','/');
  if(entry.isDirectory()){walk(path);continue;}
  if(/(?:\.secret(?:\.tmp)?$|\.session$|^\.env(?:\.|$)|(?:^|\/)manager\.json(?:\.tmp)?$|^data\/hunt-catalog\.json(?:\.tmp)?$|\.(?:exe|dll|zip)$|(?:^|\/).*?-public\.(?:js|mjs|html|json)$)/i.test(name))failures.push(name);
  if(/\.(?:mjs|json|md|html|ps1|cs|cmd|yml)$/.test(name)){
    const text=readFileSync(path,'utf8');
    if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))failures.push(name+' (credential pattern)');
  }
}}
walk(root);
if(failures.length){console.error('Arquivos fora do escopo público:',...failures);process.exitCode=1;}
else console.log('Publicação verificada: sem sessões, catálogo externo, bundles ou binários na cópia.');
