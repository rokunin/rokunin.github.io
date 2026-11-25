// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- abilities & loot ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from './state.ts';
import { ARENA, W_GEAR, RIDE_KIT, RIDE_ACTIVE, LOOT, SHOP } from '../data/index.js';

export function createLoot(GAME) {
  const abilities = { drill: false, burrow: false, grab: false, jump: true, doubleJump: false, bomb: false, decoy: false, cubes: false, trail: false };
  // every ride has its own kit; the specials sit on Shift, the drill runs by itself
  const kit = () => RIDE_KIT[GS.ride] || RIDE_KIT.buggy;
  const kitDone = () => kit().every(t => abilities[t]);
  const abLv = { drill: 0, burrow: 0, grab: 0, jump: 0, doubleJump: 0, bomb: 0, decoy: 0, cubes: 0, trail: 0 };      // upgrades spent on each, 0..AB_LV_MAX
  // Loot: coins level the ride's skills, crystals level the guns and buy the level's ultimates. Coins pour out of everything that breaks or dies, with no ceiling.
  // Crystals are rare: bosses and log machines drop them, and the shop turns coins into them at a steep rate (SHOP.conv).
  let lootSfxT = 0; GS.lootId = 0; GS.coins = 0; GS.gems = 0; const loot = [], ult = { sword: 0, hands: 0 };
  const coinGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.16, 18); coinGeo.rotateX(Math.PI / 2);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc62e, metalness: 0.85, roughness: 0.28, emissive: 0x7a4a00 });
  const gemGeo = new THREE.OctahedronGeometry(0.62); gemGeo.scale(1, 1.5, 1);
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x5cecff, metalness: 0.2, roughness: 0.15, emissive: 0x1a8fb5, flatShading: true });
  function addLoot(id, gem, x, z, vx, vy, vz) {
    const m = new THREE.Mesh(gem ? gemGeo : coinGeo, gem ? gemMat : coinMat); m.castShadow = true; m.position.set(x, 0.8, z); GAME.scene.add(m);
    loot.push({ id, gem, x, y: 0.8, z, vx, vy, vz, m, t: 0, spin: Math.random() * 6 });
  }
  function dropCoins(at, nc, ng) {                           // host: scatter nc coins and ng crystals
    if (GAME.NET.client || (GAME.inRoom(at.x, at.z) && !GS.gateOpen)) return;
    const a = [], wide = Math.min(4, (nc + ng) * 0.12);
    for (let i = 0; i < nc + ng; i++) { const an = Math.random() * 6.283, sp = 2.5 + Math.random() * (3.5 + wide), id = ++GS.lootId, q = [id, i < nc ? 0 : 1, GAME.r1(at.x), GAME.r1(at.z), GAME.r1(Math.cos(an) * sp), GAME.r1(7 + Math.random() * 4), GAME.r1(Math.sin(an) * sp)];
      addLoot(id, q[1], q[2], q[3], q[4], q[5], q[6]); a.push(q); }
    if (a.length) { GAME.netEv({ t: 'loot', a }); GAME.SFX.play('loot', at, { vol: 0.5, rate: 1.4 }); }
    while (loot.length > LOOT.max) { const L = loot[0]; GAME.netEv({ t: 'lootx', i: L.id }); lootRemove(L); }      // the oldest pieces go when the field is full of them
  }
  function lootRemove(L) { const i = loot.indexOf(L); if (i >= 0) { GAME.scene.remove(L.m); loot.splice(i, 1); } }
  function lootFrom(kind, x, z) {                            // what each source is worth; a client's own crate or evil cube asks the host
    if (GAME.NET.client) { GAME.netEv({ t: 'lootreq', k: kind, x: GAME.r1(x), z: GAME.r1(z) }, GAME.NET.hostPeer); return; }
    const at = GAME.tmp.set(x, 0, z).clone(), r = Math.random();
    if (kind === 'mob') { if (r < 0.3) dropCoins(at, r < 0.1 ? 2 : 1, 0); }                  // plain biters: a coin now and then
    else if (kind === 'tough') dropCoins(at, 3, 0);                                         // spitters, flappers
    else if (kind === 'brute') dropCoins(at, 6 + Math.floor(r * 3), 0);
    else if (kind === 'crate') dropCoins(at, 3 + Math.floor(r * 3), 0);
    else if (kind === 'enemy') dropCoins(at, 4, 0);
    else if (kind === 'elite') dropCoins(at, 8, 0);
    else if (kind === 'mini') dropCoins(at, 20, 3);
    else if (kind === 'wb') dropCoins(at, 10, r < 0.5 ? 3 : 0);
    else if (kind === 'rig') dropCoins(at, 30, 15);
    else if (kind === 'boss') dropCoins(at, 60, 20);
  }
  function updateLoot(dt) {
    if (GAME.startEl.isConnected) return;
    for (let i = loot.length - 1; i >= 0; i--) { const L = loot[i]; L.t += dt;
      if (L.t > LOOT.life) { lootRemove(L); continue; } if (L.t > LOOT.life - 5) L.m.visible = Math.sin(L.t * 22) > -0.3;      // nobody came for it: it blinks and goes
      if (L.y > 0.8 || L.vy > 0) { L.vy -= 26 * dt; L.x += L.vx * dt; L.z += L.vz * dt; L.y += L.vy * dt;
        if (L.y <= 0.8) { L.y = 0.8; if (L.vy < -4) { L.vy = -L.vy * 0.4; L.vx *= 0.6; L.vz *= 0.6; } else { L.vy = 0; L.vx = L.vz = 0; } }
        const q = GAME.tmp.set(L.x, 0, L.z); for (const o of GAME.obstacles) if (GAME.active(o)) GAME.pushOutOfBox(q, 0.9, o);                      // never lands inside a rock: every piece can be reached
        if (GAME.inRoom(q.x, q.z)) { L.x = q.x; L.z = q.z; } else { L.x = THREE.MathUtils.clamp(q.x, -ARENA + 2, ARENA - 2); L.z = THREE.MathUtils.clamp(q.z, -ARENA + 2, ARENA - 2); } }
      const d = Math.hypot(GAME.car.pos.x - L.x, GAME.car.pos.z - L.z);
      if (GAME.car.alive && L.t > 0.45 && d < LOOT.pull && d > 0.01) { const k = Math.min(1, (LOOT.pullV[0] + (LOOT.pullV[1] - LOOT.pullV[0]) * (1 - d / LOOT.pull)) * dt / d); L.x += (GAME.car.pos.x - L.x) * k; L.z += (GAME.car.pos.z - L.z) * k; }      // a strong magnet: no circling over the pile
      L.m.position.set(L.x, L.y + (L.vy === 0 ? Math.sin(GS.elapsed * 3 + L.id) * 0.15 : 0), L.z); L.m.rotation.y = L.spin + GS.elapsed * (L.gem ? 2.2 : 4.5);
      if (GAME.car.alive && L.t > 0.45 && d < 1.9) {
        GAME.spawnParticles(GAME.tmp.set(L.x, 1, L.z), L.gem ? 0x8ff4ff : 0xffd65a, 5, 5); GAME.scene.remove(L.m); loot.splice(i, 1);
        if (GAME.NET.client) GAME.netEv({ t: 'lootget', i: L.id }, GAME.NET.hostPeer); else { lootGain(L.gem); GAME.netEv({ t: 'lootx', i: L.id }); } }      // the host decides who got it: one piece, one owner
    }
  }
  function lootGain(gem) { if (gem) GS.gems++; else GS.coins++; GS.abSig = '';
    if (GS.elapsed - lootSfxT > 0.045) { lootSfxT = GS.elapsed; GAME.SFX.play('pickup', null, { vol: 0.3, rate: gem ? 1.9 : 1.55 + Math.random() * 0.2 }); } }      // a handful at once must not be a wall of sound
  const abPrice = t => LOOT.abCost[abLv[t]], wPrice = k => LOOT.wCost[(GAME.weapons[k] - 1) >> 1];
  const AB_LV_MAX = 2, UP_MAX = 6, abMax = t => t === 'jump' ? 3 : AB_LV_MAX;      // the jump has three levels: it is the one skill every ride has, and each ride's does its own thing                         // ~6 upgrades a run against 12 possible levels (3 skills + 3 guns, 2 each): you pick a build
  GS.upGot = 0; GS.upPts = 0;
  const UP_TEXT = { drill: ['spins longer', 'wider and meaner'], burrow: ['harder to dig out', 'surfacing knocks everyone back'], grab: ['throws hit twice as hard', 'throws x3, loot flies to you'],
                    doubleJump: ['a third jump', 'air jumps blast below'], bomb: ['bigger dome, 3 s', 'huge dome, 4 s'],
                    decoy: ['two decoys at once', 'three decoys at once'], cubes: ['five cubes', 'cubes swell up and burst'], trail: ['the trail lasts longer', 'the trail slows them too'] };
  const JUMP_UP = { buggy: ['landing wave stuns the shooters', 'the wave halves the small fry, stuns 2 s', 'the wave kills the small fry, stuns bosses'],
                    spider: ['landing scatters spiderlings that slow', 'more spiderlings, longer slow', 'the spiderlings blow up'],
                    halo: ['light spikes where you land', 'more spikes, they last longer', 'a field of tall spikes'],
                    unicorn: ['a small star ring on landing', 'more stars, further', 'a full starburst'] };
  const upText = t => t === 'jump' ? JUMP_UP[GS.ride] : UP_TEXT[t];
  const AB_INFO = {
    drill:      { title: 'Drill',            key: 'auto',  hint: 'spins up by itself between nova pulses, grinds a 180° arc ahead', bg: '#ff8c32' },
    burrow:     { title: 'Mole',             key: 'RMB',   hint: 'RMB — dig in / pop out, biters scatter', bg: '#8a6a44' },
    bomb:       { title: 'Dome Bomb',        key: 'RMB',   hint: 'RMB — blasts the biters away, nobody gets into the dome', bg: '#c45cb4' },
    decoy:      { title: 'Decoy Chubz',      key: 'RMB',   hint: 'RMB — toss a squeaky fake chubzik: monsters chase it, then boom', bg: '#e0902c' },
    cubes:      { title: 'Wing Cubes',       key: 'RMB',   hint: 'RMB — little winged cubes fly out and dive-bomb the small fry', bg: '#5fb0e8' },
    trail:      { title: 'Rainbow Trail',    key: 'passive', hint: 'biters that step on your trail lose you for a moment', bg: '#e865a8' },
    upgrade:    { title: 'Upgrade',          key: '',      hint: 'click the + over a skill to level it up', bg: '#e8b417' },
    grab:       { title: 'Frog Tongue',      key: 'RMB',   hint: 'RMB at cursor — pulls onto the drill, release to throw', bg: '#2b6f8a' },
    jump:       { title: 'Kangaroo',         key: 'Space', hint: 'Space — jump, landing crushes', bg: '#2fa3b5' },
    doubleJump: { title: 'Two Kangaroos',    key: '2×Spc', hint: 'Space again mid-air — second jump', bg: '#8e5bd6' },
    heal:       { title: 'Medkit',           key: '',      hint: '+40 HP', bg: '#e5484d' },
    w_spread:   { title: 'Fan Gun',          key: '',      hint: 'the main gun fires a fan of tracers', bg: '#e0a020' },
    w_nova:     { title: 'Nova Ring',        key: '',      hint: 'a ring of bullets bursts out on a cooldown', bg: '#1fb5a8' },
    w_orbit:    { title: 'Saw Orbit',        key: '',      hint: 'spinning saws circle the car', bg: '#d8443a' },
    w_mortar:   { title: 'Mortar',           key: '',      hint: 'a heavy shell on the biggest crowd', bg: '#7b55d6' },
  };
  const AB_ORDER = ['drill', 'burrow', 'grab', 'jump', 'doubleJump'];

  // иконки рисуются кодом на canvas: одна и та же картинка идёт в HUD и в спрайт лута
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function kangaroo(ctx, x, y, sc, col) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.fillStyle = col; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(-8, 18); ctx.quadraticCurveTo(-36, 28, -54, 46); ctx.lineTo(-48, 50); ctx.quadraticCurveTo(-28, 40, 0, 32); ctx.closePath(); ctx.fill(); // хвост
    ctx.beginPath(); ctx.ellipse(0, 10, 18, 27, -0.5, 0, Math.PI * 2); ctx.fill();            // тело
    ctx.beginPath(); ctx.moveTo(-4, 30); ctx.lineTo(36, 42); ctx.lineTo(36, 49); ctx.lineTo(-6, 46); ctx.closePath(); ctx.fill(); // лапа
    ctx.beginPath(); ctx.ellipse(14, -16, 8, 13, 0.6, 0, Math.PI * 2); ctx.fill();            // шея
    ctx.beginPath(); ctx.ellipse(23, -27, 11, 8, 0.2, 0, Math.PI * 2); ctx.fill();            // голова
    ctx.beginPath(); ctx.ellipse(33, -24, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();             // морда
    ctx.beginPath(); ctx.moveTo(15, -32); ctx.lineTo(18, -50); ctx.lineTo(24, -33); ctx.closePath(); ctx.fill(); // уши
    ctx.beginPath(); ctx.moveTo(21, -33); ctx.lineTo(27, -48); ctx.lineTo(29, -31); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(12, -4); ctx.lineTo(26, 6); ctx.stroke(); // лапка
    ctx.restore();
  }
  function makeIcon(type) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    rr(ctx, 4, 4, 120, 120, 22); ctx.fillStyle = AB_INFO[type].bg; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
    if (type === 'drill') {
      ctx.save(); ctx.translate(64, 66); ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#3a3d44'; rr(ctx, -17, 14, 34, 26, 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-20, 16); ctx.lineTo(20, 16); ctx.lineTo(0, -48); ctx.closePath();
      ctx.fillStyle = '#e8ecf1'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.strokeStyle = '#f0c03a'; ctx.lineWidth = 7;
      for (let y = -46; y < 20; y += 13) { ctx.beginPath(); ctx.moveTo(-24, y + 8); ctx.lineTo(24, y - 6); ctx.stroke(); }
      ctx.restore(); ctx.restore();
    } else if (type === 'burrow') {
      ctx.fillStyle = '#4a3420'; ctx.beginPath(); ctx.ellipse(64, 112, 50, 14, 0, Math.PI, 0); ctx.fill();   // кучка земли
      ctx.fillStyle = '#5b3d24'; ctx.beginPath(); ctx.arc(64, 74, 36, 0, Math.PI * 2); ctx.fill();          // крот
      ctx.fillStyle = '#7a5434'; ctx.beginPath(); ctx.ellipse(64, 86, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f29bb0'; ctx.beginPath(); ctx.ellipse(64, 84, 10, 7, 0, 0, Math.PI * 2); ctx.fill();   // нос
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(50, 64, 4, 0, Math.PI * 2); ctx.arc(78, 64, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2d6c4';
      [[30, 100], [98, 100]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x, y, 13, 9, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.strokeStyle = '#5b3d24'; ctx.lineWidth = 2;
      [[30, 100], [98, 100]].forEach(([x, y]) => { for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 5, y - 4); ctx.lineTo(x + k * 6, y + 7); ctx.stroke(); } });
    } else if (type === 'grab') {
      ctx.strokeStyle = '#f06292'; ctx.lineWidth = 9; ctx.lineCap = 'round';                               // язык
      ctx.beginPath(); ctx.moveTo(62, 80); ctx.quadraticCurveTo(96, 92, 104, 58); ctx.stroke();
      ctx.fillStyle = '#f06292'; ctx.beginPath(); ctx.arc(104, 54, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4fbf5a'; ctx.beginPath(); ctx.ellipse(46, 78, 34, 26, 0, 0, Math.PI * 2); ctx.fill(); // лягушка
      ctx.beginPath(); ctx.arc(30, 52, 13, 0, Math.PI * 2); ctx.arc(60, 52, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(30, 50, 8, 0, Math.PI * 2); ctx.arc(60, 50, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(32, 50, 4, 0, Math.PI * 2); ctx.arc(62, 50, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(22, 84); ctx.quadraticCurveTo(46, 94, 66, 82); ctx.stroke();
    } else if (type === 'jump') {
      kangaroo(ctx, 62, 62, 1.0, '#fff');
    } else if (type === 'doubleJump') {
      kangaroo(ctx, 42, 78, 0.6, '#fff');
      kangaroo(ctx, 88, 52, 0.6, '#fff');
    } else if (type === 'bomb') {                         // a dome over a burst
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(64, 92, 42, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(14, 92); ctx.lineTo(114, 92); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (let i = 0; i < 14; i++) { const r = i % 2 ? 8 : 19, b = i / 14 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](64 + Math.cos(b) * r, 70 + Math.sin(b) * r); } ctx.closePath(); ctx.fill();
    } else if (type === 'decoy') {                        // a round chubzik with sound waves
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(52, 74, 28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0902c'; ctx.beginPath(); ctx.arc(43, 70, 4.5, 0, 7); ctx.arc(61, 70, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      for (const r of [16, 30]) { ctx.beginPath(); ctx.arc(84, 52, r, -0.9, 0.2); ctx.stroke(); }
    } else if (type === 'cubes') {                        // a cube with wings
      ctx.fillStyle = '#fff'; ctx.fillRect(46, 50, 36, 36);
      ctx.beginPath(); ctx.moveTo(46, 60); ctx.quadraticCurveTo(16, 34, 12, 66); ctx.quadraticCurveTo(28, 64, 46, 74); ctx.fill();
      ctx.beginPath(); ctx.moveTo(82, 60); ctx.quadraticCurveTo(112, 34, 116, 66); ctx.quadraticCurveTo(100, 64, 82, 74); ctx.fill();
      ctx.fillStyle = '#5fb0e8'; ctx.fillRect(52, 74, 24, 5);
    } else if (type === 'trail') {                        // rainbow arcs
      ctx.lineWidth = 9; ctx.lineCap = 'round';
      ['#fff', '#ffe08a', '#a8f0ff'].forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(64, 96, 44 - i * 12, Math.PI, 0); ctx.stroke(); });
    } else if (type === 'upgrade') {                      // two chevrons up
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const y of [58, 92]) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(64, y - 30); ctx.lineTo(96, y); ctx.stroke(); }
    } else if (type === 'heal') {
      ctx.fillStyle = '#fff'; rr(ctx, 52, 26, 24, 76, 6); ctx.fill(); rr(ctx, 26, 52, 76, 24, 6); ctx.fill();
    } else if (type === 'w_spread') {                    // fan of tracers from a muzzle
      ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
      for (let i = -2; i <= 2; i++) { const a = -Math.PI / 2 + i * 0.32; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 26, 104 + Math.sin(a) * 26); ctx.lineTo(64 + Math.cos(a) * 74, 104 + Math.sin(a) * 74); ctx.stroke(); }
      ctx.fillStyle = '#fff'; rr(ctx, 50, 96, 28, 18, 5); ctx.fill();
    } else if (type === 'w_nova') {                      // ring of bullets around a core
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(64, 64, 13, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.arc(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 6.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(64, 64, 27, 0, Math.PI * 2); ctx.stroke();
    } else if (type === 'w_orbit') {                     // orbit path with saw blades
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 4; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.arc(64, 64, 38, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; rr(ctx, 54, 54, 20, 20, 4); ctx.fill();
      for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - 0.5, cx = 64 + Math.cos(a) * 38, cy = 64 + Math.sin(a) * 38;
        ctx.beginPath(); for (let i = 0; i < 16; i++) { const r = i % 2 ? 9 : 15, b = i / 16 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(b) * r, cy + Math.sin(b) * r); } ctx.closePath(); ctx.fill(); }
    } else if (type === 'w_mortar') {                    // arcing shell and a blast
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.setLineDash([9, 8]); ctx.beginPath(); ctx.moveTo(22, 104); ctx.quadraticCurveTo(52, 6, 88, 74); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const r = i % 2 ? 11 : 26, b = i / 16 * Math.PI * 2; ctx[i ? 'lineTo' : 'moveTo'](92 + Math.cos(b) * r, 88 + Math.sin(b) * r); } ctx.closePath(); ctx.fill();
    }
    return c;
  }
  const ICONS = {}, ICON_URLS = {};
  for (const t of Object.keys(AB_INFO)) { ICONS[t] = makeIcon(t); ICON_URLS[t] = ICONS[t].toDataURL(); }
  const X_TOKENS = { x_spread: ['w_spread', 'Bullet Storm'], x_nova: ['w_nova', 'Nova Burst'], x_saw: ['w_orbit', 'Saw Blast'], x_decoy: ['decoy', 'Decoy Party'], x_cubes: ['cubes', 'Cube Swarm'], x_dome: ['bomb', 'Dome Drop'] };
  for (const [x, [src, title]] of Object.entries(X_TOKENS)) { AB_INFO[x] = { title, key: '', hint: 'went off right here, once', bg: AB_INFO[src].bg }; ICONS[x] = ICONS[src]; ICON_URLS[x] = ICON_URLS[src]; }

  // HUD: the ride's own skills, each with a + over it while there are upgrades to spend
  const abBar = document.getElementById('abilities');
  GS.abDirty = true;                                      // setRide() asks for a rebuild (it runs before this line on start-up, hence var)
  function bindAb(t, down, up, drag) {                     // touch: the icons double as buttons
    const el = document.getElementById('ab-' + t); if (!el) return; let id = null, ox = 0, oy = 0;
    el.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      if (id !== null || !abilities[t]) return;
      const tc = e.changedTouches[0]; id = tc.identifier; ox = tc.clientX; oy = tc.clientY;
      el.classList.add('down'); down();
    }, { passive: false });
    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (drag) for (const tc of e.changedTouches) if (tc.identifier === id) drag(tc.clientX - ox, tc.clientY - oy);
    }, { passive: false });
    const end = e => { for (const tc of e.changedTouches) if (tc.identifier === id) { id = null; el.classList.remove('down'); if (up) up(); } };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }
  GS.abSig = '';
  function buildAbBar() {
    GS.abDirty = false; GS.abSig = ''; abBar.innerHTML = '';
    for (const t of kit()) {
      const d = document.createElement('div'); d.className = 'ab locked'; d.id = 'ab-' + t;
      d.innerHTML = `<b class="up">+</b><img src="${ICON_URLS[t]}" draggable="false"><span>${AB_INFO[t].key}</span><i class="lv"></i><i class="cdv"></i><i class="cost"></i>`;
      abBar.appendChild(d);
      const upB = d.querySelector('.up'), spend = e => { e.preventDefault(); e.stopPropagation(); upgradeAb(t); };
      upB.addEventListener('mousedown', spend); upB.addEventListener('touchstart', spend, { passive: false });
    }
    const tag = document.createElement('div'); tag.id = 'wallet'; abBar.appendChild(tag);
    bindAb('jump', () => GAME.jump());
    bindAb('burrow', () => GAME.toggleBurrow());
    bindAb('bomb', () => GAME.bombDome());
    bindAb('decoy', () => GAME.throwDecoys(), null, (dx, dy) => { if (Math.hypot(dx, dy) > 14) { GAME.stickWorld(dx, dy, GAME.touch.aimDir); GAME.touch.aimDist = 6 + 12 * Math.min(1, Math.hypot(dx, dy) / 70); } });
    bindAb('cubes', () => GAME.releaseCubes());
    GAME.layoutTouch(); updateAbHud();
  }
  function upgradeAb(t) {
    if (!abilities[t] || abLv[t] >= abMax(t) || GS.coins < abPrice(t)) return;
    GS.coins -= abPrice(t); abLv[t]++;
    toast(t, 'Lv ' + (abLv[t] + 1), upText(t)[abLv[t] - 1]); GAME.SFX.play('pickup', null, { rate: 1.3 });
    const el = document.getElementById('ab-' + t); if (el) { el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); }
    updateAbHud();
  }
  function updateAbHud() {
    if (GS.abDirty) { buildAbBar(); return; }
    const act = RIDE_ACTIVE[GS.ride], bk = act && abilities[act] ? GAME.activeCdK() : 0;
    const sig = kit().map(t => (abilities[t] ? 1 : 0) + '' + abLv[t]).join() + '|' + GS.coins + '|' + GS.gems + '|' + bk.toFixed(2);
    if (sig === GS.abSig) return; GS.abSig = sig;
    if (GS.wUpSeen !== GS.gems) { GS.wUpSeen = GS.gems; GAME.updateWeaponHUD(); }      // guns are levelled with crystals
    for (const t of kit()) {
      const el = document.getElementById('ab-' + t); if (!el) continue;
      if (abilities[t] && el.classList.contains('locked')) { el.classList.remove('locked'); el.classList.add('fresh'); }
      const open = abilities[t] && abLv[t] < abMax(t); el.classList.toggle('can', open && GS.coins >= abPrice(t));
      const ce = el.querySelector('.cost'); ce.textContent = open ? abPrice(t) + '●' : ''; ce.classList.toggle('ok', open && GS.coins >= abPrice(t));
      el.querySelector('.lv').textContent = abLv[t] ? '★'.repeat(abLv[t]) : '';
      if (t === act) el.style.setProperty('--cd', bk.toFixed(2));
    }
    const tag = document.getElementById('wallet');
    if (tag) tag.innerHTML = '<b class="c">● ' + GS.coins + '</b><b class="g">◆ ' + GS.gems + '</b>';
  }
  const toastEl = document.getElementById('toast'); let toastTimer = 0;
  function toast(type, extra, hint) {
    const i = AB_INFO[type];
    toastEl.innerHTML = `<img src="${ICON_URLS[type]}"><div>${i.title}${extra ? ' ' + extra : ''}${i.key ? ' — ' + i.key : ''}<small>${hint || i.hint}</small></div>`;
    toastEl.style.opacity = 1; toastTimer = 3;
  }
  function applyAbilityVisuals() {
    GAME.drill.visible = abilities.drill; GAME.bullbar.visible = !abilities.drill;
    GAME.arm.visible = GAME.mast.visible = abilities.grab;
    GS.abSig = '';
  }
  applyAbilityVisuals();

  // лут
  const pickups = [];
  const pickupTex = {};
  function dropLoot(at) {                                  // elites and the boss: a one-shot token or a medkit
    const xs = Object.keys(X_TOKENS); spawnPickup(Math.random() < 0.65 ? xs[Math.floor(Math.random() * xs.length)] : 'heal', at);
  }
  function fireToken(type) {                               // a token goes off where you stand
    const o = new THREE.Vector3(GAME.car.pos.x, 1.0 + GAME.car.y, GAME.car.pos.z);
    if (type === 'x_spread' || type === 'x_nova') {
      const n = type === 'x_nova' ? 28 : 36, ph = Math.random() * 6.283;
      for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), m = new THREE.Mesh(GAME.bulletGeo, type === 'x_nova' ? GAME.novaMat : GAME.bulletMat);
        m.position.copy(o).addScaledVector(dir, 1.6); m.lookAt(m.position.x + dir.x, m.position.y, m.position.z + dir.z); GAME.scene.add(m); GAME.bullets.push({ m, v: dir.multiplyScalar(44), life: type === 'x_nova' ? 0.6 : 0.8, dmg: 3 }); }
      GAME.flash(o, type === 'x_nova' ? 0x5ff5e6 : 0xffd27a, 8, 0.3, 3); GAME.SFX.play('nova', GAME.car.pos);
    } else if (type === 'x_saw') GAME.ringBlast(GAME.car.pos.x, GAME.car.pos.z, 7, 5, 14, 0xd8d8e0, false);
    else if (type === 'x_decoy') { for (let i = 0; i < 3; i++) { const a = GAME.car.heading + i * 2.094, x = THREE.MathUtils.clamp(GAME.car.pos.x + Math.sin(a) * 9, -ARENA + 3, ARENA - 3), z = THREE.MathUtils.clamp(GAME.car.pos.z + Math.cos(a) * 9, -ARENA + 3, ARENA - 3);
        GAME.addDecoy(GAME.car.pos.x, GAME.car.pos.z, x, z); GAME.netEv({ t: 'decoy', a: GAME.r1(GAME.car.pos.x), b: GAME.r1(GAME.car.pos.z), x: GAME.r1(x), z: GAME.r1(z) }); } }
    else if (type === 'x_cubes') { GAME.spawnCubes(4, null, 1); GAME.netEv({ t: 'cubes', n: 4, l: 1 }); }
    else if (type === 'x_dome') { const x = GAME.r1(GAME.car.pos.x), z = GAME.r1(GAME.car.pos.z); GAME.addDome(x, z, 9, 3); GAME.netEv({ t: 'dome', x, z, r: 9, T: 3 }); if (!GAME.NET.client) GAME.blastAt(x, z, 9, 1, 26, true); }
  }
  let kitProg = 0, kitNeed = 3;
  function gearNext() {                                    // what I am still missing: my ride's skills, then the three guns, then upgrades
    const t = kit().find(t => !abilities[t]); if (t) return t;
    const w = W_GEAR.find(k => !GAME.weapons[k]); if (w) return 'w_' + w;
    return null;
  }
  const gearDone = () => !gearNext();
  function myKill() {}                                     // ordinary kills drop nothing personal any more
  function bossDrop(x, z) {                                // a wandering boss died: everybody gets their next skill right there (lying where it fell)
    const t = kit().find(t => !abilities[t] && t !== 'jump' && !pickups.some(p => p.own && p.type === t)); if (!t) return;
    spawnPickup(t, GAME.tmp.set(THREE.MathUtils.clamp(x, -ARENA + 4, ARENA - 4), 0, THREE.MathUtils.clamp(z, -ARENA + 4, ARENA - 4)), undefined, true); pickups[pickups.length - 1].own = true;
  }
  let pkN = 0;
  function spawnPickup(type, at, id, remote) {
    if (!pickupTex[type]) pickupTex[type] = GAME.srgbTex(ICONS[type]);
    const sprite = new THREE.Sprite(GAME.glow(new THREE.SpriteMaterial({ map: pickupTex[type], depthTest: true }), 1.1));
    sprite.scale.set(2.4, 2.4, 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 32),
      GAME.glow(new THREE.MeshBasicMaterial({ color: new THREE.Color(AB_INFO[type].bg), transparent: true, opacity: 0.8, depthWrite: false }), 2.4));
    ring.geometry.rotateX(-Math.PI / 2);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 6, 12, 1, true),
      GAME.glow(new THREE.MeshBasicMaterial({ color: new THREE.Color(AB_INFO[type].bg), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), 1.6));
    const x = GAME.inRoom(at.x, at.z) ? at.x : THREE.MathUtils.clamp(at.x, -ARENA + 3, ARENA - 3), z = GAME.inRoom(at.x, at.z) ? at.z : THREE.MathUtils.clamp(at.z, -ARENA + 3, ARENA - 3);
    ring.position.set(x, 0.05, z); beam.position.set(x, 3, z); sprite.position.set(x, 2.4, z);
    GAME.scene.add(sprite, ring, beam);
    const pid = id || String(GAME.NET.on && GAME.NET.game ? GAME.netMe() : 'me') + ':' + (++pkN);
    pickups.push({ type, sprite, ring, beam, x, z, t: 0, id: pid });
    GAME.SFX.play('loot', at);
    if (!remote) GAME.netEv({ t: 'pk', id: pid, ty: type, x: GAME.r1(x), z: GAME.r1(z) });             // everyone in the lobby sees the drop; first to touch it gets it
  }
  function pickupGone(id) { const i = pickups.findIndex(p => p.id === id); if (i < 0) return; const p = pickups[i]; GAME.scene.remove(p.sprite, p.ring, p.beam); pickups.splice(i, 1); GAME.spawnParticles(GAME.tmp.set(p.x, 1.5, p.z), 0xffffff, 6, 5); }
  const LOOT_PULL = 6.5;                                   // radius the loot starts drifting in from; Frog Tongue adds 30%
  function updatePickups(dt) {
    toastTimer -= dt;
    if (toastTimer <= 0 && toastEl.style.opacity !== '0') toastEl.style.opacity = 0;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t += dt;
      p.sprite.position.y = 2.4 + Math.sin(p.t * 3) * 0.3 + Math.max(0, 1 - p.t * 2) * 2;   // выпрыгивает и покачивается
      p.ring.rotation.y += dt * 2;
      p.ring.scale.setScalar(1 + Math.sin(p.t * 4) * 0.08);
      if (p.t > 75 && (p.type.startsWith('w_') || p.type.startsWith('x_') || p.type === 'heal' || p.type === 'upgrade')) { GAME.scene.remove(p.sprite, p.ring, p.beam); pickups.splice(i, 1); continue; }      // nobody wanted it
      const full = (p.type.startsWith('w_') && GAME.weapons[p.type.slice(2)] > 0) || (p.type === 'upgrade' && GS.upGot >= UP_MAX);           // already have that gun (level it with upgrades) / enough upgrades: leave it for the others
      const can = !full && GAME.car.alive && GAME.car.depth < 0.3 && p.t > 0.4;
      let dB = Math.hypot(GAME.car.pos.x - p.x, GAME.car.pos.z - p.z), dK = GAME.cart.shown ? Math.hypot(GAME.cart.pos.x - p.x, GAME.cart.pos.z - p.z) : 1e9;
      if (can) {                                           // loot drifts toward a passing ride (or its cart) so near misses still count
        const pullR = LOOT_PULL * (abilities.grab ? (abLv.grab >= 2 ? 2 : 1.3) : 1), d = Math.min(dB, dK);
        if (d < pullR && d > 0.05) {
          const tx = dB <= dK ? GAME.car.pos.x : GAME.cart.pos.x, tz = dB <= dK ? GAME.car.pos.z : GAME.cart.pos.z, step = Math.min(d, (4 + 10 * (1 - d / pullR)) * dt);
          p.x += (tx - p.x) / d * step; p.z += (tz - p.z) / d * step;
          p.sprite.position.x = p.x; p.sprite.position.z = p.z; p.ring.position.x = p.x; p.ring.position.z = p.z; p.beam.position.x = p.x; p.beam.position.z = p.z;
          dB = Math.hypot(GAME.car.pos.x - p.x, GAME.car.pos.z - p.z); if (GAME.cart.shown) dK = Math.hypot(GAME.cart.pos.x - p.x, GAME.cart.pos.z - p.z);
        }
      }
      if (can && (dB < 2.6 || dK < 2.2)) {
        let extra = '';
        GAME.netEv({ t: 'pkx', id: p.id });
        if (!p.type.startsWith('w_') && !p.type.startsWith('x_') && p.type !== 'heal' && p.type !== 'upgrade' && abilities[p.type]) p.type = 'heal';      // already have that one: patch the ride up instead
        if (p.type === 'heal') GAME.car.hp = Math.min(GAME.car.maxHp, GAME.car.hp + GAME.car.maxHp * 0.4);
        else if (p.type === 'upgrade') { GS.upPts++; GS.upGot++; extra = GS.upGot + '/' + UP_MAX; GS.abSig = ''; }
        else if (p.type.startsWith('x_')) fireToken(p.type);
        else if (p.type.startsWith('w_')) { GAME.gainWeapon(p.type); extra = '— level it up with upgrades'; }
        else { abilities[p.type] = true; applyAbilityVisuals(); GAME.crewSay('ability'); }
        toast(p.type, extra); GAME.SFX.play(p.type === 'heal' ? 'heal' : 'pickup', null);
        GAME.spawnParticles(GAME.tmp.set(p.x, 1.5, p.z), new THREE.Color(AB_INFO[p.type].bg).getHex(), 16, 8);
        GAME.flash(GAME.tmp, new THREE.Color(AB_INFO[p.type].bg).getHex(), 8, 0.35, 3.5);
        GAME.scene.remove(p.sprite, p.ring, p.beam);
        pickups.splice(i, 1);
      }
    }
  }

  return { abilities, kit, abLv, loot, ult, addLoot, dropCoins, lootRemove, lootFrom, updateLoot, lootGain, abPrice, wPrice, abMax, AB_INFO, ICONS, ICON_URLS, X_TOKENS, upgradeAb, updateAbHud, toast, applyAbilityVisuals, pickups, pickupTex, dropLoot, gearDone, myKill, bossDrop, spawnPickup, pickupGone, updatePickups };
}
