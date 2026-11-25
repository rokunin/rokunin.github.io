// The sound engine: every sound effect is synthesised at start-up (synth.ts, in a worker when the browser allows), then played
// with stereo and loudness from where its source is on screen and how far it is from the listener (the player's car).
import { THREE } from '../three.js';
import { audioLib } from './synth.ts';

export function createSfx({ camera, listenerPos }) {
  const AC = window.AudioContext || (window as any).webkitAudioContext;      // old Safari
  let ctx = null, master = null, sfxBus = null, loopBus = null, verbIn = null, ready = false;
  let SR = 44100, muted = false, roomVerb = 0, vol = 0.5;
  try { const v = parseFloat(localStorage.getItem('carproto.vol')); if (v >= 0 && v <= 1) vol = v; } catch (e) {}
  try { muted = localStorage.getItem('carproto.mute') === '1'; } catch (e) {}
  const bank = {}, voices = {}, lastPlay = {}, loops = {};
  const projV = new THREE.Vector3();

  // name -> recipe, variants, gain, voice limit, min gap between plays (s), reverb send
  const DEFS = {
    hoof:        { n: 4, g: 0.4,  max: 6,  gap: 0 },
    tick:        { n: 4, g: 0.2,  max: 8,  gap: 0.02 },
    shot:        { n: 4, g: 0.42, max: 6,  gap: 0.03, verb: 0.18 },
    hit_wood:    { n: 4, g: 0.35, max: 5,  gap: 0.025 },
    hit_stone:   { n: 4, g: 0.3,  max: 5,  gap: 0.025, verb: 0.15 },
    hit_flesh:   { n: 3, g: 0.45, max: 5,  gap: 0.03 },
    hit_dirt:    { n: 3, g: 0.25, max: 4,  gap: 0.03 },
    hit_boss:    { n: 3, g: 0.32, max: 4,  gap: 0.05, verb: 0.25 },
    crate_break: { n: 3, g: 0.7,  max: 4,  verb: 0.15 },
    growl:       { n: 3, g: 0.55, max: 3,  gap: 0.12 },
    growl_elite: { n: 2, g: 0.65, max: 2,  gap: 0.2,  verb: 0.2 },
    chomp:       { n: 3, g: 0.6,  max: 3,  gap: 0.05 },
    biter_die:   { n: 3, g: 0.7,  max: 4 },
    elite_die:   { n: 2, g: 0.85, max: 2,  verb: 0.35 },
    clang:       { n: 3, g: 0.6,  max: 3,  gap: 0.08, verb: 0.2 },
    explode:     { n: 1, g: 1.0,  max: 2,  verb: 0.4 },
    tongue:      { n: 2, g: 0.5,  max: 2 },
    slap:        { n: 2, g: 0.6,  max: 2 },
    whoosh:      { n: 3, g: 0.55, max: 4 },
    zap:         { n: 2, g: 0.6,  max: 2,  verb: 0.25 },
    jump:        { n: 2, g: 0.55, max: 2 },
    jump2:       { n: 2, g: 0.5,  max: 2 },
    land:        { n: 4, g: 0.6,  max: 3 },
    dig_down:    { n: 2, g: 0.7,  max: 2 },
    dig_up:      { n: 2, g: 0.7,  max: 2 },
    scratch:     { n: 4, g: 0.45, max: 3,  gap: 0.09 },
    pickup:      { n: 1, g: 0.7,  max: 2,  verb: 0.3 },
    heal:        { n: 1, g: 0.7,  max: 2,  verb: 0.3 },
    loot:        { n: 1, g: 0.5,  max: 2,  verb: 0.3 },
    boss_emerge: { n: 1, g: 1.0,  max: 1,  verb: 0.5 },
    boss_roar:   { n: 1, g: 0.8,  max: 1,  verb: 0.5 },
    tent_wind:   { n: 2, g: 0.5,  max: 3 },
    tent_slam:   { n: 3, g: 0.8,  max: 3,  verb: 0.35 },
    boss_lift:   { n: 1, g: 0.5,  max: 2,  verb: 0.3 },
    boss_die:    { n: 1, g: 1.0,  max: 1,  verb: 0.6 },
    door:        { n: 1, g: 0.8,  max: 2,  verb: 0.4 },
    nova:        { n: 2, g: 0.55, max: 2,  verb: 0.25 },
    mortar:      { n: 2, g: 0.6,  max: 2 },
    blast:       { n: 2, g: 0.85, max: 3,  verb: 0.35 },
    saw:         { n: 3, g: 0.35, max: 4,  gap: 0.05 },
    pop:         { n: 4, g: 0.5,  max: 5,  gap: 0.03 },
    spit:        { n: 2, g: 0.45, max: 3 },
    choir:       { n: 1, g: 0.8,  max: 1,  verb: 0.9 },
    laugh:       { n: 2, g: 1.0,  max: 3,  verb: 0.8 },
    chub:        { n: 4, g: 0.45, max: 4,  gap: 0.04 },
    eshot:       { n: 3, g: 0.4,  max: 6,  gap: 0.03 },
    wave:        { n: 1, g: 0.6,  max: 1,  verb: 0.5 },
  };
  const LOOPS = { engine: 'engine_loop', drill: 'drill_loop', grind: 'grind_loop', skid: 'skid_loop', wind: 'wind_loop', drone: 'drone_loop', hum: 'hum_loop', servo: 'servo_loop' };


  function makeVerb() {                               // stereo decaying-noise impulse response
    const len = Math.round(2.4 * SR), ir = ctx.createBuffer(2, len, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0, seed = 77 + ch;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const t = i / SR, k = 0.25 + 0.75 * Math.exp(-t / 0.4); lp += (seed / 2147483648 - 1 - lp) * k; d[i] = lp * Math.exp(-t / 0.55);
      }
    }
    const cv = ctx.createConvolver(); cv.buffer = ir; return cv;
  }

  function init() {
    if (ctx || !AC) { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); return; }
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = null; return; }
    SR = ctx.sampleRate;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    master = ctx.createGain(); master.gain.value = muted ? 0 : vol * 1.3;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    loopBus = ctx.createGain(); loopBus.gain.value = 0.9; loopBus.connect(master);
    const verb = makeVerb(); verbIn = ctx.createGain(); const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
    verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(master);
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    // most frequent first; synthesis runs in a Worker so the game never stalls (main-thread fallback)
    const jobs: [string, string][] = [['loop', 'engine'], ...Object.keys(DEFS).map((k): [string, string] => ['sfx', k]), ...Object.keys(LOOPS).filter(k => k !== 'engine').map((k): [string, string] => ['loop', k])];
    const t0 = performance.now(); let left = jobs.length, fellBack = false;
    const done = (kind, k, arrs) => {
      if (kind === 'loop') startLoop(k, arrs[0]); else if (!bank[k]) bank[k] = arrs.map(toBuffer);
      if (--left === 0) { ready = true; SFX.buildMs = Math.round(performance.now() - t0); }
    };
    const job = ([kind, k]) => ({ kind, k, name: kind === 'loop' ? LOOPS[k] : k, n: kind === 'loop' ? 1 : DEFS[k].n });
    const mainThread = () => {                       // no workers: a few recipes per tick
      if (fellBack) return; fellBack = true;
      const L = audioLib(SR), queue = jobs.filter(([kind, k]) => kind === 'loop' ? !loops[k] : !bank[k]); left = queue.length;
      const step = () => {
        const until = performance.now() + 10;
        while (queue.length && performance.now() < until) {
          const j = job(queue.shift()), out = [];
          for (let v = 0; v < j.n; v++) { const b = L.synth(j.name, v); out.push(j.kind === 'loop' ? L.normLoop(b, 0.8) : b); }
          done(j.kind, j.k, out);
        }
        if (queue.length) setTimeout(step, 0);
      };
      step();
    };
    try {
      const code = `const L = (${audioLib.toString()})(${SR});
        onmessage = e => { for (const j of e.data) { const out = [];
          for (let v = 0; v < j.n; v++) { const b = L.synth(j.name, v); out.push(j.kind === 'loop' ? L.normLoop(b, 0.8) : b); }
          postMessage({ kind: j.kind, k: j.k, out }, out.map(b => b.buffer)); } };`;
      const worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      worker.onmessage = e => { if (!fellBack) done(e.data.kind, e.data.k, e.data.out); };
      worker.onerror = () => mainThread();
      worker.postMessage(jobs.map(job));
      SFX.worker = true;
    } catch (e) { mainThread(); }
  }
  function toBuffer(data) { const b = ctx.createBuffer(1, data.length, SR); b.getChannelData(0).set(data); return b; }
  function startLoop(k, data) {
    if (loops[k]) return;
    const src = ctx.createBufferSource(); src.buffer = toBuffer(data); src.loop = true;
    const g = ctx.createGain(); g.gain.value = 0;
    let node = src;
    if (k === 'engine') { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 2; src.connect(f); node = f; loops[k] = { src, g, f }; }
    else loops[k] = { src, g };
    node.connect(g); g.connect(loopBus); src.start();
  }

  // stereo + loudness from where the thing is on screen and how far it is from the car
  function spatial(pos) {
    if (!pos) return [0, 1];
    projV.copy(pos).project(camera);
    const pan = THREE.MathUtils.clamp(projV.x * 0.7, -0.85, 0.85);
    const d = Math.hypot(pos.x - listenerPos().x, pos.z - listenerPos().z);
    let g = 1 / (1 + Math.pow(d / 20, 2));
    if (Math.abs(projV.x) > 1.1 || Math.abs(projV.y) > 1.1) g *= 0.55;
    return [pan, g];
  }

  function play(name, pos?, opt: { vol?: number, rate?: number, delay?: number } = {}) {
    if (!ctx || muted || ctx.state !== 'running') return;
    const list = bank[name], d = DEFS[name]; if (!list || !list.length) return;
    const now = ctx.currentTime;
    if (d.gap && lastPlay[name] && now - lastPlay[name] < d.gap) return;
    if ((voices[name] || 0) >= d.max) return;
    const [pan, dg] = spatial(pos);
    const gain = d.g * dg * (opt.vol == null ? 1 : opt.vol);
    if (gain < 0.01) return;
    lastPlay[name] = now; voices[name] = (voices[name] || 0) + 1;
    const src = ctx.createBufferSource(); src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = (opt.rate || 1) * (0.96 + Math.random() * 0.08);
    const g = ctx.createGain(); g.gain.value = gain;
    let out = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(g); out.connect(sfxBus);
    const send = (d.verb || 0.06) + roomVerb;
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send * gain; out.connect(s); s.connect(verbIn); }
    src.onended = () => { voices[name]--; try { out.disconnect(); } catch (e) {} };
    src.start(now + (opt.delay || 0));
  }

  // live loops: target gain / playback rate, smoothed
  function loop(k, gain, rate = 1, filterHz) {
    const L = loops[k]; if (!L || !ctx) return;
    const t = ctx.currentTime;
    L.g.gain.setTargetAtTime(muted ? 0 : gain, t, 0.06);
    L.src.playbackRate.setTargetAtTime(rate, t, 0.08);
    if (filterHz && L.f) L.f.frequency.setTargetAtTime(filterHz, t, 0.08);
  }
  function setRoom(k) { roomVerb = k; }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('carproto.mute', muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : vol * 1.3, ctx.currentTime, 0.03);
    return muted;
  }
  function setVolume(v) {
    vol = Math.min(1, Math.max(0, v)); muted = vol === 0;
    try { localStorage.setItem('carproto.vol', String(vol)); localStorage.setItem('carproto.mute', muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.setTargetAtTime(vol * 1.3, ctx.currentTime, 0.03);
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
  });
  const SFX = { init, play, loop, setRoom, toggleMute, setVolume, get volume() { return vol; }, get muted() { return muted; }, get ready() { return ready; },
           get ctx() { return ctx; }, get master() { return master; }, DEFS, LOOPS, buildMs: 0, worker: false };
  return SFX;
}
