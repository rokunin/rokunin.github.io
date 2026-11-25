"""Offline twin of the game's adaptive player: same tiers, same bar grid, same cut and fade rules. Renders a preview for a scripted run."""
import numpy as np, scipy.io.wavfile as w, json, sys
sr, x = w.read('/tmp/theme/dec.wav'); x = x.astype(np.float32) / 32768
G = json.load(open('/tmp/theme/grid.json'))['grid']            # G[k] = start of bar k, seconds
TIERS = [dict(a=0, b=7, loop=0, calm=True), dict(a=7, b=23, loop=7), dict(a=15, b=39, loop=15), dict(a=39, b=59, loop=39), dict(a=60, b=76, loop=64)]
G0 = [0.10] + G[1:]                                             # the calm tier starts just after the fade-in
def bar_t(k): return G0[k] if k == 0 else G[k]
PRE, FIN, FOUT, SOFT, DWELL = 0.02, 0.015, 0.04, 0.35, 10.0
def render(script, total):
    out = np.zeros((int(total * sr) + sr, 2), np.float32); log = []
    want_at = lambda t: [lv for (t0, lv) in script if t >= t0][-1]
    T = want_at(0); k = TIERS[T]['a']; t = 0.0; since = 0.0; seg_start = 0.0; seg_bar = k; joins = []; soft_in = True
    def put(start_wall, bar_from, bar_to, fade_in, fade_out_at, fade_out):       # one source: plays from bar_from until told to stop
        a = int((bar_t(bar_from) - PRE) * sr); n = int((fade_out_at + fade_out - start_wall + PRE) * sr); seg = x[a:a + n].copy(); n = len(seg)
        env = np.ones(n, np.float32); fi = int(fade_in * sr); env[:fi] = np.linspace(0, 1, fi)
        fo0 = int((fade_out_at - start_wall + PRE) * sr); fo = n - fo0
        if fo > 0: env[fo0:] *= np.linspace(1, 0, fo)
        o = int((start_wall - PRE) * sr); o2 = max(0, o); seg = seg[o2 - o:]; env = env[o2 - o:]; n2 = min(len(seg), len(out) - o2); out[o2:o2 + n2] += seg[:n2] * env[:n2, None]
    while t < total:
        nxt = t + (bar_t(k + 1) - bar_t(k)); want = want_at(nxt); tier = TIERS[T]; jump = None
        if want != T and (want > T or (nxt - since >= DWELL)):
            if TIERS[want]['a'] <= k + 1 < TIERS[want]['b'] and not TIERS[want].get('calm') and not tier.get('calm'): T = want; since = nxt; log.append((nxt, 'adopt tier %d at bar %d' % (want, k + 1)))
            else: jump = (want, TIERS[want]['a'])
        if jump is None and k + 1 >= TIERS[T]['b']: jump = (T, TIERS[T]['loop'])
        if jump:
            soft = TIERS[jump[0]].get('calm') or tier.get('calm'); fo = SOFT if soft else FOUT
            put(seg_start, seg_bar, k + 1, SOFT if soft_in else FIN, nxt - (0.03 if not soft else 0.02), fo); soft_in = bool(TIERS[jump[0]].get('calm'))
            joins.append(nxt); log.append((nxt, 'bar %d -> tier %d bar %d%s' % (k + 1, jump[0], jump[1], ' (loop)' if jump[0] == T else '')))
            if jump[0] != T: since = nxt
            T, k = jump; seg_start = nxt; seg_bar = k
        else: k += 1
        t = nxt
    put(seg_start, seg_bar, k, SOFT if soft_in else FIN, t, 1.5)
    return out[:int(total * sr)], log, joins
if __name__ == '__main__':
    script = [(0, 0), (13, 1), (40, 2), (72, 3), (98, 4), (142, 2), (166, 0)]
    out, log, joins = render(script, 186)
    for t, s in log: print('%6.1f  %s' % (t, s))
    pk = np.abs(out).max(); print('peak %.3f' % pk)
    # click check at every join: the largest sample-to-sample jump in the 60 ms around it against the track's own typical maximum
    d = np.abs(np.diff(out.mean(1))); base = np.percentile([d[i:i + 2646].max() for i in range(0, len(d) - 2646, 2646)], 95)
    print('typical max step (95th pct) %.4f; at joins:' % base, ' '.join('%.4f' % d[int((j - 0.04) * sr):int((j + 0.02) * sr)].max() for j in joins if j < 185))
    w.write('/tmp/theme/preview.wav', sr, (np.clip(out, -1, 1) * 32767).astype(np.int16)); json.dump({'log': log, 'joins': joins, 'script': script}, open('/tmp/theme/preview.json', 'w'))
