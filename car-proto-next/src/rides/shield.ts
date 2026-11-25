// ---------- shield (то, что висит на буре) ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createShield(GAME) {
  function shield() {
    if (GAME.grab.state !== 'hold' || !GAME.grab.held || !GAME.car.alive) return null;
    return { x: GAME.holdPos.x, z: GAME.holdPos.z, r: GAME.grab.held.r * 0.9, h: GAME.grab.held };
  }
  const shieldBar = new THREE.Group();
  const sbBg = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.26), new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.8, depthTest: false }));
  const sbFillGeo = new THREE.PlaneGeometry(1.9, 0.16); sbFillGeo.translate(0.95, 0, 0);
  const sbFill = new THREE.Mesh(sbFillGeo, new THREE.MeshBasicMaterial({ color: 0x5fd36a, depthTest: false, transparent: true }));
  sbFill.position.set(-0.95, 0, 0.01);
  sbBg.renderOrder = 10; sbFill.renderOrder = 11;
  shieldBar.add(sbBg, sbFill); shieldBar.visible = false; GAME.scene.add(shieldBar);

  function chewShield(e) {
    const h = GAME.grab.held;
    GAME.SFX.play('chomp', e.pos); GAME.SFX.play(h.kind === 'crate' ? 'hit_wood' : 'hit_flesh', GAME.holdPos);
    h.shieldHp -= e.bite;
    GS.shake = Math.max(GS.shake, 0.2);
    GAME.spawnParticles(GAME.tmp.set((e.pos.x + GAME.holdPos.x) / 2, GAME.holdPos.y, (e.pos.z + GAME.holdPos.z) / 2),
                   h.kind === 'crate' ? 0xd2873c : 0xc8323c, 5, 6);
    if (h.kind === 'crate') h.ref.flash = 0.08;
    e.vel.set(0, 0, 0);
    if (h.shieldHp <= 0) {                                   // прогрызли
      if (h.kind === 'crate') GAME.damageCrate(h.ref, 99);
      else GAME.hitEnemy(h.ref, GAME.tmp.set(0, 0, 0), 999, 0);
      GAME.spawnParticles(GAME.tmp.copy(GAME.holdPos), h.kind === 'crate' ? 0xd2873c : 0xc8323c, 14, 9);
      GS.shake = Math.max(GS.shake, 0.45);
    }
  }
  function updateShieldBar() {
    const sh = shield();
    shieldBar.visible = !!sh;
    if (!sh) return;
    const h = sh.h, f = Math.max(0, h.shieldHp / h.shieldMax);
    shieldBar.position.set(GAME.holdPos.x, GAME.holdPos.y + h.s / 2 + 1.5, GAME.holdPos.z);
    shieldBar.quaternion.copy(GAME.camera.quaternion);
    sbFill.scale.x = Math.max(0.001, f);
    sbFill.material.color.setHex(f > 0.55 ? 0x5fd36a : f > 0.25 ? 0xf0b43c : 0xe5484d);
  }

  return { shield, chewShield, updateShieldBar };
}
