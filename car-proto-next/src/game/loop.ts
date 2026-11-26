// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- loop ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from './state.ts';
import { FIRE_RATE, W_STATS, TUNE, UNI, BUG, RIG } from '../data/index.js';

export function createLoop(GAME) {
  const clock = new THREE.Timer();      // Clock is deprecated since r183
  const tmp = new THREE.Vector3();
  let roll = 0, pitch = 0, wheelSpin = 0, prevSpeed = 0;
  GS.hurtFlash = 0; GS.elapsed = 0; GS.shake = 0;
  const lastValid = new THREE.Vector3();
  const hpFill = document.getElementById('hpfill');

  // ---- spider locomotion (ported from the mech prototype): it sticks to pillars and rocks, walks up their sides and over the top ----
  const SPL = { L1: 1.15, L2: 1.6, bodyH: 0.95 }, SP_MG = 1.0;
  const SPD = { n: new THREE.Vector3(0, 1, 0), surf: null, fwd: new THREE.Vector3(0, 0, 1), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), p: new THREE.Vector3() };
  const spUp = new THREE.Vector3(), spO = new THREE.Vector3(), spDn = new THREE.Vector3(), spC = new THREE.Vector3(), spIn = new THREE.Vector3(), spF = new THREE.Vector3(),
        spA = new THREE.Vector3(), spT = new THREE.Vector3(), spW = new THREE.Vector3(), spV = new THREE.Vector3(), spQ = new THREE.Vector3(), spN = new THREE.Vector3(),
        spX = new THREE.Vector3(), spZ = new THREE.Vector3(), spM = new THREE.Matrix4(), spQt = new THREE.Quaternion(), spHit = new THREE.Vector3();
  const spRay = new THREE.Ray(), spBox = new THREE.Box3(), spBoxes = [];
  const climbable = o => (o.pillar || o.rock) && GAME.active(o);
  function spCast(o, d, maxD, out) {                     // ray against the ground plane and nearby climbable boxes
    let best = maxD, found = false;
    if (d.y < -1e-4) { const t = -o.y / d.y; if (t >= 0 && t < best) { best = t; found = true; out.copy(o).addScaledVector(d, t); } }
    spRay.set(o, d);
    for (const b of spBoxes) {
      const q = b.mesh.position; spBox.min.set(q.x - b.hx, 0, q.z - b.hz); spBox.max.set(q.x + b.hx, b.h, q.z + b.hz);
      if (spRay.intersectBox(spBox, spHit)) { const t = spHit.distanceTo(o); if (t < best) { best = t; found = true; out.copy(spHit); } }
    }
    return found;
  }
  function spSide(o, p, n, mg) {                         // nearest side face: snaps p onto it, returns its normal
    const q = o.mesh.position, dxm = p.x - (q.x - o.hx - mg), dxp = (q.x + o.hx + mg) - p.x, dzm = p.z - (q.z - o.hz - mg), dzp = (q.z + o.hz + mg) - p.z, m = Math.min(dxm, dxp, dzm, dzp);
    if (m === dxm) { p.x = q.x - o.hx; return n.set(-1, 0, 0); } if (m === dxp) { p.x = q.x + o.hx; return n.set(1, 0, 0); }
    if (m === dzm) { p.z = q.z - o.hz; return n.set(0, 0, -1); } p.z = q.z + o.hz; return n.set(0, 0, 1);
  }
  function spiderWrap() {                                // keep the body on its surface, rolling over box edges onto the next face
    const p = SPD.p, v = SPD.vel, b = SPD.surf;
    if (!b) {
      if (p.y > 0.3) for (const o of GAME.obstacles) {        // landed on top of something
        if (!climbable(o) || Math.abs(p.y - o.h) > 0.8) continue;
        const q = o.mesh.position; if (Math.abs(p.x - q.x) < o.hx + 0.3 && Math.abs(p.z - q.z) < o.hz + 0.3) { SPD.surf = o; SPD.n.set(0, 1, 0); p.y = o.h; return; }
      }
      p.y = 0;
      for (const o of GAME.obstacles) {
        if (!climbable(o)) continue;
        const q = o.mesh.position;
        if (Math.abs(p.x - q.x) < o.hx + SP_MG && Math.abs(p.z - q.z) < o.hz + SP_MG) {
          spQ.copy(p); const n = spSide(o, spQ, spN, SP_MG), into = -v.dot(n);
          if (into > 0.5) { p.copy(spQ); p.y = 0.02; v.addScaledVector(n, into); v.y += into; SPD.surf = o; SPD.n.copy(n); return; }   // walking into it: start climbing
          if (n.x) p.x = spQ.x + n.x * SP_MG; else p.z = spQ.z + n.z * SP_MG;                                                       // otherwise slide past
        }
      }
      return;
    }
    const q = b.mesh.position, min = { x: q.x - b.hx, z: q.z - b.hz }, max = { x: q.x + b.hx, y: b.h, z: q.z + b.hz }, n = SPD.n;
    let e;
    if (n.y > 0.5) {
      p.y = max.y;
      if (p.x > max.x) { e = p.x - max.x; p.x = max.x; p.y = max.y - e; n.set(1, 0, 0); v.y = -v.x; v.x = 0; }
      else if (p.x < min.x) { e = min.x - p.x; p.x = min.x; p.y = max.y - e; n.set(-1, 0, 0); v.y = v.x; v.x = 0; }
      else if (p.z > max.z) { e = p.z - max.z; p.z = max.z; p.y = max.y - e; n.set(0, 0, 1); v.y = -v.z; v.z = 0; }
      else if (p.z < min.z) { e = min.z - p.z; p.z = min.z; p.y = max.y - e; n.set(0, 0, -1); v.y = v.z; v.z = 0; }
      return;
    }
    const ax = n.x !== 0 ? 'x' : 'z', ot = ax === 'x' ? 'z' : 'x', sg = n[ax] > 0 ? 1 : -1, plane = sg > 0 ? max[ax] : min[ax];
    p[ax] = plane;
    if (p.y > max.y) { e = p.y - max.y; p.y = max.y; p[ax] = plane - sg * e; n.set(0, 1, 0); v[ax] = -sg * v.y; v.y = 0; }
    else if (p.y < 0) { e = -p.y; p.y = 0; p[ax] = plane + sg * e; SPD.surf = null; n.set(0, 1, 0); v[ax] = sg * -v.y; v.y = 0; }
    else if (p[ot] > max[ot]) { e = p[ot] - max[ot]; p[ot] = max[ot]; p[ax] = plane - sg * e; n.set(0, 0, 0); n[ot] = 1; v[ax] = -sg * v[ot]; v[ot] = 0; }
    else if (p[ot] < min[ot]) { e = min[ot] - p[ot]; p[ot] = min[ot]; p[ax] = plane - sg * e; n.set(0, 0, 0); n[ot] = -1; v[ax] = sg * v[ot]; v[ot] = 0; }
  }
  // the unicorn: a horse, not a car — bites into the ground, no drifting, stops short, backs up slowly
  // the buggy handles exactly like the unicorn, 10% quicker, and backs up almost as fast as it goes forward
  // the halo: hovers. Goes wherever you point (screen directions), picks up speed slowly and keeps gliding when you let go
  function haloDrive(dt, ctl, stick) {
    let dx = 0, dz = 0, mag = 0;
    if (stick) { GAME.stickWorld(GAME.touch.move.x, GAME.touch.move.y, tmp); const l = Math.hypot(tmp.x, tmp.z) || 1; dx = tmp.x / l; dz = tmp.z / l; mag = Math.min(1, GAME.touch.move.mag * 1.15); }
    else if (ctl) {
      const f = (GAME.keys.KeyW || GAME.keys.ArrowUp ? 1 : 0) - (GAME.keys.KeyS || GAME.keys.ArrowDown ? 1 : 0), r = (GAME.keys.KeyD || GAME.keys.ArrowRight ? 1 : 0) - (GAME.keys.KeyA || GAME.keys.ArrowLeft ? 1 : 0);
      dx = r - f; dz = -r - f; const l = Math.hypot(dx, dz); if (l > 0) { dx /= l; dz /= l; mag = 1; }
    }
    if (!GAME.car.airborne) {                                 // goes where you point almost at once, drifts to a stop in about half a second
      const top = TUNE.maxSpeed * 1.05 * mag * GAME.towK(), q = 1 - Math.exp(-(mag ? 6.5 : 3.2) * dt);
      GAME.car.vel.x += (dx * top - GAME.car.vel.x) * q; GAME.car.vel.z += (dz * top - GAME.car.vel.z) * q;
      if (GAME.car.burrow !== 'up') GAME.car.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
    }
    const sp = Math.hypot(GAME.car.vel.x, GAME.car.vel.z);
    if (mag || sp > 3) {                                // the rings lean and swing round to where it is being pushed, lazily
      const want = mag ? Math.atan2(dx, dz) : Math.atan2(GAME.car.vel.x, GAME.car.vel.z), d = Math.atan2(Math.sin(want - GAME.car.heading), Math.cos(want - GAME.car.heading));
      GAME.car.heading += d * (1 - Math.exp(-9 * dt)); GAME.car.steer = THREE.MathUtils.clamp(d, -1, 1);
    } else GAME.car.steer = 0;
    GAME.car.speed = sp;
  }
  function spiderDrive(dt, ctl, stick) {                // runs straight where you point: screen-relative, no steering, almost no inertia
    let dx = 0, dz = 0, mag = 0;
    if (stick) { GAME.stickWorld(GAME.touch.move.x, GAME.touch.move.y, tmp); const l = Math.hypot(tmp.x, tmp.z) || 1; dx = tmp.x / l; dz = tmp.z / l; mag = Math.min(1, GAME.touch.move.mag * 1.15); }
    else if (ctl) {
      const f = (GAME.keys.KeyW || GAME.keys.ArrowUp ? 1 : 0) - (GAME.keys.KeyS || GAME.keys.ArrowDown ? 1 : 0), r = (GAME.keys.KeyD || GAME.keys.ArrowRight ? 1 : 0) - (GAME.keys.KeyA || GAME.keys.ArrowLeft ? 1 : 0);
      dx = r - f; dz = -r - f; const l = Math.hypot(dx, dz); if (l > 0) { dx /= l; dz /= l; mag = 1; }
    }
    const n = SPD.n;
    if (SPD.surf && !GAME.active(SPD.surf)) { SPD.surf = null; n.set(0, 1, 0); if (GAME.car.y > 0.2) { GAME.car.airborne = true; GAME.car.vy = 0; } }   // the thing under us got smashed
    if (GAME.car.airborne) {
      SPD.surf = null; n.set(0, 1, 0); SPD.vel.set(GAME.car.vel.x, 0, GAME.car.vel.z);
      for (const o of GAME.obstacles) {                       // grab a wall mid-jump
        if (!climbable(o) || GAME.car.y > o.h - 0.15 || GAME.car.vy > 2) continue;
        const q = o.mesh.position;
        if (Math.abs(GAME.car.pos.x - q.x) < o.hx + 0.4 && Math.abs(GAME.car.pos.z - q.z) < o.hz + 0.4) {
          SPD.p.set(GAME.car.pos.x, GAME.car.y, GAME.car.pos.z); spSide(o, SPD.p, n, 0.4); GAME.car.pos.x = SPD.p.x; GAME.car.pos.z = SPD.p.z;
          SPD.surf = o; GAME.car.airborne = false; GAME.car.vy = 0; SPD.vel.set(0, 0, 0); GAME.car.vel.set(0, 0, 0); GAME.SFX.play('land', GAME.car.pos, { vol: 0.5 }); break;
        }
      }
    } else {
      const dn = dx * n.x + dz * n.z;
      spW.set(dx - n.x * dn, n.y < 0.5 ? -dn : 0, dz - n.z * dn);                // on a wall, pushing into it means "up"
      if (spW.lengthSq() > 1e-4) spW.normalize();
      SPD.vel.addScaledVector(n, -SPD.vel.dot(n));
      SPD.vel.lerp(spW.multiplyScalar(TUNE.maxSpeed * 0.85 * mag * GAME.towK() * (n.y < 0.5 ? 0.75 : 1)), 1 - Math.exp(-11 * dt));
      if (GAME.car.burrow !== 'up') SPD.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
      SPD.p.set(GAME.car.pos.x, GAME.car.y, GAME.car.pos.z).addScaledVector(SPD.vel, dt);
      spiderWrap();
      GAME.car.pos.x = SPD.p.x; GAME.car.pos.z = SPD.p.z; GAME.car.y = SPD.p.y; GAME.car.vel.set(SPD.vel.x, 0, SPD.vel.z);
    }
    GAME.car.speed = SPD.vel.length(); GAME.car.steer = 0;
    { const wall = !GAME.car.airborne && n.y < 0.5;            // scuttling up a wall shakes the passengers out: one as it mounts, then one a second while it climbs
      if (wall && !SPD.wasWall) { GAME.cartKick(4); GAME.cartSpill(1); SPD.wallT = 1; }
      else if (wall && GAME.car.speed > 3 && (SPD.wallT -= dt) <= 0) { SPD.wallT = 1; GAME.cartKick(3); GAME.cartSpill(1); }
      SPD.wasWall = wall; }
    // facing and orientation: up is the surface normal
    spV.copy(SPD.vel).addScaledVector(n, -SPD.vel.dot(n));
    if (spV.length() > 1) SPD.fwd.lerp(spV.normalize(), 1 - Math.exp(-12 * dt));
    SPD.fwd.addScaledVector(n, -SPD.fwd.dot(n)); if (SPD.fwd.lengthSq() < 1e-4) SPD.fwd.set(0, n.y < 0.5 ? 1 : 0, n.y < 0.5 ? 0 : 1); SPD.fwd.normalize();
    if (n.y > 0.5) GAME.car.heading = Math.atan2(SPD.fwd.x, SPD.fwd.z);
    spX.crossVectors(n, SPD.fwd).normalize(); spZ.crossVectors(spX, n);
    spM.makeBasis(spX, n, spZ); spQt.setFromRotationMatrix(spM);
    SPD.quat.slerp(spQt, 1 - Math.exp(-(GAME.car.airborne ? 5 : 12) * dt));
  }
  function update(dt) {
    GS.elapsed += dt;
    const ctl = GAME.car.alive && GAME.car.burrow === 'up';
    GAME.updateJump(dt);
    GAME.updateBurrow(dt);
    const stick = ctl && GAME.touch.move.mag > 0.18;             // touch: turn toward the stick, throttle once roughly facing it
    let stickTurn = 0;
    if (stick) {
      GAME.stickWorld(GAME.touch.move.x, GAME.touch.move.y, tmp);
      const want = Math.atan2(tmp.x, tmp.z);
      stickTurn = Math.atan2(Math.sin(want - GAME.car.heading), Math.cos(want - GAME.car.heading));
    }
    const up = ctl && (GAME.keys.KeyW || GAME.keys.ArrowUp || (stick && Math.abs(stickTurn) < 1.3)), down = ctl && (GAME.keys.KeyS || GAME.keys.ArrowDown);
    const left = ctl && (GAME.keys.KeyA || GAME.keys.ArrowLeft), right = ctl && (GAME.keys.KeyD || GAME.keys.ArrowRight);
    if (!GAME.car.alive) { GAME.car.deadTimer -= dt; if (GAME.car.deadTimer <= 0) GAME.respawn(); }
    else if (GS.elapsed - GAME.car.lastHurt > 3 && GAME.car.hp < GAME.car.maxHp) GAME.car.hp = Math.min(GAME.car.maxHp, GAME.car.hp + GAME.car.maxHp * 0.06 * dt);

    if (GS.ride === 'spider') spiderDrive(dt, ctl, stick); else if (GS.ride === 'halo') haloDrive(dt, ctl, stick); else {
    const RT = GS.ride === 'unicorn' ? UNI : BUG;
    // throttle / brake
    if (up) GAME.car.speed += (GAME.car.speed < 0 ? RT.brake : RT.accel) * dt;
    else if (down) GAME.car.speed -= (GAME.car.speed > 0 ? RT.brake : RT.reverseAccel) * dt;
    else GAME.car.speed -= Math.sign(GAME.car.speed) * Math.min(Math.abs(GAME.car.speed), RT.coast * dt);
    GAME.car.speed = THREE.MathUtils.clamp(GAME.car.speed, RT.maxReverse * GAME.towK(), RT.maxSpeed * GAME.towK() * (stick ? Math.max(0.45, GAME.touch.move.mag) : 1));   // analog throttle
    if (GAME.car.burrow !== 'up') { const f = Math.max(0, 1 - 9 * dt); GAME.car.speed *= f; GAME.car.vel.multiplyScalar(f); }

    // steering — eased, scaled by speed so it doesn't spin in place
    let steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
    let cursorTurn = 0;
    const turnMode = stick ? 'cursor' : GAME.car.mode;
    if (stick) { cursorTurn = stickTurn; steerTarget = THREE.MathUtils.clamp(cursorTurn * 2, -1, 1); }
    else if (GAME.car.mode === 'cursor' && ctl && Math.hypot(GAME.groundAim.x - GAME.car.pos.x, GAME.groundAim.z - GAME.car.pos.z) > 1.5) {
      const want = Math.atan2(GAME.groundAim.x - GAME.car.pos.x, GAME.groundAim.z - GAME.car.pos.z);
      cursorTurn = Math.atan2(Math.sin(want - GAME.car.heading), Math.cos(want - GAME.car.heading));
      steerTarget = THREE.MathUtils.clamp(cursorTurn * 2, -1, 1);   // для колёс и крена
    }
    GAME.car.steer += (steerTarget - GAME.car.steer) * Math.min(1, (turnMode !== 'car' ? RT.spinSteerRate : RT.steerRate) * dt);
    if (turnMode === 'cursor') {
      // разворачивается к курсору: быстро издалека, плавно доводит у цели
      const step = RT.spinRate * 1.2 * dt;
      GAME.car.heading += Math.sign(cursorTurn) * Math.min(Math.abs(cursorTurn), Math.max(step * Math.min(1, Math.abs(cursorTurn) * 3), step * 0.25));
    } else if (turnMode === 'human') {
      // поворот на месте с постоянной скоростью, не зависит ни от скорости, ни от заднего хода
      GAME.car.heading += GAME.car.steer * RT.spinRate * dt;
    } else {
      const speedFactor = THREE.MathUtils.clamp(GAME.car.speed / 7, -1, 1);
      const highSpeedDamp = 1 - 0.35 * Math.min(1, Math.abs(GAME.car.speed) / RT.maxSpeed);
      GAME.car.heading += GAME.car.steer * RT.turnRate * speedFactor * highSpeedDamp * dt;
    }

    }
    // velocity chases the heading → light drift
    const fx = Math.sin(GAME.car.heading), fz = Math.cos(GAME.car.heading);
    const k = GAME.car.airborne || GS.ride === 'spider' || GS.ride === 'halo' ? 0 : Math.min(1, (GS.ride === 'unicorn' ? UNI.grip : BUG.grip) * dt);   // в воздухе летим по инерции
    GAME.car.vel.x += (fx * GAME.car.speed - GAME.car.vel.x) * k;
    GAME.car.vel.z += (fz * GAME.car.speed - GAME.car.vel.z) * k;
    GAME.car.vel.y = 0; GAME.car.pos.y = 0;                         // height lives in car.y; the position vector stays on the ground plane
    if (!(GS.ride === 'spider' && !GAME.car.airborne)) GAME.car.pos.addScaledVector(GAME.car.vel, GS.ride === 'unicorn' && !GAME.car.airborne ? dt * (1 + 0.16 * Math.sin(GS.ridePhase * 4.8)) : dt);   // a gallop surges with every stride

    // collisions
    const crawler = GS.ride === 'spider';
    for (const o of GAME.obstacles) if (GAME.active(o) && (o.wall || GAME.car.y < o.h - 0.2) && !(crawler && (o.pillar || o.rock))) GAME.resolveCarVsBox(o);
    if (crawler) {                                       // the spider walks over pillars and rocks instead of ramming them
      let gh = 0;
      for (const o of GAME.obstacles) if ((o.pillar || o.rock) && GAME.active(o) && Math.abs(o.mesh.position.x - GAME.car.pos.x) < o.hx + 0.5 && Math.abs(o.mesh.position.z - GAME.car.pos.z) < o.hz + 0.5) gh = Math.max(gh, o.h);
      GAME.car.ground = gh;
    } else GAME.car.ground = 0;   // ящики можно перепрыгнуть, стены — нет
    if (GAME.inWorld(GAME.car.pos.x, GAME.car.pos.z)) lastValid.copy(GAME.car.pos);    // страховка, если всё-таки вылетели за стены
    else { GAME.car.pos.copy(lastValid); GAME.car.vel.multiplyScalar(-0.3); GAME.car.speed *= 0.5; }

    // car visuals
    GAME.carGroup.position.set(GAME.car.pos.x, GAME.car.y - GAME.car.depth * GAME.BURY_DEPTH, GAME.car.pos.z);   // высота: прыжок минус закапывание
    GAME.carGroup.rotation.y = GAME.car.heading;
    if (crawler) GAME.carGroup.quaternion.copy(SPD.quat);
    const accelNow = (GAME.car.speed - prevSpeed) / Math.max(dt, 1e-4); prevSpeed = GAME.car.speed;
    const lateral = GAME.car.vel.x * fz - GAME.car.vel.z * fx; // sideways slip
    GAME.updateSkid(dt, GS.ride === 'buggy' ? lateral : 0);
    roll += (THREE.MathUtils.clamp(-GAME.car.steer * Math.abs(GAME.car.speed) * 0.006 + lateral * 0.02, -0.12, 0.12) - roll) * Math.min(1, 8 * dt);
    pitch += (THREE.MathUtils.clamp(-accelNow * 0.002, -0.06, 0.06) - pitch) * Math.min(1, 6 * dt);
    GAME.body.rotation.z = roll; GAME.body.rotation.x = pitch + Math.sin(GAME.car.depth * Math.PI) * 0.45 - THREE.MathUtils.clamp(GAME.car.vy * 0.025, -0.3, 0.3); // ныряет носом; в прыжке задирает/клюёт
    wheelSpin += GAME.car.speed * dt / 0.48;
    for (const w of GAME.wheels) {
      w.mesh.rotation.x = wheelSpin;
      w.pivot.rotation.y = w.front ? GAME.car.steer * 0.5 : 0;
    }

    // shooting
    GS.fireCooldown -= dt;
    let autoFire = false;
    if (GS.autoTarget) {                                   // shoot once the turret is roughly on target
      const tp = GAME.autoTargetPos(GS.autoTarget), want = Math.atan2(tp.x - GAME.car.pos.x, tp.z - GAME.car.pos.z) - GAME.car.heading - GAME.turret.rotation.y;
      autoFire = Math.abs(Math.atan2(Math.sin(want), Math.cos(want))) < 0.22;
    }
    if (ctl && (GS.mouseFire || GAME.touch.aim.mag > 0.3 || autoFire) && GS.fireCooldown <= 0) {
      GAME.fire(); GS.fireCooldown = 1 / (FIRE_RATE * (GAME.weapons.spread ? W_STATS.spread.rate[GAME.weapons.spread - 1] : 1));
    }
    GS.muzzleTimer -= dt;
    GAME.muzzle.visible = GS.muzzleTimer > 0;
    if (GAME.muzzle.visible) GAME.muzzle.scale.setScalar(GAME.rand(0.7, 1.3));

    for (let i = GAME.bullets.length - 1; i >= 0; i--) {
      const b = GAME.bullets[i];
      b.life -= dt;
      b.m.position.addScaledVector(b.v, dt);
      if (b.spin) { b.m.rotation.x += dt * 16; b.m.rotation.z += dt * 11; }
      const bp = b.m.position;
      let hit = b.life <= 0 || !GAME.inWorld(bp.x, bp.z);
      if (!hit && bp.y < 0.05) { hit = true; GAME.spawnParticles(bp.setY(0.1), 0x8a8a78, 2, 3); GAME.SFX.play('hit_dirt', bp); }
      if (!hit) for (const e of GAME.enemies) {
        if (e.dead || e.carried) continue;
        if (Math.hypot(bp.x - e.pos.x, bp.z - e.pos.z) < e.r + 0.25 && bp.y < e.s + e.hop.position.y + 0.6) {
          hit = true;
          GAME.spawnParticles(bp, 0xff6a6a, 3, 5); GAME.flash(bp, 0xff7050, 1.8, 0.12, 2.5, false); GAME.SFX.play('hit_flesh', bp, { vol: 0.6 });
          GAME.hitEnemy(e, tmp.copy(b.v).setY(0).normalize(), b.dmg || 1);
          break;
        }
      }
      if (!hit) for (const m of GAME.swarm) {
        if (m.dead || (m.rig && RIG.tame) || Math.hypot(bp.x - m.pos.x, bp.z - m.pos.z) > m.r + 0.35 || bp.y > GAME.critterTop(m) + 0.6) continue;
        hit = true;
        GAME.spawnParticles(bp, m.art.color, 3, 5); GAME.SFX.play('hit_flesh', bp, { vol: 0.5, rate: 1.2 });
        GAME.hitCritter(m, b.dmg || 1, tmp.copy(b.v).setY(0).normalize(), 2.5);
        break;
      }
      if (!hit) for (const o of GAME.obstacles) {
        if (!GAME.active(o)) continue;
        const p = o.mesh.position;
        if (Math.abs(bp.x - p.x) < o.hx + 0.15 && Math.abs(bp.z - p.z) < o.hz + 0.15 && bp.y < o.h + 0.2) {
          hit = true;
          GAME.spawnParticles(bp, o.crate ? 0xffc06a : 0xbfc3c9, 3, 5); GAME.flash(bp, 0xffc070, 1.5, 0.1, 2.5, false);
          GAME.SFX.play(o.crate ? 'hit_wood' : o.boss ? 'hit_boss' : 'hit_stone', bp);
          if (o.crate) GAME.damageCrate(o, b.dmg || 1);
          else if (o.boss) GAME.bossDamage(b.dmg || 1);
          break;
        }
      }
      if (hit) { GAME.scene.remove(b.m); GAME.bullets.splice(i, 1); }
    }

    for (const o of GAME.obstacles) if (o.crate && o.mesh.visible) {
      o.flash -= dt;
      o.mesh.material = o.flash > 0 ? GAME.crateHitMat : GAME.crateMat;
    }
    for (let i = GAME.respawnQueue.length - 1; i >= 0; i--) {
      const r = GAME.respawnQueue[i];
      r.t -= dt;
      if (r.t <= 0) {
        const [x, z] = r.o.room ? GAME.roomSpot(r.o.hx) : GAME.crateSpot(r.o);
        r.o.mesh.position.set(x, r.o.h / 2, z); r.o.mesh.rotation.set(0, 0, 0); r.o.hp = 3; r.o.mesh.visible = true;
        GAME.respawnQueue.splice(i, 1);
      }
    }

    for (let i = GAME.particles.length - 1; i >= 0; i--) {
      const p = GAME.particles[i];
      p.life -= dt;
      p.v.y -= 25 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.15) { p.m.position.y = 0.15; p.v.y *= -0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
      p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt;
      p.m.scale.multiplyScalar(p.life < 0.3 ? 0.9 : 1);
      if (p.life <= 0) { GAME.scene.remove(p.m); GAME.particles.splice(i, 1); }
    }

    GAME.updateAim(dt);
    GAME.updateFx(dt);
    GAME.updateHeadlight();
    GAME.updateBoss(dt);
    GAME.updateShieldBar();
    GAME.updatePickups(dt); GAME.updateLoot(dt); GAME.updateWbMarks(); GAME.updatePedestals(dt); GAME.updateBombs(dt); GAME.updateLossFx(dt); GAME.updateDomes(dt); GAME.updateDecoys(dt); GAME.updateCubes(dt); GAME.updateLandFx(dt); GAME.updateUlts(dt); GAME.updateTrails(dt); GAME.updateAbHud();
    GAME.updateDrill(dt);
    GAME.updateWeapons(dt);
    GAME.updateGrab(dt);
    GAME.updateEnemies(dt);
    GAME.updateSwarm(dt);
    GAME.updateChunks(dt);
    GAME.updateChubs(dt);
    GAME.updateAltars(dt);
    GAME.updateAngel(dt);
    GAME.updateRide(dt);
    if (GS.ride === 'unicorn') GAME.updateHorn();
    GAME.updateNet(dt);
    GAME.updatePhases(dt); GAME.updateHints(dt); GAME.updateMinimap(dt);
    GAME.updateDiag();

    GS.hurtFlash -= dt;
    GAME.paint.emissive.setHex(GS.hurtFlash > 0 ? 0xaa1111 : 0x000000);
    const hpK = GAME.car.hp / GAME.car.maxHp * 100;
    hpFill.style.width = hpK + '%';
    hpFill.style.background = hpK > 55 ? '#5fd36a' : hpK > 25 ? '#f0b43c' : '#e5484d';

    // camera: fixed iso angle, smooth follow + small look-ahead along velocity
    tmp.copy(GAME.car.pos).addScaledVector(GAME.car.vel, 0.35);
    GAME.camFocus.lerp(tmp, 1 - Math.exp(-5 * dt));
    GAME.camera.position.copy(GAME.camFocus).add(GAME.ISO_OFFSET);
    GAME.camera.lookAt(GAME.camFocus);
    GS.shake = Math.max(0, GS.shake - dt * 2.5);
    if (GS.shake > 0) GAME.camera.position.add(tmp.set(GAME.rand(-1, 1), GAME.rand(-1, 1), GAME.rand(-1, 1)).multiplyScalar(GS.shake * 0.6));

    GAME.sun.position.copy(GAME.camFocus).add(GAME.SUN_OFFSET);
    GAME.sun.target.position.copy(GAME.camFocus);

    GAME.spdEl.textContent = Math.round(Math.abs(GAME.car.speed) * 3.6 * 1.5);
    // engine pitch follows speed, filter opens with throttle; wind outside, drone in the boss room
    {
      const thr = up || down ? 1 : 0, spdK = Math.min(1, Math.abs(GAME.car.speed) / TUNE.maxSpeed);
      const live = GAME.car.alive && GAME.car.depth < 0.6, vK = Math.min(1, Math.hypot(GAME.car.vel.x, GAME.car.vel.z) / TUNE.maxSpeed);
      GAME.SFX.loop('hum', GS.ride === 'halo' && live ? 0.05 + 0.04 * vK : 0, 1);
      GAME.SFX.loop('servo', GS.ride === 'spider' && live ? 0.11 * vK : 0, 0.8 + 0.5 * vK);
      GAME.SFX.loop('engine', GS.ride === 'buggy' && live ? 0.16 + 0.2 * thr + 0.12 * spdK : 0, 0.72 + 1.3 * spdK + 0.12 * thr, 450 + 2300 * Math.min(1, 0.35 * thr + spdK));
      const inBoss = GAME.inRoom(GAME.car.pos.x, GAME.car.pos.z);
      GAME.SFX.loop('wind', (inBoss ? 0.05 : 0.13) + (GS.ride === 'halo' ? 0.05 * vK : 0), 1);
      GAME.SFX.loop('drone', inBoss && (GAME.boss.state === 'fight' || GAME.boss.state === 'emerging') ? 0.32 : 0, 1);
      GAME.SFX.setRoom(inBoss ? 0.12 : 0);
    }
  }

  // drop render resolution if the machine can't hold ~40 fps (only ever goes down, so it can't oscillate)
  let perfT = 0, perfN = 0, warmup = 30;
  function adaptQuality(raw) { if (GAME.HX) return;      // tests: the picture must not change with the machine's speed
    if (warmup > 0) { warmup--; return; }           // shader compiles make the first frames slow
    if (raw > 1) return;                            // tab was in the background
    perfT += raw; perfN++;
    if (perfT < 1 || perfN < 3) return;
    const avg = perfT / perfN; perfT = 0; perfN = 0;
    const floor = GAME.COARSE ? 0.5 : 0.6;
    if (avg > 1 / 45 && GS.PR > floor) {
      GS.PR = Math.max(floor, GS.PR * 0.8);
      GAME.renderer.setPixelRatio(GS.PR);
      if (GS.composer) GS.composer.setPixelRatio(GS.PR);
      if (GS.fxaaPass) GS.fxaaPass.uniforms.resolution.value.set(1 / (innerWidth * GS.PR), 1 / (innerHeight * GS.PR));
    } else if (avg > 1 / 38 && GS.PR <= floor) {             // resolution is at the floor and it still drags: shed effects
      if (GS.shadowEvery < 3) GS.shadowEvery = 3;
      else if (GS.fxaaPass && GS.fxaaPass.enabled) GS.fxaaPass.enabled = false;
      else if (GS.bloomPass && GS.bloomPass.enabled) GS.bloomPass.enabled = false;
    }
  }

  return { clock, tmp, SPL, SPD, spUp, spO, spDn, spC, spIn, spF, spA, spT, spBoxes, climbable, spCast, update, adaptQuality };
}
