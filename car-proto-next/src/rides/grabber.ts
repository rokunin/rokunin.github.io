// ---------- grabber logic ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { ARENA } from '../data/index.js';

export function createGrabber(GAME) {
  // Рука на мачте у правого переднего угла, сама поворачивается в курсор. Цель ищет в конусе
  // вокруг направления на курсор (берёт ближайшую к курсору), хватает и тянет на бур.
  const ARM_MIN = 0.35, ARM_MAX = 16, ARM_SPEED = 70, PULL_SPEED = 30, HOLD_Y = 1.15, G = 26;
  const ARM_CONE = THREE.MathUtils.degToRad(13 * 2.5);   // ±32.5° вокруг направления на курсор
  const CLAW_REACH = 0.85;                                   // от основания клешни до кончиков пальцев
  const grab: any = { state: 'idle', len: ARM_MIN, open: 0.15, yaw: Math.PI / 2, held: null, target: null };
  const thrown = [];
  const holdPos = new THREE.Vector3(), armW = new THREE.Vector3(), restDir = new THREE.Vector3();

  function toWorld(lx, lz, out) {                            // координаты машины → мир
    const c = Math.cos(GAME.car.heading), sn = Math.sin(GAME.car.heading);
    return out.set(GAME.car.pos.x + lx * c + lz * sn, 0, GAME.car.pos.z - lx * sn + lz * c);
  }
  function yawToward(x, z) {                                 // arm.rotation.y (в осях кузова), чтобы рука смотрела в точку
    const rel = Math.atan2(x - armW.x, z - armW.z) - GAME.car.heading;
    return Math.atan2(Math.cos(rel), -Math.sin(rel));
  }

  // маркер над целью
  const targetMarker = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.95, 4),
    GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffb347 }), 3));
  targetMarker.rotation.x = Math.PI; GAME.scene.add(targetMarker);

  function releaseIfHeld(ref) {
    if (grab.held && grab.held.ref === ref) { grab.held = null; grab.state = 'retract'; }
    if (grab.target && grab.target.ref === ref) grab.target = null;
    for (let i = thrown.length - 1; i >= 0; i--) if (thrown[i].ref === ref) thrown.splice(i, 1);
  }

  const tgtPos = t => t.kind === 'enemy' ? t.ref.pos : t.ref.mesh.position;
  const tgtValid = t => t && (t.kind === 'enemy' ? !t.ref.dead && !t.ref.carried : GAME.active(t.ref));

  function findCandidate() {
    let best = null, bestD = Infinity;
    const consider = (t, p) => {
      const dx = p.x - armW.x, dz = p.z - armW.z, d = Math.hypot(dx, dz);
      if (d - t.r > ARM_MAX + CLAW_REACH || d < 0.5) return;
      const cosA = (dx * restDir.x + dz * restDir.z) / d;
      const ang = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
      if (ang > ARM_CONE + Math.atan(t.r * 0.7 / d)) return;  // крупных ловит чуть шире
      const dc = Math.hypot(p.x - GAME.groundAim.x, p.z - GAME.groundAim.z) - t.r;   // ближе всего к курсору
      if (dc < bestD) { bestD = dc; best = t; }
    };
    for (const e of GAME.enemies) if (!e.dead && !e.carried) consider({ kind: 'enemy', ref: e, r: e.r, s: e.s }, e.pos);
    for (const o of GAME.obstacles) if (o.crate && GAME.active(o))
      consider({ kind: 'crate', ref: o, r: Math.max(o.hx, o.hz) * 1.2, s: o.h }, o.mesh.position);
    return best;
  }

  function placeHeld(h) {
    if (h.kind === 'enemy') {
      const e = h.ref;
      e.pos.set(holdPos.x, 0, holdPos.z);
      e.root.position.set(holdPos.x, holdPos.y - e.s / 2, holdPos.z);
      e.root.rotation.set(Math.sin(GS.elapsed * 25) * 0.15, GAME.car.heading + Math.PI, Math.sin(GS.elapsed * 19) * 0.15); // мордой к буру, дёргается
      e.hop.position.y = 0; e.hop.scale.set(1, 1, 1);
      e.open = 0.35 + 0.35 * Math.sin(GS.elapsed * 22);
      e.pivot.rotation.x = -e.open;
    } else {
      h.ref.mesh.position.copy(holdPos);
      h.ref.mesh.rotation.set(0, GAME.car.heading, 0);
    }
  }

  // бросок по баллистике точно в курсор; target=null — просто уронить
  function throwHeld(target) {
    const h = grab.held; if (!h) return;
    grab.held = null;
    const vel = new THREE.Vector3();
    if (target) {
      const dx = target.x - holdPos.x, dz = target.z - holdPos.z, dist = Math.hypot(dx, dz);
      const t = THREE.MathUtils.clamp(dist / 28, 0.2, 1.4);
      vel.set(dx / t, 0.5 * G * t - (holdPos.y - h.s / 2) / t, dz / t);
    }
    thrown.push({ ...h, pos: holdPos.clone(), vel, spin: GAME.rand(6, 12) * (Math.random() < 0.5 ? -1 : 1), rot: 0 });
    if (target) GAME.SFX.play('whoosh', holdPos);
  }

  function finishThrown(th, i) {
    thrown.splice(i, 1);
    if (th.marker) GAME.scene.remove(th.marker);
    if (!GAME.inWorld(th.pos.x, th.pos.z)) {
      const lim = ARENA - 1 - th.r;
      th.pos.x = THREE.MathUtils.clamp(th.pos.x, -lim, lim);
      th.pos.z = THREE.MathUtils.clamp(th.pos.z, -lim, lim);
    }
    GS.shake = Math.max(GS.shake, 0.35);
    if (th.kind === 'crate') {
      const o = th.ref;
      o.carried = false;
      o.mesh.position.set(th.pos.x, o.h / 2, th.pos.z); o.mesh.rotation.set(0, 0, 0);
      GAME.damageCrate(o, 99);                                   // ящик разлетается об землю
    } else {
      const e = th.ref;
      e.carried = false; e.stun = 1.1; e.biteCd = 1.2; e.vel.set(0, 0, 0);
      e.pos.set(th.pos.x, 0, th.pos.z);
      e.root.rotation.set(0, e.yaw, 0); e.root.position.set(e.pos.x, 0, e.pos.z);
      GAME.spawnParticles(GAME.tmp.copy(e.pos).setY(0.3), 0x8a8a78, 6, 6); GAME.SFX.play('land', e.pos);
      GAME.hitEnemy(e, GAME.tmp.set(th.vel.x, 0, th.vel.z).normalize(), 2, 0);
    }
  }

  function updateGrab(dt) {
    GAME.arm.updateWorldMatrix(true, false);
    GAME.arm.getWorldPosition(armW); armW.y = 0;
    restDir.set(GAME.groundAim.x - armW.x, 0, GAME.groundAim.z - armW.z);  // конус смотрит в курсор
    if (restDir.lengthSq() < 1e-4) restDir.set(Math.sin(GAME.car.heading), 0, Math.cos(GAME.car.heading));
    restDir.normalize();
    if ((!GAME.car.alive || GAME.car.burrow !== 'up') && grab.held) { throwHeld(null); grab.state = 'retract'; }
    const want = GAME.abilities.grab && GAME.car.alive && GAME.car.burrow === 'up' && GS.rmb;
    let targetOpen = 0.15, aimYaw = yawToward(GAME.groundAim.x, GAME.groundAim.z);
    const cand = GAME.abilities.grab && GAME.car.alive && GAME.car.burrow === 'up' && (grab.state === 'idle' || grab.state === 'reach') ? findCandidate() : null;

    if (grab.state === 'idle') {
      grab.len += (ARM_MIN - grab.len) * Math.min(1, 10 * dt);
      grab.cd = (grab.cd || 0) - dt;
      if (want && grab.cd <= 0) { grab.state = 'reach'; grab.target = cand; GAME.SFX.play('tongue', armW); }
    }
    else if (grab.state === 'reach') {
      if (!tgtValid(grab.target)) grab.target = cand;   // цель пропала — наводимся на следующую
      targetOpen = 0.8;
      grab.len += ARM_SPEED * dt;
      const t = grab.target;
      if (t) {
        const p = tgtPos(t);
        const d = Math.hypot(p.x - armW.x, p.z - armW.z);
        aimYaw = yawToward(p.x, p.z);
        const need = d - t.r * 0.9 - CLAW_REACH;
        if (need > ARM_MAX) grab.target = null;                // уехала из досягаемости
        else if (grab.len >= need && t.kind === 'enemy' && t.ref.elite) {
          // архизлюку не схватить: огрызается и отшвыривает машину
          const e = t.ref;
          GAME.wakeEnemy(e);
          const ax = GAME.car.pos.x - e.pos.x, az = GAME.car.pos.z - e.pos.z, ad = Math.hypot(ax, az) || 1;
          GAME.car.vel.x += ax / ad * 24; GAME.car.vel.z += az / ad * 24; GAME.car.speed *= 0.2;
          if (!GAME.car.airborne && GAME.car.burrow === 'up') { GAME.car.vy = 6; GAME.car.airborne = true; GAME.car.usedDouble = true; GAME.car.popped = true; }
          e.open = 1; e.wakeT = 0.45; e.biteCd = Math.max(e.biteCd, 0.6);
          GAME.spawnParticles(GAME.tmp.set(e.pos.x, 2, e.pos.z), 0xd040a0, 14, 9);
          GAME.spawnParticles(new THREE.Vector3().copy(armW).addScaledVector(GAME.tmp.set(-ax / ad, 0, -az / ad), grab.len).setY(2), 0xffe08a, 6, 8);
          GS.shake = Math.max(GS.shake, 0.6);
          GAME.flashAlert('ARCH-BITER WON\'T BUDGE!'); GAME.SFX.play('zap', e.pos); GAME.SFX.play('growl_elite', e.pos, { delay: 0.05 });
          grab.target = null; grab.state = 'retract'; grab.cd = 1.2;
        }
        else if (grab.len >= need) {
          grab.len = Math.max(ARM_MIN, need);
          if (t.kind === 'enemy') GAME.wakeEnemy(t.ref);
          t.ref.carried = true;
          t.shieldMax = t.shieldHp = t.kind === 'crate' ? 60 : (t.ref.elite ? 90 : 50);
          grab.held = t; grab.target = null; grab.state = 'pull'; GAME.SFX.play('slap', p);
          holdPos.set(p.x, HOLD_Y, p.z);
          GS.shake = Math.max(GS.shake, 0.2);
        }
      }
      if (grab.state === 'reach' && (!want || grab.len >= ARM_MAX)) { grab.state = 'retract'; grab.target = null; }
    }
    else if (grab.state === 'retract') {
      grab.len -= ARM_SPEED * 0.8 * dt;
      if (grab.len <= ARM_MIN) { grab.len = ARM_MIN; grab.state = 'idle'; }
    }
    else if (grab.state === 'pull' || grab.state === 'hold') {
      const h = grab.held;
      // точка на буре: объект насажен на остриё
      const dest = toWorld(0, 3.4 + h.r * 0.7, GAME.tmp).setY(HOLD_Y + GAME.car.y + Math.sin(GS.elapsed * 9) * 0.05);   // прыгает вместе с машиной
      const step = PULL_SPEED * dt, gap = holdPos.distanceTo(dest);
      if (grab.state === 'hold' || gap <= step) { holdPos.copy(dest); grab.state = 'hold'; }
      else holdPos.addScaledVector(dest.sub(holdPos).normalize(), step);
      {                                                       // объезжает кузов, а не протаскивается сквозь
        const ox = holdPos.x - GAME.car.pos.x, oz = holdPos.z - GAME.car.pos.z, od = Math.hypot(ox, oz) || 1e-4;
        const minR = GAME.car.radius + h.r * 0.9;
        if (od < minR && grab.state === 'pull') { holdPos.x = GAME.car.pos.x + ox / od * minR; holdPos.z = GAME.car.pos.z + oz / od * minR; }
      }
      const d = Math.hypot(holdPos.x - armW.x, holdPos.z - armW.z);
      aimYaw = yawToward(holdPos.x, holdPos.z);
      grab.len = Math.max(ARM_MIN, d - h.r * 0.85 - CLAW_REACH * 0.7);
      targetOpen = 0.4;
      placeHeld(h);
      // тем, что на буре, можно таранить других злюк
      const sp = Math.hypot(GAME.car.vel.x, GAME.car.vel.z);
      for (const e of GAME.enemies) {
        if (e.dead || e.carried || e === h.ref || e.ramCd > 0) continue;
        const dx = e.pos.x - holdPos.x, dz = e.pos.z - holdPos.z, dd = Math.hypot(dx, dz) || 1e-4;
        if (dd < e.r + h.r) {
          e.ramCd = 0.4;
          GAME.hitEnemy(e, GAME.tmp.set(dx / dd, 0, dz / dd), sp > 6 ? 1.5 : 0.5, 6 + sp * 0.6);
          GAME.spawnParticles(GAME.tmp.copy(e.pos).setY(1), 0xffd27a, 4, 6); GAME.SFX.play('hit_flesh', e.pos);
          GS.shake = Math.max(GS.shake, 0.25);
        }
      }
      if (!want && grab.held) { throwHeld(GAME.car.alive ? GAME.groundAim : null); grab.state = 'retract'; }
    }

    // маркер цели
    const showT = grab.state === 'reach' && grab.target ? grab.target : (grab.state === 'idle' ? cand : null);
    targetMarker.visible = !!showT;
    if (showT) {
      const p = tgtPos(showT);
      targetMarker.position.set(p.x, showT.s + 1.3 + Math.sin(GS.elapsed * 6) * 0.15, p.z);
      targetMarker.rotation.y += dt * 4;
    }

    let dy = aimYaw - grab.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    grab.yaw += dy * Math.min(1, 18 * dt);
    GAME.arm.rotation.y = grab.yaw;
    grab.open += (targetOpen - grab.open) * Math.min(1, 14 * dt);
    GAME.armSeg.scale.x = grab.len;
    GAME.claw.position.x = -grab.len;
    for (const f of GAME.fingers) f.piv.rotation.y = f.side * grab.open;

    // летящие объекты
    for (let i = thrown.length - 1; i >= 0; i--) {
      const th = thrown[i];
      th.vel.y -= G * dt;
      th.pos.addScaledVector(th.vel, dt);
      th.rot += th.spin * dt;
      if (th.kind === 'crate') {
        th.ref.mesh.position.copy(th.pos);
        th.ref.mesh.rotation.set(th.rot, 0, th.rot * 0.6);
      } else {
        const e = th.ref;
        e.pos.set(th.pos.x, 0, th.pos.z);
        e.root.position.set(th.pos.x, th.pos.y - e.s / 2, th.pos.z);
        e.root.rotation.set(th.rot, e.yaw, th.rot * 0.5);
      }
      let impact = th.pos.y <= th.s / 2 || !GAME.inWorld(th.pos.x, th.pos.z);
      if (!impact && th.hostile && GAME.car.alive && GAME.car.depth < 0.3 &&            // ящик босса прилетел в нас
          Math.hypot(th.pos.x - GAME.car.pos.x, th.pos.z - GAME.car.pos.z) < GAME.car.radius + th.r * 0.8 && th.pos.y < GAME.car.y + 2.6) {
        GAME.hurtCar(18, GAME.tmp.set(th.vel.x, 0, th.vel.z).normalize().clone());
        impact = true;
      }
      const dir = GAME.tmp.set(th.vel.x, 0, th.vel.z).normalize().clone();
      if (!impact) for (const e of GAME.enemies) {
        if (e.dead || e.carried || e === th.ref) continue;
        if (Math.hypot(th.pos.x - e.pos.x, th.pos.z - e.pos.z) < th.r + e.r && th.pos.y < e.s + 0.6) {
          GAME.hitEnemy(e, dir, 3 * GAME.throwMul(), 14); GAME.SFX.play('hit_flesh', th.pos);
          GAME.spawnParticles(th.pos, 0xffd27a, 6, 8);
          impact = true; break;
        }
      }
      if (!impact && !th.hostile) for (const m of GAME.swarm) {
        if (m.dead || Math.hypot(th.pos.x - m.pos.x, th.pos.z - m.pos.z) > th.r + m.r + 0.3 || th.pos.y > GAME.critterTop(m) + 0.6) continue;
        GAME.hitCritter(m, 4 * GAME.throwMul(), dir, 14); GAME.SFX.play('hit_flesh', th.pos); impact = true;
      }
      if (!impact) for (const o of GAME.obstacles) {
        if (!GAME.active(o) || o === th.ref || (o.boss && th.hostile)) continue;
        const p = o.mesh.position;
        if (Math.abs(th.pos.x - p.x) < o.hx + th.r * 0.7 && Math.abs(th.pos.z - p.z) < o.hz + th.r * 0.7 && th.pos.y < o.h + th.r * 0.5) {
          if (o.crate) GAME.damageCrate(o, 3 * GAME.throwMul());
          if (o.boss) { GAME.bossDamage(12 * GAME.throwMul()); GAME.spawnParticles(th.pos, 0xd040a0, 8, 8); GAME.SFX.play('tent_slam', th.pos, { rate: 1.3 }); }
          else if (!o.crate) GAME.SFX.play('hit_stone', th.pos);
          GAME.spawnParticles(th.pos, o.crate ? 0xd2873c : 0xbfc3c9, 5, 7);
          th.pos.addScaledVector(dir, -th.r);
          impact = true; break;
        }
      }
      if (impact) finishThrown(th, i);
    }
  }

  return { G, grab, thrown, holdPos, releaseIfHeld, finishThrown, updateGrab };
}
