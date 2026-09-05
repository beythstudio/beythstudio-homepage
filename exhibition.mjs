const TAU = Math.PI * 2;
export const STEP = 60 / 96 / 2;
export const STEPS = 32;
export const ROUND = 30;
const W = 560, H = 520, R = 8;
const GOLD = '#c6a565';
const COLORS = ['#e58b9f', '#b5d889', '#78c8d8'];
const NOTES = [62, 65, 67, 69, 72, 74, 77];
const BUMPERS = [{x:183,y:177}, {x:370,y:183}, {x:275,y:305}];
const RAILS = [
  [80,400,63,152], [63,152,94,87], [94,87,161,46], [161,46,400,46],
  [400,46,466,87], [466,87,497,152], [497,152,480,400],
  [80,400,161,462], [480,400,399,462],
  [94,360,149,411], [149,411,113,411], [113,411,94,360],
  [466,360,411,411], [411,411,447,411], [447,411,466,360]
];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function newGame(seed = Math.random()) {
  return {
    mode:'ready', time:0, score:0, hits:0, combo:0, bestCombo:0, lastHit:-10,
    lastFlip:-10, flip:0, balls:[], bumpers:BUMPERS.map(p=>({...p, radius:43, flash:0, hop:0})),
    pattern:Array.from({length:3},()=>Array(STEPS).fill(null)),
    seed, launches:0, bonus:false, events:[], message:'', messageUntil:0
  };
}

function launch(game, extra = false) {
  // Deterministic per-round serves; player timing supplies the other variation.
  const angle = Math.sin(game.seed * 71 + game.launches++ * 2.39);
  game.balls.push({x:extra?110:450,y:335,vx:extra?120+angle*65:-150-angle*85,vy:-780,trail:[],contacts:[-1,-1,-1]});
  game.events.push({type:extra?'bonus':'serve', x:extra?110:450,y:335});
}

export function flip(game) {
  if (game.mode === 'ready') {game.mode='playing'; launch(game);}
  if (game.mode !== 'playing' || game.time - game.lastFlip < .2) return false;
  game.lastFlip=game.time;
  return true;
}

export function addNote(game, track, position, speed) {
  const step = Math.round(game.time / STEP) % STEPS;
  const pitch = NOTES[Math.floor(clamp(position, 0, .999) * NOTES.length)];
  if (track === 0) {
    const bass = [38, 45, 48][Math.floor(clamp(speed / 850,0,.999) * 3)];
    for (let i=0; i<STEPS; i+=8) game.pattern[0][i]={note:bass,velocity:.68};
    game.pattern[0][step]={note:bass+12,velocity:.55};
  } else if (track === 1) {
    game.pattern[1][step]={note:pitch,velocity:.8};
    game.pattern[1][(step+16)%STEPS]={note:pitch+12,velocity:.35};
  } else {
    for (let i=0; i<STEPS; i+=4) game.pattern[2][i]={note:i%8===0?0:1,velocity:.6};
    game.pattern[2][step]={note:2,velocity:.48};
  }
  return {step,note:game.pattern[track][step]};
}

function hit(game, index, ball, nx, ny) {
  const bumper = game.bumpers[index];
  const speed = Math.hypot(ball.vx,ball.vy);
  ball.vx=nx*clamp(speed*.9+170,420,760);
  ball.vy=ny*clamp(speed*.9+170,420,760)-55;
  if (game.time-ball.contacts[index] < .18) return;
  ball.contacts[index]=game.time;
  game.combo=game.time-game.lastHit<2.6 ? game.combo+1 : 1;
  game.lastHit=game.time;
  game.hits++;
  game.bestCombo=Math.max(game.bestCombo,game.combo);
  const points=10*Math.min(game.combo,8);
  game.score+=points;
  bumper.flash=1;
  bumper.hop=1;
  const recorded=addNote(game,index,(Math.atan2(ny,nx)+Math.PI)/TAU,speed);
  game.events.push({type:'hit',track:index,x:ball.x,y:ball.y,points,...recorded});
  if (!game.bonus && game.combo>=4) {
    game.bonus=true;
    launch(game,true);
    game.message='番長「もう1球。」'; game.messageUntil=game.time+2.8;
  } else if (!game.bonus && game.combo===3) {
    game.message='いい調子。あと1ヒットで、もう1球。'; game.messageUntil=game.time+2;
  }
}

