// The lobby's network outside Claude: WebRTC through Trystero, with a bridge for players who cannot link directly.
const lib = './trystero.js';      // a file next to the page, outside the bundle (the harness serves a stand-in under the same name)

// Outside Claude (GitHub Pages and the like): browsers connect to each other directly over WebRTC; they find one another through
// public relays (Trystero, bundled next to the page as trystero.js). The object mimics the small part of Claude's room API used here.
// Two players whose browsers cannot open a direct link (strict NAT, no TURN) still play together if a third sees both: every peer
// lists its direct links in its presence (_nb), and traffic to a peer I cannot reach goes through the lowest-id peer that reaches us both.
export async function p2pRoom({ logError, load = (): Promise<any> => import(/* @vite-ignore */ lib) }) {
  const T = await load();
  const room = T.joinRoom({ appId: /\/car-proto-next\//.test(location.pathname) ? 'car-proto-next-v1' : 'car-proto-rokunin-v1' }, 'lobby');      // the version in the works lives at /car-proto-next/ and never meets the published one
  const st = new Map(), far = new Map(), hs = [], pres = room.makeAction('pres'), ev = room.makeAction('ev');      // st: direct peers; far: { p, t } reached through a bridge
  let mine = {}, snap = null, evH = null;
  const fire = () => { snap = null; for (const h of hs) h(); };
  const quiet = p => { if (p && p.catch) p.catch(() => {}); };
  const full = () => ({ ...mine, _nb: [...st.keys()] });
  const via = x => { for (const id of [...st.keys()].sort()) { const n = st.get(id)._nb; if (Array.isArray(n) && n.includes(x)) return id; } return null; };
  const farIds = () => { const a = new Set(); for (const p of st.values()) if (Array.isArray(p._nb)) for (const x of p._nb.slice(0, 16)) if (typeof x === 'string' && x !== T.selfId && !st.has(x)) a.add(x); return [...a]; };
  const send = (target?) => { try { const P = full();
    if (target && !st.has(target)) { const b = via(target); if (b) quiet(ev.send({ _r: target, _p: P }, { target: b })); return; }
    quiet(pres.send(P, target ? { target } : undefined));
    if (!target) for (const x of farIds()) { const b = via(x); if (b) quiet(ev.send({ _r: x, _p: P }, { target: b })); } } catch (e) { logError('presence send: ' + e.message); } };
  pres.onMessage = (data, meta) => { if (data && typeof data === 'object' && meta && meta.peerId) { const was = String((st.get(meta.peerId) || {})._nb); st.set(meta.peerId, data); far.delete(meta.peerId); if (String(data._nb) !== was) send(); fire(); } };
  room.onPeerJoin = id => { st.set(id, {}); far.delete(id); send(); fire(); };
  room.onPeerLeave = id => { st.delete(id); send(); fire(); };
  ev.onMessage = (data, meta) => {
    if (!data || typeof data !== 'object' || !meta || !meta.peerId) return;
    if (typeof data._r === 'string') { if (st.has(data._r)) quiet(ev.send({ _f: meta.peerId, _d: data._d, _p: data._p }, { target: data._r })); return; }      // I am the bridge: pass it on
    if (typeof data._f === 'string') { if (st.has(data._f)) return;                                                                                                 // it came through a bridge
      if (data._p && typeof data._p === 'object') { far.set(data._f, { p: data._p, t: performance.now() }); snap = null; fire(); }
      if (evH && data._d && typeof data._d === 'object') evH(data._d, data._f); return; }
    if (evH) evH(data, meta.peerId);
  };
  setInterval(() => { let ch = false; for (const [x, F] of far) if (st.has(x) || !via(x) || performance.now() - F.t > 4000) { far.delete(x); ch = true; } if (ch) fire(); }, 1000);
  return {
    sendEv(d, to) { try {
      if (to && !st.has(to)) { const b = via(to); if (b) quiet(ev.send({ _r: to, _d: d }, { target: b })); return; }
      quiet(ev.send(d, to ? { target: to } : undefined));
      if (!to) for (const x of farIds()) { const b = via(x); if (b) quiet(ev.send({ _r: x, _d: d }, { target: b })); } } catch (e) { logError('event send: ' + e.message); } },
    onEv(h) { evH = h; },
    peers() { return snap || (snap = [{ peer: T.selfId, isMe: true, sameTab: true, kind: 'viewer', presence: mine },
      ...[...st].map(([peer, presence]) => ({ peer, isMe: false, sameTab: false, kind: 'viewer', presence })),
      ...[...far].map(([peer, F]) => ({ peer, isMe: false, sameTab: false, kind: 'viewer', presence: F.p, bridged: true }))]); },
    onPeers(h) { hs.push(h); return () => {}; },
    presence(p) { mine = { ...mine, ...p }; snap = null; send(); return Promise.resolve(); },
  };
}
