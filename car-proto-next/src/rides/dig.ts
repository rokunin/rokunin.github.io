// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- выкапывание ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createDig(GAME) {
  const DIG_TIME = 3, digTime = () => DIG_TIME * (GAME.abLv.burrow >= 1 ? 1.6 : 1);                                // одна архизлюка откапывает за 3 с, несколько — быстрее
  const digBar = new THREE.Group();
  const dbBg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.3), new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.8, depthTest: false }));
  const dbFillGeo = new THREE.PlaneGeometry(2.5, 0.2); dbFillGeo.translate(1.25, 0, 0);
  const dbFill = new THREE.Mesh(dbFillGeo, new THREE.MeshBasicMaterial({ color: 0xd040a0, depthTest: false, transparent: true }));
  dbFill.position.set(-1.25, 0, 0.01); dbBg.renderOrder = 10; dbFill.renderOrder = 11;
  digBar.add(dbBg, dbFill); digBar.visible = false; GAME.scene.add(digBar);
  const alertEl = document.getElementById('alert'); let alertT = 0;
  function flashAlert(text) { alertEl.textContent = text; alertEl.style.opacity = 1; alertT = 1.4; }
  let digDirtT = 0;
  function updateDig(dt) {
    alertT -= dt; if (alertT <= 0) alertEl.style.opacity = 0;
    const hidden = GAME.car.alive && (GAME.car.burrow === 'under' || GAME.car.burrow === 'down');
    if (!hidden) { GAME.car.dig = 0; digBar.visible = false; return; }
    GAME.car.dig = GAME.car.dig || 0;
    if (GS.diggers > 0) {
      GAME.crewSay('dig');
      GAME.car.dig += dt * GS.diggers;
      digDirtT -= dt;
      if (digDirtT <= 0) { digDirtT = 0.06; GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(0.5), Math.random() < 0.7 ? 0x6b5a3e : 0xd040a0, 2, 7); }
      GAME.mound.position.x += GAME.rand(-0.08, 0.08); GAME.mound.position.z += GAME.rand(-0.08, 0.08);   // нора трясётся
      GAME.SFX.play('scratch', GAME.car.pos);
      GS.shake = Math.max(GS.shake, 0.12);
    } else GAME.car.dig = Math.max(0, GAME.car.dig - dt * 0.5);  // бросили копать — нора потихоньку «заживает»
    digBar.visible = GAME.car.dig > 0;
    if (digBar.visible) {
      digBar.position.set(GAME.car.pos.x, 4.3, GAME.car.pos.z);
      digBar.quaternion.copy(GAME.camera.quaternion);
      dbFill.scale.x = Math.max(0.001, Math.min(1, GAME.car.dig / digTime()));
    }
    if (GAME.car.dig >= digTime()) {                         // откопали: выкидывает наверх
      GAME.car.dig = 0; digBar.visible = false;
      GAME.car.burrow = 'up'; GAME.car.depth = 0; GAME.car.burrowCd = 2;
      GAME.car.vy = 9; GAME.car.airborne = true; GAME.car.usedDouble = true; GAME.car.popped = true;
      GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(0.5), 0x6b5a3e, 26, 12);
      GS.shake = Math.max(GS.shake, 0.7);
      flashAlert('DUG OUT!'); GAME.SFX.play('dig_up', GAME.car.pos); GAME.SFX.play('growl_elite', GAME.car.pos, { delay: 0.1 });
    }
  }

  return { flashAlert, updateDig };
}
