// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- touch input ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { ARENA } from '../data/index.js';

export function createTouch(GAME) {
  // Left half of the screen: floating drive stick (the car turns toward the stick and accelerates).
  // Right half: floating aim stick, fires while held. Ability buttons are bound where the ability bar is built.
  const STICK_R = 56;
  const ISO_SQUASH = Math.sin(Math.atan(1 / Math.SQRT2));       // ground depth is foreshortened by 0.577 on screen
  const mkStick = el => ({ el, knob: el.firstElementChild, id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0 });
  const touch = { enabled: false, aiming: false, last: -1e9, aimDir: new THREE.Vector3(0, 0, 1), aimDist: 10,
                  move: mkStick(document.getElementById('stickL')), aim: mkStick(document.getElementById('stickR')) };
  function stickWorld(sx, sy, out) {                             // screen-space stick -> direction on the ground
    const uy = -sy / ISO_SQUASH;
    return out.set((sx - uy) * Math.SQRT1_2, 0, (-sx - uy) * Math.SQRT1_2).normalize();
  }
  function stickRest(st, right) {
    const c = Math.min(innerWidth, innerHeight) < 420 ? 84 : 95;
    st.el.style.left = (right ? innerWidth - c : c) + 'px'; st.el.style.top = (innerHeight - c) + 'px';
    st.knob.style.transform = ''; st.el.classList.remove('on');
  }
  function layoutTouch() {
    if (!touch.enabled) return;
    const small = Math.min(innerWidth, innerHeight) < 420, c = small ? 84 : 95, R = small ? 120 : 138;
    const arc = { jump: 2, decoy: 40, cubes: 40, burrow: 40, bomb: 40, drill: 80, trail: 80 };    // degrees around the right thumb: jump, the active, the passive
    for (const t in arc) {
      const el = document.getElementById('ab-' + t), a = arc[t] * Math.PI / 180;
      if (!el) continue;
      el.style.right = (c + R * Math.cos(a) - 29) + 'px'; el.style.bottom = (c + R * Math.sin(a) - 29) + 'px';
    }
    const dj = document.getElementById('ab-doubleJump');
    if (dj) { dj.style.right = (c + R + 26) + 'px'; dj.style.bottom = (c + 18) + 'px'; }
    if (touch.move.id === null) stickRest(touch.move, false);
    if (touch.aim.id === null) stickRest(touch.aim, true);
  }
  function enableTouch() {
    if (touch.enabled) return;
    touch.enabled = true; touch.aiming = true;
    touch.aimDir.set(Math.sin(GAME.car.heading), 0, Math.cos(GAME.car.heading));
    document.body.classList.add('touch');
    const st = document.querySelector('#start span'); if (st) st.textContent = 'Tap to start';
    layoutTouch();
  }
  function stickSet(st, t) {
    let dx = t.clientX - st.ox, dy = t.clientY - st.oy; const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    st.x = dx / STICK_R; st.y = dy / STICK_R; st.mag = Math.min(1, d / STICK_R);
    st.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  addEventListener('touchstart', () => { touch.last = performance.now(); touch.aiming = true; enableTouch(); }, { passive: true, capture: true });
  GAME.renderer.domElement.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const st = t.clientX < innerWidth * 0.5 ? touch.move : touch.aim;
      if (st.id !== null) continue;
      st.id = t.identifier; st.ox = t.clientX; st.oy = t.clientY; st.x = st.y = st.mag = 0;
      st.el.style.left = st.ox + 'px'; st.el.style.top = st.oy + 'px'; st.el.classList.add('on');
    }
  }, { passive: false });
  addEventListener('touchmove', e => {
    touch.last = performance.now();
    for (const t of e.changedTouches) for (const st of [touch.move, touch.aim]) if (st.id === t.identifier) stickSet(st, t);
  }, { passive: true });
  const touchEnd = e => {
    touch.last = performance.now();
    for (const t of e.changedTouches) for (const st of [touch.move, touch.aim]) if (st.id === t.identifier) {
      st.id = null; st.x = st.y = st.mag = 0; stickRest(st, st === touch.aim);
    }
  };
  addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);
  addEventListener('resize', layoutTouch);

  const startEl = document.getElementById('start');
  let lastRide = 'buggy'; try { lastRide = localStorage.getItem('carproto.ride') || 'buggy'; } catch (e) {}
  if (!GAME.RIDES[lastRide]) lastRide = 'buggy';
  for (const b of document.querySelectorAll('#rides button')) { if (b.dataset.ride === lastRide) b.classList.add('last'); b.addEventListener('click', () => { lastRide = b.dataset.ride; }); }
  const lobbyStep = document.getElementById('lobbyStep'), comicStep = document.getElementById('comicStep');
  function toComic(mode) {                               // lobby choice made: 'solo', 'host' or a lobby id to join
    GAME.netStart(mode);
    lobbyStep.style.display = 'none'; comicStep.style.display = 'flex';
    document.getElementById('lobbyTag').textContent = GAME.NET.game ? `In ${GAME.NET.hostNick}'s lobby` : '';
  }
  lobbyStep.addEventListener('click', e => e.stopPropagation());
  document.getElementById('hostBtn').addEventListener('click', () => toComic('host'));
  document.getElementById('soloBtn').addEventListener('click', () => toComic('solo'));
  startEl.addEventListener('click', () => {
    if (comicStep.style.display === 'none') return;
    GAME.setRide(lastRide); if (GAME.NET.game) { GAME.NET.on = true; if (!GAME.NET.isHost) { GAME.NET.client = true; GAME.netPurge(); } }
    GAME.SFX.init(); startEl.remove(); GAME.renderer.domElement.focus();
    GAME.crew.on = true; setTimeout(() => GAME.crewSay('start', 1, true), 700);
  });
  addEventListener('pointerdown', () => GAME.SFX.init(), { capture: true });       // iOS / autoplay: audio starts on the first gesture
  const BUILD = +document.querySelector('meta[name="chubz-build"]').content, buildEl = document.getElementById('build');      // the build number lives in src/index.html
  function hardReload() {                                // refetch the page past the browser cache, then reload (what Ctrl+Shift+R does)
    const go = () => { try { location.reload(); } catch (e) {} };
    try { fetch(location.href, { cache: 'reload' }).then(go, go); setTimeout(go, 2500); } catch (e) { go(); }
  }
  buildEl.textContent = 'build ' + BUILD;
  function checkBuild() {                                // on a normal web host: is there a newer build than the one that is running?
    try { fetch(location.href.split('#')[0], { cache: 'no-store' }).then(r => r.text()).then(t => { const m = /<meta name="chubz-build" content="(\d+)"/.exec(t);
      if (m && +m[1] > BUILD) { buildEl.dataset.upd = '1'; buildEl.textContent = `build ${BUILD} → ${m[1]} is out · tap to update`; buildEl.style.pointerEvents = 'auto'; buildEl.style.cursor = 'pointer'; buildEl.style.background = '#b0401a'; buildEl.style.color = '#fff'; } }).catch(() => {}); } catch (e) {}
  }
  for (const ev of ['mousedown', 'touchstart', 'pointerdown', 'click']) buildEl.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'click') { if (buildEl.dataset.upd) hardReload(); else GAME.diagToggle(); } });
  buildEl.style.pointerEvents = 'auto'; buildEl.style.cursor = 'pointer';
  checkBuild(); setInterval(checkBuild, 90000);
  const restartBtn = document.getElementById('restart'); let restartT = 0;
  for (const ev of ['mousedown', 'touchstart', 'pointerdown']) restartBtn.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  restartBtn.addEventListener('click', e => {           // two taps: the first arms it, the second reloads the page back to the comic
    e.stopPropagation(); restartBtn.blur();
    if (restartBtn.classList.contains('ask')) { restartBtn.textContent = '…'; hardReload(); return; }
    restartBtn.classList.add('ask'); restartBtn.textContent = 'RESTART?';
    clearTimeout(restartT); restartT = setTimeout(() => { restartBtn.classList.remove('ask'); restartBtn.textContent = '⟲'; }, 2500);
  });
  const muteBtn = document.getElementById('mute');
  const volBox = document.getElementById('volBox'), volEl = document.getElementById('vol'); let volHide = 0;
  const syncMute = () => { const off = GAME.SFX.muted || GAME.SFX.volume === 0; muteBtn.textContent = off ? '🔇' : GAME.SFX.volume < 0.4 ? '🔉' : '🔊'; muteBtn.classList.toggle('off', off); volEl.value = Math.round((GAME.SFX.muted ? 0 : GAME.SFX.volume) * 100); };
  const volStay = () => { clearTimeout(volHide); volHide = setTimeout(() => volBox.classList.remove('on'), 4000); };
  const volSet = v => { GAME.SFX.init(); if (GAME.SFX.muted && v > 0) GAME.SFX.toggleMute(); GAME.SFX.setVolume(v); syncMute(); volStay(); };
  muteBtn.addEventListener('click', e => { e.stopPropagation(); GAME.SFX.init(); volBox.classList.toggle('on'); syncMute(); volStay(); });      // the button opens the slider; M still mutes outright
  volEl.addEventListener('input', () => volSet(volEl.value / 100));
  document.getElementById('volDown').addEventListener('click', () => volSet((GAME.SFX.muted ? 0 : GAME.SFX.volume) - 0.1));
  document.getElementById('volUp').addEventListener('click', () => volSet((GAME.SFX.muted ? 0 : GAME.SFX.volume) + 0.1));
  for (const ev of ['click', 'pointerdown', 'pointerup', 'touchstart', 'mousedown']) volBox.addEventListener(ev, e => e.stopPropagation());
  muteBtn.addEventListener('pointerdown', e => e.stopPropagation());
  syncMute();
  GAME.renderer.domElement.tabIndex = 0;

  function respawn() {
    { const a = Math.random() * 6.283; GAME.car.pos.set(Math.cos(a) * ARENA * 0.4, 0, Math.sin(a) * ARENA * 0.4); GAME.car.heading = Math.atan2(-GAME.car.pos.x, -GAME.car.pos.z); }      // start out on the plain, facing the centre pedestal
    GAME.car.vel.set(0, 0, 0); GAME.car.speed = 0;
    GAME.car.hp = GAME.car.maxHp; GAME.car.alive = true; GAME.carGroup.visible = true;
    GAME.car.burrow = 'up'; GAME.car.depth = 0; GAME.car.y = 0; GAME.car.vy = 0; GAME.car.airborne = false;
    if (!(GAME.NET.on && GAME.NET.game)) GAME.resetBoss(); if (GAME.NET.on && GAME.NET.game) { GAME.cartFling(GAME.cart.riders.length, 0); GAME.cartReset(); } else GAME.clearSwarm(); GAME.clearEShots(); GAME.crewSay('respawn', 1, true);
    document.getElementById('dead').style.display = 'none';
    // разогнать злюк от точки спавна
    for (const e of GAME.enemies) if (!e.dead && Math.hypot(e.pos.x, e.pos.z) < 25) GAME.placeEnemy(e);
  }

  return { ISO_SQUASH, touch, stickWorld, layoutTouch, enableTouch, startEl, toComic, BUILD, hardReload, syncMute, respawn };
}
