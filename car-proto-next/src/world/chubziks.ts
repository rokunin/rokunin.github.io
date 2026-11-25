// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- chubziks: small blue locals. Monsters hunt them, they hide on rocks, you scoop them into a cart ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { CrewArt } from '../ui/crew.ts';
import { ARENA, SW_KINDS } from '../data/index.js';

export function createChubziks(GAME) {
  const CHUB_FR = 4, CHUB_SIZE = 1.3, CHUB_CAP = 34;
  function drawChub(c, f, scared) {                    // 96 x 96
    const TAU = Math.PI * 2, s = Math.sin(f / CHUB_FR * TAU), bob = Math.abs(s) * 3, ink = '#14233f';
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = ink; c.lineWidth = 4;
    c.fillStyle = '#2b5fd0';
    for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(48 + sd * 12 + sd * s * 4, 88 - Math.max(0, sd * s) * 5, 9, 5, 0, 0, TAU); c.fill(); c.stroke(); }
    for (const pass of [0, 1]) {                       // the tuft
      c.strokeStyle = pass ? '#7fc0ff' : ink; c.lineWidth = pass ? 3.5 : 8;
      for (const dx of [-9, 0, 9]) { c.beginPath(); c.moveTo(48 + dx * 0.4, 32 - bob); c.quadraticCurveTo(48 + dx * 1.1, 16 - bob, 48 + dx * 1.9 + s * 3, 9 - bob + Math.abs(dx) * 0.5); c.stroke(); }
    }
    c.strokeStyle = ink; c.lineWidth = 4;
    c.beginPath(); c.ellipse(48, 58 - bob, 30, 28 + bob * 0.3, 0, 0, TAU); c.fillStyle = '#4f9dff'; c.fill(); c.stroke();
    c.fillStyle = '#c4e2ff'; c.beginPath(); c.ellipse(48, 69 - bob, 17, 12, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,120,170,.55)'; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(48 + sd * 22, 62 - bob, 5, 3, 0, 0, TAU); c.fill(); }
    for (const sd of [-1, 1]) {
      const ex = 48 + sd * 11, ey = 51 - bob, r = scared ? 10.5 : 9;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, r, 0, TAU); c.fill(); c.lineWidth = 3; c.stroke();
      c.fillStyle = ink; c.beginPath(); c.arc(ex + (scared ? 0 : 1.5), ey + 1, scared ? 3 : 5.5, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex - 1.5, ey - 2, 2, 0, TAU); c.fill();
    }
    c.lineWidth = 3;
    if (scared) { c.fillStyle = '#3a0f2a'; c.beginPath(); c.ellipse(48, 68 - bob, 5, 6.5, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#bfefff'; c.beginPath(); c.moveTo(80, 34); c.quadraticCurveTo(87, 46, 80, 48); c.quadraticCurveTo(73, 46, 80, 34); c.fill(); c.lineWidth = 2; c.stroke(); }
    else { c.beginPath(); c.moveTo(41, 65 - bob); c.quadraticCurveTo(48, 72 - bob, 55, 65 - bob); c.stroke(); }
  }
  const chubMats = [false, true].map(sc => Array.from({ length: CHUB_FR }, (_, f) => {
    const cv = GAME.mkCanvas(96), x = cv.getContext('2d'); drawChub(x, f, sc);
    const m = new THREE.SpriteMaterial({ map: GAME.srgbTex(cv), transparent: true, alphaTest: 0.35 }); m.color.setScalar(0.5); return m;
  }));
  const chubs = [];
  GS.chubTick = 0; GS.chubSpawnT = 4; GS.chubEaten = 0;
  const cartNEl = document.getElementById('cartN'), eatNEl = document.getElementById('eatN');
  const chubVulnerable = c => !c.dead && !GAME.angel.on && (c.state === 'roam' || c.state === 'flee' || c.state === 'tocar' || c.state === 'dazed');
  const carOK = () => GAME.car.alive && GAME.car.depth < 0.3 && GAME.car.y < 1;
  function perchSlot(rock) { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * rock.top * 0.62; return new THREE.Vector3(rock.mesh.position.x + Math.cos(a) * d, rock.h, rock.mesh.position.z + Math.sin(a) * d); }
  GS.chubId = 0;
  function spawnChub(rock, perched) {
    const sprite = new THREE.Sprite(chubMats[0][0]); sprite.center.set(0.5, 0.04); GAME.scene.add(sprite);
    const shadow = new THREE.Mesh(GAME.swShadowGeo, GAME.swShadowMat); shadow.scale.set(1, 1, 0.8); GAME.scene.add(shadow);
    const c: any = { sprite, shadow, pos: new THREE.Vector3(), vel: new THREE.Vector3(), state: 'roam', t: 0, think: Math.random() * 0.3, home: rock, rock, phase: Math.random() * 4,
                goal: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), T: 1, arcH: 1, next: 'roam', face: 1, calm: 0, dead: false, threat: 99 };
    if (perched) { c.pos.copy(perchSlot(rock)); c.state = 'perch'; }
    else { const a = Math.random() * 6.283, d = rock.r + 2 + Math.random() * 5; c.pos.set(rock.mesh.position.x + Math.cos(a) * d, 0, rock.mesh.position.z + Math.sin(a) * d); c.goal.copy(c.pos); }
    c.id = ++GS.chubId; chubs.push(c); return c;
  }
  function monsterDist(x, z) {                         // distance to the nearest thing with teeth
    let best = 99;
    for (const m of GAME.swarm) if (!m.dead) { const d = Math.hypot(m.pos.x - x, m.pos.z - z); if (d < best) best = d; }
    for (const e of GAME.enemies) if (!e.dead && e.awake && !e.carried) { const d = Math.hypot(e.pos.x - x, e.pos.z - z); if (d < best) best = d; }
    return best;
  }
  function nearestRock(x, z) { let b = GAME.rocks[0], bd = 1e9; for (const r of GAME.rocks) { const d = Math.hypot(r.mesh.position.x - x, r.mesh.position.z - z); if (d < bd) { bd = d; b = r; } } return b; }
  function groundChubNear(pos, range) { let b = null, bd = range; for (const c of chubs) if (chubVulnerable(c)) { const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z); if (d < bd) { bd = d; b = c; } } return b; }
  function perchedNear(pos, range) { let b = null, bd = range; for (const c of chubs) if (!c.dead && c.state === 'perch') { const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) + Math.random() * 3; if (d < bd) { bd = d; b = c; } } return b; }
  function pickPrey(m, carDist) {                      // a monster weighs the nearest loose chubzik against the car (a loaded cart is tastier)
    const c = groundChubNear(m.pos, 24); if (!c) return null;
    const d = Math.hypot(c.pos.x - m.pos.x, c.pos.z - m.pos.z);
    return !GAME.carSeen() || d < carDist * (cart.riders.length ? 0.8 : 1.4) ? c : null;
  }
  function chubArc(c, to, T, next, h) { c.from.copy(c.pos); c.to.copy(to); c.t = 0; c.T = T; c.arcH = h; c.next = next; c.state = 'arc'; }
  function knockOff(c, vx, vz) {                       // shot off the rock
    const d = Math.hypot(vx, vz) || 1, R = c.rock, a = Math.atan2(vz / d, vx / d) + GAME.rand(-0.5, 0.5);
    GAME.tmp.set(R.mesh.position.x + Math.cos(a) * (R.r + 2.6), 0, R.mesh.position.z + Math.sin(a) * (R.r + 2.6));
    chubArc(c, GAME.tmp, 0.6, 'dazed', 2.2); c.dazeT = 1.0;
    GAME.spawnParticles(c.pos, 0x7fc0ff, 5, 5); GAME.SFX.play('chub', c.pos, { rate: 0.8 });
  }
  function eatChub(c, by) {
    if (c.dead) return;
    c.dead = true; GAME.scene.remove(c.sprite, c.shadow);
    GAME.tmp.set(c.pos.x, c.pos.y + 0.6, c.pos.z);
    GAME.spawnParticles(GAME.tmp, 0x4f9dff, 10, 7); GAME.spawnParticles(GAME.tmp, 0xffffff, 4, 5);
    GAME.SFX.play('chomp', GAME.tmp, { rate: 1.4, vol: 0.7 }); GAME.SFX.play('chub', GAME.tmp, { rate: 0.6 });
    GS.chubEaten++; eatNEl.textContent = GS.chubEaten; if (!GAME.NET.client) GAME.netEv({ t: 'eat', x: GAME.r1(c.pos.x), z: GAME.r1(c.pos.z) });
    if (Math.hypot(c.pos.x - GAME.car.pos.x, c.pos.z - GAME.car.pos.z) < 30) GAME.crewSay('eaten', 0.5);
  }

  // ---- the cart: weightless for the car, but the more passengers the wilder it swings — and a swinging cart sheds them ----
  const CART_L = 2.9;
  const cart = { pos: new THREE.Vector3(0, 0, -5.4), heading: 0, prevH: 0, phi: 0, phiV: 0, riders: [], shown: false, lost: 0, vis: 0, prevX: 0, prevZ: 0 };
  const cartG = new THREE.Group(), cartBody = new THREE.Group(); cartG.add(cartBody); cartG.visible = false; GAME.scene.add(cartG);
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.85, flatShading: true });
    const woodDk = new THREE.MeshStandardMaterial({ color: 0x5e3a1e, roughness: 0.9, flatShading: true });
    const P = (geo, mat, x, y, z, par = cartBody) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    P(new THREE.BoxGeometry(2.0, 0.14, 2.4), woodDk, 0, 0.62, 0);
    for (const x of [-1, 1]) { P(new THREE.BoxGeometry(0.12, 0.6, 2.4), wood, x * 0.98, 0.95, 0); P(new THREE.BoxGeometry(0.16, 0.12, 2.5), GAME.metal, x * 0.98, 1.28, 0); }
    for (const z of [-1, 1]) P(new THREE.BoxGeometry(2.0, 0.6, 0.12), wood, 0, 0.95, z * 1.18);
    P(new THREE.BoxGeometry(0.14, 0.14, 1.7), GAME.metal, 0, 0.55, 1.9);                    // drawbar
    P(new THREE.BoxGeometry(2.5, 0.12, 0.12), GAME.metal, 0, 0.5, 0);                       // axle
    for (const x of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10), GAME.tyreMat); w.rotation.z = Math.PI / 2; w.position.set(x * 1.28, 0.5, 0); w.castShadow = true; cartG.add(w); }
    P(new THREE.BoxGeometry(0.03, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: 0x4f9dff, roughness: 0.9 }), 0.98, 1.75, -1.1);
    P(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), GAME.metal, 0.98, 1.6, -0.86);
  }
  function cartAdd(c) {
    c.state = 'cart'; c.shadow.visible = false; cart.riders.push(c);
    if (!cart.shown) { cart.shown = true; cartReset(); GAME.flashAlert('CHUBZIK ABOARD'); }
    cartNEl.textContent = cart.riders.length;
    GAME.SFX.play('chub', GAME.car.pos, { rate: 1.1 + Math.min(0.6, cart.riders.length * 0.04) }); GAME.SFX.play('pickup', GAME.car.pos, { vol: 0.5 });
    GAME.crewSay('chub', 0.6);
  }
  function cartReset() { const h = GAME.car.heading; cart.pos.set(GAME.car.pos.x - Math.sin(h) * (2.45 + CART_L), 0, GAME.car.pos.z - Math.cos(h) * (2.45 + CART_L)); cart.heading = cart.prevH = h; cart.phi = cart.phiV = 0; }
  const safeKeeps = () => GS.ride === 'buggy' && Math.random() < 0.5;      // the steel churn: only half of knocks and bites get a chubzik
  function safeClang() { GAME.SFX.play('clang', cart.pos, { vol: 0.45, rate: 1.4 }); GAME.spawnParticles(GAME.tmp.set(cart.pos.x, 1.6, cart.pos.z), 0xffd27a, 5, 5); }
  const safeCount = n => { let k = 0; for (let i = 0; i < n; i++) if (!safeKeeps()) k++; if (k < n) safeClang(); return k; };
  let spillT = 0;
  function cartSpill(n) { if (GS.elapsed < spillT || !cart.riders.length) return; spillT = GS.elapsed + 0.6; cartFling(safeCount(n), 0); }   // a hard knock shakes a few out
  function cartFling(n, side) {
    for (let i = 0; i < n && cart.riders.length; i++) {
      const c = cart.riders.pop(), h = cart.heading, s = side || (Math.random() < 0.5 ? -1 : 1), lat = GAME.rand(4, 8) * s, back = GAME.rand(0, 4);
      GAME.tmp.set(cart.pos.x + Math.cos(h) * lat - Math.sin(h) * back, 0, cart.pos.z - Math.sin(h) * lat - Math.cos(h) * back);
      GAME.tmp.x = THREE.MathUtils.clamp(GAME.tmp.x, -ARENA + 3, GAME.inRoom(cart.pos.x, cart.pos.z) ? GAME.ROOM_X2 - 3 : ARENA - 3); GAME.tmp.z = THREE.MathUtils.clamp(GAME.tmp.z, -ARENA + 3, ARENA - 3);
      c.shadow.visible = true; chubArc(c, GAME.tmp, 0.7, 'dazed', 3); c.dazeT = 0.7; cart.lost++;
      GAME.SFX.play('chub', c.pos, { rate: 1.4 });
    }
    cartNEl.textContent = cart.riders.length;
    if (n) GAME.crewSay('lost', 0.6);
  }
  const cartKick = k => { if (cart.shown) cart.phiV += k * (Math.random() < 0.5 ? -1 : 1) * (1 + cart.riders.length * 0.08); };
  function updateCart(dt) {
    if (!cart.shown) return;
    const n = cart.riders.length, h = GAME.car.heading, hx = GAME.car.pos.x - Math.sin(h) * 2.45, hz = GAME.car.pos.z - Math.cos(h) * 2.45;
    let dx = cart.pos.x - hx, dz = cart.pos.z - hz, d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = -Math.sin(h); dz = -Math.cos(h); d = 1; }
    cart.pos.x = hx + dx / d * CART_L; cart.pos.z = hz + dz / d * CART_L;
    cart.heading = Math.atan2(-dx, -dz);
    let dh = cart.heading - cart.prevH; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); cart.prevH = cart.heading;
    const speed = Math.hypot(GAME.car.vel.x, GAME.car.vel.z);
    const lat = THREE.MathUtils.clamp(dh / Math.max(dt, 1e-3) * Math.max(speed, 6), -110, 110);
    // sway: a spring that gets less damped and harder driven as the cart fills up; at speed a full cart fishtails on its own
    const drive = lat * 0.085 * (1 + n * 0.12) + (speed > 12 ? Math.sin(GS.elapsed * 7.3) * n * 0.7 * Math.min(1, (speed - 12) / 12) : 0);
    cart.phiV += (-42 * cart.phi - 5.5 / (1 + n * 0.22) * cart.phiV + drive) * dt;
    cart.phi = THREE.MathUtils.clamp(cart.phi + cart.phiV * dt, -0.75, 0.75);
    const over = Math.abs(cart.phi) - 0.33;
    if (!GAME.car.alive && n) cartFling(n, 0);
    const up = GAME.car.alive && GAME.car.depth < 0.5;
    cartG.visible = up;
    cartG.position.set(cart.pos.x, (GS.ride === 'spider' ? 0 : GAME.car.y * 0.8) - GAME.car.depth * 3, cart.pos.z);   // the cart cannot climb
    { // the spider's bug faces the way it is actually running, a wheeled cart points at its hitch
      const vx = (cart.pos.x - cart.prevX) / Math.max(dt, 1e-3), vz = (cart.pos.z - cart.prevZ) / Math.max(dt, 1e-3); cart.prevX = cart.pos.x; cart.prevZ = cart.pos.z;
      if (Math.hypot(vx, vz) > 2) { const d = Math.atan2(vx, vz) - cart.vis; cart.vis += Math.atan2(Math.sin(d), Math.cos(d)) * (1 - Math.exp(-9 * dt)); }
      cartG.rotation.y = (GS.ride === 'spider' ? cart.vis : cart.heading) + cart.phi * 0.35; }
    cartBody.rotation.z = cart.phi; cartBody.position.y = Math.abs(cart.phi) * 0.25;
    if (GS.safe) { GS.safe.body.rotation.z = cart.phi; GS.safe.body.position.y = Math.abs(cart.phi) * 0.25; }
    // passengers ride in rows of three, stacked when it gets crowded
    const ch = cartG.rotation.y, rx = Math.cos(ch), rz = -Math.sin(ch), fx = Math.sin(ch), fz = Math.cos(ch), cp = Math.cos(cart.phi), sp = Math.sin(cart.phi);
    cart.riders.forEach((c, i) => {
      const lx = (i % 3 - 1) * 0.56, lz = (Math.floor(i / 3) % 3 - 1) * 0.66, ly = 0.2 + Math.floor(i / 9) * 0.5;
      const x2 = lx * cp - ly * sp, y2 = ly * cp + lx * sp;
      c.pos.set(cart.pos.x + rx * x2 + fx * lz, cartG.position.y + 0.68 + y2 + Math.abs(Math.sin(GS.elapsed * 9 + i)) * 0.08 * Math.min(1, speed / 8 + Math.abs(cart.phi) * 3), cart.pos.z + rz * x2 + fz * lz);
      c.sprite.visible = up;
    });
    // anything that catches the cart helps itself
    if (up && n) {
      for (const m of GAME.swarm) if (!m.dead && !m.net && m.cd <= 0 && cart.riders.length && Math.hypot(m.pos.x - cart.pos.x, m.pos.z - cart.pos.z) < 1.7 + m.r) { m.cd = 1; if (safeKeeps()) safeClang(); else eatChub(cart.riders.pop(), m); cartKick(2); }
      for (const e of GAME.enemies) if (!e.dead && e.awake && !e.carried && e.biteCd <= 0 && cart.riders.length && Math.hypot(e.pos.x - cart.pos.x, e.pos.z - cart.pos.z) < 1.7 + e.r) { e.biteCd = 0.8; if (safeKeeps()) safeClang(); else eatChub(cart.riders.pop(), e); cartKick(3); }
      cartNEl.textContent = cart.riders.length;
    }
  }

  // ---- rocks can be flattened: everyone on top tumbles off, and nothing respawns there again ----
  function rockGrow(o) { if (!o || !o.rock || o.mesh.visible) return; o.mesh.visible = true; if (!GAME.rocks.includes(o)) GAME.rocks.push(o); GAME.burst(GAME.tmp.copy(o.mesh.position).setY(0.5), 0x8a7a6a, 8, 3, 6, 0.5); GAME.SFX.play('door', o.mesh.position, { vol: 0.5 }); }
  function rockSmashed(o) {
    const i = GAME.rocks.indexOf(o); if (i >= 0) GAME.rocks.splice(i, 1);
    for (const c of chubs) {
      if (c.dead) continue;
      if (c.rock === o && (c.state === 'perch' || (c.state === 'arc' && c.next === 'perch'))) {
        const a = Math.random() * 6.283; GAME.tmp.set(o.mesh.position.x + Math.cos(a) * (o.r + 3), 0, o.mesh.position.z + Math.sin(a) * (o.r + 3));
        chubArc(c, GAME.tmp, 0.6, 'dazed', 2.5); c.dazeT = 1.2;
      }
      if (c.home === o) c.home = nearestRock(c.pos.x, c.pos.z) || o;
    }
    for (const m of GAME.swarm) if (m.home === o) m.home = null;
    if (!GAME.rocks.length) GAME.flashAlert('NO ROCKS LEFT');
  }

  // ---- altars: three of them, each wants ALTAR_NEED chubziks from the cart. All three lit opens the boss gate ----
  GAME.seedRandom(GAME.SEED + 7);
  const ALTAR_NEED = 5, ALTAR_WAVE = 30, altars = [];
  const altTEl = document.getElementById('altT');
  const ALTAR_ZONE = 11;
  const zoneGeo = (() => { const g = new THREE.RingGeometry(ALTAR_ZONE - 0.35, ALTAR_ZONE, 72, 1); g.rotateX(-Math.PI / 2); const p = g.attributes.position, keep = [];      // dashed ring
    const idx = g.index.array; for (let i = 0; i < idx.length; i += 6) if (Math.floor(i / 6) % 3 !== 2) keep.push(...idx.slice(i, i + 6)); g.setIndex(keep); return g; })();
  GS.gateSpawned = false; GS.altarsDone = 0; GS.gateOpen = false;
  function openGate() { if (GS.gateOpen) return; GS.gateOpen = true; GAME.flashAlert('THE GATE OPENS'); GAME.setDoor(false); GAME.crewSay('gate', 1, true); }
  function gateTick() {                                 // host: all three altars fed -> nine mini-bosses at the gate; it opens when they are dead
    return;                                            // the phases open the gate now (after the loot run)
  }
  const altNEl = document.getElementById('altN');
  {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a4458, roughness: 0.9, flatShading: true });
    for (let k = 0; k < 3; k++) {
      const a = 2.4 + k * 2.094; let x = Math.cos(a) * 112, z = Math.sin(a) * 112;
      for (let t = 0; t < 60; t++) {
        const cx = Math.cos(a) * 112 + GAME.rand(-1, 1) * t * 0.3, cz = Math.sin(a) * 112 + GAME.rand(-1, 1) * t * 0.3;
        if (!GAME.obstacles.some(o => o.mesh.visible && Math.abs(o.mesh.position.x - cx) < o.hx + 6 && Math.abs(o.mesh.position.z - cz) < o.hz + 6)) { x = cx; z = cz; break; }
      }
      const g = new THREE.Group(); g.position.set(x, 0, z); GAME.scene.add(g);
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.1, 0.3, 8), stone); dais.position.y = 0.15; dais.receiveShadow = true; g.add(dais);
      const runes = [];
      for (let i = 0; i < ALTAR_NEED; i++) {
        const ra = i / ALTAR_NEED * 6.283, st = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), stone); st.position.set(Math.cos(ra) * 3.2, 0.8, Math.sin(ra) * 3.2); st.rotation.y = -ra; st.castShadow = true; g.add(st);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0x1c2a3a })); cap.position.set(st.position.x, 1.45, st.position.z); g.add(cap); runes.push(cap);
      }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0x2a4a6a })); crystal.position.y = 3.3; crystal.scale.y = 1.6; g.add(crystal);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.3, 34, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 17; g.add(beam);
      const bar = new THREE.Group(); bar.position.set(x, 6, z); GAME.scene.add(bar);
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.85, depthTest: false })); bg.renderOrder = 10;
      const fg = new THREE.PlaneGeometry(3, 0.26); fg.translate(1.5, 0, 0);
      const fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x5fd0ff, depthTest: false, transparent: true })); fill.position.set(-1.5, 0, 0.01); fill.renderOrder = 11; fill.scale.x = 0.001;
      bar.add(bg, fill);
      const zone = new THREE.Mesh(zoneGeo, GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff7ad8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }), 2));
      zone.position.set(x, 0.07, z); GAME.scene.add(zone);                 // stay inside this ring while the chubziks are being fed in
      altars.push({ zone, x, z, g, runes, crystal, beam, bar, fill, n: 0, pending: 0, done: false, cd: 0, pulse: 0,
                    mesh: { position: new THREE.Vector3(x, 0, z), visible: true }, r: 3, awake: false, spawnT: 0, stopT: 0, approved: false });
    }
  }
  // ---- the first phase is an empty warm-up arena: nests and altars rise out of the ground when scouting starts ----
  const sleepRocks = GAME.rocks.slice(); GS.worldUp = false; const rising = [];
  for (const o of sleepRocks) { o.dormant = true; o.mesh.visible = false; } GAME.rocks.length = 0;
  for (const A of altars) { A.g.visible = A.bar.visible = A.zone.visible = false; A.mesh.visible = false; }
  function worldWake() {                               // everybody, as soon as the phase index says scouting has begun (late joiners too)
    GS.worldUp = true;
    for (const o of sleepRocks) { if (!o.dormant) continue; o.dormant = false; o.mesh.visible = true; if (!GAME.rocks.includes(o)) GAME.rocks.push(o);
      const d = Math.hypot(o.mesh.position.x - GAME.car.pos.x, o.mesh.position.z - GAME.car.pos.z); o.mesh.scale.y = 0.01; rising.push({ g: o.mesh, y: o.h / 2, t: -Math.min(1.2, d / 120), dust: true }); }
    for (const A of altars) { A.g.visible = true; A.mesh.visible = true; A.g.scale.y = 0.01;
      rising.push({ g: A.g, y: 0, t: -Math.min(1.2, Math.hypot(A.x - GAME.car.pos.x, A.z - GAME.car.pos.z) / 120), dust: true, base: true }); }
    GAME.SFX.play('door', null, { vol: 0.7, rate: 0.7 }); GS.shake = Math.max(GS.shake, 0.2);
  }
  function updateRising(dt) {
    for (let i = rising.length - 1; i >= 0; i--) {
      const r = rising[i]; r.t += dt; if (r.t < 0) continue;
      if (r.dust) { r.dust = false; GAME.burst(GAME.tmp.set(r.g.position.x, 0.4, r.g.position.z), 0x8a7a6a, 10, 3.5, 6, 0.6); }
      const k = Math.min(1, r.t / 0.7), e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);      // ease-out with a little overshoot
      r.g.scale.y = Math.max(0.01, e); if (!r.base) r.g.position.y = r.y * r.g.scale.y;
      if (k >= 1) { r.g.scale.y = 1; if (!r.base) r.g.position.y = r.y; rising.splice(i, 1); }
    }
  }
  function altarGuards(A, n) {
    if (GAME.NET.client) { GAME.netEv({ t: 'guards', k: altars.indexOf(A), n }, GAME.NET.hostPeer); return; }
    const kinds = ['gremlin', 'maw', 'stilt', 'gremlin', 'oculon', 'maw', 'jelly', Math.random() < 0.5 ? 'brute' : 'grubber'];
    for (let i = 0; i < n && GAME.swarm.length < GAME.SW_CAP; i++) {
      const a = Math.random() * 6.283, d = 5 + Math.random() * 6;
      const m = GAME.spawnCritter(n > 2 ? kinds[i % kinds.length] : kinds[Math.floor(Math.random() * 5)], A.x + Math.cos(a) * d, A.z + Math.sin(a) * d); m.home = A;
      GAME.tmp.set(m.pos.x, 0.5, m.pos.z); GAME.flash(GAME.tmp, 0xff3a5a, 3, 0.25, 2, false);
    }
  }
  function drawCarBubble(sp, left, mode) {             // mode: 0 = stabbed chubzik, 1 = + question mark, 2 = + thumbs-up
    const cv = GAME.mkCanvas(320, 250), c = cv.getContext('2d'), W = sp, ink = '#1b1421', TAU = Math.PI * 2;
    c.lineJoin = 'round'; c.lineCap = 'round';
    const x0 = left ? 44 : 8, x1 = left ? 312 : 276;
    c.beginPath(); c.moveTo(x0 + 34, 8); c.lineTo(x1 - 34, 8); c.quadraticCurveTo(x1, 8, x1, 42); c.lineTo(x1, 150); c.quadraticCurveTo(x1, 184, x1 - 34, 184); c.lineTo(x0 + 34, 184); c.quadraticCurveTo(x0, 184, x0, 150); c.lineTo(x0, 42); c.quadraticCurveTo(x0, 8, x0 + 34, 8); c.closePath();
    c.fillStyle = '#fffdf4'; c.fill(); c.lineWidth = 8; c.strokeStyle = ink; c.stroke(); c.lineWidth = 3; c.strokeStyle = W.accent; c.stroke();
    c.strokeStyle = ink;
    c.save(); c.translate(mode ? x0 + 82 : (x0 + x1) / 2, 98);                        // the chubzik, belly up, very dead
    c.strokeStyle = ink; c.lineWidth = 8; for (const dx of [-9, 0, 9]) { c.beginPath(); c.moveTo(-34 + dx * 0.3, -16); c.quadraticCurveTo(-56, -14 + dx, -64, 4 + dx * 1.4); c.stroke(); }
    c.strokeStyle = '#7fc0ff'; c.lineWidth = 3.5; for (const dx of [-9, 0, 9]) { c.beginPath(); c.moveTo(-34 + dx * 0.3, -16); c.quadraticCurveTo(-56, -14 + dx, -64, 4 + dx * 1.4); c.stroke(); }
    c.strokeStyle = ink; c.lineWidth = 5;
    c.fillStyle = '#2b5fd0'; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(sd * 22, 46, 10, 6, sd * 0.5, 0, TAU); c.fill(); c.stroke(); }
    c.beginPath(); c.ellipse(0, 10, 46, 38, 0, 0, TAU); c.fillStyle = '#4f9dff'; c.fill(); c.stroke();
    c.fillStyle = '#c4e2ff'; c.beginPath(); c.ellipse(0, 26, 24, 14, 0, 0, TAU); c.fill();
    c.lineWidth = 5; for (const sd of [-1, 1]) { const ex = sd * 17, ey = 2; c.beginPath(); c.moveTo(ex - 7, ey - 7); c.lineTo(ex + 7, ey + 7); c.moveTo(ex + 7, ey - 7); c.lineTo(ex - 7, ey + 7); c.stroke(); }
    c.lineWidth = 4; c.beginPath(); c.moveTo(-10, 24); c.lineTo(10, 24); c.stroke();
    c.fillStyle = '#ff7fa8'; c.beginPath(); c.moveTo(2, 24); c.lineTo(12, 24); c.quadraticCurveTo(13, 38, 7, 38); c.quadraticCurveTo(1, 38, 2, 24); c.fill(); c.lineWidth = 3; c.stroke();
    c.save(); c.translate(14, -22); c.rotate(0.5);                                    // the knife
    c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.lineTo(5, -30); c.lineTo(-5, -30); c.closePath(); c.fillStyle = '#d5d9e2'; c.fill(); c.lineWidth = 4; c.stroke();
    c.beginPath(); c.rect(-13, -37, 26, 8); c.fillStyle = '#8f8a86'; c.fill(); c.stroke();
    c.beginPath(); c.rect(-6, -66, 12, 30); c.fillStyle = '#7a4a26'; c.fill(); c.stroke();
    c.restore(); c.restore();
    if (mode === 1) { c.font = '900 130px Impact, "Arial Black", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 10; c.strokeStyle = ink; c.strokeText('?', x1 - 68, 102); c.fillStyle = '#ffd95a'; c.fillText('?', x1 - 68, 102); }
    if (mode === 2) {
      c.save(); c.translate(x1 - 74, 108); c.rotate(-0.12); c.lineWidth = 5; c.strokeStyle = ink;
      c.beginPath(); c.moveTo(-30, -14); c.lineTo(-24, -52); c.quadraticCurveTo(-20, -68, -6, -64); c.quadraticCurveTo(4, -60, 0, -44); c.lineTo(-4, -14); c.closePath(); c.fillStyle = W.skin; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-34, -16); c.lineTo(30, -16); c.quadraticCurveTo(40, -16, 40, -6); c.lineTo(40, 34); c.quadraticCurveTo(40, 44, 30, 44); c.lineTo(-34, 44); c.closePath(); c.fill(); c.stroke();
      c.lineWidth = 3.5; for (const yy of [-1, 14, 29]) { c.beginPath(); c.moveTo(12, yy); c.lineTo(40, yy); c.stroke(); }
      c.beginPath(); c.rect(-50, -22, 18, 72); c.fillStyle = W.jacket; c.fill(); c.lineWidth = 5; c.stroke();
      c.restore();
    }
    c.save(); c.translate(left ? 46 : 274, 196); sp.head(c, mode); c.restore();
    const m = new THREE.SpriteMaterial({ map: GAME.srgbTex(cv), transparent: true, depthTest: false, depthWrite: false }); m.color.setScalar(0.8); return m;
  }
  function bubbleMats(k) {                             // who is talking depends on the ride
    const girl = who => ({ ...CrewArt.WHO[who], head: (c, mode) => { c.scale(0.6, 0.6); CrewArt.head(c, who, mode === 2 ? 'grin' : mode === 1 ? 'smirk' : 'neutral'); } });
    const chubS = sc => ({ accent: '#4f9dff', skin: '#4f9dff', jacket: '#2b5fd0', head: (c, mode) => { c.translate(-40, -52); c.scale(0.85, 0.85); drawChub(c, 0, sc && mode !== 2); } });
    const grem = v => ({ accent: v ? '#ffb040' : '#9cff3a', skin: v ? '#d9a13a' : '#8fd13a', jacket: '#3a2c22', head: (c) => { c.translate(-44, -62); c.scale(0.7, 0.7); GAME.drawCritter(c, 'gremlin', { seed: 11 + v * 37 + 7, h: SW_KINDS.gremlin.hue[v], eyes: 2, ear: !!v }, 0); } });
    const pair = k === 'spider' ? [chubS(true), chubS(false)] : k === 'halo' ? [girl('jan2'), girl('jan')] : k === 'unicorn' ? [grem(0), grem(1)] : [girl('vee'), girl('roxy')];
    return { q1: drawCarBubble(pair[0], true, 0), q2: drawCarBubble(pair[0], true, 1), ok: drawCarBubble(pair[1], false, 2) };
  }
  const carBub: any = { t: -1, said: 0, altar: null, mats: bubbleMats('buggy') };
  carBub.vee = new THREE.Sprite(carBub.mats.q1); carBub.roxy = new THREE.Sprite(carBub.mats.ok);
  for (const sp of [carBub.vee, carBub.roxy]) { sp.center.set(0.5, 0); sp.visible = false; sp.renderOrder = 30; GAME.scene.add(sp); }

  const altHud = () => { altNEl.textContent = altars.map(A => A.done ? '✔' : A.n + '/' + ALTAR_NEED).join(' · '); };
  const aliveNEl = document.getElementById('aliveN'), unloadBtn = document.getElementById('unload');
  let aliveT = 0; GS.unloadAltar = null;
  function doUnload() { if (GS.unloadAltar && carBub.t < 0) { carBub.t = 0; carBub.altar = GS.unloadAltar; unloadBtn.style.display = 'none'; } unloadBtn.blur(); }
  for (const ev of ['mousedown', 'touchstart', 'pointerdown']) unloadBtn.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'touchstart') { e.preventDefault(); doUnload(); } }, { passive: false });
  unloadBtn.addEventListener('click', e => { e.stopPropagation(); doUnload(); });
  addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.repeat) doUnload(); });
  const unloadV = new THREE.Vector3();
  function altarFeed(c) {                              // a chubzik arrives at the crystal
    const A = c.altar; c.dead = true; GAME.scene.remove(c.sprite, c.shadow);
    A.pending--; A.n++; A.pulse = 1;
    GAME.tmp.set(A.x, 3.3, A.z); GAME.spawnParticles(GAME.tmp, 0x5fd0ff, 14, 8); GAME.flash(GAME.tmp, 0x5fd0ff, 6, 0.3, 3);
    GAME.SFX.play('heal', GAME.tmp, { rate: 0.8 + A.n * 0.12 }); GAME.SFX.play('chub', GAME.tmp, { rate: 0.7 });
    GAME.netEv({ t: 'altar', k: altars.indexOf(A), n: A.n });
    altarApply(A);
  }
  function altarApply(A) {                              // show the progress; wake the altar when it is full (also called for progress made by other players)
    for (let i = 0; i < Math.min(A.n, ALTAR_NEED); i++) A.runes[i].material.color.setHex(0x5fd0ff).multiplyScalar(3);
    A.fill.scale.x = Math.max(0.001, A.n / ALTAR_NEED); altHud();
    if (A.n >= ALTAR_NEED && !A.done) {
      A.done = true; GS.altarsDone++; altHud();
      A.beam.material.color.setHex(0xffc24a); A.beam.material.opacity = 0.45; A.fill.material.color.setHex(0xffc24a);
      GAME.tmp.set(A.x, 2, A.z); GAME.flash(GAME.tmp, 0xffd27a, 30, 0.6, 5); GAME.burst(GAME.tmp, 0xffd27a, 16, 3, 9, 0.5); GS.shake = Math.max(GS.shake, 0.7);
      GAME.SFX.play('boss_roar', GAME.tmp, { rate: 1.6, vol: 0.6 }); GAME.SFX.play('loot', GAME.tmp);
      GAME.flashAlert(GS.altarsDone >= 3 ? 'ALL ALTARS FED' : 'ALTAR AWAKENED ' + GS.altarsDone + '/3'); GAME.crewSay('altar', 1, true);
    }
  }
  function altarNear(A) {                                // distance from the altar to the nearest player who is up
    let d = GAME.car.alive && GAME.car.depth < 0.3 ? Math.hypot(GAME.car.pos.x - A.x, GAME.car.pos.z - A.z) : 1e9;
    if (GAME.NET.on && GAME.NET.game) for (const R of GAME.NET.remotes.values()) if (R.up) d = Math.min(d, Math.hypot(R.pos.x - A.x, R.pos.z - A.z));
    return d;
  }
  function altarWave(A, kind) {                          // kind 1: it just woke up; 2: the timer ran out. The host also spawns the guard
    A.waveAt = GS.elapsed; A.pulse = 1;
    if (!GAME.NET.client) altarGuards(A, Math.round(10 * GAME.waveMul()));
    const near = Math.hypot(GAME.car.pos.x - A.x, GAME.car.pos.z - A.z) < 70;      // only the players around it hear it laugh
    GAME.tmp.set(A.x, 3, A.z);
    if (kind === 1) { if (near) { GAME.SFX.play('laugh', null); GAME.flashAlert('THE ALTAR HUNGERS'); GS.shake = Math.max(GS.shake, 0.5); } GAME.flash(GAME.tmp, 0xff3a5a, 18, 0.5, 4); GAME.burst(GAME.tmp, 0x5a2a4a, 14, 3, 8, 0.5); }
    else { if (near) GAME.SFX.play('laugh', null, { rate: 1.05 }); GAME.flash(GAME.tmp, 0xff3a5a, 14, 0.4, 3); }
  }
  function updateAltars(dt) {
    let offer = null, offerD = 99, timerA = null, timerD = 60;
    for (const A of altars) {
      A.pulse = Math.max(0, A.pulse - dt * 2); A.cd -= dt;
      A.crystal.rotation.y += dt * (A.done ? 3 : 0.8 + A.n * 0.4);
      A.crystal.position.y = 3.3 + Math.sin(GS.elapsed * 2 + A.x) * 0.25;
      const lv = A.done ? 3.2 : 0.35 + A.n / ALTAR_NEED * 1.6 + A.pulse * 2;
      A.crystal.material.color.setRGB(A.done ? lv : lv * 0.25, A.done ? lv * 0.72 : lv * 0.7, A.done ? lv * 0.25 : lv);
      if (!GS.worldUp) { A.bar.visible = A.zone.visible = false; continue; }
      A.bar.quaternion.copy(GAME.camera.quaternion); A.bar.visible = !A.done || A.pulse > 0;
      if (A.done || GAME.PH.i < 2) { A.zone.visible = false; continue; }      // altars sleep until the chubziks hatch
      const dA = Math.hypot(GAME.car.pos.x - A.x, GAME.car.pos.z - A.z), up = GAME.car.alive && GAME.car.depth < 0.3;
      let guards = 0, close = 0;
      for (const m of GAME.swarm) if (!m.dead) { if (m.home === A) guards++; if (Math.hypot(m.pos.x - A.x, m.pos.z - A.z) < 15) close++; }
      for (const e of GAME.enemies) if (!e.dead && e.awake && !e.carried && Math.hypot(e.pos.x - A.x, e.pos.z - A.z) < 15) close++;
      // the altar notices a player: it laughs and calls its guard. In a lobby the host keeps every altar's clock for everyone
      if (!GAME.NET.client) {
        const dP = altarNear(A), k = altars.indexOf(A);
        if (!A.awake && dP < 30) {
          A.awake = true; A.pulse = 1;
          const since = GS.elapsed - (A.waveAt == null ? -999 : A.waveAt);
          if (since < ALTAR_WAVE) { A.spawnT = ALTAR_WAVE - since; GAME.netEv({ t: 'aw', k, s: 1, n: GAME.r1(A.spawnT), w: 0 }); }   // came back before its timer ran out: no fresh wave, no laugh
          else { A.spawnT = ALTAR_WAVE; altarWave(A, 1); GAME.netEv({ t: 'aw', k, s: 1, n: ALTAR_WAVE, w: 1 }); }
        } else if (A.awake && dP > 52) { A.awake = false; GAME.netEv({ t: 'aw', k, s: 0 }); }
        if (A.awake && (A.spawnT -= dt) <= 0) {          // one wave at a time, the next one is on a visible timer
          A.spawnT = ALTAR_WAVE; altarWave(A, 2); GAME.netEv({ t: 'aw', k, s: 1, n: ALTAR_WAVE, w: 2 });
        }
      } else if (A.awake) A.spawnT = Math.max(0, A.spawnT - dt);
      if (A.awake && dA < timerD) { timerA = A; timerD = dA; }
      if (A.awake) A.crystal.material.color.setRGB(guards ? 2.2 + A.pulse * 2 : A.crystal.material.color.r, guards ? 0.25 : A.crystal.material.color.g, guards ? 0.4 : A.crystal.material.color.b);
      // close enough with passengers: offer the unload button over the altar
      A.zone.visible = true; A.zone.rotation.y += dt * 0.15;
      { const inZ = up && dA < ALTAR_ZONE, has = cart.riders.length > 0; A.zone.material.opacity += ((inZ ? 0.9 : has ? 0.5 : 0.16) - A.zone.material.opacity) * Math.min(1, 6 * dt); }
      if (dA > ALTAR_ZONE) A.approved = false;                // drive out of the ring and the sacrifice stops
      else if (!A.approved && up && dA < ALTAR_ZONE && cart.riders.length && carBub.t < 0 && A.n + A.pending < ALTAR_NEED && (!offer || dA < offerD)) { offer = A; offerD = dA; }
      if (!A.approved || A.cd > 0 || !cart.riders.length || !up) continue;
      if (A.n + A.pending >= ALTAR_NEED || dA > ALTAR_ZONE) continue;
      const c = cart.riders.pop(); cartNEl.textContent = cart.riders.length;      // off the cart, up to the crystal
      A.cd = 0.4; A.pending++; c.altar = A;
      GAME.tmp.set(A.x, 3.3, A.z); chubArc(c, GAME.tmp, 0.55, 'sacrifice', 2.5);
      GAME.SFX.play('chub', c.pos, { rate: 1.3 });
    }
    if (timerA) {
      unloadV.set(timerA.x, 9.2, timerA.z).project(GAME.camera);
      altTEl.style.display = 'block'; altTEl.style.left = (unloadV.x * 0.5 + 0.5) * innerWidth + 'px'; altTEl.style.top = Math.max(40, (-unloadV.y * 0.5 + 0.5) * innerHeight) + 'px';
      const sec = Math.ceil(timerA.spawnT); if (altTEl.textContent !== 'next wave ' + sec) altTEl.textContent = 'next wave ' + sec;
      altTEl.classList.toggle('soon', sec <= 5);
    } else altTEl.style.display = 'none';
    GS.unloadAltar = offer;
    if (offer) {
      unloadV.set(offer.x, 7.6, offer.z).project(GAME.camera);
      unloadBtn.style.display = 'block'; unloadBtn.style.left = (unloadV.x * 0.5 + 0.5) * innerWidth + 'px'; unloadBtn.style.top = Math.max(70, (-unloadV.y * 0.5 + 0.5) * innerHeight) + 'px';
    } else unloadBtn.style.display = 'none';
    if ((aliveT -= dt) <= 0) { aliveT = 0.4; let n = 0; for (const c of chubs) if (!c.dead) n++; aliveNEl.textContent = n; }
    // bubbles over the car: Vee holds up a stabbed chubzik and a question mark, Roxy answers with a thumbs-up
    if (carBub.t >= 0) {
      const t = (carBub.t += dt), rx = 0.707, rz = -0.707, y = 3.4 + GAME.car.y;
      const pop = (sp, t0, x) => { const k = THREE.MathUtils.clamp((t - t0) / 0.18, 0, 1), s = k * (1 + 0.25 * Math.sin(k * Math.PI)); sp.visible = t >= t0 && t < 3.6; sp.scale.set(4.6 * s, 3.6 * s, 1); sp.position.set(GAME.car.pos.x + rx * x, y + (x > 0 ? 0.9 : 0), GAME.car.pos.z + rz * x); };
      carBub.vee.material = t < 0.9 ? carBub.mats.q1 : carBub.mats.q2;
      pop(carBub.vee, 0, -2.7); pop(carBub.roxy, 1.8, 2.7);
      if (carBub.said < 1 && t >= 0) { carBub.said = 1; GAME.SFX.play('chub', GAME.car.pos, { rate: 0.55 }); }
      if (carBub.said < 2 && t >= 0.9) { carBub.said = 2; GAME.SFX.play('pickup', GAME.car.pos, { vol: 0.4, rate: 1.5 }); }
      if (carBub.said < 3 && t >= 1.8) { carBub.said = 3; GAME.SFX.play('pickup', GAME.car.pos, { vol: 0.5, rate: 0.8 }); }
      if (t > 2.5 && carBub.altar) { carBub.altar.approved = true; carBub.altar = null; }
      if (t > 3.6 || !GAME.car.alive) { carBub.t = -1; carBub.said = 0; carBub.vee.visible = carBub.roxy.visible = false; if (carBub.altar) carBub.altar = null; }
    }
    gateTick();
    if (!GS.gateOpen && GAME.boss.state === 'idle' && GAME.door.targetY < 0) { GAME.door.targetY = 2.3; }       // sealed until the altars are fed
  }

  return { CHUB_FR, CHUB_SIZE, chubMats, chubs, cartNEl, chubVulnerable, carOK, perchSlot, spawnChub, monsterDist, nearestRock, groundChubNear, perchedNear, pickPrey, chubArc, knockOff, eatChub, cart, cartG, cartBody, cartAdd, cartReset, safeKeeps, safeCount, cartSpill, cartFling, cartKick, updateCart, rockGrow, rockSmashed, ALTAR_NEED, altars, openGate, rising, worldWake, updateRising, altarGuards, bubbleMats, carBub, doUnload, altarFeed, altarApply, altarWave, updateAltars };
}
