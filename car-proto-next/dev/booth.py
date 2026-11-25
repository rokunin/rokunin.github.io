#!/usr/bin/env python3
"""Photo booth: one model on an empty floor, through the game's own camera, light and post-processing.

    python3 booth.py "d.makeHand()" -o /tmp/hand.png
    python3 booth.py "d.makeHand()" "(() => { const m = d.spawnCritter('mini', 0, 0); return m.g; })()" --turns 0,90,180,270

Each expression is JS that returns a THREE.Object3D; `d` is window.__dbg. A model that is not in the scene yet is put on
the floor next to the car; one that already stands in the scene is photographed where it is.

The sheet has, per model: one tile at the game's scale (what a player sees) and one close tile per turn.
Judge the game-scale tile first. This replaces a Blender render: the picture is the shipped renderer, so nothing is lost on the way.
"""
import argparse, base64, io, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness.game import Game, ev, sheet

SHOOT = r"""
const THREE = d.THREE, scene = d.scene, hx = window.__hx; hx.freeze();
const obj = (new Function('d', 'THREE', 'return (' + a.expr + ')'))(d, THREE);
if (!obj || !obj.isObject3D) throw new Error('booth: the expression must return a THREE.Object3D');
const own = !obj.parent; if (own) scene.add(obj);
let top = obj; while (top.parent && top.parent !== scene) top = top.parent;
const hidden = []; for (const c of scene.children) if (c !== top && !c.isLight && c.visible && !(c.type === 'Object3D' && !c.children.length)) { c.visible = false; hidden.push(c); }
obj.updateMatrixWorld(true);
let box = new THREE.Box3().setFromObject(obj);
if (own) { const c = box.getCenter(new THREE.Vector3()); obj.position.x += d.car.pos.x - c.x; obj.position.z += d.car.pos.z - c.z; obj.position.y += a.lift - box.min.y; obj.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(obj); }
const ctr = box.getCenter(new THREE.Vector3());
const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 48), new THREE.MeshStandardMaterial({ color: a.floor, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(ctr.x, own ? 0 : box.min.y, ctr.z); floor.receiveShadow = true; scene.add(floor);
const game = d.camera, cam = game.clone(), dir = game.getWorldDirection(new THREE.Vector3());
cam.position.copy(ctr).addScaledVector(dir, -150); cam.updateMatrixWorld(true);
const rp = d.composer && d.composer.passes.find(p => p.camera && p.scene), keep = rp && rp.camera;
const snap = zoom => { cam.zoom = zoom; cam.updateProjectionMatrix(); d.renderer.shadowMap.needsUpdate = true;
  if (rp) { rp.camera = cam; d.composer.render(); rp.camera = keep; } else d.renderer.render(scene, cam);
  return d.renderer.domElement.toDataURL('image/png'); };
const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), halfH = (game.top - game.bottom) / 2;
const frame = () => {            // centre the camera on what the model covers on screen and return the zoom that fills the tile with it
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const c = new THREE.Vector3(), s = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  obj.traverse(o => { if (!o.isMesh || !o.visible) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    c.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld); o.getWorldScale(s); const r = g.boundingSphere.radius * Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)), x = c.dot(right), y = c.dot(up);
    x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); });
  cam.position.addScaledVector(right, (x0 + x1) / 2 - cam.position.dot(right)).addScaledVector(up, (y0 + y1) / 2 - cam.position.dot(up)); cam.updateMatrixWorld(true);
  return halfH / (Math.max(x1 - x0, y1 - y0) / 2 * 1.08); };
const q0 = obj.quaternion.clone(), Y = new THREE.Vector3(0, 1, 0), fit = frame(), out = { game: snap(game.zoom), close: [], pxPerM: d.renderer.domElement.height / (2 * halfH / game.zoom), fit };
for (const t of a.turns) { obj.quaternion.copy(q0); if (t) obj.rotateOnWorldAxis(Y, t * Math.PI / 180); out.close.push(snap(frame())); }
obj.quaternion.copy(q0);
scene.remove(floor); for (const c of hidden) c.visible = true; if (own) scene.remove(obj);
hx.thaw(); return out;
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('expr', nargs='+', help='JS returning an Object3D; d is window.__dbg')
    ap.add_argument('-o', '--out', default='/tmp/booth.png')
    ap.add_argument('--ride', default='buggy')
    ap.add_argument('--turns', default='0', help='yaw angles in degrees for the close tiles, e.g. 0,90,180,270')
    ap.add_argument('--lift', type=float, default=0, help='raise a model that is not in the scene this many metres off the floor')
    ap.add_argument('--floor', default='#b99373')
    ap.add_argument('--tile', type=int, default=360, help='tile height in pixels')
    a = ap.parse_args()
    from PIL import Image
    turns = [float(x) for x in a.turns.split(',')]
    t0 = time.time(); tiles, labels = [], []
    with Game(fast=False) as g:
        p = g.solo(a.ride); p.wait_for_timeout(500)
        for n, expr in enumerate(a.expr):
            r = ev(p, SHOOT, {'expr': expr, 'turns': turns, 'lift': a.lift, 'floor': a.floor})
            im = Image.open(io.BytesIO(base64.b64decode(r['game'].split(',', 1)[1]))).convert('RGB')
            w = int(a.tile * 4 / 3); cx, cy = im.width // 2, im.height // 2
            tiles.append(im.crop((cx - w // 2, cy - a.tile // 2, cx + w // 2, cy + a.tile // 2))); labels.append(f'#{n + 1} game scale, {r["pxPerM"]:.0f} px/m')
            for t, url in zip(turns, r['close']):
                c = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
                s = min(c.width, c.height); c = c.crop(((c.width - s) // 2, (c.height - s) // 2, (c.width + s) // 2, (c.height + s) // 2)).resize((a.tile, a.tile), Image.LANCZOS)
                tiles.append(c); labels.append(f'#{n + 1} close, turn {t:g}')
        if g.errs:
            print('page errors:', g.errs[:3])
    sheet(tiles, a.out, cols=1 + len(turns), labels=labels)
    print(f'{a.out}  ({len(a.expr)} model(s), {time.time() - t0:.0f} s)')


if __name__ == '__main__':
    main()
