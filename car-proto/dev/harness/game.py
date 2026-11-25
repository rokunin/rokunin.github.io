"""Run the CHUBZ test page in a headless browser.

    from harness.game import Game, ev, wait

    with Game() as g:                      # builds the page, serves it, starts the browser, stops all of it on exit
        p = g.solo('buggy')                # one player, lobby skipped
        a, b = g.lobby('buggy', 'unicorn') # host and a friend in one lobby
        ev(p, "return d.coins")            # run JS in the page; d is window.__dbg
        wait(p, "d.bombs.length > 0", 30)  # poll a condition, fail with its text on timeout

Two modes:
  fast=True  (default)  logic tests: nothing is drawn, frames run off a 16 ms timer, the game may catch up to 0.1 s per frame
  fast=False            pictures: real rendering through the game's own post-processing; slow under swiftshader,
                        so freeze() and step() the clock and take pictures between steps
"""
import base64, io, os, socket, subprocess, sys, time

from playwright.sync_api import sync_playwright

from . import build as _build

CHROME = '/usr/bin/google-chrome'
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
RIDES = ('buggy', 'halo', 'spider', 'unicorn')


def _free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close(); return port


class Game:
    def __init__(self, fast=True, size=None, scale=1, src=None, out=None, turbo=0):
        self.fast, self.scale = fast, scale
        self.size = size or ((700, 440) if fast else (1100, 700))
        self.turbo = turbo
        self.src, self.out = src or _build.DEFAULT_SRC, out or _build.DEFAULT_OUT
        self.errs, self.pages = [], []

    def __enter__(self):
        self.info = _build.build(self.src, self.out, quiet=True)
        self.port = _free_port()
        self.srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(self.port), '--bind', '127.0.0.1', '--directory', self.out],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):                                   # the server answers before the first page asks
            try:
                socket.create_connection(('127.0.0.1', self.port), timeout=0.2).close(); break
            except OSError:
                time.sleep(0.1)
        self.pw = sync_playwright().start()
        kw = {'args': ARGS}
        if os.path.exists(CHROME):
            kw['executable_path'] = CHROME
        self.browser = self.pw.chromium.launch(**kw)
        self.ctx = self.browser.new_context(viewport={'width': self.size[0], 'height': self.size[1]}, device_scale_factor=self.scale)
        if self.fast:
            self.ctx.add_init_script("window.__noRender = true; window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), %d);" % (0 if self.turbo else 16))
        return self

    def __exit__(self, *exc):
        for f in (lambda: self.browser.close(), lambda: self.pw.stop(), lambda: self.srv.terminate()):
            try:
                f()
            except Exception:
                pass
        return False

    # ---- pages ----
    def _open(self, name, query=''):
        p = self.ctx.new_page(); self.pages.append(p)
        p.on('pageerror', lambda e: self.errs.append(f'{name}: {e}'))
        p.goto(f'http://127.0.0.1:{self.port}/index.html{query}', wait_until='commit')      # not DOMContentLoaded: the game is up in ~2 s, the event comes ~15 s later
        p.wait_for_function('!!window.__dbg', timeout=90000)
        bad = p.evaluate('__dbg.__check()')
        if bad:
            raise RuntimeError('names.txt lists names the game no longer has: ' + ', '.join(bad))
        if self.fast:
            p.evaluate("() => { __hx.noRender = true; __hx.cap = 0.1; }")
        if self.turbo:
            p.evaluate("n => { __hx.sub = n; __hx.fixed = 1 / 30; }", self.turbo)      # game time runs as fast as the machine can step it, 1/30 s a step
        return p

    def _ride(self, p, ride, god):
        p.click(f'#rides button[data-ride={ride}]')
        wait(p, "d.car && d.car.alive && d.ride === %r" % ride, 20)
        if god:
            godmode(p)

    def solo(self, ride='buggy', god=True, name='solo'):
        p = self._open(name); self._ride(p, ride, god); return p

    def host(self, ride='buggy', god=True, name='Host', q=''):
        p = self._open(name, '?p2p' + q); p.fill('#nick', name); p.click('#hostBtn'); p.wait_for_timeout(400)
        self._ride(p, ride, god); return p

    def join(self, ride='unicorn', god=True, name='Friend', q=''):
        p = self._open(name, '?p2p' + q); p.fill('#nick', name)
        p.wait_for_selector('#mpList button:not([disabled])', timeout=20000); p.click('#mpList button:not([disabled])'); p.wait_for_timeout(400)
        self._ride(p, ride, god); return p

    def lobby(self, host_ride='buggy', friend_ride='unicorn', god=True):
        """Host plus one friend. The warm-up is held until the friend is in, then released on both."""
        a = self.host(host_ride, god); ev(a, "d.PH.brk = 999")
        b = self.join(friend_ride, god)
        wait(a, "d.NET.remotes.size === 1", 20); wait(b, "d.NET.client && d.NET.remotes.size === 1", 20)
        for p in (a, b):
            ev(p, "d.PH.brk = 0")
        a.wait_for_timeout(1500)
        return a, b


