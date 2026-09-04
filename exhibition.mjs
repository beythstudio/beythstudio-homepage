const PARTICLE_COUNT = 65_536;
const WORKGROUP_SIZE = 256;
const SHAPES = ['ORBIT', 'BLOOM', 'RIBBON', 'BEYTH'];

// Shared by pointer release and the keyboard's pluck button.
export function releaseGesture(start, end, cancelled = false) {
  if (!start || cancelled) return { energy: 0, changeShape: false };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  return { energy: Math.min(1, .22 + distance * 1.3), changeShape: distance > .12 };
}

const paramsShader = /* wgsl */ `
struct Params {
  frame0: vec4<f32>, // time, delta, shape, color
  frame1: vec4<f32>, // pointer x/y, active, release energy
  frame2: vec4<f32>, // aspect, point size, held, direct placement
  frame3: vec4<f32>, // grab origin x/y, sculpture scale, color strength
}
`;

const computeShader = paramsShader + /* wgsl */ `
@group(0) @binding(0) var<storage, read> particlesIn: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> particlesOut: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> targets: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: Params;

fn rotate(p: vec3<f32>, x: f32, z: f32) -> vec3<f32> {
  let q = vec3<f32>(p.x, p.y*cos(x)-p.z*sin(x), p.y*sin(x)+p.z*cos(x));
  return vec3<f32>(q.x*cos(z)-q.y*sin(z), q.x*sin(z)+q.y*cos(z), q.z);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
  let index = globalId.x;
  if (index >= ${PARTICLE_COUNT}u) { return; }
  let state = particlesIn[index];
  let targetData = targets[index];
  let time = params.frame0.x;
  let dt = params.frame0.y;
  let aspect = params.frame2.x;
  let strand = f32(index / 512u);
  let band = strand / 128.0;
  let a = f32(index % 512u) / 511.0 * 6.2831853 + time * 0.085;
  let b = band * 6.2831853;
  let radius = .59 + .095 * cos(b) + .018*sin(a*3.0+b);
  var p = vec3<f32>(radius * cos(a), radius * sin(a), .19 * sin(b));
  p = rotate(p, .45 + .40 * sin(b*.5), .46 + .16*sin(time*.12));
  // A few loose filaments give the sculpture an airy edge.
  if (band > .8) {
    p = rotate(vec3<f32>(.73*cos(a), .66*sin(a), .04*sin(a*3.0+b)), b*.55, -.35);
  }
  if (params.frame0.z > .5 && params.frame0.z < 1.5) {
    let r = .44 + .16 * cos(3.0*a + b);
    p = rotate(vec3<f32>(r*cos(a), r*sin(a), .22*sin(3.0*a+b)), .55, time*.045);
  }
  if (params.frame0.z > 1.5 && params.frame0.z < 2.5) {
    p = rotate(vec3<f32>(.64*sin(a), .42*sin(2.0*a+b*.12), .21*cos(a+b)), .35, -.4);
  }
  var goal = p.xy * params.frame3.z;
  if (params.frame0.z > 2.5) { goal = targetData.xy * 1.32; }
  goal.x /= aspect;
  goal.y += .045;

  let origin = params.frame3.xy;
  let originDelta = (goal - origin) * vec2<f32>(aspect, 1.0);
  let catchWeight = exp(-dot(originDelta, originDelta)*4.8);
  if (params.frame2.z > .5) {
    goal += (params.frame1.xy - origin) * catchWeight;
  }
  if (params.frame2.w > .5) {
    particlesOut[index] = vec4<f32>(goal, 0.0, 0.0);
    return;
  }
  var position = state.xy;
  var velocity = state.zw;
  velocity += (goal-position) * 14.0 * dt;
  let delta = (position-params.frame1.xy) * vec2<f32>(aspect, 1.0);
  let distance = max(length(delta), .025);
  let direction = delta / distance / vec2<f32>(aspect, 1.0);
  let reach = exp(-distance*distance*5.0) * params.frame1.z;
  velocity += direction * reach * params.frame1.w * 24.0 * dt;
  velocity -= direction * reach * .05 * (1.0-params.frame2.z) * dt;
  velocity *= exp(-dt*3.7);
  position += velocity * dt;
  particlesOut[index] = vec4<f32>(position, velocity);
}
`;

