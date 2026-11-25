// Unit tests for the sound synthesis (ADR-0008: pure modules get Vitest tests). Every recipe must render a finite,
// non-silent buffer, the same one every time (the worker and the main thread must agree), and survive being sent to a worker as text.
import { describe, expect, it } from 'vitest';
import { audioLib } from './synth.ts';

const SR = 22050;
const L = audioLib(SR);
const names = Object.keys(L.R);

describe('audioLib', () => {
  it('has recipes', () => { expect(names.length).toBeGreaterThan(20); });

  it.each(names)('%s renders a finite, audible buffer', name => {
    const b = L.synth(name, 0);
    expect(b).toBeInstanceOf(Float32Array);
    expect(b.length).toBeGreaterThan(0);
    let peak = 0;
    for (const x of b) { expect(Number.isFinite(x)).toBe(true); peak = Math.max(peak, Math.abs(x)); }
    expect(peak).toBeGreaterThan(1e-4);
  });

  it('renders the same buffer twice', () => {
    for (const name of names.slice(0, 8)) expect(Array.from(L.synth(name, 1))).toEqual(Array.from(audioLib(SR).synth(name, 1)));
  });

  it('works when rebuilt from its source text, as the worker does', () => {
    const fromText = new Function(`return (${audioLib.toString()})(${SR});`)();
    expect(Array.from(fromText.synth(names[0], 0))).toEqual(Array.from(L.synth(names[0], 0)));
  });
});
