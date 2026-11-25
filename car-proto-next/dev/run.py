#!/usr/bin/env python3
"""Run the tests and print one line per test.   python3 run.py [-k part-of-name[,another]] [-v]

Exit code 0 only if every test passed. -v prints each test's own output, otherwise it is shown for failures only.
"""
import argparse, glob, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('-k', default='', help='run only tests whose file name contains this; several, comma-separated: -k shipped,world')
ap.add_argument('-v', action='store_true')
a = ap.parse_args()

keys = a.k.split(',')
tests = [f for f in sorted(glob.glob(os.path.join(HERE, 'tests', 'test_*.py'))) if any(k in os.path.basename(f) for k in keys)]
if not tests:
    sys.exit('no tests match')
bad, t_all = [], time.time()
for f in tests:
    name, t0 = os.path.basename(f)[5:-3], time.time()
    try:
        r = subprocess.run([sys.executable, f], capture_output=True, text=True, timeout=600)
        code, out = r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired as e:
        code, out = 124, (e.stdout or '') + '\n(timed out after 600 s)'
    print(f"{'PASS' if code == 0 else 'FAIL'}  {name:<22} {time.time() - t0:5.0f} s", flush=True)
    if code != 0:
        bad.append(name)
    if a.v or code != 0:
        print('\n'.join('      ' + l for l in out.strip().split('\n')), flush=True)
print(f"\n{len(tests) - len(bad)}/{len(tests)} passed in {time.time() - t_all:.0f} s" + (f"; failed: {', '.join(bad)}" if bad else ''))
sys.exit(1 if bad else 0)
