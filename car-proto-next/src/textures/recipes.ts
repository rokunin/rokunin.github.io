// The GLSL recipe of every baked material: surf(uv) -> albedo, roughness, an extra channel and a height (see bake.ts).
// Strings only: no THREE, no DOM.

export const GLSL_LIB = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTexel, uNS;
  #define sat(x) clamp(x, 0.0, 1.0)
  vec3 L(float r, float g, float b) { return pow(vec3(r, g, b), vec3(2.2)); }      // colours authored in sRGB
  vec2 h22(vec2 p) { vec3 a = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973)); a += dot(a, a.yzx + 33.33); return fract((a.xx + a.yz) * a.zy); }
  float h21(vec2 p) { return h22(p + 0.37).x; }
  // tileable gradient noise, period 'per' lattice cells
  float gn(vec2 p, vec2 per, float s) {
    vec2 i = floor(p), f = p - i, u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 o = vec2(s * 7.31, s * 3.17);
    float a = dot(h22(mod(i, per) + o) * 2.0 - 1.0, f);
    float b = dot(h22(mod(i + vec2(1.0, 0.0), per) + o) * 2.0 - 1.0, f - vec2(1.0, 0.0));
    float c = dot(h22(mod(i + vec2(0.0, 1.0), per) + o) * 2.0 - 1.0, f - vec2(0.0, 1.0));
    float d = dot(h22(mod(i + vec2(1.0, 1.0), per) + o) * 2.0 - 1.0, f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // fractal noise, ~0..1 around 0.5; uv in tile space, f = base frequency (integer keeps it tileable)
  float fbm(vec2 uv, vec2 f, int oct, float s) {
    float a = 0.5, v = 0.0, t = 0.0;
    for (int i = 0; i < 7; i++) { if (i >= oct) break; v += a * gn(uv * f, f, s + float(i) * 3.1); t += a; a *= 0.5; f *= 2.0; }
    return sat(v / t * 1.7 + 0.5);
  }
  // tileable voronoi: x = F1, y = F2, z = cell random
  vec3 vor(vec2 p, vec2 per, float s) {
    vec2 i = floor(p), f = p - i; float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)), c = mod(i + o, per), r = h22(c + s * 5.3), d = o + r - f; float dd = dot(d, d);
      if (dd < d1) { d2 = d1; d1 = dd; id = h21(c + s * 9.1); } else if (dd < d2) d2 = dd;
    }
    return vec3(sqrt(d1), sqrt(d2), id);
  }
  float box2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }   // signed box distance
