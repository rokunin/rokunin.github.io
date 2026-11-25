#!/usr/bin/env python3
"""Build the local test page from the game's single source file.

    python3 build.py [--src ../../index.html] [--out /tmp/chubz-test]

What changes against the shipped page, and nothing else:
  * three.js comes from node_modules instead of the CDNs (the sandbox has no CDN access);
  * window.__dbg exposes the names listed in names.txt, read live through getters;
  * window.__hx owns the frame clock: cap dt, freeze time, step frame by frame, skip idle renders;
  * adaptQuality() is off, so the picture does not change with the machine's speed;
  * the lobby's how-to pictures are not rendered (they cost 18 s of start-up in a headless browser);
  * the room mock and the Trystero shim stand in for the network.

Every patch asserts that its anchor matched exactly once. If the game's code moved, the build fails here
and names the anchor, instead of producing a page that silently lacks a hook.
"""
import argparse, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'index.html'))
DEFAULT_OUT = os.environ.get('CHUBZ_OUT', '/tmp/chubz-test')

HX = r"""
window.__hx = {            // the test build's frame clock
  cap: 0,                  // max dt per frame in normal running; 0 = the game's own 1/30
  frozen: false,           // true: game time stands still, frames advance only through step()
  queue: 0, stepDt: 0.05,  // frames still to play while frozen, and the dt each one gets
  sub: 1, fixed: 0,        // turbo: run update() `sub` times a frame, each with the fixed dt (game time no longer waits for the wall clock)
  frames: 0, dirty: true,
  noRender: !!window.__noRender,   // set before the page loads (game.py, fast mode): not even the first frame is drawn. The first full render costs ~18 s headless
  dt(raw) { this.frames++;
    if (this.frozen) { if (this.queue > 0) { this.queue--; this.dirty = true; return this.stepDt; } return 1e-6; }
    this.dirty = true; if (this.fixed) return this.fixed; return Math.min(raw, this.cap || window.__dtcap || 1 / 30); },
  skipRender() { if (this.noRender) return true; if (this.frozen && !this.dirty) return true; this.dirty = false; return false; },
  freeze() { this.frozen = true; this.queue = 0; this.dirty = true; },
  thaw() { this.frozen = false; },
  step(n, dt) { this.frozen = true; if (dt) this.stepDt = dt; this.queue += n || 1; },
};
"""


def sub_once(s, old, new, what):
    n = s.count(old)
    if n != 1:
        sys.exit(f'build.py: anchor for "{what}" matched {n} times, expected 1:\n    {old[:110]}')
    return s.replace(old, new)


def dbg_object(path):
    members, names = [], []
    for raw in open(path, encoding='utf8'):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('!'):
            members.append(line[1:].strip())
        elif line.startswith('rw '):
            n = line[3:].strip(); names.append(n)
            members.append(f'get {n}(){{return {n}}}, set {n}(v){{{n}=v}}')
        elif '=' in line:
            k, v = (x.strip() for x in line.split('=', 1)); names.append(k)
            members.append(f'get {k}(){{return {v}}}')
        else:
            names.append(line); members.append(f'get {line}(){{return {line}}}')
    dup = sorted({n for n in names if names.count(n) > 1})
    if dup:
        sys.exit(f'build.py: names.txt lists these twice: {", ".join(dup)}')
    check = ('__names: ' + repr(names).replace("'", '"') +
             ', __check(){ const bad = []; for (const n of this.__names) { try { void this[n]; } catch (e) { bad.push(n); } } return bad; }')
    return 'window.__dbg = { ' + ', '.join(members) + ', ' + check + ' };', len(names)


def build(src=DEFAULT_SRC, out=DEFAULT_OUT, quiet=False):
    s = open(src, encoding='utf8').read()
    os.makedirs(out, exist_ok=True)

    n_cdn = s.count('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js') + s.count('https://cdn.jsdelivr.net/npm/three@0.128.0/')
    s = s.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'node_modules/three/build/three.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/three@0.128.0/', 'node_modules/three/')
    if n_cdn < 2 or 'https://cdn' in s:
        sys.exit('build.py: the CDN script tags changed; update the replacements in build.py')

    dbg, n_names = dbg_object(os.path.join(HERE, 'names.txt'))
    m = re.findall(r'^  applyAbilityVisuals\(\);$', s, re.M)
    if len(m) != 1:
        sys.exit(f'build.py: anchor for the __dbg hook ("  applyAbilityVisuals();" on its own line) matched {len(m)} times')
    s = re.sub(r'^  applyAbilityVisuals\(\);$', lambda _: '  applyAbilityVisuals();\n  ' + dbg, s, count=1, flags=re.M)

    s = sub_once(s, 'dt = Math.min(raw, 1 / 30);', 'dt = window.__hx ? window.__hx.dt(raw) : Math.min(raw, 1 / 30);', 'frame clock')
    s = sub_once(s, '    update(dt);\n    if (++shadowTick >= shadowEvery)', '    for (let k = 0, n = window.__hx ? window.__hx.sub : 1; k < n; k++) update(dt);      // turbo: several game steps a frame\n    if (++shadowTick >= shadowEvery)', 'turbo substeps')
    s = sub_once(s, '  function adaptQuality(raw) {', '  function adaptQuality(raw) { return;', 'adaptQuality off')
    s = sub_once(s, '    if (composer) {\n      gradePass.uniforms.time.value = elapsed;',
                 '    if (window.__hx && window.__hx.skipRender()) {} else if (composer) {\n      gradePass.uniforms.time.value = elapsed;', 'idle render skip')

    # the lobby's "how to play" pictures are five full renders of the game at start-up: 18 of the 22 seconds a headless page takes to boot
    s = sub_once(s, "        if (!composer) throw 0;\n        const cv = renderer.domElement, asp", "        if (!composer || window.__hx) throw 0;\n        const cv = renderer.domElement, asp", 'skip the how-to renders')
    s = sub_once(s, "  (function prewarm() {\n    try {\n", "  (function prewarm() {\n    try {\n      if (window.__noRender) return;      // fast mode draws nothing, so there is nothing to compile\n", 'skip the shader prewarm in fast mode')
    head = '<script>\n' + HX + open(os.path.join(HERE, 'mock_room.js'), encoding='utf8').read() + '</script>\n'
    s = sub_once(s, '<script src="node_modules/three/build/three.min.js"', head + '<script src="node_modules/three/build/three.min.js"', 'head scripts')

    open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(s)
    shutil.copyfile(os.path.join(HERE, 'trystero_shim.js'), os.path.join(out, 'trystero.js'))
    assets = os.path.join(os.path.dirname(src), 'assets')
    if os.path.isdir(assets) and not os.path.exists(os.path.join(out, 'assets')):
        os.symlink(assets, os.path.join(out, 'assets'))
    if not os.path.exists(os.path.join(out, 'node_modules', 'three', 'build', 'three.min.js')):
        if not quiet:
            print('build.py: installing three@0.128.0 into', out)
        subprocess.run(['npm', 'i', '--silent', '--no-audit', '--no-fund', '--prefix', out, 'three@0.128.0'], check=True)

    b = re.search(r'const BUILD = (\d+)', s)
    info = {'out': out, 'build': int(b.group(1)) if b else None, 'names': n_names}
    if not quiet:
        print(f"build.py: build {info['build']} -> {out}/index.html, {n_names} debug names")
    return info


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--out', default=DEFAULT_OUT)
    a = ap.parse_args()
    build(a.src, a.out)
