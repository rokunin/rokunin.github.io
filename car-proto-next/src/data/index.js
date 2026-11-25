// Every combat number of the game, one import (ADR-0006). DATA_HASH goes into the network version: players whose numbers differ never share a lobby.
import { ARENA } from './world.js';
import { FIRE_RATE, W_STATS, W_ORDER, W_GEAR, SWORD_T, WEB_N, WEB_R, WEB_T, HALO_SWORDS, BEAM_PER } from './weapons.js';
import { TUNE, UNI, BUG, RIDE_KIT, RIDE_ACTIVE, STOMP, BROOD, SPIKE, STARB, BOMB, TRAIL_T, BULLET, DRILL_DPS, DRILL_REACH } from './rides.js';
import { SW_KINDS, MINI_KINDS, MINI_SEQ, RIG, TNT } from './monsters.js';
import { PHASES, WAVE_PLANS } from './waves.js';
import { BOSS_HP, TENT_SP, TENT_MIN, TENT_MAX, BOSS2 } from './bosses.js';
import { LOOT, SHOP, ULT } from './economy.js';

export { ARENA, FIRE_RATE, W_STATS, W_ORDER, W_GEAR, SWORD_T, TUNE, UNI, BUG, RIDE_KIT, RIDE_ACTIVE, STOMP, BROOD, SPIKE, STARB, BOMB, TRAIL_T, SW_KINDS, MINI_KINDS, MINI_SEQ, RIG, TNT, PHASES, WAVE_PLANS, BOSS_HP, TENT_SP, TENT_MIN, TENT_MAX, BOSS2, LOOT, SHOP, ULT, WEB_N, WEB_R, WEB_T, HALO_SWORDS, BEAM_PER, BULLET, DRILL_DPS, DRILL_REACH };

export const DATA = { ARENA, FIRE_RATE, W_STATS, W_ORDER, W_GEAR, SWORD_T, TUNE, UNI, BUG, RIDE_KIT, RIDE_ACTIVE, STOMP, BROOD, SPIKE, STARB, BOMB, TRAIL_T, SW_KINDS, MINI_KINDS, MINI_SEQ, RIG, TNT, PHASES, WAVE_PLANS, BOSS_HP, TENT_SP, TENT_MIN, TENT_MAX, BOSS2, LOOT, SHOP, ULT, WEB_N, WEB_R, WEB_T, HALO_SWORDS, BEAM_PER, BULLET, DRILL_DPS, DRILL_REACH };
export const DATA_HASH = (() => {                        // FNV-1a over the tables as JSON, 8 hex digits
  let h = 2166136261; const t = JSON.stringify(DATA);
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
})();
