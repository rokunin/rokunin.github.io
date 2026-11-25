// Monsters: the small fry, the mini-bosses, the log machines and their bombs.
// Moved here from legacy.js unchanged (ADR-0006). The balance model reads these numbers through dev/balance/data.json.

export const SW_KINDS = {
    gremlin: { hp: 1,   speed: 12.5, size: 1.8, r: 0.55, bite: 5,  hue: [0.25, 0.14, 0.33] },
    stilt:   { hp: 2,   speed: 9.5,  size: 3.4, r: 0.55, bite: 7,  hue: [0.75, 0.5, 0.58] },
    brute:   { hp: 9,   speed: 6,    size: 3.9, r: 1.35, bite: 12, hue: [0.03, 0.08, 0.95], heavy: true },
    flapper: { hp: 1.5, speed: 11,   size: 2.3, r: 0.65, bite: 4,  hue: [0.8, 0.88, 0.7], fly: 2.4 },
    spitter: { hp: 2,   speed: 7.5,  size: 2.1, r: 0.65, bite: 5,  hue: [0.2, 0.16, 0.42], ranged: true },
    // the tentacled lot from the concept sheet
    maw:      { hp: 2,   speed: 13.5, size: 3.0, r: 0.6,  bite: 6,  hue: [0.98, 0.3, 0.12] },                    // walking mouth, packs
    oculon:   { hp: 3,   speed: 7,    size: 3.3, r: 0.7,  bite: 5,  hue: [0.78, 0.02, 0.5], ranged: true },      // hovering eye, spits
    gloop:    { hp: 12,  speed: 5,    size: 2.7, r: 1.2,  bite: 8,  hue: [0.33, 0.55, 0.15], heavy: true, split: 'gloopling' },   // bursts into two small ones
    gloopling:{ hp: 2,   speed: 10,   size: 1.5, r: 0.5,  bite: 4,  hue: [0.33, 0.55, 0.15], art: 'gloop' },
    jelly:    { hp: 3,   speed: 8.5,  size: 4.4, r: 0.6,  bite: 9,  hue: [0.55, 0.85, 0.42] },                   // tall stinger
    grubber:  { hp: 14,  speed: 5.5,  size: 4.9, r: 1.5,  bite: 14, hue: [0.08, 0.92, 0.6], heavy: true },
    lamprey:  { hp: 4,   speed: 9.5,  size: 4.2, r: 0.7,  bite: 10, hue: [0.92, 0.12, 0.72], lunge: true },      // ambles, then lunges when close
    spike:    { hp: 3,   speed: 15.5, size: 2.3, r: 0.75, bite: 9,  hue: [0.12, 0.62, 0.0], spiky: true },       // too prickly to run over
    wingmaw:  { hp: 2.5, speed: 12,   size: 3.1, r: 0.7,  bite: 6,  hue: [0.7, 0.45, 0.88], fly: 1.0 },
  };
export const MINI_KINDS = ['brute', 'grubber', 'maw', 'jelly', 'oculon', 'lamprey', 'gloop', 'stilt', 'wingmaw', 'spike'];
export const MINI_SEQ = [{ n: 7, gap: 0.09 },      // 0 gun: a burst of fast tracers, like our machine gun
                    { n: 3, gap: 0.4 },       // 1 fan: three fans, like the spread gun
                    { n: 2, gap: 0.5 },       // 2 nova: two rings
                    { n: 26, gap: 0.085 },    // 3 spiral: two arms winding outward
                    { n: 5, gap: 0.22 }];      // 4 cross: a turning four-way cross
export const RIG = { speed: 2.6, turn: 0.3, half: 18.75, logR: 1.5, mastR: 5.6, spin: 0.85, top: 5.4, tame: true, n: { roll: 2, scout: 6, save: 6, hell: 10, boss: 0 } };
export const TNT = { grab: 3.4, help: 8, g: 32, vy: 20, near: 6, far: 17, aim: 0.6 };
