// Guns: the base gun's rate and the pedestal guns per level slot (slots 0/2/4 are the three levels).
// Moved here from legacy.js unchanged (ADR-0006). The balance model reads these numbers through dev/balance/data.json.

export const FIRE_RATE = 11;      // shots per second
export const W_STATS = {
    spread: { n: [3, 5, 5, 7, 9], arc: [0.3, 0.4, 0.5, 0.6, 0.72], rate: [1, 1.05, 1.12, 1.18, 1.25] },
    nova:   { cd: [2.4, 2.1, 1.8, 1.55, 1.3], n: [10, 14, 18, 22, 28], dmg: [1, 1, 1.5, 1.5, 2] },
    orbit:  { n: [2, 3, 3, 4, 5], r: [4.0, 4.3, 4.6, 5.0, 5.4], spd: [3.0, 3.2, 3.5, 3.8, 4.2], dmg: [1, 1.2, 1.5, 1.8, 2.2] },
    mortar: { cd: [4.2, 3.6, 3.1, 2.7, 2.2], r: [4.2, 4.7, 5.2, 5.8, 6.6], dmg: [4, 5, 6.5, 8, 10] },
  };
export const W_ORDER = ['spread', 'nova', 'orbit', 'mortar'];
export const W_GEAR = ['spread', 'nova', 'orbit'];
export const SWORD_T = [1.2, 1.5, 1.9, 2.3, 2.8];      // the swords stay out longer with every nova level

// What the nova slot does per ride: the spider throws webs, the halo stands in a ring of swords, the others fire beams
export const WEB_N = 4;
export const WEB_R = [2.3, 2.9, 3.5, 4.2, 5.0];
export const WEB_T = 3.2;
export const HALO_SWORDS = { n: [4, 5, 6, 7, 8], len: [7, 9, 11, 13.5, 16], every: 0.12, dmgK: 0.9 };      // per nova slot; every: seconds between hits, dmgK: share of the nova's damage
export const BEAM_PER = [1, 2, 2, 3, 3];      // beams per side for the buggy and the unicorn, per nova slot
