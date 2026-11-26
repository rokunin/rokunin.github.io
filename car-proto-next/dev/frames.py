#!/usr/bin/env python3
"""Reference frames: a few fixed scenes through the game's own renderer and post-processing, for comparing the picture between builds.

    python3 frames.py record [--dir frames/r151]          take the scenes and save them as the reference
    python3 frames.py compare [--dir frames/r128]         take them again, compare, write side-by-sides to /tmp/chubz-frames

References live per Three.js version: frames/r<N> for the version in node_modules (REF). frames/r128 is the picture before the upgrade;
since build 151 glows keep their colour (the grade's hueKeep, the bloom's glowMax and soft knee), so the check against r128 uses a second render with those off.

A scene is staged in one go on a frozen clock: Math.random is seeded again, the car, camera and objects are put in place,
then a few frames of 1/30 s run (the fire wall rises, coins land) and the canvas is read right after a render, without the HUD.
What still moves between runs (an idle frame or two before the shot) stays under 0.5% of pixels.
The number per scene is the share of pixels whose colour moved by more than 24 of 255 in some channel.
References are WebP at quality 90 (about 120 KB a frame; the compression itself moves under 0.1% of pixels past 24).
"""
import argparse, base64, io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image, ImageChops
from harness.game import Game, ev, wait, rng_js

SIZE = (960, 600)
def three_revision():
    import json as _j
    return _j.load(open(os.path.join(HERE, '..', 'node_modules', 'three', 'package.json')))['version'].split('.')[1]


REF = os.path.join(HERE, 'frames', 'r' + three_revision())
NOISE = 0.01          # share of changed pixels that still counts as "the same picture" (runs differ by under 0.5%)

STAGE = r"""
const [seed, x, z, heading] = a;
(new Function(a[4]))();                                       // Math.random seeded again: the scene draws the same numbers every run
const hx = window.__hx; hx.freeze(); d.elapsed = 100;                    // the game's clock drives pulses, orbits and shader noise
d.clearSwarm(); d.calm(); d.PH.brk = 999; d.fireCooldown = 1e9; d.setView(18);
d.car.pos.set(x, 0, z); d.car.vel.set(0, 0, 0); d.car.speed = 0; d.car.heading = heading;
d.camFocus.copy(d.car.pos); d.camera.position.copy(d.car.pos).add(d.ISO_OFFSET); d.camera.lookAt(d.camFocus);
for (const P of d.pedestals) P.g.visible = false;            // each player's pedestals are laid out at random: not part of the picture
"""
SNAP = r"""
d.calm(); d.car.vel.set(0, 0, 0);                            // a roar may have shaken the camera in the last frame: put it back exactly
d.camFocus.copy(d.car.pos); d.camera.position.copy(d.car.pos).add(d.ISO_OFFSET); d.camera.lookAt(d.camFocus); d.camera.updateMatrixWorld();
const gp = d.gradePass;
if (gp) { gp.uniforms.time.value = 1.0; gp.uniforms.hurt.value = 0; gp.uniforms.lowHp.value = 0; }
d.renderer.shadowMap.needsUpdate = true;
const draw = () => { if (d.composer) d.composer.render(); else d.renderer.render(d.scene, d.camera); return d.renderer.domElement.toDataURL('image/png'); };
const shot = draw(), hk = gp && gp.uniforms.hueKeep, hp = d.composer && d.composer.passes[1].highPassUniforms;   // and once more with build 151's glow look off, for the check against r128
if (!hk || !hp || !hp.glowMax) return [shot, shot];
const k = [hk.value, hp.glowMax.value, hp.smoothWidth.value]; hk.value = 0; hp.glowMax.value = 0; hp.smoothWidth.value = 0.01;
const plain = draw(); hk.value = k[0]; hp.glowMax.value = k[1]; hp.smoothWidth.value = k[2];
return [shot, plain];
"""

