// ---------- post-processing: HDR bloom -> filmic grade -> FXAA ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createPost(GAME) {
  GS.gradePass = null; GS.fxaaPass = null; GS.composer = null;
  if (THREE.EffectComposer && THREE.RenderPass && THREE.ShaderPass && THREE.UnrealBloomPass) {
    const hdr = !!(GAME.renderer.capabilities.isWebGL2 && GAME.renderer.extensions.get('EXT_color_buffer_float')) ||
                !!GAME.renderer.extensions.get('EXT_color_buffer_half_float');      // iOS exposes only the half-float one
    const rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
    GS.composer = new THREE.EffectComposer(GAME.renderer, rt);
    GS.composer.setPixelRatio(GS.PR); GS.composer.setSize(innerWidth, innerHeight);
    GS.composer.addPass(new THREE.RenderPass(GAME.scene, GAME.camera));
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.36, 0.55, hdr ? 1.15 : 0.86);
    GS.bloomPass = bloom;
    { const hp = bloom.materialHighPassFilter, at = 'vec4 texel = texture2D( tDiffuse, vUv );';      // clamp what feeds the bloom: one hot pixel must not flare the screen
      if (hp.fragmentShader.includes(at)) { hp.fragmentShader = hp.fragmentShader.replace(at, at + ' texel.rgb = min(max(texel.rgb, vec3(0.0)), vec3(40.0));'); hp.needsUpdate = true; }
      else GAME.logError('bloom clamp: the high-pass shader changed, the clamp is not in'); }
    // The bloom as Three r128 drew it (ADR-0005; Roman, 25.11.2026: white glows came out ~5x brighter on r187). Since then the
    // UnrealBloomPass blurs with Gaussians twice as wide, multiplies the sum by 3, and picks bright pixels by Rec.709 luminance.
    // Here: r128's blur (sigma = kernel radius, normalised), no factor 3, r128's luma weights. Each patch logs if its anchor moves.
    // What blooms is picked by the brightest channel with a soft knee (glowMax, smoothWidth): a saturated glow blooms in its own
    // colour, and the halo does not jump at the threshold. glowMax 0 and smoothWidth 0.01 give r128's pick back (frames.py does that).
    { const hp = bloom.materialHighPassFilter, at = 'float alpha = smoothstep(';
      if (hp.fragmentShader.includes(at)) { bloom.highPassUniforms.glowMax = { value: 1 }; bloom.highPassUniforms.smoothWidth.value = 0.5;
        hp.fragmentShader = hp.fragmentShader.replace(at, 'v = mix( v, max( texel.r, max( texel.g, texel.b ) ), glowMax );\n' + at).replace('void main()', 'uniform float glowMax;\nvoid main()'); hp.needsUpdate = true; }
      else GAME.logError('bloom: the high-pass threshold changed'); }
    { const hp = bloom.materialHighPassFilter, lum = 'float v = luminance( texel.xyz );';
      if (hp.fragmentShader.includes(lum)) { hp.fragmentShader = hp.fragmentShader.replace(lum, 'float v = dot( texel.xyz, vec3( 0.299, 0.587, 0.114 ) );'); hp.needsUpdate = true; }
      else GAME.logError('bloom: the high-pass luminance changed');
      const cm = bloom.compositeMaterial;
      if (cm.fragmentShader.includes('3.0 * bloomStrength')) { cm.fragmentShader = cm.fragmentShader.replace('3.0 * bloomStrength', 'bloomStrength'); cm.needsUpdate = true; }
      else GAME.logError('bloom: the composite shader changed');
      const blurs = bloom.separableBlurMaterials;
      if (Array.isArray(blurs) && blurs.length === 5 && blurs[0].uniforms.invSize) {
        [3, 5, 7, 9, 11].forEach((k, i) => { blurs[i] = new THREE.ShaderMaterial({
          defines: { KERNEL_RADIUS: k, SIGMA: k },
          uniforms: { colorTexture: { value: null }, invSize: { value: blurs[i].uniforms.invSize.value.clone() }, direction: { value: new THREE.Vector2(0.5, 0.5) } },
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `varying vec2 vUv; uniform sampler2D colorTexture; uniform vec2 invSize; uniform vec2 direction;
            float gaussianPdf(in float x, in float sigma) { return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma; }
            void main() {
              float fSigma = float(SIGMA), weightSum = gaussianPdf(0.0, fSigma); vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * weightSum;
              for (int i = 1; i < KERNEL_RADIUS; i++) { float x = float(i), w = gaussianPdf(x, fSigma); vec2 o = direction * invSize * x;
                diffuseSum += (texture2D(colorTexture, vUv + o).rgb + texture2D(colorTexture, vUv - o).rgb) * w; weightSum += 2.0 * w; }
              gl_FragColor = vec4(diffuseSum / weightSum, 1.0);
            }` }); });
      } else GAME.logError('bloom: the blur materials changed'); }
    { const ss = bloom.setSize.bind(bloom), k = GAME.COARSE ? 0.5 : 0.75; bloom.setSize = (w, h) => ss(Math.round(w * k), Math.round(h * k)); bloom.setSize(innerWidth * GS.PR, innerHeight * GS.PR); }   // blur chain on a smaller buffer
    if (hdr) [bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]
      .forEach(t => { t.texture.type = THREE.HalfFloatType; });
    GS.composer.addPass(bloom);
    GS.gradePass = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, exposure: { value: 2.0 }, hurt: { value: 0 }, lowHp: { value: 0 }, hueKeep: { value: 0.7 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time, exposure, hurt, lowHp, hueKeep; varying vec2 vUv;
        vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        void main(){
          vec2 d = vUv - 0.5; float r2 = dot(d, d);
          vec2 ca = d * r2 * 0.006;                                   // slight chromatic fringe toward the corners
          vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
          // Glows keep their colour (Roman, 26.11.2026): the curve per channel turns every bright colour white, so what glows
          // (0.6 and up in the scene; sunlit white stays under 0.5) is scaled as a whole by the curve of its brightest channel.
          float mx = max(c.r, max(c.g, c.b)), em = mx * exposure;
          vec3 hued = c * exposure * (aces(vec3(em)).r / max(em, 1e-4));
          c = mix(aces(c * exposure), hued, hueKeep * smoothstep(0.6, 1.2, mx));
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c *= mix(vec3(0.94, 0.98, 1.08), vec3(1.05, 1.0, 0.94), smoothstep(0.0, 0.55, l));   // cool shadows, warm highlights
          c = mix(vec3(l), c, 1.14);                                  // saturation
          c = pow(max(c, 0.0), vec3(1.0 / 2.2));
          c *= 1.0 - 0.5 * smoothstep(0.12, 0.62, r2);                // vignette
          float edge = smoothstep(0.06, 0.45, r2);
          c = mix(c, vec3(0.75, 0.04, 0.04), edge * clamp(hurt * 0.55 + lowHp * (0.22 + 0.12 * sin(time * 6.0)), 0.0, 0.8));
          float n = fract(sin(dot(gl_FragCoord.xy + fract(time) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
          c += (n - 0.5) * 0.022;                                     // film grain
          gl_FragColor = vec4(c, 1.0);
        }` });
    GS.composer.addPass(GS.gradePass);
    if (THREE.FXAAShader) {
      GS.fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
      GS.fxaaPass.uniforms.resolution.value.set(1 / (innerWidth * GS.PR), 1 / (innerHeight * GS.PR));
      GS.composer.addPass(GS.fxaaPass);
    }
  } else {                                                           // post scripts failed to load: plain render, still tone-mapped
    GAME.renderer.outputColorSpace = THREE.SRGBColorSpace;
    GAME.renderer.toneMapping = THREE.ACESFilmicToneMapping; GAME.renderer.toneMappingExposure = 2.2;
  }

  return {  };
}
