"""The picture: eight scenes (field, the four rides, a swarm, the lair, the fire wall, loot) through the game's own renderer match
the reference frames in dev/frames/r128 (ADR-0005). A failure writes side-by-sides to /tmp/chubz-frames: reference left, now right.
When the picture is meant to change, record new references (python3 frames.py record) after Roman has seen it."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import frames
from harness.game import Checks

t = Checks('frames')
res = frames.compare(frames.take(list(frames.SCENES)), os.path.join(frames.HERE, 'frames', 'r128'), '/tmp/chubz-frames')
for n, v in res.items():
    t.ok(f'{n}: under {frames.NOISE:.0%} of pixels changed', v is not None and v < frames.NOISE, v)
t.done()
