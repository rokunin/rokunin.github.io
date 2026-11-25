// ---------- aiming ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { W_STATS, BULLET } from '../data/index.js';

export function createAim(GAME) {
  const mouseNdc = new THREE.Vector2(0, 0.3);
  const raycaster = new THREE.Raycaster();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);   // y = 0.9, середина врага
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aimPoint = new THREE.Vector3(0, 0.9, 10), groundAim = new THREE.Vector3(0, 0, 10);
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 28),
    GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff8c32, transparent: true, opacity: 0.85, depthWrite: false }), 3));
  aimRing.geometry.rotateX(-Math.PI / 2);
  GAME.scene.add(aimRing);
  addEventListener('mousemove', e => {
    mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (performance.now() - GAME.touch.last > 800) GAME.touch.aiming = false;   // a real mouse, not the echo of a tap
  });
  function updateAim(dt) {
    GS.autoTarget = null;
    if (GAME.touch.aiming) {                                  // right stick: aim point sits at stick direction from the car
      if (GAME.touch.aim.mag > 0.15) { GAME.stickWorld(GAME.touch.aim.x, GAME.touch.aim.y, GAME.touch.aimDir); GAME.touch.aimDist = 5 + 13 * GAME.touch.aim.mag; }
      groundAim.set(GAME.car.pos.x + GAME.touch.aimDir.x * GAME.touch.aimDist, 0, GAME.car.pos.z + GAME.touch.aimDir.z * GAME.touch.aimDist);
      if (GAME.touch.enabled && GAME.touch.aim.mag <= 0.15 && GAME.car.alive && GAME.car.depth < 0.3) {     // no manual aim: lock on like a shmup
        GS.autoTarget = GAME.pickAutoTarget();
        if (GS.autoTarget) { const tp = GAME.autoTargetPos(GS.autoTarget); groundAim.set(tp.x, 0, tp.z); }
      }
      if (GAME.touch.aim.mag > 0.3) {                         // light aim assist while firing: snap to a target within ~15 degrees
        let bd = 0.26, bx = 0, bz = 0, hit = false;
        const consider = (x, z) => {
          const dx = x - GAME.car.pos.x, dz = z - GAME.car.pos.z, d = Math.hypot(dx, dz);
          if (d < 2 || d > 28) return;
          const ang = Math.acos(THREE.MathUtils.clamp((dx * GAME.touch.aimDir.x + dz * GAME.touch.aimDir.z) / d, -1, 1));
          if (ang < bd) { bd = ang; bx = x; bz = z; hit = true; }
        };
        for (const e of GAME.enemies) if (!e.dead && !e.carried && e.awake) consider(e.pos.x, e.pos.z);
        for (const e of GAME.swarm) if (!e.dead) consider(e.pos.x, e.pos.z);
        if (GAME.boss.state === 'fight') consider(GAME.BOSS_POS.x, GAME.BOSS_POS.z);
        if (hit) groundAim.set(bx, 0, bz);
      }
      aimPoint.set(groundAim.x, 0.9, groundAim.z);
    } else {
      raycaster.setFromCamera(mouseNdc, GAME.camera);
      raycaster.ray.intersectPlane(aimPlane, aimPoint);
      raycaster.ray.intersectPlane(groundPlane, groundAim);
      if (!GS.mouseFire && GAME.car.alive && GAME.car.depth < 0.3) GS.autoTarget = GAME.pickAutoTarget();   // desktop: the gun locks on by itself, hold LMB to aim by hand
    }
    aimRing.position.set(groundAim.x, 0.04, groundAim.z);
    aimRing.rotation.y += dt * 1.5;
    // турель поворачивается к курсору (в локальных координатах кузова)
    const tw = new THREE.Vector3(); GAME.turret.getWorldPosition(tw);
    const tgt = GS.autoTarget ? GAME.autoTargetPos(GS.autoTarget) : aimPoint;      // the cursor still steers the grabber and throws
    const want = Math.atan2(tgt.x - tw.x, tgt.z - tw.z) - GAME.car.heading;
    let d = want - GAME.turret.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    GAME.turret.rotation.y += Math.sign(d) * Math.min(Math.abs(d), 14 * dt);
  }

  const fireV = new THREE.Vector3();
  const starGeo = (() => {                               // six spikes: a caltrop
    const pos = [], nor = [];
    for (const [rx, rz] of [[0, 0], [Math.PI, 0], [Math.PI / 2, 0], [-Math.PI / 2, 0], [0, Math.PI / 2], [0, -Math.PI / 2]]) {
      const c = new THREE.ConeGeometry(0.13, 0.5, 4); c.translate(0, 0.27, 0); c.rotateX(rx); c.rotateZ(rz);
      const g = c.toNonIndexed(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return g;
  })();
  const starMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffa02a }), 3.2);
  function fire() {
    const tip = new THREE.Vector3();
    GAME.muzzle.getWorldPosition(tip);
    const yaw = GAME.car.heading + GAME.turret.rotation.y;                     // куда реально смотрит ствол
    const ap = GS.autoTarget ? fireV.copy(GAME.autoTargetPos(GS.autoTarget)).setY(0.9) : aimPoint;
    const hd = Math.hypot(ap.x - tip.x, ap.z - tip.z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(ap.y - tip.y, Math.max(hd, 3)), -0.5, 0.1);
    const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const lv = GAME.weapons.spread, n = lv ? (GS.ride === 'halo' ? Math.max(1, Math.round(W_STATS.spread.n[lv - 1] * 0.7)) : W_STATS.spread.n[lv - 1]) : 1, arc = lv ? W_STATS.spread.arc[lv - 1] : 0;
    for (let i = 0; i < n; i++) {                       // fan gun: n tracers spread evenly across the arc
      const spread = (n > 1 ? (i / (n - 1) - 0.5) * arc : 0) + GAME.rand(-0.02, 0.02);
      const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      const star = GS.ride === 'spider';
      const m = new THREE.Mesh(star ? starGeo : GAME.bulletGeo, star ? starMat : GAME.bulletMat);
      m.position.copy(tip);
      m.lookAt(tip.x + dir.x, tip.y + dir.y, tip.z + dir.z);
      GAME.scene.add(m);
      const holy = GS.ride === 'halo';                      // the halo's fan is thinner: its strength is the swords
      GAME.bullets.push({ m, v: dir.multiplyScalar(BULLET.speed[star ? 'star' : holy ? 'holy' : 'base']), life: BULLET.life[star ? 'star' : 'base'] * (lv ? BULLET.fanLife : 1), spin: star, dmg: BULLET.dmg });      // the fan gun reaches shorter (the halo's a little shorter still); the halo's handicap is its 30% thinner fan, nothing stacked on top
    }
    GS.muzzleTimer = 0.04;
    GAME.muzzleLight.position.copy(tip); GAME.muzzleLight.intensity = Math.max(GAME.muzzleLight.intensity, 0.55 * GAME.LIGHT);
    GAME.SFX.play('shot', tip); GAME.NET.fireSeq = (GAME.NET.fireSeq + 1) % 100000;
  }

  return { groundAim, updateAim, starGeo, starMat, fire };
}
