// ---------- world setup ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { GS } from '../game/state.ts';

export function createWorldSetup(GAME) {
  GAME.seedRandom(GAME.SEED);
  for (let i = 0; i < 18; i++) { const [x, z] = GAME.freeSpot(7, 24); GAME.addRock(x, z); }
  for (let i = 0; i < 64; i++) { const [x, z] = GAME.freeSpot(3); GAME.addPillar(x, z); }
  for (let i = 0; i < 80; i++) GAME.addCrate();
  GS.kills = 0;
  const killsEl = document.getElementById('kills');
  const spdEl = document.getElementById('spd');
  const respawnQueue = [];

  return { killsEl, spdEl, respawnQueue };
}
