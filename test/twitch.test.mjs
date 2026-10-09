import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twitchStatus, twitchFeedback } from '../src/twitch.mjs';

test('reports server-confirmed percentage and detected channels',()=> {
  const s=twitchStatus({login:'viewer',assistindo:true,pct:15,pctAtual:17.5,emLives:2,assistindoEm:['Matta','Outro'],lives:[{login:'matta',nome:'Matta'}],oficiais:[{login:'matta',bonus:true}]},true);
  assert.equal(s.active,true);assert.equal(s.percent,17.5);assert.equal(s.count,2);
  assert.equal(s.lives[0].bonus,true);assert.equal(s.lives[0].watching,true);
  assert.match(twitchFeedback(s),/17,5% XP/);
});
test('an open bonus-enabled stream does not imply that the player has the bonus',()=> {
  const s=twitchStatus({login:'viewer',assistindo:false,pct:15,pctAtual:20,lives:[{login:'matta',bonus:true}]},true);
  assert.equal(s.active,false);assert.equal(s.percent,null);assert.match(twitchFeedback(s),/INATIVO/);
});
test('unknown, unlinked, stale and invalid stream names are handled',()=> {
  assert.equal(twitchStatus(null,true).known,false);
  const s=twitchStatus({assistindo:true,lives:[{login:'evil & calc.exe',bonus:true},{login:'https://elsewhere/',bonus:true}]},false);
  assert.equal(s.active,false);assert.equal(s.lives.length,0);assert.match(twitchFeedback(s),/não vinculada/);
  assert.match(twitchFeedback(twitchStatus({login:'viewer',assistindo:true,pct:15},false)),/última leitura/);
});
test('unknown eligibility does not offer auto-opening and duplicate live entries are removed',()=> {
  const s=twitchStatus({login:'viewer',lives:[{login:'matta'},{login:'matta',bonus:true},{login:'outro',bonus:false}]},true);
  assert.equal(s.lives.length,2);assert.equal(s.lives.filter(l=>l.bonus).length,0);
});
