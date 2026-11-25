// The Pyramidon.
// Moved here from legacy.js unchanged (ADR-0006). The balance model reads these numbers through dev/balance/data.json.
import { ARENA } from './world.js';

export const BOSS_HP = 1000;
export const TENT_SP = 0.85;
export const TENT_MIN = 10;
export const TENT_MAX = 34;
export const BOSS2 = { out: [ARENA - 78, 0], fleeV: 26, dashV: 30, near: [14, 22], sight: 75, ram: 18,
                  lairQ: { n: 3, r: 13, dmg: 26, gap: [12.5, 17.5], rage: [8.75, 12.5] }, fieldQ: { n: 6, r: 26, dmg: 12, gap: [6.25, 8.75], rage: [4.4, 6.25] },      // gap: seconds between volleys (build 133: a fifth rarer)
                  step: 0.5, lavaR: 40, lavaW: 1.7, lavaH: 4.2, lavaDmg: 20 };      // lavaR: the fire wall's radius (build 134: 32 x 1.25)
