// ---------- finale: once Pyramidon is down, a huge blue cube-angel descends and every surviving chubzik flies up into it ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createFinale(GAME) {
  const angel: any = { on: false, t: 0, phase: 'wait', g: null, eyes: [], wings: [], list: [], saved: 0, total: 0, pos: new THREE.Vector3(), shown: false };
  const ascEl = document.getElementById('asc'), resEl = document.getElementById('results');
  function angelStart() {
    if (angel.on) return;
    angel.on = true; angel.t = 0; angel.phase = 'wait';
    if (GAME.NET.on && GAME.NET.game) angel.pos.set(GAME.ROOM_X1 + 14, 0, 0);          // in a lobby everyone watches the same angel over the boss room
    else { const d = Math.hypot(GAME.BOSS_POS.x - GAME.car.pos.x, GAME.BOSS_POS.z - GAME.car.pos.z) || 1, k = Math.min(1, 13 / d);
      angel.pos.set(GAME.car.pos.x + (GAME.BOSS_POS.x - GAME.car.pos.x) * k, 0, GAME.car.pos.z + (GAME.BOSS_POS.z - GAME.car.pos.z) * k); }
    const S = 8, g = angel.g = new THREE.Group(); g.position.set(angel.pos.x, 80, angel.pos.z); GAME.scene.add(g);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), new THREE.MeshStandardMaterial({ color: 0x3f8cff, emissive: 0x0a2a7a, roughness: 0.35, metalness: 0.2, flatShading: true }));
    cube.rotation.y = Math.PI / 4; cube.castShadow = true; g.add(cube);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.34, 6, 28), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffe07a }), 3.2)); halo.rotation.x = Math.PI / 2; halo.position.y = S / 2 + 2.4; g.add(halo); angel.halo = halo;
    // the blissful face, on the side that looks at the camera
    const fc = GAME.mkCanvas(512), c = fc.getContext('2d'); c.lineCap = 'round'; c.strokeStyle = '#0c1c4a'; c.lineWidth = 16;
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(256 + sd * 150, 210); c.quadraticCurveTo(256 + sd * 100, 150, 256 + sd * 50, 210); c.stroke(); c.fillStyle = 'rgba(255,130,180,.75)'; c.beginPath(); c.ellipse(256 + sd * 170, 290, 44, 26, 0, 0, 6.283); c.fill(); }
    c.beginPath(); c.moveTo(150, 300); c.quadraticCurveTo(256, 430, 362, 300); c.stroke();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.9, S * 0.9), new THREE.MeshBasicMaterial({ map: GAME.srgbTex(fc), transparent: true, depthWrite: false }));
    face.material.color.setScalar(0.5); face.position.set(0, 0, S / 2 + 0.03); cube.add(face);
    // eyes everywhere
    const mkEye = open => { const e = GAME.mkCanvas(96), x = e.getContext('2d'); x.lineWidth = 7; x.strokeStyle = '#0c1c4a';
      if (open) { x.beginPath(); x.arc(48, 48, 38, 0, 6.283); x.fillStyle = '#fffaf0'; x.fill(); x.stroke(); x.fillStyle = '#ffb040'; x.beginPath(); x.arc(48, 50, 22, 0, 6.283); x.fill(); x.fillStyle = '#0c1c4a'; x.beginPath(); x.arc(48, 50, 11, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(40, 40, 6, 0, 6.283); x.fill(); }
      else { x.lineCap = 'round'; x.beginPath(); x.moveTo(12, 44); x.quadraticCurveTo(48, 78, 84, 44); x.stroke(); }
      const m = new THREE.SpriteMaterial({ map: GAME.srgbTex(e), transparent: true, alphaTest: 0.3 }); m.color.setScalar(0.6); return m; };
    const eyeOpen = mkEye(true), eyeShut = mkEye(false);
    for (let i = 0; i < 34; i++) {
      const f = i % 5, u = GAME.rand(-0.42, 0.42) * S, v = GAME.rand(-0.42, 0.42) * S, h = S / 2 + 0.15;
      const p = f === 0 ? [u, h, v] : f === 1 ? [h, u, v] : f === 2 ? [u, v, h] : f === 3 ? [-h, u, v] : [u, v, -h];
      if (f === 2 && Math.abs(u) < S * 0.36 && v > -S * 0.25 && v < S * 0.18) { i--; continue; }      // keep the smile clear
      const s = new THREE.Sprite(eyeOpen), sc = GAME.rand(0.7, 1.5); s.position.set(p[0], p[1], p[2]); s.scale.set(sc, sc, 1); cube.add(s);
      angel.eyes.push({ s, t: GAME.rand(0.5, 4), sc });
    }
    angel.eyeMats = [eyeOpen, eyeShut];
    // sprite wings
    const wc = GAME.mkCanvas(256, 320), w = wc.getContext('2d'); w.lineJoin = 'round'; w.strokeStyle = '#3a6ad0'; w.lineWidth = 7; w.fillStyle = '#fbfdff';
    for (let i = 6; i >= 0; i--) { const a = -1.15 + i * 0.36, L = 230 - i * 14; w.save(); w.translate(18, 120); w.rotate(a); w.beginPath(); w.moveTo(0, -16); w.quadraticCurveTo(L * 0.6, -44, L, 0); w.quadraticCurveTo(L * 0.6, 34, 0, 18); w.closePath(); w.fill(); w.stroke(); w.restore(); }
    const wm = new THREE.SpriteMaterial({ map: GAME.srgbTex(wc), transparent: true, alphaTest: 0.2 }); wm.color.setScalar(0.62);
    const wmL = wm.clone(); wmL.map = wm.map.clone(); wmL.map.repeat.x = -1; wmL.map.offset.x = 1; wmL.map.needsUpdate = true;
    for (const sd of [-1, 1]) { const s = new THREE.Sprite(sd > 0 ? wm : wmL); s.center.set(sd > 0 ? 0 : 1, 0.4); s.position.set(sd * 0.707 * S * 0.72, 0.5, -sd * 0.707 * S * 0.72); s.scale.set(9, 11, 1); g.add(s); angel.wings.push({ s, sd }); }
    const ray = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 90, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); ray.position.y = 30; g.add(ray);
    // the world goes quiet
    for (const m of GAME.swarm) { m.dead = true; GAME.scene.remove(m.sprite, m.shadow); if (Math.hypot(m.pos.x - GAME.car.pos.x, m.pos.z - GAME.car.pos.z) < 40) GAME.spawnParticles(GAME.tmp.set(m.pos.x, 1, m.pos.z), m.art.color, 6, 6); }
    GAME.waves.t = 1e9; GS.chubSpawnT = 1e9;
    GAME.SFX.play('choir', null);
  }
  function updateAngel(dt) {
    if (!angel.on) return;
    const t = (angel.t += dt), g = angel.g, Y = 15;
    const k = THREE.MathUtils.clamp((t - 1.5) / 4, 0, 1), e = 1 - Math.pow(1 - k, 3);
    g.position.y = 80 + (Y - 80) * e + Math.sin(GS.elapsed * 1.3) * 0.5;
    angel.halo.rotation.z += dt * 0.8;
    for (const w of angel.wings) { const f = Math.sin(GS.elapsed * 2.4); w.s.material.rotation = w.sd * (0.15 + f * 0.28); w.s.scale.set(9, 11 * (1 + f * 0.08), 1); }
    for (const E of angel.eyes) { E.t -= dt; E.s.material = angel.eyeMats[E.t < 0.14 ? 1 : 0]; if (E.t < 0) E.t = GAME.rand(1.5, 5); }
    if (angel.phase === 'wait' && t > 5.2) {             // call them all home, cart included, wherever they are
      angel.phase = 'gather';
      GAME.cart.riders.length = 0; GAME.cartNEl.textContent = 0;
      const all = GAME.chubs.filter(c => !c.dead && c.state !== 'sacrifice');
      if (GAME.NET.on && GAME.NET.game) for (const R of GAME.NET.remotes.values()) {            // whoever rides with passengers sends them up as well
        for (const sp of (R.riders || []).filter(q => q.visible)) all.push({ sprite: sp, shadow: new THREE.Object3D(), pos: sp.position.clone(), from: new THREE.Vector3(), t: 0, T: 1, state: 'ascend', ghost: true });
        R.riders = [];
      }
      all.sort((a, b) => Math.hypot(a.pos.x - angel.pos.x, a.pos.z - angel.pos.z) - Math.hypot(b.pos.x - angel.pos.x, b.pos.z - angel.pos.z));
      all.forEach((c, i) => { c.state = 'ascend'; c.shadow.visible = false; if (c.ghost) { c.from.copy(c.pos); c.t = -i * 0.09; c.T = 1.5; return; } c.sprite.visible = true; c.from.copy(c.pos); c.t = -i * 0.09; c.T = 1.5; });
      angel.list = all; angel.total = all.length; angel.saved = 0;
      ascEl.style.display = 'block'; ascEl.textContent = '0';
      GAME.flashAlert(all.length ? 'COME HOME, LITTLE ONES' : 'NO ONE LEFT TO SAVE');
    }
    if (angel.phase === 'gather') {
      for (let i = angel.list.length - 1; i >= 0; i--) {
        const c = angel.list[i]; c.t += dt; if (c.t < 0) continue;
        const u = Math.min(1, c.t / c.T), s = u * u * (3 - 2 * u);
        c.pos.set(c.from.x + (angel.pos.x - c.from.x) * s, c.from.y + (g.position.y - c.from.y) * s + Math.sin(Math.PI * u) * 6, c.from.z + (angel.pos.z - c.from.z) * s);
        c.sprite.position.copy(c.pos); c.sprite.material = GAME.chubMats[0][Math.floor(GS.elapsed * 8 + i) % GAME.CHUB_FR];
        const sc = GAME.CHUB_SIZE * (1 + 0.6 * Math.sin(Math.PI * u)) * (u > 0.85 ? (1 - u) / 0.15 : 1); c.sprite.scale.set(sc, sc, 1);
        if (u >= 1) {
          c.dead = true; GAME.scene.remove(c.sprite); if (c.shadow) GAME.scene.remove(c.shadow); angel.list.splice(i, 1);
          angel.saved++; ascEl.textContent = angel.saved;
          GAME.SFX.play('chub', null, { rate: 0.9 + Math.min(1.1, angel.saved * 0.02), vol: 0.6 }); GAME.flash(GAME.tmp.copy(c.pos), 0x9ad0ff, 2.5, 0.2, 2, false);
        }
      }
      if (!angel.list.length) { angel.phase = 'done'; angel.doneT = t; }
    }
    if (angel.phase === 'done' && !angel.shown && t > angel.doneT + 1.4) {
      angel.shown = true; ascEl.style.display = 'none';
      const fed = GAME.altars.reduce((a, A) => a + A.n, 0), mm = Math.floor(GS.elapsed / 60), ss = String(Math.floor(GS.elapsed % 60)).padStart(2, '0');
      const verdict = angel.saved === 0 ? 'The angel came for nothing.' : angel.saved >= GS.chubEaten + fed ? 'More saved than lost. The angel beams.' : angel.saved >= fed ? 'A fair trade, by wasteland standards.' : 'The altars ate better than the angel.';
      resEl.innerHTML = `<h2>THE CHUBZIKS ASCEND</h2><div class="big">${angel.saved}</div><div class="sub">saved</div>
        <table><tr><td>Fed to the altars</td><td>${fed}</td></tr><tr><td>Eaten by monsters</td><td>${GS.chubEaten}</td></tr>
        <tr><td>Monsters destroyed</td><td>${GS.enemyKills}</td></tr><tr><td>Crates smashed</td><td>${GS.kills}</td></tr><tr><td>Pillars and rocks flattened</td><td>${GS.pillarsSmashed}</td></tr>
        <tr><td>Time</td><td>${mm}:${ss}</td></tr></table><p>${verdict}</p><button id="again">PLAY AGAIN</button>`;
      resEl.style.display = 'block';
      document.getElementById('again').addEventListener('click', GAME.hardReload);
    }
  }

  let resInit = false;
  function seedResidents() {                           // packs that live around some of the rocks and lay siege to them
    if (!GAME.rocks.length || GAME.NET.client) return;
    for (const R of GAME.rocks.slice().sort(() => Math.random() - 0.5).slice(0, 9)) {
      const kinds = [['gremlin', 'gremlin', 'stilt', 'spitter'], ['maw', 'maw', 'jelly', 'oculon'], ['gremlin', 'spike', 'lamprey', 'spitter']][Math.floor(Math.random() * 3)];
      kinds.forEach((k, i) => { const a = i * 1.6 + Math.random(), m = GAME.spawnCritter(k, R.mesh.position.x + Math.cos(a) * (R.r + 6), R.mesh.position.z + Math.sin(a) * (R.r + 6)); m.home = R; if (!m.K.fly) GAME.digOut(m); });
    }
  }
  function updateChubs(dt) {
    if (!resInit && !GAME.NET.client && GS.worldUp) { resInit = true; seedResidents(); }      // the nests' guards move in when the nests rise
    if (!GS.chubInit && !GAME.NET.client && GAME.PH.i >= 2) { GS.chubInit = true; for (const R of GAME.rocks) for (let i = 0; i < 6; i++) GAME.spawnChub(R, i < 4); }      // the chubziks hatch with SAVE & SACRIFICE
    GS.chubSpawnT -= dt;
    if (GS.chubSpawnT <= 0 && !GAME.NET.client) {                             // the colony slowly refills, a resident pack too
      GS.chubSpawnT = 3; GS.chubTick++;
      if (GS.worldUp && GAME.rocks.length < 8 && GS.chubTick % 4 === 0) {      // too few rocks left for the colony: one of the flattened ones rises again, away from everybody
        const far = o => { if (Math.hypot(o.mesh.position.x - GAME.car.pos.x, o.mesh.position.z - GAME.car.pos.z) < 35) return false; for (const R of GAME.NET.remotes.values()) if (Math.hypot(o.mesh.position.x - R.pos.x, o.mesh.position.z - R.pos.z) < 35) return false; return true; };
        const gone = GAME.obstacles.filter(o => o.rock && !o.dormant && !o.mesh.visible && far(o));
        if (gone.length) { const o = gone[Math.floor(Math.random() * gone.length)]; GAME.rockGrow(o); GAME.netEv({ t: 'rock', i: GAME.obstacles.indexOf(o) }); for (let i = 0; i < 4; i++) GAME.spawnChub(o, true); }
      }
      let loose = 0; for (const c of GAME.chubs) if (c.state !== 'cart') loose++;
      if (GAME.PH.i >= 2 && GAME.rocks.length && loose < GAME.rocks.length * 8) GAME.spawnChub(GAME.rocks[Math.floor(Math.random() * GAME.rocks.length)], true);   // only surviving rocks breed
      let res = 0; for (const m of GAME.swarm) if (!m.dead && m.home) res++;
      if (GS.chubTick % 2 === 0 && !angel.on && res < 40 && GAME.rocks.length) { const R = GAME.rocks[Math.floor(Math.random() * GAME.rocks.length)]; if (Math.hypot(R.mesh.position.x - GAME.car.pos.x, R.mesh.position.z - GAME.car.pos.z) > 45) { const a = Math.random() * 6.283; GAME.spawnCritter(Math.random() < 0.3 ? 'spitter' : 'gremlin', R.mesh.position.x + Math.cos(a) * (R.r + 7), R.mesh.position.z + Math.sin(a) * (R.r + 7)).home = R; } }
    }
    const okMe = GAME.carOK();
    for (let i = GAME.chubs.length - 1; i >= 0; i--) {
      const c = GAME.chubs[i];
      if (c.dead) { GAME.chubs.splice(i, 1); continue; }
      if (c.net && !angel.on) {                          // mirrored from the lobby host
        const k = 1 - Math.exp(-9 * dt), ox = c.pos.x, oz = c.pos.z;
        if (c.pos.distanceTo(c.tp) > 12) c.pos.copy(c.tp); else c.pos.lerp(c.tp, k);
        const mx = c.pos.x - ox, mz = c.pos.z - oz, sp = Math.hypot(mx, mz) / Math.max(dt, 1e-3);
        if (Math.abs(mx - mz) > 0.3 * dt) c.face = mx - mz > 0 ? -1 : 1;
        c.phase += dt * (sp > 0.5 ? 3 + Math.min(9, sp) * 0.9 : 2.2);
        c.sprite.material = GAME.chubMats[c.fl & 1 ? 1 : 0][Math.floor(c.phase) % GAME.CHUB_FR];
        c.sprite.position.set(c.pos.x, c.pos.y + (sp > 0.5 ? Math.abs(Math.sin(c.phase * Math.PI * 0.5)) * 0.22 : 0), c.pos.z); c.sprite.scale.set(GAME.CHUB_SIZE * c.face, GAME.CHUB_SIZE, 1);
        c.shadow.position.set(c.pos.x, (c.fl & 2 ? c.tp.y : 0) + 0.04, c.pos.z);
        continue;
      }
      if (GAME.NET.client && !c.net && !angel.on && c.state !== 'cart' && c.state !== 'ascend' && c.state !== 'sacrifice' && !(c.state === 'arc' && c.next === 'sacrifice')) {
        const q = c.state === 'arc' ? c.to : c.pos;      // fell off my cart: from here on it lives in the host's world
        GAME.netEv({ t: 'drop', fx: GAME.r1(c.pos.x), fz: GAME.r1(c.pos.z), x: GAME.r1(q.x), z: GAME.r1(q.z) }, GAME.NET.hostPeer);
        c.dead = true; GAME.scene.remove(c.sprite, c.shadow); GAME.chubs.splice(i, 1); continue;
      }
      if (c.state === 'ascend') continue;
      if (c.state === 'cart') { c.phase += dt * 3; c.sprite.material = GAME.chubMats[Math.abs(GAME.cart.phi) > 0.25 ? 1 : 0][Math.floor(c.phase) % GAME.CHUB_FR]; c.sprite.position.copy(c.pos); c.sprite.scale.set(GAME.CHUB_SIZE * 0.85, GAME.CHUB_SIZE * 0.85, 1); continue; }
      let dcx = GAME.car.pos.x - c.pos.x, dcz = GAME.car.pos.z - c.pos.z, dCar = Math.hypot(dcx, dcz), ok = okMe, other = null;
      for (const R of GAME.NET.remotes.values()) {            // another player's ride may be closer: go to whichever is nearest
        if (!R.up || R.pos.y > 1) continue;
        const rx = R.pos.x - c.pos.x, rz = R.pos.z - c.pos.z, rd = Math.hypot(rx, rz);
        if (rd < dCar || !ok) { dcx = rx; dcz = rz; dCar = rd; ok = true; other = R; }
      }
      let catchR = GAME.car.radius + 0.75;
      if (c.state !== 'perch') {                         // a cart is as good as the ride itself: run for whichever is nearer
        if (okMe && GAME.cart.shown && GAME.car.depth < 0.3) { const kx = GAME.cart.pos.x - c.pos.x, kz = GAME.cart.pos.z - c.pos.z, kd = Math.hypot(kx, kz) - 0.9; if (kd < dCar - GAME.car.radius * 0.5 || !ok) { dcx = kx; dcz = kz; dCar = kd + GAME.car.radius; ok = true; other = null; } }
        for (const R of GAME.NET.remotes.values()) if (R.up && R.cart && R.cart.visible) { const kx = R.cpos.x - c.pos.x, kz = R.cpos.z - c.pos.z, kd = Math.hypot(kx, kz) - 0.9; if (kd < dCar - GAME.car.radius * 0.5 || !ok) { dcx = kx; dcz = kz; dCar = kd + GAME.car.radius; ok = true; other = R; } }
      }
      if ((c.think -= dt) <= 0) { c.think = 0.3; c.threat = GAME.monsterDist(c.pos.x, c.pos.z); }
      let speed = 0, gx = 0, gz = 0, scared = false;
      if (c.state === 'arc') {
        c.t += dt; const k = Math.min(1, c.t / c.T);
        c.pos.lerpVectors(c.from, c.to, k); c.pos.y += Math.sin(Math.PI * k) * c.arcH; scared = c.next !== 'perch' && c.next !== 'roam';
        if (k >= 1) {
          c.pos.copy(c.to); c.state = c.next; c.calm = 0; c.goal.copy(c.pos);
          if (c.state === 'sacrifice') { GAME.altarFeed(c); continue; }
          if (c.state === 'perch' && !c.rock.mesh.visible) { c.pos.y = 0; c.state = 'dazed'; c.dazeT = 0.8; }
        }
      } else if (c.state === 'perch') {
        if (GS.ride === 'spider' && !other && GAME.car.alive && dCar < GAME.car.radius + 0.7 && Math.abs(GAME.car.y - c.pos.y) < 1.3) { c.pos.y = 0; GAME.cartAdd(c); continue; }
        { let got = null; for (const R of GAME.NET.remotes.values()) if (R.up && R.ride === 'spider' && Math.hypot(R.pos.x - c.pos.x, R.pos.z - c.pos.z) < GAME.car.radius + 0.7 && Math.abs(R.pos.y - c.pos.y) < 1.3) got = R;
          if (got) { GAME.netEv({ t: 'chub' }, got.peer); c.dead = true; GAME.scene.remove(c.sprite, c.shadow); continue; } }
        c.calm = c.threat > 12 ? c.calm + dt : 0; scared = c.threat < 9;
        const comeDown = ok && dCar < 11 && c.threat > 8;
        if (c.calm > 2.5 || comeDown) {
          const R = c.rock, a = comeDown ? Math.atan2(dcz, dcx) : Math.random() * 6.283;
          GAME.tmp.set(R.mesh.position.x + Math.cos(a) * (R.r + 1.6), 0, R.mesh.position.z + Math.sin(a) * (R.r + 1.6));
          GAME.chubArc(c, GAME.tmp, 0.45, comeDown ? 'tocar' : 'roam', 1.2);
        }
      } else if (c.state === 'dazed') {
        scared = true; if ((c.dazeT -= dt) <= 0) { c.rock = GAME.nearestRock(c.pos.x, c.pos.z); c.state = ok && dCar < 14 ? 'tocar' : c.rock ? 'flee' : 'roam'; }
      } else if (c.state === 'roam') {
        if (ok && dCar < 13) c.state = 'tocar';
        else if (c.threat < 8 && GAME.rocks.length) { c.state = 'flee'; c.rock = GAME.nearestRock(c.pos.x, c.pos.z); }
        else {
          if ((c.t -= dt) <= 0 || Math.hypot(c.goal.x - c.pos.x, c.goal.z - c.pos.z) < 0.5) { c.t = 2 + Math.random() * 3; const R = c.home, a = Math.random() * 6.283, d = R.r + 2 + Math.random() * 7; c.goal.set(R.mesh.position.x + Math.cos(a) * d, 0, R.mesh.position.z + Math.sin(a) * d); }
          gx = c.goal.x - c.pos.x; gz = c.goal.z - c.pos.z; speed = 2.6;
        }
      } else if (c.state === 'flee') {
        scared = true; if (!c.rock || !c.rock.mesh.visible) c.rock = GAME.nearestRock(c.pos.x, c.pos.z);
        const R = c.rock;
        if (!R) c.state = 'roam';
        else if ((gx = R.mesh.position.x - c.pos.x, gz = R.mesh.position.z - c.pos.z, speed = 8, Math.hypot(gx, gz)) < R.r * 1.25 + 0.6) { GAME.chubArc(c, GAME.perchSlot(R), 0.42, 'perch', 1.6); speed = 0; }
        else if (ok && dCar < 7 && c.threat > 4) c.state = 'tocar';
      } else if (c.state === 'tocar') {
        if (!ok || dCar > 17) c.state = 'roam'; else { gx = dcx; gz = dcz; speed = 8.5; scared = c.threat < 9; }
      }
      if (speed) {
        const g = Math.hypot(gx, gz) || 1; c.vel.set(gx / g * speed, 0, gz / g * speed);
        c.pos.addScaledVector(c.vel, dt);
        for (const o of GAME.obstacles) if (GAME.active(o)) GAME.pushOutOfBox(c.pos, 0.4, o);
        const sx = c.vel.x - c.vel.z; if (Math.abs(sx) > 0.3) c.face = sx > 0 ? -1 : 1;
        c.phase += dt * (3 + speed * 0.9);
      } else c.phase += dt * 2.2;
      if (GAME.chubVulnerable(c) && ok && dCar < catchR + 2.4 && dCar > 0.01) {   // close enough: a gentle tug toward the ride or cart
        const pull = Math.min(dCar, (3 + 6 * (1 - (dCar - catchR) / 2.4)) * dt); c.pos.x += dcx / Math.hypot(dcx, dcz) * pull; c.pos.z += dcz / Math.hypot(dcx, dcz) * pull; dCar -= pull;
      }
      if (GAME.chubVulnerable(c) && ok && dCar < catchR) {
        if (!other) GAME.cartAdd(c);
        else { GAME.netEv({ t: 'chub' }, other.peer); c.dead = true; GAME.scene.remove(c.sprite, c.shadow); GAME.flash(GAME.tmp.copy(c.pos).setY(0.8), 0x9ad0ff, 2, 0.2, 2, false); GAME.SFX.play('chub', c.pos, { rate: 1.2, vol: 0.6 }); }   // it hopped into their cart
        continue;
      }
      if (angel.on && c.state === 'ascend') continue;
      c.sprite.material = GAME.chubMats[scared ? 1 : 0][Math.floor(c.phase) % GAME.CHUB_FR];
      const hop = speed ? Math.abs(Math.sin(c.phase * Math.PI * 0.5)) * 0.22 : 0;
      c.sprite.position.set(c.pos.x, c.pos.y + hop, c.pos.z); c.sprite.scale.set(GAME.CHUB_SIZE * c.face, GAME.CHUB_SIZE, 1);
      c.shadow.position.set(c.pos.x, (c.state === 'perch' ? c.rock.h : 0) + 0.04, c.pos.z);
    }
    GAME.updateCart(dt);
  }
  function resetChubs() {                              // respawn: passengers scatter, the colony stays
    GAME.cartFling(GAME.cart.riders.length, 0); GAME.cartReset(); seedResidents();
  }
  GS.chubInit = false;

  // ---- mobile auto-fire: lock the turret on the nearest awake biter (or the boss) like a shmup ----
  GS.autoTarget = null;
  const autoV = new THREE.Vector3();
  function onScreen(x, z) { autoV.set(x, 1, z).project(GAME.camera); return Math.abs(autoV.x) < 1.05 && Math.abs(autoV.y) < 1.05; }
  function pickAutoTarget() {
    const ok = e => e && !e.dead && !e.carried && e.awake && Math.hypot(e.pos.x - GAME.car.pos.x, e.pos.z - GAME.car.pos.z) < 30 && onScreen(e.pos.x, e.pos.z);
    if (GS.autoTarget && GS.autoTarget !== GAME.boss && ok(GS.autoTarget)) return GS.autoTarget;   // sticky, no jitter between two biters
    let best = null, bd = 26;
    for (const e of GAME.enemies) if (ok(e)) { const d = Math.hypot(e.pos.x - GAME.car.pos.x, e.pos.z - GAME.car.pos.z); if (d < bd) { bd = d; best = e; } }
    for (const e of GAME.swarm) if (ok(e)) { const d = Math.hypot(e.pos.x - GAME.car.pos.x, e.pos.z - GAME.car.pos.z) - (e.K.ranged ? 4 : 0); if (d < bd) { bd = d; best = e; } }
    if (!best && GAME.boss.state === 'fight' && Math.hypot(GAME.BOSS_POS.x - GAME.car.pos.x, GAME.BOSS_POS.z - GAME.car.pos.z) < 32) best = GAME.boss;
    return best;
  }
  function autoTargetPos(t) { return t === GAME.boss ? GAME.BOSS_POS : t.pos; }

  return { angel, angelStart, updateAngel, updateChubs, resetChubs, pickAutoTarget, autoTargetPos };
}
