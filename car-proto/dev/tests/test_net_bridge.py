"""Three players, and the host and the third one cannot link directly (a strict NAT): the middle one carries their traffic.
The third sees the host's lobby, the host, the monsters and the boss; the host sees the third; the boss's health is the host's alone."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

t = Checks('net bridge')
with Game() as g:
    a = g.host('buggy', q='&sid=aaa&cut=ccc'); ev(a, "d.PH.brk = 999")
    b = g.join('spider', name='Mid', q='&sid=bbb')
    c = g.join('unicorn', name='Far', q='&sid=ccc&cut=aaa')
    wait(a, "d.NET.remotes.size === 2", 25); wait(b, "d.NET.remotes.size === 2", 25); wait(c, "d.NET.remotes.size === 2", 25)
    t.eq('the far one plays in the host\'s lobby, as a guest, with the host as host', ev(c, "return [d.NET.game === a, d.NET.client, d.NET.hostPeer]", ev(a, "return d.NET.game")), [True, True, 'aaa'])
    t.eq('the host is the host and sees two guests', ev(a, "return [!!d.NET.client, [...d.NET.remotes.keys()].sort()]"), [False, ['bbb', 'ccc']])
    t.ok('the host and the far one really have no direct link', ev(c, "return d.NET.room.peers().find(p => p.peer === 'aaa').bridged === true") and ev(a, "return d.NET.room.peers().find(p => p.peer === 'ccc').bridged === true"))
    for p in (a, b, c):
        ev(p, "d.PH.brk = 0")
    ev(c, "d.car.pos.set(40, 0, -30); d.car.vel.set(0, 0, 0); d.car.speed = 0;"); a.wait_for_timeout(2000)
    t.ok('the host sees the far one\'s car where it is', ev(a, "const R = d.NET.remotes.get('ccc'); return Math.hypot(R.pos.x - 40, R.pos.z + 30) < 3"))
    ev(a, "for (let i = 0; i < 6; i++) d.spawnCritter('stilt', d.car.pos.x + 30 + i * 2, d.car.pos.z);"); a.wait_for_timeout(2500)
    na, nc = ev(a, "return d.swarm.filter(m => !m.dead).length"), ev(c, "return d.swarm.filter(m => !m.dead && m.net).length")
    t.ok('the far one sees the host\'s monsters', nc >= 6 and abs(na - nc) <= 3, [na, nc])

    for p, z in ((a, -6), (b, 0), (c, 6)):
        ev(p, "d.PH.brk = 999; d.fireCooldown = 1e9; d.car.maxHp = d.car.hp = 1e6; d.openGate(); d.car.pos.set(d.LAIR_POS.x - 18, 0, a); d.car.vel.set(0, 0, 0); d.car.speed = 0;", z)
    ev(a, "d.clearSwarm();")
    wait(a, "d.boss.state === 'fight'", 25); wait(c, "d.boss.state === 'fight'", 10); c.wait_for_timeout(1000)
    t.eq('everybody has the same health pool: the host\'s', [ev(p, "return d.bossMax()") for p in (a, b, c)], [4000, 4000, 4000])
    ev(c, "d.bossDamage(450);"); a.wait_for_timeout(1500)
    t.eq('a hit by the far one reaches the host once, and everybody shows the host\'s count', [ev(p, "return Math.round(d.boss.dealt)") for p in (a, b, c)], [450, 450, 450])
    ev(a, "d.boss.throwCd = d.boss.lashCd = d.boss.fanCd = d.boss.quakeCd = 1e9;")
    for _ in range(8):
        ev(c, "d.bossDamage(450);"); ev(b, "d.bossDamage(450);"); c.wait_for_timeout(400)
        if ev(a, "return d.boss.state") == 'flee':
            break
    t.eq('half the pool: the host starts the break-out and everybody follows', [ev(p, "return d.boss.ph") for p in (a, b, c)], [2, 2, 2])
    wait(a, "d.boss.state === 'fight'", 20); wait(c, "d.boss.state === 'fight'", 10)
    t.eq('a guest\'s killing blow does not kill it on its own screen: it waits for the host', ev(c, "d.bossDamage(99999); return [d.boss.state, d.NET.bdAcc > 0]"), ['fight', True])
    a.wait_for_timeout(2000)
    t.eq('the host counts the hit, and the host\'s kill is everybody\'s', [ev(p, "return d.boss.state") for p in (a, b, c)], ['dead', 'dead', 'dead'])
    t.done(g)