export function flippers(game) {
  const age=game.time-game.lastFlip;
  const lift = age < 0 ? 0 : age < .075 ? age/.075 : age < .135 ? 1 : clamp(1-(age-.135)/.13,0,1);
  game.flip=lift;
  const angle=.38-lift*.83;
  return [
    {x:161,y:462,tx:161+99*Math.cos(angle),ty:462+99*Math.sin(angle),side:1},
    {x:399,y:462,tx:399-99*Math.cos(angle),ty:462+99*Math.sin(angle),side:-1}
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
  return {along,nx,ny};
}

export function stepGame(game, delta) {
  if (game.mode!=='playing') return;
  const steps=Math.ceil(delta/(1/120));
  const dt=delta/steps;
  for(let s=0;s<steps;s++) {
    game.time=Math.min(ROUND,game.time+dt);
    const paddles=flippers(game);
    game.bumpers.forEach((bumper,i)=>{
      bumper.flash=Math.max(0,bumper.flash-dt*3);
      bumper.hop=Math.max(0,bumper.hop-dt*2.4);
      bumper.x=BUMPERS[i].x+Math.sin((1-bumper.hop)*TAU)*bumper.hop*13;
      bumper.y=BUMPERS[i].y-Math.sin(bumper.hop*Math.PI)*18;
    });
    for(const ball of [...game.balls]) {
      ball.vy+=620*dt;
      ball.x+=ball.vx*dt; ball.y+=ball.vy*dt;
      for(const [ax,ay,bx,by] of RAILS) segmentCollision(ball,ax,ay,bx,by,R+2,.91);
      for(const paddle of paddles) {
        const collision=segmentCollision(ball,paddle.x,paddle.y,paddle.tx,paddle.ty,R+7,.64);
        if(collision && collision.ny<.3 && game.time-game.lastFlip<.16) {
          ball.vy=-680-collision.along*110;
          ball.vx=paddle.side*(145+collision.along*300);
          game.events.push({type:'flip',x:ball.x,y:ball.y});
        }
      }
      game.bumpers.forEach((bumper,i)=>{
        const dx=ball.x-bumper.x, dy=ball.y-bumper.y, distance=Math.hypot(dx,dy);
        if(distance<bumper.radius+R) {
          const nx=distance>.001?dx/distance:0, ny=distance>.001?dy/distance:-1;
          ball.x=bumper.x+nx*(bumper.radius+R+.5);
          ball.y=bumper.y+ny*(bumper.radius+R+.5);
          hit(game,i,ball,nx,ny);
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
        game.message='音は残る。次の1球。'; game.messageUntil=game.time+1.8;
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
  panner.pan.value=[-.22,.25,0][track];
  gain.connect(panner).connect(destination);
  const velocity=note.velocity*scale;
  let source, duration, peak;
  if(track===2 && note.note!==0) {
    source=context.createBufferSource(); source.buffer=noise;
    const filter=context.createBiquadFilter(); filter.type='highpass';
    filter.frequency.value=note.note===1?1200:6500;
    source.connect(filter).connect(gain);
    duration=note.note===1?.14:.07;
    peak=note.note===1?.09:.055;
  } else {
    source=context.createOscillator();
    source.type=track===0?'triangle':'sine';
    const frequency=track===2?150:440*2**((note.note-69)/12);
    source.frequency.setValueAtTime(frequency,when);
    if(track===2) source.frequency.exponentialRampToValueAtTime(42,when+.15);
    source.connect(gain);
    duration=track===0?.55:track===1?1.45:.24;
    peak=track===0?.14:track===1?.13:.24;
  }
  gain.gain.setValueAtTime(.00001,when);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*velocity),when+.009);
  gain.gain.exponentialRampToValueAtTime(.00001,when+duration);
  source.start(when); source.stop(when+duration+.02);
  source.onended=()=>{source.disconnect();gain.disconnect();panner.disconnect();};
  return source;
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
  const noise=makeNoise(context);
  for(let bar=0;bar<2;bar++) for(let step=0;step<STEPS;step++) {
    pattern.forEach((track,i)=>{
      if(track[step]) instrument(context,context.destination,noise,i,track[step],.025+(bar*STEPS+step)*STEP);
    });
  }
  return encodeWav(await context.startRendering());
}

async function startExhibition() {
  const root=document.querySelector('.pinball');
  const canvas=root.querySelector('canvas'), ctx=canvas.getContext('2d');
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
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let game=newGame(), visible=true, frame=0, last=0, visualTime=0;
  let audio, noise, muted=false, playingSong=false, audioTimer, audioEpoch=0, nextStep=0;
  let exporting=false, exportUrl, pauseMode='playing', sparks=[], labels=[], previousStep=-1;
  let songSteps=Infinity;
  const voices=new Set();
  const images=['icon.png','assets/rhyme-tree-icon-1024.png','assets/giga-bancho-icon.png'].map(src=>{
    const image=new Image(); image.src=src; image.addEventListener('load',draw); return image;
  });
  const dots=game.pattern.map((track,index)=>{
    const line=document.createElement('div'); line.className='sequence-line';
    const name=document.createElement('span'); name.textContent=['ベース','メロディー','ビート'][index];
    line.append(name);
    const cells=track.map(()=>{const cell=document.createElement('i');line.append(cell);return cell;});
    root.querySelector('.sequence').append(line); return cells;
  });

  function announce(text) {status.textContent=text;}
  function sequence(current=-1) {
    game.pattern.forEach((track,i)=>track.forEach((note,j)=>{
      dots[i][j].classList.toggle('on',Boolean(note));
      dots[i][j].classList.toggle('current',j===current);
    }));
    previousStep=current;
  }
  function update() {
    root.dataset.mode=game.mode;
    score.textContent=String(game.score).padStart(3,'0');
    timer.textContent=`00:${String(Math.ceil(ROUND-game.time)).padStart(2,'0')}`;
    combo.textContent=game.combo>1?`${game.combo} COMBO`:game.hits?`${game.hits} HITS`:'MAKE A LITTLE MUSIC';
    action.disabled=game.mode==='finished';
    action.textContent=game.mode==='ready'?'音ありで、スタート ↗':game.mode==='paused'?'つづける ▷':'弾く';
    pause.hidden=game.mode!=='playing';
    overlay.hidden=!['ready','paused'].includes(game.mode);
    root.querySelector('.start-note').textContent=game.mode==='paused'?'ひと休み中。':'30秒、音で遊ぼう。';
    root.querySelector('.board-instruction').textContent=game.mode==='paused'?'つづけるボタンで再開':'球が下に来たら、タップ / SPACE';
    sound.textContent=muted?'音 OFF':'音 ON';
    sound.setAttribute('aria-label',muted?'音を入れる':'音を消す');
    sound.setAttribute('aria-pressed',String(!muted));
    if(game.mode==='ready' && muted) action.textContent='音なしで、スタート ↗';
    action.setAttribute('aria-label',action.textContent);
    listen.textContent=playingSong?'再生を止める Ⅱ':'できた曲を聴く ▷';
    root.querySelector('.game-message').textContent=game.messageUntil>game.time?game.message:'';
  }
  async function enableAudio() {
    if(muted) return false;
    try {
      if(!audio) {audio=new AudioContext();noise=makeNoise(audio);}
      await audio.resume(); return audio.state==='running';
    } catch {
      muted=true; announce('音を再生できませんでした。遊んでできた曲は、終了後に保存できます。'); update(); return false;
    }
  }
  function voice(track,note,when,scale=1) {
    const source=instrument(audio,audio.destination,noise,track,note,when,scale);
    voices.add(source);
    source.addEventListener('ended',()=>voices.delete(source),{once:true});
  }
  function stopAudio() {
    clearInterval(audioTimer); audioTimer=null;
    for(const source of voices)source.stop();
    voices.clear();
    if(audio?.state==='running') audio.suspend().catch(()=>{});
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
          const note=track[nextStep%STEPS];
          if(note) voice(index,note,when);
        });
        nextStep++;
      }
    }
    tick(); audioTimer=setInterval(tick,25);
  }
  function feedback(event) {
    if(event.type==='hit') {
      if(!motion.matches) {
        for(let i=0;i<15;i++) {
          const angle=Math.random()*TAU, speed=40+Math.random()*180;
          sparks.push({x:event.x,y:event.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:.6,color:COLORS[event.track]});
        }
      }
      labels.push({x:event.x,y:event.y-35,text:`+${event.points}`,life:1,color:COLORS[event.track]});
      if(!muted && audio?.state==='running') voice(event.track,event.note,audio.currentTime+.005,.9);
      sequence(Math.floor(game.time/STEP)%STEPS);
      if(game.hits===1) announce('最初の音が入りました。ヒットを重ねると曲が育ちます。');
    }
    if(event.type==='bonus') {
      announce('4連続ヒット。番長がもう1球、追加しました。');
      if(!motion.matches) root.closest('.hero').querySelector('h1 em').animate(
        [{transform:'rotate(0)'},{transform:'rotate(-4deg) translateY(-5px)',offset:.35},{transform:'rotate(0)'}],
        {duration:600,easing:'ease-out'}
      );
    }
    if(event.type==='finish') finish();
  }
  function finish() {
    stopAudio(); playingSong=false;
    result.hidden=false;
    root.querySelector('.result-title').textContent=game.hits?'あなたの30秒が、1曲に。':'次は、最初のヒットを。';
    root.querySelector('.result-stats').textContent=`${game.score} SCORE · ${game.hits} HITS · BEST ${game.bestCombo} COMBO`;
    listen.hidden=save.hidden=!game.hits;
    announce(game.hits?`終了。${game.hits}ヒットで曲ができました。聴くか、保存できます。`:'終了。もう一回遊べます。');
    action.hidden=true; update(); sequence();
    if(game.hits && !muted) {
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
    if(game.mode==='finished') return;
    if(game.mode==='ready' || game.mode==='paused') {
      const bounds=root.getBoundingClientRect();
      if(bounds.top<0 || bounds.bottom>innerHeight) root.scrollIntoView({block:'center',behavior:motion.matches?'instant':'smooth'});
      songSteps=Infinity;
      if(game.mode==='ready') {flip(game); announce('スタート。球が下に来たらタップかスペースで弾いてください。');}
      else game.mode=pauseMode;
      last=performance.now(); update(); schedule();
      await enableAudio();
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
    stopAudio();playingSong=false; game=newGame(); sparks=[];labels=[];
    result.hidden=true;action.hidden=false;action.disabled=false;
    if(!exporting)save.textContent='曲を保存 ↓';
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
  save.addEventListener('click',async()=>{
    if(exporting || !game.hits) return;
    exporting=true;save.disabled=true;save.textContent='曲を書き出しています…';
    try {
      const savedScore=game.score;
      const wav=await renderSong(game.pattern);
      if(exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
      const link=document.createElement('a');
      link.href=exportUrl;link.download=`beyth-play-${savedScore}-${Date.now()}.wav`;
      document.body.append(link);link.click();link.remove();
      announce('曲を書き出しました。ダウンロード先を確認してください。');
      save.textContent='もう一度保存 ↓';
    } catch(error) {
      announce('曲を書き出せませんでした。このページで聴くか、もう一度保存してください。');
      save.textContent='曲を保存 ↓';
      console.error('Song export:',error);
    } finally {exporting=false;save.disabled=false;}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();else{last=performance.now();schedule();}});
  window.addEventListener('pagehide',()=>{pauseGame();if(exportUrl)URL.revokeObjectURL(exportUrl);});
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(!visible) {pauseGame();cancelAnimationFrame(frame);frame=0;}
    else {last=performance.now();schedule();}
  },{threshold:0}).observe(root);
  new ResizeObserver(draw).observe(canvas);
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
  function draw() {
    if(!ctx) return;
    const ratio=Math.min(devicePixelRatio,2), width=canvas.clientWidth, height=canvas.clientHeight;
    if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)) {
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    }
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);
    const scale=Math.min(width/W,height/H);
    ctx.translate((width-W*scale)/2,(height-H*scale)/2);ctx.scale(scale,scale);
    ctx.lineCap='round';ctx.lineJoin='round';
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
    const outline=[[161,462],[80,400],[63,152],[94,87],[161,46],[400,46],[466,87],[497,152],[480,400],[399,462]];
    ctx.save();ctx.shadowColor='#b6934850';ctx.shadowBlur=14;
    line(outline,'#d1ad64',2.1,true);ctx.restore();
    const inner=outline.map(([x,y])=>[280+(x-280)*.965,260+(y-260)*.957]);
    line(inner,'#e4cb866a',.8,true);
    RAILS.slice(9).forEach(([a,b,c,d])=>line([[a,b],[c,d]],'#cfac6775',1.2));
    // Decorative screws and a tiny orbit mark stay still when reduced motion is requested.
    [[101,113],[459,113],[84,338],[476,338],[161,462],[399,462]].forEach(([x,y])=>{
      circle(x,y,5,'#c6a56585');line([[x-1.5,y],[x+1.5,y]],'#c6a565a0');
    });
    ctx.save();ctx.translate(280,91);ctx.rotate(-.42);
    ctx.beginPath();ctx.ellipse(0,0,22,8,0,0,TAU);ctx.strokeStyle='#c6a56570';ctx.lineWidth=1;ctx.stroke();
    circle(0,0,15,'#c6a56570');ctx.restore();
    game.bumpers.forEach((bumper,i)=>{
      const idle=game.mode==='ready'&&!motion.matches?Math.sin(visualTime*1.4+i*2)*2:0;
      const x=bumper.x,y=bumper.y+idle,r=bumper.radius;
      const pulse=bumper.flash;
      ctx.save();ctx.shadowColor=COLORS[i];ctx.shadowBlur=12+pulse*19;
      circle(x,y,r+6,COLORS[i]+(pulse?'b0':'65'),1.4);
      ctx.restore();
      circle(x,y+5,r+2,'#3f3522',2);
      circle(x,y,r+1,'#e1c48a',1.3);
      ctx.save();
      ctx.translate(x,y);ctx.rotate(motion.matches?0:Math.sin(bumper.hop*TAU)*bumper.hop*.15);
      ctx.beginPath();ctx.arc(0,0,r-5,0,TAU);ctx.clip();
      const image=images[i];
      if(image.complete && image.naturalWidth)ctx.drawImage(image,-r+5,-r+5,(r-5)*2,(r-5)*2);
      ctx.restore();
      if(pulse>.03)circle(x,y,r+7+(1-pulse)*28,COLORS[i]+Math.round(pulse*130).toString(16).padStart(2,'0'),1);
      const eyeY=y-r-20;
      circle(x-7,eyeY,2.5,COLORS[i],0,true);circle(x+7,eyeY,2.5,COLORS[i],0,true);
      ctx.beginPath();ctx.arc(x,eyeY+1,pulse?9:5,0,Math.PI);ctx.strokeStyle=COLORS[i]+'bb';ctx.lineWidth=1.2;ctx.stroke();
      ctx.fillStyle=COLORS[i]+'bb';ctx.font='9px Outfit, sans-serif';ctx.textAlign='center';
      ctx.fillText(['BASS','MELODY','BEAT'][i],x,y+r+24);
    });
    flippers(game).forEach(paddle=>{
      const color=game.flip>.1?'#f2d99d':GOLD;
      line([[paddle.x,paddle.y+4],[paddle.tx,paddle.ty+4]],'#584325',17);
      line([[paddle.x,paddle.y],[paddle.tx,paddle.ty]],color,15);
      line([[paddle.x,paddle.y],[paddle.tx,paddle.ty]],'#211e14',10);
      line([[paddle.x,paddle.y-2],[paddle.tx,paddle.ty-2]],color+'bd',1);
      circle(paddle.x,paddle.y,3,color);
    });
    const balls=game.mode==='ready'?[{x:450,y:335,trail:[]}]:game.balls;
    balls.forEach(ball=>{
      if(!motion.matches) for(let j=1;j<ball.trail.length;j++) {
        line([[ball.trail[j-1].x,ball.trail[j-1].y],[ball.trail[j].x,ball.trail[j].y]],`rgba(239,211,155,${j/ball.trail.length*.3})`,j/ball.trail.length*5);
      }
      ctx.save();ctx.shadowColor='#ffdda4';ctx.shadowBlur=20;circle(ball.x,ball.y,R,'#fff6dd',0,true);ctx.restore();
      circle(ball.x-2,ball.y-2,2,'#fff',0,true);
    });
    sparks.forEach(p=>circle(p.x,p.y,1.1,p.color+Math.round(clamp(p.life/.6,0,1)*255).toString(16).padStart(2,'0'),0,true));
    labels.forEach(label=>{ctx.globalAlpha=clamp(label.life,0,1);ctx.font='500 17px Outfit, sans-serif';ctx.textAlign='center';ctx.fillStyle=label.color;ctx.fillText(label.text,label.x,label.y);});ctx.globalAlpha=1;
    const remaining=1-game.time/ROUND;
    line([[205,514],[355,514]],'#c6a56525',1);
    if(game.mode!=='ready')line([[205,514],[205+remaining*150,514]],GOLD,2);
  }
  function schedule() {
    if(!frame && visible && !document.hidden) frame=requestAnimationFrame(render);
  }
  function render(now) {
    frame=0;
    const dt=Math.min(.25,Math.max(0,(now-last)/1000));last=now;
    visualTime+=dt;
    if(game.mode==='playing') {
      stepGame(game,dt);
      game.events.splice(0).forEach(feedback);
      game.balls.forEach(ball=>{ball.trail.push({x:ball.x,y:ball.y});if(ball.trail.length>14)ball.trail.shift();});
      sparks=sparks.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=110*dt;p.life-=dt;return p.life>0;});
      labels=labels.filter(label=>{if(!motion.matches)label.y-=30*dt;label.life-=dt;return label.life>0;});
      update();
    }
    const step=playingSong&&audio?Math.floor((audio.currentTime-audioEpoch)/STEP+STEPS)%STEPS:game.mode==='playing'?Math.floor(game.time/STEP)%STEPS:-1;
    if(step!==previousStep)sequence(step);
    draw();
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
