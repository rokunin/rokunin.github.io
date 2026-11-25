// ---------- evil cubes ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { ARENA } from '../data/index.js';

export function createCubes(GAME) {
  // Спят под видом ящиков, просыпаются когда подъезжаешь (или в них стреляешь), потом скачут и кусаются.
  const enemyRed = new THREE.MeshStandardMaterial({ color: 0xd42a36, emissive: 0x3a0406, roughness: 0.4, metalness: 0.15 });
  const enemyFlash = new THREE.MeshStandardMaterial({ color: 0xf09a8c, emissive: 0x4a100c, roughness: 0.5 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.35, flatShading: true });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x2a2024, roughness: 0.45, metalness: 0.2, flatShading: true });
  const redTrim = new THREE.MeshStandardMaterial({ color: 0x6e1018, roughness: 0.5, flatShading: true });
  const eliteTrim = new THREE.MeshStandardMaterial({ color: 0x3a1250, roughness: 0.35, metalness: 0.5, flatShading: true });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xff5f86, roughness: 0.5 });
  const eyeElite = GAME.glow(new THREE.MeshBasicMaterial({ color: 0x7df4ff }), 1.8);
  const crystalMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff5ae0 }), 1.45);
  const eyeWhite = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), 1.35);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0x2a0508 });
  const enemies = [];
  const RED_COUNT = 20, ELITE_COUNT = 7, WAKE_DIST = 20;
  GS.enemyKills = 0;
  const ekillsEl = document.getElementById('ekills');

  function makeEnemy(elite = false) {
    const s = elite ? GAME.rand(2.9, 3.4) : GAME.rand(1.9, 2.4), lowH = s * 0.45, upH = s * 0.55;
    const root = new THREE.Group(), hop = new THREE.Group();
    root.add(hop); GAME.scene.add(root);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(s, lowH, s), GAME.crateMat);
    lower.position.y = lowH / 2; hop.add(lower);
    const gullet = new THREE.Mesh(new THREE.BoxGeometry(s * 0.86, 0.04, s * 0.86), mouthMat);
    gullet.position.y = lowH + 0.01; hop.add(gullet);
    const pivot = new THREE.Group(); pivot.position.set(0, lowH, -s / 2); hop.add(pivot);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(s, upH, s), GAME.crateMat);
    upper.position.set(0, upH / 2, s / 2); pivot.add(upper);
    // split the crate texture across the two jaws so a sleeping biter looks exactly like a real crate
    const sideV = (geo, v0, v1) => { const uv = geo.attributes.uv; for (let i = 0; i < 24; i++) if (i < 8 || i >= 16) uv.setY(i, v0 + uv.getY(i) * (v1 - v0)); };
    sideV(lower.geometry, 0, 0.45); sideV(upper.geometry, 0.45, 1);
    const roofOfMouth = new THREE.Mesh(new THREE.BoxGeometry(s * 0.86, 0.04, s * 0.86), mouthMat);
    roofOfMouth.position.set(0, -0.01, s / 2); pivot.add(roofOfMouth);

    // everything below only shows once the biter wakes up; asleep it is a plain crate
    const awakeParts = [];
    const part = (geo, mat, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); awakeParts.push(m); return m;
    };
    const fang = (r, h) => new THREE.ConeGeometry(r, h, 3);
    const trim = elite ? eliteTrim : redTrim;
    const n = elite ? 6 : 5;                                    // front row: uneven fangs, long canines at the corners
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (s * 0.84 / n), hL = s * GAME.rand(0.1, 0.17), hU = s * (i === 0 || i === n - 1 ? 0.3 : GAME.rand(0.1, 0.16));
      part(fang(s * 0.055, hL), toothMat, hop, x + s * 0.04, lowH + hL / 2, s / 2 - s * 0.07, 0, GAME.rand(0, 2));
      part(fang(s * 0.06, hU), toothMat, pivot, x, -hU / 2, s - s * 0.07, Math.PI, GAME.rand(0, 2));
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {                             // side teeth
        const z = s * (0.05 + i * 0.16), h = s * GAME.rand(0.08, 0.13);
        part(fang(s * 0.045, h), toothMat, hop, side * (s / 2 - s * 0.07), lowH + h / 2, z);
        part(fang(s * 0.045, h), toothMat, pivot, side * (s / 2 - s * 0.07), -h / 2, s / 2 + z + s * 0.08, Math.PI);
      }
      // slanted glowing eye, slit pupil, heavy brow
      part(new THREE.BoxGeometry(s * 0.27, s * 0.13, 0.08), elite ? eyeElite : eyeWhite, pivot, side * s * 0.24, upH * 0.5, s + 0.03, 0, 0, side * 0.3);
      part(new THREE.BoxGeometry(s * 0.045, s * 0.13, 0.1), pupilMat, pivot, side * s * 0.22, upH * 0.5, s + 0.05, 0, 0, side * 0.3);
      part(new THREE.BoxGeometry(s * 0.38, s * 0.09, s * 0.14), trim, pivot, side * s * 0.25, upH * 0.5 + s * 0.13, s + 0.03, 0, 0, side * 0.42);
      // horns sweep out and back
      const hh = s * (elite ? 0.72 : 0.5);
      part(new THREE.ConeGeometry(s * 0.12, hh, 5), hornMat, pivot, side * s * 0.36, upH + hh * 0.38, s * 0.58, -0.45, 0, -side * 0.55);
      for (const fz of [-1, 1]) {                               // stubby clawed feet
        part(new THREE.BoxGeometry(s * 0.2, s * 0.13, s * 0.3), trim, hop, side * (s / 2 + s * 0.06), s * 0.065, fz * s * 0.3 + s * 0.04);
        part(fang(s * 0.05, s * 0.16), toothMat, hop, side * (s / 2 + s * 0.08), s * 0.05, fz * s * 0.3 + s * 0.25, Math.PI / 2);
      }
    }
    part(new THREE.BoxGeometry(s * 0.3, s * 0.04, s * 0.62), tongueMat, hop, 0, lowH + s * 0.03, s * 0.22, 0.08);   // tongue lolls out the front
    for (let i = 0; i < 3; i++) {                               // spines down the back
      const h = s * (0.26 - i * 0.05);
      part(new THREE.ConeGeometry(s * 0.07, h, 4), hornMat, pivot, 0, upH + h / 2 - 0.02, s * (0.4 - i * 0.16), -0.25);
    }
    if (elite) for (let i = 0; i < 5; i++) {                    // arch-biters wear a crown of glowing crystals
      const a = i / 5 * Math.PI * 2 + 0.3;
      const c = part(new THREE.OctahedronGeometry(s * 0.1, 0), crystalMat, pivot, Math.cos(a) * s * 0.3, upH + s * 0.13, s * 0.52 + Math.sin(a) * s * 0.3, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      c.scale.y = 2.6;
    }
    root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    awakeParts.forEach(p => p.visible = false);

    const e = { root, hop, pivot, lower, upper, awakeParts, s, r: s * 0.62,
                pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: GAME.rand(0, Math.PI * 2),
                hp: 4, awake: false, dead: false, flash: 0, biteCd: 0, phase: GAME.rand(0, 6), wakeT: 0, open: 0,
                speed: elite ? GAME.rand(8, 9.5) : GAME.rand(8.5, 11.5), carried: false, stun: 0, ramCd: 0,
                elite, maxHp: elite ? 30 : 10, bite: elite ? 26 : 16, shotCd: GAME.rand(1, 3), charge: 0,
                matAwake: elite ? new THREE.MeshStandardMaterial({ color: 0x8a1a66, roughness: 0.28, metalness: 0.65, envMap: GS.ENV, envMapIntensity: 1.6 }) : enemyRed,
                matDormant: elite ? new THREE.MeshStandardMaterial({ color: 0xd8d8d8, map: GAME.crateTex.map, roughnessMap: GAME.crateTex.rough, normalMap: GAME.crateTex.normal, roughness: 1 }) : GAME.crateMat };
    placeEnemy(e);
    enemies.push(e);
  }

  function setEnemyLook(e, mat) { e.lower.material = mat; e.upper.material = mat; }
  function flickerElite(e) {                       // мерцание: переливается и искрит
    const t = GS.elapsed * 6 + e.phase, spark = Math.random() < 0.07 ? 1 : 0;
    if (e.awake) {
      e.matAwake.color.setHSL((0.84 + 0.08 * Math.sin(t * 0.45)) % 1, 0.8, 0.2, THREE.SRGBColorSpace);
      e.matAwake.emissive.setHSL((0.8 + 0.12 * Math.sin(t)) % 1, 1, 0.5, THREE.SRGBColorSpace).multiplyScalar(0.015 + 0.045 * (0.5 + 0.5 * Math.sin(t * 2.3)) + spark * 0.9);
      e.hop.scale.x *= 1 + spark * 0.08;
    } else {
      e.matDormant.emissive.setHSL(0.1, 1, 0.5, THREE.SRGBColorSpace).multiplyScalar(0.02 + 0.09 * (0.5 + 0.5 * Math.sin(t)) + spark * 1.6);   // ящик, но подозрительно блестит
    }
  }

  function placeEnemy(e) {
    const [x, z] = GAME.freeSpot(e.s, 30);
    e.pos.set(x, 0, z); e.vel.set(0, 0, 0);
    e.hp = e.maxHp; e.awake = false; e.dead = false; e.open = 0; e.stun = 0;
    if (e.carried) GAME.releaseIfHeld(e);
    e.carried = false; e.root.rotation.set(0, 0, 0); e.root.position.y = 0;
    e.yaw = Math.round(GAME.rand(0, 4)) * Math.PI / 2;            // как обычный ящик
    e.root.visible = true;
    e.awakeParts.forEach(p => p.visible = false);
    setEnemyLook(e, e.matDormant);
    e.pivot.rotation.x = 0; e.hop.position.y = 0; e.hop.scale.set(1, 1, 1);
    e.root.position.copy(e.pos); e.root.rotation.y = e.yaw;
  }

  function wakeEnemy(e) {
    if (e.awake) return;
    GAME.SFX.play(e.elite ? 'growl_elite' : 'growl', e.pos);
    e.awake = true; e.wakeT = 0.45;
    e.awakeParts.forEach(p => p.visible = true);
    setEnemyLook(e, e.matAwake);
  }

  function hurtCar(dmg, dir) {
    if (!GAME.car.alive || GAME.car.burrow !== 'up') return;
    if (GAME.domes.length && GAME.inDome(GAME.car.pos.x, GAME.car.pos.z)) return;      // under a dome: untouchable
    if (GAME.haloHoly()) { if ((GAME.car.holyT || 0) < GS.elapsed) { GAME.car.holyT = GS.elapsed + 0.25; GAME.SFX.play('pickup', GAME.car.pos, { vol: 0.25, rate: 2 }); GAME.spawnParticles(GAME.tmp.set(GAME.car.pos.x, 2, GAME.car.pos.z), 0xffe9a8, 4, 6); } return; }   // swords out: untouchable
    GAME.car.hp -= dmg; GAME.car.lastHurt = GS.elapsed; GS.hurtFlash = 0.18; GS.shake = 0.6;
    if (GAME.car.hp > 0) GAME.crewSay(GAME.car.hp < GAME.car.maxHp * 0.35 ? 'lowhp' : 'hurt', 0.7);
    GAME.cartKick(5); GAME.cartFling(GAME.safeCount(GAME.cart.riders.length > 6 ? 2 : 1), 0);
    GAME.SFX.play('clang', GAME.car.pos);
    GAME.car.vel.x += dir.x * 9; GAME.car.vel.z += dir.z * 9; GAME.car.speed *= 0.4;      // sideways shove only: a shot coming down at an angle must not push the ride into the ground
    if (GAME.car.hp <= 0) {
      GAME.car.hp = 0; GAME.car.alive = false; GAME.car.deadTimer = 2.2; GAME.crewSay('dead', 1, true); GAME.deathToll();
      GAME.carGroup.visible = false;
      GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(1), 0xc26a30, 22, 12);
      GAME.flash(GAME.tmp, 0xff9040, 14, 0.4, 4); GAME.burst(GAME.tmp, 0x3a3634, 10, 2.6, 5, 0.55);
      GAME.spawnParticles(GAME.tmp.copy(GAME.car.pos).setY(1), 0xff9a3c, 14, 10);
      GS.shake = 1.2; GAME.SFX.play('explode', GAME.car.pos);
      document.getElementById('dead').style.display = 'flex';
    }
  }

  function pushOutOfBox(pos, r, o) {
    const p = o.mesh.position;
    const cx = THREE.MathUtils.clamp(pos.x, p.x - o.hx, p.x + o.hx);
    const cz = THREE.MathUtils.clamp(pos.z, p.z - o.hz, p.z + o.hz);
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) return;
    if (d > 1e-4) { pos.x += dx / d * (r - d); pos.z += dz / d * (r - d); }
    else {
      const ox = o.hx - Math.abs(pos.x - p.x), oz = o.hz - Math.abs(pos.z - p.z);
      if (ox < oz) pos.x += (Math.sign(pos.x - p.x) || 1) * (ox + r);
      else pos.z += (Math.sign(pos.z - p.z) || 1) * (oz + r);
    }
  }

  const enemyQueue = [];
  GS.diggers = 0;
  function enemyBump(e) {                               // the car pushes against a cube, asleep or awake; ramming a sleeping one hurts it
    const dx = GAME.car.pos.x - e.pos.x, dz = GAME.car.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || 1e-4, nx = dx / dist, nz = dz / dist, minD = GAME.car.radius + e.r;
    if (!(GAME.car.alive && GAME.car.depth < 0.3 && GAME.car.y < e.s * 0.8 && dist < minD)) return;
    const push = minD - dist, own = !GAME.NET.client, share = e.awake && own ? 0.5 : 1;
    GAME.car.pos.x += nx * push * share; GAME.car.pos.z += nz * push * share;
    if (e.awake && own) { e.pos.x -= nx * push * 0.5; e.pos.z -= nz * push * 0.5; }
    const vn = GAME.car.vel.x * -nx + GAME.car.vel.z * -nz;
    if (!e.awake && vn > GAME.RAM_SPEED && (e.ramT || 0) < GS.elapsed) {          // протаранили «ящик» — а он живой
      e.ramT = GS.elapsed + 0.5;
      hitEnemy(e, GAME.tmp.set(-nx, 0, -nz), 1, 14); GAME.SFX.play('hit_flesh', e.pos);
      e.stun = 0.6; GS.shake = Math.max(GS.shake, 0.3);
      GAME.car.speed *= 0.7;
    } else if (vn > 0) { GAME.car.vel.x += nx * vn; GAME.car.vel.z += nz * vn; GAME.car.speed *= 0.6; }
  }
  function enemyMirror(e, dt) {                         // a guest's copy of a host cube: glide to where the host says, animate the rest here
    if (e.tx == null) { e.tx = e.pos.x; e.tz = e.pos.z; e.tyaw = e.yaw; }
    const k = 1 - Math.exp(-10 * dt);
    if (Math.abs(e.tx - e.pos.x) + Math.abs(e.tz - e.pos.z) > 20) { e.pos.x = e.tx; e.pos.z = e.tz; } else { e.pos.x += (e.tx - e.pos.x) * k; e.pos.z += (e.tz - e.pos.z) * k; }
    if (e.elite) flickerElite(e);
    e.root.position.set(e.pos.x, e.hostCarry ? 1.6 : 0, e.pos.z);
    if (!e.awake) { e.hop.scale.y = 1 + Math.sin(GS.elapsed * 2.2 + e.phase) * 0.025; e.root.rotation.y = e.yaw; return; }
    e.yaw = GAME.angLerp(e.yaw, e.tyaw, Math.min(1, 10 * dt)); e.root.rotation.y = e.yaw;
    e.phase += dt * 9;
    const h = Math.abs(Math.sin(e.phase)); e.wakeT = Math.max(0, e.wakeT - dt);
    const surprise = e.wakeT > 0 ? Math.sin((1 - e.wakeT / 0.45) * Math.PI) * 2.2 : 0;
    e.hop.position.y = h * 0.55 + surprise;
    const squash = 1 - (1 - h) * 0.18; e.hop.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);
    e.open += ((e.topen == null ? 0.25 : e.topen) - e.open) * Math.min(1, 14 * dt); e.pivot.rotation.x = -e.open;
    e.flash -= dt; setEnemyLook(e, e.flash > 0 ? enemyFlash : e.matAwake);
  }
  function enemyDieFx(e) {
    GAME.spawnParticles(GAME.tmp.copy(e.pos).setY(1), e.elite ? 0xd040a0 : 0xc8323c, e.elite ? 30 : 18, e.elite ? 12 : 10);
    GAME.flash(GAME.tmp, e.elite ? 0xff40c8 : 0xff4a30, e.elite ? 10 : 5.5, e.elite ? 0.32 : 0.22, 2.2); GAME.burst(GAME.tmp, e.elite ? 0x70305f : 0x5a2a2a, e.elite ? 9 : 5, 1.8, 4);
    GAME.spawnParticles(GAME.tmp.copy(e.pos).setY(1), 0xf4f1e8, 6, 8);
    GAME.SFX.play(e.elite ? 'elite_die' : 'biter_die', e.pos);
  }
  function updateEnemies(dt) {
    GS.diggers = 0;
    for (let ei = 0; ei < enemies.length; ei++) {
      const e = enemies[ei];
      if (GAME.NET.client) { if (!!e.carried !== !!e.gSent) { e.gSent = !!e.carried; e.tx = e.pos.x; e.tz = e.pos.z; GAME.netEv({ t: 'eg', i: ei, c: e.carried ? 1 : 0, x: GAME.r1(e.pos.x), z: GAME.r1(e.pos.z) }, GAME.NET.hostPeer); } }
      if (e.dead || e.carried) continue;
      enemyBump(e);                                     // my ride shoves against it, whoever runs it
      if (GAME.NET.client) { enemyMirror(e, dt); continue; }  // a guest only shows what the host's cubes do
      e.ramCd -= dt;
      if ((e.think = (e.think || 0) - dt) <= 0) { e.think = 0.3 + Math.random() * 0.2; e.tgt = GAME.netPick(e); }
      const T = e.tgt && e.tgt.up && GAME.NET.remotes.get(e.tgt.peer) === e.tgt ? e.tgt.tc : GAME.car, mine = T === GAME.car, seen = mine ? GAME.carSeen() : T.alive;
      const dx = T.pos.x - e.pos.x, dz = T.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const nx = dx / dist, nz = dz / dist;
      const minD = GAME.car.radius + e.r;

      if (e.elite) flickerElite(e);
      if (!e.awake) {
        e.hop.scale.y = 1 + Math.sin(GS.elapsed * 2.2 + e.phase) * 0.025;   // еле заметно дышит
        if (seen && dist < WAKE_DIST) wakeEnemy(e);
        continue;
      }

      // погоня
      let tx = 0, tz = 0;
      const hunting = mine && e.elite && GAME.car.alive && !GAME.carSeen();               // архизлюка лезет к норе откапывать
      const scared = mine && GAME.car.alive && !GAME.carSeen() && !e.elite;
      let digging = false;
      const preyC = !hunting && (dist > 16 || !seen) ? GAME.groundChubNear(e.pos, 20) : null;
      if (preyC) { const px = preyC.pos.x - e.pos.x, pz = preyC.pos.z - e.pos.z, pd = Math.hypot(px, pz) || 1; tx = px / pd * e.speed; tz = pz / pd * e.speed; }
      else if (seen) { tx = nx * e.speed; tz = nz * e.speed; }
      else if (hunting) {
        if (dist > GAME.car.radius + e.r + 0.4) { tx = nx * e.speed; tz = nz * e.speed; }
        else if (e.stun <= 0) { digging = true; GS.diggers++; e.vel.multiplyScalar(0.8); }
      }
      else if (scared && dist < 42) {                                   // разбегаются от норы
        const jit = Math.sin(e.phase * 0.37 + e.s * 10) * 0.6;          // каждый в свою сторону
        const ax = -nx * Math.cos(jit) + nz * Math.sin(jit), az = -nz * Math.cos(jit) - nx * Math.sin(jit);
        tx = ax * e.speed * 1.15; tz = az * e.speed * 1.15;
      }
      if (e.stun > 0) { e.stun -= dt; tx = tz = 0; }                    // оглушён после броска
      for (const o of enemies) {                                        // не слипаться
        if (o === e || o.dead || o.carried) continue;
        const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, sd = Math.hypot(sx, sz);
        if (sd < e.r + o.r + 0.6 && sd > 1e-4) { tx += sx / sd * 6; tz += sz / sd * 6; }
      }
      const k = Math.min(1, 3.2 * dt);
      e.vel.x += (tx - e.vel.x) * k; e.vel.z += (tz - e.vel.z) * k;
      e.pos.addScaledVector(e.vel, dt);
      for (const o of GAME.obstacles) if (GAME.active(o)) pushOutOfBox(e.pos, e.r, o);
      const sh = GAME.shield();
      if (sh) {                                                         // щит на буре — сквозь него не пройти
        const sx = e.pos.x - sh.x, sz = e.pos.z - sh.z, sd = Math.hypot(sx, sz) || 1e-4, minS = e.r + sh.r;
        if (sd < minS) { e.pos.x = sh.x + sx / sd * minS; e.pos.z = sh.z + sz / sd * minS; }
      }
      const lim = ARENA - 1 - e.r;
      e.pos.x = THREE.MathUtils.clamp(e.pos.x, -lim, lim);
      e.pos.z = THREE.MathUtils.clamp(e.pos.z, -lim, lim);

      // повернуться к машине (или от неё, если удирает)
      const want = scared ? Math.atan2(e.vel.x, e.vel.z) : Math.atan2(nx, nz);
      let dy = want - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * Math.min(1, 7 * dt);

      // прыжки + сплющивание
      e.phase += dt * 9;
      const h = Math.abs(Math.sin(e.phase));
      e.wakeT = Math.max(0, e.wakeT - dt);
      const surprise = e.wakeT > 0 ? Math.sin((1 - e.wakeT / 0.45) * Math.PI) * 2.2 : 0;
      e.hop.position.y = h * 0.55 + surprise;
      const squash = 1 - (1 - h) * 0.18;
      e.hop.scale.set(1 + (1 - squash) * 0.6, squash, 1 + (1 - squash) * 0.6);

      // чавканье
      const targetOpen = e.charge > 0 ? 0.95 : digging ? 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(GS.elapsed * 22 + e.phase)) : scared ? 0.6 : !seen ? 0.1 : dist < 7 ? 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(GS.elapsed * 18 + e.phase)) : 0.18;
      e.open += (targetOpen - e.open) * Math.min(1, 14 * dt);
      e.pivot.rotation.x = -e.open;

      // укус
      e.biteCd -= dt;
      const shB = GAME.shield();
      const atShield = shB && Math.hypot(e.pos.x - shB.x, e.pos.z - shB.z) < e.r + shB.r + 0.35;
      if (atShield) {                                                   // упёрлась в щит — грызёт его
        if (e.biteCd <= 0) { e.biteCd = 0.8; GAME.chewShield(e); }
      } else if (T.alive && T.burrow === 'up' && T.y < 1 && dist < minD + 0.35 && e.biteCd <= 0) {
        e.biteCd = 0.8;
        GAME.SFX.play('chomp', e.pos);
        if (mine) hurtCar(e.bite, GAME.tmp.set(nx, 0, nz).clone()); else GAME.netEv({ t: 'ehurt', i: ei, d: e.bite, x: GAME.r2(nx), z: GAME.r2(nz) }, T.R.peer);
        e.vel.set(-nx * 9, 0, -nz * 9);
        GAME.spawnParticles(GAME.tmp.copy(T.pos).setY(1.2), 0xc26a30, 4, 5);
      }

      // плевок пульками: короткий замах пастью, потом выстрел (у архизлюк — веер из трёх)
      if (e.charge > 0) {
        e.charge -= dt;
        if (e.charge <= 0) enemyShoot(e, nx, nz, T);
      } else {
        if (e.biteCd <= 0) { const c = GAME.groundChubNear(e.pos, e.r + 0.7); if (c) { e.biteCd = 0.6; GAME.eatChub(c, e); } }
        e.shotCd -= dt;
        if (e.shotCd <= 0 && e.stun <= 0 && e.wakeT <= 0) {
          const atCar = seen && dist > 3.5 && dist < 24 && !atShield;
          const perch = !atCar || Math.random() < 0.5 ? GAME.perchedNear(e.pos, 24) : null;     // sometimes they would rather snipe a chubzik off its rock
          if (atCar || perch) {
            e.shotCd = e.elite ? GAME.rand(2.2, 3) : GAME.rand(1.8, 2.8);
            e.charge = 0.32; e.shotAt = perch;
            GAME.SFX.play('growl', e.pos, { vol: 0.35, rate: e.elite ? 0.8 : 1.3 });
          } else e.shotCd = 0.5;
        }
      }

      e.flash -= dt;
      setEnemyLook(e, e.flash > 0 ? enemyFlash : e.matAwake);
      e.root.position.copy(e.pos);
      e.root.rotation.y = e.yaw;
    }

    updateEShots(dt);
    GAME.updateDig(dt);
    if (!GAME.NET.client) for (let i = enemyQueue.length - 1; i >= 0; i--) {
      enemyQueue[i].t -= dt;
      if (enemyQueue[i].t <= 0) { placeEnemy(enemyQueue[i].e); enemyQueue.splice(i, 1); }
    }
  }

  // ---- enemy shots: slow glowing globs you can dodge, block with a held shield, or hide behind cover from ----
  const eshots = [];
  const eshotGeo = new THREE.IcosahedronGeometry(0.34, 1);
  const eshotMat = [GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff5a3a }), 3.2), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff4ad8 }), 3.6)];
  const eshotHalo = (() => {
    const c = GAME.mkCanvas(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const eshotHaloMat = [0xff5a3a, 0xff4ad8].map(c => GAME.glow(new THREE.SpriteMaterial({ map: eshotHalo, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 1.6));
  function enemyShoot(e, nx, nz, T = GAME.car) {
    const tc = e.shotAt && e.shotAt.state === 'perch' ? e.shotAt : null; e.shotAt = null;
    if (e.dead || e.carried || (!T.alive && !tc)) return;
    const k = e.elite ? 1 : 0, speed = e.elite ? 13 : 15;
    if (tc) {                                          // one aimed shot at the rock
      const from = new THREE.Vector3(e.pos.x, e.hop.position.y + e.s * 0.45, e.pos.z), ax = tc.pos.x - from.x, az = tc.pos.z - from.z, ad = Math.hypot(ax, az) || 1;
      const m = new THREE.Mesh(eshotGeo, eshotMat[k]); m.position.copy(from); m.add(new THREE.Sprite(eshotHaloMat[k])); m.children[0].scale.setScalar(2.2); GAME.scene.add(m);
      eshots.push({ m, v: new THREE.Vector3(ax / ad * speed, (tc.pos.y + 0.5 - from.y) / (ad / speed), az / ad * speed), life: 2.4, dmg: 5, k, chub: tc });
      GAME.SFX.play('eshot', from, { rate: e.elite ? 0.85 : 1 });
      return;
    }
    // aim a little ahead of the car, red ones lead less so strafing works
    const lead = (e.elite ? 0.45 : 0.25) * Math.hypot(T.pos.x - e.pos.x, T.pos.z - e.pos.z) / speed;
    const ax = T.pos.x + T.vel.x * lead - e.pos.x, az = T.pos.z + T.vel.z * lead - e.pos.z, ad = Math.hypot(ax, az) || 1;
    const base = Math.atan2(ax / ad, az / ad);
    const from = new THREE.Vector3(e.pos.x + nx * e.s * 0.55, e.hop.position.y + e.s * 0.45, e.pos.z + nz * e.s * 0.55);
    GAME.netEv({ t: 'es', i: enemies.indexOf(e), a: GAME.r2(base), f: [GAME.r2(from.x), GAME.r2(from.y), GAME.r2(from.z)] });
    enemyVolley(e, from, base);
    e.vel.addScaledVector(GAME.tmp.set(-nx, 0, -nz), 3);                    // отдача
  }
  function enemyVolley(e, from, base) {
    const k = e.elite ? 1 : 0, speed = e.elite ? 13 : 15;
    for (const off of e.elite ? [-0.22, 0, 0.22] : [0]) {
      const a = base + off, m = new THREE.Mesh(eshotGeo, eshotMat[k]);
      m.position.copy(from); m.scale.setScalar(e.elite ? 1.15 : 1);
      const halo = new THREE.Sprite(eshotHaloMat[k]); halo.scale.setScalar(2.2); m.add(halo);
      GAME.scene.add(m);
      eshots.push({ m, v: new THREE.Vector3(Math.sin(a) * speed, 0, Math.cos(a) * speed), life: 2.4, dmg: e.elite ? 7 : 5, k });
    }
    GAME.flash(from, k ? 0xff4ad8 : 0xff6a3a, 2.4, 0.12, 2.5, false);
    GAME.SFX.play('eshot', from, { rate: e.elite ? 0.85 : 1 }); GAME.crewSay('eshot', 0.5);
  }
  const mobMats = {};
  // monsters' own shots, in the shooter's colour: 0 = one straight shard, 1 = a fan, 2 = a ring all round
  const MOB_PAT = { gremlin: 0, maw: 0, stilt: 0, spike: 0, gloopling: 0, flapper: 1, wingmaw: 1, jelly: 1, lamprey: 1, brute: 2, grubber: 2, gloop: 2, oculon: 2 };
  GS.mobShots = 0;                                      // small shards in the air right now: caps the whole thing
  const mobGeo = [(() => { const g = new THREE.OctahedronGeometry(0.3, 0); g.scale(0.55, 0.55, 2.1); return g; })(),      // 0: a dart
                  new THREE.TetrahedronGeometry(0.42, 0),                                                              // 1: a tumbling barb
                  new THREE.IcosahedronGeometry(0.3, 1)];                                                              // 2: an orb
  const mobCol = new THREE.Color(), mobWhite = new THREE.Color(0xffffff);
  function mobLook(color, pat) {                         // bright core in the shooter's colour plus a soft halo, like the cubes' shots
    const k = color + '_' + pat; if (mobMats[k]) return mobMats[k];
    const core = GAME.glow(new THREE.MeshBasicMaterial({ color: mobCol.set(color).lerp(mobWhite, pat === 2 ? 0.25 : 0.45).getHex() }), pat === 2 ? 2.6 : 3.2);
    const halo = GAME.glow(new THREE.SpriteMaterial({ map: eshotHalo, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 1.3);
    return mobMats[k] = { core, halo };
  }
  function mobThrow(m, nx, nz, dist, pat = 0) {
    const L = mobLook(m.art.color, pat), weak = m.K.hp <= 1.5 && !m.K.heavy;                 // the little ones lob one slow dart
    const from = new THREE.Vector3(m.pos.x, (m.K.fly || 0) + m.K.size * 0.5, m.pos.z), base = Math.atan2(nx, nz);
    const n = pat === 2 ? 9 : pat === 1 ? (m.K.size > 4 ? 5 : 3) : 1, speed = pat === 2 ? 9.5 : pat === 1 ? 11.5 : weak ? 9.5 : 14, life = pat === 2 ? 1.5 : weak ? 2.2 : 1.7;
    for (let i = 0; i < n; i++) {
      const a = pat === 2 ? base + i / n * 6.283 : pat === 1 ? base + (i / (n - 1) - 0.5) * (n > 3 ? 0.9 : 0.6) : base + GAME.rand(-0.1, 0.1);
      const mesh = new THREE.Mesh(mobGeo[pat], L.core); mesh.position.copy(from); if (pat === 0) mesh.rotation.y = a;
      const halo = new THREE.Sprite(L.halo); halo.scale.setScalar(pat === 2 ? 2.0 : pat === 1 ? 1.6 : 1.5); mesh.add(halo); GAME.scene.add(mesh);
      eshots.push({ m: mesh, v: new THREE.Vector3(Math.sin(a) * speed, (1.0 - from.y) / (pat === 2 ? life : Math.max(0.3, dist / speed)), Math.cos(a) * speed), life, dmg: 2, k: 0, col: m.art.color, small: true, dart: pat === 0 });
    }
    GAME.SFX.play('spit', from, { vol: pat ? 0.5 : 0.35, rate: pat === 2 ? 1.1 : 1.6 });
  }
  function popEShot(i, color) {
    const s = eshots[i]; GAME.scene.remove(s.m); eshots.splice(i, 1);
    GAME.spawnParticles(s.m.position, color, 4, 5);
  }
  function updateEShots(dt) {
    const sh = GAME.shield();
    GS.mobShots = 0; for (const s of eshots) if (s.small) GS.mobShots++;
    for (let i = eshots.length - 1; i >= 0; i--) {
      const s = eshots[i], p = s.m.position;
      s.life -= dt; p.addScaledVector(s.v, dt);
      if (s.small) p.y = Math.max(0.8, p.y);
      else if (!s.chub) p.y = Math.max(0.9, p.y - dt * 0.6);
      else if (s.chub.state !== 'perch') s.chub = null;
      else if (Math.hypot(p.x - s.chub.pos.x, p.z - s.chub.pos.z) < 0.9) { GAME.knockOff(s.chub, s.v.x, s.v.z); popEShot(i, s.k ? 0xff4ad8 : 0xff6a3a); continue; }
      if (s.dart) s.m.rotation.z += dt * 14; else { s.m.rotation.x += dt * 9; s.m.rotation.y += dt * 7; }
      const col = s.col || (s.k ? 0xff4ad8 : 0xff6a3a);
      if (s.life <= 0 || !GAME.inWorld(p.x, p.z)) { popEShot(i, col); continue; }
      if (sh && Math.hypot(p.x - sh.x, p.z - sh.z) < sh.r + 0.35) {     // щит ловит пульки
        const h = sh.h; h.shieldHp -= s.dmg * 0.5;
        if (h.kind === 'crate') h.ref.flash = 0.08;
        GAME.SFX.play(h.kind === 'crate' ? 'hit_wood' : 'hit_flesh', p, { vol: 0.6 });
        if (h.shieldHp <= 0) { if (h.kind === 'crate') GAME.damageCrate(h.ref, 99); else hitEnemy(h.ref, GAME.tmp.set(0, 0, 0), 999, 0); }
        popEShot(i, col); continue;
      }
      if (GAME.car.alive && GAME.car.depth < 0.3 && GAME.car.y < 1.8 && Math.hypot(p.x - GAME.car.pos.x, p.z - GAME.car.pos.z) < GAME.car.radius * 0.85 + 0.3) {
        hurtCar(s.dmg, GAME.tmp.set(s.v.x, 0, s.v.z).normalize().multiplyScalar(0.3).clone());
        GAME.flash(p, col, 3, 0.15, 2.5, false); popEShot(i, col); continue;
      }
      let blocked = false;
      for (const o of GAME.obstacles) {
        if (!GAME.active(o) || o.carried || (s.chub && o === s.chub.rock)) continue;
        const q = o.mesh.position;
        if (Math.abs(p.x - q.x) < o.hx + 0.2 && Math.abs(p.z - q.z) < o.hz + 0.2 && p.y < (o.h || 3) + 0.2) { blocked = true; break; }
      }
      if (blocked) { GAME.SFX.play('hit_dirt', p, { vol: 0.5 }); popEShot(i, col); }
    }
  }
  function clearEShots() { for (const s of eshots) GAME.scene.remove(s.m); eshots.length = 0; }

  function hitEnemy(e, dir, dmg = 1, push = 4) {
    if (GAME.NET.client) { e.flash = 0.07; e.myHit = GS.elapsed; GAME.netEv({ t: 'eh', i: enemies.indexOf(e), d: Math.min(9999, dmg), x: dir ? GAME.r2(dir.x) : 0, z: dir ? GAME.r2(dir.z) : 0, p: push }, GAME.NET.hostPeer); return; }
    wakeEnemy(e);
    e.hp -= dmg; if (e.flash < -0.06) e.flash = 0.07;   // мигает, а не горит белым при постоянном уроне
    e.vel.addScaledVector(dir, push);
    if (e.hp <= 0 && !e.dead) {
      if (e.carried) { GAME.releaseIfHeld(e); e.carried = false; }
      e.dead = true; e.root.visible = false;
      enemyDieFx(e);
      if (!GAME.NET.applying) { GS.enemyKills++; ekillsEl.textContent = GS.enemyKills; GAME.crewKill(e.elite); GAME.myKill(e.pos.x, e.pos.z, 3); GAME.lootFrom(e.elite ? 'elite' : 'enemy', e.pos.x, e.pos.z); }
      if (e.elite) { GAME.dropLoot(e.pos); GS.shake = Math.max(GS.shake, 0.5); }
      enemyQueue.push({ e, t: e.elite ? 8 : 5 });
    }
  }
  for (let i = 0; i < RED_COUNT; i++) makeEnemy(false);
  for (let i = 0; i < ELITE_COUNT; i++) makeEnemy(true);

  return { enemyFlash, enemies, ekillsEl, setEnemyLook, placeEnemy, wakeEnemy, hurtCar, pushOutOfBox, enemyDieFx, updateEnemies, eshots, eshotGeo, eshotMat, eshotHaloMat, enemyVolley, MOB_PAT, mobGeo, mobLook, mobThrow, clearEShots, hitEnemy };
}
