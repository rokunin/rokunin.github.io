"""Build the look lab: lab/index.html = a test-mode build of the game + the harness seams + lab.js. Run: python3 dev/lab/build.py
Published at https://rokunin.github.io/car-proto-next/lab/ . Not the game: nobody is sent there, and nothing in src/ knows about it."""
import os, re, sys, json, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); DEV = os.path.dirname(HERE); ROOT = os.path.dirname(DEV)
sys.path.insert(0, DEV)
from harness.game import day_js, rng_js
import frames
OUT = '/tmp/chubz-lab-build'
subprocess.run([sys.executable, os.path.join(DEV, 'harness', 'build.py'), '--out', OUT], check=True, cwd=DEV)
S = frames.SCENES; names = sorted(S); HF = S['halo_fx']
def sc(label, base, ride, pos, extra, n, nudge=''):
    return {'label': label, 'ride': ride, 'x': pos[0], 'z': pos[1], 'h': pos[2], 'extra': extra, 'n': n, 'nudge': nudge, 'rng': rng_js(7000 + names.index(base))}
SCENES = [
    sc('Хало + меч + руки', 'halo_fx', 'halo', HF[:3], "d.setView(11); d.abilities.cubes = true; d.abLv.jump = 3; d.castUlt('hands', d.car.pos.x - 9, d.car.pos.z + 3, d.car.heading, false); d.castUlt('sword', d.car.pos.x + 8, d.car.pos.z - 2, d.car.heading, false); d.landPower(3); d.special();", 14),
    sc('Хало вблизи', 'halo_fx', 'halo', HF[:3], "d.setView(6); d.abilities.cubes = true; d.abLv.jump = 3; d.landPower(3); d.special();", 3),
    sc('Меч', 'halo_fx', 'halo', HF[:3], "d.setView(9); d.castUlt('sword', d.car.pos.x + 3, d.car.pos.z + 3, d.car.heading, false);", 25),
    sc('Руки', 'halo_fx', 'halo', HF[:3], "d.setView(9); d.castUlt('hands', d.car.pos.x, d.car.pos.z, d.car.heading, false);", 45),
    sc('Купол', 'halo_fx', 'unicorn', HF[:3], "d.setView(8); d.abilities.bomb = true; d.abLv.bomb = 2; d.special();", 6),
    sc('Стена огня', 'lava', 'buggy', S['lava'][:3], S['lava'][4] + " d.setView(11);", 20, 'd.car.pos.x -= 15; d.car.pos.z -= 4;'),
    sc('Логово', 'lair', 'buggy', S['lair'][:3], "d.setView(14);", 2),
    sc('Лут', 'loot', 'buggy', S['loot'][:3], S['loot'][4] + " d.setView(6);", 30, 'd.car.pos.x += 10; d.car.pos.z += 10;'),
    sc('Поле', 'field', 'buggy', S['field'][:3], "d.setView(12);", 2),
]
stage = frames.STAGE.replace('(new Function(a[4]))();', 'window.eval(a[4]);')
lab = open(os.path.join(HERE, 'lab.js')).read().replace('__SCENES__', json.dumps(SCENES, ensure_ascii=False)).replace('__STAGE__', json.dumps(stage))
QUIET = """// the lab's clock stands still, and a sound started then computes a non-finite AudioParam and throws: ignore such values here
{ const pd = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value'); Object.defineProperty(AudioParam.prototype, 'value', { get: pd.get, set(v) { if (Number.isFinite(v)) pd.set.call(this, v); } });
  for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) { const f = AudioParam.prototype[k]; AudioParam.prototype[k] = function (...a) { return a.every(Number.isFinite) ? f.apply(this, a) : this; }; } }"""
init = '\n'.join([QUIET, day_js('2026-01-01'), rng_js(1001), open(os.path.join(DEV, 'harness', 'hx.js')).read(), open(os.path.join(DEV, 'harness', 'mock_room.js')).read()])
assert '</script>' not in init and '</script>' not in lab
s = open(os.path.join(OUT, 'index.html')).read()
m = re.search(r'<head[^>]*>', s)
s = s[:m.end()] + '\n<meta name="robots" content="noindex">\n<script>\n' + init + '\n</script>\n' + s[m.end():]
i = s.rindex('</body>')
s = s[:i] + '<script>\n' + lab + '\n</script>\n' + s[i:]
os.makedirs(os.path.join(ROOT, 'lab'), exist_ok=True)
open(os.path.join(ROOT, 'lab', 'index.html'), 'w').write(s)
print('lab/index.html', len(s))
