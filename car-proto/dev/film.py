#!/usr/bin/env python3
"""Film a moment of the game frame by frame and save it as a GIF (and a contact sheet to look at first).

    python3 film.py --setup "<js>" --frames 48 --dt 0.05 --clip 440,0,560,440 -o /tmp/glove.gif

The clock is frozen and stepped, so the GIF plays at the game's real speed however slow the headless renderer is.
--setup runs once after the ride starts (d is window.__dbg); --each runs before every frame; --lead plays frames unrecorded first.

Example, the glove delivering a bomb (a log machine must stand or the game takes the bomb away):
    python3 film.py --frames 48 -o /tmp/glove.gif --clip 440,0,560,440 --setup "
        d.PH.brk = 0; let ok = false; for (let i = 0; i < 30 && !ok; i++) ok = d.spawnRig();
        const B = d.addBomb(999, Math.round(d.car.pos.x + 6), Math.round(d.car.pos.z - 6), true); B.drop.t = 0.6;"
"""
import argparse, os, shutil, subprocess, sys, tempfile, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness.game import Game, canvas_png, ev, freeze, godmode, sheet, step


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--setup', default='', help='JS run once after start')
    ap.add_argument('--each', default='', help='JS run before every frame')
    ap.add_argument('--ride', default='buggy')
    ap.add_argument('--frames', type=int, default=40)
    ap.add_argument('--dt', type=float, default=0.05, help='game seconds per frame; the GIF plays at 1/dt frames a second')
    ap.add_argument('--lead', type=int, default=0, help='frames to play before recording starts')
    ap.add_argument('--clip', default='', help='x,y,w,h in page pixels; default is the whole page')
    ap.add_argument('--canvas', action='store_true', help='record the game picture only, without HUD')
    ap.add_argument('--hold', type=float, default=0.8, help='seconds to hold the last frame')
    ap.add_argument('-o', '--out', default='/tmp/film.gif')
    a = ap.parse_args()
    clip = None
    if a.clip:
        x, y, w, h = (int(v) for v in a.clip.split(','))
        clip = {'x': x, 'y': y, 'width': w, 'height': h}
    tmp = tempfile.mkdtemp(prefix='chubz-film-'); t0 = time.time()
    with Game(fast=False) as g:
        p = g.solo(a.ride); godmode(p); p.wait_for_timeout(500)
        freeze(p)
        if a.setup:
            ev(p, a.setup)
        if a.lead:
            step(p, a.lead, a.dt)
        for i in range(a.frames):
            if a.each:
                ev(p, a.each)
            step(p, 1, a.dt)
            f = os.path.join(tmp, f'f{i:04d}.png')
            if a.canvas:
                from PIL import Image
                import io
                im = Image.open(io.BytesIO(canvas_png(p)))
                (im.crop((clip['x'], clip['y'], clip['x'] + clip['width'], clip['y'] + clip['height'])) if clip else im).save(f)
            else:
                p.screenshot(path=f, **({'clip': clip} if clip else {}))
        if g.errs:
            print('page errors:', g.errs[:3])
    fps = round(1 / a.dt)
    frames = sorted(os.path.join(tmp, f) for f in os.listdir(tmp))
    if shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', os.path.join(tmp, 'f%04d.png'), '-vf',
                        f'tpad=stop_mode=clone:stop_duration={a.hold},split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
                        '-loop', '0', a.out], check=True)
    else:
        from PIL import Image
        ims = [Image.open(f).convert('P', palette=Image.ADAPTIVE, colors=160) for f in frames]
        ims[0].save(a.out, save_all=True, append_images=ims[1:], duration=[int(1000 * a.dt)] * (len(ims) - 1) + [int(1000 * a.hold)], loop=0)
    pick = frames[::max(1, len(frames) // 8)][:9]
    sheet_path = os.path.splitext(a.out)[0] + '_sheet.png'
    sheet(pick, sheet_path, cols=3)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f'{a.out}  {os.path.getsize(a.out) // 1024} KB, {len(frames)} frames at {fps} fps, {time.time() - t0:.0f} s; look at {sheet_path} first')


if __name__ == '__main__':
    main()