# ---- page helpers ----
def ev(p, body, arg=None):
    """Run a JS function body in the page. `d` is window.__dbg, `a` is the argument."""
    return p.evaluate("(a) => { const d = window.__dbg; " + body + " }", arg)


def wait(p, cond, timeout=20, every=0.25):
    """Poll a JS expression (d = window.__dbg) until it is truthy; raise with its text on timeout."""
    end = time.time() + timeout
    while True:
        v = p.evaluate("() => { const d = window.__dbg; try { return (" + cond + "); } catch (e) { return false; } }")
        if v:
            return v
        if time.time() > end:
            raise TimeoutError(f'timed out after {timeout}s waiting for: {cond}')
        p.wait_for_timeout(int(every * 1000))


def godmode(p):
    ev(p, "d.car.maxHp = 1e6; d.car.hp = 1e6;")


def freeze(p):
    p.evaluate("__hx.freeze()")


def thaw(p):
    p.evaluate("__hx.thaw()")


def step(p, n=1, dt=0.05, timeout=120):
    """Advance a frozen game by n frames of dt seconds each and return once they have been played."""
    p.evaluate("([n, dt]) => __hx.step(n, dt)", [n, dt])
    end = time.time() + timeout
    while p.evaluate("__hx.queue") > 0:
        if time.time() > end:
            raise TimeoutError('step(): frames did not play; is the page running?')
        p.wait_for_timeout(30)
    p.wait_for_timeout(60)                                     # let the last frame reach the screen


def canvas_png(p, path=None):
    """The game picture without HUD: render once through the game's post-processing and read the canvas back."""
    url = ev(p, "if (d.composer) d.composer.render(); else d.renderer.render(d.scene, d.camera); return d.renderer.domElement.toDataURL('image/png');")
    data = base64.b64decode(url.split(',', 1)[1])
    if path:
        open(path, 'wb').write(data)
    return data


def sheet(images, path, cols=None, labels=None, pad=6, bg=(24, 20, 28)):
    """Lay pictures (paths, bytes or PIL images) out on one sheet. One sheet costs one look instead of many."""
    from PIL import Image, ImageDraw
    ims = [i if isinstance(i, Image.Image) else Image.open(io.BytesIO(i) if isinstance(i, (bytes, bytearray)) else i).convert('RGB') for i in images]
    cols = cols or len(ims); rows = -(-len(ims) // cols)
    cw, ch = max(i.width for i in ims), max(i.height for i in ims)
    lab = 16 if labels else 0
    out = Image.new('RGB', (cols * cw + (cols + 1) * pad, rows * (ch + lab) + (rows + 1) * pad), bg)
    dr = ImageDraw.Draw(out)
    for n, im in enumerate(ims):
        x, y = pad + (n % cols) * (cw + pad), pad + (n // cols) * (ch + lab + pad)
        out.paste(im, (x + (cw - im.width) // 2, y + lab + (ch - im.height) // 2))
        if labels and n < len(labels):
            dr.text((x + 2, y + 2), str(labels[n]), fill=(255, 240, 200))
    out.save(path)
    return path


# ---- checks for tests ----
class Checks:
    """Named pass/fail checks. A test ends with done(g): page errors count as a failure, the exit code says pass or fail."""

    def __init__(self, name):
        self.name, self.failed, self.n = name, [], 0

    def ok(self, what, cond, got=None):
        self.n += 1
        if cond:
            print(f'  ok    {what}' + (f'  [{got}]' if got is not None else ''))
        else:
            self.failed.append(what); print(f'  FAIL  {what}' + (f'  [got {got}]' if got is not None else ''))
        return bool(cond)

    def eq(self, what, got, want):
        return self.ok(f'{what} = {want!r}', got == want, got if got != want else None)

    def done(self, g=None):
        if g is not None:
            self.ok('no page errors', not g.errs, '; '.join(g.errs[:3]) or None)
        print(f"{'PASS' if not self.failed else 'FAIL'}  {self.name}: {self.n - len(self.failed)}/{self.n}")
        sys.exit(1 if self.failed else 0)
