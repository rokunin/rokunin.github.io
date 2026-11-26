// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- multiplayer over the artifact's room channel: lobby list on the start screen, other players as ghost rides ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';
import { p2pRoom } from './p2p-room.ts';
import { ARENA, W_STATS, W_GEAR, RIDE_KIT, MINI_SEQ, PHASES, BOSS_HP, BOSS2, ULT, WEB_R, DATA_HASH } from '../data/index.js';

export function createMultiplayer(GAME) {
  // Rides travel in presence. Monsters and chubziks are simulated by the lobby host and mirrored to the others; cubes and the boss stay per player.
  const NET = { room: null, on: false, game: null, hostNick: '', nick: '', sel: null, sendT: 0, fireSeq: 0, remotes: new Map(), shots: [] };
  const mpState = document.getElementById('mpState'), mpList = document.getElementById('mpList'), nickEl = document.getElementById('nick'), netEl = document.getElementById('net');
  const cleanNick = v => String(v == null ? '' : v).replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12);
  try { nickEl.value = cleanNick(localStorage.getItem('carproto.nick')) || ''; } catch (e) {}
  if (!nickEl.value) nickEl.value = 'Driver' + Math.floor(100 + GAME.trueRandom() * 900);
  const num = (v, lo, hi, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);     // presence is untrusted input
  const VER = '38.' + DATA_HASH;                          // players on different builds must not share a lobby: their monsters would not match. The data hash keeps out players whose combat numbers differ (ADR-0006)
  function netGames(peers) {
    const g = {};
    for (const p of peers) { const pr = p.presence || {}; if (typeof pr.game !== 'string' || !/^g[a-z0-9]{1,10}$/.test(pr.game)) continue;
      (g[pr.game] = g[pr.game] || { id: pr.game, host: cleanNick(pr.hostNick) || '?', n: 0, old: false }).n++; if (pr.v !== VER) g[pr.game].old = true; }
    return Object.values(g);
  }
  const hostBtn = document.getElementById('hostBtn');
  function renderLobby() {
    if (!GAME.startEl.isConnected) return;
    if (!NET.room) { hostBtn.style.display = 'none'; return; }
    hostBtn.style.display = '';
    const peers = NET.room.peers(), games = netGames(peers);
    const sig = games.map(g => g.id + g.host + g.n + g.old).join('|') + '#' + peers.length;
    if (sig === NET.sig) return; NET.sig = sig;               // only touch the DOM when the list really changed, so taps land
    mpState.textContent = `Online now: ${Math.max(1, peers.length)}. ` + (games.length ? 'Join a lobby or host your own:' : 'No lobbies yet — host one and the others will see it here.');
    mpList.textContent = '';
    for (const g of games) {
      const b = document.createElement('button'); b.textContent = `${g.host}'s lobby · ${g.n} in`;
      if (g.old) { b.disabled = true; b.textContent = `${g.host}'s lobby · other game version — everyone reload the page`; }
      b.addEventListener('click', () => GAME.toComic(g.id));
      mpList.appendChild(b);
    }
  }
  renderLobby();
  (async () => {
    try {
      const r = window.claude ? await window.claude.use('room') : await p2pRoom({ logError: GAME.logError });      // src/net/p2p-room.ts. Inside Claude: its room channel; anywhere else: plain WebRTC
      if (!r) { mpState.textContent = 'Multiplayer is off on this device: the page must be open in Claude by a signed-in member of the owner\'s organization or an invited guest (a plain public link does not connect).'; return; }
      NET.room = r;
      if (r.sendEv) { NET.tx = (d, to) => r.sendEv(d, to); r.onEv(netOnEv); }                   // WebRTC: direct messages
      else if (typeof r.emit === 'function') {                                                    // Claude room: one shared topic, addressed inside the payload
        NET.tx = (d, to) => { r.emit('ev', to ? { ...d, to } : d).catch(() => {}); };
        r.on('ev', m => { if (m && !(m.isMe && m.sameTab) && m.data && typeof m.data === 'object' && (!m.data.to || m.data.to === netMe())) netOnEv(m.data, m.peer); }, () => {});
      }
      r.onPeers(() => renderLobby(), () => { NET.room = null; NET.on = false; mpState.textContent = 'Multiplayer: the connection was refused for this viewer.'; renderLobby(); });
      renderLobby();
    } catch (e) { mpState.textContent = 'Multiplayer: could not start the network module.'; }
  })();
  function netStart(mode) {                              // 'solo', 'host', or the id of a lobby to join; the lobby is announced right away
    NET.nick = cleanNick(nickEl.value) || 'Driver'; try { localStorage.setItem('carproto.nick', NET.nick); } catch (e) {}
    NET.game = null;
    if (!NET.room || mode === 'solo') return;
    const g = mode !== 'host' && netGames(NET.room.peers()).find(x => x.id === mode && !x.old);
    NET.game = g ? g.id : 'g' + GAME.trueRandom().toString(36).slice(2, 8); NET.hostNick = g ? g.host : NET.nick;
    NET.isHost = !g;
    NET.room.presence({ game: NET.game, hostNick: NET.hostNick, nick: NET.nick, a: 0, hp: NET.isHost ? 1 : 0, v: VER }).catch(() => {});
  }
  // tests skip the lobby (window.__skipLobby): legacy.js starts the solo game right after this module is built, netStart exists only then
  // ---- shared world: who broke what, altar progress, chubzik hand-offs. The lobby host answers newcomers with the full state ----
  const netMe = () => { if (!NET.me && NET.room) { const p = NET.room.peers().find(q => q.isMe && q.sameTab); if (p) NET.me = p.peer; } return NET.me; };
  function netEv(d, to) { if (NET.on && NET.game && NET.tx) NET.tx({ ...d, g: NET.game }, to); }
  const obAt = i => (Number.isInteger(i) && i >= 0 && i < GAME.obstacles.length ? GAME.obstacles[i] : null);
  function netWorld() {                                  // everything a newcomer needs to match this world
    const sm = [], cr = [];
    GAME.obstacles.forEach((o, i) => { if ((o.pillar || o.rock) && !o.mesh.visible && !o.dormant) sm.push(i); if (o.crate && !o.room) cr.push([i, r1(o.mesh.position.x), r1(o.mesh.position.z), o.mesh.visible ? 1 : 0, o.rc || 0]); });
    return { t: 'sync', sm, cr, al: GAME.altars.map(A => A.n), bd: Math.round(GAME.boss.dealt), bk: GAME.boss.state === 'dead' ? 1 : 0, go: GS.gateOpen ? 1 : 0, bst: GAME.boss.state === 'fight' || GAME.boss.state === 'emerging' || GAME.boss.state === 'flee' ? 1 : 0, bp: [GAME.boss.ph, r1(GAME.boss.mv ? GAME.boss.mv.tx : GAME.BOSS_POS.x), r1(GAME.boss.mv ? GAME.boss.mv.tz : GAME.BOSS_POS.z)], pk: GAME.pickups.filter(p => !p.own).slice(0, 30).map(p => [p.id, p.type, r1(p.x), r1(p.z)]), lt: GAME.loot.slice(0, 120).map(L => [L.id, L.gem ? 1 : 0, r1(L.x), r1(L.z)]), aw: GAME.altars.map(A => A.awake ? r1(A.spawnT) : -1), bn: GAME.tentacles.map(t => t.n), ph: [PH.i, r1(PH.brk), PH.clr, PH.wv, PH.hellN, r1(PH.t), PH.gate ? 1 : 0], fa: GAME.altars.map(A => A.found ? 1 : 0), fr: GAME.rocks.filter(R => R.found).map(R => GAME.obstacles.indexOf(R)) };
  }
  const netGamePeers = () => NET.room.peers().filter(p => (p.presence || {}).game === NET.game && (p.presence || {}).v === VER);
  function netHostPeer() { return netGamePeers().filter(p => (p.presence || {}).hp === 1).map(p => String(p.peer)).sort()[0] || null; }
  function netAmHost() { const h = netHostPeer(); return h ? h === String(netMe()) : !NET.client; }
  function netRole() {                                   // the lobby host runs monsters and chubziks; if it leaves, the lowest peer id takes over
    const h = netHostPeer(), me = String(netMe());
    if (h) { NET.noHost = 0; NET.hostPeer = h === me ? null : h;
      if (h === me) { if (NET.client) netAdopt(); }
      else { if (!NET.client) netPurge(); NET.client = true; NET.isHost = false; } }
    else if ((NET.noHost = (NET.noHost || 0) + 1) > 6 && NET.client && netGamePeers().map(p => String(p.peer)).sort()[0] === me) netAdopt();
  }
  const rockStub = (x, z) => GAME.nearestRock(x, z) || { mesh: { position: new THREE.Vector3(x, 0, z), visible: true }, r: 3, h: 2.5, top: 2 };
  function netPurge() {                                  // joining someone's lobby: their monsters and chubziks replace mine
    netLog('became a guest: dropped my own monsters, mirroring the host');
    DG.lastSw = performance.now(); DG.gap = false;
    for (const m of GAME.swarm) { m.dead = true; GAME.scene.remove(m.sprite, m.shadow); if (m.rig) GAME.rigBreak(m, true); } GAME.swarm.length = 0; GAME.swById.clear();
    for (const g of GAME.globs) GAME.scene.remove(g.g, g.ring); GAME.globs.length = 0;
    for (let i = GAME.chubs.length - 1; i >= 0; i--) { const c = GAME.chubs[i]; if (c.state !== 'cart') { c.dead = true; GAME.scene.remove(c.sprite, c.shadow); GAME.chubs.splice(i, 1); } }
    GS.chubInit = true; GAME.waves.pending = false; NET.chMir = new Map();
  }
  function netAdopt() {                                  // the host left and I am next in line: the mirrors become mine to simulate
    netLog('host is gone: I took over the monsters (' + GAME.swarm.length + ') and chubziks');
    for (const m of GAME.swarm) { GS.swId = Math.max(GS.swId, m.id); if (m.net) { m.net = false; m.think = Math.random() * 0.3; m.cd = 0.5; } }
    for (const c of GAME.chubs) { if (!c.net) continue; c.net = false; c.id = ++GS.chubId; c.rock = c.home = rockStub(c.pos.x, c.pos.z);
      if (c.fl & 2 && c.rock.mesh.visible && Math.hypot(c.rock.mesh.position.x - c.pos.x, c.rock.mesh.position.z - c.pos.z) < c.rock.r + 1) c.state = 'perch'; else { c.pos.y = 0; c.state = 'roam'; c.goal.copy(c.pos); c.t = 0; } }
    NET.client = false; NET.isHost = true; NET.hostPeer = null; NET.chMir = new Map(); GAME.waves.t = Math.max(GAME.waves.t, 10);
    GS.wbSpawned = GAME.swarm.some(m => m.wb && !m.dead);      // the bosses were the old host's: carry on topping them up
  }
  function netPick(m) {                                  // host: each monster goes for the nearest player
    if (NET.client || !NET.remotes.size) return null;
    let best = null, bd = GAME.carSeen() ? Math.hypot(GAME.car.pos.x - m.pos.x, GAME.car.pos.z - m.pos.z) : 1e9;
    for (const R of NET.remotes.values()) if (R.up && R.tc) { const d = Math.hypot(R.pos.x - m.pos.x, R.pos.z - m.pos.z); if (d < bd) { bd = d; best = R; } }
    return best;
  }
  function waveTargets() {                              // players a wave could be sent at: up and outside the boss room
    const a = []; if (GAME.carSeen() && (GS.gateOpen || !GAME.inRoom(GAME.car.pos.x, GAME.car.pos.z))) a.push(GAME.car.pos);
    if (NET.on && NET.game && !NET.client) for (const R of NET.remotes.values()) if (R.up && (GS.gateOpen || !GAME.inRoom(R.pos.x, R.pos.z))) a.push(R.pos);
    return a;
  }
  function netAnyPlayer() { const a = waveTargets(); return a.length ? a[Math.floor(Math.random() * a.length)] : GAME.car.pos; }
  function netSnap() {                                   // host -> everyone: where every monster and loose chubzik is
    const q = NET.q = (NET.q || 0) + 1;
    const chunks = (rows, per, t) => { const n = Math.max(1, Math.ceil(rows.length / per)); for (let c = 0; c < n; c++) netEv({ t, q, c, n, a: rows.slice(c * per, c * per + per) }); };
    const sw = []; for (const m of GAME.swarm) if (!m.dead) sw.push([m.id, GAME.SW_KEYS.indexOf(m.kind) * 3 + m.v, r1(m.pos.x), r1(m.pos.z), (m.flash > 0 ? 1 : 0) | (m.mini ? 2 : 0) | (m.gate ? 4 : 0) | (m.stun > 0 ? 8 : 0) | (m.dig > 0 ? 16 : 0) | (m.wb ? 32 : 0) | (m.rig ? 64 : 0) | (m.guard ? 128 : 0) | (m.wbLoot ? 256 : 0)]);
    chunks(sw, 60, 'sw');
    const en = []; GAME.enemies.forEach((e, i) => en.push([i, r1(e.pos.x), r1(e.pos.z), r2(e.yaw), (e.awake ? 1 : 0) | (e.dead ? 2 : 0) | (e.flash > 0 ? 4 : 0) | (e.charge > 0 ? 8 : 0) | (e.carried ? 16 : 0)]));
    netEv({ t: 'en', a: en });
    if (q % 2) return;
    const ch = []; for (const c of GAME.chubs) if (!c.dead && c.state !== 'cart') ch.push([c.id, r1(c.pos.x), r1(c.pos.z), r1(c.pos.y), (c.state === 'flee' || c.state === 'dazed' || c.state === 'tocar' || (c.state === 'arc' && c.next === 'dazed') ? 1 : 0) | (c.state === 'perch' ? 2 : 0)]);
    chunks(ch, 70, 'ch');
  }
  function netMirror(d, from) {
    if (!NET.client || (NET.hostPeer && String(from) !== NET.hostPeer) || !Array.isArray(d.a)) return;
    DG.rx++; if (d.t === 'sw') DG.lastSw = performance.now();
    const q = num(d.q, 0, 1e9), G = NET.got || (NET.got = {}), gt = G[d.t] && G[d.t].q === q ? G[d.t] : (G[d.t] = { q, c: new Set() });
    gt.c.add(d.c); const last = gt.c.size >= num(d.n, 1, 99) && !gt.done; if (last) gt.done = true;      // prune only when every chunk of this snapshot has arrived
    if (d.t === 'sw') {
      for (const e of d.a.slice(0, 80)) {
        if (!Array.isArray(e) || !Number.isInteger(e[0])) continue;
        const kind = GAME.SW_KEYS[Math.floor(num(e[1], 0, 99) / 3)] || 'gremlin', x = num(e[2], -ARENA - 50, ARENA + 50), z = num(e[3], -ARENA - 50, ARENA + 50);
        let m = GAME.swById.get(e[0]);
        if (!m || m.dead) { if (GAME.swarm.length > GAME.SW_CAP + 60) continue; m = GAME.spawnCritter(kind, x, z, Math.floor(num(e[1], 0, 99)) % 3, e[0]); m.net = true; if (e[4] & 16) GAME.digOut(m); if (e[4] & 2) GAME.makeMini(m, e[4] & 4); if (e[4] & 32) { GAME.makeWanderer(m); if (e[4] & 256) m.wbLoot = true; } if (e[4] & 64) GAME.makeRig(m); if (e[4] & 128) m.guard = true; if (e[4] & 4) GS.gateSpawned = true; }
        m.tx = x; m.tz = z; m.q = q; m.seenT = GS.elapsed; if ((e[4] & 1) && m.flash <= 0) m.flash = 0.1; if (e[4] & 8) m.stunVis = Math.max(m.stunVis || 0, 0.3);
      }
      for (const m of GAME.swarm) if (m.net && !m.dead && (last ? m.q !== q : GS.elapsed - m.seenT > 3)) {             // not in the host's list any more: it died
        m.dead = true; GAME.scene.remove(m.sprite, m.shadow);
        if (Math.hypot(m.pos.x - GAME.car.pos.x, m.pos.z - GAME.car.pos.z) < 60) {
          const p = GAME.tmp.set(m.pos.x, (m.K.fly || 0) + m.K.size * 0.4, m.pos.z);
          GAME.spawnParticles(p, m.art.color, m.K.heavy ? 18 : 9, m.K.heavy ? 10 : 7); GAME.flash(p, m.art.color, m.K.heavy ? 6 : 3, 0.18, 1.6, false); GAME.SFX.play('pop', p, { rate: m.K.heavy ? 0.7 : 0.9 + Math.random() * 0.3 });
        }
        if (GS.elapsed - (m.myHit || -9) < 1.2) { GS.enemyKills++; GAME.ekillsEl.textContent = GS.enemyKills; GAME.crewKill(false); GAME.myKill(m.pos.x, m.pos.z, 1); }
      }
    } else if (!GAME.angel.on) {
      const M = NET.chMir || (NET.chMir = new Map());
      for (const e of d.a.slice(0, 90)) {
        if (!Array.isArray(e) || !Number.isInteger(e[0])) continue;
        const x = num(e[1], -ARENA, ARENA), z = num(e[2], -ARENA, ARENA), y = num(e[3], 0, 40);
        let c = M.get(e[0]);
        if (!c || c.dead) { if (M.size > 400) continue; c = GAME.spawnChub(rockStub(x, z), false); c.net = true; c.state = 'net'; c.tp = new THREE.Vector3(); c.pos.set(x, y, z); M.set(e[0], c); }
        c.tp.set(x, y, z); c.q = q; c.fl = num(e[4], 0, 3);
      }
      if (last) for (const [id, c] of M) if (c.q !== q) { c.dead = true; GAME.scene.remove(c.sprite, c.shadow); M.delete(id); }
    }
  }
  function netOnEv(d, from) {
    if (!NET.on || d.g !== NET.game) return;
    NET.applying = true;
    try {
      if (d.t === 'smash') { const o = obAt(d.i); if (o && (o.pillar || o.rock) && o.mesh.visible) GAME.smashPillar(o, tmp2net.set(num(d.vx, -40, 40), 0, num(d.vz, -40, 40))); }
      else if (d.t === 'crate') { const o = obAt(d.i); if (o && o.crate && !o.room && o.mesh.visible) crateRemote(o); }
      else if (d.t === 'altar') { const A = GAME.altars[d.k]; if (A && Number.isInteger(d.n) && d.n > A.n) { A.n = Math.min(GAME.ALTAR_NEED, d.n); A.pulse = 1; GAME.altarApply(A); } }
      else if (d.t === 'chub') { chubGift(); }
      else if (d.t === 'wf') { let R = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) R = q;
        const L = Math.round(num(d.l, 0, 4));
        if (R && R.up && Math.hypot(R.pos.x - GAME.car.pos.x, R.pos.z - GAME.car.pos.z) < 110) {
          if (d.k === 'beam' && (R.ride === 'halo' || R.ride === 'unicorn')) GAME.fireBeams({ pos: R.pos, h: () => R.h, y: () => R.pos.y, alive: () => R.up && NET.remotes.get(R.peer) === R }, R.ride, L, true);
          else if (d.k === 'web' && Array.isArray(d.s)) { const sp = []; for (let i = 0; i + 1 < d.s.length && sp.length < 6; i += 2) sp.push(new THREE.Vector3(num(d.s[i], -400, 400), 0, num(d.s[i + 1], -400, 400)));
            GAME.launchWebs(new THREE.Vector3(R.pos.x, 2.6 + R.pos.y, R.pos.z), sp, WEB_R[L], true); }
          else if (d.k === 'mortar') GAME.fireMortar(new THREE.Vector3(num(d.x, -400, 400), 0, num(d.z, -400, 400)), L, new THREE.Vector3(R.pos.x, 2.5 + R.pos.y, R.pos.z), true);
          else if (d.k === 'nova') { const n = W_STATS.nova.n[L], ph = Math.random() * 6.283;
            for (let i = 0; i < n; i++) { const a = ph + i / n * 6.283, m = new THREE.Mesh(GAME.bulletGeo, GAME.novaMat); m.position.set(R.pos.x + Math.sin(a) * 1.6, 1 + R.pos.y, R.pos.z + Math.cos(a) * 1.6); m.rotation.y = a; GAME.scene.add(m);
              NET.shots.push({ m, v: new THREE.Vector3(Math.sin(a) * 42, 0, Math.cos(a) * 42), life: 0.55 }); } }
        } }
      else if (d.t === 'rock') { if (NET.client) GAME.rockGrow(obAt(d.i)); }
      else if (d.t === 'gate') { if (NET.client) GAME.openGate(); }
      else if (d.t === 'ph') { if (NET.client && Number.isInteger(d.i) && d.i >= 0 && d.i < PHASES.length && d.i !== PH.i) phEnter(d.i, num(d.b, 0, 60)); }
      else if (d.t === 'fd') { if (NET.client && (d.k === 'a' || d.k === 'r' || d.k === 'g') && Number.isInteger(d.i)) phFind(d.k, d.i); }
      else if (d.t === 'pk') { if (typeof d.id === 'string' && d.id.length < 40 && typeof d.ty === 'string' && GAME.ICONS[d.ty] && !GAME.pickups.some(p => p.id === d.id) && GAME.pickups.length < 40)
        GAME.spawnPickup(d.ty, new THREE.Vector3(num(d.x, -400, 400), 0, num(d.z, -400, 400)), d.id, true); }
      else if (d.t === 'pkx') { if (typeof d.id === 'string') GAME.pickupGone(d.id); }
      else if (d.t === 'bs') { if (NET.client) { if (d.s === 'e' && GAME.boss.state === 'idle') GAME.bossEmerge(); else if (d.s === 'i' && GAME.boss.state !== 'dead') GAME.resetBoss(); else if (d.s === 'f' && GAME.boss.state !== 'dead') GAME.bossFlee(); } }
      else if (d.t === 'bt') { const tn = GAME.tentacles[d.k]; if (NET.client && tn && GAME.boss.state === 'fight' && tn.state === 'idle') { tn.state = 'wind'; tn.t = 0; tn.tp = GAME.netPeerPos(d.p); GAME.SFX.play('tent_wind', GAME.tentRoot(tn)); } }
      else if (d.t === 'bq') { if (NET.client && GAME.boss.state === 'fight' && GAME.quakes.length < 12) GAME.bossQuake(num(d.x, -400, 400), num(d.z, -400, 400), num(d.r, 4, 40), num(d.d, 1, 40, 26)); }
      else if (d.t === 'bv') { if (NET.client && GAME.boss.state === 'fight' && GAME.lavas.length < 2) GAME.bossLava(num(d.x, -400, 400), num(d.z, -400, 400), num(d.r, 8, 60, BOSS2.lavaR), num(d.T, 1, 12, 5)); }
      else if (d.t === 'bgo') { if (NET.client && GAME.boss.ph === 2 && GAME.boss.state === 'fight' && typeof d.x === 'number' && typeof d.z === 'number') GAME.bossMove(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), num(d.v, 5, 60, BOSS2.dashV)); }
      else if (d.t === 'bf') { if (NET.client && GAME.boss.state === 'fight') GAME.bossFan(Math.round(num(d.n, 1, 24)), num(d.s, 0, 7), num(d.v, 1, 30), num(d.a, -9, 9)); }
      else if (d.t === 'bl') { const o = obAt(d.i); if (NET.client && o && o.crate && GAME.boss.state === 'fight') { GAME.releaseLift(); GAME.bossLift(o); } }
      else if (d.t === 'bh') { const o = obAt(d.i); if (NET.client && o && o.crate && Array.isArray(d.f) && Array.isArray(d.v) && Array.isArray(d.l)) {
        if (GAME.boss.lifting && GAME.boss.lifting.o !== o) GAME.releaseLift();
        GAME.bossHurl(o, new THREE.Vector3(num(d.f[0], -400, 400), num(d.f[1], 0, 40), num(d.f[2], -400, 400)), new THREE.Vector3(num(d.v[0], -80, 80), num(d.v[1], -80, 80), num(d.v[2], -80, 80)), new THREE.Vector3(num(d.l[0], -400, 400), 0, num(d.l[1], -400, 400))); } }
      else if (d.t === 'bd') { if (!NET.client && GAME.boss.state === 'fight') { GAME.boss.dealt += num(d.d, 0, 5000); GAME.boss.flash = 0.06; GAME.bossHealth(); } }
      else if (d.t === 'bhp') { if (NET.client && (!NET.hostPeer || String(from) === NET.hostPeer) && GAME.boss.state !== 'dead') { GAME.boss.hm = num(d.m, 1, 1e6, BOSS_HP);
        if (d.p === 2 && GAME.boss.ph !== 2 && (GAME.boss.state === 'fight' || GAME.boss.state === 'emerging')) GAME.bossFlee();
        GAME.boss.dealt = Math.min(num(d.d, 0, 1e7) + (NET.bdAcc || 0), GAME.boss.hm * (GAME.boss.ph === 2 ? 1.5 : 0.5)); GAME.bossBar(); } }
      else if (d.t === 'bk') { if (GAME.boss.state === 'fight' || GAME.boss.state === 'emerging' || GAME.boss.state === 'flee') { GAME.boss.state = 'fight'; GAME.killBoss(); } else if (GAME.boss.state !== 'dead') { GAME.boss.state = 'dead'; GAME.bossBarEl.style.display = 'none'; GAME.setDoor(false); GAME.flashAlert('PYRAMIDON IS DEAD'); GAME.angelStart(); } }
      else if (d.t === 'sw' || d.t === 'ch') netMirror(d, from);
      else if (d.t === 'en') { const quiet = !NET.enSeen; NET.enSeen = true; if (NET.client && Array.isArray(d.a)) for (const r of d.a.slice(0, 64)) {
        const e = Array.isArray(r) && GAME.enemies[r[0]]; if (!e || e.carried) continue;
        const fl = num(r[4], 0, 31), x = num(r[1], -ARENA, ARENA), z = num(r[2], -ARENA, ARENA);
        if (fl & 2) { if (!e.dead) { e.dead = true; e.root.visible = false; if (!quiet) GAME.enemyDieFx(e); if (GS.elapsed - (e.myHit || -9) < 1.5) { GS.enemyKills++; GAME.ekillsEl.textContent = GS.enemyKills; GAME.crewKill(e.elite); GAME.myKill(e.pos.x, e.pos.z, 3); } } continue; }
        if (e.dead || (e.awake && !(fl & 1))) {          // came back from the respawn queue: a sleeping crate again
          e.dead = false; e.root.visible = true; e.awake = false; e.awakeParts.forEach(q => q.visible = false); GAME.setEnemyLook(e, e.matDormant);
          e.pivot.rotation.x = 0; e.hop.position.y = 0; e.hop.scale.set(1, 1, 1); e.open = 0; e.pos.set(x, 0, z); e.yaw = num(r[3], -99, 99);
        }
        if ((fl & 1) && !e.awake) GAME.wakeEnemy(e);
        e.tx = x; e.tz = z; e.tyaw = num(r[3], -99, 99); e.hostCarry = !!(fl & 16);
        if (fl & 4 && e.flash <= 0) e.flash = 0.07; e.topen = fl & 8 ? 0.95 : 0.3;
      } }
      else if (d.t === 'eh') { const e = GAME.enemies[d.i]; if (!NET.client && e && !e.dead) GAME.hitEnemy(e, tmp2net.set(num(d.x, -1, 1), 0, num(d.z, -1, 1)), num(d.d, 0, 9999), num(d.p, 0, 20)); }
      else if (d.t === 'ehurt') { const e = GAME.enemies[d.i]; if (NET.client && e && !e.dead) GAME.hurtCar(num(d.d, 0, 40), new THREE.Vector3(num(d.x, -1, 1), 0, num(d.z, -1, 1))); }
      else if (d.t === 'es') { const e = GAME.enemies[d.i]; if (NET.client && e && !e.dead && Array.isArray(d.f) && Math.hypot(e.pos.x - GAME.car.pos.x, e.pos.z - GAME.car.pos.z) < 80) {
        e.charge = 0; GAME.enemyVolley(e, new THREE.Vector3(num(d.f[0], -400, 400), num(d.f[1], 0, 20), num(d.f[2], -400, 400)), num(d.a, -9, 9)); } }
      else if (d.t === 'eg') { const e = GAME.enemies[d.i]; if (!NET.client && e && !e.dead) {
        if (d.c === 1) { if (e.carried) GAME.releaseIfHeld(e); e.carried = true; e.root.visible = false; }
        else { e.carried = false; e.root.visible = true; e.pos.set(num(d.x, -ARENA, ARENA), 0, num(d.z, -ARENA, ARENA)); e.stun = 1.1; e.biteCd = 1.2; e.vel.set(0, 0, 0); e.root.rotation.set(0, e.yaw, 0); } } }
      else if (d.t === 'stun') { const m = GAME.swById.get(d.i); if (!NET.client && m && !m.dead) m.stun = Math.max(m.stun || 0, num(d.s, 0, 2)); }
      else if (d.t === 'hit') { const m = GAME.swById.get(d.i); if (!NET.client && m && !m.dead && !m.net) GAME.hitCritter(m, num(d.d, 0, 9999), tmp2net.set(num(d.x, -1, 1), 0, num(d.z, -1, 1)), num(d.p, 0, 20)); }
      else if (d.t === 'log') { if (typeof d.s === 'string') diagAdd(DG.nick(from), d.s.slice(0, 160)); }
      else if (d.t === 'st') { if (d.o && typeof d.o === 'object') DG.stats.set(String(from), { o: d.o, at: performance.now() }); }
      else if (d.t === 'hurt') { const m = GAME.swById.get(d.i); if (NET.client && !(m && !m.dead)) DG.ghost++; if (NET.client && m && !m.dead) GAME.hurtCar(num(d.d, 0, 30), new THREE.Vector3(num(d.x, -1, 1), 0, num(d.z, -1, 1))); }
      else if (d.t === 'lose') { if (NET.client && GAME.cart.riders.length && !GAME.safeKeeps()) { GAME.eatChub(GAME.cart.riders.pop()); GAME.cartNEl.textContent = GAME.cart.riders.length; GAME.cartKick(2); } }
      else if (d.t === 'drop') { if (!NET.client && GAME.chubs.length < 500) { const x = num(d.x, -ARENA, ARENA), z = num(d.z, -ARENA, ARENA), c = GAME.spawnChub(rockStub(x, z), false);
        c.pos.set(num(d.fx, -ARENA, ARENA), 0.8, num(d.fz, -ARENA, ARENA)); GAME.chubArc(c, GAME.tmp.set(x, 0, z), 0.7, 'dazed', 3); c.dazeT = 0.7; } }
      else if (d.t === 'aw') { const A = GAME.altars[d.k]; if (NET.client && A && !A.done) { A.awake = d.s === 1; if (d.n != null) A.spawnT = num(d.n, 0, 99); if (d.w === 1 || d.w === 2) GAME.altarWave(A, d.w); } }
      else if (d.t === 'guards') { const A = GAME.altars[d.k]; if (!NET.client && A && (A.netG || 0) < GS.elapsed) { A.netG = GS.elapsed + 5; NET.applying = false; GAME.altarGuards(A, Math.round(num(d.n, 1, 8))); } }
      else if (d.t === 'eat') { const x = num(d.x, -ARENA, ARENA), z = num(d.z, -ARENA, ARENA); if (NET.client && Math.hypot(x - GAME.car.pos.x, z - GAME.car.pos.z) < 50) { GAME.tmp.set(x, 0.6, z); GAME.spawnParticles(GAME.tmp, 0x4f9dff, 10, 7); GAME.SFX.play('chomp', GAME.tmp, { rate: 1.4, vol: 0.7 }); GAME.SFX.play('chub', GAME.tmp, { rate: 0.6 }); } }
      else if (d.t === 'ambush') { if (!NET.client) { NET.applying = false; GAME.ambush(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), d.b === 1); } }
      else if (d.t === 'bm') { if (NET.client && Array.isArray(d.b)) { const seen = new Set();
          for (const q of d.b) { if (!Array.isArray(q) || !Number.isInteger(q[0])) continue; seen.add(q[0]); let B = GAME.bombs.find(B => B.id === q[0]);
            if (!B) B = GAME.addBomb(q[0], num(q[1], -ARENA, ARENA), num(q[2], -ARENA, ARENA), q[3] === 2); if (B.leap || B.fly) continue; B.tx = num(q[1], -ARENA, ARENA); B.tz = num(q[2], -ARENA, ARENA); B.n = num(q[4], 0, 8); GS.bombId = Math.max(GS.bombId, q[0]); }
          for (const B of GAME.bombs.slice()) if (!B.leap && !seen.has(B.id)) GAME.dropBomb(B); } }
      else if (d.t === 'bmx') { if (NET.client) { const B = GAME.bombs.find(B => B.id === d.i), m = GAME.swById.get(d.m); if (B && !B.leap) { if (B.fly && m) { B.leap = { t: 0.62, sx: B.fly.x, sz: B.fly.z, tx: m.pos.x, tz: m.pos.z }; B.fly = null; } else GAME.bombBoom(B, m); } } }
      else if (d.t === 'loot') { if (NET.client && Array.isArray(d.a)) for (const q of d.a.slice(0, 120)) if (Array.isArray(q) && Number.isInteger(q[0]) && !GAME.loot.some(L => L.id === q[0])) { GAME.addLoot(q[0], q[1] === 1 ? 1 : 0, num(q[2], -ARENA - 80, ARENA + 80), num(q[3], -ARENA, ARENA), num(q[4], -12, 12), num(q[5], 0, 14), num(q[6], -12, 12)); GS.lootId = Math.max(GS.lootId, q[0]); } }
      else if (d.t === 'lootget') { if (!NET.client) { const i = GAME.loot.findIndex(L => L.id === d.i); if (i >= 0) { const L = GAME.loot[i]; GAME.scene.remove(L.m); GAME.loot.splice(i, 1); netEv({ t: 'lootx', i: L.id }); netEv({ t: 'lootok', gm: L.gem ? 1 : 0 }, from); } } }
      else if (d.t === 'lootok') { if (NET.client) GAME.lootGain(d.gm === 1); }
      else if (d.t === 'lootx') { const i = GAME.loot.findIndex(L => L.id === d.i); if (i >= 0) { GAME.scene.remove(GAME.loot[i].m); GAME.loot.splice(i, 1); } }
      else if (d.t === 'lootreq') { if (!NET.client && (d.k === 'crate' || d.k === 'enemy' || d.k === 'elite')) { NET.applying = false; GAME.lootFrom(d.k, num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); } }
      else if (d.t === 'righit') { if (NET.client) { const m = GAME.swById.get(d.m), n = num(d.n, 0, 3); if (m && m.rig) m.rig.hits = n; GAME.flashAlert(n >= 3 ? 'LOG MACHINE DOWN!' : 'HIT ' + n + '/3'); } }
      else if (d.t === 'bmt') { const B = GAME.bombs.find(B => B.id === d.i); if (B && !B.leap) { B.n = 0; B.fly = { x: num(d.x, -ARENA, ARENA), y: num(d.y, 0, 20), z: num(d.z, -ARENA, ARENA), vx: num(d.vx, -40, 40), vy: num(d.vy, 0, 40), vz: num(d.vz, -40, 40), own: false }; } }
      else if (d.t === 'bmhit') { if (!NET.client) { NET.applying = false; const B = GAME.bombs.find(B => B.id === d.i), m = GAME.swById.get(d.m);
          if (B && m && m.rig && !m.dead && Math.hypot(m.pos.x - (B.fly ? B.fly.x : B.x), m.pos.z - (B.fly ? B.fly.z : B.z)) < 25) { B.rigM = m; B.leap = { t: 0.62, sx: B.fly ? B.fly.x : B.x, sz: B.fly ? B.fly.z : B.z, tx: m.pos.x, tz: m.pos.z }; B.fly = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) B.by = [q.pos.x, q.pos.z]; netEv({ t: 'bmx', i: B.id, m: m.id }); } } }
      else if (d.t === 'bml') { if (!NET.client) { const B = GAME.bombs.find(B => B.id === d.i); if (B && !B.leap) { B.fly = null; B.x = num(d.x, -ARENA, ARENA); B.z = num(d.z, -ARENA, ARENA); } } }
      else if (d.t === 'armed') { let R = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) R = q; if (R && (W_GEAR.includes(d.k) || d.k === 'jump')) GAME.armedFx(R, d.k); }
      else if (d.t === 'bdrop') { if (NET.client) { GS.wbKilled++; GAME.bossDrop(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); } }
      else if (d.t === 'decoy') { GAME.addDecoy(num(d.a, -ARENA, ARENA), num(d.b, -ARENA, ARENA), num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); }
      else if (d.t === 'cubes') { let R = null; for (const q of NET.remotes.values()) if (String(q.peer) === String(from)) R = q; if (R) GAME.spawnCubes(Math.round(num(d.n, 1, 5)), R, Math.round(num(d.l, 0, 2))); }
      else if (d.t === 'dome') { const x = num(d.x, -ARENA, ARENA), z = num(d.z, -ARENA, ARENA), r = num(d.r, 3, 14), T = num(d.T, 0.5, 6); GAME.addDome(x, z, r, T); if (!NET.client) { NET.applying = false; GAME.blastAt(x, z, r, 1, 26, true); } }
      else if (d.t === 'ult') { if ((d.k === 'hands' || d.k === 'sword')) GAME.castUlt(d.k, num(d.x, -ARENA * 2, ARENA * 2), num(d.z, -ARENA, ARENA), num(d.h, -7, 7), false); }
      else if (d.t === 'ultboom') { if (!NET.client) { NET.applying = false; GAME.ultKillAt(num(d.x, -ARENA * 2, ARENA * 2), num(d.z, -ARENA, ARENA), ULT.hands.R); } }
      else if (d.t === 'stomp') { if (!NET.client) { NET.applying = false; GAME.stompAt(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), Math.round(num(d.l, 1, 3))); } }
      else if (d.t === 'slow') { const m = GAME.swById.get(d.i); if (!NET.client && m && !m.dead) m.slow = Math.max(m.slow || 0, num(d.s, 0, 2)); }
      else if (d.t === 'jfx') { if (RIDE_KIT[d.k]) GAME.landFxRemote(d.k, Math.round(num(d.l, 1, 3)), num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA)); }
      else if (d.t === 'blast') { if (!NET.client) { NET.applying = false; GAME.blastAt(num(d.x, -ARENA, ARENA), num(d.z, -ARENA, ARENA), num(d.r, 1, 9), num(d.d, 0, 5), num(d.p, 0, 20), d.s === 1); } }
      else if (d.t === 'alert') { if (NET.client && typeof d.s === 'string') { GAME.flashAlert(d.s.slice(0, 24)); GAME.SFX.play('wave', null); } }
      else if (d.t === 'fx') { const m = GAME.swById.get(d.i); if (NET.client && m && !m.dead && Math.hypot(m.pos.x - GAME.car.pos.x, m.pos.z - GAME.car.pos.z) < 70) {
        if (d.k === 'mb') GAME.miniStart(m, Math.min(MINI_SEQ.length - 1, Math.round(num(d.p, 0, 9))), num(d.a, -9, 9));
        else if (d.k === 'th') GAME.mobThrow(m, num(d.x, -1, 1), num(d.z, -1, 1), num(d.d, 1, 40), Math.round(num(d.p, 0, 2)));
        else if (d.k === 'sp') GAME.spit(m, null, null, new THREE.Vector3(num(d.x, -ARENA, ARENA), num(d.y, 0, 20), num(d.z, -ARENA, ARENA))); } }
      else if (d.t === 'sync?') { if (netAmHost()) netEv(netWorld(), from); }
      else if (d.t === 'sync') {
        if (Array.isArray(d.lt)) for (const q of d.lt.slice(0, 120)) if (Array.isArray(q) && Number.isInteger(q[0]) && !GAME.loot.some(L => L.id === q[0])) { GAME.addLoot(q[0], q[1] === 1 ? 1 : 0, num(q[2], -ARENA - 80, ARENA + 80), num(q[3], -ARENA, ARENA), 0, 0, 0); GS.lootId = Math.max(GS.lootId, q[0]); }
        for (const i of Array.isArray(d.sm) ? d.sm.slice(0, 400) : []) { const o = obAt(i); if (o && (o.pillar || o.rock) && o.mesh.visible) { o.mesh.visible = false; if (o.rock) GAME.rockSmashed(o); } }
        for (const c of Array.isArray(d.cr) ? d.cr.slice(0, 400) : []) { const o = obAt(c && c[0]); if (!o || !o.crate || o.room) continue;
          o.mesh.position.set(num(c[1], -ARENA, ARENA), o.h / 2, num(c[2], -ARENA, ARENA)); o.rc = num(c[4], 0, 1e6);
          if (!c[3] && o.mesh.visible) { o.mesh.visible = false; GAME.respawnQueue.push({ o, t: 4 }); } }
        GAME.boss.dealt = Math.max(GAME.boss.dealt, num(d.bd, 0, 1e6)); if (d.bk === 1 && GAME.boss.state === 'idle') { GAME.boss.state = 'dead'; GAME.setDoor(false); } else if (d.bst === 1 && GAME.boss.state === 'idle') GAME.bossFightNow(d.bn, d.bp);
        if (d.go === 1) NET.goPending = true;
        (Array.isArray(d.pk) ? d.pk : []).forEach(q => { if (Array.isArray(q) && typeof q[0] === 'string' && typeof q[1] === 'string' && GAME.ICONS[q[1]] && !GAME.pickups.some(p => p.id === q[0])) GAME.spawnPickup(q[1], new THREE.Vector3(num(q[2], -400, 400), 0, num(q[3], -400, 400)), q[0], true); });
        (Array.isArray(d.aw) ? d.aw : []).forEach((t, k) => { const A = GAME.altars[k]; if (A && typeof t === 'number' && t >= 0) { A.awake = true; A.spawnT = num(t, 0, 99); } });
        (Array.isArray(d.al) ? d.al : []).forEach((n, k) => { const A = GAME.altars[k]; if (A && Number.isInteger(n) && n > A.n) { A.n = Math.min(GAME.ALTAR_NEED, n); GAME.altarApply(A); } });
        if (NET.goPending) { NET.goPending = false; GAME.openGate(); }
        if (Array.isArray(d.ph) && Number.isInteger(d.ph[0]) && d.ph[0] >= 0 && d.ph[0] < PHASES.length) {
          if (d.ph[0] !== PH.i) phEnter(d.ph[0], num(d.ph[1], 0, 60)); else PH.brk = num(d.ph[1], 0, 60);
          PH.clr = num(d.ph[2], 0, 99) | 0; PH.wv = num(d.ph[3], 0, 99) | 0; PH.hellN = num(d.ph[4], 0, 99) | 0; PH.t = num(d.ph[5], 0, 9999);
          if (d.ph[6] === 1) PH.gate = true;
        }
        (Array.isArray(d.fa) ? d.fa : []).forEach((v, k) => { if (v === 1 && GAME.altars[k]) GAME.altars[k].found = true; });
        for (const i of Array.isArray(d.fr) ? d.fr.slice(0, 64) : []) { const o = obAt(i); if (o && o.rock) o.found = true; }
      }
    } finally { NET.applying = false; }
  }
  const tmp2net = new THREE.Vector3();
  // ---- shared diagnostics: every player reports what it sees every 2 s, and notable events go to a log everyone in the lobby shares ----
  const DG = { open: false, log: [], stats: new Map(), rx: 0, rxRate: 0, lastSw: 0, ghost: 0, ghostSent: 0, t0: performance.now(), frames: 0, fps: 0, sendT: 0, gap: false, logBudget: 6,
    nick: peer => { const p = NET.room && NET.room.peers().find(q => String(q.peer) === String(peer)); return (p && cleanNick((p.presence || {}).nick)) || String(peer).slice(0, 5); } };
  const diagEl = document.getElementById('diag'), diagT = document.getElementById('diagT'), diagL = document.getElementById('diagL');
  function diagAdd(who, s) { const d = new Date(); DG.log.push(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${who}: ${s}`); if (DG.log.length > 300) DG.log.shift(); DG.dirty = true; }
  function netLog(s) { diagAdd(NET.nick || 'me', s); if (DG.logBudget > 0) { DG.logBudget--; netEv({ t: 'log', s }); } }
  function diagToggle() { DG.open = !DG.open; diagEl.style.display = DG.open ? 'block' : 'none'; DG.dirty = true; }
  function diagMine() {                                  // what this player's copy of the world looks like right now
    let m = 0, ms = 0, c = 0, sm = 0;
    for (const x of GAME.swarm) if (!x.dead) { m++; ms = (ms + x.id * 31) % 9973; }
    for (const x of GAME.chubs) if (!x.dead && x.state !== 'cart') c++;
    for (const o of GAME.obstacles) if ((o.pillar || o.rock) && !o.mesh.visible) sm++;
    return { b: GAME.BUILD, r: !NET.game ? 'solo' : NET.client ? 'guest' : 'HOST', n: NET.nick, f: Math.round(DG.fps), m, ms, c, k: GAME.cart.riders.length, al: GAME.altars.map(A => A.n).join('/'), sm, hp: Math.round(GAME.car.hp),
      x: Math.round(GAME.car.pos.x), z: Math.round(GAME.car.pos.z), ride: GS.ride, pl: NET.remotes.size + 1, age: NET.client ? Math.round(performance.now() - DG.lastSw) : 0, rx: DG.rxRate, gh: DG.ghost, vis: document.hidden ? 0 : 1, md: GAME.car.mode, inp: GAME.COARSE ? 'touch' : 'keys', slip: DG.slip | 0 };
  }
  function diagRender() {
    DG.dirty = false; if (!DG.open) return;
    const rows = [['me', diagMine()]]; for (const [peer, v] of DG.stats) if (performance.now() - v.at < 8000) rows.push([DG.nick(peer), v.o]);
    const host = rows.map(r => r[1]).find(o => o.r === 'HOST'), bad = (o, key, tol) => host && o !== host && Math.abs((+o[key] || 0) - (+host[key] || 0)) > tol;
    const cols = [['who', (o, w) => w + (o.n && w === 'me' ? ' (' + o.n + ')' : '')], ['role', o => o.r], ['build', o => o.b, o => host && o.b !== host.b], ['fps', o => o.f, o => o.f < 25], ['players', o => o.pl, o => bad(o, 'pl', 0)],
      ['monsters', o => o.m, o => bad(o, 'm', 4)], ['chubziks', o => o.c, o => bad(o, 'c', 6)], ['cart', o => o.k], ['altars', o => o.al, o => host && o.al !== host.al], ['smashed', o => o.sm, o => bad(o, 'sm', 0)],
      ['hp', o => o.hp], ['pos', o => o.x + ',' + o.z], ['ride', o => o.ride], ['snap age ms', o => o.r === 'guest' ? o.age : '-', o => o.r === 'guest' && o.age > 1500], ['snap/s', o => o.r === 'guest' ? o.rx : '-'], ['ghost bites', o => o.gh, o => o.gh > 0], ['steer', o => (o.inp || '?') + '/' + (o.md || '?')], ['slip°', o => o.slip == null ? '?' : o.slip, o => o.ride !== 'halo' && o.ride !== 'spider' && o.slip > 50], ['tab', o => o.vis ? 'shown' : 'HIDDEN', o => !o.vis]];
    const esc = v => String(v == null ? '' : v).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    diagT.innerHTML = '<tr>' + cols.map(c => `<th style="text-align:left;padding:1px 6px 1px 0;color:#8fa0b8;font-weight:600">${c[0]}</th>`).join('') + '</tr>' +
      rows.map(([w, o]) => '<tr>' + cols.map(c => `<td style="padding:1px 6px 1px 0;${c[2] && c[2](o) ? 'color:#ff6a5a;font-weight:700' : ''}">${esc(c[1](o, w))}</td>`).join('') + '</tr>').join('');
    diagL.textContent = DG.log.slice(-60).join('\n') || 'No events yet. Red cells differ from the host.';
    DG.text = rows.map(([w, o]) => w + ' ' + JSON.stringify(o)).join('\n') + '\n' + DG.log.join('\n');
  }
  function updateDiag() {
    const now = performance.now(); DG.frames++;
    { const sp = Math.hypot(GAME.car.vel.x, GAME.car.vel.z);        // how far the ride's nose is from where it is actually going (worst over the last seconds)
      if (sp > 6 && GAME.car.alive) { const d = Math.atan2(GAME.car.vel.x, GAME.car.vel.z) - GAME.car.heading, a = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 57.3; DG.slip = Math.max(DG.slip || 0, a > 90 && GAME.car.speed < 0 ? 180 - a : a); }
      if ((DG.slipT = (DG.slipT || 0) + 1) > 240) { DG.slipT = 0; DG.slip = 0; } }
    if (now - DG.t0 >= 1000) { DG.fps = DG.frames * 1000 / (now - DG.t0); DG.frames = 0; DG.t0 = now; DG.rxRate = DG.rx; DG.rx = 0; DG.logBudget = Math.min(6, DG.logBudget + 2); DG.dirty = true;
      if (NET.on && NET.client) { const gap = now - DG.lastSw > 2500; if (gap !== DG.gap) { DG.gap = gap; netLog(gap ? 'no monster snapshots from the host for 2.5 s' : 'snapshots are back'); } }
      if (DG.ghost > DG.ghostSent) { netLog('ignored ' + (DG.ghost - DG.ghostSent) + ' bite(s) from monsters I cannot see'); DG.ghostSent = DG.ghost; }
      if (NET.on && NET.game && (DG.sendT = (DG.sendT + 1) % 2) === 0) netEv({ t: 'st', o: diagMine() });
    }
    if (DG.dirty) diagRender();
  }
  document.addEventListener('visibilitychange', () => { if (NET.on && NET.game) netLog(document.hidden ? 'tab went to the background (my game is paused' + (NET.client ? ')' : ' — and so are the monsters for everyone)') : 'tab is back'); });
  document.getElementById('diagClose').addEventListener('click', diagToggle);
  document.getElementById('diagCopy').addEventListener('click', () => { diagRender(); const t = DG.text || ''; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(() => { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }); document.getElementById('diagCopy').textContent = 'copied'; setTimeout(() => { document.getElementById('diagCopy').textContent = 'copy all'; }, 1200); });
  for (const ev of ['mousedown', 'touchstart', 'pointerdown', 'pointerup', 'click', 'wheel']) diagEl.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  function crateRemote(o) {                              // someone else broke it: same splinters, no score, no drop
    if (o.carried) { GAME.releaseIfHeld(o); o.carried = false; }
    o.mesh.visible = false; GAME.spawnParticles(o.mesh.position, 0xd2873c, 12, 8); GAME.SFX.play('crate_break', o.mesh.position, { vol: 0.6 });
    GAME.respawnQueue.push({ o, t: 4 });
  }
  function chubGift() {                                  // a chubzik ran to our cart in another player's world
    const stub = GAME.nearestRock(GAME.car.pos.x, GAME.car.pos.z) || { mesh: { position: GAME.car.pos.clone(), visible: true }, r: 3, h: 2.5, top: 2 };
    const c = GAME.spawnChub(stub, false); c.pos.set(GAME.cart.pos.x, 0, GAME.cart.pos.z); GAME.cartAdd(c);
  }
  function netCollide() {                                // rides are solid to each other: each player pushes their own ride out
    if (!GAME.car.alive || GAME.car.depth > 0.3) return;
    for (const R of NET.remotes.values()) {
      if (!R.up || Math.abs(R.pos.y - GAME.car.y) > 1.6) continue;
      const dx = GAME.car.pos.x - R.pos.x, dz = GAME.car.pos.z - R.pos.z, d = Math.hypot(dx, dz), minD = GAME.car.radius * 2;
      if (d >= minD) continue;
      const side = String(netMe()) < String(R.peer) ? -1 : 1;                  // stacked exactly on top of each other (same spawn point): split by peer id
      const nx = d > 0.05 ? dx / d : side, nz = d > 0.05 ? dz / d : 0, push = (minD - d) * 0.6;
      GAME.car.pos.x += nx * push; GAME.car.pos.z += nz * push;
      const vn = GAME.car.vel.x * nx + GAME.car.vel.z * nz;
      if (vn < 0) { GAME.car.vel.x -= nx * vn * 1.3; GAME.car.vel.z -= nz * vn * 1.3; GAME.car.speed *= 0.8; if (GS.ride === 'spider') { GAME.SPD.vel.x -= nx * vn * 1.3; GAME.SPD.vel.z -= nz * vn * 1.3; }
        if (-vn > 8 && (NET.bumpT || 0) < GS.elapsed) { NET.bumpT = GS.elapsed + 0.4; GAME.cartSpill(1); GS.shake = Math.max(GS.shake, 0.3); GAME.SFX.play('clang', GAME.car.pos, { vol: 0.5 }); GAME.spawnParticles(GAME.tmp.set(GAME.car.pos.x - nx * GAME.car.radius, 1, GAME.car.pos.z - nz * GAME.car.radius), 0xffd27a, 6, 6); } }
    }
  }
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  function netPose() {                                  // how the ride is posed right now: cart sway, how deep it is dug in, gallop phase, the spider's tilt and feet
    const o = { cp: r2(GAME.cart.phi), dp: r2(GAME.car.depth), ph: r2(GS.ridePhase % 1000) };
    if (GS.ride === 'spider' && GAME.rideG.spider && GAME.rideG.spider.feet) {
      const q = GAME.carGroup.quaternion; o.q = [r2(q.x), r2(q.y), r2(q.z), r2(q.w)];
      o.ft = []; for (const L of GAME.rideG.spider.feet) o.ft.push(r1(L.foot.x), r1(L.foot.y), r1(L.foot.z));
    }
    return o;
  }
  function netSend() {
    NET.room.presence({ game: NET.game, hostNick: NET.hostNick, nick: NET.nick, ride: GS.ride, x: r1(GAME.car.pos.x), z: r1(GAME.car.pos.z), y: r1(GAME.car.y), h: r2(GAME.car.heading), t: r2(GAME.car.heading + GAME.turret.rotation.y),
      cx: r1(GAME.cart.pos.x), cz: r1(GAME.cart.pos.z), ch: r2(GS.ride === 'spider' ? GAME.cart.vis : GAME.cart.heading), cn: GAME.cart.riders.length, cs: GAME.cart.shown ? 1 : 0,
      a: GAME.car.alive && GAME.car.depth < 0.5 ? 1 : 0, f: NET.fireSeq, hp: NET.isHost ? 1 : 0, v: VER, wo: GAME.weapons.orbit, tw: GS.myTow, pp: GAME.pedestals.filter(P => P.state !== 'gone').map(P => [P.x, P.z]), ak: GAME.gearDone() ? 1 : 0, ks: GAME.kit().every(t => GAME.abilities[t]) ? 1 : 0, gd: W_GEAR.every(k => GAME.weapons[k]) && GAME.abilities.jump ? 1 : 0, tl: GS.ride === 'unicorn' && GAME.abilities.trail ? GAME.abLv.trail + 1 : 0, vw: r1(GAME.camera.right / GAME.camera.zoom), vh: r1(GAME.camera.top / GAME.camera.zoom), ...netPose() }).catch(() => {});
  }
  // simple stand-in models for the other players
  function buildProxy(k) {
    const g = new THREE.Group(), tur = new THREE.Group(); g.add(tur);
    const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3, flatShading: true });
    const P = (geo, mat, x, y, z, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    const dk = M(0x2a2630), gun = () => { P(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), dk, 0, 0, 1.0, tur).rotation.x = Math.PI / 2; P(new THREE.BoxGeometry(0.5, 0.4, 0.6), dk, 0, 0, 0, tur); };
    if (k === 'spider') {
      P(new THREE.BoxGeometry(2.3, 0.36, 2.3), dk, 0, 0.95, 0);
      const pg = new THREE.CylinderGeometry(0.5, 1.15, 1.35, 4); pg.rotateY(Math.PI / 4); P(pg, new THREE.MeshStandardMaterial({ color: 0x3a9ab0, transparent: true, opacity: 0.5, flatShading: true }), 0, 1.95, 0);
      for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.6, o = new THREE.Vector3(sd * 1.1, 0.95, (i - 1.5) * 0.55), kn = new THREE.Vector3(sd * (1.1 + Math.cos(a)), 1.7, o.z + Math.sin(a)), ft = new THREE.Vector3(sd * (1.1 + 1.5 * Math.cos(a)), 0, o.z + 1.6 * Math.sin(a)); GAME.strut(o, kn, 0.15, dk, g); GAME.strut(kn, ft, 0.11, dk, g); }
      tur.position.set(0, 3, 0); P(new THREE.SphereGeometry(0.62, 12, 8), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 1.4), 0, 0, 0, tur).scale.set(1.55, 0.78, 0.7);
    } else if (k === 'halo') {
      const gold = new THREE.MeshStandardMaterial({ color: 0xe8d28a, metalness: 0.9, roughness: 0.25, flatShading: true });
      P(new THREE.TorusGeometry(1.75, 0.2, 6, 20), gold, 0, 2, 0).rotation.y = 0.6; P(new THREE.TorusGeometry(1.32, 0.17, 6, 18), gold, 0, 2, 0).rotation.x = 1.1;
      P(new THREE.BoxGeometry(0.7, 1.2, 0.4), M(0xf4f1e8), 0, 1.9, 0); tur.position.set(0, 2, 0); P(new THREE.ConeGeometry(0.22, 1.5, 5), gold, 0, 0, 2.3, tur).rotation.x = Math.PI / 2;
    } else if (k === 'unicorn') {
      const wh = M(0xf2eef6);
      P(new THREE.BoxGeometry(1.5, 1.25, 2.7), wh, 0, 1.75, -0.1); P(new THREE.BoxGeometry(0.95, 0.95, 1.15), wh, 0, 3.0, 1.85); P(new THREE.ConeGeometry(0.16, 1.0, 5), M(0xf0b428), 0, 3.9, 2.1);
      for (const x of [-0.5, 0.5]) for (const z of [0.95, -1.15]) P(new THREE.BoxGeometry(0.4, 1.2, 0.4), wh, x, 0.6, z);
      tur.position.set(0, 2.95, -0.75); gun();
    } else {
      P(new THREE.BoxGeometry(2.1, 0.8, 4.3), M(0x3a3532), 0, 0.85, 0); P(new THREE.BoxGeometry(2.0, 0.5, 2.0), M(0x5e2c14), 0, 1.45, -0.4);
      for (const x of [-1.15, 1.15]) for (const z of [1.35, -1.35]) P(new THREE.CylinderGeometry(z < 0 ? 0.64 : 0.5, z < 0 ? 0.64 : 0.5, 0.44, 10), M(0x131417), x, z < 0 ? 0.64 : 0.5, z).rotation.z = Math.PI / 2;
      for (const x of [-0.92, 0.92]) for (const z of [0.6, -1.44]) P(new THREE.BoxGeometry(0.11, 0.86, 0.11), dk, x, 1.63, z);
      tur.position.set(0, 2.04, -0.5); gun();
    }
    return { g, tur };
  }
  function netLabel(R, text) {
    if (R.labelText === text) return; R.labelText = text;
    const cv = GAME.mkCanvas(256, 64), c = cv.getContext('2d'); c.font = '700 30px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.min(250, c.measureText(text).width + 24); c.fillStyle = 'rgba(20,22,26,.78)'; c.beginPath(); c.rect(128 - w / 2, 10, w, 44); c.fill();
    c.fillStyle = '#ffe07a'; c.fillText(text, 128, 33, 240);
    if (R.label.material.map) R.label.material.map.dispose();
    R.label.material.map = GAME.srgbTex(cv); R.label.material.needsUpdate = true;
  }
  function netRemote(p, pr) {
    let R = NET.remotes.get(p.peer); const k = GAME.RIDES[pr.ride] ? pr.ride : 'buggy';
    if (R && R.ride !== k) { GAME.scene.remove(R.g, R.cart, R.label, ...(R.riders || []), ...(R.saws || [])); NET.remotes.delete(p.peer); R = null; }
    if (!R) {
      let m, cartM; try { m = GAME.rideClone(k); cartM = m.cart; } catch (e) { console.warn('rideClone', e); m = buildProxy(k); }
      if (!cartM) cartM = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 2.3), new THREE.MeshStandardMaterial({ color: k === 'spider' ? 0x2a2630 : 0x8a5a30, roughness: 0.85, flatShading: true }));
      cartM.castShadow = true; cartM.userData.y = m.cart ? 0 : 0.75; const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); label.scale.set(5, 1.25, 1); label.renderOrder = 25; label.material.color.setScalar(0.8);
      GAME.scene.add(m.g, cartM, label);
      R = { ride: k, g: m.g, tur: m.tur, cart: cartM, label, pos: new THREE.Vector3(num(pr.x, -400, 400), num(pr.y, 0, 60), num(pr.z, -400, 400)), h: num(pr.h, -99, 99), anim: m.anim || [], ph: 0, lastF: pr.f, cpos: new THREE.Vector3(num(pr.cx, -400, 400), 0, num(pr.cz, -400, 400)), vel: new THREE.Vector3(), cn: 0 };
      R.tc = { pos: R.pos, vel: R.vel, alive: false, depth: 0, y: 0, radius: GAME.car.radius, burrow: 'up', R };
      R.nick = cleanNick(pr.nick) || ''; NET.remotes.set(p.peer, R); netLog('sees ' + (cleanNick(pr.nick) || 'Driver') + ' (' + k + ')');
    }
    return R;
  }
  const ikV = new THREE.Vector3();
  function cloneIK(a, foot) {                           // same two-bone solve as the owner's spider, on the copy's hip/thigh/knee
    const hip = a.o, fem = a.fem, knee = fem && fem.children.find(c => c.isGroup), root = hip.parent; if (!knee || !root) return;
    ikV.copy(foot); root.worldToLocal(ikV); ikV.sub(hip.position);
    hip.rotation.y = Math.atan2(ikV.x, ikV.z);
    const h = Math.hypot(ikV.x, ikV.z), v = ikV.y, l1 = GAME.SPL.L1, l2 = GAME.SPL.L2;
    const d = THREE.MathUtils.clamp(Math.hypot(h, v), 0.3, l1 + l2 - 0.001);
    const an = Math.atan2(v, h), alpha = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const inner = Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    fem.rotation.x = -(an + alpha); knee.rotation.x = Math.PI - inner;
  }
  function updateNet(dt) {
    if (!NET.on || !NET.room) { netEl.textContent = ''; return; }
    if ((NET.sendT -= dt) <= 0) { NET.sendT = 0.08; netSend(); }
    if (netMe() && (NET.roleT = (NET.roleT || 0) - dt) <= 0) { NET.roleT = 0.5; netRole(); }
    if (!NET.client && NET.remotes.size && (NET.snapT = (NET.snapT || 0) - dt) <= 0) { NET.snapT = 0.2; netSnap(); }
    if (NET.client && NET.hostPeer && NET.bdAcc > 0 && (NET.bdT = (NET.bdT || 0) - dt) <= 0) { NET.bdT = 0.25; netEv({ t: 'bd', d: r1(NET.bdAcc) }, NET.hostPeer); NET.bdAcc = 0; }
    if (!NET.client && NET.remotes.size && (GAME.boss.state === 'fight' || GAME.boss.state === 'flee') && (NET.bhT = (NET.bhT || 0) - dt) <= 0) { NET.bhT = 0.3; netEv({ t: 'bhp', d: r1(GAME.boss.dealt), m: Math.round(GAME.bossMax()), p: GAME.boss.ph }); }
    if (!NET.synced && netMe()) { NET.synced = true; if (!NET.isHost) netEv({ t: 'sync?' }); }      // ask the host what has already been broken and fed
    const seen = new Set(); let n = 1;
    for (const p of NET.room.peers()) {
      const pr = p.presence || {};
      if ((p.isMe && p.sameTab) || p.kind !== 'viewer' || pr.game !== NET.game || pr.v !== VER) continue;
      n++; seen.add(p.peer);
      const R = netRemote(p, pr), k = 1 - Math.exp(-12 * dt);
      GAME.tmp.set(num(pr.x, -400, 400), num(pr.y, 0, 60), num(pr.z, -400, 400));
      const ox = R.pos.x, oz = R.pos.z;
      if (R.pos.distanceTo(GAME.tmp) > 25) R.pos.copy(GAME.tmp); else { R.pos.lerp(GAME.tmp, k); R.vel.lerp(GAME.tmp.set((R.pos.x - ox) / Math.max(dt, 1e-3), 0, (R.pos.z - oz) / Math.max(dt, 1e-3)), 0.25); }
      const th = num(pr.h, -99, 99); R.h += Math.atan2(Math.sin(th - R.h), Math.cos(th - R.h)) * k;
      const up = pr.a === 1; R.up = up; R.peer = p.peer; R.tc.alive = up; R.tc.y = R.pos.y;
      R.vw = num(pr.vw, 8, 80) || 34; R.vh = num(pr.vh, 8, 80) || 22; R.ak = pr.ak === 1; R.tw = Number.isInteger(pr.tw) ? pr.tw : 0; R.pp = Array.isArray(pr.pp) ? pr.pp.slice(0, 4).filter(q => Array.isArray(q)).map(q => [num(q[0], -ARENA, ARENA), num(q[1], -ARENA, ARENA)]) : []; R.ks = pr.ks === 1; R.gd = pr.gd === 1; R.tl = Math.round(num(pr.tl, 0, 3));      // their screen size (waves stay off it) and whether their kit is complete
      if (pr !== R.posePr) { R.posePr = pr; if (typeof pr.ph === 'number') { const d = num(pr.ph, -1e4, 1e4) * 2.4 - R.ph; R.ph += Math.abs(d) > 6 ? d : d * 0.3; } }
      const feet = R.ride === 'spider' && Array.isArray(pr.ft) && pr.ft.length === 24 ? pr.ft : null;
      if (R.anim.length && !feet) { const spd = Math.hypot(R.vel.x, R.vel.z), kk = Math.min(1, spd / 5); R.ph += spd * dt * (R.ride === 'spider' ? 0.9 : 1.08) * (R.ride === 'unicorn' ? 2.4 * 0.45 / 1.08 : 1);
        for (const a of R.anim) {
          if (a.t === 'leg') { const q = R.ph + a.grp * Math.PI; a.o.rotation.y = a.by + Math.sin(q) * 0.32 * kk; if (a.fem) a.fem.rotation.x = a.bx - Math.max(0, Math.cos(q)) * 0.3 * kk; }
          else if (a.t === 'uleg') a.o.rotation.x = Math.sin(R.ph + a.grp * Math.PI) * 0.7 * kk;
          else if (a.k === 1) a.o.rotation.y += dt * (1.2 + spd * 0.12); else a.o.rotation.x += dt * (1.7 + spd * 0.15);
        } }
      R.g.visible = up; R.g.position.copy(R.pos); R.g.position.y -= num(pr.dp, 0, 1) * GAME.BURY_DEPTH;
      if (R.ride === 'spider' && Array.isArray(pr.q) && pr.q.length === 4) {          // stuck to a wall: the real tilt
        R.qT = R.qT || new THREE.Quaternion(); R.qT.set(num(pr.q[0], -1, 1), num(pr.q[1], -1, 1), num(pr.q[2], -1, 1), num(pr.q[3], -1, 1)).normalize();
        R.g.quaternion.slerp(R.qT, k);
      } else R.g.rotation.set(0, R.h, 0);
      R.tur.rotation.y = num(pr.t, -99, 99) - R.h;
      if (feet) {                                         // the spider's feet where the owner has them; the legs bend to reach them
        R.g.updateMatrixWorld(true);
        const legsA = R.anim.filter(a => a.t === 'leg'); R.ftS = R.ftS || legsA.map(() => new THREE.Vector3());
        legsA.forEach((a, i) => { const f = R.ftS[i]; GAME.tmp.set(num(feet[i * 3], -400, 400), num(feet[i * 3 + 1], -5, 60), num(feet[i * 3 + 2], -400, 400));
          if (f.distanceTo(GAME.tmp) > 8) f.copy(GAME.tmp); else f.lerp(GAME.tmp, k); cloneIK(a, f); });
      }
      { const body = R.cart.children && R.cart.children[0], phi = num(pr.cp, -1, 1); R.cphi = (R.cphi || 0) + (phi - (R.cphi || 0)) * k;
        if (body) { body.rotation.z = R.cphi; body.position.y = Math.abs(R.cphi) * 0.25; } }
      R.cpos.lerp(GAME.tmp.set(num(pr.cx, -400, 400), 0, num(pr.cz, -400, 400)), k);
      R.cart.visible = up && pr.cs === 1; R.cart.position.set(R.cpos.x, R.cart.userData.y, R.cpos.z); R.cart.rotation.y = num(pr.ch, -99, 99);
      R.label.visible = up; R.label.position.set(R.pos.x, R.pos.y + 5.2, R.pos.z);
      { const show = R.cart.visible ? Math.min(18, Math.round(num(pr.cn, 0, 999))) : 0, rs = R.riders || (R.riders = []), ch = R.cart.rotation.y, rx = Math.cos(ch), rz = -Math.sin(ch), fx = Math.sin(ch), fz = Math.cos(ch);
        while (rs.length < show) { const sp = new THREE.Sprite(GAME.chubMats[0][0]); sp.center.set(0.5, 0.04); sp.scale.set(GAME.CHUB_SIZE * 0.85, GAME.CHUB_SIZE * 0.85, 1); GAME.scene.add(sp); rs.push(sp); }
        rs.forEach((sp, i) => { sp.visible = i < show; if (i >= show) return;
          const lx = (i % 3 - 1) * 0.56, lz = (Math.floor(i / 3) % 3 - 1) * 0.66, ly = 0.2 + Math.floor(i / 9) * 0.5;
          sp.material = GAME.chubMats[0][Math.floor(GS.elapsed * 3 + i) % GAME.CHUB_FR];
          sp.position.set(R.cpos.x + rx * lx + fx * lz, 0.68 + ly + Math.abs(Math.sin(GS.elapsed * 9 + i)) * 0.06, R.cpos.z + rz * lx + fz * lz); }); }
      { const L = Math.round(num(pr.wo, 0, 5)) - 1, want = up && L >= 0 ? W_STATS.orbit.n[L] * (R.ride === 'halo' ? 2 : 1) : 0, sw = R.saws || (R.saws = []), uni = R.ride === 'unicorn';      // their saws / dodecahedra
        while (sw.length < want) { const m = new THREE.Mesh(uni ? GAME.dodecaGeo : GAME.sawGeo, uni ? GAME.dodecaMats[sw.length % GAME.dodecaMats.length] : GAME.sawMat); m.scale.setScalar(uni ? 1.1 : 1.4); GAME.scene.add(m); sw.push(m); }
        sw.forEach((m, i) => { m.visible = i < want; if (i >= want) return; const a = GS.elapsed * W_STATS.orbit.spd[L] * (R.ride === 'halo' ? 1.86 : 1) + i / want * 6.283, rr = W_STATS.orbit.r[L];
          m.position.set(R.pos.x + Math.sin(a) * rr, 1 + R.pos.y, R.pos.z + Math.cos(a) * rr); if (uni) { m.rotation.x += dt * 3; m.rotation.y += dt * 4; } else m.rotation.y += dt * 22; }); }
      const cn = Math.round(num(pr.cn, 0, 999)); if (pr !== R.lastPr) { R.lastPr = pr; R.cn = cn; } netLabel(R, (cleanNick(pr.nick) || 'Driver') + (cn ? ' · ' + cn : ''));
      if (pr.f !== R.lastF) {                            // they fired: a tracer for show, no damage
        R.lastF = pr.f;
        if (up && Math.hypot(R.pos.x - GAME.car.pos.x, R.pos.z - GAME.car.pos.z) < 70) {
          const yaw = num(pr.t, -99, 99), m = new THREE.Mesh(R.ride === 'spider' ? GAME.starGeo : GAME.bulletGeo, R.ride === 'spider' ? GAME.starMat : GAME.bulletMat);
          R.tur.getWorldPosition(m.position); m.rotation.y = yaw; GAME.scene.add(m);
          NET.shots.push({ m, v: new THREE.Vector3(Math.sin(yaw) * 60, -2.5, Math.cos(yaw) * 60), life: 0.45 });
        }
      }
    }
    netCollide();
    for (const [peer, R] of NET.remotes) if (!seen.has(peer)) { netLog('lost ' + (R.labelText || 'a player')); GAME.scene.remove(R.g, R.cart, R.label, ...(R.riders || []), ...(R.saws || [])); NET.remotes.delete(peer); }
    for (let i = NET.shots.length - 1; i >= 0; i--) { const s = NET.shots[i]; s.life -= dt; s.m.position.addScaledVector(s.v, dt); if (s.life <= 0 || s.m.position.y < 0.1) { GAME.scene.remove(s.m); NET.shots.splice(i, 1); } }
    if (n > 1) NET.had = true;
    const t = `Lobby: ${NET.hostNick}'s · ${n} player${n > 1 ? 's' : ''}` + (n === 1 && NET.had ? ' · others lost, waiting for them to reconnect' : ''); if (netEl.textContent !== t) netEl.textContent = t;
  }

  // ---- edge-of-screen pointers: chubzik rocks, unfed altars and the boss gate once you get near them ----
  const hints = [], hintV = new THREE.Vector3(); let hintT = 0, hintList = [];
  function hintEl(i) {
    while (hints.length <= i) { const d = document.createElement('div'); d.className = 'hint'; d.innerHTML = '<i></i><b></b><u></u>'; document.body.appendChild(d); hints.push({ d, arrow: d.firstChild, label: d.children[1], cap: d.lastChild, text: '', col: '', capT: '', side: '' }); }
    return hints[i];
  }
  // ---- phases: the run is a chain of phases, each a few waves with its own goals and a break before the next. The host runs it ----
  const NEST_GOAL = 4, FIND_R = 34;
  const PH = { i: 0, brk: PHASES[0].brk, wv: 0, clr: 0, t: 0, hellN: 0, gate: false, cardT: 0, shown: -1, lootT: 0, findT: 0 };
  function waveMul() {                                 // how thick a wave is: phase, fed altars, and +35% per friend in the lobby
    let o = 0; if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up) o++;
    return PHASES[PH.i].mul * (PHASES[PH.i].key === 'save' ? 1 + 0.3 * GS.altarsDone : 1) * (1 + 0.35 * Math.min(3, o));
  }
  const hellTotal = () => { let o = 0; if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up) o++; return 12 + 4 * Math.min(3, o); };      // 12 for one, +4 per friend
  const hellAlive = () => { let n = 0; for (const m of GAME.swarm) if (!m.dead && m.hell) n++; return n; };
  const foundN = () => ({ a: GAME.altars.filter(A => A.found).length, r: GAME.rocks.filter(R => R.found).length });
  function phDone() {
    const k = PHASES[PH.i].key, f = foundN();
    if (k === 'roll') return GAME.gearDone() && (!(NET.on && NET.game) || [...NET.remotes.values()].every(R => R.ak)) && GS.wbSpawned && GS.rigOwed === 0 && !GAME.swarm.some(m => m.rig && !m.dead);
    if (k === 'scout') return f.a >= GAME.altars.length && f.r >= Math.min(NEST_GOAL, GAME.rocks.length) && PH.gate;
    if (k === 'save') return GS.altarsDone >= 3;
    if (k === 'hell') return PH.hellN >= hellTotal() && hellAlive() === 0;
    return false;
  }
  function phEnter(i, brk) {                           // everybody: a new phase (or the break before it) begins
    PH.i = i; PH.brk = brk; PH.wv = 0; PH.clr = 0; PH.t = 0; PH.cardT = brk > 0 ? brk : 3.5; PH.shown = -1;
    GAME.waves.pending = false; GAME.waves.gap = 3;
    const k = PHASES[i].key;
    if (k === 'boss') GAME.openGate();
    GAME.SFX.play('wave', null, { rate: 0.8 });
  }
  function phAdvance() {                               // host: goals met, on to the next phase
    if (PH.i >= PHASES.length - 1) return;
    const i = PH.i + 1; phEnter(i, PHASES[i].brk);
    netEv({ t: 'ph', i, b: PH.brk });
    if (PHASES[i].key === 'boss') netEv({ t: 'gate' });
  }
  function phFind(kind, idx) {                         // something was spotted: mark it for everybody; the host pays out a little loot
    const o = kind === 'a' ? GAME.altars[idx] : kind === 'r' ? GAME.obstacles[idx] : null;
    if (kind === 'g') { if (PH.gate) return; PH.gate = true; } else { if (!o || o.found) return; o.found = true; }
    const at = kind === 'g' ? GAME.tmp.set(GAME.ROOM_X1 - 10, 0, 0) : kind === 'a' ? GAME.tmp.set(o.x, 0, o.z) : GAME.tmp.set(o.mesh.position.x, 0, o.mesh.position.z);
    const f = foundN();
    GAME.flashAlert(kind === 'a' ? `ALTAR FOUND ${f.a}/${GAME.altars.length}` : kind === 'g' ? 'BOSS GATE FOUND' : `NEST FOUND ${Math.min(f.r, NEST_GOAL)}/${NEST_GOAL}`);
    if (!NET.client) netEv({ t: 'fd', k: kind, i: idx });
  }
  function phScan() {                                  // anyone driving close enough discovers things (each machine checks, the host's word is final)
    const ps = []; if (GAME.car.alive) ps.push(GAME.car.pos); if (NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up) ps.push(R.pos);
    const near = (x, z, r) => ps.some(p => Math.hypot(p.x - x, p.z - z) < r);
    if (GS.worldUp) GAME.altars.forEach((A, i) => { if (!A.found && near(A.x, A.z, FIND_R)) phFind('a', i); });
    for (const R of GAME.rocks) if (!R.found && R.mesh.visible && near(R.mesh.position.x, R.mesh.position.z, FIND_R - 8)) phFind('r', GAME.obstacles.indexOf(R));
    if (!PH.gate && near(GAME.ROOM_X1, 0, 50)) phFind('g', 0);
  }
  const phEl = document.getElementById('phcard'), phPn = phEl.querySelector('.pn'), phNm = phEl.querySelector('.nm'), phDs = phEl.querySelector('.ds'), phCd = phEl.querySelector('.cd');
  let phFitW = 0;
  function phFit() {                                     // shrink the card so it never runs under the objectives panel, the buttons or the minimap
    phFitW = innerWidth;
    const touch = document.body.classList.contains('touch'), side = Math.max(tasksEl.getBoundingClientRect().right, touch ? 150 : 120) + 12;
    const k = Math.max(0.42, Math.min(touch ? 0.62 : 1, (innerWidth / 2 - side) * 2 / Math.max(1, phEl.offsetWidth)));
    phEl.style.setProperty('--k', k.toFixed(3));
  }
  function updatePhases(dt) {
    if (GAME.startEl.isConnected) return;
    if (!GS.worldUp && PH.i >= 1) GAME.worldWake();
    if (GAME.rising.length) GAME.updateRising(dt);
    if ((PH.findT -= dt) <= 0) { PH.findT = 0.4; if (!NET.client) phScan(); }
    if (PH.brk > 0) PH.brk = Math.max(0, PH.brk - dt); else PH.t += dt;
    if (!NET.client) {
      if (PH.brk <= 0 && phDone()) phAdvance();
    }
    // the card: the next phase's name during a break with a countdown, a few seconds at the start of a phase
    PH.cardT -= dt; const on = PH.brk > 0 || PH.cardT > 0;
    phEl.classList.toggle('on', on);
    if (on) {
      const P = PHASES[PH.i];
      if (PH.shown !== PH.i) { PH.shown = PH.i; phPn.textContent = 'PHASE ' + (PH.i + 1) + ' / ' + PHASES.length; phNm.textContent = P.name; phDs.textContent = P.desc;
        phEl.classList.remove('slap'); void phEl.offsetWidth; phEl.classList.add('slap'); phFitW = 0; }
      if (phFitW !== innerWidth) phFit();
      const cd = PH.brk > 0 ? 'starts in ' + Math.ceil(PH.brk) : 'GO!'; if (phCd.textContent !== cd) { phCd.textContent = cd; phCd.classList.toggle('go', PH.brk <= 0); }
    }
  }
  const tkDone = new Set();                              // objectives already ticked, so the tick-and-strike plays once
  function phTasksHtml() {
    const tk = (txt, done, n) => { const just = done && !tkDone.has(txt); if (done) tkDone.add(txt); return `<div class="tk${done ? ' done' : ''}${just ? ' just' : ''}"><i></i><span>${txt}</span>${n != null && !done ? `<em>${n}</em>` : ''}</div>`; };
    const P = PHASES[PH.i], f = foundN(), nests = Math.min(NEST_GOAL, GAME.rocks.length);
    let t = '';
    if (P.key === 'roll') { const K = GAME.kit(), have = K.filter(t => GAME.abilities[t]).length, gw = W_GEAR.filter(k => GAME.weapons[k]).length;
      const fg = GAME.firstGun(), rest = W_GEAR.filter(k => k !== fg), rn = rest.filter(k => GAME.weapons[k] > 0).length;
      t = tk(fg === 'nova' ? 'Grab the nova' : 'Grab the spray gun', GAME.weapons[fg] > 0) + (GAME.pedestals.length >= 3 ? tk('Guns on your pedestals', rn >= 2, rn + '/2') : '');
      if (NET.on && NET.game && gw >= 3 && GAME.abilities.jump) { const rs = [...NET.remotes.values()].filter(R => R.up), n = rs.filter(R => R.gd).length + 1; t += tk('Everybody got their guns?', n >= rs.length + 1, n + '/' + (rs.length + 1)); }
      if (GAME.crewArmed()) { const KB = K.filter(t => t !== 'jump'), hb = KB.filter(t => GAME.abilities[t]).length; t += tk('Hunt the wandering bosses', hb >= KB.length, hb + '/' + KB.length + ' skills'); const lr = GAME.swarm.filter(m => m.rig && !m.dead).length; t += tk('Bomb the log machines (3 bombs each)', lr === 0, lr ? lr + ' left' : ''); }
      if (NET.on && NET.game) { const rs = [...NET.remotes.values()], n = rs.filter(R => R.ak).length + (GAME.gearDone() ? 1 : 0); t += tk('Whole crew geared up', n >= rs.length + 1, n + '/' + (rs.length + 1)); } }
    else if (P.key === 'scout') t = tk('Find the altars', f.a >= GAME.altars.length, f.a + '/' + GAME.altars.length) + tk('Find chubzik nests', f.r >= nests, Math.min(f.r, nests) + '/' + nests) + tk('Find the boss gate', PH.gate);
    else if (P.key === 'save') t = tk('Fill the altars', GS.altarsDone >= 3, GS.altarsDone + '/3');
    else if (P.key === 'hell') { const tot = hellTotal(), dead = Math.max(0, PH.hellN - hellAlive()); t = tk('Kill the mini-bosses', PH.hellN >= tot && dead >= tot, dead + '/' + tot); }
    else t = tk('Kill the Pyramidon', GAME.boss.state === 'dead');
    return `<div class="ph">${PH.brk > 0 ? 'NEXT: ' : ''}${P.name}</div><div class="sub${PH.brk > 0 ? '' : ' desc'}">${PH.brk > 0 ? 'break · ' + Math.ceil(PH.brk) + 's' : P.desc}</div>` + t;
  }
  // ---- minimap (bottom right, turned to match the iso camera) and the objectives panel ----
  const mmEl = document.getElementById('minimap'), mmX = mmEl.getContext('2d'), tasksEl = document.getElementById('tasks');
  let mmT = 0, tasksHtml = '';
  const MM_PTS = [[-ARENA, -ARENA], [ARENA, -ARENA], [ARENA, ARENA], [-ARENA, ARENA], [GAME.ROOM_X2, -GAME.ROOM_HZ], [GAME.ROOM_X2, GAME.ROOM_HZ]];
  function mmFit() {                                   // world (x, z) -> map pixels: screen right is (1,0,-1), screen down is (1,0,1)
    const W = mmEl.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mmEl.width !== Math.round(W * dpr)) { mmEl.width = mmEl.height = Math.round(W * dpr); }
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of MM_PTS) { const u = x - z, v = x + z; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const S = mmEl.width, k = (S - 10 * dpr) / Math.max(u1 - u0, v1 - v0), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    return { S, dpr, k, f: (x, z) => [S / 2 + ((x - z) - cu) * k, S / 2 + ((x + z) - cv) * k] };
  }
  function nestCount(R) { let n = 0; for (const c of GAME.chubs) if (!c.dead && c.state !== 'cart' && Math.hypot(c.pos.x - R.mesh.position.x, c.pos.z - R.mesh.position.z) < R.r + 9) n++; return n; }
  function updateMinimap(dt) {
    if ((mmT -= dt) > 0) return; mmT = 0.12;
    const show = !GAME.startEl.isConnected; mmEl.style.display = show ? 'block' : 'none'; if (!show) return;
    const { S, dpr, k, f } = mmFit(), x = mmX; x.clearRect(0, 0, S, S); x.lineJoin = 'round';
    const poly = (pts, fill, stroke, lw) => { x.beginPath(); pts.forEach(([a, b], i) => { const [px, py] = f(a, b); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw * dpr; x.stroke(); } };
    poly(MM_PTS.slice(0, 4), 'rgba(20,22,26,.55)', 'rgba(255,255,255,.35)', 1.5);
    poly([[GAME.ROOM_X1, -GAME.ROOM_HZ], [GAME.ROOM_X2, -GAME.ROOM_HZ], [GAME.ROOM_X2, GAME.ROOM_HZ], [GAME.ROOM_X1, GAME.ROOM_HZ]], 'rgba(60,20,30,.6)', 'rgba(255,120,120,.35)', 1.2);
    const dot = (wx, wz, r, col, ring) => { const [px, py] = f(wx, wz); x.beginPath(); x.arc(px, py, r * dpr, 0, 6.283); if (ring) { x.strokeStyle = col; x.lineWidth = 2 * dpr; x.stroke(); } else { x.fillStyle = col; x.fill(); } return [px, py]; };
    const label = (px, py, t, col, size) => { x.font = `800 ${size * dpr}px system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 3 * dpr; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(t, px, py); x.fillStyle = col; x.fillText(t, px, py); };
    if (PH.gate) { const [gx, gy] = f(ARENA, 0); label(gx, gy, GAME.boss.state === 'dead' ? '✔' : GS.gateOpen ? '☠' : '🔒', GS.gateOpen ? '#ffd27a' : '#c8c0b8', 11); }    // the boss gate
    if (GAME.boss.ph === 2 && GAME.boss.state !== 'dead' && GAME.boss.state !== 'idle') { const [bx, by] = dot(GAME.BOSS_POS.x, GAME.BOSS_POS.z, 6, '#ff7a1a'); label(bx, by, '☠', '#1a1014', 10); }      // the Pyramidon out in the field
    for (const R of GAME.rocks) { if (!R.mesh.visible || !R.found) continue; const n = PH.i >= 2 ? nestCount(R) : 0, [px, py] = dot(R.mesh.position.x, R.mesh.position.z, 3.2, '#9a7a62'); if (n) label(px, py - 8 * dpr, String(n), '#7fc0ff', 10); }   // chubzik nests and how many wait there
    for (const A of GAME.altars) { if (!A.found) continue; const [px, py] = dot(A.x, A.z, 5, A.done ? '#9cf59a' : '#ff7ad8', true);
      if (!A.done && A.n) { x.beginPath(); x.arc(px, py, 5 * dpr, -1.571, -1.571 + 6.283 * A.n / GAME.ALTAR_NEED); x.strokeStyle = '#5fd0ff'; x.lineWidth = 2 * dpr; x.stroke(); } }
    for (const P of GAME.pedestals) if (P.state !== 'gone') { const [px, py] = dot(P.x, P.z, 4.5, '#ffd23a'); label(px, py - 9 * dpr, '⚙', '#ffd23a', 11); }
    for (const m of GAME.swarm) if (m.wb && !m.dead) dot(m.pos.x, m.pos.z, m.wbLoot ? 4.2 : 2.6, m.wbLoot ? '#ffd23a' : '#ff5a5a');
    for (const B of GAME.bombs) if (!B.leap) { const [px, py] = dot(B.x, B.z, 4, '#ff6a3a'); label(px, py - 9 * dpr, '●', '#1a1a1a', 10); }
    for (const m of GAME.swarm) if (m.rig && !m.dead) { const [px, py] = f(m.pos.x, m.pos.z); label(px, py, '✱', '#d8a060', 13); }
    for (const R of NET.remotes.values()) if (R.up) dot(R.pos.x, R.pos.z, 3.4, '#9cf59a');
    if (GAME.car.alive) {                                   // me: an arrow along the heading
      const [px, py] = f(GAME.car.pos.x, GAME.car.pos.z), hx = Math.sin(GAME.car.heading), hz = Math.cos(GAME.car.heading), du = (hx - hz), dv = (hx + hz), L = Math.hypot(du, dv) || 1, ux = du / L, uy = dv / L, s = 6 * dpr;
      x.beginPath(); x.moveTo(px + ux * s, py + uy * s); x.lineTo(px - ux * s * 0.7 - uy * s * 0.6, py - uy * s * 0.7 + ux * s * 0.6); x.lineTo(px - ux * s * 0.7 + uy * s * 0.6, py - uy * s * 0.7 - ux * s * 0.6); x.closePath();
      x.fillStyle = '#ffd27a'; x.fill(); x.strokeStyle = '#1b1421'; x.lineWidth = 1.5 * dpr; x.stroke(); }
    const h = phTasksHtml();
    if (h !== tasksHtml) { tasksHtml = h; tasksEl.innerHTML = h; phFitW = 0; }
  }
  function updateHints(dt) {
    if ((hintT -= dt) <= 0) {                           // what is worth pointing at: refreshed a few times a second
      hintT = 0.3; hintList = [];
      if (!GAME.startEl.isConnected && GAME.car.alive && !GAME.angel.on && !GAME.inRoom(GAME.car.pos.x, GAME.car.pos.z)) {
        const rk = [];
        for (const R of GAME.rocks) { const d = Math.hypot(R.mesh.position.x - GAME.car.pos.x, R.mesh.position.z - GAME.car.pos.z); if (d > 50) continue;
          let n = 0; for (const c of GAME.chubs) if (!c.dead && c.state !== 'cart' && Math.hypot(c.pos.x - R.mesh.position.x, c.pos.z - R.mesh.position.z) < R.r + 9) n++;
          if (n) rk.push({ x: R.mesh.position.x, z: R.mesh.position.z, d, range: 50, col: '#7fc0ff', text: '☻' + n, cap: 'save chubziks' });
          else if (!R.found && PH.i <= 1) rk.push({ x: R.mesh.position.x, z: R.mesh.position.z, d, range: 50, col: '#7fc0ff', text: '?', cap: 'chubzik nest' }); }
        rk.sort((a, b) => a.d - b.d); hintList.push(...rk.slice(0, 2));
        for (const P of GAME.pedestals) if (P.state !== 'gone') hintList.push({ x: P.x, z: P.z, d: Math.hypot(P.x - GAME.car.pos.x, P.z - GAME.car.pos.z), range: 999, col: '#ffd23a', text: '⚙', cap: P.state === 'sealed' || P.state === 'rising' ? 'guards: ' + (P.guards || 0) : GAME.AB_INFO[GAME.pedIcon(P.k)].title });
        for (const m of GAME.swarm) if (m.wbLoot && !m.dead) hintList.push({ x: m.pos.x, z: m.pos.z, d: Math.hypot(m.pos.x - GAME.car.pos.x, m.pos.z - GAME.car.pos.z), range: 999, col: '#ffd23a', text: '★', cap: GAME.wbGift() ? GAME.AB_INFO[GAME.wbGift()].title + ' boss' : 'skill boss', live: m, grp: 'wb' });      // only the bosses that carry a skill get a pointer; the rest of the crowd is on the minimap
        if (!GS.myTow) { let nb = null, nd = 1e9; for (const B of GAME.bombs) if (!B.leap) { const d = Math.hypot(B.x - GAME.car.pos.x, B.z - GAME.car.pos.z); if (d < nd) { nd = d; nb = B; } }
          if (nb && nd < 140) hintList.push({ x: nb.x, z: nb.z, d: nd, range: 999, col: '#ff6a3a', text: '●', cap: nb.drop && nb.drop.t < GAME.HAND.arrive ? 'bomb incoming' : 'bomb' }); }
        else { let nr = null, nd = 1e9; for (const m of GAME.swarm) if (m.rig && !m.dead) { const d = Math.hypot(m.pos.x - GAME.car.pos.x, m.pos.z - GAME.car.pos.z); if (d < nd) { nd = d; nr = m; } }
          if (nr) hintList.push({ x: nr.pos.x, z: nr.pos.z, d: nd, range: 999, col: '#ff6a3a', text: '✱', cap: 'log machine ' + (nr.rig.hits || 0) + '/3' }); }
        for (const p of GAME.pickups) if (p.own) hintList.push({ x: p.x, z: p.z, d: Math.hypot(p.x - GAME.car.pos.x, p.z - GAME.car.pos.z), range: 999, col: '#ffd23a', text: '★', cap: GAME.AB_INFO[p.type].title });      // your gear drop: always pointed at
        if (GS.worldUp) GAME.altars.forEach(A => { const d = Math.hypot(A.x - GAME.car.pos.x, A.z - GAME.car.pos.z); if (!A.done && d < 60) hintList.push({ x: A.x, z: A.z, d, range: 60, col: '#ff7ad8', text: PH.i < 2 ? '?' : A.n + '/' + GAME.ALTAR_NEED, cap: PH.i < 2 ? 'altar' : 'sacrifice!' }); });
        if (GAME.boss.ph === 2 && GAME.boss.state !== 'dead' && GAME.boss.state !== 'idle') hintList.push({ x: GAME.BOSS_POS.x, z: GAME.BOSS_POS.z, d: Math.hypot(GAME.BOSS_POS.x - GAME.car.pos.x, GAME.BOSS_POS.z - GAME.car.pos.z), range: 999, col: '#ff7a1a', text: 'BOSS', cap: 'kill boss' });
        else { const d = Math.hypot(GAME.ROOM_X1 - GAME.car.pos.x, GAME.car.pos.z), far = GS.gateOpen ? 150 : 70; if (d < far && GAME.boss.state !== 'dead') hintList.push({ x: GAME.ROOM_X1, z: 0, d, range: far, col: GS.gateOpen ? '#ffd27a' : '#9a8f86', text: GS.gateOpen ? 'BOSS' : '🔒', cap: GS.gateOpen ? 'kill boss' : 'boss gate' }); }
      }
    }
    if (hintT === 0.3 && !GAME.startEl.isConnected && NET.on && NET.game) for (const R of NET.remotes.values()) if (R.up)
      hintList.push({ x: R.pos.x, z: R.pos.z, d: 0, range: 1, col: '#8dff9a', text: '☺', cap: R.labelText || 'friend', live: R });
    for (const h of hintList) if (h.live) { h.x = h.live.pos.x; h.z = h.live.pos.z; }
    const W = innerWidth, H = innerHeight, x0 = 40, x1 = W - 40, y0 = 84, y1 = H - 100, cx = W / 2, cy = (y0 + y1) / 2;      // clear of the buttons on top and the bars below
    let i = 0; const placed = [], mmR = mmEl.style.display !== 'none' ? mmEl.getBoundingClientRect() : null;
    // where each pointer would sit on the screen edge; pointers of one kind that land close together become one with a count, and only the three nearest bunches of a kind are shown
    const draw = [], bunch = {};
    for (const h of hintList.slice().sort((a, b) => a.d - b.d)) {
      hintV.set(h.x, 1, h.z).project(GAME.camera);
      const on = Math.abs(hintV.x) < 0.95 && Math.abs(hintV.y) < 0.95;
      const dx = hintV.x * W / 2 + W / 2 - cx, dy = -hintV.y * H / 2 + H / 2 - cy;
      const k = Math.max(dx > 0 ? dx / (x1 - cx) : dx / (x0 - cx), dy > 0 ? dy / (y1 - cy) : dy / (y0 - cy), 1), px = cx + dx / k, py = cy + dy / k;
      const it = { h, on, dx, dy, px, py, n: 1 };
      if (h.grp) { if (on) continue; const B = bunch[h.grp] || (bunch[h.grp] = []), near = B.find(q => Math.hypot(q.px - px, q.py - py) < 260);
        if (near) { near.n++; continue; } if (B.length >= 3) continue; B.push(it); }
      draw.push(it);
    }
    for (const it of draw) {
      const h = it.h, on = it.on, dx = it.dx, dy = it.dy, px = it.px, py = it.py, e = hintEl(i++);
      const hText = it.n > 1 ? h.text + '×' + it.n : h.text, hCap = it.n > 1 ? h.cap.replace('boss', 'bosses') : h.cap;
      let qx = px, qy = py; if (!on) { for (let g = 0; g < 4 && placed.some(q => Math.abs(q[0] - qx) < 120 && Math.abs(q[1] - qy) < 62); g++) { if (qx <= x0 + 1 || qx >= x1 - 1) qy += qy > cy ? -64 : 64; else qx += qx > cx ? -124 : 124; } placed.push([qx, qy]); }      // two pointers in one spot: slide the second along the edge
      if (!on && mmR && qx > mmR.left - 70 && qy > mmR.top - 60 && qx < mmR.right + 40 && qy < mmR.bottom + 40) { if (qx >= x1 - 1) qy = mmR.top - 60; else qx = mmR.left - 70; }   // never under the minimap
      e.d.style.opacity = on ? 0 : Math.min(1, (1 - h.d / h.range) * 4 + 0.25);
      e.d.style.transform = `translate(${qx.toFixed(0)}px,${qy.toFixed(0)}px)`;
      e.arrow.style.transform = `rotate(${Math.atan2(dx, -dy).toFixed(2)}rad)`;
      if (e.text !== hText) e.label.textContent = e.text = hText;
      if (e.capT !== hCap) e.cap.textContent = e.capT = hCap;
      const side = (qx < 90 ? 'l' : qx > W - 90 ? 'r' : 'c') + (qy > H - 150 ? 'u' : 'd');           // keep the caption on screen and off the arrow
      if (e.side !== side) { e.side = side; const c = e.cap.style; c.left = side[0] === 'l' ? '0' : side[0] === 'c' ? '50%' : 'auto'; c.right = side[0] === 'r' ? '0' : 'auto'; c.transform = side[0] === 'c' ? 'translateX(-50%)' : 'none'; c.top = side[1] === 'u' ? '-20px' : '46px'; }
      if (e.col !== h.col) e.d.style.setProperty('--c', e.col = h.col);
    }
    for (; i < hints.length; i++) hints[i].d.style.opacity = 0;
  }
  (function prewarm() {
    try {
      if (GAME.HX && GAME.HX.noRender) return;      // tests in fast mode draw nothing, so there is nothing to compile
      const g = new THREE.Group(), mats = [];
      for (const k in GAME.SW_ART) for (const v of GAME.SW_ART[k]) mats.push(...v.walk, ...v.hit);
      for (const row of GAME.chubMats) mats.push(...row);
      for (const m of mats) { if (m.map) GAME.renderer.initTexture(m.map); }
      for (const m of [mats[0], GAME.chubMats[0][0]]) g.add(new THREE.Sprite(m));
      g.add(GAME.fxSprite(GAME.puffPool, false), GAME.fxSprite(GAME.flashPool, true));
      for (const m of [GAME.bulletMat, GAME.enemyFlash, GAME.crateHitMat, GAME.novaMat, new THREE.MeshStandardMaterial({ color: 0xffffff })]) g.add(new THREE.Mesh(GAME.partGeo, m));
      GAME.scene.add(g); GAME.renderer.compile(GAME.scene, GAME.camera); GAME.scene.remove(g);
      for (const c of [...g.children]) if (c.isSprite && c.material.map === GAME.softTex) { c.visible = false; GAME.scene.add(c); (c.material.blending === THREE.AdditiveBlending ? GAME.flashPool : GAME.puffPool).push(c); }
    } catch (e) { console.warn('prewarm', e); }
  })();
  // ---- the five things to do, on the lobby panel, illustrated with shots of the game itself ----
  (function howTo() {
    const box = document.getElementById('how'); if (!box) return;
    const cell = (label, n) => { const d = document.createElement('div'), cv = GAME.mkCanvas(160); d.appendChild(cv); const t = document.createElement('div'); t.style.display = 'block'; t.innerHTML = `<span>${n}.</span> ${label}`; d.appendChild(t); box.appendChild(d); return cv.getContext('2d'); };
    const sprites = (x, list) => { x.fillStyle = '#3b2f33'; x.fillRect(0, 0, 160, 160); for (const [img, dx, dy, sz] of list) x.drawImage(img, dx, dy, sz, sz); };
    const shot = (x, tx, ty, tz, half) => {              // a real render of that spot through the game's own post-processing
      try {
        if (!GS.composer || GAME.HX) throw 0;      // tests skip the how-to pictures: five full renders, 18 s of a headless start
        const cv = GAME.renderer.domElement, asp = cv.width / cv.height, cam = GAME.camera.clone(), rp = GS.composer.passes[0], keep = rp.camera;
        GAME.tmp.set(tx, ty, tz); cam.position.copy(GAME.tmp).add(GAME.ISO_OFFSET); cam.lookAt(GAME.tmp);
        cam.left = -half * asp; cam.right = half * asp; cam.top = half; cam.bottom = -half; cam.zoom = 1; cam.updateProjectionMatrix();
        GAME.sun.position.copy(GAME.tmp).add(GAME.SUN_OFFSET); GAME.sun.target.position.copy(GAME.tmp); GAME.sun.target.updateMatrixWorld(); GAME.renderer.shadowMap.needsUpdate = true;
        rp.camera = cam; GS.composer.render(); rp.camera = keep;
        const sq = Math.min(cv.width, cv.height); x.drawImage(cv, (cv.width - sq) / 2, (cv.height - sq) / 2, sq, sq, 0, 0, 160, 160);
      } catch (e) { x.fillStyle = '#3b2f33'; x.fillRect(0, 0, 160, 160); }
    };
    const img = (kind, v) => GAME.SW_ART[kind][v].walk[1].map.image;
    sprites(cell('Kill monsters', 1), [[img('grubber', 0), 52, 6, 112], [img('maw', 0), -6, 48, 96], [img('gremlin', 1), 62, 86, 72]]);
    const crate = GAME.obstacles.find(o => o.crate && !o.room); const c2 = cell('Smash crates', 2); if (crate) shot(c2, crate.mesh.position.x, 0.9, crate.mesh.position.z, 3.2);
    const ch = GAME.chubMats[0][0].map.image, ch2 = GAME.chubMats[1][1].map.image; sprites(cell('Save chubziks', 3), [[ch, 4, 40, 84], [ch2, 70, 14, 84], [ch, 52, 78, 78]]);
    const c4 = cell('Feed the altars', 4); if (GAME.altars[0]) shot(c4, GAME.altars[0].x, 2.6, GAME.altars[0].z, 5.5);
    shot(cell('Unlock the boss', 5), GAME.ROOM_X1 - 2, 2.2, 0, 8.5);
  })();
  // ---- ride cards: what each ride is and what it does, in view the moment the ride screen opens, each with a real render of the ride ----
  const RIDE_CARD = {
    buggy:   { name: 'BUGGY', emo: '🚙', tag: 'all-rounder · 100 HP', how: 'A car: steers, drifts and rams. The full fan gun.',
               rows: [['decoy', 'Decoy Chubz', 'RMB', 'a squeaky fake chubzik: monsters chase it, then boom'], ['drill', 'Drill', 'auto', 'spins up by itself and grinds a wide arc ahead'], ['jump', 'Stomp', 'Space', 'levelled up: the landing wave stuns, then kills the small fry']] },
    spider:  { name: 'SPIDER', emo: '🕷️', tag: 'fast and fragile · 50 HP', how: 'Runs straight where you point, no steering, and climbs walls.',
               rows: [['burrow', 'Mole', 'RMB', 'dig in and pop out, the biters scatter'], ['jump', 'Brood', 'Space', 'levelled up: spiderlings leap on monsters and slow them, later they blow up']] },
    halo:    { name: 'HALO', emo: '👁️', tag: 'hovers · 100 HP', how: 'Glides where you point and keeps drifting. A thinner fan gun, but its nova is a ring of swords: nothing hurts you while they are out.',
               rows: [['cubes', 'Wing Cubes', 'RMB', 'winged cubes dive-bomb the small fry'], ['doubleJump', 'Two Kangaroos', '2×Space', 'a second jump in mid-air'], ['jump', 'Light Spikes', 'Space', 'levelled up: spikes of light stand where you land']] },
    unicorn: { name: 'UNICORN', emo: '🦄', tag: 'gallops · 100 HP', how: 'Gores whatever it gallops into. Its saws stun instead of cutting.',
               rows: [['bomb', 'Dome Bomb', 'RMB', 'blasts the biters away, nobody gets into the dome'], ['trail', 'Rainbow Trail', 'passive', 'biters that step on it lose you'], ['jump', 'Starburst', 'Space', 'levelled up: a ring of stars on landing']] } };
  (function rideCards() {
    const keep = GS.ride, rp = GS.composer && !window.__noRender ? GS.composer.passes[0] : null, el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
    for (const b of document.querySelectorAll('#rides button')) { const k = b.dataset.ride, C = RIDE_CARD[k]; if (!C) continue;
      let pic = null;
      if (rp) try {                                        // the ride itself, through the game's camera and post-processing
        GAME.setRide(k); GAME.carGroup.updateMatrixWorld(true);
        const cv = GAME.renderer.domElement, asp = cv.width / cv.height, cam = GAME.camera.clone(), keepCam = rp.camera, half = 3.4;
        GAME.tmp.copy(GAME.carGroup.position).setY(1.5); cam.position.copy(GAME.tmp).add(GAME.ISO_OFFSET); cam.lookAt(GAME.tmp);
        cam.left = -half * asp; cam.right = half * asp; cam.top = half; cam.bottom = -half; cam.zoom = 1; cam.updateProjectionMatrix();
        GAME.sun.position.copy(GAME.tmp).add(GAME.SUN_OFFSET); GAME.sun.target.position.copy(GAME.tmp); GAME.sun.target.updateMatrixWorld(); GAME.renderer.shadowMap.needsUpdate = true;
        rp.camera = cam; GS.composer.render(); rp.camera = keepCam;
        pic = GAME.mkCanvas(320, 200); pic.className = 'rc-pic'; const sh = cv.height, sw = Math.min(cv.width, sh * 1.6); pic.getContext('2d').drawImage(cv, (cv.width - sw) / 2, 0, sw, sh, 0, 0, 320, 200);
      } catch (e) { pic = null; }
      b.textContent = ''; b.appendChild(pic || el('div', 'rc-pic', C.emo));
      const head = el('div', 'rc-head'); head.append(el('div', 'rc-name', C.name), el('div', 'rc-tag', C.tag)); b.append(head, el('div', 'rc-how', C.how));
      for (const [t, title, key, text] of C.rows) { const row = el('div', 'rc-row'), img = new Image(), d = el('div'), h = el('b', '', title); img.src = GAME.ICON_URLS[t]; img.alt = '';
        h.appendChild(el('kbd', 'rc-key', key)); d.append(h, el('span', '', text)); row.append(img, d); b.appendChild(row); } }
    if (rp) GAME.setRide(keep);
  })();
  GS.worldRnd = GAME.trueRandom;                                // world is built: back to real randomness for the simulation
  return { NET, num, VER, netStart, netMe, netEv, netPurge, netPick, waveTargets, netAnyPlayer, DG, netLog, diagToggle, updateDiag, r1, r2, updateNet, PH, waveMul, hellTotal, hellAlive, phEnter, phAdvance, phFind, updatePhases, updateMinimap, updateHints };
}
