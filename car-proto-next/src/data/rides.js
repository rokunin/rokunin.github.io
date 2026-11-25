// The four rides: handling, the skill kits, and what a levelled skill does at Lv1/Lv2/Lv3.
// Moved here from legacy.js unchanged (ADR-0006). The balance model reads these numbers through dev/balance/data.json.

export const TUNE = {
    accel: 26, reverseAccel: 23.4, brake: 45, maxSpeed: 26, maxReverse: -23.4,   // назад на 10% медленнее, чем вперёд
    coast: 7, steerRate: 6, turnRate: 2.95, grip: 7,
    spinRate: 3.6, spinSteerRate: 12, gripHuman: 3.8,   // режим «человечек»
  };
export const UNI = { accel: 40, reverseAccel: 12, brake: 70, maxSpeed: 24, maxReverse: -6, coast: 22, steerRate: 9, turnRate: 3.4, grip: 16, spinRate: 4.4, spinSteerRate: 14, gripHuman: 16 };
export const BUG = { ...UNI, maxSpeed: UNI.maxSpeed * 1.1, maxReverse: -UNI.maxSpeed * 1.1 * 0.9, reverseAccel: UNI.accel * 0.9 };
export const RIDE_KIT = { buggy: ['drill', 'decoy', 'jump'], spider: ['burrow', 'jump'], halo: ['jump', 'doubleJump', 'cubes'], unicorn: ['bomb', 'trail', 'jump'] };      // active on RMB, a passive, the jump
export const RIDE_ACTIVE = { buggy: 'decoy', spider: 'burrow', halo: 'cubes', unicorn: 'bomb' };
export const STOMP = { r: [7, 8.5, 10], stun: [1.5, 2, 2] };
export const BROOD = { n: [6, 10, 10], r: [9, 11, 11], slow: [3, 4.5, 4.5] };
export const SPIKE = { n: [6, 11, 18], r: [3, 5, 7.5], h: [1.7, 2.7, 3.8], T: [1.3, 2.6, 4], dmg: [1, 1, 2] };
export const STARB = { n: [10, 16, 24], reach: [9, 13, 17], dmg: [1, 1, 1.5] };
export const BOMB = { r: [7, 9, 11], T: [2, 3, 4], cd: [12, 11, 10] };
export const TRAIL_T = [3, 5, 5];

// The base gun's bullet: the spider's caltrop (star) is slower and lives longer, the halo's is in between; owning the fan gun shortens every bullet's life
export const BULLET = { speed: { base: 70, star: 52, holy: 66 }, life: { base: 1.1, star: 1.4 }, fanLife: 0.85, dmg: 1 };
export const DRILL_DPS = 7;
export const DRILL_REACH = 4.6 * 1.5;      // радиус арки урона от центра машины
