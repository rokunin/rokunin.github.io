"""The picture: nine scenes (field, the four rides, a swarm, the lair, the fire wall, the halo's glowing spikes and cubes up close, loot) through the game's own renderer match
the reference frames of the installed Three.js version, dev/frames/r<N> (ADR-0005). A failure writes side-by-sides to /tmp/chubz-frames: reference left, now right.
When the picture is meant to change, record new references (python3 frames.py record) after Roman has seen it.
frames/r128 is the picture before the Three.js upgrade; every scene with the white dim off (build 150, Roman: whites 15% down) must stay within 2% of it."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import frames
from harness.game import Checks

t = Checks('frames')
t.ok(f'references exist for this Three.js ({os.path.basename(frames.REF)})', os.path.isdir(frames.REF))
shots, plain = frames.take(list(frames.SCENES), plain=True)
res = frames.compare(shots, frames.REF, '/tmp/chubz-frames')
for n, v in res.items():
    t.ok(f'{n}: under {frames.NOISE:.0%} of pixels changed', v is not None and v < frames.NOISE, v)
# and against the picture before the Three.js upgrade: the upgrade may move it a little, not more (r187's bloom once made white glows ~5x brighter)
old = frames.compare(plain, os.path.join(frames.HERE, 'frames', 'r128'), '/tmp/chubz-frames-r128')      # without build 150's white dim
for n, v in old.items():
    t.ok(f'{n}: within 2% of r128', v is not None and v < 0.02, v)
t.done()
