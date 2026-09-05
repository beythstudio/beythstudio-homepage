const TAU = Math.PI * 2;
export const STEP = 60 / 96 / 2;
export const STEPS = 32;
export const ROUND = 30;
const W = 560, H = 590, R = 10;
const FLIPPER_Y = 532, FLIPPER_REACH = 106;
const VIEW_X = 35, VIEW_Y = 22, VIEW_WIDTH = 490, VIEW_HEIGHT = H - VIEW_Y;
const GOLD = '#c6a565';
const COLORS = ['#e58b9f', '#b5d889', '#78c8d8'];
const NOTES = [62, 65, 67, 69, 72, 74, 77];
const BUMPERS = [{x:183,y:177}, {x:370,y:183}, {x:275,y:305}];
const SURFACES = [
  {name:'BOOST',color:'#f4b56f'}, {name:'SHIFT',color:'#c3a0ee'},
  {name:'ECHO',color:'#8adbd4'}, {name:'KICK',color:'#f4b56f'}, {name:'SNAP',color:'#8adbd4'},
  {name:'PUNCH',color:'#f4b56f'}, {name:'CHIME',color:'#8adbd4'}
];
const RAILS = [
  [80,470,63,152], [63,152,94,87], [94,87,161,46], [161,46,400,46],
  [400,46,466,87], [466,87,497,152], [497,152,480,470],
  [80,470,161,FLIPPER_Y], [480,470,399,FLIPPER_Y],
  [94,430,149,481], [149,481,113,481], [113,481,94,430],
  [466,430,411,481], [411,481,447,481], [447,481,466,430]
];
const RAIL_SURFACES = [0,0,0,1,2,2,2,3,4,3,3,3,4,4,4];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function newGame(seed = Math.random()) {
  return {
    mode:'ready', time:0, score:0, hits:0, notes:0, combo:0, bestCombo:0, lastHit:-10,
    lastFlip:-10, flip:0, balls:[], bumpers:BUMPERS.map(p=>({...p, radius:43, flash:0, hop:0})),
    pattern:Array.from({length:3},()=>Array.from({length:STEPS},()=>[])),
    surfaces:SURFACES.map(()=>({flash:0})),
    seed, launches:0, bonus:false, events:[], message:'', messageUntil:0
  };
}

function launch(game, extra = false) {
  // Deterministic per-round serves; player timing supplies the other variation.
  const angle = Math.sin(game.seed * 71 + game.launches++ * 2.39);
  game.balls.push({x:extra?110:450,y:335,vx:extra?120+angle*65:-150-angle*85,vy:-780,trail:[],octave:0,charge:0,color:GOLD});
  game.events.push({type:extra?'bonus':'serve', x:extra?110:450,y:335});
}

export function flip(game) {
  if (game.mode === 'ready') {game.mode='playing'; launch(game);}
  if (game.mode !== 'playing' || game.time - game.lastFlip < .2) return false;
  game.lastFlip=game.time;
  return true;
}

function recordNote(game, track, note, source) {
  const beat=Math.round(game.time/STEP), step=beat%STEPS;
  const recorded={...note,source,firstLoop:beat+STEPS};
  const cell=game.pattern[track][step];
  const previous=cell.findIndex(item=>item.source===source);
  if(previous<0)cell.push(recorded);else cell[previous]=recorded;
  game.notes++;
  return {step,note:recorded};
}

export function addNote(game, track, position, speed, octave=0) {
  const pitch = NOTES[Math.floor(clamp(position, 0, .999) * NOTES.length)];
  const value=track===0?[38,45,48][Math.floor(clamp(speed/850,0,.999)*3)]+octave:
    track===1?pitch+octave:position<.5?0:1;
  return recordNote(game,track,{note:value,velocity:.9},`app-${track}`);
}

function hit(game, index, ball, nx, ny) {
  const bumper = game.bumpers[index];
  const speed = Math.hypot(ball.vx,ball.vy);
  ball.vx=nx*clamp(speed*.9+170,420,760);
  ball.vy=ny*clamp(speed*.9+170,420,760)-55;
  game.combo=game.time-game.lastHit<2.6 ? game.combo+1 : 1;
  game.lastHit=game.time;
  game.hits++;
  game.bestCombo=Math.max(game.bestCombo,game.combo);
  const points=10*Math.min(game.combo,8);
  game.score+=points;
  bumper.flash=1;
  bumper.hop=1;
  const recorded=addNote(game,index,(Math.atan2(ny,nx)+Math.PI)/TAU,speed,ball.octave);
  game.events.push({type:'hit',track:index,x:ball.x,y:ball.y,points,nx,ny,...recorded});
  if (!game.bonus && game.combo>=4) {
    game.bonus=true;
    launch(game,true);
    game.message='MULTIBALL'; game.messageUntil=game.time+2;
  }
}

function surfaceHit(game, surface, ball, collision, powered=false) {
  const strength=clamp(collision.impact/550,.35,1);
  let track=1, note={note:74,velocity:.72,sound:'bell'};
  if(surface===0) {
    ball.vx=clamp(Math.abs(ball.vx)+60,190,360);
    ball.vy=-clamp(Math.abs(ball.vy)*.7+190,320,640);
    track=0;note={note:43,velocity:.78,sound:'rise'};
  } else if(surface===1) {
    ball.octave=ball.octave?0:12;
    note.note=62+ball.octave;
  } else if(surface===2) {
    note.note=NOTES[Math.floor(clamp(ball.y/H,0,.999)*NOTES.length)]+12;
    note.echo=true;
  } else if(surface===3 || surface===4) {
    track=2;note={note:surface===3?0:1,velocity:.62};
  } else if(surface===5) {
    track=0;note={note:38+(powered?12:0),velocity:powered?.9:.48};
  } else {
    note={note:NOTES[Math.floor(collision.along*(NOTES.length-1))]+12,velocity:powered?.85:.5,sound:'bell',echo:true};
  }
  note.pan=clamp((ball.x-W/2)/(W/2),-.75,.75);
  game.surfaces[surface].flash=1;
  ball.charge=.8;ball.color=SURFACES[surface].color;
  const recorded=recordNote(game,track,note,`surface-${surface}`);
  game.events.push({type:'surface',surface,track,x:ball.x,y:ball.y,nx:collision.nx,ny:collision.ny,strength,powered,...recorded});
}

