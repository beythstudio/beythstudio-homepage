import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {releaseGesture} from '../exhibition.mjs';

// A cancelled touch (vertical scrolling / lost capture) must not fire a pluck.
assert.deepEqual(releaseGesture({x:0,y:0},{x:1,y:0},true),{energy:0,changeShape:false});
assert.deepEqual(releaseGesture(null,{x:1,y:0}),{energy:0,changeShape:false});
assert.equal(releaseGesture({x:0,y:0},{x:.02,y:0}).changeShape,false);
const drag=releaseGesture({x:0,y:0},{x:.5,y:.2});
assert.ok(drag.energy>0 && drag.energy<=1 && drag.changeShape);
assert.equal(releaseGesture({x:0,y:0},{x:8,y:9}).energy,1);

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
console.log('Homepage: release/cancel behavior, internal links, and 3 published works OK.');
