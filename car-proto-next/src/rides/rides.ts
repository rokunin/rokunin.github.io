// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- rides: the buggy plus three stranger things on the same chassis logic. Models are built the first time they are picked ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { CrewArt } from '../ui/crew.ts';

export function createRides(GAME) {
  const buggyParts = GAME.body.children.filter(c => c !== GAME.turret && c !== GAME.drill && c !== GAME.arm && c !== GAME.mast && c !== GAME.bullbar);
  const buggyTurret = GAME.turret.children.filter(c => c !== GAME.muzzle);
  const RIDES = { buggy: { turret: [0, 2.04, -0.5] }, spider: { turret: [0, 3.0, 0] }, halo: { turret: [0, 2.0, 0] }, unicorn: { turret: [0, 2.95, -0.75] } };
  const rideG = {};
  GS.ridePhase = 0; GS.ride = 'buggy';
  const hoverShadow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false }));
  hoverShadow.rotation.x = -Math.PI / 2; hoverShadow.visible = false; GAME.carGroup.add(hoverShadow);
  function strut(a, b, w, mat, parent) {               // a box between two points
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, a.distanceTo(b)), mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); m.castShadow = true; parent.add(m); return m;
  }
  function miniEye(r, parent, x, y, z) {               // a little staring eyeball
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.3 })));
    const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1b1421 })); p.position.set(0, 0, r * 0.62); g.add(p);
    g.lookAt(g.position.clone().multiplyScalar(2)); parent.add(g); return g;
  }
  function buildRide(k) {
    const B = new THREE.Group(), T = new THREE.Group(); GAME.body.add(B); GAME.turret.add(T);
    const R = rideG[k] = { body: B, tur: T, anim: () => {} };
    const P = (geo, mat, x, y, z, par = B) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    if (k === 'spider') {
      const shell = new THREE.MeshStandardMaterial({ color: 0x2a2630, metalness: 0.7, roughness: 0.4, flatShading: true });
      const trim = GAME.glow(new THREE.MeshBasicMaterial({ color: 0x2fb8ae }), 1.1);
      P(new THREE.BoxGeometry(2.3, 0.36, 2.3), shell, 0, 0.95, 0);                         // square slab
      for (const x of [-1, 1]) for (const z of [-1, 1]) P(new THREE.BoxGeometry(0.22, 0.1, 0.22), trim, x * 1.0, 1.16, z * 1.0);
      // eight legs on planted feet: a foot stays where it stands until the body has moved too far, then steps (two alternating groups)
      const legRoot = new THREE.Group(); legRoot.position.y = GAME.SPL.bodyH; B.add(legRoot);
      const joint = new THREE.MeshStandardMaterial({ color: 0x8f8a86, metalness: 0.8, roughness: 0.4, flatShading: true });
      const legs = [], RX = [1.75, 2.35, 2.35, 1.85], RZ = [2.0, 0.75, -0.6, -1.85], HZ = [0.9, 0.32, -0.26, -0.84];   // eight legs fanned out like the prototype's, feet well apart
      for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
        const hip = new THREE.Group(); hip.position.set(sd * 1.1, 0, HZ[i]); hip.rotation.order = 'YXZ'; hip.userData.leg = (i % 2 === 0) === (sd < 0) ? 1 : 2; legRoot.add(hip);
        P(new THREE.SphereGeometry(0.13, 6, 5), joint, 0, 0, 0, hip);
        const fem = new THREE.Group(); hip.add(fem); P(new THREE.BoxGeometry(0.17, 0.17, GAME.SPL.L1), shell, 0, 0, GAME.SPL.L1 / 2, fem);
        const knee = new THREE.Group(); knee.position.z = GAME.SPL.L1; fem.add(knee); P(new THREE.SphereGeometry(0.12, 6, 5), joint, 0, 0, 0, knee);
        P(new THREE.BoxGeometry(0.12, 0.12, GAME.SPL.L2), shell, 0, 0, GAME.SPL.L2 / 2, knee);
        P(new THREE.ConeGeometry(0.07, 0.24, 4), trim, 0, 0, GAME.SPL.L2 + 0.06, knee).rotation.x = Math.PI / 2;
        legs.push({ sd, i, hip, fem, knee, rest: new THREE.Vector3(sd * RX[i], -GAME.SPL.bodyH, RZ[i]), foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
                    step: false, t: 0, dur: 0.1, grp: (i % 2 === 0) === (sd < 0) ? 0 : 1, init: false });
      }
      const footTarget = (L, out) => {                   // where this leg wants to stand: straight down from its rest spot, else reach inward for an edge
        GAME.spUp.set(0, 1, 0).applyQuaternion(GAME.carGroup.quaternion);
        GAME.spO.copy(L.rest); GAME.spO.y += GAME.SPL.bodyH + 0.9; legRoot.localToWorld(GAME.spO);
        GAME.spO.addScaledVector(GAME.SPD.vel, 0.04);
        GAME.spDn.copy(GAME.spUp).negate();
        if (GAME.spCast(GAME.spO, GAME.spDn, GAME.SPL.bodyH + 0.9 + 1.3, out)) return;
        legRoot.getWorldPosition(GAME.spC); GAME.spIn.copy(GAME.spC).sub(GAME.spO); GAME.spIn.addScaledVector(GAME.spUp, -GAME.spIn.dot(GAME.spUp)).normalize();
        GAME.spDn.copy(GAME.spUp).negate().addScaledVector(GAME.spIn, 0.9).normalize();
        if (GAME.spCast(GAME.spO, GAME.spDn, 3.6, out)) return;
        out.copy(GAME.spO).addScaledVector(GAME.spUp, -(GAME.SPL.bodyH + 0.9));
      };
      const legIK = L => {
        GAME.spF.copy(L.foot); legRoot.worldToLocal(GAME.spF); GAME.spF.sub(L.hip.position);
        L.hip.rotation.y = Math.atan2(GAME.spF.x, GAME.spF.z);
        const h = Math.hypot(GAME.spF.x, GAME.spF.z), v = GAME.spF.y, l1 = GAME.SPL.L1, l2 = GAME.SPL.L2;
        const d = THREE.MathUtils.clamp(Math.hypot(h, v), 0.3, l1 + l2 - 0.001);
        const a = Math.atan2(v, h), alpha = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
        const inner = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
        L.fem.rotation.x = -(a + alpha); L.knee.rotation.x = Math.PI - inner;
      };
      R.feet = legs;
      R.pose = () => { GAME.carGroup.updateMatrixWorld(true); for (const L of legs) { GAME.spA.copy(L.rest); legRoot.localToWorld(GAME.spA); L.foot.copy(GAME.spA); legIK(L); } };   // standing pose for copies
      const pyr = new THREE.Group(); pyr.position.y = 1.95; B.add(pyr);
      const pg = new THREE.CylinderGeometry(0.5, 1.15, 1.35, 4, 1).toNonIndexed(); pg.rotateY(Math.PI / 4);
      { const q = pg.attributes.position, seen = {};               // knock the corners about so it reads as hand-cut
        for (let i = 0; i < q.count; i++) { const key = q.getX(i).toFixed(2) + q.getY(i).toFixed(2) + q.getZ(i).toFixed(2); const j = seen[key] || (seen[key] = [GAME.rand(-0.14, 0.14), GAME.rand(-0.1, 0.1), GAME.rand(-0.14, 0.14)]); q.setXYZ(i, q.getX(i) + j[0], q.getY(i) + j[1], q.getZ(i) + j[2]); }
        pg.computeVertexNormals(); }
      pyr.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x3a9ab0, transparent: true, opacity: 0.42, roughness: 0.6, metalness: 0, envMap: GS.ENV, envMapIntensity: 0.2, flatShading: true, depthWrite: false, side: THREE.DoubleSide })));
      pyr.add(new THREE.LineSegments(new THREE.EdgesGeometry(pg, 1), GAME.glow(new THREE.LineBasicMaterial({ color: 0x9af5ff }), 1.2)));
      const pilots = [-1, 1].map(sd => { const s = new THREE.Sprite(GAME.chubMats[0][0]); s.center.set(0.5, 0.05); s.scale.set(0.8, 0.8, 1); s.position.set(sd * 0.3, -0.62, 0); s.renderOrder = -1; pyr.add(s); return s; });
      // the eye: a flat burning oval with a slit pupil, scowling
      const eyeMat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float t; varying vec3 vP;
          void main(){ float a = acos(clamp(vP.z, -1.0, 1.0)), ang = atan(vP.y, vP.x);
            float fl = 0.5 + 0.5 * sin(ang * 9.0 + t * 5.0 + sin(a * 14.0 - t * 8.0) * 2.0);
            vec3 fire = mix(vec3(1.0, 0.75, 0.1), vec3(1.0, 0.12, 0.0), smoothstep(0.15, 1.0, a + fl * 0.25));
            vec3 col = mix(fire * (1.3 + 0.5 * fl), vec3(0.25, 0.02, 0.0), smoothstep(0.9, 1.5, a));
            float slit = smoothstep(0.1, 0.05, abs(vP.x) / max(0.15, 1.0 - vP.y * vP.y * 1.2)) * step(0.0, vP.z) * smoothstep(0.92, 0.7, abs(vP.y));
            col = mix(col, vec3(0.0), slit);
            gl_FragColor = vec4(col * 0.42, 1.0); }` });
      const eyeG = new THREE.Group(); T.add(eyeG);
      const eyeBall = P(new THREE.SphereGeometry(0.62, 20, 14), eyeMat, 0, 0, 0, eyeG); eyeBall.scale.set(1.55, 0.78, 0.7);
      const brow = P(new THREE.BoxGeometry(2.15, 0.09, 0.5), shell, 0, 0.63, 0.3, eyeG); brow.rotation.set(0.5, 0, -0.2);      // one long brow, pressed down hard
      let spdS = 0;
      R.anim = (dt, sp) => {
        spdS += ((car.airborne ? 0 : GAME.SPD.vel.length()) - spdS) * Math.min(1, 8 * dt);
        const k = Math.min(1, spdS / 12);
        legRoot.position.y = GAME.SPL.bodyH - 0.08 * k + Math.sin(GS.ridePhase * 5) * 0.04 * k;
        GAME.carGroup.updateMatrixWorld(true);
        GAME.spBoxes.length = 0;                              // climbable boxes near enough for a foot to land on
        for (const o of GAME.obstacles) if (GAME.climbable(o) && Math.abs(o.mesh.position.x - car.pos.x) < o.hx + 6 && Math.abs(o.mesh.position.z - car.pos.z) < o.hz + 6) GAME.spBoxes.push(o);
        const stepping = [false, false]; for (const L of legs) if (L.step) stepping[L.grp] = true;
        const thr = 0.45 + spdS * 0.02, dur = THREE.MathUtils.clamp(0.14 - spdS * 0.004, 0.045, 0.14), tuck = car.airborne || car.depth > 0.3;
        for (const L of legs) {
          if (tuck) {                                    // in the air: legs hang, slightly drawn in
            L.step = false; L.init = false;
            GAME.spA.copy(L.rest); GAME.spA.y = -0.45; GAME.spA.x *= 0.85; legRoot.localToWorld(GAME.spA); L.foot.lerp(GAME.spA, Math.min(1, 10 * dt));
          } else {
            footTarget(L, GAME.spT);
            if (!L.init) { L.from.copy(L.foot.lengthSq() ? L.foot : GAME.spT); L.to.copy(GAME.spT); L.step = true; L.t = 0; L.dur = 0.1; L.init = true; stepping[L.grp] = true; }
            if (L.step) {
              L.t += dt / L.dur; const t = Math.min(1, L.t), e = t * t * (3 - 2 * t);
              L.foot.lerpVectors(L.from, L.to, e).addScaledVector(GAME.SPD.n, Math.sin(Math.PI * t) * (0.32 + 0.012 * spdS));
              if (t >= 1) { L.step = false; L.foot.copy(L.to); if (spdS > 1.5) GAME.SFX.play('tick', L.foot, { vol: 0.45 + Math.random() * 0.3, rate: 0.85 + Math.random() * 0.35 }); if (spdS > 6 && Math.random() < 0.3) GAME.puff(L.foot, 0xd8d6d0, 0.5, 0.5, GAME.rand(-0.5, 0.5), GAME.rand(0.3, 0.8), GAME.rand(-0.5, 0.5), 0.3); }
            } else {
              const d = L.foot.distanceTo(GAME.spT);
              if ((d > thr && !stepping[1 - L.grp]) || d > thr * 2.4) { L.step = true; L.t = 0; L.dur = dur * (0.85 + Math.random() * 0.3); L.from.copy(L.foot); L.to.copy(GAME.spT); stepping[L.grp] = true; }
            }
          }
          legIK(L);
        }
        pyr.position.y = 1.95 + Math.sin(GS.elapsed * 2) * 0.08; pyr.rotation.y = Math.sin(GS.elapsed * 0.7) * 0.2;
        pilots.forEach((s, i) => { s.material = GAME.chubMats[car.hp < car.maxHp * 0.4 ? 1 : 0][Math.floor(GS.elapsed * 3 + i * 2) % GAME.CHUB_FR]; });
        eyeMat.uniforms.t.value = GS.elapsed; eyeG.position.y = Math.sin(GS.elapsed * 2.6) * 0.07;
      };
    } else if (k === 'halo') {
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8d28a, metalness: 0.9, roughness: 0.25, envMap: GS.ENV, envMapIntensity: 1.6, flatShading: true });
      const core = new THREE.Group(); core.position.y = 2.0; B.add(core);
      const t1 = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.2, 6, 20), gold), t2 = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.17, 6, 18), gold); t1.userData.spin = 1; t2.userData.spin = 2;
      t1.castShadow = t2.castShadow = true; core.add(t1, t2);
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; miniEye(0.15, t1, Math.cos(a) * 1.95, Math.sin(a) * 1.95, 0); if (i % 2) miniEye(0.13, t1, Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0.2).rotation.set(0, 0, 0); }
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.3; miniEye(0.13, t2, Math.cos(a) * 1.49, Math.sin(a) * 1.49, 0); }
      const cv = GAME.mkCanvas(256), c = cv.getContext('2d');                               // the apprentice: one body, a face for each direction
      c.lineJoin = 'round'; c.strokeStyle = '#1b1421'; c.lineWidth = 6;
      c.beginPath(); c.moveTo(84, 150); c.lineTo(172, 150); c.lineTo(206, 252); c.lineTo(50, 252); c.closePath(); c.fillStyle = '#f4f1e8'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(128, 150); c.lineTo(128, 252); c.stroke(); c.fillStyle = '#ffd95a'; c.beginPath(); c.rect(70, 196, 116, 12); c.fill(); c.stroke();
      for (const [x, rot, who, ex] of [[84, -0.2, 'jan', 'grin'], [172, 0.2, 'jan2', 'smirk']]) {
        c.save(); c.translate(x, 96); c.rotate(rot); c.scale(0.92, 0.92); CrewArt.head(c, who, ex); c.restore();
        c.lineWidth = 5; c.strokeStyle = '#ffd95a'; c.beginPath(); c.ellipse(x + rot * 30, 22, 30, 9, rot, 0, 6.283); c.stroke(); c.strokeStyle = '#1b1421';
      }
      const jm = new THREE.SpriteMaterial({ map: GAME.srgbTex(cv), transparent: true, alphaTest: 0.3 }); jm.color.setScalar(0.55);
      const jan = new THREE.Sprite(jm); jan.scale.set(2.1, 2.1, 1); core.add(jan);
      P(new THREE.ConeGeometry(0.22, 1.5, 5), gold, 0, 0, 2.3, T).rotation.x = Math.PI / 2;      // a floating gilded spike does the shooting
      P(new THREE.TorusGeometry(0.4, 0.06, 5, 14), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffd95a }), 2.4), 0, 0, 1.75, T);
      R.anim = (dt, sp) => {
        core.position.y = 2.0 + Math.sin(GS.elapsed * 2.2) * 0.16;
        t1.rotation.y += dt * (1.2 + sp * 0.12); t1.rotation.x = Math.sin(GS.elapsed * 0.8) * 0.5;
        t2.rotation.x += dt * (1.7 + sp * 0.15); t2.rotation.z = Math.cos(GS.elapsed * 0.9) * 0.5;
      };
    } else if (k === 'unicorn') {
      const white = new THREE.MeshStandardMaterial({ color: 0xf2eef6, roughness: 0.6, flatShading: true }), gold = new THREE.MeshStandardMaterial({ color: 0xf0b428, metalness: 0.8, roughness: 0.3, flatShading: true });
      const pink = new THREE.MeshStandardMaterial({ color: 0xff8fc8, roughness: 0.7 }), blk = new THREE.MeshBasicMaterial({ color: 0x1b1421 });
      const rain = [0xff4a5a, 0xff9a3a, 0xffe14a, 0x5fd36a, 0x4f9dff, 0xb06cff].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, flatShading: true }));
      const tor = new THREE.Group(); B.add(tor);
      P(new THREE.BoxGeometry(1.5, 1.25, 2.7), white, 0, 1.75, -0.1, tor);
      P(new THREE.BoxGeometry(0.75, 1.0, 0.75), white, 0, 2.5, 1.25, tor).rotation.x = 0.35;                 // neck
      const head = new THREE.Group(); head.position.set(0, 3.0, 1.75); tor.add(head);
      P(new THREE.BoxGeometry(0.95, 0.95, 1.15), white, 0, 0, 0.1, head); P(new THREE.BoxGeometry(0.8, 0.55, 0.5), pink, 0, -0.2, 0.75, head);
      P(new THREE.ConeGeometry(0.16, 1.0, 5), gold, 0, 0.9, 0.35, head).rotation.x = 0.35;
      for (const sd of [-1, 1]) { P(new THREE.BoxGeometry(0.06, 0.24, 0.24), blk, sd * 0.49, 0.1, 0.25, head); P(new THREE.BoxGeometry(0.2, 0.34, 0.14), white, sd * 0.3, 0.6, -0.3, head); P(new THREE.BoxGeometry(0.1, 0.1, 0.06), blk, sd * 0.18, -0.2, 1.01, head); }
      rain.forEach((m, i) => { P(new THREE.BoxGeometry(0.3, 0.34, 0.32), m, 0, 3.1 - i * 0.2, 1.1 - i * 0.3, tor); });   // mane
      const tail = rain.map((m, i) => P(new THREE.BoxGeometry(0.26, 0.26, 0.34), m, 0, 2.15 - i * 0.18, -1.55 - i * 0.24, tor));
      const legs = [[-0.5, 0.95], [0.5, 0.95], [-0.5, -1.15], [0.5, -1.15]].map(([x, z], i) => {
        const g = new THREE.Group(); g.position.set(x, 1.2, z); g.userData.uleg = (i === 0 || i === 3) ? 1 : 2; B.add(g);
        P(new THREE.BoxGeometry(0.4, 0.95, 0.4), white, 0, -0.45, 0, g); P(new THREE.BoxGeometry(0.44, 0.26, 0.44), gold, 0, -1.07, 0, g);
        return { g, ph: (i === 0 || i === 3) ? 0 : Math.PI };
      });
      const riders = [0, 1].map(i => {                 // two gremlins in the saddle
        const s = new THREE.Sprite(GAME.SW_ART.gremlin[i].walk[0]); s.center.set(0.5, 0.08); s.scale.set(1.5, 1.5, 1); s.position.set(0, 2.3, 0.45 - i * 1.15); B.add(s); return s;
      });
      P(new THREE.BoxGeometry(0.3, 0.3, 0.5), GAME.dark, 0, 0, 0.1, T);
      P(new THREE.CylinderGeometry(0.07, 0.09, 1.3, 6), GAME.dark, 0, 0.05, 0.95, T).rotation.x = Math.PI / 2;
      R.anim = (dt, sp) => {
        const k = Math.min(1, sp / 5), a = GS.ridePhase * 2.4, beat = Math.floor(a / Math.PI);
        if (beat !== R.beat) { R.beat = beat;
          if (sp > 1.5 && car.alive && !car.airborne && car.depth === 0) {       // two hooves land almost together: ta-dam, ta-dam
            const v = Math.min(1, 0.35 + sp / 30); GAME.SFX.play('hoof', car.pos, { vol: v, rate: 0.9 + Math.random() * 0.2 }); GAME.SFX.play('hoof', car.pos, { vol: v * 0.8, rate: 1.05 + Math.random() * 0.2, delay: 0.07 });
            if (sp > 7) GAME.puff(GAME.tmp.set(car.pos.x - Math.sin(car.heading) * 1.1, 0.25, car.pos.z - Math.cos(car.heading) * 1.1), 0xa8977c, 0.8, 0.7, GAME.rand(-0.5, 0.5), GAME.rand(0.4, 1), GAME.rand(-0.5, 0.5), 0.22, 2.2);
          } }
        for (const L of legs) L.g.rotation.x = Math.sin(a + L.ph) * 0.7 * k;
        tor.position.y = Math.abs(Math.sin(a)) * 0.14 * k; head.rotation.x = Math.sin(a * 2) * 0.06 * k;
        tail.forEach((m, i) => { m.position.x = Math.sin(GS.elapsed * 5 + i * 0.7) * 0.08 * i; });
        riders.forEach((s, i) => { s.material = GAME.SW_ART.gremlin[i].walk[Math.floor(GS.elapsed * 4 + i) % GAME.SW_FRAMES]; s.position.y = 2.3 + tor.position.y + Math.abs(Math.sin(a + i)) * 0.1 * k; });
      };
    }
  }
  GS.safe = null;
  function buildSafe() {                               // the buggy's cart: a yellow steel milk-churn safe with the top sawn off, on a two-wheel trailer
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); GAME.cartG.add(g);
    const yel = new THREE.MeshStandardMaterial({ color: 0xf2b51c, metalness: 0.55, roughness: 0.42, flatShading: true });
    const yelDk = new THREE.MeshStandardMaterial({ color: 0xb98410, metalness: 0.6, roughness: 0.5, flatShading: true });
    const inside = new THREE.MeshStandardMaterial({ color: 0x3a3430, metalness: 0.5, roughness: 0.8, side: THREE.BackSide, flatShading: true });
    const cut = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, metalness: 1, roughness: 0.18, flatShading: true });
    const blk = new THREE.MeshStandardMaterial({ color: 0x1e1c22, metalness: 0.5, roughness: 0.5, flatShading: true });
    const P = (geo, mat, x, y, z, par = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    P(new THREE.BoxGeometry(1.9, 0.12, 1.9), blk, 0, 0.56, 0);                                        // trailer plate
    P(new THREE.BoxGeometry(0.14, 0.14, 1.6), GAME.metal, 0, 0.55, 1.75);                                  // drawbar
    P(new THREE.BoxGeometry(2.5, 0.12, 0.12), GAME.metal, 0, 0.5, 0, g);                                   // axle
    for (const x of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), GAME.tyreMat); w.rotation.z = Math.PI / 2; w.position.set(x * 1.28, 0.5, 0); w.castShadow = true; g.add(w);
      P(new THREE.BoxGeometry(0.34, 0.08, 1.0), blk, x * 1.28, 1.04, 0, g); }                       // mudguards
    P(new THREE.CylinderGeometry(1.0, 1.08, 0.9, 20, 1, true), yel, 0, 1.08, 0);                      // the churn, open at the top
    P(new THREE.CylinderGeometry(0.96, 1.04, 0.88, 20, 1, true), inside, 0, 1.09, 0);                 // dark inner wall
    P(new THREE.CylinderGeometry(1.06, 1.06, 0.06, 20), blk, 0, 0.65, 0);                             // floor
    for (const y of [0.78, 1.32]) { const r = P(new THREE.TorusGeometry(y < 1 ? 1.08 : 1.01, 0.06, 5, 22), yelDk, 0, y, 0); r.rotation.x = Math.PI / 2;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = y < 1 ? 1.13 : 1.06; P(new THREE.SphereGeometry(0.045, 5, 4), GAME.metal, Math.cos(a) * rr, y, Math.sin(a) * rr); } }
    const rim = P(new THREE.TorusGeometry(0.99, 0.035, 4, 24), cut, 0, 1.53, 0); rim.rotation.x = Math.PI / 2;   // fresh saw cut, bright steel
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3, t = P(new THREE.ConeGeometry(0.07, 0.14 + (i % 3) * 0.05, 3), cut, Math.cos(a) * 0.99, 1.58, Math.sin(a) * 0.99); t.rotation.z = (i % 2 ? 0.3 : -0.3); }   // jagged burrs
    const door = P(new THREE.BoxGeometry(0.08, 0.5, 0.62), yelDk, 1.06, 1.06, 0.05);                  // safe door on the right flank
    const dial = P(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 14), blk, 1.12, 1.1, 0.12); dial.rotation.z = Math.PI / 2;
    const dr = P(new THREE.TorusGeometry(0.15, 0.025, 4, 14), cut, 1.15, 1.1, 0.12); dr.rotation.y = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const sp = P(new THREE.BoxGeometry(0.06, 0.04, 0.14), cut, 1.12, 1.1, 0.12); sp.rotation.x = i * Math.PI / 3; sp.position.x = 1.17; }   // handle spokes
    for (const z of [-0.2, 0.3]) P(new THREE.BoxGeometry(0.06, 0.12, 0.1), GAME.metal, 1.1, 0.88 + (z > 0 ? 0.36 : 0), -0.24);   // hinges
    door.userData.safe = true;
    GS.safe = { g, body };
  }
  let cloud = null;
  function buildCloud() {                              // the halo's cart: a little cloud for the chubziks to ride on, no wheels, no hitch
    const g = new THREE.Group(); GAME.cartG.add(g);
    const fluff = new THREE.MeshStandardMaterial({ color: 0x9aa3c4, emissive: 0x2a3050, emissiveIntensity: 0.3, roughness: 1, flatShading: true });
    const puffs = [[0, 0.3, 0, 1.0], [-0.95, 0.3, 0.3, 0.72], [0.95, 0.32, -0.25, 0.75], [0.1, 0.3, 1.05, 0.7], [-0.15, 0.3, -1.05, 0.72], [-0.7, 0.25, -0.75, 0.55], [0.75, 0.25, 0.75, 0.55], [0, 0.15, 0, 1.35]].map(([x, y, z, r], i) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), fluff); m.position.set(x, y, z); m.scale.y = i === 7 ? 0.3 : 0.55; m.castShadow = true; g.add(m); return m; });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 5, 24), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffe07a }), 2.2)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
    cloud = { g, puffs };
  }
  const cartFor = c => (bug && c === bug.g) ? 'spider' : (cloud && c === cloud.g) ? 'halo' : (GS.safe && c === GS.safe.g) ? 'buggy' : null;      // which ride a cart model belongs to (null: the wooden cart, the unicorn's)
  let bug = null, bugPhase = 0; const bugPrev = new THREE.Vector3();
  function buildBug() {                                // the spider's cart: a smaller bug trotting behind on its own, no hitch
    const g = new THREE.Group(); GAME.cartG.add(g);
    const shell = new THREE.MeshStandardMaterial({ color: 0x2a2630, metalness: 0.7, roughness: 0.4, flatShading: true });
    const trim = GAME.glow(new THREE.MeshBasicMaterial({ color: 0x2fb8ae }), 1.1);
    const P = (geo, mat, x, y, z, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    P(new THREE.BoxGeometry(2.0, 0.28, 2.3), shell, 0, 0.6, 0);
    for (const x of [-1, 1]) { P(new THREE.BoxGeometry(0.1, 0.34, 2.3), shell, x * 0.98, 0.9, 0); for (const z of [-1, 1]) P(new THREE.BoxGeometry(0.18, 0.1, 0.18), trim, x * 0.9, 1.1, z * 1.05); }
    for (const z of [-1, 1]) P(new THREE.BoxGeometry(2.0, 0.34, 0.1), shell, 0, 0.9, z * 1.13);
    const eye = P(new THREE.SphereGeometry(0.26, 10, 8), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 1.6), 0, 0.75, 1.3); eye.scale.set(1.5, 0.75, 0.7);
    P(new THREE.BoxGeometry(0.9, 0.1, 0.34), shell, 0, 0.95, 1.36).rotation.set(0.5, 0, -0.2);
    const legs = [];
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const lg = new THREE.Group(); lg.position.set(sd * 0.95, 0.6, (i - 1) * 0.8); g.add(lg);
      const yaw = (i - 1) * 0.6, knee = new THREE.Vector3(sd * 0.6 * Math.cos(yaw), 0.5, 0.6 * Math.sin(yaw)), foot = new THREE.Vector3(sd * 1.05 * Math.cos(yaw), -0.6, 1.05 * Math.sin(yaw));
      strut(new THREE.Vector3(), knee, 0.12, shell, lg); strut(knee, foot, 0.09, shell, lg);
      legs.push({ lg, ph: (i + (sd > 0 ? 0 : 1)) * Math.PI });
    }
    bug = { g, legs };
  }
  function setRide(k) {
    GS.ride = k; GS.abDirty = true; const b = k === 'buggy';
    buggyParts.forEach(m => m.visible = b); buggyTurret.forEach(m => m.visible = b);
    GAME.wheels.forEach(w => w.pivot.visible = b); GAME.bullbar.scale.setScalar(b ? 1 : 0.001);
    if (!b && !rideG[k]) buildRide(k);
    for (const n in rideG) rideG[n].body.visible = rideG[n].tur.visible = n === k;
    GAME.turret.position.set(...RIDES[k].turret); GAME.muzzle.position.set(0, k === 'spider' ? 0 : 0.2, k === 'halo' ? 3.1 : k === 'spider' ? 0.7 : 2.1);
    hoverShadow.visible = k === 'halo';
    car.maxHp = k === 'spider' ? 50 : 100; car.hp = car.maxHp;      // the spider is quick and fragile
    if (k === 'spider' && !bug) buildBug();
    if (k === 'halo' && !cloud) buildCloud();
    if (k === 'buggy' && !GS.safe) buildSafe();
    for (const c of GAME.cartG.children) c.visible = cartFor(c) ? cartFor(c) === k : k === 'unicorn';
    GAME.carBub.mats = GAME.bubbleMats(k); GAME.carBub.vee.material = GAME.carBub.mats.q1; GAME.carBub.roxy.material = GAME.carBub.mats.ok;
    try { localStorage.setItem('carproto.ride', k); } catch (e) {}
  }
  // a copy of a ride's real model (and its cart) for showing the other players
  function rideClone(k) {
    const g = new THREE.Group(), bd = new THREE.Group(), tur = new THREE.Group(); g.add(bd); bd.add(tur); tur.position.set(...RIDES[k].turret);
    const take = (src, par) => { const c = src.clone(); c.visible = true; par.add(c); return c; };
    if (k === 'buggy') {
      for (const m of buggyParts) take(m, bd); for (const m of buggyTurret) take(m, tur); take(GAME.bullbar, bd).scale.setScalar(1);
      for (const w of GAME.wheels) take(w.pivot, g);
    } else {
      if (!rideG[k]) { buildRide(k); rideG[k].body.visible = rideG[k].tur.visible = GS.ride === k; }
      if (k === 'spider' && GS.ride !== 'spider' && rideG[k].pose) { const q = GAME.carGroup.quaternion.clone(); GAME.carGroup.quaternion.identity(); rideG[k].pose(); GAME.carGroup.quaternion.copy(q); }
      take(rideG[k].body, bd); take(rideG[k].tur, tur);
    }
    const cartM = new THREE.Group();
    if (k === 'spider' && !bug) { buildBug(); bug.g.visible = GS.ride === 'spider'; }
    if (k === 'halo' && !cloud) { buildCloud(); cloud.g.visible = GS.ride === 'halo'; }
    if (k === 'buggy' && !GS.safe) { buildSafe(); GS.safe.g.visible = GS.ride === 'buggy'; }
    for (const c of GAME.cartG.children) if (cartFor(c) ? cartFor(c) === k : k === 'unicorn') take(c, cartM);
    const anim = [];                                     // moving parts of the copy: spider legs, unicorn legs, halo rings
    g.traverse(o => { const u = o.userData; if (u.leg) { const fem = o.children.find(c => c.isGroup); anim.push({ t: 'leg', o, fem, grp: u.leg - 1, by: o.rotation.y, bx: fem ? fem.rotation.x : 0 }); }
      else if (u.uleg) anim.push({ t: 'uleg', o, grp: u.uleg - 1 }); else if (u.spin) anim.push({ t: 'spin', o, k: u.spin }); });
    return { g, tur, cart: cartM, anim };
  }
  // the unicorn's horn: gallop into something head-on and it gets gored and thrown
  const hornV = new THREE.Vector3();
  function updateHorn() {
    const sp = Math.hypot(car.vel.x, car.vel.z); if (!car.alive || car.depth > 0.3 || sp < 7) return;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), dmg = sp > 18 ? 6 : 4;
    const gore = (t, r, y) => {
      const dx = t.pos.x - car.pos.x, dz = t.pos.z - car.pos.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d > car.radius + r + 1.3 || (dx * fx + dz * fz) / d < 0.55 || Math.abs(y - car.y) > 3.2 || (t.hornT || 0) > GS.elapsed) return false;
      t.hornT = GS.elapsed + 0.45; hornV.set(fx, 0, fz);
      GAME.tmp.set(car.pos.x + fx * 2.4, 2.6, car.pos.z + fz * 2.4); GAME.spawnParticles(GAME.tmp, 0xf0b428, 5, 7); GAME.flash(GAME.tmp, 0xffd95a, 2.2, 0.14, 2, false); GAME.SFX.play('hit_flesh', GAME.tmp, { rate: 0.8 }); GS.shake = Math.max(GS.shake, 0.2);
      return true;
    };
    for (const m of GAME.swarm) if (!m.dead && gore(m, m.r, m.K.fly || 0)) GAME.hitCritter(m, dmg, hornV, 12);
    for (const e of GAME.enemies) if (!e.dead && !e.carried && e.awake && gore(e, e.r, 0)) GAME.hitEnemy(e, hornV, dmg, 8);
  }
  function updateRide(dt) {
    const sp = Math.hypot(car.vel.x, car.vel.z); GS.ridePhase += sp * dt * 0.45;
    if (rideG[GS.ride]) rideG[GS.ride].anim(dt, sp);
    if (hoverShadow.visible) hoverShadow.position.y = 0.04 - GAME.carGroup.position.y;
    if (GS.ride === 'halo' && cloud) {                      // the cloud bobs, leans with the sway and breathes
      cloud.g.position.y = 0.12 + Math.sin(GS.elapsed * 2) * 0.08; cloud.g.rotation.z = GAME.cart.phi * 0.6;
      cloud.puffs.forEach((m, i) => { if (i < 7) m.scale.x = m.scale.z = 1 + Math.sin(GS.elapsed * 1.7 + i * 1.3) * 0.06; });
    }
    if (GS.ride === 'spider' && bug) {                      // the bug sways and tips exactly like the cart it replaces
      bugPhase += Math.hypot(GAME.cart.pos.x - bugPrev.x, GAME.cart.pos.z - bugPrev.z) * 1.6; bugPrev.copy(GAME.cart.pos);
      bug.g.rotation.z = GAME.cartBody.rotation.z; bug.g.position.y = GAME.cartBody.position.y + Math.abs(Math.sin(bugPhase)) * 0.05;
      for (const L of bug.legs) { L.lg.rotation.y = Math.sin(bugPhase + L.ph) * 0.45; L.lg.position.y = 0.6 + Math.max(0, Math.cos(bugPhase + L.ph)) * 0.16; }
    }
  }

  const car = {
    pos: new THREE.Vector3(0, 0, 0),
    vel: new THREE.Vector3(),
    heading: 0,          // radians, 0 = +Z
    speed: 0,            // engine speed along heading
    steer: 0,
    radius: 1.6,
    hp: 100, maxHp: 100, alive: true, deadTimer: 0, lastHurt: -10,
    burrow: 'up', depth: 0, burrowCd: 0,
    y: 0, vy: 0, airborne: false,
    mode: 'human',         // human — крутится на месте на A/D; cursor — сама разворачивается к курсору; car — машинная физика руля
  };

  return { RIDES, rideG, strut, setRide, rideClone, updateHorn, updateRide, car };
}
