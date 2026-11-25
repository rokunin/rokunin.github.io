// Test-only stand-in for Claude's room API: tabs of one browser find each other over a BroadcastChannel.
// ?mock = artifact-style room, ?p2p = the Trystero path (served by trystero_shim.js), no query = solo, lobby skipped.
if (!location.search.includes('mock') && !location.search.includes('p2p')) window.__skipLobby = true;
if (location.search.includes('mock')) (() => {
  const me = Math.random().toString(36).slice(2, 10), bc = new BroadcastChannel('room'), st = new Map(), hs = [];
  let mine = {};
  const snap = () => [{ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() },
    ...[...st].map(([peer, v]) => ({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.p, updatedAt: v.t }))];
  const fire = () => hs.forEach(h => h({ peers: snap(), joined: [], left: [], updated: [] }));
  bc.onmessage = e => { if (e.data.peer !== me) { st.set(e.data.peer, { p: e.data.p, t: Date.now() }); fire(); } };
  setInterval(() => { bc.postMessage({ peer: me, p: mine }); for (const [k, v] of st) if (Date.now() - v.t > 2500) { st.delete(k); fire(); } }, 300);
  const room = { peers: snap, onPeers(h) { hs.push(h); setTimeout(fire, 0); return () => {}; }, presence(p) { mine = { ...mine, ...p }; bc.postMessage({ peer: me, p: mine }); return Promise.resolve(); }, connected: () => true };
  window.claude = { use: async n => n === 'room' ? room : null };
})();
