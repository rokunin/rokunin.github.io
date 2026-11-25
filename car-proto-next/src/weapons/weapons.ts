// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- weapons, survivors-style: broken crates drop chips that add a weapon or level it up ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { ARENA, W_STATS, W_ORDER, SWORD_T, WEB_N, WEB_R, WEB_T, HALO_SWORDS, BEAM_PER } from '../data/index.js';

export function createWeapons(GAME) {
  const W_MAX = 5, WEAPON_DROP = 0.35;
  const weapons = { spread: 0, nova: 0, orbit: 0, mortar: 0 };            // 0 = not owned yet
  let firstCrateDrop = true;

  // HUD: owned weapons with their level
  const wBar = document.getElementById('weapons');
  function updateWeaponHUD(fresh) {                      // fresh: the weapon that just changed pops
    wBar.innerHTML = W_ORDER.filter(k => weapons[k]).map(k =>
      `<div class="wslot${k === fresh ? ' new' : ''}${weapons[k] < W_MAX && GS.gems >= GAME.wPrice(k) ? ' can' : ''}"><b class="up" data-k="${k}">+</b><img src="${GAME.ICON_URLS['w_' + k]}" draggable="false"><b>${weapons[k] >= W_MAX ? 'MAX' : 'Lv' + wLv(k)}</b>${weapons[k] < W_MAX ? `<i class="cost${GS.gems >= GAME.wPrice(k) ? ' ok' : ''}">${GAME.wPrice(k)}◆</i>` : ''}</div>`).join('');
  }
  { const spendW = e => { const u = e.target.closest && e.target.closest('.up'); if (!u) return; e.preventDefault(); e.stopPropagation();
      const k = u.dataset.k; if (!weapons[k] || weapons[k] >= W_MAX || GS.gems < GAME.wPrice(k)) return; GS.gems -= GAME.wPrice(k); const lv = gainWeapon('w_' + k, true);
      GAME.toast('w_' + k, lv >= W_MAX ? 'MAX' : 'Lv ' + wLv(k)); GAME.SFX.play('pickup', null, { rate: 1.3 }); GS.abSig = ''; };
    wBar.addEventListener('mousedown', spendW); wBar.addEventListener('touchstart', spendW, { passive: false }); }
  GS.wUpSeen = -1;
  function dropWeapon(at) {                                 // after the warm-up: now and then a one-shot token (gear itself only drops for you, from your own kills)
    const onGround = GAME.pickups.filter(p => p.type.startsWith('x_') && Math.hypot(p.x - at.x, p.z - at.z) < 45).length;
    if (onGround >= 2) return;
    const r = Math.random(), xs = Object.keys(GAME.X_TOKENS);
    if (r < 0.3) GAME.spawnPickup(xs[Math.floor(Math.random() * xs.length)], at); else if (r < 0.42) GAME.spawnPickup('heal', at);
  }

  function crateDrop(o) {
    if (o.room || GAME.PH.i === 0) return;                     // the warm-up is fought with what the ride came with                                    // the boss's ammo doesn't pay out
    if (firstCrateDrop || Math.random() < Math.min(0.8, WEAPON_DROP * (1 + 0.5 * (GAME.NET.on && GAME.NET.game ? GAME.NET.remotes.size : 0)))) { firstCrateDrop = false; dropWeapon(o.mesh.position); }
  }
  const wLv = k => Math.ceil(weapons[k] / 2);                // shown level 1..3 (the stat tables keep 5 steps: 1, 3, 5)
  function gainWeapon(type, up) {
    const k = type.slice(2); weapons[k] = up ? Math.min(W_MAX, weapons[k] + 2) : Math.max(1, weapons[k]);
    updateWeaponHUD(k); GAME.crewSay('weapon');
    if (k === 'orbit') buildSaws();
    return weapons[k];
  }

  // ---- nova: a ring of bullets ----
  const novaMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0x5ff5e6 }), 3.5);
  GS.novaT = 0;
  function fireNova() {
    const L = weapons.nova - 1, n = W_STATS.nova.n[L], o = new THREE.Vector3(GAME.car.pos.x, 1.0 + GAME.car.y, GAME.car.pos.z), ph = Math.random() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = ph + i / n * Math.PI * 2, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const m = new THREE.Mesh(GAME.bulletGeo, novaMat); m.position.copy(o).addScaledVector(dir, 1.6);
      m.lookAt(m.position.x + dir.x, m.position.y, m.position.z + dir.z); GAME.scene.add(m);
      GAME.bullets.push({ m, v: dir.multiplyScalar(42), life: 0.55, dmg: W_STATS.nova.dmg[L] });
    }
    GAME.flash(o, 0x5ff5e6, 7, 0.25, 3); GAME.SFX.play('nova', GAME.car.pos); GAME.netEv({ t: 'wf', k: 'nova', l: L });
  }

  // ---- beam nova: the halo fires a star of holy rail beams that hold for a while; the unicorn blasts rainbows out of both ends, right across the map ----
  const beams = [], bmV = new THREE.Vector3();
  const beamGeo = new THREE.BoxGeometry(1, 1, 1); beamGeo.translate(0, 0, 0.5);         // runs along +z from its origin
  const railRingGeo = new THREE.TorusGeometry(0.5, 0.045, 5, 18);                       // lies across the beam
  const rbGeo = new THREE.PlaneGeometry(1, 1, 1, 1); rbGeo.rotateX(-Math.PI / 2); rbGeo.translate(0, 0, 0.5);      // flat ribbon along +z, uv.y = 1 at the origin
  const RAINBOW = [0xff4a5a, 0xff9a3a, 0xffe14a, 0x5fd36a, 0x4f9dff, 0xb06cff];
  const addMat = (c, k, o) => { const m = GAME.glow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), k); m.userData.o = o; return m; };
  const rainbowMat = len => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 }, alpha: { value: 0 }, len: { value: len } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, alpha, len; varying vec2 vUv;
      void main(){
        float d = (1.0 - vUv.y) * len;
        float x = (vUv.x - 0.5) * 1.25 + 0.5 + 0.09 * sin(d * 0.5 - time * 13.0) + 0.03 * sin(d * 1.7 + time * 7.0);       // the ribbon wriggles
        if (x < 0.0 || x > 1.0) discard;
        float h = floor(x * 6.0) / 6.0 * 0.86;
        vec3 col = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        col = mix(col, vec3(1.0), 0.12) * (1.0 + 0.25 * sin(d * 0.9 - time * 20.0));                                      // pulses run down it
        float tw = pow(max(0.0, sin(d * 2.3 - time * 31.0) * sin(x * 37.0 + d * 1.3)), 10.0);                             // sparkles
        float edge = smoothstep(0.0, 0.06, x) * smoothstep(1.0, 0.94, x);
        gl_FragColor = vec4(col * 1.15 + tw * 2.5, alpha * edge * smoothstep(0.0, 1.2, d));
      }` });
  const swordMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, alpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, alpha; varying vec2 vUv;
      void main(){
        float d = 1.0 - vUv.y, x = abs(vUv.x - 0.5) * 2.0;                       // d: 0 at the hilt, 1 at the point
        float blade = 0.34 * min(1.0, (1.0 - d) / 0.2) * step(0.13, d);          // straight blade, tapering to the point
        float guard = step(0.09, d) * step(d, 0.13) * 0.95;                      // crossguard
        float grip = step(d, 0.09) * 0.1;
        float w = max(blade, max(guard, grip));
        float inside = 1.0 - smoothstep(w * 0.8, w, x);
        float core = 1.0 - smoothstep(0.0, w * 0.35 + 0.001, x);                 // white fuller down the middle
        float halo = (1.0 - smoothstep(w, w + 0.45, x)) * 0.16 * step(0.05, d) * (1.0 - smoothstep(0.9, 1.0, d));
        float glint = pow(max(0.0, sin(d * 9.0 - time * 7.0)), 14.0);            // a gleam runs up the blade
        vec3 col = mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.97, 0.88), core) * (1.5 + 2.0 * core + 1.6 * glint * inside);
        float a = max(inside, halo);
        gl_FragColor = vec4(col * a, 1.0) * alpha;
      }` });
  const haloHoly = () => GS.ride === 'halo' && beams.some(B => B.kind === 'halo' && !B.fx);
  const carSrc = { get pos() { return GAME.car.pos; }, h: () => GAME.car.heading, y: () => GAME.car.y, alive: () => GAME.car.alive && GAME.car.depth < 0.3 };
  function fireBeams(src = carSrc, kind = GS.ride, L = weapons.nova - 1, fx = false) {      // fx: somebody else's beams, shown but harmless
    const dmg = W_STATS.nova.dmg[L];
    if (kind === 'halo') {                               // a ring of angelic swords; while they are out nothing can hurt the halo
      const n = HALO_SWORDS.n[L], len = HALO_SWORDS.len[L], ph = Math.random() * 6.283, dirs = [], mt = swordMat();
      for (let i = 0; i < n; i++) { const g = new THREE.Group(), m = new THREE.Mesh(rbGeo, mt); m.scale.set(2.3, 1, len); m.renderOrder = 4; g.add(m); GAME.scene.add(g); dirs.push({ g, a: ph + i / n * 6.283 }); }
      beams.push({ src, fx, kind: 'halo', dirs, mats: [mt], len, w: 1.1, t: 0, T: SWORD_T[L], tick: 0, every: HALO_SWORDS.every, dmg: dmg * HALO_SWORDS.dmgK });
      GAME.flash(GAME.tmp.set(src.pos.x, 2 + src.y(), src.pos.z), 0xfff0c0, 8, 0.3, 2.5);
    } else {
      const per = BEAM_PER[L], offs = per === 1 ? [0] : per === 2 ? [-0.2, 0.2] : [-0.38, 0, 0.38], len = 2 * ARENA + 80, dirs = [], mats = [];   // \|/ at full power, both ends
      for (const base of [0, Math.PI]) for (const o of offs) {
        const mt = rainbowMat(len), m = new THREE.Mesh(rbGeo, mt), g = new THREE.Group(); m.scale.set(2.4, 1, len); m.position.y = dirs.length * 0.015; m.renderOrder = 4; g.add(m);
        GAME.scene.add(g); dirs.push({ g, off: base + o, fwd: base === 0 }); mats.push(mt);
      }
      beams.push({ src, fx, kind: 'rainbow', dirs, mats, len, w: 2.0, t: 0, T: 1.0, tick: 0, every: 0.2, dmg: dmg * 1.4 });
      for (const sd of [1, -1]) GAME.flash(GAME.tmp.set(src.pos.x + Math.sin(src.h()) * 2.3 * sd, 2.6 + src.y(), src.pos.z + Math.cos(src.h()) * 2.3 * sd), 0xff9ad8, 6, 0.25, 2.5, sd > 0);
    }
    if (!fx) GAME.netEv({ t: 'wf', k: 'beam', l: L });
    GAME.SFX.play('nova', src.pos, { rate: kind === 'halo' ? 0.75 : 1.3 });
  }
  function beamHits(ox, oz, dx, dz, len, w, dmg) {       // everything lying across the beam takes a tick of damage
    const on = (px, pz, r) => { const rx = px - ox, rz = pz - oz, t = rx * dx + rz * dz; return t > -r && t < len + r && Math.abs(rx * dz - rz * dx) < r + w * 0.5; };
    bmV.set(dx, 0, dz);
    for (const e of GAME.enemies) if (!e.dead && !e.carried && on(e.pos.x, e.pos.z, e.r)) GAME.hitEnemy(e, bmV, dmg, 2);
    for (const m of GAME.swarm) if (!m.dead && on(m.pos.x, m.pos.z, m.r)) GAME.hitCritter(m, dmg, bmV, 2);
    for (const o of GAME.obstacles) if (o.crate && GAME.active(o) && on(o.mesh.position.x, o.mesh.position.z, Math.max(o.hx, o.hz))) GAME.damageCrate(o, dmg);
    if (GAME.boss.state === 'fight' && on(GAME.BOSS_POS.x, GAME.BOSS_POS.z, 4)) GAME.bossDamage(dmg);
  }
  function updateBeams(dt) {
    for (let i = beams.length - 1; i >= 0; i--) {
      const B = beams[i]; B.t += dt;
      const a = Math.max(0, Math.min(1, B.t / 0.08) * Math.min(1, (B.T - B.t) / 0.25));           // snap on, fade off
      for (const mt of B.mats) { mt.uniforms.alpha.value = a; mt.uniforms.time.value = GS.elapsed; }
      const S = B.src, fx = Math.sin(S.h()), fz = Math.cos(S.h()), alive = S.alive(), grow = Math.min(1, B.t / 0.1);
      for (const D of B.dirs) {
        let ang, ox = S.pos.x, oz = S.pos.z, oy;
        if (B.kind === 'halo') {
          D.a += dt * 0.28; ang = D.a; oy = 1.6 + S.y(); D.g.scale.set(1, 1, grow);
        } else {
          ang = S.h() + D.off; ox += fx * (D.fwd ? 2.3 : -1.7); oz += fz * (D.fwd ? 2.3 : -1.7); oy = (D.fwd ? 2.9 : 2.1) + S.y(); D.g.scale.set(1, 1, grow);
          if (alive && Math.random() < 0.5) { const d = 3 + Math.random() * 40; GAME.spawnParticles(GAME.tmp.set(ox + Math.sin(ang) * d, oy, oz + Math.cos(ang) * d), RAINBOW[Math.floor(Math.random() * 6)], 1, 4); }
        }
        D.g.position.set(ox, oy, oz); D.g.rotation.y = ang; D.g.visible = alive;
        D.dx = Math.sin(ang); D.dz = Math.cos(ang); D.ox = ox; D.oz = oz;
      }
      if (alive && !B.fx && (B.tick -= dt) <= 0) { B.tick = B.every; for (const D of B.dirs) beamHits(D.ox, D.oz, D.dx, D.dz, B.len, B.w, B.dmg * B.every / 0.12); }
      if (B.t >= B.T) { for (const D of B.dirs) GAME.scene.remove(D.g); for (const mt of B.mats) mt.dispose(); beams.splice(i, 1); }
    }
  }

  // ---- web nova: the spider spits four webs; whatever stands in one is tangled for as long as it lasts. Levels only make the webs wider ----
  const webs = [];
  const webTex = (() => { const c = GAME.mkCanvas(256), x = c.getContext('2d'); x.translate(128, 128); x.strokeStyle = '#fff'; x.lineCap = 'round';
    x.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 124, Math.sin(a) * 124); x.stroke(); }
    x.lineWidth = 2; for (let r = 1; r <= 6; r++) { x.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.283, a0 = (i - 0.5) / 12 * 6.283, R = r * 20; if (!i) x.moveTo(R, 0); else x.quadraticCurveTo(Math.cos(a0) * R * 0.86, Math.sin(a0) * R * 0.86, Math.cos(a) * R, Math.sin(a) * R); } x.stroke(); }
    return GAME.srgbTex(c); })();
  const webGeo = new THREE.CircleGeometry(1, 24); webGeo.rotateX(-Math.PI / 2);
  const webBallGeo = new THREE.IcosahedronGeometry(0.4, 1), webBallMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xeaf4ff }), 2);
  function fireWebs() {
    const R = WEB_R[weapons.nova - 1], spots = [], near = [];
    for (const m of GAME.swarm) if (!m.dead) { const d = Math.hypot(m.pos.x - GAME.car.pos.x, m.pos.z - GAME.car.pos.z); if (d < 22) near.push([d, m]); }
    for (const e of GAME.enemies) if (!e.dead && e.awake && !e.carried) { const d = Math.hypot(e.pos.x - GAME.car.pos.x, e.pos.z - GAME.car.pos.z); if (d < 22) near.push([d, e]); }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, t] of near) { if (spots.length >= WEB_N) break; const qx = t.pos.x + t.vel.x * 0.5, qz = t.pos.z + t.vel.z * 0.5;      // where it will be when the web lands
      if (!spots.some(sp => Math.hypot(sp.x - qx, sp.z - qz) < R * 1.3)) spots.push(new THREE.Vector3(qx, 0, qz)); }   // onto the nearest packs, not on top of each other
    const ph = Math.random() * 6.283;
    for (let i = 0; spots.length < WEB_N; i++) spots.push(new THREE.Vector3(GAME.car.pos.x + Math.sin(ph + i * 1.571) * (R + 4.5), 0, GAME.car.pos.z + Math.cos(ph + i * 1.571) * (R + 4.5)));
    GAME.netEv({ t: 'wf', k: 'web', l: weapons.nova - 1, s: spots.flatMap(q => [GAME.r1(q.x), GAME.r1(q.z)]) });
    launchWebs(new THREE.Vector3(GAME.car.pos.x, 2.6 + GAME.car.y, GAME.car.pos.z), spots, R, false);
  }
  function launchWebs(from, spots, R, fx) {
    for (const to of spots) { const ball = new THREE.Mesh(webBallGeo, webBallMat); ball.position.copy(from); GAME.scene.add(ball);
      webs.push({ ball, from: from.clone(), to, t: 0, fly: 0.3 + from.distanceTo(to) / 60, R, life: WEB_T, tick: 0, mesh: null, fx }); }
    GAME.SFX.play('spit', from, { rate: 0.7, vol: 0.7 });
  }
  function updateWebs(dt) {
    for (let i = webs.length - 1; i >= 0; i--) {
      const w = webs[i]; w.t += dt;
      if (!w.mesh) {                                     // still in the air
        const k = Math.min(1, w.t / w.fly); w.ball.position.lerpVectors(w.from, w.to, k); w.ball.position.y += Math.sin(Math.PI * k) * 3;
        if (k < 1) continue;
        GAME.scene.remove(w.ball); w.t = 0;
        w.mesh = new THREE.Mesh(webGeo, new THREE.MeshBasicMaterial({ map: webTex, transparent: true, opacity: 0, depthWrite: false })); w.mesh.material.color.setScalar(1.3);
        w.mesh.position.set(w.to.x, 0.08, w.to.z); w.mesh.rotation.y = Math.random() * 6.283; w.mesh.renderOrder = 2; GAME.scene.add(w.mesh);
        GAME.spawnParticles(GAME.tmp.set(w.to.x, 0.5, w.to.z), 0xeaf4ff, 6, 5); GAME.SFX.play('hit_dirt', w.to, { vol: 0.5, rate: 1.5 });
      }
      w.mesh.scale.setScalar(w.R * Math.min(1, w.t / 0.15)); w.mesh.material.opacity = Math.min(1, (w.life - w.t) / 0.5) * 0.85;
      if (!w.fx && (w.tick -= dt) <= 0) { w.tick = 0.4;
        for (const m of GAME.swarm) if (!m.dead && !m.K.fly && Math.hypot(m.pos.x - w.to.x, m.pos.z - w.to.z) < w.R + m.r * 0.5) { GAME.stunCritter(m, 0.6); m.vel.set(0, 0, 0); }   // fliers pass over
        if (!GAME.NET.client) for (const e of GAME.enemies) if (!e.dead && e.awake && !e.carried && Math.hypot(e.pos.x - w.to.x, e.pos.z - w.to.z) < w.R + e.r * 0.5) e.stun = Math.max(e.stun, 0.6);
      }
      if (w.t >= w.life) { GAME.scene.remove(w.mesh); w.mesh.material.dispose(); webs.splice(i, 1); }
    }
  }

  // ---- orbit: spinning saws ----
  const sawMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.25, emissive: 0x5a0a0a, flatShading: true });
  const sawGeo = (() => {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 8), teeth = [];
    for (let i = 0; i < 8; i++) {
      const t = new THREE.ConeGeometry(0.16, 0.34, 3); t.rotateZ(-Math.PI / 2); t.translate(0.68, 0, 0); t.rotateY(i / 8 * Math.PI * 2 + 0.2);
      teeth.push(t);
    }
    const parts = [g, ...teeth].map(x => x.toNonIndexed()), pos = [], nor = [];      // tiny merge: positions + normals
    for (const x of parts) { pos.push(...x.attributes.position.array); nor.push(...x.attributes.normal.array); }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return m;
  })();
  const saws = []; let sawAngle = 0;
  const dodecaGeo = new THREE.DodecahedronGeometry(0.62, 0);
  const dodecaMats = RAINBOW.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.2, flatShading: true }));
  function trimSaws() {                                     // a level or the whole saw gun lost: fewer saws
    const n = weapons.orbit ? W_STATS.orbit.n[weapons.orbit - 1] * (GS.ride === 'halo' ? 2 : 1) : 0;
    while (saws.length > n) GAME.scene.remove(saws.pop().m);
  }
  function deathToll() {                                    // dying on the field costs a random upgrade level, or a random skill/gun when nothing is levelled
    const lv = [...GAME.kit().filter(t => GAME.abilities[t] && GAME.abLv[t] > 0).map(t => ['ab', t]), ...W_ORDER.filter(k => weapons[k] > 1).map(k => ['w', k])];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    let lost = null;
    if (lv.length) { const [kind, k] = pick(lv); if (kind === 'ab') GAME.abLv[k]--; else { weapons[k] -= 2; trimSaws(); updateWeaponHUD(); } lost = [kind === 'ab' ? k : 'w_' + k, 'lost a level'];
    } else { const own = [...GAME.kit().filter(t => GAME.abilities[t] && t !== 'jump').map(t => ['ab', t]), ...W_ORDER.filter(k => weapons[k]).map(k => ['w', k])]; if (!own.length) return;
      const [kind, k] = pick(own); if (kind === 'ab') { GAME.abilities[k] = false; GAME.applyAbilityVisuals(); } else { weapons[k] = 0; trimSaws(); updateWeaponHUD(); } lost = [kind === 'ab' ? k : 'w_' + k, 'LOST']; }
    GS.abDirty = true; GS.abSig = ''; GAME.toast(lost[0], lost[1]); lossFxStart(lost[0], lost[1] !== 'LOST');
  }
  // what you lost pops out of the wreck, smoulders and breaks apart: whole icon for a skill or gun, a half-size one for a level
  const lossFx = [];
  function lossFxStart(type, small) {
    if (!GAME.pickupTex[type]) GAME.pickupTex[type] = GAME.srgbTex(GAME.ICONS[type]);
    const mat = new THREE.SpriteMaterial({ map: GAME.pickupTex[type], transparent: true, depthTest: false }), spr = new THREE.Sprite(mat);
    spr.renderOrder = 20; spr.position.set(GAME.car.pos.x, 1.5, GAME.car.pos.z); spr.scale.setScalar(0.01); GAME.scene.add(spr);
    lossFx.push({ type, spr, mat, t: 0, S: small ? 3 : 5, x: GAME.car.pos.x, z: GAME.car.pos.z, shards: null });
    GAME.SFX.play('clang', GAME.car.pos, { rate: 0.6 });
  }
  function lossShatter(F) {
    const y = F.spr.position.y; GAME.scene.remove(F.spr); F.shards = [];
    for (let i = 0; i < 4; i++) {                            // the icon cracks into its four quarters, which tumble away
      const tx = GAME.pickupTex[F.type].clone(); tx.repeat.set(0.5, 0.5); tx.offset.set((i & 1) * 0.5, (i >> 1) * 0.5); tx.needsUpdate = true;
      const m = new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, color: 0xc89070 }), sp = new THREE.Sprite(m);
      sp.renderOrder = 20; sp.scale.setScalar(F.S * 0.5); sp.position.set(F.x + ((i & 1) - 0.5) * F.S * 0.5 * 0.7071, y - ((i >> 1) - 0.5) * F.S * 0.5, F.z - ((i & 1) - 0.5) * F.S * 0.5 * 0.7071);
      const a = Math.atan2((i >> 1) - 0.5, (i & 1) - 0.5) + GAME.rand(-0.4, 0.4);
      F.shards.push({ sp, m, v: new THREE.Vector3(Math.cos(a) * 5 + GAME.rand(-1, 1), 6 + Math.random() * 3, -Math.cos(a) * 5 + GAME.rand(-1, 1)), spin: GAME.rand(-8, 8) });
      GAME.scene.add(sp);
    }
    const p = GAME.tmp.set(F.x, y, F.z);
    GAME.spawnParticles(p, 0xff7a2a, 16, 9); GAME.spawnParticles(p, 0x3a3230, 10, 6); GAME.flash(p, 0xff8a3c, 6, 0.25, 2.5, false); GAME.burst(p, 0x2e2826, 8, 2.2, 4, 0.5);
    GAME.SFX.play('pop', p, { rate: 0.55 });
  }
  function updateLossFx(dt) {
    for (let i = lossFx.length - 1; i >= 0; i--) { const F = lossFx[i]; F.t += dt;
      if (!F.shards) {
        const k = Math.min(1, F.t / 0.35), e = 1 - (1 - k) * (1 - k);                       // pops up out of the wreck
        F.spr.position.y = 1.5 + e * 2.5; F.spr.scale.setScalar(F.S * (e + (F.t > 0.35 ? Math.sin((F.t - 0.35) * 40) * 0.04 : 0)));
        if (F.t > 0.45) { const b = Math.min(1, (F.t - 0.45) / 0.7); F.mat.color.setRGB(1 - b * 0.55, 1 - b * 0.75, 1 - b * 0.85);      // smoulders: reddens and darkens
          F.spr.position.x = F.x + GAME.rand(-0.06, 0.06) * b * 2;
          if (Math.random() < dt * 30) GAME.spawnParticles(GAME.tmp.set(F.x + GAME.rand(-1, 1) * F.S * 0.4, F.spr.position.y - F.S * 0.3, F.z + GAME.rand(-0.5, 0.5)), Math.random() < 0.6 ? 0xff9a3c : 0x2a2422, 1, 3); }
        if (F.t > 1.15) lossShatter(F);
        continue; }
      const ft = F.t - 1.15;
      for (const s of F.shards) { s.v.y -= 22 * dt; s.sp.position.addScaledVector(s.v, dt); s.m.rotation += s.spin * dt; s.m.opacity = Math.min(1, Math.max(0, 1.6 - ft / 0.55)); }
      if (ft > 0.9) { for (const s of F.shards) { GAME.scene.remove(s.sp); s.m.map.dispose(); s.m.dispose(); } F.mat.dispose(); lossFx.splice(i, 1); }
    }
  }
  function buildSaws() {
    const n = W_STATS.orbit.n[weapons.orbit - 1] * (GS.ride === 'halo' ? 2 : 1);
    while (saws.length < n) {
      const uni = GS.ride === 'unicorn', m = new THREE.Mesh(uni ? dodecaGeo : sawGeo, uni ? dodecaMats[saws.length % dodecaMats.length] : sawMat); m.scale.setScalar(uni ? 1.1 : 1.4); m.castShadow = true; GAME.scene.add(m);
      if (uni) { saws.push({ m, pos: new THREE.Vector3() }); continue; }
      const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 16), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }), 2.5));
      glowRing.rotation.x = -Math.PI / 2; m.add(glowRing);
      saws.push({ m, pos: new THREE.Vector3() });
    }
  }
  const sawHitPos = new THREE.Vector3();
  function updateSaws(dt) {
    if (!weapons.orbit) return;
    for (const m of GAME.swarm) if (m.sawCd > 0) m.sawCd -= dt;            // per-target cooldowns tick down (they never did: a saw used to hit each monster once)
    for (const e of GAME.enemies) if (e.sawCd > 0) e.sawCd -= dt;
    for (const o of GAME.obstacles) if (o.sawCd > 0) o.sawCd -= dt;
    if (GAME.boss.sawCd > 0) GAME.boss.sawCd -= dt;
    const L = weapons.orbit - 1, S = W_STATS.orbit, on = GAME.car.alive && GAME.car.depth < 0.3;
    sawAngle += S.spd[L] * dt * (GS.ride === 'halo' ? 1.86 : 1);
    saws.forEach((s, i) => {
      const a = sawAngle + i / saws.length * Math.PI * 2;
      s.pos.set(GAME.car.pos.x + Math.sin(a) * S.r[L], 1.0 + GAME.car.y, GAME.car.pos.z + Math.cos(a) * S.r[L]);
      s.m.position.copy(s.pos); s.m.visible = on;
      if (GS.ride === 'unicorn') {                          // dodecahedra: no cutting, every monster they touch (cubes aside) is stunned for half a second
        s.m.rotation.x += dt * 3; s.m.rotation.y += dt * 4; if (!on) return;
        for (const m of GAME.swarm) {
          if (m.dead || m.sawCd > 0) continue;
          const dx = m.pos.x - s.pos.x, dz = m.pos.z - s.pos.z, d = Math.hypot(dx, dz);
          if (d < m.r + 0.75) { m.sawCd = 0.5; GAME.stunCritter(m, 0.5); GAME.spawnParticles(sawHitPos.copy(s.pos).setY(1.6), 0xffe14a, 4, 4); GAME.SFX.play('hit_stone', s.pos, { vol: 0.35, rate: 1.6 }); }
        }
        return;
      }
      s.m.rotation.y += dt * 22;
      if (!on) return;
      for (const e of GAME.enemies) {
        if (e.dead || e.carried || (e.sawCd || 0) > 0) continue;
        const dx = e.pos.x - s.pos.x, dz = e.pos.z - s.pos.z, d = Math.hypot(dx, dz);
        if (d < e.r + 0.65) {
          e.sawCd = 0.35; GAME.hitEnemy(e, sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), S.dmg[L], 7);
          GAME.spawnParticles(sawHitPos.copy(s.pos), 0xff6a5a, 4, 6); GAME.SFX.play('saw', s.pos);
        }
      }
      for (const m of GAME.swarm) {
        if (m.dead || m.sawCd > 0) continue;
        const dx = m.pos.x - s.pos.x, dz = m.pos.z - s.pos.z, d = Math.hypot(dx, dz);
        if (d < m.r + 0.75) {
          m.sawCd = 0.35; GAME.hitCritter(m, S.dmg[L], sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), 6);
          GAME.spawnParticles(sawHitPos.copy(s.pos), m.art.color, 4, 6); GAME.SFX.play('saw', s.pos);
        }
      }
      for (const o of GAME.obstacles) {
        if (!o.crate || !GAME.active(o) || (o.sawCd || 0) > 0) continue;
        const p = o.mesh.position;
        if (Math.abs(s.pos.x - p.x) < o.hx + 0.6 && Math.abs(s.pos.z - p.z) < o.hz + 0.6) {
          o.sawCd = 0.35; GAME.damageCrate(o, S.dmg[L]); GAME.spawnParticles(sawHitPos.copy(s.pos), 0xd2873c, 3, 6); GAME.SFX.play('saw', s.pos);
        }
      }
      if (GAME.boss.state === 'fight' && (GAME.boss.sawCd || 0) <= 0 && Math.hypot(s.pos.x - GAME.BOSS_POS.x, s.pos.z - GAME.BOSS_POS.z) < 4.6) {
        GAME.boss.sawCd = 0.35; GAME.bossDamage(S.dmg[L]); GAME.SFX.play('hit_boss', s.pos);
      }
    });
    for (const e of GAME.enemies) if (e.sawCd > 0) e.sawCd -= dt;
    for (const m of GAME.swarm) if (m.sawCd > 0) m.sawCd -= dt;
    for (const o of GAME.obstacles) if (o.sawCd > 0) o.sawCd -= dt;
    if (GAME.boss.sawCd > 0) GAME.boss.sawCd -= dt;
  }

  // ---- mortar: heavy shell on the densest crowd ----
  let mortarT = 1.5;
  const shells = [];
  const shellGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const shellMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xb48cff }), 4);
  function mortarTarget(R) {
    let best = null, bestScore = 0;
    const pool = GAME.enemies.concat(GAME.swarm);
    for (const e of pool) {
      if (e.dead || e.carried || !e.awake) continue;
      const d = Math.hypot(e.pos.x - GAME.car.pos.x, e.pos.z - GAME.car.pos.z);
      if (d > 32 || d < 3) continue;
      let score = 0;
      for (const o of pool) if (!o.dead && !o.carried && o.awake && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < R) score += o.elite || (o.K && o.K.heavy) ? 2 : 1;
      score -= d * 0.01;
      if (score > bestScore) { bestScore = score; best = e.pos.clone().addScaledVector(e.vel, 0.8); }
    }
    if (GAME.boss.state === 'fight' && Math.hypot(GAME.BOSS_POS.x - GAME.car.pos.x, GAME.BOSS_POS.z - GAME.car.pos.z) < 36 && bestScore < 3) best = GAME.BOSS_POS.clone();
    return best;
  }
  function fireMortar(target, L = weapons.mortar - 1, from, fx = false) {
    if (!from) { from = new THREE.Vector3(); GAME.muzzle.getWorldPosition(from); GAME.netEv({ t: 'wf', k: 'mortar', l: L, x: GAME.r1(target.x), z: GAME.r1(target.z) }); }
    const m = new THREE.Mesh(shellGeo, shellMat); m.position.copy(from); GAME.scene.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.7, depthWrite: false }), 2.5));
    ring.geometry.rotateX(-Math.PI / 2); ring.position.set(target.x, 0.06, target.z); ring.scale.setScalar(W_STATS.mortar.r[L]); GAME.scene.add(ring);
    shells.push({ m, ring, from, to: new THREE.Vector3(target.x, 0, target.z), t: 0, T: 0.85, R: W_STATS.mortar.r[L], dmg: W_STATS.mortar.dmg[L], fx });
    GAME.flash(from, 0xb48cff, 3, 0.15, 3, false); GAME.SFX.play('mortar', from);
  }
  function updateShells(dt) {
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i]; s.t += dt;
      const k = Math.min(1, s.t / s.T);
      s.m.position.lerpVectors(s.from, s.to, k); s.m.position.y = s.from.y * (1 - k) + 9 * Math.sin(Math.PI * k);
      s.m.rotation.x += dt * 8; s.ring.rotation.y += dt * 2; s.ring.material.opacity = 0.35 + 0.45 * k;
      if (k < 1) continue;
      // boom
      GAME.scene.remove(s.m, s.ring); shells.splice(i, 1);
      const p = GAME.tmp.set(s.to.x, 0.6, s.to.z);
      GAME.flash(p, 0xc79bff, s.R * 3.2, 0.4, 4); GAME.burst(p, 0x6a5a7a, 10, 2.6, 7, 0.5);
      GAME.spawnParticles(p, 0xb48cff, 18, 11); GAME.spawnParticles(p, 0x8a8a78, 10, 8);
      GS.shake = Math.max(GS.shake, s.fx ? 0.2 : 0.5); GAME.SFX.play('blast', p);
      if (s.fx) continue;                                // someone else's shell: the bang without the damage
      for (const e of GAME.enemies) {
        if (e.dead || e.carried) continue;
        const dx = e.pos.x - s.to.x, dz = e.pos.z - s.to.z, d = Math.hypot(dx, dz);
        if (d < s.R + e.r * 0.5) GAME.hitEnemy(e, sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), s.dmg * (1 - 0.4 * d / s.R), 16);
      }
      for (const m of GAME.swarm) {
        if (m.dead) continue;
        const dx = m.pos.x - s.to.x, dz = m.pos.z - s.to.z, d = Math.hypot(dx, dz);
        if (d < s.R + m.r * 0.5) GAME.hitCritter(m, s.dmg * (1 - 0.4 * d / s.R), sawHitPos.set(dx / (d || 1), 0, dz / (d || 1)), 12);
      }
      for (const o of GAME.obstacles) if (o.crate && GAME.active(o) && Math.hypot(o.mesh.position.x - s.to.x, o.mesh.position.z - s.to.z) < s.R + 0.5) GAME.damageCrate(o, 99);
      for (const o of GAME.obstacles) if ((o.pillar || o.rock) && GAME.active(o) && Math.hypot(o.mesh.position.x - s.to.x, o.mesh.position.z - s.to.z) < s.R * 0.7) GAME.smashPillar(o, sawHitPos.set(o.mesh.position.x - s.to.x, 0, o.mesh.position.z - s.to.z).normalize().multiplyScalar(14));
      if (GAME.boss.state === 'fight' && Math.hypot(GAME.BOSS_POS.x - s.to.x, GAME.BOSS_POS.z - s.to.z) < s.R + 3.7) GAME.bossDamage(s.dmg * 1.5);
    }
  }

  function updateWeapons(dt) {
    const ready = GAME.car.alive && GAME.car.depth < 0.3;
    if (weapons.nova) { GS.novaT -= dt; if (GS.novaT <= 0 && ready) { if (GAME.threatNear(20)) { GS.novaT = W_STATS.nova.cd[weapons.nova - 1]; if (GS.ride === 'halo') GS.novaT = Math.max(2, GS.novaT) + SWORD_T[weapons.nova - 1]; if (GS.ride === 'halo' || GS.ride === 'unicorn') fireBeams(); else if (GS.ride === 'spider') fireWebs(); else fireNova(); } else GS.novaT = 0.15; } }
    updateSaws(dt);
    updateBeams(dt);
    updateWebs(dt);
    if (weapons.mortar) {
      mortarT -= dt;
      if (mortarT <= 0 && ready) {
        const t = mortarTarget(W_STATS.mortar.r[weapons.mortar - 1]);
        if (t) { mortarT = W_STATS.mortar.cd[weapons.mortar - 1]; fireMortar(t); } else mortarT = 0.3;
      }
    }
    updateShells(dt);
  }

  return { weapons, updateWeaponHUD, dropWeapon, crateDrop, gainWeapon, novaMat, beams, haloHoly, fireBeams, webs, launchWebs, sawMat, sawGeo, saws, dodecaGeo, dodecaMats, deathToll, lossFx, updateLossFx, shells, fireMortar, updateWeapons };
}
