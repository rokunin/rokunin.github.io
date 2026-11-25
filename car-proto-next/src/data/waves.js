// Phases of a run and the wave plans.
// Moved here from legacy.js unchanged (ADR-0006). The balance model reads these numbers through dev/balance/data.json.

export const PHASES = [
    { key: 'roll',  name: 'ROLL OUT',          desc: 'Gear up: fight for your guns, then hunt the bosses for skills', waves: 99, brk: 8,  mul: 1.0, over: 0.6, cap: 10, max: 45 },
    { key: 'scout', name: 'SCOUT THE WASTES',  desc: 'Find the altars, the chubzik nests and the boss gate', waves: 99, brk: 18, mul: 1.2, over: 0.6, cap: 12, max: 50 },
    { key: 'save',  name: 'SAVE & SACRIFICE',  desc: 'The chubziks are hatching. Haul them to the altars',   waves: 99, brk: 18, mul: 1.5, over: 0.6, cap: 12, max: 60 },
    { key: 'hell',  name: 'HELL BREAKS LOOSE', desc: 'Mini-bosses everywhere. Hold the line',                waves: 99, brk: 18, mul: 2.6, over: 0.7, cap: 11, max: 75 },
    { key: 'boss',  name: 'THE PYRAMIDON',     desc: 'The gate is open. Go punch it',                        waves: 99, brk: 0,  mul: 1.4, over: 0.6, cap: 14, max: 45 },
  ];
export const WAVE_PLANS = [
    [['gremlin', 8]],
    [['maw', 7], ['gremlin', 5]],
    [['flapper', 6], ['wingmaw', 5]],
    [['gloop', 2], ['brute', 1], ['gremlin', 8]],
    [['oculon', 3], ['spitter', 2], ['stilt', 6]],
    [['spike', 6], ['jelly', 4]],
    [['grubber', 2], ['lamprey', 4], ['maw', 6]],
  ];
