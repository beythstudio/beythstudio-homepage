import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {newGame, flip, flippers, stepGame, addNote, encodeWav, ROUND, STEPS} from '../exhibition.mjs';

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
  assert.ok(game.pattern.every(track=>track.length===STEPS && track.some(cell=>cell.length)));
  assert.ok(bonusCount<=1,'The additional ball is awarded once per round');
  assert.equal(flip(game),false);
  return game;
}
const played=play(true), idle=play(false);
assert.notDeepEqual(played.pattern,idle.pattern,'The player must change the resulting music');
// A strike records its actual voice once, without manufacturing a backing beat.
const song=newGame(.2);
for(let track=0;track<3;track++) {
  const recorded=addNote(song,track,.4,550);
  assert.deepEqual(song.pattern[track].flat(),[recorded.note]);
}
const paused=newGame(.2);flip(paused);paused.mode='paused';
const snapshot=JSON.stringify(paused);stepGame(paused,3);
assert.equal(JSON.stringify(paused),snapshot,'Pausing must preserve the clock, ball and song');
// A ball arriving just over 200 ms after a tap should still get a clean lift.
const catchGame=newGame(.2);flip(catchGame);catchGame.time=.21;
const left=flippers(catchGame)[0];
catchGame.balls=[{...catchGame.balls[0],x:(left.x+left.tx)/2,y:(left.y+left.ty)/2-16,vx:0,vy:220}];
stepGame(catchGame,1/120);
assert.ok(catchGame.balls[0].vy<0,'The generous window must actually return the ball upwards');
assert.ok(catchGame.events.some(event=>event.type==='surface' && event.surface===5 && event.powered));
const rightGame=newGame(.2);flip(rightGame);rightGame.time=.21;
const right=flippers(rightGame)[1];
rightGame.balls=[{...rightGame.balls[0],x:(right.x+right.tx)/2,y:(right.y+right.ty)/2-16,vx:0,vy:220}];
stepGame(rightGame,1/120);
const chime=rightGame.events.find(event=>event.type==='surface' && event.surface===6);
assert.ok(chime?.powered && chime.note.echo);
assert.ok(rightGame.balls[0].vy<0 && rightGame.balls[0].vy>catchGame.balls[0].vy,'The right paddle has a different, gentler arc');
// The five wall faces each produce one contact voice and their intended effect.
const wallContacts=[
  {x:79,y:250,vx:-300,vy:100}, {x:280,y:58,vy:-250,vx:0},
  {x:479,y:250,vx:300,vy:100}, {x:130,y:497,vx:0,vy:260}, {x:430,y:497,vx:0,vy:260}
];
wallContacts.forEach((position,surface)=>{
  const game=newGame(.2);flip(game);game.events=[];
  game.balls=[{...game.balls[0],...position}];
  stepGame(game,1/120);
  const impacts=game.events.filter(event=>event.type==='surface');
  assert.equal(impacts.length,1,`One wall impact for surface ${surface}`);
  assert.equal(impacts[0].surface,surface);
  assert.ok(game.pattern[impacts[0].track].flat().includes(impacts[0].note));
  if(surface===0)assert.ok(game.balls[0].vy<0 && game.balls[0].vx>0,'BOOST returns the ball up into the table');
  if(surface===1)assert.equal(game.balls[0].octave,12);
  if(surface===2)assert.equal(impacts[0].note.echo,true);
});
// Physical re-entry is audible even inside the old 180 ms cutoff.
const rapid=newGame(.2);flip(rapid);rapid.events=[];
function bumperContact(vx) {
  const bumper=rapid.bumpers[0];
  rapid.balls=[{...rapid.balls[0],x:bumper.x+52,y:bumper.y,vx,vy:0}];
  stepGame(rapid,1/120);
}
bumperContact(-300);bumperContact(-300);
assert.equal(rapid.events.filter(event=>event.type==='hit').length,2);
bumperContact(300);
assert.equal(rapid.events.filter(event=>event.type==='hit').length,2,'A separating overlap must not create a phantom note');
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
console.log('Homepage: musical round, real hit notes, five wall faces, both paddles, quick re-entry, pause, WAV and site links OK.');
