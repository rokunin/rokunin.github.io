// The game's sound synthesis: pure DSP and the recipe of every sound, at sample rate SR. No DOM, no THREE, no imports:
// SFX hands the same source to a Web Worker as text (audioLib.toString()), so the function must stay self-contained.
export function audioLib(SR) {
  // ---- DSP toolkit: everything works on Float32Arrays at SR ----
  function rng(seed) {                                   // mulberry32
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const N = sec => new Float32Array(Math.max(1, Math.round(sec * SR)));
  function noise(sec, r, color = 'white') {
    const b = N(sec); let l = 0, p0 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < b.length; i++) {
      const w = r() * 2 - 1;
      if (color === 'brown') { l = (l + 0.02 * w) / 1.02; b[i] = l * 3.5; }
      else if (color === 'pink') { p0 = 0.997 * p0 + 0.029591 * w; p1 = 0.985 * p1 + 0.032534 * w; p2 = 0.95 * p2 + 0.048056 * w; b[i] = (p0 + p1 + p2 + 0.05 * w) * 2.2; }
      else b[i] = w;
    }
    return b;
  }
  // RBJ biquad; f may be a number or a function of time (coefficients refreshed every 16 samples)
  function filt(b, type, f, q = 0.707) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
    const fn = typeof f === 'function' ? f : null;
    const coef = hz => {
      const w = 2 * Math.PI * Math.min(Math.max(hz, 10), SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
      if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
      else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
      else { b0 = al; b1 = 0; b2 = -al; }                // band-pass, 0 dB peak
      b0 /= a0; b1 /= a0; b2 /= a0; a1 = -2 * c / a0; a2 = (1 - al) / a0;
    };
    coef(fn ? fn(0) : f);
    for (let i = 0; i < b.length; i++) {
      if (fn && (i & 15) === 0) coef(fn(i / SR));
      const x = b[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; b[i] = y;
    }
    return b;
  }
  function env(b, fn) { for (let i = 0; i < b.length; i++) b[i] *= fn(i / SR); return b; }
  const ad = (a, d) => t => t < a ? t / a : Math.exp(-(t - a) / d);          // attack / exponential decay
  const exp = (from, to, tau) => t => to + (from - to) * Math.exp(-t / tau);    // exponential glide
  function osc(sec, f, shape = 'sine') {
    const b = N(sec), fn = typeof f === 'function' ? f : () => f; let ph = 0;
    for (let i = 0; i < b.length; i++) {
      ph += fn(i / SR) / SR; ph -= Math.floor(ph);
      b[i] = shape === 'sine' ? Math.sin(ph * 6.283185) : shape === 'saw' ? ph * 2 - 1
           : shape === 'square' ? (ph < 0.5 ? 1 : -1) : 1 - 4 * Math.abs(ph - 0.5);
    }
    return b;
  }
  // modal synthesis: struck object = sum of exponentially decaying partials [freq, amp, decay]
  function modes(sec, list, r) {
    const b = N(sec);
    for (const [f, a, d] of list) {
      const ph = r ? r() * 6.28 : 0, w = 6.283185 * f / SR;
      for (let i = 0; i < b.length; i++) b[i] += a * Math.sin(w * i + ph) * Math.exp(-i / SR / d);
    }
    return b;
  }
  function mix(dst, src, g = 1, at = 0) {
    const o = Math.round(at * SR);
    for (let i = 0; i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * g;
    return dst;
  }
  function drive(b, k) { const n = Math.tanh(k); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * k) / n; return b; }
  function norm(b, peak = 0.9) {
    let m = 1e-6; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
    const k = peak / m; for (let i = 0; i < b.length; i++) b[i] *= k;
    const f = Math.min(b.length, Math.round(0.004 * SR));                       // de-click the tail
    for (let i = 0; i < f; i++) b[b.length - 1 - i] *= i / f;
    return b;
  }
  // seamless loop: render a little longer and cross-fade the overhang into the start
  function looped(sec, gen) {
    const x = Math.round(0.08 * SR), full = gen(sec + x / SR), out = N(sec);
    for (let i = 0; i < out.length; i++) out[i] = full[i];
    for (let i = 0; i < x; i++) { const k = i / x; out[i] = out[i] * k + full[out.length + i] * (1 - k); }
    return out;
  }
  // a cloud of tiny clicks: debris, gravel, crackle
  function grains(sec, n, r, f0, f1, dec, spread = 1) {
    const b = N(sec);
    for (let k = 0; k < n; k++) {
      const t = Math.pow(r(), spread) * sec * 0.85, g = noise(dec * 6, r);
      filt(g, 'bp', f0 + r() * (f1 - f0), 1.6); env(g, ad(0.0004, dec));
      mix(b, g, 0.4 + r() * 0.6, t);
    }
    return b;
  }
  const semis = n => Math.pow(2, n / 12);

  // ---- recipes: (r, v) => Float32Array; r is a seeded rng, v the variant index ----
  const R = {
    shot(r) {
      const len = 0.24, o = N(len), p = 0.9 + r() * 0.2;
      const body = noise(len, r); filt(body, 'bp', exp(1700 * p, 320, 0.05), 0.9); env(body, ad(0.0006, 0.032));
      const thump = osc(len, exp(170 * p, 44, 0.012)); env(thump, ad(0.0008, 0.05));
      const crack = noise(0.04, r); filt(crack, 'hp', 3200); env(crack, ad(0.0002, 0.005));
      const mech = modes(0.06, [[2300 * p, 0.3, 0.006], [3900 * p, 0.2, 0.004]], r);
      mix(o, body, 1.0); mix(o, thump, 0.9); mix(o, crack, 0.55); mix(o, mech, 0.4, 0.012);
      return norm(filt(drive(o, 2.2), 'hp', 45), 0.95);
    },
    hit_wood(r) {
      const f = 330 + r() * 180, o = modes(0.16, [[f, 1, 0.03], [f * 2.31, 0.55, 0.017], [f * 4.2, 0.25, 0.009]], r);
      const n = noise(0.06, r); filt(n, 'bp', 1400 + r() * 600, 1.2); env(n, ad(0.0005, 0.012));
      return norm(mix(o, n, 0.7), 0.7);
    },
    hit_stone(r, v) {
      const len = v >= 2 ? 0.42 : 0.12, o = N(len);
      const n = noise(0.05, r); filt(n, 'hp', 2600); env(n, ad(0.0002, 0.006)); mix(o, n, 1);
      const b = noise(0.08, r); filt(b, 'bp', 1900 + r() * 900, 1.4); env(b, ad(0.0005, 0.018)); mix(o, b, 0.7);
      if (v >= 2) {                                     // every other variant ricochets
        const f0 = 2600 + r() * 1400, rc = osc(0.36, t => f0 * (0.55 + 0.45 * Math.exp(-t / 0.25)) * (1 + 0.012 * Math.sin(t * 90)));
        env(rc, ad(0.01, 0.1)); mix(o, rc, 0.32, 0.015);
      }
      return norm(o, 0.65);
    },
    hit_flesh(r) {
      const o = N(0.2), n = noise(0.2, r); filt(n, 'lp', 600); env(n, ad(0.001, 0.045)); mix(o, n, 1);
      const s = osc(0.2, exp(120, 55, 0.04)); env(s, ad(0.001, 0.05)); mix(o, s, 0.8);
      const q = noise(0.2, r); filt(q, 'bp', exp(1200 + r() * 400, 260, 0.06), 5); env(q, ad(0.004, 0.06)); mix(o, q, 0.9);
      return norm(drive(o, 1.6), 0.7);
    },
    hit_dirt(r) {
      const o = noise(0.12, r); filt(o, 'lp', 1300); env(o, ad(0.0006, 0.022));
      mix(o, grains(0.12, 5, r, 1500, 3500, 0.004), 0.35);
      return norm(o, 0.35);
    },
    hit_boss(r) {
      const f = 480 + r() * 120, o = modes(0.22, [[f, 1, 0.05], [f * 1.51, 0.6, 0.035], [f * 2.33, 0.35, 0.02], [f * 3.9, 0.2, 0.01]], r);
      const n = noise(0.03, r); filt(n, 'hp', 2400); env(n, ad(0.0002, 0.004));
      return norm(mix(o, n, 0.6), 0.55);
    },
    crate_break(r) {
      const len = 0.75, o = N(len);
      const th = osc(len, exp(100, 46, 0.03)); env(th, ad(0.001, 0.07)); mix(o, th, 0.9);
      const lo = noise(len, r); filt(lo, 'lp', 420); env(lo, ad(0.002, 0.09)); mix(o, lo, 0.9);
      for (let k = 0; k < 9; k++) {                     // planks cracking one after another
        const t = Math.pow(r(), 1.6) * 0.32, f = 300 + r() * 700;
        const c = modes(0.09, [[f, 1, 0.018], [f * 2.4, 0.5, 0.01], [f * 3.9, 0.3, 0.006]], r);
        const s = noise(0.03, r); filt(s, 'hp', 1600); env(s, ad(0.0002, 0.004)); mix(c, s, 0.8);
        mix(o, c, 0.4 + r() * 0.5, t);
      }
      mix(o, grains(len, 26, r, 1800, 5000, 0.004, 1.8), 0.5);
      return norm(drive(o, 1.4), 0.9);
    },
    growl(r, v, elite) {
      const len = elite ? 1.0 : 0.72, f0 = elite ? 46 + r() * 8 : 72 + r() * 22, o = N(len);
      const saw = osc(len, t => f0 * (1 + 0.22 * Math.sin(t * 6.283 * (3 + r() * 0.01))) * (0.85 + 0.35 * t / len), 'saw');
      env(saw, t => 0.6 + 0.4 * Math.sin(t * 6.283 * (elite ? 18 : 27)));           // throat flutter
      const f1 = Float32Array.from(saw), f2 = Float32Array.from(saw);
      filt(f1, 'bp', elite ? 380 : 520, 3); filt(f2, 'bp', elite ? 900 : 1150, 4);    // two formants
      mix(o, f1, 1.2); mix(o, f2, 0.7); mix(o, filt(Float32Array.from(saw), 'lp', 300), 0.5);
      const br = noise(len, r); filt(br, 'bp', 900, 1.5); mix(o, br, 0.12);
      env(o, t => Math.min(1, t / 0.07) * Math.exp(-Math.max(0, t - len * 0.45) / (len * 0.25)));
      drive(o, elite ? 3.2 : 2.6);
      if (elite) {                                     // crystal shimmer on top
        const sh = N(len);
        for (let k = 0; k < 6; k++) mix(sh, osc(len, 2200 + r() * 2600), 0.18);
        env(sh, t => (0.5 + 0.5 * Math.sin(t * 6.283 * 9)) * Math.min(1, t / 0.2) * Math.exp(-t / 0.5));
        mix(o, sh, 0.5);
      }
      return norm(o, 0.8);
    },
    growl_elite(r, v) { return R.growl(r, v, true); },
    chomp(r) {
      const o = N(0.26);
      for (const t of [0, 0.075 + r() * 0.02]) {
        const tee = noise(0.04, r); filt(tee, 'bp', 2600 + r() * 800, 1.2); env(tee, ad(0.0002, 0.01));
        const cr = noise(0.08, r); filt(cr, 'lp', 800); env(cr, ad(0.0005, 0.03));
        const lo = osc(0.08, exp(150, 80, 0.03)); env(lo, ad(0.0005, 0.03));
        mix(o, tee, 0.8, t); mix(o, cr, 0.9, t); mix(o, lo, 0.7, t);
      }
      return norm(drive(o, 1.8), 0.8);
    },
    biter_die(r, v, elite) {
      const len = elite ? 1.6 : 0.65, o = N(len);
      const sq = noise(0.4, r); filt(sq, 'bp', exp(1300, 180, 0.09), 3); env(sq, ad(0.002, 0.12)); mix(o, sq, 1.1);
      const lo = osc(0.5, exp(elite ? 120 : 170, elite ? 26 : 40, 0.1)); env(lo, ad(0.001, elite ? 0.32 : 0.14)); mix(o, lo, 1);
      const pop = noise(0.03, r); filt(pop, 'hp', 900); env(pop, ad(0.0002, 0.006)); mix(o, pop, 0.8);
      mix(o, grains(0.5, 10, r, 600, 2400, 0.008, 1.5), 0.5, 0.02);
      if (elite) for (let k = 0; k < 22; k++) {         // crystal crown shatters
        const f = 2200 + r() * 5200, p = modes(0.6, [[f, 1, 0.08 + r() * 0.3], [f * 2.7, 0.3, 0.05]], r);
        mix(o, p, 0.07 + r() * 0.08, Math.pow(r(), 2) * 0.25);
      }
      return norm(drive(o, 1.5), 0.85);
    },
    elite_die(r, v) { return R.biter_die(r, v, true); },
    clang(r) {
      const f = 170 + r() * 70, ratios = [1, 2.76, 5.4, 8.93, 13.34], amps = [1, 0.6, 0.42, 0.25, 0.15], dec = [0.38, 0.26, 0.18, 0.12, 0.07];
      const o = modes(0.6, ratios.map((k, i) => [f * k * (1 + (r() - 0.5) * 0.02), amps[i], dec[i]]), r);
      const n = noise(0.04, r); filt(n, 'hp', 1500); env(n, ad(0.0002, 0.008)); mix(o, n, 1.2);
      const th = osc(0.15, exp(130, 60, 0.03)); env(th, ad(0.001, 0.04)); mix(o, th, 0.8);
      return norm(drive(o, 1.3), 0.85);
    },
    explode(r) {
      const len = 2.2, o = N(len);
      const n = noise(len, r); filt(n, 'lp', exp(1400, 110, 0.35)); env(n, ad(0.003, 0.5)); mix(o, n, 1.3);
      const sub = osc(len, exp(80, 26, 0.25)); env(sub, ad(0.002, 0.55)); mix(o, sub, 1);
      mix(o, grains(1.6, 70, r, 1500, 4800, 0.003, 2.2), 0.55, 0.03);
      const cl = modes(0.8, [[260, 1, 0.3], [717, 0.5, 0.2], [1405, 0.3, 0.12]], r); mix(o, cl, 0.35, 0.05);
      return norm(drive(o, 2.0), 0.95);
    },
    tongue(r) {
      const o = N(0.26), n = noise(0.26, r); filt(n, 'bp', t => 450 + 3200 * Math.min(1, t / 0.12), 4);
      env(n, ad(0.004, 0.06)); mix(o, n, 1);
      const pl = osc(0.2, t => 520 + 900 * Math.min(1, t / 0.08)); env(pl, ad(0.002, 0.04)); mix(o, pl, 0.5);
      return norm(o, 0.6);
    },
    slap(r) {
      const o = N(0.24), n = noise(0.05, r); filt(n, 'lp', 2000); env(n, ad(0.0003, 0.018)); mix(o, n, 1);
      const lo = osc(0.12, exp(240, 110, 0.03)); env(lo, ad(0.0005, 0.04)); mix(o, lo, 0.7);
      const sq = noise(0.2, r); filt(sq, 'bp', exp(1600, 420, 0.05), 5); env(sq, ad(0.003, 0.05)); mix(o, sq, 0.9, 0.005);
      return norm(o, 0.7);
    },
    whoosh(r) {
      const len = 0.34 + r() * 0.16, o = noise(len, r, 'pink');
      filt(o, 'bp', t => 300 + 1500 * Math.sin(Math.PI * Math.min(1, t / len)), 1.1);
      env(o, t => Math.pow(Math.sin(Math.PI * Math.min(1, t / len)), 2));
      return norm(o, 0.5);
    },
    zap(r) {
      const o = N(0.45), s = osc(0.45, exp(1100, 160, 0.1), 'saw'); filt(s, 'bp', exp(2400, 400, 0.12), 2); env(s, ad(0.002, 0.14)); mix(o, s, 1);
      const n = noise(0.45, r); filt(n, 'bp', 3000, 1); env(n, t => Math.exp(-t / 0.08) * (0.5 + 0.5 * Math.sign(Math.sin(t * 6.283 * 60)))); mix(o, n, 0.5);
      return norm(drive(o, 2.4), 0.75);
    },
    jump(r) {
      const o = N(0.4), ps = noise(0.3, r); filt(ps, 'hp', 2200); env(ps, ad(0.004, 0.09)); mix(o, ps, 0.6);
      const up = osc(0.2, t => 130 + 900 * t); env(up, ad(0.002, 0.07)); mix(o, up, 0.6);
      const sp = osc(0.4, t => 260 * (1 + 0.08 * Math.sin(t * 6.283 * 22) * Math.exp(-t / 0.15))); env(sp, ad(0.002, 0.12)); mix(o, sp, 0.25);
      return norm(o, 0.6);
    },
    jump2(r) {
      const o = R.whoosh(r); const ch = N(o.length / SR);
      for (const [k, t] of [[0, 0], [7, 0.05], [12, 0.1]]) { const s = osc(0.3, 880 * semis(k)); env(s, ad(0.002, 0.08)); mix(ch, s, 0.25, t); }
      return norm(mix(o, ch, 1), 0.6);
    },
    land(r, v) {
      const heavy = v >= 2, o = N(0.5);
      const th = osc(0.3, exp(heavy ? 95 : 85, 42, 0.03)); env(th, ad(0.001, heavy ? 0.1 : 0.07)); mix(o, th, 1);
      const n = noise(0.3, r); filt(n, 'lp', 340); env(n, ad(0.001, 0.06)); mix(o, n, 0.9);
      const cr = osc(0.4, t => 210 + 25 * Math.sin(t * 6.283 * 7)); env(cr, ad(0.02, 0.12)); mix(o, cr, 0.12, 0.03);   // suspension creak
      mix(o, grains(0.35, heavy ? 18 : 9, r, 1200, 3200, 0.004), 0.35);
      return norm(drive(o, 1.5), heavy ? 0.9 : 0.7);
    },
    dig_down(r) {
      const len = 0.65, o = noise(len, r, 'brown'); filt(o, 'lp', 520); env(o, ad(0.02, 0.22));
      mix(o, grains(len, 22, r, 900, 2600, 0.008), 0.6);
      const rum = osc(len, 48); env(rum, ad(0.05, 0.2)); mix(o, rum, 0.5);
      return norm(drive(o, 1.6), 0.8);
    },
    dig_up(r) {
      const o = R.dig_down(r); const pop = osc(0.2, exp(320, 110, 0.04)); env(pop, ad(0.001, 0.05));
      return norm(mix(o, pop, 0.9, 0.04), 0.85);
    },
    scratch(r) {
      const o = N(0.14); mix(o, grains(0.14, 8, r, 1200, 3800, 0.005), 1);
      const n = noise(0.14, r, 'brown'); filt(n, 'lp', 700); env(n, ad(0.005, 0.04)); mix(o, n, 0.6);
      return norm(o, 0.5);
    },
    pickup(r, v, heal) {
      const notes = heal ? [0, 7, 12] : [0, 4, 7, 12, 16], base = heal ? 660 : 880, o = N(0.9);
      notes.forEach((k, i) => {
        const f = base * semis(k), s = osc(0.6, f); mix(s, osc(0.6, f * 2), 0.25); env(s, ad(0.003, 0.22));
        mix(o, s, 0.35, i * 0.065);
      });
      const sp = noise(0.6, r); filt(sp, 'hp', 6500); env(sp, t => Math.exp(-t / 0.2) * (r() < 0.04 ? 1 : 0.15)); mix(o, sp, 0.3);
      return norm(o, 0.6);
    },
    heal(r, v) { return R.pickup(r, v, true); },
    loot(r) {
      const o = N(0.5);
      for (const [k, t] of [[12, 0], [19, 0.08]]) { const s = osc(0.4, 660 * semis(k)); env(s, ad(0.002, 0.12)); mix(o, s, 0.4, t); }
      return norm(o, 0.5);
    },
    boss_emerge(r) {
      const len = 3.4, o = N(len);
      const sub = noise(len, r, 'brown'); filt(sub, 'lp', 140); mix(o, sub, 1.3);
      const gr = noise(len, r); filt(gr, 'bp', 260, 2); env(gr, t => 0.5 + 0.5 * Math.sin(t * 6.283 * 7.3) * Math.sin(t * 6.283 * 2.1)); mix(o, gr, 0.6);
      const ch = N(len);
      for (const f of [55, 82.4, 110, 110.6]) mix(ch, osc(len, f, 'saw'), 0.25);
      filt(ch, 'lp', t => 180 + 1400 * Math.pow(t / len, 1.6), 1.2); mix(o, ch, 0.8);
      mix(o, grains(len, 60, r, 700, 2600, 0.01, 0.8), 0.4);
      env(o, t => Math.min(1, t / 0.6) * Math.min(1, (len - t) / 0.5));
      return norm(drive(o, 1.6), 0.9);
    },
    boss_roar(r) {
      const len = 1.8, o = N(len);
      for (const [f, g] of [[55, 1], [82.4, 0.8], [110, 0.7], [164.8, 0.5], [55.4, 0.6]]) mix(o, osc(len, t => f * (1 + 0.006 * Math.sin(t * 31)), 'saw'), g * 0.3);
      filt(o, 'lp', t => 300 + 2400 * Math.exp(-Math.pow((t - 0.35) / 0.3, 2)) + 500 * (1 - t / len), 1.4);
      env(o, t => Math.min(1, t / 0.08) * Math.exp(-Math.max(0, t - 0.6) / 0.45));
      return norm(drive(o, 2.4), 0.9);
    },
    tent_wind(r) {
      const len = 0.65, o = noise(len, r); filt(o, 'bp', t => 600 + 2800 * Math.pow(t / len, 2), 2);
      env(o, t => Math.pow(t / len, 2));
      const s = osc(len, t => 200 + 420 * t / len, 'saw'); filt(s, 'lp', 900); env(s, t => 0.4 * t / len); mix(o, s, 1);
      return norm(o, 0.6);
    },
    tent_slam(r) {
      const len = 0.7, o = N(len);
      const th = osc(len, exp(80, 34, 0.04)); env(th, ad(0.001, 0.13)); mix(o, th, 1.1);
      const n = noise(len, r); filt(n, 'lp', 700); env(n, ad(0.001, 0.1)); mix(o, n, 0.9);
      const c = noise(0.03, r); filt(c, 'hp', 2000); env(c, ad(0.0002, 0.006)); mix(o, c, 0.9);
      mix(o, grains(len, 30, r, 800, 3000, 0.006, 1.6), 0.5, 0.01);
      return norm(drive(o, 1.8), 0.9);
    },
    boss_lift(r) {
      const len = 1.0, o = N(len);
      for (const f of [220, 330, 331.5]) mix(o, osc(len, t => f * (1 + 0.5 * t / len)), 0.3);
      env(o, t => (0.6 + 0.4 * Math.sin(t * 6.283 * 11)) * Math.min(1, t / 0.2) * Math.min(1, (len - t) / 0.15));
      const n = noise(len, r); filt(n, 'bp', 1800, 3); env(n, t => 0.2 * t / len); mix(o, n, 1);
      return norm(o, 0.45);
    },
    boss_die(r) {
      const len = 3.4, o = N(len);
      const sub = osc(len, exp(60, 18, 0.7)); env(sub, ad(0.002, 0.9)); mix(o, sub, 1.2);
      const n = noise(len, r); filt(n, 'lp', exp(2000, 90, 0.5)); env(n, ad(0.003, 0.7)); mix(o, n, 1.2);
      for (let k = 0; k < 40; k++) { const f = 1800 + r() * 5500; mix(o, modes(0.8, [[f, 1, 0.1 + r() * 0.4]], r), 0.06, Math.pow(r(), 2) * 0.6); }
      const ch = N(len); for (const f of [220, 277, 330]) mix(ch, osc(len, t => f * Math.pow(0.25, t / len), 'saw'), 0.25);
      filt(ch, 'lp', 1200); env(ch, t => Math.min(1, t / 0.3) * Math.exp(-t / 1.4)); mix(o, ch, 0.7, 0.2);
      return norm(drive(o, 1.8), 0.95);
    },
    door(r) {
      const len = 1.5, o = noise(len, r, 'brown'); filt(o, 'lp', 260);
      const gr = noise(len, r); filt(gr, 'bp', 140, 3); env(gr, t => 0.6 + 0.4 * Math.sin(t * 6.283 * 13)); mix(o, gr, 0.8);
      env(o, t => Math.min(1, t / 0.15) * (t < 1.15 ? 1 : Math.exp(-(t - 1.15) / 0.08)));
      const th = osc(0.35, exp(70, 36, 0.05)); env(th, ad(0.001, 0.1)); mix(o, th, 1.2, 1.15);
      return norm(drive(o, 1.4), 0.85);
    },
    nova(r) {
      const len = 0.7, o = N(len);
      const th = osc(len, exp(320, 70, 0.08)); env(th, ad(0.002, 0.12)); mix(o, th, 0.9);
      const sw = noise(len, r); filt(sw, 'bp', t => 500 + 5000 * Math.min(1, t / 0.25), 2); env(sw, ad(0.01, 0.15)); mix(o, sw, 0.6);
      for (const [k, t] of [[24, 0.02], [31, 0.06], [36, 0.1]]) { const s = osc(0.4, 220 * semis(k)); env(s, ad(0.002, 0.1)); mix(o, s, 0.18, t); }
      return norm(drive(o, 1.4), 0.7);
    },
    mortar(r) {
      const len = 0.9, o = N(len);
      const th = osc(0.3, exp(140, 50, 0.04)); env(th, ad(0.001, 0.07)); mix(o, th, 1);
      const n = noise(0.2, r); filt(n, 'lp', 900); env(n, ad(0.001, 0.04)); mix(o, n, 0.8);
      const wh = osc(len, t => 1800 - 1100 * t / len); env(wh, t => 0.25 * Math.min(1, t / 0.2) * Math.min(1, (len - t) / 0.1)); mix(o, wh, 1, 0.05);
      return norm(o, 0.75);
    },
    blast(r) {
      const len = 1.2, o = N(len);
      const n = noise(len, r); filt(n, 'lp', exp(2500, 160, 0.2)); env(n, ad(0.002, 0.25)); mix(o, n, 1.2);
      const sub = osc(len, exp(90, 32, 0.15)); env(sub, ad(0.002, 0.3)); mix(o, sub, 1);
      mix(o, grains(0.9, 40, r, 1400, 4500, 0.003, 2), 0.5, 0.02);
      return norm(drive(o, 2.2), 0.95);
    },
    saw(r) {
      const o = N(0.18), z = osc(0.18, t => 2600 + 1400 * Math.sin(t * 90), 'saw'); filt(z, 'bp', 3200, 2); env(z, ad(0.002, 0.04)); mix(o, z, 0.7);
      const n = noise(0.05, r); filt(n, 'hp', 2500); env(n, ad(0.0003, 0.01)); mix(o, n, 0.8);
      return norm(o, 0.55);
    },
    pop(r) {                                         // paper critter bursts: wet pop + squeak
      const len = 0.35, o = N(len);
      const b = osc(0.12, exp(900, 180, 0.03)); env(b, ad(0.001, 0.05)); mix(o, b, 1);
      const n = noise(0.15, r); filt(n, 'bp', 1800, 1.5); env(n, ad(0.0005, 0.03)); mix(o, n, 0.9);
      const j = 600 * r(), sq = osc(0.15, t => 1300 + j + 900 * Math.sin(t * 40)); env(sq, ad(0.005, 0.05)); mix(o, sq, 0.25, 0.03);
      return norm(drive(o, 1.6), 0.6);
    },
    eshot(r) {                                       // wet plasma blorp
      const len = 0.3, o = N(len);
      const b = osc(len, exp(520, 150, 0.07), 'saw'); filt(b, 'lp', exp(3200, 500, 0.08), 3); env(b, ad(0.003, 0.09)); mix(o, b, 0.8);
      const n = noise(0.1, r); filt(n, 'bp', 2400, 2); env(n, ad(0.0005, 0.02)); mix(o, n, 0.5);
      return norm(drive(o, 1.5), 0.55);
    },
    chub(r) {                                        // squeaky toy
      const len = 0.22, o = N(len), f0 = 850 + 250 * r();
      const a = osc(len, t => f0 * (1 + 3.2 * t) + 60 * Math.sin(t * 190)); env(a, ad(0.004, 0.07)); mix(o, a, 0.8);
      const b = osc(len, t => f0 * 2 * (1 + 3.2 * t)); env(b, ad(0.004, 0.04)); mix(o, b, 0.25);
      return norm(o, 0.5);
    },
laugh(r) {                                       // a big man's belly laugh: breathy "h", open "a", pitch and pace drifting like a voice
      const n = 6 + Math.floor(r() * 3), o = N(3.4);
      let t0 = 0.08, f = 96 * (0.94 + 0.12 * r());
      for (let i = 0; i < n; i++) {
        const dur = 0.17 + 0.06 * r() + (i === n - 1 ? 0.2 : 0), amp = Math.max(0.3, 1 - i * 0.085) * (0.8 + 0.4 * r());
        const fi = f * (i === 0 ? 1.15 : 1), wob = 4 + 3 * r(), ph = r() * 6.283;
        // glottal source: saw with jitter, a wobble and a falling glide on every syllable
        const src = osc(dur, t => fi * (1.2 - 0.55 * t / dur) * (1 + 0.03 * Math.sin(t * 6.283 * wob + ph)) * (1 + 0.035 * (r() - 0.5)), 'saw');
        const f1 = Float32Array.from(src), f2 = Float32Array.from(src), f3 = Float32Array.from(src);
        const open = 0.9 + 0.2 * r();                 // the mouth is never the same twice
        filt(f1, 'bp', 640 * open, 4.5); filt(f2, 'bp', 1080 * open, 6); filt(f3, 'bp', 2450, 7); filt(src, 'lp', 260, 0.8);
        const v = N(dur); mix(v, src, 0.55); mix(v, f1, 1); mix(v, f2, 0.55); mix(v, f3, 0.16);
        const br = noise(dur, r); filt(br, 'bp', 1500, 1); mix(v, br, 0.07);       // breath riding on the voice
        env(v, t => Math.min(1, t / 0.035) * Math.min(1, (dur - t) / 0.09));
        const h = noise(0.1, r); filt(h, 'bp', 1250 * open, 1.3); env(h, t => Math.sin(Math.min(1, t / 0.1) * Math.PI));
        mix(o, h, 0.3 * amp, t0 - 0.07); mix(o, v, amp, t0);
        t0 += dur + 0.06 + 0.07 * r() + (i === 2 && r() < 0.5 ? 0.12 : 0);
        f *= 0.94 + 0.03 * r();
      }
      const chest = Float32Array.from(o); filt(chest, 'lp', 180, 0.7); mix(o, chest, 0.5);
      return norm(drive(o, 1.25), 0.95);
    },
    choir(r) {                                       // slow swell of voices
      const len = 9, o = N(len);
      for (const [k, g] of [[0, 1], [7, 0.8], [12, 0.9], [16, 0.7], [19, 0.6], [24, 0.4]]) for (let v = 0; v < 3; v++) {
        const f0 = 130.8 * semis(k) * (1 + (v - 1) * 0.006), vr = 4.5 + r() * 1.5, ph = r() * 6.283;
        const a = osc(len, t => f0 * (1 + 0.006 * Math.sin(t * 6.283 * vr + ph)), 'saw'); filt(a, 'bp', 800, 1.2); filt(a, 'lp', 2400, 0.7);
        env(a, t => Math.min(1, t / 2.5) * Math.min(1, (len - t) / 3)); mix(o, a, g * 0.3);
      }
      return norm(o, 0.7);
    },
    spit(r) {
      const len = 0.4, o = N(len);
      const n = noise(len, r); filt(n, 'bp', t => 700 + 2200 * Math.min(1, t / 0.08), 3); env(n, ad(0.005, 0.12)); mix(o, n, 1);
      const g = osc(0.25, exp(260, 120, 0.06)); env(g, t => ad(0.01, 0.08)(t) * (0.6 + 0.4 * Math.sin(t * 6.283 * 45))); mix(o, g, 0.6);
      return norm(o, 0.55);
    },
    wave(r) {                                        // distant horn + rumbling crowd
      const len = 2.2, o = N(len);
      for (const k of [0, 7, 12]) { const h = osc(len, 98 * semis(k) * (1 + 0.004 * k), 'saw'); filt(h, 'lp', 900); env(h, t => Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.9) / 0.35) * 0.3); mix(o, h, 1); }
      const c = noise(len, r); filt(c, 'bp', 420, 1.2); env(c, t => Math.min(1, t / 0.6) * Math.exp(-Math.max(0, t - 1.2) / 0.4) * (0.7 + 0.3 * Math.sin(t * 6.283 * 7))); mix(o, c, 0.5);
      return norm(o, 0.7);
    },
    hoof(r) {                                        // unicorn hoofbeat: dull thump plus a hard clack
      const len = 0.16, o = N(len);
      const b = osc(0.12, exp(150 + 40 * r(), 55, 0.04)); env(b, ad(0.001, 0.035)); mix(o, b, 1);
      const n = noise(0.05, r); filt(n, 'bp', 900 + 500 * r(), 2.5); env(n, ad(0.0004, 0.012)); mix(o, n, 0.9);
      return norm(o, 0.55);
    },
    tick(r) {                                        // spider foot: small metallic tap
      const len = 0.07, o = N(len);
      const n = noise(0.03, r); filt(n, 'bp', 3200 + 1500 * r(), 3); env(n, ad(0.0003, 0.006)); mix(o, n, 1);
      const s = osc(0.05, 1500 + 900 * r(), 'tri'); env(s, ad(0.0005, 0.012)); mix(o, s, 0.35);
      return norm(o, 0.4);
    },
    // ---- loops (rendered once, played continuously with live gain / rate) ----
    hum_loop() {                                     // the halo: a soft held chord of pure tones, like a far-off choir. No motor in it
      return looped(4, sec => {
        const b = N(sec);
        for (const [f, g, v] of [[220, 1, 0.25], [220.5, 0.7, 0.5], [277.25, 0.7, 0.25], [329.75, 0.8, 0.5], [330.25, 0.5, 0.25], [440, 0.45, 0.75], [554.25, 0.2, 0.5], [659.5, 0.14, 0.25]]) {
          const o = osc(sec, f); env(o, t => 0.65 + 0.35 * Math.sin(t * 6.283 * v + f)); mix(b, o, g * 0.2);
        }
        return filt(b, 'lp', 1200);
      });
    },
    servo_loop() {                                   // the spider: thin servo whine
      return looped(1, sec => {
        const b = osc(sec, 180, 'saw'); mix(b, osc(sec, 362, 'saw'), 0.5); filt(b, 'bp', 1400, 2.5);
        env(b, t => 0.6 + 0.4 * Math.sin(t * 6.283 * 22));
        return b;
      });
    },
    engine_loop() {                                  // 40 firing pulses per second; rate follows speed
      return looped(1, sec => {
        const b = N(sec), r = rng(7);
        for (let k = 0; k < Math.ceil(sec * 40); k++) {
          const p = noise(0.03, r); filt(p, 'lp', 520); env(p, ad(0.0008, 0.0075));
          const s = osc(0.03, 40 * (k % 2 ? 2 : 3)); env(s, ad(0.0006, 0.006)); mix(p, s, 0.6);
          mix(b, p, k % 4 === 0 ? 1 : 0.7, k / 40);
        }
        return filt(b, 'lp', 1400);
      });
    },
    drill_loop() {
      return looped(1, sec => {
        const b = osc(sec, 110, 'saw'); mix(b, osc(sec, 55, 'square'), 0.35); mix(b, osc(sec, 220.5, 'saw'), 0.2);
        filt(b, 'lp', 1700, 1.2);
        const n = noise(sec, rng(3)); filt(n, 'bp', 2600, 1.5); env(n, t => 0.5 + 0.5 * Math.sin(t * 6.283 * 30)); mix(b, n, 0.25);
        return b;
      });
    },
    grind_loop() {
      return looped(1, sec => {
        const r = rng(5), b = noise(sec, r); filt(b, 'bp', 1900, 0.9);
        const a = noise(sec, r); filt(a, 'lp', 35); const m = Math.max(...a.map(Math.abs)) || 1;
        env(b, t => 0.4 + 0.6 * Math.abs(a[Math.min(a.length - 1, Math.round(t * SR))] / m));
        mix(b, grains(sec, 60, r, 1500, 5000, 0.003, 1), 0.6);
        return b;
      });
    },
    skid_loop() {
      return looped(1, sec => { const b = noise(sec, rng(9)), c = Float32Array.from(b); filt(b, 'bp', 1500, 3); filt(c, 'bp', 920, 4); return mix(b, c, 0.8); });
    },
    wind_loop() {
      return looped(4, sec => { const b = noise(sec, rng(11), 'pink'); filt(b, 'lp', t => 380 + 220 * Math.sin(t * 1.6), 0.8); return b; });
    },
    drone_loop() {
      return looped(4, sec => {
        const b = N(sec); for (const [f, g] of [[55, 1], [82.5, 0.6], [110.25, 0.5], [165, 0.2]]) mix(b, osc(sec, f, 'tri'), g * 0.3);
        const n = noise(sec, rng(13)); filt(n, 'bp', 330, 6); mix(b, n, 0.4);
        return b;
      });
    },
  };

  function synth(name, v) { return R[name](rng(1000 + v * 7919 + name.length * 131), v); }
  function normLoop(b, peak) { let m = 1e-6; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i])); for (let i = 0; i < b.length; i++) b[i] *= peak / m; return b; }
  return { synth, normLoop, R };
}
