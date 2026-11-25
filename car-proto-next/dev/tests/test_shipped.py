"""The page players get: car-proto-next/index.html exactly as built and committed, no test hooks, served with its folder.
It boots without errors, shows its build number from src/index.html, carries no test code, and a solo buggy starts from the lobby (ADR-0008)."""
import os, re, socket, subprocess, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from playwright.sync_api import sync_playwright
from harness.game import ARGS, CHROME, Checks
from harness.build import PROJECT

t = Checks('shipped page')
page_file = os.path.join(PROJECT, 'index.html')
html = open(page_file, encoding='utf8').read()
want = int(re.search(r'<meta name="chubz-build" content="(\d+)"', open(os.path.join(PROJECT, 'src', 'index.html'), encoding='utf8').read()).group(1))
t.eq('the committed page carries the build number of src/index.html', int(re.search(r'<meta name="chubz-build" content="(\d+)"', html).group(1)), want)
t.ok('no test hooks in the shipped page', not any(k in html for k in ('window.__dbg', 'window.__hx = {', 'BroadcastChannel(\'room\')')))
t.ok('no CDN: three.js is inside the page', 'cdnjs.cloudflare.com' not in html and 'cdn.jsdelivr.net' not in html)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', PROJECT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
errs = []
try:
    time.sleep(0.5)
    with sync_playwright() as pw:
        kw = {'args': ARGS}
        if os.path.exists(CHROME):
            kw['executable_path'] = CHROME
        b = pw.chromium.launch(**kw)
        p = b.new_page(viewport={'width': 700, 'height': 440})
        p.on('pageerror', lambda e: errs.append(str(e)))
        p.goto(f'http://127.0.0.1:{port}/index.html', wait_until='commit')
        p.wait_for_function("document.getElementById('build') && /build \\d+/.test(document.getElementById('build').textContent)", timeout=90000)
        t.eq('the corner shows the build', p.evaluate("document.getElementById('build').textContent.trim()"), f'build {want}')
        t.ok('a WebGL canvas is on the page', p.evaluate("!!document.querySelector('canvas')"))
        p.wait_for_selector('#rides button[data-ride=buggy]', state='attached', timeout=90000)
        p.wait_for_timeout(1500)
        t.ok('the lobby offers the four rides', p.evaluate("document.querySelectorAll('#rides button[data-ride]').length") == 4)
        p.click('#soloBtn'); p.wait_for_timeout(300); p.click('#rides button[data-ride=buggy]')
        p.wait_for_function("!document.getElementById('start')", timeout=20000); p.wait_for_timeout(3000)
        t.ok('solo, buggy: the comic goes away and the game runs for 3 s', p.evaluate("!document.getElementById('start')"))
        b.close()
finally:
    srv.terminate()
t.ok('no page errors', not errs, '; '.join(errs[:3]) or None)
t.done()
