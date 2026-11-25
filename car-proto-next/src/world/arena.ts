// ---------- стены (твёрдые) + комната босса за восточной стеной ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { scaleUV, worldUV } from '../textures/uv.ts';
import { wetGround } from '../textures/wet.ts';
import { CrewArt, createCrew } from '../ui/crew.ts';
import { ARENA } from '../data/index.js';

export function createArena(GAME) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc4c0b8, map: GAME.blockTex.map, roughnessMap: GAME.blockTex.rough, normalMap: GAME.blockTex.normal, roughness: 1 });
  const roomWallMat = new THREE.MeshStandardMaterial({ color: 0x8a6aa8, map: GAME.blockTex.map, roughnessMap: GAME.blockTex.rough, normalMap: GAME.blockTex.normal, roughness: 0.8, metalness: 0.2 });
  const ROOM_X1 = ARENA, ROOM_X2 = ARENA + 64, ROOM_HZ = 34, GATE_HZ = 8;
  const BOSS_POS = new THREE.Vector3((ROOM_X1 + ROOM_X2) / 2, 0, 0), LAIR_POS = BOSS_POS.clone();      // BOSS_POS is where the Pyramidon is NOW: it leaves the lair at half health
  const inRoom = (x, z) => x > ROOM_X1 && x < ROOM_X2 && Math.abs(z) < ROOM_HZ;
  const inWorld = (x, z) => (Math.abs(x) <= ARENA && Math.abs(z) <= ARENA) || inRoom(x, z);
  function addWall(x, z, w, d, h = 2.5, mat = wallMat) {
    const m = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d), 4, { x, y: h / 2, z }), mat);
    m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; GAME.scene.add(m);
    const o = { mesh: m, hx: w / 2, hz: d / 2, h, solid: true, crate: false, wall: true };
    GAME.obstacles.push(o); return o;
  }
  addWall(0, ARENA, ARENA * 2 + 2, 2); addWall(0, -ARENA, ARENA * 2 + 2, 2); addWall(-ARENA, 0, 2, ARENA * 2 + 2);
  {
    const len = ARENA + 1 - GATE_HZ, c = GATE_HZ + len / 2;  // восточная стена с проёмом под ворота
    addWall(ARENA, c, 2, len); addWall(ARENA, -c, 2, len);
  }
  addWall(BOSS_POS.x, ROOM_HZ, ROOM_X2 - ROOM_X1 + 2, 2, 3.5, roomWallMat);
  addWall(BOSS_POS.x, -ROOM_HZ, ROOM_X2 - ROOM_X1 + 2, 2, 3.5, roomWallMat);
  addWall(ROOM_X2, 0, 2, ROOM_HZ * 2 + 2, 3.5, roomWallMat);
  const runeTex = (() => {                            // summoning circle under the boss, used as an emissive map
    const RW = ROOM_X2 - ROOM_X1, RH = ROOM_HZ * 2, c = GAME.mkCanvas(1024), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024);
    x.translate(512, 512); x.scale(1024 / RW, 1024 / RH);
    x.strokeStyle = '#ff4fb0'; x.shadowColor = '#ff2a9a'; x.shadowBlur = 14; x.lineCap = 'round';
    const ring = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); };
    ring(8.2, 0.28); ring(9, 0.12); ring(16, 0.22); ring(25, 0.3); ring(26, 0.1);
    x.lineWidth = 0.16;
    for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, r0 = i % 3 ? 16.6 : 16, r1 = i % 3 ? 17.6 : 19;
      x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); x.stroke(); }
    for (let k = 0; k < 2; k++) {                      // two squares = eight-pointed star
      x.lineWidth = 0.18; x.beginPath();
      for (let i = 0; i <= 4; i++) { const a = k * Math.PI / 4 + i * Math.PI / 2; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 16, Math.sin(a) * 16); }
      x.stroke();
    }
    for (let i = 0; i < 8; i++) {                      // small pyramids on the outer ring
      const a = i / 8 * Math.PI * 2 + Math.PI / 8; x.save(); x.translate(Math.cos(a) * 21, Math.sin(a) * 21); x.rotate(a + Math.PI / 2);
      x.lineWidth = 0.14; x.beginPath(); x.moveTo(-1.3, 1); x.lineTo(1.3, 1); x.lineTo(0.6, -1); x.lineTo(-0.6, -1); x.closePath(); x.stroke(); x.restore();
    }
    return GAME.srgbTex(c);
  })();
  const roomFloorMat = wetGround(new THREE.MeshStandardMaterial({ color: 0xb49ad8, map: GAME.groundTex.map,
    roughnessMap: GAME.groundTex.rough, normalMap: GAME.groundTex.normal, roughness: 0.8, metalness: 1, envMap: GS.ENV, envMapIntensity: 1.5 }), 0.293);
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  GS.runeLevel = 0.7;
  {
    const floor = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(ROOM_X2 - ROOM_X1, ROOM_HZ * 2), 4, 4.25), roomFloorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(BOSS_POS.x, 0.012, 0); floor.receiveShadow = true; GAME.scene.add(floor);
    const runes = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_X2 - ROOM_X1, ROOM_HZ * 2), runeMat);
    runes.rotation.x = -Math.PI / 2; runes.position.set(BOSS_POS.x, 0.035, 0); GAME.scene.add(runes);
    const roomLight = new THREE.PointLight(0xd040a0, 0.85 * GAME.LIGHT, 70, 1.5); roomLight.position.set(BOSS_POS.x, 12, 0); GAME.scene.add(roomLight);
  }
  // buttress posts with pyramid caps along every wall (instanced)
  {
    const mk = (list, h, mat) => {
      const posts = new THREE.InstancedMesh(worldUV(new THREE.BoxGeometry(2.3, h, 1.3), 4, { x: 0, y: h / 2, z: 0 }), mat, list.length);
      const capG = new THREE.ConeGeometry(1.25, 0.9, 4); capG.rotateY(Math.PI / 4); capG.scale(1.3, 1, 0.74);
      const caps = new THREE.InstancedMesh(capG, mat, list.length), dummy = new THREE.Object3D();
      list.forEach(([x, z, rot], i) => {
        dummy.position.set(x, h / 2, z); dummy.rotation.set(0, rot, 0); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
        dummy.position.y = h + 0.45; dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
      });
      posts.castShadow = caps.castShadow = posts.receiveShadow = true; GAME.scene.add(posts, caps);
    };
    const arena = [], room = [];
    for (let t = -ARENA; t <= ARENA; t += 12) {
      arena.push([-ARENA, t, 0], [t, ARENA, Math.PI / 2], [t, -ARENA, Math.PI / 2]);
      if (Math.abs(t) > GATE_HZ + 6) arena.push([ARENA, t, 0]);
    }
    for (let x = ROOM_X1 + 8; x <= ROOM_X2; x += 8) room.push([x, ROOM_HZ, Math.PI / 2], [x, -ROOM_HZ, Math.PI / 2]);
    for (let z = -ROOM_HZ + 8.5; z < ROOM_HZ; z += 8.5) room.push([ROOM_X2, z, 0]);
    const postMat = new THREE.MeshStandardMaterial({ color: 0xa8a6a2, map: GAME.blockTex.map, roughnessMap: GAME.blockTex.rough, normalMap: GAME.blockTex.normal, roughness: 1, flatShading: true });
    mk(arena, 3.4, postMat); mk(room, 4.5, new THREE.MeshStandardMaterial({ color: 0x7a5a98, map: GAME.blockTex.map, roughnessMap: GAME.blockTex.rough, normalMap: GAME.blockTex.normal, roughness: 0.7, metalness: 0.3, flatShading: true }));
  }
  // backdrop: faceted boulders outside the walls and pebbles inside (visual only)
  {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5e5862, roughness: 0.95, flatShading: true });
    const N = 170, rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, N), dummy = new THREE.Object3D();
    let i = 0, guard = 0;
    while (i < N && guard++ < 4000) {
      const x = (Math.random() * 2 - 1) * (ARENA + 46), z = (Math.random() * 2 - 1) * (ARENA + 46);
      if (Math.abs(x) < ARENA + 5 && Math.abs(z) < ARENA + 5) continue;                       // not in the arena
      if (x > ARENA - 6 && Math.abs(z) < ROOM_HZ + 7) continue;                               // not in or around the boss room
      const sc = 2 + Math.random() * 5;
      dummy.position.set(x, sc * 0.25, z); dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      dummy.scale.set(sc * (0.8 + Math.random() * 0.6), sc * (0.6 + Math.random() * 0.9), sc * (0.8 + Math.random() * 0.6));
      dummy.updateMatrix(); rocks.setMatrixAt(i++, dummy.matrix);
    }
    rocks.count = i; rocks.castShadow = rocks.receiveShadow = true; GAME.scene.add(rocks);
    const P = 600, pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8c8580, roughness: 0.95, flatShading: true }), P);
    for (let k = 0; k < P; k++) {
      const sc = 0.12 + Math.random() * 0.2;
      dummy.position.set((Math.random() * 2 - 1) * (ARENA - 3), sc * 0.25, (Math.random() * 2 - 1) * (ARENA - 3));
      dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); dummy.scale.set(sc * 1.3, sc * 0.7, sc);
      dummy.updateMatrix(); pebbles.setMatrixAt(k, dummy.matrix);
    }
    pebbles.receiveShadow = true; GAME.scene.add(pebbles);
  }
  // ворота: столбы, перемычка с надписью, луч, опускающаяся дверь
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x2a2333, roughness: 0.45, metalness: 0.6 });
  const gateGlow = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff40b0 }), 5);
  [-1, 1].forEach(sd => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(2.6, 7, 2.4), gateMat);
    post.position.set(ARENA, 3.5, sd * (GATE_HZ + 1.2)); post.castShadow = true; GAME.scene.add(post);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.7, 5.5, 0.3), gateGlow);
    strip.position.set(ARENA, 3.2, sd * (GATE_HZ + 0.05)); GAME.scene.add(strip);
  });
  {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, GATE_HZ * 2 + 4.8), gateMat);
    lintel.position.set(ARENA, 7.6, 0); lintel.castShadow = true; GAME.scene.add(lintel);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#1b1422'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#ff5ab0'; x.font = '900 86px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('BOSS', 256, 68);
    const signMat = GAME.glow(new THREE.MeshBasicMaterial({ map: GAME.srgbTex(c) }), 3.5);
    [-1, 1].forEach(sd => {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.4), signMat);
      sign.position.set(ARENA + sd * 1.32, 7.6, 0); sign.rotation.y = sd * Math.PI / 2; GAME.scene.add(sign);
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4, 40, 16, 1, true),
      GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff5ab0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 0.9));
    beam.position.set(ARENA, 20, 0); GAME.scene.add(beam);
  }
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.6, GATE_HZ * 2),
    new THREE.MeshStandardMaterial({ color: 0x3b2a4a, emissive: 0x5a1050, roughness: 0.4, metalness: 0.7 }));
  doorMesh.position.set(ARENA, -2.5, 0); doorMesh.castShadow = true; GAME.scene.add(doorMesh);
  const door = { mesh: doorMesh, hx: 0.8, hz: GATE_HZ, h: 4.6, solid: true, crate: false, wall: true, disabled: true, targetY: -2.5 };
  GAME.obstacles.push(door);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xb4b8c2, map: GAME.concreteTex.map, roughnessMap: GAME.concreteTex.rough, normalMap: GAME.concreteTex.normal, roughness: 1, flatShading: true });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, map: GAME.crateTex.map, roughnessMap: GAME.crateTex.rough, normalMap: GAME.crateTex.normal, roughness: 1 });
  const crateHitMat = new THREE.MeshStandardMaterial({ color: 0xf2d2b0, map: GAME.crateTex.map, normalMap: GAME.crateTex.normal, emissive: 0x3a200c, roughness: 0.8 });
  // World generation draws from worldRnd, never from Math.random (ADR-0009): Three.js takes Math.random for every object's id, so a shared stream
  // moved rocks and nests whenever code or the Three version changed the number of objects built. Outside generation worldRnd is Math.random.
  GS.worldRnd = Math.random;
  const rand = (a, b) => a + GS.worldRnd() * (b - a);
  // the map is generated from the UTC date, so everyone who opens the page on the same day gets the same pillars, rocks, crates and altars
  const SEED = (() => { const d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); })();
  const trueRandom = Math.random;
  function seedRandom(s0) { let s = s0 >>> 0; GS.worldRnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function freeSpot(r, minDist = 14) {
    for (let i = 0; i < 80; i++) {
      const x = rand(-ARENA + 6, ARENA - 6), z = rand(-ARENA + 6, ARENA - 6);
      if (Math.hypot(x - GAME.car.pos.x, z - GAME.car.pos.z) < minDist) continue;
      if (GAME.obstacles.some(o => o.mesh.visible && Math.abs(o.mesh.position.x - x) < o.hx + r + 1 && Math.abs(o.mesh.position.z - z) < o.hz + r + 1)) continue;
      return [x, z];
    }
    return [rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6)];
  }

  const rocks = [];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a705e, roughness: 0.95, flatShading: true });
  function addRock(x, z) {                             // flat-topped outcrop: refuge for the chubziks, solid for everyone else
    const r = rand(2.7, 3.6), h = rand(2.2, 2.8), sd = rand(0, 6);
    const geo = new THREE.CylinderGeometry(r * 0.8, r, h, 8, 1), q = geo.attributes.position;
    for (let i = 0; i < q.count; i++) { const a = Math.atan2(q.getZ(i), q.getX(i)), k = 1 + 0.12 * Math.sin(a * 3 + sd) + 0.06 * Math.sin(a * 5 - sd); q.setX(i, q.getX(i) * k); q.setZ(i, q.getZ(i) * k); }
    geo.computeVertexNormals();
    const g = new THREE.Group(); g.position.set(x, h / 2, z); g.add(new THREE.Mesh(geo, rockMat));
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.5, 0.9), 0), rockMat), a = rand(0, 6.283); b.position.set(Math.cos(a) * r * 1.05, -h / 2 + 0.3, Math.sin(a) * r * 1.05); b.rotation.set(rand(0, 6), rand(0, 6), 0); g.add(b); }
    g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    GAME.scene.add(g);
    const o = { mesh: g, hx: r * 0.8, hz: r * 0.8, h, solid: true, crate: false, rock: true, r, top: r * 0.8 };
    GAME.obstacles.push(o); rocks.push(o);
  }
  function addPillar(x, z) {                           // broken monolith: plinth, tapered shaft with a sheared top, rubble
    const w = rand(2, 4), d = rand(2, 4), h = rand(3, 7);
    const g = new THREE.Group(); g.position.set(x, h / 2, z);
    const geo = new THREE.BoxGeometry(w * 0.92, h, d * 0.92), q = geo.attributes.position;
    const shear = [rand(-0.9, 0.3), rand(-0.9, 0.3), rand(-0.9, 0.3), rand(-0.9, 0.3)].map(v => v * Math.min(1, h / 5));
    for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) {
      const c = (q.getX(i) > 0 ? 2 : 0) + (q.getZ(i) > 0 ? 1 : 0);
      q.setXYZ(i, q.getX(i) * 0.8, q.getY(i) + shear[c], q.getZ(i) * 0.8);
    }
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(worldUV(geo, 4, { x, y: h / 2, z }), pillarMat));
    const plinth = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, 0.55, d), 4, { x, y: 0.275, z }), pillarMat); plinth.position.y = -h / 2 + 0.275; g.add(plinth);
    const band = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w * 0.9, 0.3, d * 0.9), 4, { x, y: h * 0.62, z }), pillarMat); band.position.y = -h / 2 + h * 0.62; g.add(band);
    for (let i = 0; i < 4; i++) {                      // rubble, no collision
      const r = rand(0.22, 0.5), a = rand(0, Math.PI * 2), dist = Math.max(w, d) * 0.5 + rand(0.5, 1.3);
      const rock = new THREE.Mesh(new THREE.TetrahedronGeometry(r, 0), pillarMat);
      rock.position.set(Math.cos(a) * dist, -h / 2 + r * 0.35, Math.sin(a) * dist); rock.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      g.add(rock);
    }
    g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    GAME.scene.add(g);
    GAME.obstacles.push({ mesh: g, hx: w / 2, hz: d / 2, h, solid: true, crate: false, pillar: true });
  }
  function addCrate() {
    const s = rand(1.6, 2.4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    const o = { mesh: m, hx: s / 2, hz: s / 2, h: s, solid: true, crate: true, hp: 3, flash: 0 };
    const [x, z] = freeSpot(s);
    m.position.set(x, s / 2, z); m.rotation.y = 0;
    m.castShadow = m.receiveShadow = true; GAME.scene.add(m);
    GAME.obstacles.push(o);
    return o;
  }

  const { crew, crewSay, crewKill } = createCrew();      // src/ui/crew.ts (CrewArt too)

  return { ROOM_X1, ROOM_X2, ROOM_HZ, GATE_HZ, BOSS_POS, LAIR_POS, inRoom, inWorld, runeMat, doorMesh, door, pillarMat, crateMat, crateHitMat, rand, SEED, trueRandom, seedRandom, freeSpot, rocks, rockMat, addRock, addPillar, addCrate, crew, crewSay, crewKill };
}
