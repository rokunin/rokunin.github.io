#!/usr/bin/env python3
"""Build the local test page from the game's sources.

    python3 build.py [--src ../../src] [--out /tmp/chubz-test]

The test page is the game's own build in test mode (`vite build --mode test`): the shipped page plus the debug registry
window.__dbg at the marker in src/legacy.js (vite-test.js reads names.txt). Everything else a test needs comes in through
seams: game.py adds hx.js (the frame clock the game reads as HX) and mock_room.js as Playwright init scripts, and this script
puts trystero_shim.js next to the page as trystero.js.

Given an .html file instead (build 136 and older, e.g. the frozen ../../../car-proto/index.html), it patches that file the old way,
by text anchors, and serves three.js from node_modules in place of the CDNs.
"""
import argparse, hashlib, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, '..', '..'))
DEFAULT_SRC = os.path.join(PROJECT, 'src')
DEFAULT_OUT = os.environ.get('CHUBZ_OUT', '/tmp/chubz-test')


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


def patch_code(s):
    """The hooks an old single index.html (build 136 and older) gets by text anchors; src/ has seams in their place."""
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
    return s, n_names


def finish(out, quiet, build_no, n_names):
    shutil.copyfile(os.path.join(HERE, 'trystero_shim.js'), os.path.join(out, 'trystero.js'))
    assets = os.path.join(PROJECT, 'assets')
    link = os.path.join(out, 'assets')
    if os.path.islink(link) and os.readlink(link) != assets:
        os.remove(link)
    if os.path.isdir(assets) and not os.path.exists(link):
        os.symlink(assets, link)
    info = {'out': out, 'build': build_no, 'names': n_names}
    if not quiet:
        print(f"build.py: build {info['build']} -> {out}/index.html, {n_names} debug names")
    return info


def build(src=DEFAULT_SRC, out=DEFAULT_OUT, quiet=False):
    os.makedirs(out, exist_ok=True)
    return build_html(src, out, quiet) if src.endswith('.html') else build_src(src, out, quiet)


def build_src(src, out, quiet):
    """src/ → the game's Vite build in test mode → out/index.html. Skipped when nothing it reads has changed."""
    inputs = sorted(os.path.join(dp, f) for dp, _, fs in os.walk(src) for f in fs)
    inputs += [os.path.join(HERE, f) for f in ('build.py', 'names.txt', 'vite-test.js')] + [os.path.join(PROJECT, f) for f in ('vite.config.js', 'package-lock.json')]
    h = hashlib.sha1()
    for f in inputs:
        h.update(f.encode()); h.update(open(f, 'rb').read())
    stamp, page = os.path.join(out, '.stamp'), os.path.join(out, 'index.html')
    meta = re.search(r'<meta name="chubz-build" content="(\d+)"', open(os.path.join(src, 'index.html'), encoding='utf8').read())
    build_no, n_names = (int(meta.group(1)) if meta else None), dbg_object(os.path.join(HERE, 'names.txt'))[1]
    if os.path.exists(page) and os.path.exists(stamp) and open(stamp).read() == h.hexdigest():
        return finish(out, quiet, build_no, n_names)
    if not os.path.isdir(os.path.join(PROJECT, 'node_modules', 'vite')):
        if not quiet:
            print('build.py: npm ci in', PROJECT)
        subprocess.run(['npm', 'ci', '--silent', '--no-audit', '--no-fund'], cwd=PROJECT, check=True)
    if os.path.exists(page):
        os.remove(page)
    if os.path.normpath(src) != DEFAULT_SRC:
        sys.exit('build.py: a source folder other than src/ is not supported; vite.config.js sets the root')
    r = subprocess.run(['node', os.path.join(PROJECT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', os.path.join(PROJECT, 'vite.config.js'),
                        '--mode', 'test', '--outDir', out, '--logLevel', 'error'], cwd=PROJECT, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(page):
        sys.exit('build.py: vite build failed\n' + r.stdout + r.stderr)
    open(stamp, 'w').write(h.hexdigest())
    return finish(out, quiet, build_no, n_names)


def build_html(src, out, quiet):
    """An old single-file page (build 136 and older): three.js from node_modules in place of the CDNs, hooks patched in."""
    s = open(src, encoding='utf8').read()
    n_cdn = s.count('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js') + s.count('https://cdn.jsdelivr.net/npm/three@0.128.0/')
    s = s.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'node_modules/three/build/three.min.js')
    s = s.replace('https://cdn.jsdelivr.net/npm/three@0.128.0/', 'node_modules/three/')
    if n_cdn < 2 or 'https://cdn' in s:
        sys.exit('build.py: the CDN script tags changed; update the replacements in build.py')
    s, n_names = patch_code(s)
    open(os.path.join(out, 'index.html'), 'w', encoding='utf8').write(s)
    if os.path.exists(os.path.join(out, '.stamp')):
        os.remove(os.path.join(out, '.stamp'))
    if not os.path.exists(os.path.join(out, 'node_modules', 'three', 'build', 'three.min.js')):
        if not quiet:
            print('build.py: installing three@0.128.0 into', out)
        subprocess.run(['npm', 'i', '--silent', '--no-audit', '--no-fund', '--prefix', out, 'three@0.128.0'], check=True)

    b = re.search(r'const BUILD = (\d+)', s)
    return finish(out, quiet, int(b.group(1)) if b else None, n_names)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--out', default=DEFAULT_OUT)
    a = ap.parse_args()
    build(a.src, a.out)