export function flippers(game) {
  const age=game.time-game.lastFlip;
  const lift = age < 0 ? 0 : age < .065 ? age/.065 : age < .205 ? 1 : clamp(1-(age-.205)/.14,0,1);
  game.flip=lift;
  const angle=.38-lift*.83;
  return [
    {x:161,y:FLIPPER_Y,tx:161+FLIPPER_REACH*Math.cos(angle),ty:FLIPPER_Y+FLIPPER_REACH*Math.sin(angle),side:1},
    {x:399,y:FLIPPER_Y,tx:399-FLIPPER_REACH*Math.cos(angle),ty:FLIPPER_Y+FLIPPER_REACH*Math.sin(angle),side:-1}
  ];
}

function segmentCollision(ball, ax, ay, bx, by, radius, bounce) {
  const dx=bx-ax, dy=by-ay;
  const along=clamp(((ball.x-ax)*dx+(ball.y-ay)*dy)/(dx*dx+dy*dy),0,1);
  const px=ax+dx*along, py=ay+dy*along;
  const distance=Math.hypot(ball.x-px,ball.y-py);
  if (distance>=radius) return null;
  const nx=distance>.001?(ball.x-px)/distance:0;
  const ny=distance>.001?(ball.y-py)/distance:-1;
  ball.x=px+nx*(radius+.15); ball.y=py+ny*(radius+.15);
  const dot=ball.vx*nx+ball.vy*ny;
  if (dot<0) {ball.vx-=(1+bounce)*dot*nx; ball.vy-=(1+bounce)*dot*ny;}
  return {along,nx,ny,impact:Math.max(0,-dot)};
}

export function stepGame(game, delta) {
  if (game.mode!=='playing') return;
  const steps=Math.ceil(delta/(1/120));
  const dt=delta/steps;
  for(let s=0;s<steps;s++) {
    game.time=Math.min(ROUND,game.time+dt);
    const paddles=flippers(game);
    game.surfaces.forEach(surface=>surface.flash=Math.max(0,surface.flash-dt*2.5));
    game.bumpers.forEach((bumper,i)=>{
      bumper.flash=Math.max(0,bumper.flash-dt*3);
      bumper.hop=Math.max(0,bumper.hop-dt*2.4);
      bumper.x=BUMPERS[i].x+Math.sin((1-bumper.hop)*TAU)*bumper.hop*13;
      bumper.y=BUMPERS[i].y-Math.sin(bumper.hop*Math.PI)*18;
    });
    for(const ball of [...game.balls]) {
      ball.charge=Math.max(0,ball.charge-dt);
      ball.vy+=620*dt;
      ball.x+=ball.vx*dt; ball.y+=ball.vy*dt;
      // A new incoming impact makes a sound; separating overlaps do not retrigger it.
      const touched=new Set();
      RAILS.forEach(([ax,ay,bx,by],index)=>{
        const collision=segmentCollision(ball,ax,ay,bx,by,R+2,.91);
        const surface=RAIL_SURFACES[index];
        if(collision?.impact>0 && !touched.has(surface)) {
          touched.add(surface);surfaceHit(game,surface,ball,collision);
        }
      });
      for(const paddle of paddles) {
        const collision=segmentCollision(ball,paddle.x,paddle.y,paddle.tx,paddle.ty,R+7,.64);
        if(collision?.impact>0) {
          const powered=collision.ny<.3 && game.time-game.lastFlip<.24;
          if(powered) {
            ball.vy=-(paddle.side===1?680:625)-collision.along*110;
            ball.vx=paddle.side*((paddle.side===1?145:190)+collision.along*260);
          }
          surfaceHit(game,paddle.side===1?5:6,ball,collision,powered);
        }
      }
      game.bumpers.forEach((bumper,i)=>{
        const dx=ball.x-bumper.x, dy=ball.y-bumper.y, distance=Math.hypot(dx,dy);
        if(distance<bumper.radius+R) {
          const nx=distance>.001?dx/distance:0, ny=distance>.001?dy/distance:-1;
          ball.x=bumper.x+nx*(bumper.radius+R+.5);
          ball.y=bumper.y+ny*(bumper.radius+R+.5);
          if(ball.vx*nx+ball.vy*ny<0) hit(game,i,ball,nx,ny);
        }
      });
      const speed=Math.hypot(ball.vx,ball.vy);
      if(speed>880) {ball.vx*=880/speed; ball.vy*=880/speed;}
    }
    const lost=game.balls.filter(ball=>ball.y>H+25 || ball.x<0 || ball.x>W);
    if(lost.length) {
      game.balls=game.balls.filter(ball=>!lost.includes(ball));
      game.combo=0;
      game.events.push({type:'drain'});
      if(!game.balls.length && game.time<ROUND) {
        launch(game);
      }
    }
    if(game.time-game.lastHit>2.6) game.combo=0;
    if(game.time>=ROUND-1e-8) {
      game.time=ROUND;
      game.mode='finished'; game.events.push({type:'finish'}); break;
    }
  }
}

function makeNoise(context) {
  const buffer=context.createBuffer(1,context.sampleRate*.25,context.sampleRate);
  const data=buffer.getChannelData(0);
  let seed=91237;
  for(let i=0;i<data.length;i++) {seed=(Math.imul(seed,1664525)+1013904223)>>>0; data[i]=seed/2147483648-1;}
  return buffer;
}

