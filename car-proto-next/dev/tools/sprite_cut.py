#!/usr/bin/env python3
"""Cut a sprite sheet drawn on a flat background into separate RGBA WebP files.

    python3 sprite_cut.py sheet.png out_dir [--min 3000] [--tol 70] [--names pinch,half,open,slap,bomb,spark]

The background colour is read from the top-left corner (ask the generator for flat magenta). Pieces are found as
connected blobs larger than --min pixels and numbered left to right, top to bottom (rows are told apart by the
blob centre). Writes <name>.webp, <name>.b64 (a data URI for ART_SRC in index.html) and meta.json with
[width, height, anchor_x, anchor_y]; the anchor is the bottom centre and is meant to be corrected by hand
(the pinch point of a glove, the base of a bomb).
"""
import argparse, base64, io, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('sheet'); ap.add_argument('out')
ap.add_argument('--min', type=int, default=3000); ap.add_argument('--tol', type=float, default=70)
ap.add_argument('--names', default=''); ap.add_argument('--quality', type=int, default=86)
a = ap.parse_args()

im = np.asarray(Image.open(a.sheet).convert('RGB')).astype(np.float32)
key = im[:6, :6].reshape(-1, 3).mean(0)
dist = np.sqrt(((im - key) ** 2).sum(-1))
alpha = np.clip((dist - a.tol * 0.5) / (a.tol * 0.5), 0, 1)                   # soft edge between half and full tolerance
lab, n = ndimage.label(ndimage.binary_closing(alpha > 0.5, iterations=3))
blobs = [(sl, lab[sl] == i + 1) for i, sl in enumerate(ndimage.find_objects(lab)) if (lab[sl] == i + 1).sum() >= a.min]
row_h = max(sl[0].stop - sl[0].start for sl, _ in blobs)
blobs.sort(key=lambda b: (round((b[0][0].start + b[0][0].stop) / 2 / row_h), b[0][1].start))
names = [s for s in a.names.split(',') if s] or [f'piece{i + 1}' for i in range(len(blobs))]
os.makedirs(a.out, exist_ok=True); meta = {}
for name, (sl, mask) in zip(names, blobs):
    rgb = im[sl].copy(); al = alpha[sl] * ndimage.binary_dilation(mask, iterations=2)
    spill = (dist[sl] < a.tol * 1.6)[..., None]                                # pull the key colour out of the edge pixels
    rgb = np.where(spill, rgb.mean(-1, keepdims=True) * 0.35 + rgb * 0.0, rgb)
    out = Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8), 'RGBA')
    buf = io.BytesIO(); out.save(buf, 'WEBP', quality=a.quality, method=6); data = buf.getvalue()
    open(os.path.join(a.out, name + '.webp'), 'wb').write(data)
    open(os.path.join(a.out, name + '.b64'), 'w').write('data:image/webp;base64,' + base64.b64encode(data).decode())
    meta[name] = [out.width, out.height, round(out.width / 2, 1), out.height]
    print(f'{name:<10} {out.width}x{out.height}  {len(data) // 1024} KB')
json.dump(meta, open(os.path.join(a.out, 'meta.json'), 'w'), indent=1)
print(f'{len(meta)} of {len(blobs)} pieces written to {a.out}')
