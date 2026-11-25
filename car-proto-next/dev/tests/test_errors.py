"""Uncaught errors and rejected promises land in the lobby's diagnostics log, each distinct one once (ROADMAP step 0)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev

t = Checks('error log')
with Game() as g:
    p = g.solo('buggy')
    p.evaluate("() => { for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error('probe boom'); }); Promise.reject(new Error('probe reject')); }")
    p.wait_for_timeout(600)
    log = ev(p, "return d.DG.log.filter(l => l.includes('probe'))")
    t.ok('a thrown error is in the log once, with where it came from', sum('error: Uncaught Error: probe boom (' in l for l in log) == 1, log)
    t.ok('a rejected promise is in the log', any('error: promise: probe reject' in l for l in log), log)
    t.eq('the browser still reports them (nothing is swallowed)', sorted({e.split(': ', 1)[1] for e in g.errs}), ['probe boom', 'probe reject'])
    g.errs.clear()
    t.done(g)