function instrument(context, destination, noise, track, note, when, scale=1) {
  const gain=context.createGain();
  const panner=context.createStereoPanner();
  panner.pan.value=note.pan??[-.22,.25,0][track];
  gain.connect(panner).connect(destination);
  const sources=[], nodes=[gain,panner];
  const duration=track===0?.48:track===1?(note.sound==='bell'?.85:1.1):note.note===0?.28:.16;
  const peak=track===0?.21:track===1?.19:.28;
  const frequency=track===2?(note.note===0?165:190):440*2**((note.note-69)/12);
  function tone(frequency, level, type, endFrequency) {
    const source=context.createOscillator(), partial=context.createGain();
    source.type=type;source.frequency.setValueAtTime(frequency,when);
    if(endFrequency)source.frequency.exponentialRampToValueAtTime(endFrequency,when+Math.min(.16,duration));
    partial.gain.value=level;source.connect(partial).connect(gain);
    sources.push(source);nodes.push(partial);
  }
  tone(frequency,1,track===1?'sine':'triangle',track===2?52:note.sound==='rise'?frequency*2:0);
  if(track!==2)tone(frequency*2,.22,track===0?'sine':'triangle');
  if(track===2 && note.note===1) {
    const source=context.createBufferSource(), filter=context.createBiquadFilter();
    source.buffer=noise;filter.type='highpass';filter.frequency.value=1100;
    source.connect(filter).connect(gain);sources.push(source);nodes.push(filter);
  }
  gain.gain.setValueAtTime(.00001,when);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*note.velocity*scale),when+.003);
  gain.gain.exponentialRampToValueAtTime(.00001,when+duration);
  let remaining=sources.length;
  sources.forEach(source=>{
    source.start(when);source.stop(when+duration+.02);
    source.onended=()=>{source.disconnect();if(--remaining===0)nodes.forEach(node=>node.disconnect());};
  });
  if(note.echo)for(let i=1;i<=2;i++)sources.push(...instrument(context,destination,noise,track,{...note,echo:false},when+i*.14,scale*(i===1?.34:.14)));
  return sources;
}

function audioOutput(context) {
  const compressor=context.createDynamicsCompressor();
  compressor.threshold.value=-12;compressor.knee.value=18;compressor.ratio.value=5;
  compressor.attack.value=.003;compressor.release.value=.15;
  compressor.connect(context.destination);
  return compressor;
}

export function encodeWav(buffer) {
  const channels=buffer.numberOfChannels, samples=buffer.length;
  const bytes=new ArrayBuffer(44+samples*channels*2), view=new DataView(bytes);
  const word=(offset,text)=>{for(let i=0;i<text.length;i++) view.setUint8(offset+i,text.charCodeAt(i));};
  word(0,'RIFF'); view.setUint32(4,bytes.byteLength-8,true); word(8,'WAVE'); word(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true);
  view.setUint32(24,buffer.sampleRate,true); view.setUint32(28,buffer.sampleRate*channels*2,true);
  view.setUint16(32,channels*2,true); view.setUint16(34,16,true); word(36,'data');
  view.setUint32(40,samples*channels*2,true);
  const data=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  for(let i=0;i<samples;i++) for(let ch=0;ch<channels;ch++) {
    const value=clamp(data[ch][i],-1,1);
    view.setInt16(44+(i*channels+ch)*2,Math.round(value*(value<0?32768:32767)),true);
  }
  return bytes;
}

export async function renderSong(pattern, OfflineContext=OfflineAudioContext) {
  const context=new OfflineContext(2,Math.ceil((STEPS*STEP*2+1.6)*44100),44100);
  const noise=makeNoise(context), output=audioOutput(context);
  for(let bar=0;bar<2;bar++) for(let step=0;step<STEPS;step++) {
    pattern.forEach((track,i)=>{
      track[step].forEach(note=>instrument(context,output,noise,i,note,.025+(bar*STEPS+step)*STEP,.78));
    });
  }
  return encodeWav(await context.startRendering());
}

