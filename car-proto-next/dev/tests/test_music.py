"""The theme: the track is fetched and decoded, starts on the first click, and moves between its five tiers on bar lines as the game heats up and cools down."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

TH = "d.MUSIC.theme"
t = Checks('music')
with Game() as g:
    p = g.solo('buggy'); ev(p, "d.PH.brk = 999;")
    try:
        wait(p, TH + ".state === 'on'", 25)
    except TimeoutError:
        pass
    s = ev(p, "const T = d.MUSIC.theme; return { state: T.state, mode: T.mode, dur: T.buf && T.buf.duration, shift: T.shift, tier: T.T, bar: T.k, log: T.log }")
    t.eq('theme is playing', s['state'], 'on')
    t.eq('cut-and-jump mode, not the plain stream', s['mode'], 'adaptive')
    t.ok('the whole track is decoded, 3:18', abs((s['dur'] or 0) - 197.75) < 0.2, s['dur'])
    t.ok('decoded audio lines up with the measured bar grid', abs(s['shift']) < 0.002, s['shift'])
    t.eq('warm-up plays tier 1 (light drums)', s['tier'], 1)
    ev(p, "d.MUSIC.force = 4;"); t0 = ev(p, "return d.SFX.ctx.currentTime")
    wait(p, TH + ".T === 4", 6)
    j = ev(p, "return d.MUSIC.theme.log[d.MUSIC.theme.log.length - 1]")
    t.eq('heat goes up: jump to the top of tier 4', j[1:], ['jump', 4, 60])
    t.ok('at the next bar line, within one bar', j[0] - t0 < 2.6, round(j[0] - t0, 2))
    ev(p, "d.MUSIC.force = 2;"); p.wait_for_timeout(4000)
    t.eq('it cools down: the music holds its tier for a while', ev(p, "return d.MUSIC.theme.T"), 4)
    wait(p, TH + ".T === 2", 14)
    j2 = ev(p, "return d.MUSIC.theme.log[d.MUSIC.theme.log.length - 1]")
    t.ok('then drops to tier 2 at its first bar, about 10 s after it went up', j2[1:] == ['jump', 2, 15] and 9.5 < j2[0] - j[0] < 13, [j2, round(j2[0] - j[0], 1)])
    ev(p, "d.MUSIC.force = 1;"); wait(p, TH + ".T === 1", 16)
    t.eq('tier 1 contains these bars: adopted without a cut', ev(p, "return d.MUSIC.theme.log[d.MUSIC.theme.log.length - 1][1]"), 'adopt')
    ev(p, "const T = d.MUSIC.theme; T.k = 22; T.tBar = d.SFX.ctx.currentTime;"); wait(p, TH + ".log[" + TH + ".log.length - 1][1] === 'loop'", 6)
    t.eq('at the end of its bars a tier loops back', ev(p, "return d.MUSIC.theme.log[d.MUSIC.theme.log.length - 1].slice(1)"), ['loop', 1, 7])
    ev(p, "d.MUSIC.force = 1; d.car.alive = false; d.car.deadTimer = 30;"); p.wait_for_timeout(1500)
    t.ok('dead: same music, dull and quiet', ev(p, "return d.MUSIC.theme.T === 1 && d.MUSIC.theme.f.frequency.value < 1500 && d.MUSIC.theme.g.gain.value < 0.45"), ev(p, "return [Math.round(d.MUSIC.theme.f.frequency.value), d.MUSIC.theme.g.gain.value]"))
    ev(p, "d.car.alive = true; d.car.deadTimer = 0;"); p.wait_for_timeout(1500)
    t.ok('alive again: it opens up', ev(p, "return d.MUSIC.theme.f.frequency.value > 10000"))
    ev(p, "d.MUSIC.toggle()"); p.wait_for_timeout(1800)
    t.ok('M stops it: no voice left playing', ev(p, "return d.MUSIC.theme.cur === null && d.MUSIC.theme.state === 'ready'"))
    ev(p, "d.MUSIC.toggle()"); p.wait_for_timeout(1800)
    t.ok('and starts it again', ev(p, "return d.MUSIC.theme.state === 'on' && !!d.MUSIC.theme.cur && d.MUSIC.theme.g.gain.value > 0.4"))
    t.done(g)
