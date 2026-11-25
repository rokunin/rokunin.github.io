// Coins, crystals, prices, the shop and the ultimates.
// Moved here from legacy.js unchanged (ADR-0006). The balance model reads these numbers through dev/balance/data.json.

export const LOOT = { abCost: [100, 200, 300], wCost: [30, 60], life: 25, max: 420, pull: 18, pullV: [22, 60] };      // a piece lies 25 s; within `pull` metres it flies to you, faster the closer it is
export const SHOP = { conv: [100, 10], ult: { sword: 30, hands: 50 } };      // 100 coins -> 10 crystals; crystals per charge of each ultimate
export const ULT = { hands: { n: 10, ring: 11, every: 0.13, fly: 0.3, lift: 0.14, fuse: 0.5, R: 20 }, sword: { ahead: 9, fall: 0.5, hold: 0.28, run: 48, speed: 30, w: 5.4, R0: 9.5, out: 0.5 } };