`;
export const GLSL_MAIN = `
  void main() {
    vec3 alb; float rough, extra, h;
  #if CH == 2
    float h0, h1, h2;
    surf(vUv, alb, rough, extra, h0);
    surf(fract(vUv + vec2(uTexel, 0.0)), alb, rough, extra, h1);
    surf(fract(vUv + vec2(0.0, uTexel)), alb, rough, extra, h2);
    gl_FragColor = vec4(normalize(vec3((h0 - h1) * uNS, (h0 - h2) * uNS, 1.0)) * 0.5 + 0.5, 1.0);
  #else
    surf(vUv, alb, rough, extra, h);
    #if CH == 0
      vec3 e = pow(sat(alb), vec3(1.0 / 2.2));      // the stored colour; the sRGB target encodes on write (r137+), so hand it the linear value that decodes back to e
      gl_FragColor = vec4(mix(e / 12.92, pow((e + 0.055) / 1.055, vec3(2.4)), step(0.04045, e)), 1.0);
    #else
      gl_FragColor = vec4(1.0, sat(rough), sat(extra), 1.0);
    #endif
  #endif
  }`;

export const RECIPES = {
  // worn concrete slabs: 4 x 4 per tile, tar joints, cracks, aggregate. extra = wetness field for puddles
  ground: `
  void surf(vec2 uv, out vec3 alb, out float rough, out float extra, out float h) {
    vec2 g = uv * 4.0, cell = floor(g), f = g - cell;
    float sid = h21(mod(cell, 4.0) + 0.5), e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    e += (fbm(uv, vec2(24.0), 3, 4.0) - 0.5) * 0.025;
    float joint = smoothstep(0.012, 0.024, e), bevel = smoothstep(0.0, 0.07, e);
    float big = fbm(uv, vec2(3.0), 5, 1.0), mid = fbm(uv, vec2(12.0), 4, 2.0), fine = fbm(uv, vec2(96.0), 3, 3.0);
    vec3 ag = vor(uv * 150.0, vec2(150.0), 6.0); float peb = smoothstep(0.34, 0.14, ag.x) * step(0.6, ag.z);
    vec3 c = mix(L(0.24, 0.245, 0.25), L(0.31, 0.3, 0.285), sid) * (0.8 + 0.34 * big + 0.16 * (mid - 0.5));
    c *= mix(vec3(1.05, 1.0, 0.94), vec3(0.94, 1.0, 1.06), fbm(uv, vec2(2.0), 3, 9.0));
    c = mix(c, c * 1.35, peb * 0.6);
    vec3 cv = vor(uv * 7.0 + (vec2(fbm(uv, vec2(9.0), 3, 5.0), fbm(uv, vec2(9.0), 3, 6.0)) - 0.5) * 0.5, vec2(7.0), 11.0);
    float crack = (1.0 - smoothstep(0.0, 0.03, cv.y - cv.x)) * step(0.5, h21(mod(cell, 4.0) + 3.7)) * smoothstep(0.42, 0.58, fbm(uv, vec2(5.0), 3, 12.0));
    float oil = smoothstep(0.64, 0.74, fbm(uv, vec2(4.0), 4, 21.0));
    float grime = (1.0 - smoothstep(0.02, 0.09, e)) * (0.5 + mid);
    c = mix(c, c * 0.62, oil * 0.7);
    c = mix(c, L(0.27, 0.235, 0.19), sat(grime * 0.45));
    c = mix(c, L(0.1, 0.095, 0.09), crack * 0.85);
    c = mix(c, L(0.06, 0.06, 0.065), 1.0 - joint);
    alb = c;
    rough = 0.9 - 0.12 * (mid - 0.5) - oil * 0.3 - (1.0 - joint) * 0.25;
    extra = fbm(uv, vec2(6.0), 4, 50.0);
    h = (0.6 + (fine - 0.5) * 0.12 + (mid - 0.5) * 0.1 + peb * 0.1) * (0.55 + 0.45 * bevel);
    h = mix(0.1, h, joint) - crack * 0.3;
  }`,

  // shipping crate: frame boards, four planks with grooves, a diagonal brace, nails, worn edges, grime at the bottom
  crate: `
  float board(vec2 p, float along, float across, float id, out vec3 col) {
    float grain = fbm(vec2(p.x * 1.0 + id * 0.37, p.y * 9.0), vec2(2.0, 18.0), 4, 31.0 + id);
    float rings = sin((p.y * 40.0 + grain * 8.0 + id * 5.0)) * 0.5 + 0.5;
    float tone = 0.82 + 0.28 * h21(vec2(id, 1.7));
    col = mix(L(0.8, 0.47, 0.21), L(0.62, 0.33, 0.13), rings * 0.55 + grain * 0.35) * tone;
    return grain;
  }
  void surf(vec2 uv, out vec3 alb, out float rough, out float extra, out float h) {
    vec3 c; float FW = 0.115;
    float dEdge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    // planks (horizontal), 4 rows
    float py = uv.y * 4.0, pid = floor(py), pf = py - pid;
    float gr = board(vec2(uv.x, uv.y * 4.0), 1.0, 0.25, pid, c);
    float groove = smoothstep(0.0, 0.05, pf) * smoothstep(1.0, 0.95, pf);
    h = 0.45 * groove + 0.04 * gr; float edge = 1.0 - groove;
    // diagonal brace (inside the frame)
    float bd = abs(uv.x - uv.y) * 0.7071, braceW = 0.085;
    if (bd < braceW && dEdge > FW - 0.01) {
      vec2 bp = vec2((uv.x + uv.y) * 0.7071, (uv.x - uv.y) * 0.7071 / braceW);
      board(vec2(bp.x, bp.y * 0.25), 1.0, 0.25, 9.0, c);
      float be = smoothstep(braceW, braceW - 0.012, bd);
      h = 0.7 * be + 0.45 * (1.0 - be); edge = 1.0 - be;
    }
    // frame: top / bottom boards run horizontally, sides vertically
    if (dEdge < FW) {
      bool side = min(uv.x, 1.0 - uv.x) < min(uv.y, 1.0 - uv.y);
      vec2 fp = side ? vec2(uv.y, uv.x * 4.0) : vec2(uv.x, uv.y * 4.0);
      board(fp, 1.0, 0.25, side ? (uv.x < 0.5 ? 20.0 : 21.0) : (uv.y < 0.5 ? 22.0 : 23.0), c);
      c *= 0.86;
      float fe = smoothstep(FW, FW - 0.015, dEdge) * smoothstep(0.0, 0.012, dEdge);
      h = 0.85 * fe + 0.5 * (1.0 - fe); edge = 1.0 - fe;
      // mitre seams at the corners
      float mit = abs(min(uv.x, 1.0 - uv.x) - min(uv.y, 1.0 - uv.y));
      h -= (1.0 - smoothstep(0.0, 0.006, mit)) * 0.3;
    }
    // nails on the frame
    vec2 np = uv; float nail = 0.0;
    for (int k = 0; k < 8; k++) {
      vec2 q = k < 4 ? vec2(k == 0 || k == 3 ? 0.058 : 0.942, k < 2 ? 0.058 : 0.942)
                     : vec2(k == 4 ? 0.5 : (k == 5 ? 0.5 : (k == 6 ? 0.058 : 0.942)), k == 4 ? 0.058 : (k == 5 ? 0.942 : 0.5));
      nail = max(nail, smoothstep(0.022, 0.014, length(np - q)));
    }
    // worn edges, grime toward the bottom, scuffs
    float wear = smoothstep(0.55, 0.75, edge + (fbm(uv, vec2(10.0), 4, 41.0) - 0.5) * 0.9);
    c = mix(c, c * 1.32 + L(0.08, 0.06, 0.04), wear * 0.55);
    float grime = smoothstep(0.55, 0.0, uv.y) * fbm(uv, vec2(5.0), 4, 43.0);
    c = mix(c, L(0.24, 0.17, 0.1), sat(grime * 0.75));
    float scuff = smoothstep(0.7, 0.8, fbm(uv, vec2(3.0, 14.0), 3, 47.0));
    c *= 1.0 - scuff * 0.18;
    c = mix(c, L(0.2, 0.2, 0.22), nail);
    alb = c;
    rough = 0.78 + grime * 0.15 - nail * 0.35 - wear * 0.1;
    extra = nail;
    h = h + nail * 0.25 - grime * 0.03;
  }`,

  // cast concrete: formwork panels, tie holes, rain streaks, pores
  concrete: `
  void surf(vec2 uv, out vec3 alb, out float rough, out float extra, out float h) {
    float big = fbm(uv, vec2(2.0), 5, 1.0), mid = fbm(uv, vec2(9.0), 4, 2.0), fine = fbm(uv, vec2(64.0), 3, 3.0);
    vec3 c = L(0.66, 0.66, 0.64) * (0.82 + 0.3 * big + 0.12 * (mid - 0.5));
    // formwork: 3 pours vertically, 2 boards across
    float vy = uv.y * 3.0, ly = abs(vy - floor(vy + 0.5)) / 3.0;
    float vx = uv.x * 2.0, lx = abs(vx - floor(vx + 0.5)) / 2.0;
    float pour = 1.0 - smoothstep(0.0, 0.006, ly), joint = 1.0 - smoothstep(0.0, 0.003, lx);
    float pid = floor(vy) + floor(vx) * 3.0;
    c *= 0.94 + 0.12 * h21(vec2(pid, 2.3));
    // tie holes
    vec2 tc = vec2(fract(uv.x * 2.0) - 0.5, fract(uv.y * 3.0) - 0.5) * vec2(0.5, 0.333);
    float hole = smoothstep(0.016, 0.011, length(tc));
    float ring = smoothstep(0.03, 0.016, length(tc)) - hole;
    // rain streaks from above
    float st = fbm(vec2(uv.x * 1.0, uv.y * 0.25), vec2(36.0, 1.0), 3, 7.0);
    float streak = smoothstep(0.55, 0.75, st) * (0.4 + 0.6 * fract(uv.y * 3.0));
    // pores
    vec3 pv = vor(uv * 90.0, vec2(90.0), 13.0); float pore = smoothstep(0.16, 0.06, pv.x) * step(0.7, pv.z);
    c = mix(c, c * 0.62, streak * 0.55);
    c = mix(c, L(0.2, 0.2, 0.21), max(pour * 0.7, joint * 0.4));
    c = mix(c, c * 0.8, ring * 0.6);
    c = mix(c, L(0.08, 0.08, 0.09), hole);
    c *= 1.0 - pore * 0.35;
    alb = c;
    rough = 0.88 + 0.08 * (fine - 0.5) - streak * 0.08;
    extra = 0.0;
    h = 0.6 + (fine - 0.5) * 0.12 + (mid - 0.5) * 0.08 - pour * 0.3 - joint * 0.12 - hole * 0.5 - ring * 0.08 - pore * 0.15;
  }`,

  // dressed stone blocks in running bond: 4 courses per tile, 2 blocks per course; chipped, grimy toward the ground
  blocks: `
  void surf(vec2 uv, out vec3 alb, out float rough, out float extra, out float h) {
    float row = floor(uv.y * 4.0);
    vec2 g = vec2(uv.x * 2.0 + mod(row, 2.0) * 0.5, uv.y * 4.0), cell = floor(g), f = g - cell;
    vec2 cid = mod(cell, vec2(2.0, 4.0));
    float bid = h21(cid + 0.71);
    vec2 p = (f - 0.5) * vec2(2.0, 1.0);                         // block local, aspect corrected
    float chipN = (fbm(uv, vec2(16.0), 4, 5.0) - 0.5) * 0.09;
    float d = box2(p, vec2(0.97, 0.47)) + chipN;               // < 0 inside the block
    float face = smoothstep(0.01, -0.04, d);                     // 1 on the stone face, 0 in the mortar
    float bev = smoothstep(0.0, -0.11, d);
    float big = fbm(uv, vec2(4.0), 5, 1.0 + bid), fine = fbm(uv, vec2(48.0), 3, 3.0);
    vec3 stone = mix(L(0.6, 0.58, 0.54), L(0.72, 0.7, 0.65), bid) * (0.84 + 0.3 * big + 0.1 * (fine - 0.5));
    vec3 cr = vor(uv * vec2(8.0, 16.0), vec2(8.0, 16.0), 21.0);
    float crack = (1.0 - smoothstep(0.0, 0.035, cr.y - cr.x)) * step(0.72, h21(cid + 4.2));
    vec3 c = mix(L(0.33, 0.31, 0.29), stone, face);
    c = mix(c, c * 0.55, crack * face);
    float grime = smoothstep(0.45, 0.0, uv.y) * (0.6 + 0.6 * fbm(uv, vec2(6.0), 4, 33.0));
    c = mix(c, L(0.3, 0.27, 0.22), sat(grime * 0.6));
    c = mix(c, c * 1.12, (1.0 - bev) * face * 0.5);             // light-catching arrises
    alb = c;
    rough = mix(0.95, 0.82 + 0.1 * (fine - 0.5), face);
    extra = 0.0;
    h = face * (0.45 + 0.35 * bev + (big - 0.5) * 0.12 + (fine - 0.5) * 0.06) - crack * 0.2 * face;
  }`,
};

export const BAKE_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
