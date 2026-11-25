// The test pages' frame clock. game.py adds it as a Playwright init script, so it exists before the game's code runs;
// the game reads window.__hx at its seams (src/legacy.js: `const HX`). Players never have it.
window.__hx = {            // the test build's frame clock
  cap: 0,                  // max dt per frame in normal running; 0 = the game's own 1/30
  frozen: false,           // true: game time stands still, frames advance only through step()
  queue: 0, stepDt: 0.05,  // frames still to play while frozen, and the dt each one gets
  sub: 1, fixed: 0,        // turbo: run update() `sub` times a frame, each with the fixed dt (game time no longer waits for the wall clock)
  frames: 0, dirty: true,
  noRender: !!window.__noRender,   // set before the page loads (game.py, fast mode): not even the first frame is drawn. The first full render costs ~18 s headless
  dt(raw) { this.frames++;
    if (this.frozen) { if (this.queue > 0) { this.queue--; this.dirty = true; return this.stepDt; } return 1e-6; }
    this.dirty = true; if (this.fixed) return this.fixed; return Math.min(raw, this.cap || window.__dtcap || 1 / 30); },
  skipRender() { if (this.noRender) return true; if (this.frozen && !this.dirty) return true; this.dirty = false; return false; },
  freeze() { this.frozen = true; this.queue = 0; this.dirty = true; },
  thaw() { this.frozen = false; },
  step(n, dt) { this.frozen = true; if (dt) this.stepDt = dt; this.queue += n || 1; },
};