# name: (car x, car z, heading, ride, JS run after the staging, frames of 1/30 s before the shot)
SCENES = {
    'field':  (20, 30, 0.7, 'buggy', '', 2),
    'spider': (-20, 120, 2.2, 'spider', '', 2),      # rides stand where no evil cube is within 50 m: a cube wakes when a car comes near
    'halo':   (-20, 120, 2.2, 'halo', '', 2),
    'unicorn': (-20, 120, 2.2, 'unicorn', '', 2),
    'swarm':  (-40, -70, 0.3, 'buggy',
               "let i = 0; for (const k of ['gremlin', 'stilt', 'brute', 'spitter', 'gremlin', 'stilt', 'brute', 'spitter']) { const an = i++ / 8 * 6.283, m = d.spawnCritter(k, d.car.pos.x + Math.cos(an) * 7, d.car.pos.z + Math.sin(an) * 7, 0); m.K = { ...m.K, speed: 0 }; m.stun = 99; }", 24),      # they grow out of the ground for a moment
    'lair':   (None, None, 1.2, 'buggy', '', 2),
    'lava':   (60, -120, 0.4, 'buggy', "d.bossSetPos(d.car.pos.x + 12, d.car.pos.z - 6); d.bossLava(d.car.pos.x + 12, d.car.pos.z - 6, 30, 99);", 20),
    # close up on what glows: the halo's spikes and wing cubes (bloom on white; Roman caught r187's bloom at 5x on 25.11.2026)
    'halo_fx': (-20, 120, 2.2, 'halo', "d.setView(6); d.abilities.cubes = true; d.abLv.jump = 3; d.landPower(3); d.special();", 8),
    'loot':   (90, 60, 2.8, 'buggy', "d.dropCoins(new d.THREE.Vector3(d.car.pos.x + 13, 0, d.car.pos.z + 13), 24, 10);", 30),      # 18 m out: beyond the magnet's 13 m
}


def shoot(g, p, name):
    x, z, heading, ride, extra, n = SCENES[name]
    if ride != ev(p, "return d.ride"):
        ev(p, "d.setRide(a);", ride)
    if x is None:                                              # the lair: the car stands south-west of the Pyramidon's nest
        x, z = ev(p, "return [d.LAIR_POS.x - 22, d.LAIR_POS.z + 14]")
    ev(p, STAGE + extra + "\nwindow.__hx.step(a[5], 1 / 30);", [7, x, z, heading, rng_js(7000 + sorted(SCENES).index(name)), n])
    wait(p, "window.__hx.queue === 0", 60, every=0.02)
    return [Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1]))).convert('RGB') for u in ev(p, SNAP)]


def changed(a, b):
    if a.size != b.size:
        return 1.0
    h = ImageChops.difference(a, b).convert('L').histogram()
    return sum(h[25:]) / (a.size[0] * a.size[1])


def take(names, plain=False):
    """The scenes as players see them; with plain=True also as a second dict without build 151's glow look (what frames/r128 is compared with)."""
    out, flat = {}, {}
    with Game(fast=False, size=SIZE, out=os.environ.get('CHUBZ_OUT', '/tmp/chubz-test') + '-frames') as g:
        p = g.solo('buggy')
        p.wait_for_timeout(1500)
        for n in names:
            out[n], flat[n] = shoot(g, p, n)
    return (out, flat) if plain else out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('what', choices=['record', 'compare'])
    ap.add_argument('--dir', default=REF)
    ap.add_argument('--only', default='', help='comma-separated scene names')
    ap.add_argument('--out', default='/tmp/chubz-frames')
    a = ap.parse_args()
    names = [n for n in SCENES if not a.only or n in a.only.split(',')]
    shots = take(names)
    if a.what == 'record':
        os.makedirs(a.dir, exist_ok=True)
        for n, im in shots.items():
            im.save(os.path.join(a.dir, n + '.webp'), quality=90, method=6)
        print(f'recorded {len(shots)} frames in {a.dir}')
        return 0
    res = compare(shots, a.dir, a.out)
    print(json.dumps(res))
    return 0 if all(v is not None and v < NOISE for v in res.values()) else 1


def compare(shots, ref_dir, out):
    """Share of changed pixels per scene against the references; side-by-sides (reference left, now right) go to `out`."""
    os.makedirs(out, exist_ok=True)
    res = {}
    for n, im in shots.items():
        ref_path = os.path.join(ref_dir, n + '.webp')
        if not os.path.exists(ref_path):
            res[n] = None; continue
        ref = Image.open(ref_path).convert('RGB')
        res[n] = round(changed(ref, im), 4)
        side = Image.new('RGB', (ref.size[0] * 2, ref.size[1])); side.paste(ref, (0, 0)); side.paste(im, (ref.size[0], 0))
        side.save(os.path.join(out, n + '.jpg'), quality=88)
        im.save(os.path.join(out, n + '.new.png'))
    return res


if __name__ == '__main__':
    sys.exit(main())
