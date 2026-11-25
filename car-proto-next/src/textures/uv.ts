// Tiling baked textures through geometry UVs (render-target textures cannot be cloned, so .repeat is out).

// Never set .repeat on baked textures (render-target textures can't be cloned): tile through geometry UVs instead.
export function scaleUV(geo, sx, sy = sx) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); uv.needsUpdate = true; return geo; }

// box-projected world UVs: each face picks the axis pair it faces; 'off' moves local coords into world space
export function worldUV(geo, tile, off = { x: 0, y: 0, z: 0 }) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + off.x, y = p.getY(i) + off.y, z = p.getZ(i) + off.z;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile);
    else if (ax >= az) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true; return geo;
}
