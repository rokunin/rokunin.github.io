"""The recorded theme: the file is served, starts on the first click, plays through the game's volume, and the synth band stays out of its way."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

t = Checks('music')
with Game() as g:
    p = g.solo('buggy'); ev(p, "d.PH.brk = 999;")
    wait(p, "d.MUSIC.theme.state !== 'idle'", 10)
    try:
        wait(p, "d.MUSIC.theme.state === 'on'", 20)
    except TimeoutError:
        pass
    T = ev(p, "const T = d.MUSIC.theme; return { state: T.state, wa: T.wa, dur: T.a.duration, err: T.a.error && T.a.error.message, t: T.a.currentTime }")
    t.eq('theme is playing', T['state'], 'on')
    t.ok('the whole track loaded, 3:18', abs((T['dur'] or 0) - 197.8) < 1, T['dur'])
    t.ok('it goes through the game mixer, so the volume buttons and mute apply', T['wa'])
    p.wait_for_timeout(1500)
    t.ok('playback advances', ev(p, "return d.MUSIC.theme.a.currentTime") > T['t'] + 0.8)
    t.ok('in the warm-up it plays open: level 1, no muffling', ev(p, "return d.MUSIC.theme.lv === 1 && d.MUSIC.theme.f.frequency.value > 15000"))
    ev(p, "d.MUSIC.toggle()"); p.wait_for_timeout(2600)
    t.ok('M turns it down to silence', ev(p, "return d.MUSIC.theme.g.gain.value") < 0.02)
    ev(p, "d.MUSIC.toggle()"); p.wait_for_timeout(2600)
    t.ok('and back up', ev(p, "return d.MUSIC.theme.g.gain.value") > 0.4)
    t.done(g)
