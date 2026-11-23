export const selfId = Math.random().toString(36).slice(2, 10);
export function joinRoom(cfg, name) {
  const bc = new BroadcastChannel(cfg.appId + name), known = new Map(), room = { onPeerJoin: null, onPeerLeave: null }, acts = {};
  bc.onmessage = e => { const d = e.data; if (d.from === selfId) return;
    if (d.k === 'hi') { if (!known.has(d.from)) { known.set(d.from, Date.now()); room.onPeerJoin && room.onPeerJoin(d.from); } else known.set(d.from, Date.now()); }
    else if (d.k === 'act' && (!d.to || d.to === selfId)) { const a = acts[d.n]; a && a.onMessage && a.onMessage(d.data, { peerId: d.from }); } };
  setInterval(() => { bc.postMessage({ k: 'hi', from: selfId }); for (const [id, t] of known) if (Date.now() - t > 2500) { known.delete(id); room.onPeerLeave && room.onPeerLeave(id); } }, 300);
  room.makeAction = n => (acts[n] = { onMessage: null, send(data, o) { bc.postMessage({ k: 'act', n, data, from: selfId, to: o && o.target }); return Promise.resolve(); } });
  return room;
}
