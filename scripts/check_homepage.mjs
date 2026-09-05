import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {newGame, flip, stepGame, encodeWav, ROUND, STEPS} from '../exhibition.mjs';

// Play a real round through the same physics used by pointer and Space input.
function play(tap) {
  const game=newGame(.38);
  flip(game);
  let bonusCount=0;
  for(let frame=0;frame<ROUND*120;frame++) {
    if(tap && frame%31===0)flip(game);
    stepGame(game,1/120);
    bonusCount+=game.events.filter(event=>event.type==='bonus').length;
    game.events=[];
    assert.ok(game.balls.length<=2);
    for(const ball of game.balls)assert.ok([ball.x,ball.y,ball.vx,ball.vy].every(Number.isFinite));
  }
  assert.equal(game.mode,'finished');
  assert.equal(game.time,ROUND);
  assert.ok(game.hits>0 && game.score>=game.hits*10);
  assert.ok(game.pattern.every(track=>track.length===STEPS && track.some(Boolean)));
  assert.ok(bonusCount<=1,'The additional ball is awarded once per round');
  assert.equal(flip(game),false);
  return game;
}
const played=play(true), idle=play(false);
assert.notDeepEqual(played.pattern,idle.pattern,'The player must change the resulting music');
const paused=newGame(.2);flip(paused);paused.mode='paused';
const snapshot=JSON.stringify(paused);stepGame(paused,3);
assert.equal(JSON.stringify(paused),snapshot,'Pausing must preserve the clock, ball and song');
const wav=encodeWav({numberOfChannels:2,sampleRate:44100,length:2,getChannelData:channel=>new Float32Array(channel?[.5,-.5]:[1,-1])});
const bytes=new DataView(wav);
assert.equal(Buffer.from(wav).subarray(0,4).toString(),'RIFF');
assert.equal(bytes.getUint32(40,true),8);
assert.equal(bytes.getUint16(22,true),2);
assert.equal(bytes.getInt16(44,true),32767);
assert.equal(bytes.getInt16(48,true),-32768);

const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
for(const [,href] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(href.startsWith('#')) assert.ok(html.includes(`id="${href.slice(1)}"`),`Missing section: ${href}`);
  else if(!/^(https?:|mailto:)/.test(href)) assert.ok(existsSync(fileURLToPath(new URL(href.split('?')[0],root))),`Missing file: ${href}`);
}
const giga=html.match(/<article class="work" id="giga-bancho">([\s\S]*?)<\/article>/)[1];
assert.ok(giga.includes('jp.beyth.yokeinaosewifi'));
assert.ok(!giga.includes('apps.apple.com'), 'Giga Bancho is currently released only on Android');
assert.equal((html.match(/class="project-link"/g)||[]).length,3);
console.log('Homepage: a full musical pinball round, player influence, pause, WAV, internal links and Android-only Giga OK.');
