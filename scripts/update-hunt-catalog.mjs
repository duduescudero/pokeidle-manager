// Maintenance only: read public factual data as JSON; never execute remote JavaScript.
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
const source = 'https://guiapokeidlehardtocapture.site/data.js?v=32';
const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw Error('Catálogo público indisponível.');
const text = (await response.text()).replace(/^\s*\/\/[^\r\n]*$/gm,'');
if (text.length > 3000000 || !/^\s*(?:\/\*[\s\S]*?\*\/\s*)?window\.PI_DATA\s*=/.test(text)) throw Error('Formato inesperado; arquivo anterior preservado.');
const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
if (!Array.isArray(data.especies) || !Array.isArray(data.hunts) || !data.tipos) throw Error('Catálogo incompleto.');
const types = Object.keys(data.tipos);
// Some mirror entries have form names in the type fields. Omit them instead of guessing.
const species = data.especies.filter(e=>Array.isArray(e.t)&&e.t.length>0&&e.t.every(t=>types.includes(t))).map(e => {
  if (!Number.isSafeInteger(e.id) || !Array.isArray(e.b) || e.b.length !== 6 || !e.b.every(v => Number.isFinite(v) && v > 0) || !Array.isArray(e.t) || !e.t.every(t => types.includes(t)) || !Array.isArray(e.m)) throw Error('Espécie inválida.');
  return { id:e.id, name:String(e.n).slice(0,100), types:e.t, base:e.b,
    moves:e.m.map(m => ({name:String(m[0]).slice(0,80),type:m[1],category:m[2]===0?'physical':'special',power:m[3],cooldown:m[4],level:m[5]})).filter(m => types.includes(m.type) && [m.power,m.cooldown,m.level].every(Number.isFinite) && m.power>0 && m.cooldown>0 && m.level>=1) };
});
const hunts=data.hunts.map(h => ({slug:h.s,region:h.a,level:h.nv,species:h.e}));
if(species.length<100 || hunts.length<100 || hunts.some(h=>typeof h.slug!=='string'||!Number.isFinite(h.level)||!Array.isArray(h.species)||h.species.some(e=>!Number.isSafeInteger(e[0])||!Number.isFinite(e[1])||e[1]<=0))) throw Error('Hunts inválidas.');
const geometrySource='https://guiapokeidlehardtocapture.site/geo.js?v=40';
const geometryResponse=await fetch(geometrySource,{signal:AbortSignal.timeout(15000)});
if(!geometryResponse.ok)throw Error('Geometria indisponível; catálogo anterior preservado.');
const geometryText=await geometryResponse.text();
if(geometryText.length>2000000)throw Error('Geometria excedeu o tamanho esperado.');
function assignment(name){
  // Strict JSON assignments only. Comments/functions/expressions are never evaluated.
  const expression=new RegExp('window\\.'+name+'\\s*=\\s*([\\s\\S]*?);');
  const match=geometryText.match(expression);if(!match)throw Error('Tabela ausente: '+name);
  return JSON.parse(match[1]);
}
const measuredXp=assignment('PI_XPKILL'),distance=assignment('PI_GEO'),origins=assignment('PI_GEO_FONTE'),spawns=assignment('PI_GEO_DISTS'),waves=assignment('PI_GEO_ONDA'),measured=assignment('PI_MEDIDO');
if(!Object.values(measuredXp).every(v=>Number.isFinite(v)&&v>=0)||!Object.values(distance).every(v=>Number.isFinite(v)&&v>0)||!Object.values(spawns).every(v=>Array.isArray(v)&&v.length>0&&v.length<=64&&v.every(n=>Number.isFinite(n)&&n>=0))||!Object.values(waves).every(v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&n>0)&&v[1]>=v[0]))throw Error('Valores inválidos na base de mapas.');
const maps=Object.fromEntries(hunts.map(h=>[h.slug,{near:distance[h.slug]??4.9,origin:origins[h.slug]??'padrao',distances:spawns[h.slug],wave:waves[h.slug],measuredKills:measured[h.slug]?.kph}]));
const output = new URL('../data/hunt-catalog.json',import.meta.url);
mkdirSync(new URL('../data/',import.meta.url),{recursive:true});
const temp=new URL('../data/hunt-catalog.json.tmp',import.meta.url);
writeFileSync(temp,JSON.stringify({source,geometrySource,updatedAt:new Date().toISOString(),types:data.tipos,species,hunts,measuredXp,maps}));
renameSync(temp,output);
console.log(`Catálogo: ${species.length} espécies, ${hunts.length} hunts. Somente dados públicos, sem informações de contas.`);
