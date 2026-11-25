// The WebRTC room's bridge: three players, the first and the third cannot link directly; the middle one carries
// their presence and their events. A fake Trystero stands in for the network: an in-memory hub with one cut link.
import { describe, expect, it } from 'vitest';
import { p2pRoom } from './p2p-room.ts';

(globalThis as any).location = { pathname: '/car-proto-next/' };
const tick = () => new Promise(r => setTimeout(r, 0));

function hub(cut: [string, string][]) {
  const peers = new Map<string, any>();
  const linked = (a: string, b: string) => a !== b && !cut.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return (id: string) => async () => ({
    selfId: id,
    joinRoom() {
      const room: any = { onPeerJoin: null, onPeerLeave: null, acts: new Map() };
      room.makeAction = (n: string) => {
        const act: any = { onMessage: null };
        act.send = (data: any, o?: { target?: string }) => {
          for (const [pid, p] of peers) if (linked(id, pid) && (!o || !o.target || o.target === pid)) {
            const other = p.acts.get(n); if (other && other.onMessage) setTimeout(() => other.onMessage(structuredClone(data), { peerId: id }), 0);
          }
          return Promise.resolve();
        };
        room.acts.set(n, act); return act;
      };
      setTimeout(() => {                                    // announce both ways, once the room's handlers are set
        for (const [pid, p] of peers) if (linked(id, pid)) { p.onPeerJoin && p.onPeerJoin(id); room.onPeerJoin && room.onPeerJoin(pid); }
        peers.set(id, room);
      }, 0);
      return room;
    },
  });
}

describe('p2pRoom', () => {
  it('reaches a player behind a cut link through the one who sees both', async () => {
    const lib = hub([['a', 'c']]), errs: string[] = [], logError = (e: string) => errs.push(e);
    const A = await p2pRoom({ logError, load: lib('a') }); await tick();
    const B = await p2pRoom({ logError, load: lib('b') }); await tick();
    const C = await p2pRoom({ logError, load: lib('c') }); await tick();
    for (const [r, nick] of [[A, 'Ann'], [B, 'Bob'], [C, 'Cid']] as const) await r.presence({ nick });
    for (let i = 0; i < 10; i++) await tick();
    for (const r of [A, B, C]) await r.presence({});            // second round: everybody's link list (_nb) is known now
    for (let i = 0; i < 10; i++) await tick();

    const seenByA = A.peers().filter(p => !p.isMe);
    expect(seenByA.map(p => [p.peer, p.presence.nick, !!p.bridged]).sort()).toEqual([['b', 'Bob', false], ['c', 'Cid', true]]);

    const got: [any, string][] = []; C.onEv((d, from) => got.push([d, from]));
    A.sendEv({ t: 'hello', n: 1 }, 'c');
    for (let i = 0; i < 10; i++) await tick();
    expect(got).toEqual([[{ t: 'hello', n: 1 }, 'a']]);
    expect(errs).toEqual([]);
  });
});