const renderShader = paramsShader + /* wgsl */ `
@group(0) @binding(0) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> targets: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> params: Params;
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) intensity: f32,
}
const quad = array<vec2<f32>, 6>(vec2<f32>(-1,-1),vec2<f32>(1,-1),vec2<f32>(-1,1),vec2<f32>(-1,1),vec2<f32>(1,-1),vec2<f32>(1,1));
fn color(seed: f32) -> vec3<f32> {
  let gold = mix(vec3<f32>(.65,.37,.09), vec3<f32>(1.0,.88,.54), seed);
  var tint = vec3<f32>(1,.24,.49);
  if (params.frame0.w > 1.5) { tint = vec3<f32>(.55,.92,.30); }
  if (params.frame0.w > 2.5) { tint = vec3<f32>(.20,.78,1.0); }
  return mix(gold,tint,params.frame3.w*.7);
}
@vertex
fn vertexMain(@builtin(vertex_index) vertex: u32, @builtin(instance_index) index: u32) -> VertexOutput {
  let seed = targets[index].w;
  let sparkle = pow(fract(seed*43.7), 18.0);
  let offset = quad[vertex] * params.frame2.y * (.30 + sparkle*1.8);
  var out: VertexOutput;
  out.position = vec4<f32>(particles[index].xy + offset/vec2<f32>(params.frame2.x,1.0),0,1);
  out.uv = quad[vertex];
  out.color = color(fract(seed*17.3));
  out.intensity = .4 + sparkle * (1.2 + .6*sin(params.frame0.x*1.2+seed*52.0));
  return out;
}
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let r = length(input.uv);
  if (r > 1.0) { discard; }
  let glow = pow(1.0-r,2.4);
  let core = 1.0-smoothstep(0.0,.3,r);
  let alpha = (glow*.6 + core*.55)*input.intensity;
  return vec4<f32>(input.color*alpha*(1.0+core), alpha);
}
@vertex
fn lineVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) strand: u32) -> VertexOutput {
  let index = strand*512u + vertex;
  var out: VertexOutput;
  out.position = vec4<f32>(particles[index].xy,0,1);
  out.uv = vec2<f32>(0);
  out.color = color(fract(f32(strand)*.618));
  out.intensity = .13;
  // Logo samples are independent points, not a continuous filament.
  if (params.frame0.z > 2.5) { out.intensity = 0.0; }
  return out;
}
@fragment
fn lineFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color*input.intensity,input.intensity);
}
`;

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createBuffer(device, label, data, usage) {
  const buffer = device.createBuffer({label, size:data.byteLength, usage, mappedAtCreation:true});
  new data.constructor(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

async function makeLogoTargets() {
  const image = new Image();
  image.decoding = "async";
  image.src = "assets/logo_icon.png";
  await image.decode();

  const sampleWidth = 320;
  const sampleHeight = Math.round((image.height / image.width) * sampleWidth);
  const offscreen = document.createElement("canvas");
  offscreen.width = sampleWidth;
  offscreen.height = sampleHeight;
  const context = offscreen.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, sampleWidth, sampleHeight);

  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const cropBottom = Math.floor(sampleHeight * 0.84);
  const candidates = [];
  let minX = sampleWidth;
  let maxX = 0;
  let minY = cropBottom;
  let maxY = 0;

  for (let y = 0; y < cropBottom; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const pixel = (y * sampleWidth + x) * 4;
      const red = pixels[pixel];
      const green = pixels[pixel + 1];
      const blue = pixels[pixel + 2];
      const isGold = red > 82 && green > 52 && red > blue * 1.22 && green > blue * 1.08;

      if (isGold) {
        candidates.push([x, y]);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (candidates.length < 500) {
    throw new Error("BEYTHマークの粒子座標を生成できませんでした。");
  }

  const targetData = new Float32Array(PARTICLE_COUNT * 4);
  const random = mulberry32(0xbe17);
  const midpointX = (minX + maxX) / 2;
  const midpointY = (minY + maxY) / 2;
  const scale = 0.88 / Math.max(1, maxY - minY);

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const candidate = candidates[Math.floor(random() * candidates.length)];
    const jitter = (random() - 0.5) * 0.006;
    const offset = index * 4;
    targetData[offset] = (candidate[0] - midpointX) * scale + jitter;
    targetData[offset + 1] = (midpointY - candidate[1]) * scale + jitter;
    targetData[offset + 2] = index % 3;
    targetData[offset + 3] = random();
  }

  return targetData;
}


async function startExhibition() {
  const root = document.querySelector('.light-play');
  const canvas = document.querySelector('#light-canvas');
  const ring = root.querySelector('.pointer-ring');
  const hint = root.querySelector('.hint-copy');
  const toolbar = root.querySelector('.play-toolbar');
  const status = document.querySelector('#play-status');
  const motionButton = root.querySelector('.motion-button');
  const soundButton = root.querySelector('.sound-button');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 700px)');
  const pointer = {x:.35,y:0,active:0,held:0,pulse:0,originX:0,originY:0,start:null,id:null};
  let device, context, particleA, particleB, uniformBuffer, computePipeline, renderPipeline, linePipeline;
  let computeAtoB, computeBtoA, renderA, renderB;
  let readFromA=true, frame=0, lastTime=0, time=0, shape=0, shapeTimer=0, linesAt=0;
  let paused=motionPreference.matches, visible=true, direct=true, tone=1, toneStrength=0, targetTone=0;
  let audioContext, sound=false, aspect=1;
  const uniformData = new Float32Array(16);

  function setHint(text) { hint.textContent = text || (narrow.matches ? '横に引っぱって、はなす。' : 'つかんで、はなす。'); }
  setHint();
  narrow.addEventListener('change',()=>setHint());

  function unavailable(error) {
    cancelAnimationFrame(frame); frame=0; clearTimeout(shapeTimer);
    root.dataset.state='unavailable'; toolbar.hidden=true;
    device?.destroy(); device=null;
    root.querySelector('.play-unavailable').hidden=false;
    canvas.style.visibility='hidden';
    console.error('Light exhibition:', error);
  }
  function resize() {
    const ratio=Math.min(devicePixelRatio,2);
    const width=Math.round(canvas.clientWidth*ratio), height=Math.round(canvas.clientHeight*ratio);
    if (canvas.width!==width || canvas.height!==height) {
      canvas.width=Math.max(1,width); canvas.height=Math.max(1,height); direct=true;
    }
    aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
  }
  function schedule() {
    if (!frame && device && visible && !document.hidden) frame=requestAnimationFrame(render);
  }
  function render(now) {
    frame=0;
    if (!device || !visible || document.hidden || root.dataset.state!=='ready') return;
    resize();
    const dt=Math.min(.034,Math.max(.001,(now-lastTime)/1000)); lastTime=now;
    if (!paused) time+=dt;
    toneStrength+=(targetTone-toneStrength)*Math.min(1,dt*5);
    uniformData.set([time,dt,shape,tone,pointer.x,pointer.y,pointer.active,pointer.pulse,
      aspect,2.6/Math.max(canvas.clientHeight,1),pointer.held,direct||paused?1:0,
      pointer.originX,pointer.originY,Math.min(aspect*1.03,1.13),toneStrength]);
    device.queue.writeBuffer(uniformBuffer,0,uniformData);
    const encoder=device.createCommandEncoder({label:'Light play'});
    const compute=encoder.beginComputePass();
    compute.setPipeline(computePipeline);
    compute.setBindGroup(0,readFromA?computeAtoB:computeBtoA);
    compute.dispatchWorkgroups(PARTICLE_COUNT/WORKGROUP_SIZE); compute.end();
    const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});
    pass.setBindGroup(0,readFromA?renderB:renderA);
    pass.setPipeline(linePipeline); if (paused || time>=linesAt) pass.draw(512,128);
    pass.setPipeline(renderPipeline); pass.draw(6,PARTICLE_COUNT); pass.end();
    device.queue.submit([encoder.finish()]);
    readFromA=!readFromA; direct=false; pointer.pulse*=Math.exp(-dt*7);
    if (!paused) schedule();
  }
  function changeShape() {
    clearTimeout(shapeTimer); shape=(shape+1)%SHAPES.length; linesAt=time+.85;
    root.dataset.shape=String(shape);
    root.querySelector('.shape-number').textContent=String(shape+1).padStart(2,'0');
    root.querySelector('.shape-name').textContent=SHAPES[shape];
    status.textContent=`光のかたち：${SHAPES[shape]}`;
    schedule();
  }
  function pluckSound(energy) {
    if (!sound || !audioContext || audioContext.state!=='running') return;
    const now=audioContext.currentTime;
    const frequency=[220,261.63,329.63,392][shape];
    [1,1.5,2].forEach((harmonic,index)=>{
      const osc=audioContext.createOscillator(), gain=audioContext.createGain();
      osc.frequency.value=frequency*harmonic; osc.type='sine';
      gain.gain.setValueAtTime(0,now);
      gain.gain.linearRampToValueAtTime((.018+energy*.028)/(index+1),now+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,now+1.4);
      osc.connect(gain).connect(audioContext.destination); osc.start(now); osc.stop(now+1.5);
    });
  }
  function release(cancelled=false) {
    const result=releaseGesture(pointer.start,{x:pointer.x*aspect,y:pointer.y},cancelled);
    pointer.held=0; pointer.start=null; pointer.id=null; root.dataset.grabbing='false';
    pointer.pulse=result.energy;
    if (result.energy) {
      root.dataset.releases=String(Number(root.dataset.releases||0)+1);
      pluckSound(result.energy);
      if (result.changeShape) {
        if (paused) changeShape();
        else shapeTimer=setTimeout(changeShape,550);
      }
    }
    setHint(); schedule();
  }
  function updatePointer(event) {
    const rect=canvas.getBoundingClientRect();
    pointer.x=(event.clientX-rect.left)/rect.width*2-1;
    pointer.y=1-(event.clientY-rect.top)/rect.height*2;
    pointer.active=1;
    ring.style.left=`${event.clientX-rect.left}px`; ring.style.top=`${event.clientY-rect.top}px`;
    root.dataset.pointer='true'; schedule();
  }
  canvas.addEventListener('pointermove',event=>{
    if (pointer.id!==null && event.pointerId!==pointer.id) return;
    updatePointer(event);
  });
  canvas.addEventListener('pointerdown',event=>{
    if (!event.isPrimary || event.button!==0 || root.dataset.state!=='ready') return;
    clearTimeout(shapeTimer); updatePointer(event);
    pointer.originX=pointer.x; pointer.originY=pointer.y;
    pointer.start={x:pointer.x*aspect,y:pointer.y}; pointer.id=event.pointerId;
    pointer.held=1; pointer.pulse=0; root.dataset.grabbing='true';
    setHint('そのまま、はなす。'); canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup',event=>{
    if (event.pointerId!==pointer.id) return;
    updatePointer(event); release();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel',event=>{if(event.pointerId===pointer.id) release(true);});
  canvas.addEventListener('lostpointercapture',()=>{if(pointer.held) release(true);});
  canvas.addEventListener('pointerleave',()=>{if(!pointer.held){pointer.active=0;root.dataset.pointer='false';}});
  root.querySelector('.shape-button').addEventListener('click',changeShape);
  root.querySelector('.pluck-button').addEventListener('click',()=>{
    clearTimeout(shapeTimer);
    pointer.x=.3; pointer.y=.05; pointer.active=1;
    pointer.start={x:-.15*aspect,y:.05}; release();
  });
  function updateMotion() {
    motionButton.dataset.paused=String(paused);
    motionButton.setAttribute('aria-label',paused?'光を動かす':'光の動きを止める');
    root.dataset.motion=paused?'paused':'running';
    if(paused){cancelAnimationFrame(frame);frame=0;} else {lastTime=performance.now();schedule();}
  }
  motionButton.addEventListener('click',()=>{paused=!paused;updateMotion();});
  motionPreference.addEventListener('change',()=>{paused=motionPreference.matches;updateMotion();});
  soundButton.addEventListener('click',async()=>{
    try {
      if (!audioContext) audioContext=new AudioContext();
      await audioContext.resume(); sound=!sound;
      soundButton.dataset.sound=String(sound);
      soundButton.setAttribute('aria-label',sound?'音を消す':'音を入れる');
      if(sound) pluckSound(.3); else await audioContext.suspend();
    } catch(error) {status.textContent='この環境では音を再生できません。';}
  });
  document.querySelectorAll('.project-link').forEach(link=>{
    const light=()=>{tone=Number(link.dataset.tone);targetTone=1;schedule();};
    const gold=()=>{targetTone=0;schedule();};
    link.addEventListener('pointerenter',light);link.addEventListener('focus',light);
    link.addEventListener('pointerleave',gold);link.addEventListener('blur',gold);
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelAnimationFrame(frame);frame=0;release(true);}
    else {lastTime=performance.now();schedule();}
  });
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting;
    if(visible){lastTime=performance.now();schedule();}
    else{cancelAnimationFrame(frame);frame=0;}
  },{threshold:0}).observe(root);
  new ResizeObserver(()=>{direct=true;schedule();}).observe(canvas);

  try {
    if(!navigator.gpu) throw new Error('WebGPU is unavailable');
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter) throw new Error('No GPU adapter');
    device=await adapter.requestDevice();
    context=canvas.getContext('webgpu');
    const format=navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'premultiplied'});
    const targets=await makeLogoTargets();
    const usage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST;
    particleA=createBuffer(device,'Particles A',new Float32Array(PARTICLE_COUNT*4),usage);
    particleB=createBuffer(device,'Particles B',new Float32Array(PARTICLE_COUNT*4),usage);
    const targetBuffer=createBuffer(device,'Canonical logo targets',targets,usage);
    uniformBuffer=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const computeLayout=device.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
      {binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
      {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}}]});
    const renderLayout=device.createBindGroupLayout({entries:[
      {binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},
      {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}},
      {binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}}]});
    device.pushErrorScope('validation');
    const computeModule=device.createShaderModule({code:computeShader});
    const renderModule=device.createShaderModule({code:renderShader});
    computePipeline=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[computeLayout]}),compute:{module:computeModule,entryPoint:'main'}});
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[renderLayout]});
    const blend={color:{srcFactor:'one',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}};
    renderPipeline=device.createRenderPipeline({layout:pipelineLayout,vertex:{module:renderModule,entryPoint:'vertexMain'},fragment:{module:renderModule,entryPoint:'fragmentMain',targets:[{format,blend}]},primitive:{topology:'triangle-list'}});
    linePipeline=device.createRenderPipeline({layout:pipelineLayout,vertex:{module:renderModule,entryPoint:'lineVertex'},fragment:{module:renderModule,entryPoint:'lineFragment',targets:[{format,blend}]},primitive:{topology:'line-strip'}});
    const validationError=await device.popErrorScope();
    if(validationError) throw new Error(validationError.message);
    const computeGroup=(source,destination)=>device.createBindGroup({layout:computeLayout,entries:[
      {binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:destination}},
      {binding:2,resource:{buffer:targetBuffer}},{binding:3,resource:{buffer:uniformBuffer}}]});
    const renderGroup=buffer=>device.createBindGroup({layout:renderLayout,entries:[
      {binding:0,resource:{buffer}},{binding:1,resource:{buffer:targetBuffer}},{binding:2,resource:{buffer:uniformBuffer}}]});
    computeAtoB=computeGroup(particleA,particleB);computeBtoA=computeGroup(particleB,particleA);
    renderA=renderGroup(particleA);renderB=renderGroup(particleB);
    device.lost.then(info=>{if(info.reason!=='destroyed')unavailable(info.message);});
    device.addEventListener('uncapturederror',event=>unavailable(event.error.message));
    root.dataset.state='ready';root.dataset.releases='0';toolbar.hidden=false;
    lastTime=performance.now(); updateMotion(); schedule();
  } catch(error) {unavailable(error);}
}

if (typeof document!=='undefined') startExhibition();
