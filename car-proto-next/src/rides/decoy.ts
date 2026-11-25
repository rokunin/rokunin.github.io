// ---------- Decoy Chubz (buggy): a squeaky fake chubzik; on the host every monster nearby goes for it, then it blows up -----
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { ARENA } from '../data/index.js';

export function createDecoy(GAME) {
  const DECOY_CD = 9, DECOY_T = 3.2, decoys = []; let decoyCd = 0;
  function throwDecoys() {
    if (!GAME.abilities.decoy || GS.ride !== 'buggy' || !GAME.car.alive || decoyCd > 0) return;
    decoyCd = DECOY_CD;
    const n = 1 + GAME.abLv.decoy, dx = GAME.groundAim.x - GAME.car.pos.x, dz = GAME.groundAim.z - GAME.car.pos.z, dd = Math.hypot(dx, dz) || 1;
    const a0 = Math.atan2(dx / dd, dz / dd), L = THREE.MathUtils.clamp(dd, 7, 16);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * 0.42;
      const x = THREE.MathUtils.clamp(GAME.car.pos.x + Math.sin(a) * L, -ARENA + 3, ARENA - 3), z = THREE.MathUtils.clamp(GAME.car.pos.z + Math.cos(a) * L, -ARENA + 3, ARENA - 3);
      addDecoy(GAME.car.pos.x, GAME.car.pos.z, x, z); GAME.netEv({ t: 'decoy', a: GAME.r1(GAME.car.pos.x), b: GAME.r1(GAME.car.pos.z), x: GAME.r1(x), z: GAME.r1(z) });
    }
    GAME.SFX.play('chub', GAME.car.pos, { rate: 1.5 });
  }
  function addDecoy(x0, z0, x, z) {
    const sprite = new THREE.Sprite(GAME.chubMats[0][0]); sprite.center.set(0.5, 0.04); GAME.scene.add(sprite);
    const shadow = new THREE.Mesh(GAME.swShadowGeo, GAME.swShadowMat); GAME.scene.add(shadow);
    decoys.push({ x0, z0, x, z, t: -0.45, sprite, shadow, sq: 0 });
  }
  function decoyNear(m) { let b = null, bd = 22; for (const D of decoys) { if (D.t < 0) continue; const d = Math.hypot(D.x - m.pos.x, D.z - m.pos.z); if (d < bd) { bd = d; b = D; } } return b; }
  function updateDecoys(dt) {
    decoyCd -= dt;
    for (let i = decoys.length - 1; i >= 0; i--) {
      const D = decoys[i]; D.t += dt;
      if (D.t < 0) {                                       // in the air
        const u = 1 + D.t / 0.45; D.sprite.position.set(D.x0 + (D.x - D.x0) * u, 1 + Math.sin(Math.PI * u) * 4, D.z0 + (D.z - D.z0) * u);
      } else {
        const hop = Math.abs(Math.sin(D.t * 9)) * 0.5; D.sprite.position.set(D.x, hop, D.z);
        if ((D.sq -= dt) <= 0) { D.sq = 0.45; GAME.SFX.play('chub', D.sprite.position, { rate: 1.3 + Math.random() * 0.4, vol: 0.6 }); }
      }
      const sc = GAME.CHUB_SIZE * (1.1 + 0.15 * Math.sin(D.t * 18)); D.sprite.scale.set(sc, sc, 1); D.shadow.position.set(D.sprite.position.x, 0.03, D.sprite.position.z);
      if (D.t >= DECOY_T) {
        GAME.tmp.set(D.x, 0.6, D.z); GAME.burst(GAME.tmp, 0xffb040, 16, 3.5, 10, 0.6); GAME.flash(GAME.tmp, 0xffb040, 6, 0.3, 4, false); GAME.SFX.play('explode', GAME.tmp, { vol: 0.7 });
        if (!GAME.NET.client) GAME.blastAt(D.x, D.z, 5, 6, 18, false);
        GAME.scene.remove(D.sprite, D.shadow); decoys.splice(i, 1);
      }
    }
  }
  return { DECOY_CD, decoys, decoyCd, throwDecoys, addDecoy, decoyNear, updateDecoys };
}
