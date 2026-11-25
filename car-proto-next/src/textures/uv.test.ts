// UV helpers: tiling a baked texture through the geometry instead of .repeat.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { scaleUV, worldUV } from './uv.ts';

describe('scaleUV', () => {
  it('multiplies every UV, by one factor or two', () => {
    const g = scaleUV(new THREE.PlaneGeometry(2, 2), 4, 2), uv = g.attributes.uv;
    const xs = Array.from({ length: uv.count }, (_, i) => [uv.getX(i), uv.getY(i)]);
    expect(xs).toEqual([[0, 2], [4, 2], [0, 0], [4, 0]]);
  });
});

describe('worldUV', () => {
  it('gives the top of a box world x/z over the tile, so neighbouring boxes line up', () => {
    const tile = 4, g = worldUV(new THREE.BoxGeometry(2, 2, 2), tile, { x: 10, y: 0, z: -6 });
    const n = g.attributes.normal, uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) if (n.getY(i) > 0.9) {
      expect(uv.getX(i)).toBeCloseTo((p.getX(i) + 10) / tile);
      expect(uv.getY(i)).toBeCloseTo((p.getZ(i) - 6) / tile);
    }
  });
});
