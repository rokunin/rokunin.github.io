"""The world: the same seed builds the same world, on every page and for host and guest, and nothing outside world generation can move it.
Guards ADR-0009: world generation draws from its own stream, so Three.js taking random numbers for object ids (or more objects, a new Three version,
modules loading in another order) does not move obstacles, altars or cubes.
Gun pedestals are not the world: each player's are laid out at random around where he starts."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

FIXED_DAY = "(() => { const D = Date, T = D.UTC(2026, 0, 1, 12); window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } }; window.Date.now = D.now; window.Date.UTC = D.UTC; window.Date.parse = D.parse; })();"
# Three draws Math.random for every object id. Here every mesh the page makes also makes a spare object, so Three draws more: with a shared stream
# (build 135 and older) that moved the whole world. Three calls its own id function directly, so the extra draws have to come from extra objects.
# src/three.js hands its THREE to window.__threeHook before the game runs; pages of build 136 and older get THREE as a global from a script tag.
GREEDY_THREE = ("(() => { window.__spare = 0; const greedy = T => { const M = T.Mesh; T.Mesh = class extends M { constructor(...a) { super(...a); new T.Object3D(); window.__spare++; } }; };"
                " window.__threeHook = greedy; let T; Object.defineProperty(window, 'THREE', { configurable: true, get() { return T; }, set(v) { T = v; queueMicrotask(() => greedy(T)); } }); })();")
PRINT = """const r = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10, parts = [];
// a guest gets the crates' places from the host to a tenth of a metre, so places are compared at a tenth
for (const o of d.obstacles) parts.push(['o', r1(o.mesh.position.x), r1(o.mesh.position.z), r(o.hx || 0), r(o.hz || 0)].join());
for (const A of d.altars) parts.push(['a', r(A.x != null ? A.x : A.pos.x), r(A.z != null ? A.z : A.pos.z)].join());
for (const e of d.enemies) parts.push(['e', r(e.s), r(e.speed), e.elite ? 1 : 0].join());   // cubes wake and move, so their drawn size and speed stand for them
let h = 2166136261; const s = parts.join('|'); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
return { seed: d.SEED, n: parts.length, hash: h.toString(16) };"""
GOLDEN = '815c6b5'      # the world of 1 January 2026 as build 136 builds it; a change here moves every day's world, so it needs a reason in the commit

t = Checks('world')
with Game() as g:
    a = g.solo('buggy', init=FIXED_DAY); A = ev(a, PRINT); a.close()
    b = g.solo('spider', init=FIXED_DAY); B = ev(b, PRINT); b.close()
    c = g.solo('halo', init=FIXED_DAY + GREEDY_THREE); C = ev(c, PRINT)
    t.ok('the seed is the day', A['seed'] == 20260101, A)
    t.ok('a world has obstacles, altars and cubes', A['n'] > 150, A['n'])
    t.eq('the same day builds the same world on another page with another ride', B, A)
    t.ok('Three taking extra random numbers moves nothing', ev(c, "return window.__spare") > 100 and C == A, [ev(c, "return window.__spare"), C, A])
    if GOLDEN: t.eq('the world of 1 January 2026 is the one on record', A['hash'], GOLDEN)
    else: print('      golden hash for 2026-01-01:', A['hash'], A['n'])
    c.close()
    h, j = g.lobby('buggy', 'unicorn')
    t.eq('host and guest build the same world', ev(j, PRINT), ev(h, PRINT))
    t.done(g)