async function startExhibition() {
  const root=document.querySelector('.pinball');
  const canvas=root.querySelector('canvas');
  let ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx) throw new Error('Canvas 2D is unavailable');
  const action=root.querySelector('.flip-button');
  const pause=root.querySelector('.pause-button');
  const sound=root.querySelector('.sound-button');
  const overlay=root.querySelector('.board-overlay');
  const result=root.querySelector('.round-result');
  const status=root.querySelector('#play-status');
  const timer=root.querySelector('.time-value'), score=root.querySelector('.score-value');
  const combo=root.querySelector('.combo-value');
  const listen=root.querySelector('.listen-button'), save=root.querySelector('.save-button');
  const download=root.querySelector('.download-link');
  const message=root.querySelector('.game-message');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let game=newGame(), visible=true, frame=0, last=0, visualTime=0;
  let audio, output, noise, muted=false, playingSong=false, audioTimer, audioEpoch=0, nextStep=0, starting=false;
  let exportUrl, pauseMode='playing', sparks=[], bursts=[], labels=[], previousStep=-1;
  let songSteps=Infinity;
  let pendingSuspend=Promise.resolve();
  let backdrop, view={width:0,height:0,ratio:1,scale:1,x:0,y:0};
  const glows=new Map(), streaks=new Map(), icons=[];
  const voices=new Set();
  ['icon.png','assets/rhyme-tree-icon-1024.png','assets/giga-bancho-icon.png'].forEach((src,index)=>{
    const image=new Image();
    image.addEventListener('load',()=>{
      const icon=document.createElement('canvas');icon.width=icon.height=192;
      const pen=icon.getContext('2d');pen.beginPath();pen.arc(96,96,96,0,TAU);pen.clip();
      pen.drawImage(image,0,0,192,192);icons[index]=icon;draw();
    });
    image.src=src;
  });
  const dots=game.pattern.map((track,index)=>{
    const line=document.createElement('div'); line.className='sequence-line';
    const name=document.createElement('span'); name.textContent=['ベース','メロディー','ビート'][index];
    line.append(name);
    const cells=track.map(()=>{const cell=document.createElement('i');line.append(cell);return cell;});
    root.querySelector('.sequence').append(line); return cells;
  });

  function announce(text) {status.textContent=text;}
  function setText(element,text) {if(element.textContent!==text)element.textContent=text;}
  function sequence(current=-1) {
    game.pattern.forEach((track,i)=>track.forEach((note,j)=>{
      dots[i][j].classList.toggle('on',note.length>0);
      dots[i][j].classList.toggle('current',j===current);
    }));
    previousStep=current;
  }
  function update() {
    if(root.dataset.mode!==game.mode)root.dataset.mode=game.mode;
    setText(score,String(game.score).padStart(3,'0'));
    setText(timer,`00:${String(Math.ceil(ROUND-game.time)).padStart(2,'0')}`);
    setText(combo,game.combo>1?`${game.combo} COMBO`:'');
    const disabled=game.mode==='finished' || starting;
    if(action.disabled!==disabled)action.disabled=disabled;
    const title=starting?'準備中…':game.mode==='ready'?'START ↗':game.mode==='paused'?'RESUME ▷':'弾く';
    if(action.textContent!==title) {action.textContent=title;action.setAttribute('aria-label',title);}
    if(pause.hidden!==(game.mode!=='playing'))pause.hidden=game.mode!=='playing';
    if(overlay.hidden!==(game.mode!=='paused'))overlay.hidden=game.mode!=='paused';
    const soundTitle=muted?'音 OFF':'音 ON';
    if(sound.textContent!==soundTitle) {
      sound.textContent=soundTitle;
      sound.setAttribute('aria-label',muted?'音を入れる':'音を消す');
      sound.setAttribute('aria-pressed',String(!muted));
    }
    setText(listen,playingSong?'停止 Ⅱ':'再生 ▷');
    setText(message,game.messageUntil>game.time?game.message:'');
  }
  async function enableAudio() {
    if(muted) return false;
    try {
      if(!audio) {audio=new AudioContext({latencyHint:'interactive'});noise=makeNoise(audio);output=audioOutput(audio);}
      await pendingSuspend;
      if(muted)return false;
      await audio.resume(); return audio.state==='running';
    } catch {
      muted=true; announce('音を再生できませんでした。遊んでできた曲は、終了後に保存できます。'); update(); return false;
    }
  }
  function voice(track,note,when,scale=1) {
    instrument(audio,output,noise,track,note,when,scale).forEach(source=>{
      voices.add(source);
      source.addEventListener('ended',()=>voices.delete(source),{once:true});
    });
  }
  function stopAudio() {
    clearInterval(audioTimer); audioTimer=null;
    for(const source of voices)source.stop();
    voices.clear();
    if(audio?.state==='running') pendingSuspend=audio.suspend().catch(()=>{});
  }
  function runAudio() {
    clearInterval(audioTimer);
    if(muted || !audio || audio.state!=='running') return;
    const start=playingSong?0:game.time;
    audioEpoch=audio.currentTime+.04-start;
    nextStep=Math.ceil(start/STEP);
    function tick() {
      if(playingSong && audio.currentTime>audioEpoch+songSteps*STEP+1.5) {
        playingSong=false;stopAudio();update();sequence();draw();return;
      }
      while(nextStep<songSteps && audioEpoch+nextStep*STEP<audio.currentTime+.1) {
        const when=audioEpoch+nextStep*STEP;
        if(when>=audio.currentTime) game.pattern.forEach((track,index)=>{
          track[nextStep%STEPS].forEach(note=>{
            // The first sound belongs to the impact; the quiet repeat begins one loop later.
            if(playingSong || nextStep>=note.firstLoop)voice(index,note,when,playingSong?.78:.28);
          });
        });
        nextStep++;
      }
    }
    tick(); audioTimer=setInterval(tick,25);
  }
  function feedback(event) {
    if(event.type==='hit' || event.type==='surface') {
      if(!muted && audio?.state==='running')voice(event.track,event.note,audio.currentTime+.003);
      sequence(Math.floor(game.time/STEP)%STEPS);
    }
    if(event.type==='hit') {
      if(!motion.matches) {
        const bumper=game.bumpers[event.track];
        bursts.push({x:bumper.x,y:bumper.y,track:event.track,life:.85,total:.85,strength:Math.min(1.6,1+game.combo*.045)});
        const direction=Math.atan2(event.ny,event.nx);
        for(let i=0;i<30;i++) {
          const signature=i>=22;
          const angle=signature?i/8*TAU+direction:direction+(Math.random()-.5)*3.6;
          const speed=signature?80+Math.random()*85:90+Math.random()*260;
          const life=signature?.9+Math.random()*.35:.35+Math.random()*.4;
          sparks.push({x:signature?bumper.x+Math.cos(angle)*48:event.x,y:signature?bumper.y+Math.sin(angle)*48:event.y,
            vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-(signature?40:0),
            life,total:life,color:COLORS[event.track],kind:signature?event.track:-1,
            size:signature?7+Math.random()*6:1+Math.random(),angle,spin:(Math.random()-.5)*3,glyph:i%2===0?'leaf':'aiueo'[i%5]});
        }
      }
      labels.push({x:event.x,y:event.y-35,text:`+${event.points}`,life:1,color:COLORS[event.track]});
      if(game.hits===1) announce('最初の音が入りました。ヒットを重ねると曲が育ちます。');
    }
    if(event.type==='surface') {
      const surface=SURFACES[event.surface];
      const text=event.surface===1?(event.note.note===74?'+1 OCT':'BASE'):surface.name;
      labels.push({x:clamp(event.x,118,W-118),y:clamp(event.y-24,73,490),text,life:.65,color:surface.color,small:true});
      if(!motion.matches) {
        bursts.push({x:event.x,y:event.y,surface:event.surface,color:surface.color,life:.55,total:.55,strength:event.strength,nx:event.nx,ny:event.ny});
        for(let i=0;i<12;i++) {
          const angle=Math.atan2(event.ny,event.nx)+(Math.random()-.5)*2.6;
          const speed=90+Math.random()*180, life=.3+Math.random()*.25;
          sparks.push({x:event.x,y:event.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,total:life,color:surface.color,kind:-1,size:1.3,angle,spin:0});
        }
      }
    }
    // Keep multi-ball impacts readable on a phone.
    if(sparks.length>300)sparks.splice(0,sparks.length-300);
    if(bursts.length>16)bursts.splice(0,bursts.length-16);
    if(labels.length>12)labels.splice(0,labels.length-12);
    if(event.type==='bonus') {
      announce('4連続ヒット。番長がもう1球、追加しました。');
    }
    if(event.type==='finish') finish();
  }
  function finish() {
    stopAudio(); playingSong=false;
    result.hidden=false;
    root.querySelector('.result-title').textContent=String(game.score).padStart(3,'0');
    root.querySelector('.result-stats').textContent=`${game.notes} NOTES · BEST ${game.bestCombo} COMBO`;
    listen.hidden=save.hidden=!game.notes;download.hidden=true;
    if(game.notes)prepareSong(game);
    announce(game.notes?`終了。${game.notes}回のヒットからできた曲を、再生・保存できます。`:'終了。もう一回遊べます。');
    action.hidden=true; update(); sequence();
    if(game.notes && !muted) {
      const completed=game;
      enableAudio().then(enabled=>{
        if(enabled && game===completed && game.mode==='finished' && visible && !document.hidden) {
          playingSong=true;songSteps=STEPS;runAudio();update();schedule();
        }
      });
    }
    if(root.contains(document.activeElement)) root.querySelector('.replay-button').focus({preventScroll:true});
  }
  async function play() {
    if(game.mode==='finished' || starting) return;
    if(game.mode==='ready' || game.mode==='paused') {
      starting=true;update();
      await enableAudio();
      starting=false;
      if(document.hidden || !visible){update();return;}
      songSteps=Infinity;
      if(game.mode==='ready') {flip(game); announce('スタート。球が下に来たらタップかスペースで弾いてください。');}
      else game.mode=pauseMode;
      last=performance.now(); update();
      const bounds=root.getBoundingClientRect();
      if(bounds.top<0 || bounds.bottom>innerHeight) root.scrollIntoView({block:'center',behavior:motion.matches?'instant':'smooth'});
      schedule();
      if(game.mode==='playing') runAudio();
    } else flip(game);
    update(); schedule();
  }
  function pauseGame() {
    if(game.mode==='playing') {
      pauseMode=game.mode; game.mode='paused';
      game.lastFlip=-10; stopAudio(); update(); draw(); announce('一時停止しました。');
    }
    if(playingSong) {playingSong=false;stopAudio();update();sequence();}
  }
  action.addEventListener('pointerdown',event=>{
    if(game.mode==='playing' && event.isPrimary && event.button===0) {flip(game);update();schedule();}
  });
  action.addEventListener('keydown',event=>{
    if(event.code==='Space' && game.mode==='playing') {event.preventDefault();if(!event.repeat)play();}
  });
  action.addEventListener('click',event=>{if(event.detail===0 || game.mode!=='playing')play();});
  pause.addEventListener('click',()=>{pauseGame();action.focus({preventScroll:true});});
  canvas.addEventListener('pointerdown',event=>{
    if(event.isPrimary && event.button===0 && game.mode==='playing') {flip(game);update();schedule();}
  });
  document.addEventListener('keydown',event=>{
    if(event.code!=='Space' || event.altKey || event.ctrlKey || event.metaKey || !visible) return;
    if(event.target.closest('a,button,input,textarea,select,[contenteditable]')) return;
    if(game.mode==='playing') {event.preventDefault();if(!event.repeat) flip(game);}
  });
  root.querySelector('.replay-button').addEventListener('click',()=>{
    stopAudio();playingSong=false; game=newGame(); sparks=[];bursts=[];labels=[];
    result.hidden=true;action.hidden=false;action.disabled=false;
    if(exportUrl) {URL.revokeObjectURL(exportUrl);exportUrl=null;}
    save.textContent='保存 ↓';download.hidden=true;
    sequence();play();action.focus({preventScroll:true});
  });
  sound.addEventListener('click',async()=>{
    muted=!muted;
    update();
    if(muted) stopAudio();
    else {await enableAudio();if(game.mode==='playing'||playingSong)runAudio();}
  });
  listen.addEventListener('click',async()=>{
    playingSong=!playingSong;
    if(playingSong) {
      muted=false; update();
      if(await enableAudio()) {songSteps=Infinity;runAudio();last=performance.now();schedule();}
      else playingSong=false;
    } else {stopAudio();sequence();}
    update();draw();
  });
  // Render at the end of the round so Save remains a direct user gesture.
  async function prepareSong(round) {
    save.hidden=false;download.hidden=true;
    save.disabled=true;save.textContent='書き出し中…';
    try {
      const wav=await renderSong(round.pattern);
      if(round!==game)return;
      if(exportUrl)URL.revokeObjectURL(exportUrl);
      exportUrl=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
      download.href=exportUrl;download.download=`beyth-play-${round.score}-${Date.now()}.wav`;
      download.hidden=false;save.hidden=true;
    } catch(error) {
      if(round!==game)return;
      announce('曲を書き出せませんでした。保存ボタンでもう一度試せます。');
      save.textContent='再試行 ↻';
      console.error('Song export:',error);
    } finally {if(round===game)save.disabled=false;}
  }
  save.addEventListener('click',()=>{if(game.notes)prepareSong(game);});
  download.addEventListener('click',()=>announce('保存を開始しました。ダウンロード先を確認してください。'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();else{last=performance.now();schedule();}});
  window.addEventListener('pagehide',()=>{pauseGame();if(exportUrl)URL.revokeObjectURL(exportUrl);});
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(!visible) {pauseGame();cancelAnimationFrame(frame);frame=0;}
    else {last=performance.now();schedule();}
  },{threshold:0}).observe(root);
  new ResizeObserver(([entry])=>resize(entry.contentRect.width,entry.contentRect.height)).observe(canvas);
  document.fonts.ready.then(()=>{if(view.width){bakeBackdrop();draw();}});
  motion.addEventListener('change',()=>{last=performance.now();schedule();draw();});

  function line(points,color,width=1,rounded=false) {
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++) {
      const point=points[i];
      if(rounded && i<points.length-1) {
        const before=points[i-1], after=points[i+1];
        const lengthIn=Math.hypot(point[0]-before[0],point[1]-before[1]);
        const lengthOut=Math.hypot(after[0]-point[0],after[1]-point[1]);
        const corner=Math.min(22,lengthIn*.3,lengthOut*.3);
        ctx.lineTo(point[0]+(before[0]-point[0])*corner/lengthIn,point[1]+(before[1]-point[1])*corner/lengthIn);
        ctx.quadraticCurveTo(...point,point[0]+(after[0]-point[0])*corner/lengthOut,point[1]+(after[1]-point[1])*corner/lengthOut);
      } else ctx.lineTo(...point);
    }
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }
  function circle(x,y,r,color,width=1,fill=false) {
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);
    if(fill){ctx.fillStyle=color;ctx.fill();} else{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  }
  function glow(x,y,r,color,opacity=1) {
    if(!glows.has(color)) {
      const texture=document.createElement('canvas');texture.width=texture.height=128;
      const pen=texture.getContext('2d'), gradient=pen.createRadialGradient(64,64,0,64,64,64);
      gradient.addColorStop(0,color+'60');gradient.addColorStop(.4,color+'30');gradient.addColorStop(1,color+'00');
      pen.fillStyle=gradient;pen.fillRect(0,0,128,128);glows.set(color,texture);
    }
    const alpha=ctx.globalAlpha;ctx.globalAlpha*=opacity;
    ctx.drawImage(glows.get(color),x-r,y-r,r*2,r*2);ctx.globalAlpha=alpha;
  }
  function streak(color) {
    if(!streaks.has(color)) {
      const texture=document.createElement('canvas');texture.width=64;texture.height=32;
      const pen=texture.getContext('2d');pen.lineCap='round';pen.strokeStyle=color;pen.lineWidth=3;
      pen.shadowColor=color;pen.shadowBlur=8;pen.beginPath();pen.moveTo(14,16);pen.lineTo(44,16);pen.stroke();
      pen.fillStyle='#fff3db';pen.beginPath();pen.arc(44,16,2,0,TAU);pen.fill();streaks.set(color,texture);
    }
    return streaks.get(color);
  }
  function transformView() {
    const {ratio,scale,x,y}=view;
    ctx.setTransform(ratio*scale,0,0,ratio*scale,x*ratio,y*ratio);
    ctx.lineCap='round';ctx.lineJoin='round';
  }
  function resize(width,height) {
    if(!width || !height)return;
    const ratio=Math.min(devicePixelRatio,2), scale=Math.min(width/VIEW_WIDTH,height/VIEW_HEIGHT);
    if(view.width===width && view.height===height && view.ratio===ratio)return;
    view={width,height,ratio,scale,x:(width-VIEW_WIDTH*scale)/2-VIEW_X*scale,y:(height-VIEW_HEIGHT*scale)/2-VIEW_Y*scale};
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    bakeBackdrop();draw();
  }
  function bakeBackdrop() {
    const texture=document.createElement('canvas');texture.width=canvas.width;texture.height=canvas.height;
    const screen=ctx;
    // Reuse the same geometry helpers; paint the fixed table only when its size or fonts change.
    try {
      ctx=texture.getContext('2d',{alpha:false});
      ctx.fillStyle='#080909';ctx.fillRect(0,0,texture.width,texture.height);transformView();
      // One open table, drawn from the same rails used by the physics.
      const glow=ctx.createRadialGradient(280,240,10,280,240,260);
      glow.addColorStop(0,'#c6a5650c');glow.addColorStop(1,'#08090900');
      ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
      for(let i=0;i<50;i++) {
        const x=90+(Math.sin(i*32.73)*.5+.5)*380, y=60+(Math.sin(i*81.17)*.5+.5)*350;
        circle(x,y,i%9===0?1.1:.55,'#c6a56538',0,true);
      }
      ctx.save();ctx.translate(280,244);ctx.rotate(-.36);
      [155,201].forEach((r,i)=>{ctx.beginPath();ctx.ellipse(0,0,r,r*.8,0,0,TAU);ctx.strokeStyle=i?'#c6a56518':'#c6a56525';ctx.lineWidth=.7;ctx.stroke();});
      ctx.restore();
      const outline=[[161,FLIPPER_Y],[80,470],[63,152],[94,87],[161,46],[400,46],[466,87],[497,152],[480,470],[399,FLIPPER_Y]];
      ctx.save();ctx.shadowColor='#b6934850';ctx.shadowBlur=14;
      line(outline,'#d1ad64',2.1,true);ctx.restore();
      const inner=outline.map(([x,y])=>[280+(x-280)*.965,260+(y-260)*.957]);
      line(inner,'#e4cb866a',.8,true);
      RAILS.slice(9).forEach(([a,b,c,d])=>line([[a,b],[c,d]],'#cfac6775',1.2));
      RAILS.forEach(([ax,ay,bx,by],i)=>line([[ax,ay],[bx,by]],SURFACES[RAIL_SURFACES[i]].color+'60',1.6));
      // Mark the playable surfaces directly, without an instruction panel.
      [[90,315,-Math.PI/2,0],[280,65,0,1],[470,315,Math.PI/2,2]].forEach(([x,y,angle,id])=>{
        const surface=SURFACES[id];
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=.65;
        ctx.fillStyle=surface.color;ctx.font='500 9px Outfit,sans-serif';ctx.textAlign='center';
        ctx.fillText(surface.name,0,0);
        if(id===0)for(let i=0;i<3;i++)line([[30+i*10,-5],[34+i*10,-2],[30+i*10,1]],surface.color,1.5);
        if(id===1)line([[-40,1],[-36,-4],[-32,1],[-28,-4],[-24,1]],surface.color,1.2);
        if(id===2)for(let i=0;i<3;i++)circle(32+i*11,-3,2+i,surface.color,1);
        ctx.restore();
      });
      // Decorative screws and a tiny orbit mark stay still when reduced motion is requested.
      [[101,113],[459,113],[84,390],[476,390],[161,FLIPPER_Y],[399,FLIPPER_Y]].forEach(([x,y])=>{
        circle(x,y,5,'#c6a56585');line([[x-1.5,y],[x+1.5,y]],'#c6a565a0');
      });
      ctx.save();ctx.translate(280,91);ctx.rotate(-.42);
      ctx.beginPath();ctx.ellipse(0,0,22,8,0,0,TAU);ctx.strokeStyle='#c6a56570';ctx.lineWidth=1;ctx.stroke();
      circle(0,0,15,'#c6a56570');ctx.restore();
    } finally {ctx=screen;}
    backdrop=texture;
  }
  function draw() {
    if(!backdrop)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(backdrop,0,0);transformView();
    RAILS.forEach(([ax,ay,bx,by],i)=>{
      const id=RAIL_SURFACES[i], flash=game.surfaces[id].flash;
      if(flash<.02)return;
      const color=SURFACES[id].color;
      line([[ax,ay],[bx,by]],color+'20',5+flash*9);
      line([[ax,ay],[bx,by]],color+'e0',1.6+flash*2.8);
    });
    bursts.forEach(burst=>{
      const progress=1-burst.life/burst.total, fade=(1-progress)**2;
      if(burst.surface!==undefined) {
        const reach=14+progress*(burst.surface===0?100:64);
        ctx.save();ctx.globalAlpha=fade;glow(burst.x,burst.y,reach+16,burst.color,.45);
        ctx.translate(burst.x,burst.y);ctx.rotate(Math.atan2(burst.ny,burst.nx));
        if(burst.surface===0 || burst.surface===5) {
          for(let i=0;i<3;i++)line([[reach-i*14-8,-12],[reach-i*14,0],[reach-i*14-8,12]],burst.color,2.4-i*.5);
        } else {
          const count=burst.surface===2 || burst.surface===6?3:1;
          for(let i=0;i<count;i++) {
            ctx.beginPath();ctx.arc(0,0,Math.max(2,reach-i*13),-Math.PI*.48,Math.PI*.48);
            ctx.strokeStyle=burst.color;ctx.lineWidth=1.8;ctx.stroke();
          }
        }
        ctx.restore();return;
      }
      const radius=46+(1-(1-progress)**3)*72*burst.strength;
      const color=COLORS[burst.track];
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=fade;glow(burst.x,burst.y,radius+22,color);
      circle(burst.x,burst.y,radius,color+'25',6*fade+.3);
      circle(burst.x,burst.y,radius,color,1.8*fade+.3);
      circle(burst.x,burst.y,46+progress*44,color+'80',.8);
      if(burst.track===2 && progress<.48) {
        for(let i=0;i<6;i++) {
          const angle=i/6*TAU+progress*.35;
          const ray=(distance,twist=0)=>[burst.x+Math.cos(angle+twist)*distance,burst.y+Math.sin(angle+twist)*distance];
          line([ray(48),ray(62,.12),ray(68,-.05),ray(radius+12,.04)],color,1.8);
        }
      } else {
        for(let i=0;i<3;i++) {
          ctx.beginPath();
          const angle=i/3*TAU+progress*(burst.track===0?1:-1);
          ctx.arc(burst.x,burst.y,radius+7,angle,angle+.58);
          ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
        }
      }
      ctx.restore();
    });
    game.bumpers.forEach((bumper,i)=>{
      const idle=game.mode==='ready'&&!motion.matches?Math.sin(visualTime*1.4+i*2)*2:0;
      const x=bumper.x,y=bumper.y+idle,r=bumper.radius;
      const pulse=bumper.flash;
      ctx.save();ctx.translate(x,y);
      if(!motion.matches) {const pop=Math.sin((1-pulse)*Math.PI*2)*pulse;ctx.scale(1+pop*.1,1-pop*.07);}
      ctx.translate(-x,-y);
      glow(x,y,r+27+pulse*20,COLORS[i],.5+pulse*.8);
      circle(x,y,r+6,COLORS[i]+(pulse?'b0':'65'),1.4);
      circle(x,y+5,r+2,'#3f3522',2);
      circle(x,y,r+1,pulse>.65?'#fff4d8':'#e1c48a',pulse>.65?2.4:1.3);
      ctx.save();
      ctx.translate(x,y);ctx.rotate(motion.matches?0:Math.sin(bumper.hop*TAU)*bumper.hop*.15);
      if(icons[i])ctx.drawImage(icons[i],-r+5,-r+5,(r-5)*2,(r-5)*2);
      ctx.restore();
      if(pulse>.03)circle(x,y,r+7+(1-pulse)*28,COLORS[i]+Math.round(pulse*130).toString(16).padStart(2,'0'),1);
      ctx.restore();
      const eyeY=y-r-20;
      circle(x-7,eyeY,2.5,COLORS[i],0,true);circle(x+7,eyeY,2.5,COLORS[i],0,true);
      ctx.beginPath();ctx.arc(x,eyeY+1,pulse?9:5,0,Math.PI);ctx.strokeStyle=COLORS[i]+'bb';ctx.lineWidth=1.2;ctx.stroke();
      ctx.fillStyle=COLORS[i]+'bb';ctx.font='9px Outfit, sans-serif';ctx.textAlign='center';
      ctx.fillText(['BASS','MELODY','BEAT'][i],x,y+r+24);
    });
    flippers(game).forEach(paddle=>{
      const id=paddle.side===1?5:6, surface=SURFACES[id], pulse=game.surfaces[id].flash;
      const color=surface.color;
      ctx.save();
      if(pulse>.02)line([[paddle.x,paddle.y],[paddle.tx,paddle.ty]],color+'25',23+pulse*8);
      line([[paddle.x,paddle.y+4],[paddle.tx,paddle.ty+4]],'#584325',17);
      line([[paddle.x,paddle.y],[paddle.tx,paddle.ty]],color,15+pulse*2);
      line([[paddle.x,paddle.y],[paddle.tx,paddle.ty]],'#211e14',10);
      line([[paddle.x,paddle.y-2],[paddle.tx,paddle.ty-2]],color+'bd',1);
      circle(paddle.x,paddle.y,3,color);
      ctx.restore();
      ctx.save();ctx.translate((paddle.x+paddle.tx)/2,(paddle.y+paddle.ty)/2);
      ctx.rotate(Math.atan2(paddle.ty-paddle.y,(paddle.tx-paddle.x)*paddle.side)*paddle.side);
      ctx.fillStyle=color;ctx.textAlign='center';ctx.font='500 7px Outfit,sans-serif';ctx.fillText(surface.name,0,2.5);ctx.restore();
    });
    const balls=game.mode==='ready'?[{x:450,y:335,trail:[]}]:game.balls;
    balls.forEach(ball=>{
      if(!motion.matches) for(let j=1;j<ball.trail.length;j++) {
        ctx.globalAlpha=j/ball.trail.length*(ball.charge?.65:.3);
        line([[ball.trail[j-1].x,ball.trail[j-1].y],[ball.trail[j].x,ball.trail[j].y]],ball.charge?ball.color:GOLD,j/ball.trail.length*(ball.charge?7:5));
      }
      ctx.globalAlpha=1;
      glow(ball.x,ball.y,R+20,ball.charge?ball.color:'#ffdda4');circle(ball.x,ball.y,R,'#fff6dd',0,true);
      if(ball.octave)circle(ball.x,ball.y,R+4,SURFACES[1].color,1.5);
      circle(ball.x-2,ball.y-2,2,'#fff',0,true);
    });
    sparks.forEach(p=>{
      ctx.save();ctx.globalAlpha=Math.min(1,p.life/p.total*1.5);
      ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle=p.color;ctx.strokeStyle=p.color;
      if(p.kind===-1) {
        ctx.rotate(Math.atan2(p.vy,p.vx)-p.angle);
        ctx.scale(Math.min(14,Math.hypot(p.vx,p.vy)*.045)/14,p.size/1.5);
        ctx.drawImage(streak(p.color),-22,-8,32,16);
      } else if(p.kind===0) {
        const r=p.size;
        ctx.beginPath();ctx.moveTo(0,r*.65);
        ctx.bezierCurveTo(-r*1.5,-r*.25,-r*.65,-r*1.2,0,-r*.45);
        ctx.bezierCurveTo(r*.65,-r*1.2,r*1.5,-r*.25,0,r*.65);
        ctx.fill();
      } else if(p.kind===1 && p.glyph==='leaf') {
        ctx.beginPath();ctx.ellipse(0,0,p.size,p.size*.42,0,0,TAU);ctx.fill();
        line([[-p.size*.7,0],[p.size*.7,0]],'#eefbd6',.65);
      } else if(p.kind===1) {
        ctx.font=`italic ${p.size*2.1}px 'Cormorant Garamond',serif`;ctx.textAlign='center';ctx.fillText(p.glyph,0,4);
      } else {
        const r=p.size;
        line([[-r*.3,-r],[r*.3,-r*.12],[-r*.18,r*.12],[r*.3,r]],p.color,2);
        glow(0,0,12,p.color,.65);circle(0,0,1.5,'#e2fcff',0,true);
      }
      ctx.restore();
    });
    labels.forEach(label=>{ctx.globalAlpha=clamp(label.life*1.5,0,1);ctx.font=`500 ${label.small?11:19}px Outfit,sans-serif`;ctx.textAlign='center';ctx.fillStyle=label.color;ctx.fillText(label.text,label.x,label.y);});ctx.globalAlpha=1;
    const remaining=1-game.time/ROUND;
    line([[205,H-6],[355,H-6]],'#c6a56525',1);
    if(game.mode!=='ready')line([[205,H-6],[205+remaining*150,H-6]],GOLD,2);
  }
  function schedule() {
    if(!frame && visible && !document.hidden) frame=requestAnimationFrame(render);
  }
  function render(now) {
    frame=0;
    const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
    visualTime+=dt;
    const wasPlaying=game.mode==='playing';
    if(wasPlaying) {
      stepGame(game,dt);
      game.events.splice(0).forEach(feedback);
      game.balls.forEach(ball=>{ball.trail.push({x:ball.x,y:ball.y});if(ball.trail.length>14)ball.trail.shift();});
      sparks=sparks.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*1.3);p.vy+=70*dt;p.angle+=p.spin*dt;p.life-=dt;return p.life>0;});
      bursts=bursts.filter(burst=>{burst.life-=dt;return burst.life>0;});
      labels=labels.filter(label=>{if(!motion.matches)label.y-=30*dt;label.life-=dt;return label.life>0;});
      update();
    }
    const step=playingSong&&audio?Math.floor((audio.currentTime-audioEpoch)/STEP+STEPS)%STEPS:game.mode==='playing'?Math.floor(game.time/STEP)%STEPS:-1;
    if(step!==previousStep)sequence(step);
    if(wasPlaying || game.mode!=='finished')draw();
    if(game.mode==='playing'||playingSong||(game.mode==='ready'&&!motion.matches))schedule();
  }
  root.dataset.state='ready';update();sequence();last=performance.now();schedule();
}

if(typeof document!=='undefined') startExhibition().catch(error=>{
  console.error('Musical pinball:',error);
  const root=document.querySelector('.pinball');
  root.dataset.state='unavailable';
  root.querySelector('#play-status').textContent='遊びを読み込めませんでした。作品は下からご覧いただけます。';
  root.querySelector('.flip-button').disabled=true;
});
