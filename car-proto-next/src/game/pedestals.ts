// ---------- the warm-up: everybody has their own weapon pedestals; one rises out of the ground when you come close and has to be fought for.
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from './state.ts';
import { ARENA, W_GEAR, MINI_KINDS } from '../data/index.js';

export function createPedestals(GAME) {
  //       When the whole crew holds all three guns, wandering bosses come out carrying the skills -----
  const pedestals = []; GS.wbSpawned = false; GS.wbKilled = 0;
  const pedBaseGeo = new THREE.CylinderGeometry(1.7, 2.3, 1.4, 8), pedMat = new THREE.MeshStandardMaterial({ color: 0x6f6458, roughness: 0.9 });
  const PED_RISE_R = 25, PED_GUARD_R = 32;
  const firstGun = () => pedestals.length ? pedestals[0].k : (GS.ride === 'halo' ? 'nova' : 'spread');      // the halo's own gun is weak: it starts with the nova
  const pedIcon = k => k === 'jump' ? 'jump' : 'w_' + k;
  const pedHave = k => k === 'jump' ? !!GAME.abilities.jump : GAME.weapons[k] > 0;
  function addPedestal(k, x, z) {
    const g = new THREE.Group(), base = new THREE.Mesh(pedBaseGeo, pedMat); base.position.y = -0.8; base.castShadow = base.receiveShadow = true;
    const ik = pedIcon(k); if (!GAME.pickupTex[ik]) GAME.pickupTex[ik] = GAME.srgbTex(GAME.ICONS[ik]);
    const icon = new THREE.Sprite(GAME.glow(new THREE.SpriteMaterial({ map: GAME.pickupTex[ik], transparent: true }), 1.2)); icon.scale.set(2.8, 2.8, 1); icon.position.y = 3.4; icon.visible = false;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 40), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, depthWrite: false }), 2.4)); ring.geometry.rotateX(-Math.PI / 2); ring.position.y = 0.05;
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.75, depthWrite: false })); hatch.geometry.rotateX(-Math.PI / 2); hatch.position.y = 0.04;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 1.6)); dome.visible = false;
    g.add(hatch, base, icon, ring, dome); g.position.set(x, 0, z); GAME.scene.add(g);
    const P = { k, x, z, g, base, icon, ring, hatch, dome, state: 'dormant', t: 0 }; pedestals.push(P); return P;
  }
  function pedReset(P) { P.state = 'dormant'; P.t = 0; P.g.visible = true; P.base.position.y = -0.8; P.icon.visible = false; P.hatch.visible = true; P.dome.visible = false; }
  function pedSpot(near) {                                 // spray gun: near the centre; the others: far out, apart from each other and from the altars
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.283, r = near ? 14 + Math.random() * 12 : ARENA * (0.5 + Math.random() * 0.25), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (GAME.obstacles.some(o => Math.hypot(o.mesh.position.x - x, o.mesh.position.z - z) < 10)) continue;
      if (!near && (pedestals.some(p => Math.hypot(p.x - x, p.z - z) < 110) || GAME.altars.some(A => Math.hypot(A.x - x, A.z - z) < 25))) continue;
      return [Math.round(x), Math.round(z)]; }
    return [Math.round(Math.random() * 160 - 80), Math.round(Math.random() * 160 - 80)];
  }
  function ambush(x, z, big) {                             // host: the guard that comes out with a pedestal
    if (GAME.swarm.length > 150) return;
    const n = big ? 18 : 13;
    for (let j = 0; j < n; j++) { const a = Math.random() * 6.283, d = 8 + Math.random() * 7; const g = GAME.spawnCritter(['gremlin', 'gremlin', 'maw', 'stilt', 'maw'][j % 5], x + Math.cos(a) * d, z + Math.sin(a) * d); g.guard = true; GAME.digOut(g); }
    const a = Math.random() * 6.283, mb = GAME.makeMini(GAME.spawnCritter(MINI_KINDS[Math.floor(Math.random() * MINI_KINDS.length)], x + Math.cos(a) * 11, z + Math.sin(a) * 11)); mb.guard = true; GAME.digOut(mb);
  }
  const guardsNear = P => { let n = 0; for (const m of GAME.swarm) if (m.guard && !m.dead && Math.hypot(m.pos.x - P.x, m.pos.z - P.z) < PED_GUARD_R) n++; return n; };      // only the pedestal's own ambush holds the shield: wave monsters and log machines passing by don't
  const crewArmed = () => W_GEAR.every(k => GAME.weapons[k]) && GAME.abilities.jump && [...GAME.NET.remotes.values()].every(R => !R.up || R.gd);
  function armedFx(R, k) {                                 // somebody else took a gun: a pillar of light and the gun's icon over their ride
    GAME.flash(GAME.tmp.set(R.pos.x, 2, R.pos.z), 0xffd23a, 10, 0.5, 4); GAME.burst(GAME.tmp.set(R.pos.x, 0.5, R.pos.z), 0xffd23a, 14, 3, 7, 0.5);
    const ik = pedIcon(k); if (!GAME.pickupTex[ik]) GAME.pickupTex[ik] = GAME.srgbTex(GAME.ICONS[ik]);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: GAME.pickupTex[ik], transparent: true, depthTest: false })); spr.renderOrder = 20; spr.scale.setScalar(3);
    GAME.scene.add(spr); armFx.push({ spr, R, t: 0 });
    GAME.toast(pedIcon(k), '— ' + (R.nick || R.ride || 'friend') + ' got it');
  }
  const armFx = [];
  function spawnWanderers() {                              // host: three big wandering bosses, each carries a skill for everyone
    GS.wbSpawned = true;
    wbCheckT = 0; wbTopUp(0);                              // as many as the crew still lacks skills
    GS.rigOwed = Math.max(0, 2 - GAME.swarm.filter(m => m.rig && !m.dead).length); GS.rigT = 0;
    GAME.flashAlert('BOSS HUNT! LOG MACHINES ARE BOSSES TOO'); GAME.netEv({ t: 'alert', s: 'BOSS HUNT! LOG MACHINES ARE BOSSES TOO' }); GAME.SFX.play('boss_roar', null, { vol: 0.6 });
  }
  function spawnWanderer(a, loot) {
    const r = ARENA * (0.3 + Math.random() * 0.45);
    const m = makeWanderer(GAME.makeMini(GAME.spawnCritter(MINI_KINDS[Math.floor(Math.random() * MINI_KINDS.length)], Math.cos(a) * r, Math.sin(a) * r))); m.wbLoot = !!loot; return m;
  }
  const WB_CROWD = 21;                                     // plenty of bosses roam; only some of them carry a skill
  let wbCheckT = 0;
  function wbTopUp(dt) {                                   // host: as many wandering bosses alive as the neediest player still lacks skills (a death wipe or anything else can't stall the warm-up)
    if ((wbCheckT -= dt) > 0) return; wbCheckT = 3;
    const lying = GAME.pickups.filter(p => p.own && GAME.kit().includes(p.type)).length;
    let need = Math.max(0, GAME.kit().filter(t => !GAME.abilities[t] && t !== 'jump').length - lying);      // the jump comes with the spray gun, not from a boss
    for (const R of GAME.NET.remotes.values()) if (R.up && !R.ks) need = Math.max(need, 1);
    const wb = GAME.swarm.filter(m => m.wb && !m.dead), loot = wb.filter(m => m.wbLoot).length;
    for (let i = loot; i < need; i++) spawnWanderer(Math.random() * 6.283, true);                    // never fewer skill carriers than skills missing
    if (need > 0) for (let i = wb.length + Math.max(0, need - loot); i < WB_CROWD; i++) spawnWanderer(Math.random() * 6.283, false);      // and a crowd around them
  }
  const wbGift = () => GAME.kit().find(t => !GAME.abilities[t] && t !== 'jump' && !GAME.pickups.some(p => p.own && p.type === t));      // the skill a carrier holds for me
  const wbMarks = [];
  function updateWbMarks() {                               // everybody: the boss that carries a skill wears its icon over its head, so you know which of the crowd to hunt
    const gift = wbGift() || 'upgrade';
    for (const m of GAME.swarm) if (m.wbLoot && !m.dead && !m.mark) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); spr.renderOrder = 19; GAME.scene.add(spr); m.mark = spr; wbMarks.push(m); }
    for (let i = wbMarks.length - 1; i >= 0; i--) { const m = wbMarks[i], spr = m.mark;
      if (m.dead || !GAME.swarm.includes(m)) { GAME.scene.remove(spr); spr.material.dispose(); m.mark = null; wbMarks.splice(i, 1); continue; }
      if (spr.gift !== gift) { spr.gift = gift; if (!GAME.pickupTex[gift]) GAME.pickupTex[gift] = GAME.srgbTex(GAME.ICONS[gift]); spr.material.map = GAME.pickupTex[gift]; spr.material.needsUpdate = true; }
      const s = 3.4 + Math.sin(GS.elapsed * 4 + m.id) * 0.3; spr.scale.set(s, s, 1); spr.position.set(m.pos.x, (m.K.fly || 0) + m.K.size + 2.6 + Math.sin(GS.elapsed * 2.2 + m.id) * 0.35, m.pos.z); }
  }
  function makeWanderer(m) {
    if (m.wb) return m; m.wb = true; m.K = { ...m.K, size: m.K.size * 1.4, r: Math.min(2.6, m.K.r * 1.3) }; m.r = m.K.r; m.hp *= 3; m.wp = null;
    m.shadow.scale.set(m.K.r * 2.6, 1, m.K.r * 2.2); return m;
  }
  function wbFar(m) {                                      // nobody close: the boss just roams
    let d = GAME.car.alive ? Math.hypot(GAME.car.pos.x - m.pos.x, GAME.car.pos.z - m.pos.z) : 1e9;
    for (const R of GAME.NET.remotes.values()) if (R.up) d = Math.min(d, Math.hypot(R.pos.x - m.pos.x, R.pos.z - m.pos.z));
    return d > 24;
  }
  function updatePedestals(dt) {
    if (GAME.startEl.isConnected) return;
    for (let i = armFx.length - 1; i >= 0; i--) { const F = armFx[i]; F.t += dt; F.spr.position.set(F.R.pos.x, 4.5 + F.t * 1.5, F.R.pos.z); F.spr.material.opacity = Math.min(1, 2.5 - F.t * 1.6);
      if (F.t > 1.6) { GAME.scene.remove(F.spr); F.spr.material.dispose(); armFx.splice(i, 1); } }
    if (!pedestals.length) { const [x, z] = pedSpot(true); addPedestal(firstGun(), x, z); }
    const fg = firstGun();
    if (GAME.weapons[fg] && pedestals.length < 3) for (const k of W_GEAR.filter(k => k !== fg)) { const [x, z] = pedSpot(false); addPedestal(k, x, z); }
    for (let i = 0; i < pedestals.length; i++) {
      const P = pedestals[i];
      if (P.state === 'gone') { if (!pedHave(P.k)) pedReset(P); else continue; }          // the gun was lost: its pedestal is waiting again
      if (pedHave(P.k) && P.state !== 'gone') { P.state = 'gone'; P.g.visible = false; continue; }
      const d = Math.hypot(GAME.car.pos.x - P.x, GAME.car.pos.z - P.z); P.t += dt; P.ring.rotation.y += dt;
      if (P.state === 'dormant') {
        P.ring.material.opacity = 0.45 + Math.sin(GS.elapsed * 4 + i) * 0.3;
        if (GAME.car.alive && d < PED_RISE_R) { P.state = 'rising'; P.t = 0; P.icon.visible = true; P.dome.visible = true; GS.shake = Math.max(GS.shake, 0.5);
          GAME.SFX.play('tent_slam', GAME.tmp.set(P.x, 0, P.z), { vol: 0.6 }); GAME.burst(GAME.tmp.set(P.x, 0.5, P.z), 0x8a7a64, 22, 3.5, 7, 0.6);
          const big = P.k !== fg && P.k !== 'jump'; if (GAME.NET.client) GAME.netEv({ t: 'ambush', x: P.x, z: P.z, b: big ? 1 : 0 }, GAME.NET.hostPeer); else ambush(P.x, P.z, big);
          GAME.flashAlert('GUARDED! CLEAR IT OUT'); }
        continue; }
      if (P.state === 'rising') {
        const k = Math.min(1, P.t / 1.1); P.base.position.y = -0.8 + 1.5 * (1 - (1 - k) * (1 - k)); P.hatch.visible = k < 0.6;
        P.g.position.x = P.x + Math.sin(P.t * 60) * 0.12 * (1 - k); if (Math.random() < dt * 14) GAME.burst(GAME.tmp.set(P.x + GAME.rand(-2, 2), 0.3, P.z + GAME.rand(-2, 2)), 0x8a7a64, 3, 1.6, 4, 0.5);
        P.icon.position.y = -1 + 4.4 * k; if (k >= 1) { P.state = 'sealed'; P.t = 0; P.g.position.x = P.x; }
        continue; }
      P.icon.position.y = 3.4 + Math.sin(GS.elapsed * 2.5 + i) * 0.35;
      const guards = guardsNear(P); P.guards = guards;
      if (P.state === 'sealed') { P.dome.material.opacity = 0.18 + Math.sin(GS.elapsed * 6) * 0.06; P.ring.material.opacity = 0.9;
        if (P.t > 2 && guards === 0) { P.state = 'open'; P.dome.visible = false; GAME.flash(GAME.tmp.set(P.x, 2, P.z), 0xffd23a, 8, 0.35, 3.5); GAME.SFX.play('pickup', null, { rate: 0.7 }); } }
      if (P.state === 'open' && GAME.car.alive && d < 3.4) {
        if (P.k === 'jump') { GAME.abilities.jump = true; GAME.applyAbilityVisuals(); GS.abDirty = true; GS.abSig = ''; GAME.toast('jump'); }
        else { GAME.gainWeapon('w_' + P.k); GAME.toast('w_' + P.k, '— level it up with upgrades'); }
        GAME.SFX.play('pickup', null);
        GAME.flash(GAME.tmp.set(P.x, 2, P.z), 0xffd23a, 8, 0.35, 3.5); GAME.burst(GAME.tmp.set(P.x, 0.5, P.z), 0xffd23a, 16, 3, 8, 0.6);
        P.state = 'gone'; P.g.visible = false;
        if (GAME.NET.on && GAME.NET.game) GAME.netEv({ t: 'armed', k: P.k });
      }
    }
    if (!GAME.NET.client && !GS.wbSpawned && crewArmed()) { GS.wbSpawned = true; if (!GAME.swarm.some(m => m.wb && !m.dead)) spawnWanderers(); }
    if (!GAME.NET.client && GS.wbSpawned) wbTopUp(dt);
  }
  return { pedestals, firstGun, pedIcon, ambush, crewArmed, armedFx, wbGift, updateWbMarks, makeWanderer, wbFar, updatePedestals, addPedestal, spawnWanderers, wbTopUp, wbMarks };
}
