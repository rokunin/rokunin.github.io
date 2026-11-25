// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- input ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createKeys(GAME) {
  // e.code — физические клавиши, работает на любой раскладке
  const keys = {};
  GS.mouseFire = false;
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) GAME.jump(); }
    if (e.code === 'KeyR') GAME.respawn();
    if (e.code === 'KeyM') GAME.flashAlert(GAME.MUSIC.toggle() ? 'MUSIC ON' : 'MUSIC OFF');
    if (e.code === 'KeyL' && !e.repeat) GAME.diagToggle();
    if (e.code === 'KeyM' && !e.repeat) { GAME.SFX.init(); GAME.SFX.toggleMute(); GAME.syncMute(); }
    if (!e.repeat && !GAME.startEl.isConnected) { if (e.code === 'Digit1') GAME.useUlt('sword'); if (e.code === 'Digit2') GAME.useUlt('hands'); if (e.code === 'KeyC') GAME.convertCoins(); }      // the shop on the keyboard
    if (e.code === 'KeyE' && !e.repeat && GS.unloadAltar) GAME.doUnload();     // E sacrifices inside an altar's ring
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  GS.rmb = false;
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; GS.mouseFire = false; GS.rmb = false; });
  GAME.renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0) GS.mouseFire = true; if (e.button === 2) GAME.special(); });
  addEventListener('mouseup', e => { if (e.button === 0) GS.mouseFire = false; if (e.button === 2) GS.rmb = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => {
    GS.viewSize = THREE.MathUtils.clamp(GS.viewSize * (e.deltaY > 0 ? 1.1 : 0.9), 10, 55);
    GAME.resizeCam();
  }, { passive: true });
  addEventListener('resize', () => {
    GAME.renderer.setSize(innerWidth, innerHeight); GAME.resizeCam();
    if (GS.composer) GS.composer.setSize(innerWidth, innerHeight);
    if (GS.fxaaPass) GS.fxaaPass.uniforms.resolution.value.set(1 / (innerWidth * GS.PR), 1 / (innerHeight * GS.PR));
  });
  return { keys };
}
