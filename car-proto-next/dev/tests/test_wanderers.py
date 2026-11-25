"""Wandering bosses, one player on the halo: the crowd is 21, only the skill carriers are marked and pointed at, each one killed gives the next skill."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from harness.game import Game, Checks, ev, wait

CARRIERS = "d.swarm.filter(m => m.wbLoot && !m.dead)"
t = Checks('wanderers')
with Game() as g:
    p = g.solo('halo')
    ev(p, "d.PH.brk = 0; for (const k of ['spread', 'nova', 'orbit']) d.gainWeapon('w_' + k); d.abilities.jump = true; d.applyAbilityVisuals(); for (const P of d.pedestals) P.state = 'gone';")
    wait(p, "d.wbSpawned && d.swarm.filter(m => m.wb && !m.dead).length >= 21", 30)
    t.eq('the crowd', ev(p, "return d.swarm.filter(m => m.wb && !m.dead).length"), 21)
    t.eq('carriers = skills still missing (double jump, cubes)', ev(p, "return %s.length" % CARRIERS), 2)
    p.wait_for_timeout(600)
    t.eq('every carrier wears an icon', ev(p, "return %s.filter(m => m.mark && m.mark.parent).length" % CARRIERS), 2)
    t.eq('the icon is my next skill', ev(p, "return %s[0].mark.gift" % CARRIERS), 'doubleJump')
    t.eq('nobody else wears one', ev(p, "return d.swarm.filter(m => m.wb && !m.wbLoot && m.mark).length"), 0)
    for want in ('doubleJump', 'cubes'):
        ev(p, "const m = %s[0]; d.car.pos.set(m.pos.x + 9, 0, m.pos.z); d.car.vel.set(0, 0, 0); d.hitCritter(m, 99999, null, 0);" % CARRIERS)
        wait(p, "d.pickups.some(q => q.own && q.type === '%s')" % want, 10)
        t.ok(f'a killed carrier leaves {want}', True)
        for _ in range(40):
            if ev(p, "const q = d.pickups.find(q => q.own); if (!q) return true; d.car.pos.set(q.x, 0, q.z); d.car.vel.set(0, 0, 0); return false;"):
                break
            p.wait_for_timeout(250)
        t.ok(f'{want} picked up', ev(p, "return d.abilities['%s']" % want))
    p.wait_for_timeout(3500)
    t.eq('no carriers once every skill is home', ev(p, "return %s.length" % CARRIERS), 0)
    t.eq('and no icons left hanging', ev(p, "return d.wbMarks.length"), 0)
    t.done(g)
