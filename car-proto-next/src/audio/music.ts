// ---------- MUSIC: the recorded theme (see TH below). Behind it, as a fallback, a written score (Grieg, "In the Hall of the Mountain King") played live by synths ----------
//   level 0 plucked theme · 1 synthwave (arp, soft kick) · 2 full synthwave (lead, snare) · 3 metal (power-chord chug, double kick) · 4 dubstep (halftime, wobble bass)
// The sound engine (sfx.ts) is passed in: music plays through its context and master volume.

import { THREE } from '../three.js';

export function createMusic({ sfx }) {
  const BPM = [132, 144, 156, 168, 172], VOL = 0.5;
  // the score: [midi note, length in eighths], 0 = rest. Theme A in B minor, theme B a fifth up
  const A = [[59,1],[61,1],[62,1],[64,1],[66,1],[62,1],[66,2], [65,1],[61,1],[65,2],[64,1],[60,1],[64,2], [59,1],[61,1],[62,1],[64,1],[66,1],[62,1],[66,1],[71,1], [69,1],[66,1],[62,1],[66,1],[69,2],[0,2]];
  const B = [[66,1],[68,1],[70,1],[71,1],[73,1],[70,1],[73,2], [74,1],[70,1],[74,2],[73,1],[70,1],[73,2], [66,1],[68,1],[70,1],[71,1],[73,1],[70,1],[73,2], [74,1],[70,1],[74,2],[73,2],[0,2]];
  const lay = th => { const a = new Array(64).fill(null); let st = 0; for (const [m, l] of th) { if (m) a[st] = { m, len: l * 2 }; st += l * 2; } return a; };      // onto a grid of 16ths, 4 bars
  const SEC = { A: { th: lay(A), root: [47,47,49,48,47,47,50,50], ch: [[59,62,66],[59,62,66],[61,65,68],[60,64,67],[59,62,66],[59,62,66],[62,66,69],[62,66,69]] },
                B: { th: lay(B), root: [54,54,50,54,54,54,50,54], ch: [[66,70,73],[66,70,73],[62,66,70],[66,70,73],[66,70,73],[66,70,73],[62,66,70],[66,70,73]] } };
  const FORM = ['A', 'A', 'B', 'B'];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function build(ctx, out) {
    const bus = ctx.createGain(); bus.gain.value = VOL; bus.connect(out);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const curve = k => { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) c[i] = Math.tanh((i / 512 - 1) * k); return c; };
    const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[0]; };
    const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const F = (type, f, q?) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const SH = k => { const w = ctx.createWaveShaper(); w.curve = curve(k); w.oversample = '2x'; return w; };
    const gtr = chain(G(5), SH(6), F('lowpass', 3400), F('highpass', 110), F('peaking', 1400, 1), G(0.16), bus);      // guitar amp: drive, cab roll-off
    const wobOut = chain(SH(3), F('lowpass', 6000), G(0.3), bus);
    const dly = ctx.createDelay(1), fb = G(0.35), dlyIn = G(1); dlyIn.connect(dly); dly.connect(fb); fb.connect(dly); chain(dly, G(0.5), bus);      // synthwave echo
    const env = (g, t, v, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    const osc = (type, f, t, dur, det?) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det; o.start(t); o.stop(t + dur + 0.05); return o; };
    const noise = (t, dur) => { const n = ctx.createBufferSource(); n.buffer = nb; n.loop = true; n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05); return n; };
    function kick(t, v) { const o = osc('sine', 150, t, 0.3), g = G(0); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, v, 0.002, 0.26); chain(o, g, bus);
      const c = noise(t, 0.02), cg = G(0); env(cg, t, v * 0.3, 0.001, 0.015); chain(c, F('highpass', 2500), cg, bus); }
    function snare(t, v) { const n = noise(t, 0.2), g = G(0); env(g, t, v, 0.001, 0.17); chain(n, F('highpass', 1400), g, bus);
      const o = osc('triangle', 190, t, 0.12), og = G(0); o.frequency.exponentialRampToValueAtTime(120, t + 0.1); env(og, t, v * 0.7, 0.001, 0.1); chain(o, og, bus); }
    function hat(t, v, open?) { const n = noise(t, open ? 0.3 : 0.05), g = G(0); env(g, t, v, 0.001, open ? 0.28 : 0.04); chain(n, F('highpass', 7500), g, bus); }
    function pluck(t, m, dur, v) { const g = G(0), f = F('lowpass', 900, 2); f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.18); env(g, t, v, 0.004, Math.max(0.12, dur));
      osc('triangle', hz(m), t, dur + 0.1).connect(f); osc('sawtooth', hz(m), t, dur + 0.1, 6).connect(f); chain(f, g, bus); }
    function arp(t, m, v) { const g = G(0), f = F('lowpass', 2600, 4); f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.12); env(g, t, v, 0.003, 0.13);
      osc('sawtooth', hz(m), t, 0.16, -7).connect(f); osc('sawtooth', hz(m), t, 0.16, 7).connect(f); f.connect(g); g.connect(bus); g.connect(dlyIn); }
    function lead(t, m, dur, v, scream?) { const g = G(0), f = F('lowpass', scream ? 5200 : 3000, scream ? 6 : 1); env(g, t, v, 0.01, dur);
      for (const d of [-9, 9]) { const o = osc(scream ? 'sawtooth' : 'square', hz(m), t, dur, d); if (scream) { o.frequency.setValueAtTime(hz(m) * 0.94, t); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.05); } o.connect(f); }
      f.connect(g); g.connect(bus); g.connect(dlyIn); }
    function chug(t, m, dur, v, mute) { const g = G(0), f = F('lowpass', mute ? 900 : 5000); env(g, t, v, 0.002, mute ? 0.07 : dur);      // power chord: root, fifth, octave into the amp
      for (const [st, d] of [[0, -6], [0, 6], [7, 0], [12, 0]]) osc('sawtooth', hz(m + st), t, mute ? 0.1 : dur, d).connect(f); chain(f, g, gtr); }
    function wob(t, m, dur, n, v) { const g = G(0), f = F('lowpass', 200, 9); g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + dur - 0.02); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const w = dur / n; for (let i = 0; i < n; i++) { f.frequency.setValueAtTime(140, t + i * w); f.frequency.exponentialRampToValueAtTime(2600, t + (i + 0.45) * w); f.frequency.exponentialRampToValueAtTime(140, t + (i + 1) * w - 0.001); }
      osc('sawtooth', hz(m), t, dur, -12).connect(f); osc('square', hz(m), t, dur, 12).connect(f); osc('sawtooth', hz(m + 12), t, dur).connect(f); chain(f, g, wobOut);
      const sg = G(0); env(sg, t, v * 0.9, 0.01, dur); chain(osc('sine', hz(m - 12), t, dur), sg, bus); }
    dly.delayTime.value = 0.3;
    // Every level cycles through variants, one per 4-bar section, so guitars and the rest come in and drop out all game long.
    // p plucked theme · b bass roots · a/A arp 8ths/16ths · k/K/D kick: halves, four-on-floor, double · s snare · h hats · l lead · S guitar stabs on the bar line
    // T guitar plays the theme · C full chug · W dubstep block (halftime drums, wobble) · X screaming lead
    const VAR = [['p', 'p', 'pS', 'p', 'pT', 'p'],
                 ['pkha', 'pkhaS', 'khaT', 'pkha', 'pkhaST', 'bkhA'],
                 ['lbKsha', 'lbKshAS', 'TbKsh', 'lbKshAT', 'pkaS', 'CbKshl', 'lbKshA', 'TKshAl'],
                 ['CDshl', 'TbKshAl', 'CDsh', 'SbkhX', 'CDshl', 'lbKshAS'],
                 ['WX', 'WXS', 'CDshl', 'W', 'WXT', 'SbkhX']];
    const GV = [0.28, 0.36, 0.45, 0.5, 0.5];              // how hard the guitar is hit at each level
    function step(i, t, L, s16) {                         // one sixteenth of the arrangement at level L
      const sc = Math.floor(i / 64), S = SEC[FORM[sc % FORM.length]], st = i % 64, b = st % 16, hb = Math.floor(st / 8), n = S.th[st], root = S.root[hb], ch = S.ch[hb], e8 = s16 * 2;
      const v = VAR[L][sc % VAR[L].length], has = c => v.includes(c), gv = GV[L];
      dly.delayTime.setValueAtTime(s16 * 3, t);
      if (has('p') && n) pluck(t, n.m - 12, n.len * s16 * 0.8, 0.45);
      if (has('b') && b % 2 === 0) pluck(t, has('C') || has('D') ? root - 12 : root, e8 * 0.75, 0.4);
      if (has('a') && b % 2 === 0) arp(t, ch[(b / 2) % 3] + 12, 0.07);
      if (has('A')) arp(t, ch[[0, 1, 2, 1][b % 4]] + 12, 0.055);
      if (has('k') && b % 8 === 0) kick(t, 0.5);
      if (has('K') && b % 4 === 0) kick(t, 0.6);
      if (has('D')) kick(t, b % 4 === 0 ? 0.6 : b % 2 === 0 ? 0.45 : 0.3);
      if (has('s') && (b === 4 || b === 12)) snare(t, has('D') ? 0.38 : 0.3);
      if (has('h') && b % 2 === 0) hat(t, b % 4 === 2 ? 0.15 : 0.08);
      if (has('l') && n) lead(t, has('C') ? n.m + 12 : n.m, n.len * s16 * 0.85, has('C') ? 0.06 : 0.11);
      if (has('X') && n) lead(t, n.m + 12, n.len * s16 * 0.8, 0.07, true);
      if (has('S') && b === 0) chug(t, root, s16 * 14, gv * 0.9, false);                       // one chord left ringing over the bar
      if (has('T') && n) chug(t, n.m - 12, Math.min(n.len, 3) * s16 * 0.9, gv, false);
      if (has('C')) { if (n) chug(t, n.m - 12, Math.min(n.len, 3) * s16 * 0.9, gv, false); else if (b % 2 === 1) chug(t, root, s16, gv * 0.9, true); }
      if (has('W')) { if (b === 0 || b === 10 || (st >= 48 && b === 6)) kick(t, 0.75); if (b === 8) snare(t, 0.5); if (b % 4 === 2) hat(t, 0.1);
        if (b % 4 === 0) wob(t, root - 12, s16 * 4, st >= 56 ? 8 : [1, 2, 4, 3][(b / 4 + Math.floor(st / 16)) % 4], 0.5); }
      if (st === 0 && (has('C') || has('W'))) hat(t, 0.26, true);
    }
    return { bus, step };
  }
  let eng = null, next = 0, idx = 0, lvl = 0, on = true, applied = null;
  try { on = localStorage.getItem('carproto.music') !== '0'; } catch (e) {}
  // The theme: a recorded track ("Rubber Riffs in the Dark"). It is the game's music; the synth band above only plays if the file cannot be had.
  // The track is cut along its bar lines into five tiers, from the drumless opening to the finale, and the player moves between them with the action:
  // up at the very next bar line, down once things have been quieter for a while. Inside a tier the music runs on and loops.
  //   G[k] is where bar k starts in the file (measured: the drum hits, 2.49 s a bar). A tier is bars a..b, looping back to `loop`.
  const AD = { G: [2.228, 4.709, 7.197, 9.681, 12.154, 14.639, 17.116, 19.740, 22.232, 24.721, 27.206, 29.707, 32.192, 34.672, 37.172, 39.657, 42.157, 44.642, 47.126, 49.623, 52.107, 54.603, 57.089, 59.584, 62.066, 64.562, 67.046, 69.542, 72.027, 74.522, 77.005, 79.501, 81.997, 84.481, 86.978, 89.462, 91.958, 94.443, 96.940, 99.425, 101.921, 104.417, 106.902, 109.397, 111.881, 114.379, 116.865, 119.361, 121.845, 124.344, 126.829, 129.325, 131.810, 134.304, 136.798, 139.282, 141.778, 144.263, 146.759, 149.243, 151.725, 154.221, 156.706, 159.205, 161.701, 164.200, 166.684, 169.189, 171.677, 174.161, 176.657, 179.151, 181.647, 184.143, 186.627, 189.124, 191.631, 194.265, 196.763],
    land: 0.07506,                                       // where the sound starts in the file as it was measured; a decoder that keeps the MP3 padding starts later, and everything shifts with it
    tiers: [{ a: 0, b: 7, loop: 0, calm: true },         // 0  the opening, no drums: the start screen
            { a: 7, b: 23, loop: 7 },                    // 1  light drums, then the riff comes in: the warm-up and a quiet field
            { a: 15, b: 39, loop: 15 },                  // 2  the main riff
            { a: 39, b: 59, loop: 39 },                  // 3  brighter and busier
            { a: 60, b: 76, loop: 64 }],                 // 4  the stabs and the finale
    PRE: 0.02, FIN: 0.015, FOUT: 0.04, SOFT: 0.35, DWELL: 10 };
  const TH = { url: 'assets/rubber_riffs.mp3', vol: [0.85, 0.64, 0.64, 0.64, 0.66], cut: [2600, 20000, 20000, 20000, 20000], state: 'idle', mode: 'adaptive', a: null, g: null, f: null, t0: 0, tryT: 0, lv: -1, wa: false,
               buf: null, shift: 0, T: 0, k: 0, tBar: 0, since: 0, cur: null, log: [] };
  const barT = k => (k === 0 ? 0.1 : AD.G[k]) + TH.shift;
  function thGraph(ctx) { if (TH.g) return; TH.f = ctx.createBiquadFilter(); TH.f.type = 'lowpass'; TH.f.frequency.value = TH.cut[0]; TH.g = ctx.createGain(); TH.g.gain.value = 0; TH.f.connect(TH.g); TH.g.connect(sfx.master); }
  function thLoad(ctx) {                                 // fetch and decode the whole track once; cuts need sample-accurate starts, which a streaming <audio> cannot give
    TH.state = 'loading'; TH.t0 = ctx.currentTime;
    const fail = () => { if (TH.mode === 'adaptive') { TH.mode = 'stream'; TH.state = 'idle'; } };      // no buffer: fall back to playing the file straight through
    try { fetch(TH.url).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(ab => new Promise<AudioBuffer>((ok, no) => { const pr = ctx.decodeAudioData(ab, ok, no); if (pr && pr.catch) pr.catch(no); })).then(buf => {
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, n = Math.min(L.length, Math.floor(buf.sampleRate * 0.4)); let at = -1;
      for (let i = 0; i < n; i++) if (Math.abs(L[i]) > 0.004 || Math.abs(R[i]) > 0.004) { at = i / buf.sampleRate; break; }
      const sh = at < 0 ? 0 : at - AD.land; TH.shift = sh > -0.01 && sh < 0.08 ? sh : 0; TH.buf = buf; TH.state = 'ready'; }).catch(fail); } catch (e) { fail(); }
  }
  function thPlay(ctx, bar, when, soft) {                // a new voice from the top of `bar`, landing on the bar line at `when`
    const src = ctx.createBufferSource(), g = ctx.createGain(), t0 = Math.max(ctx.currentTime, when - AD.PRE); src.buffer = TH.buf; src.connect(g); g.connect(TH.f);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + (soft ? AD.SOFT : AD.FIN)); src.start(t0, Math.max(0, barT(bar) - AD.PRE - (when - AD.PRE - t0)));
    return { src, g };
  }
  function thStop(ctx, v, at, soft) { if (!v) return; const t0 = Math.max(ctx.currentTime, at - (soft ? 0.02 : 0.03)), d = soft ? AD.SOFT : AD.FOUT;
    try { v.g.gain.cancelScheduledValues(t0); v.g.gain.setValueAtTime(1, t0); v.g.gain.linearRampToValueAtTime(0, t0 + d); v.src.stop(t0 + d + 0.05); } catch (e) {} }
  function thMix(ctx, at) { const muf = M.muffle && TH.T > 0;      // dead: the music stays where it is and goes dull and quiet until you are back
    TH.g.gain.setTargetAtTime(on ? TH.vol[TH.T] * (muf ? 0.55 : 1) : 0, at, 0.25); TH.f.frequency.setTargetAtTime(muf ? 700 : TH.cut[TH.T], at, 0.2); TH.lv = TH.T + (muf ? 10 : 0); }
  function adaptiveTick(ctx) {
    thGraph(ctx);
    if (TH.state === 'idle') thLoad(ctx);
    if (TH.state === 'loading') { if (ctx.currentTime - TH.t0 > 20 && TH.mode === 'adaptive') { TH.mode = 'stream'; TH.state = 'idle'; } return true; }
    const now = ctx.currentTime, want = THREE.MathUtils.clamp(M.level | 0, 0, 4);
    if (!on) { if (TH.cur) { thStop(ctx, TH.cur, now + 0.03, true); TH.cur = null; TH.state = 'ready'; } return true; }
    if (TH.state === 'ready') { TH.T = want; TH.k = AD.tiers[want].a; TH.tBar = now + 0.12; TH.since = TH.tBar; TH.cur = thPlay(ctx, TH.k, TH.tBar, true); TH.state = 'on'; thMix(ctx, now); TH.log.push([+now.toFixed(2), 'start', want, TH.k]); }
    if (TH.lv !== TH.T + (M.muffle && TH.T > 0 ? 10 : 0)) thMix(ctx, now);
    let nxt = TH.tBar + barT(TH.k + 1) - barT(TH.k);
    while (nxt < now + 0.02 && TH.k < AD.G.length - 3) { TH.k++; TH.tBar = nxt; nxt = TH.tBar + barT(TH.k + 1) - barT(TH.k); }      // the tab slept through some bar lines: the voice played on, catch the counter up
    if (nxt - now > 0.3) return true;                    // decide a quarter of a second ahead of the bar line
    const tier = AD.tiers[TH.T]; let jump = null;
    if (want !== TH.T && (want > TH.T || want === 0 || nxt - TH.since >= AD.DWELL)) {
      const W = AD.tiers[want];
      if (!W.calm && !tier.calm && TH.k + 1 >= W.a && TH.k + 1 < W.b) { TH.T = want; TH.since = nxt; thMix(ctx, nxt); TH.log.push([+nxt.toFixed(2), 'adopt', want, TH.k + 1]); }      // already inside that tier's bars: no cut needed
      else jump = [want, W.a]; }
    if (!jump && (TH.k + 1 >= AD.tiers[TH.T].b || TH.k >= AD.G.length - 3)) jump = [TH.T, AD.tiers[TH.T].loop];
    if (jump) { const soft = !!(AD.tiers[jump[0]].calm || tier.calm);
      thStop(ctx, TH.cur, nxt, soft); TH.cur = thPlay(ctx, jump[1], nxt, !!AD.tiers[jump[0]].calm);
      TH.log.push([+nxt.toFixed(2), jump[0] === TH.T ? 'loop' : 'jump', jump[0], jump[1]]); if (TH.log.length > 40) TH.log.shift();
      if (jump[0] !== TH.T) { TH.T = jump[0]; TH.since = nxt; thMix(ctx, nxt); } TH.k = jump[1]; } else TH.k++;
    TH.tBar = nxt; return true;
  }
  function streamTick(ctx) {                             // the plain fallback: the file straight through, looped, on an <audio> element
    thGraph(ctx);
    if (TH.state === 'idle') { TH.state = 'loading'; TH.t0 = ctx.currentTime;
      const a = TH.a = new Audio(); a.loop = true; a.preload = 'auto';
      a.addEventListener('error', () => { TH.state = 'failed'; }); a.addEventListener('playing', () => { TH.state = 'on'; });
      a.src = TH.url;
      try { ctx.createMediaElementSource(a).connect(TH.f); TH.wa = true; } catch (e) { TH.wa = false; } }      // no Web Audio route: the element's own volume will do
    if (TH.state === 'failed') return false;
    if (TH.state === 'loading' && ctx.currentTime - TH.t0 > 12) { TH.state = 'failed'; try { TH.a.pause(); } catch (e) {} return false; }      // too slow to arrive: let the band play
    const a = TH.a, l = THREE.MathUtils.clamp(M.level | 0, 0, 4); TH.T = Math.min(l, 1);
    if (on && a.paused && ctx.currentTime > TH.tryT) { TH.tryT = ctx.currentTime + 1; const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); }
    if (TH.lv !== (on ? l : -2)) { TH.lv = on ? l : -2; if (TH.wa) { TH.g.gain.setTargetAtTime(on ? [0.34, 0.5, 0.6, 0.7, 0.78][l] : 0, ctx.currentTime, 0.5); TH.f.frequency.setTargetAtTime(l ? 20000 : 1100, ctx.currentTime, 0.4); } }
    if (!TH.wa) a.volume = Math.min(1, (on ? [0.34, 0.5, 0.6, 0.7, 0.78][l] : 0) * (sfx.muted ? 0 : sfx.volume * 1.3));
    return true;
  }
  if ((navigator as any).deviceMemory && (navigator as any).deviceMemory < 4) TH.mode = 'stream';      // the decoded track is ~75 MB of samples: too much for a small phone
  const themeTick = ctx => TH.mode === 'adaptive' ? adaptiveTick(ctx) : streamTick(ctx);
  const M = { level: 0, muffle: false, build, BPM,
    get on() { return on; }, get theme() { return TH; },
    toggle() { on = !on; try { localStorage.setItem('carproto.music', on ? '1' : '0'); } catch (e) {} return on; },
    tick() {
      const ctx = sfx.ctx; if (!ctx || !sfx.master || ctx.state !== 'running') return;
      const themed = themeTick(ctx);                     // the recorded theme has the floor; the band stays silent unless it failed
      if (!eng) { eng = build(ctx, sfx.master); next = ctx.currentTime + 0.1; }
      if (applied !== (on && !themed)) { applied = on && !themed; eng.bus.gain.setTargetAtTime(applied ? VOL : 0, ctx.currentTime, 0.08); }
      if (!on || themed) { next = ctx.currentTime + 0.1; return; }
      if (next < ctx.currentTime) next = ctx.currentTime + 0.05;       // fell behind (tab was asleep): pick up from now
      while (next < ctx.currentTime + 0.3) { if (idx % 16 === 0) lvl = THREE.MathUtils.clamp(M.level | 0, 0, 4);      // the arrangement changes on the bar line
        const s16 = 60 / BPM[lvl] / 4; eng.step(idx, next, lvl, s16); next += s16; idx++; }
    } };
  setInterval(() => M.tick(), 120);
  return M;
}
