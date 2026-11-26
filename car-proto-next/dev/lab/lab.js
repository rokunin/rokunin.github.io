// The look lab (Roman, 26.11.2026): the game's test build frozen on staged scenes, with an extra post pass (SSAO and ground mist,
// after kevintngo/cinderwatch, MIT) and sliders for it. Nothing here ships: build.py glues this onto a test-mode build as lab/index.html.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 600 && !window.__dbg; i++) await sleep(100);
  const d = window.__dbg, hx = window.__hx, T = d.THREE, run = (body, a) => (new Function('d', 'a', body))(d, a);
  document.querySelector('#rides button[data-ride=halo]').click();
  for (let i = 0; i < 300 && !(d.car && d.car.alive && d.ride === 'halo'); i++) await sleep(100);
  d.car.maxHp = 1e6; d.car.hp = 1e6; await sleep(1200);

  // ---- the pass: sits right after the scene render, in HDR, before bloom and the grade ----
  const comp = d.composer;
  for (const rt of [comp.renderTarget1, comp.renderTarget2]) { rt.depthTexture = new T.DepthTexture(rt.width, rt.height); rt.depthTexture.type = T.UnsignedIntType; rt.dispose(); }
  const U0 = {
    tDiffuse: { value: null }, tDepth: { value: null }, uInvVP: { value: new T.Matrix4() }, uCamDir: { value: new T.Vector3() }, uPx: { value: new T.Vector2() },
    uAO: { value: new T.Vector4(0, 1.2, 0, 0) },        // strength, radius (m), show AO only, -
    uAOuv: { value: new T.Vector2() },                  // the radius in uv
    uMist: { value: new T.Vector4(0, 0.2, 1.2, 0.6) },  // density, base height, falloff height, patchiness
    uMistCol: { value: new T.Vector3(0.5, 0.42, 0.5) }, uMistGlow: { value: 1 }, uGlowUv: { value: new T.Vector2() },
  };
  const pass = new T.ShaderPass({ uniforms: U0,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
precision highp float; varying vec2 vUv;
uniform sampler2D tDiffuse, tDepth; uniform mat4 uInvVP; uniform vec3 uCamDir, uMistCol; uniform vec2 uPx, uAOuv, uGlowUv; uniform vec4 uAO, uMist; uniform float uMistGlow;
float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
vec3 wpos(vec2 uv, float z){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
void main(){
  vec3 col = texture2D(tDiffuse, vUv).rgb; float z = texture2D(tDepth, vUv).x;
  if (z < 0.9999) {
    vec3 P = wpos(vUv, z);
    if (uAO.x > 0.0) {
      float zr = texture2D(tDepth, vUv + vec2(uPx.x, 0.0)).x, zl = texture2D(tDepth, vUv - vec2(uPx.x, 0.0)).x;
      float zu = texture2D(tDepth, vUv + vec2(0.0, uPx.y)).x, zd = texture2D(tDepth, vUv - vec2(0.0, uPx.y)).x;
      vec3 dx = abs(zr - z) < abs(z - zl) ? wpos(vUv + vec2(uPx.x, 0.0), zr) - P : P - wpos(vUv - vec2(uPx.x, 0.0), zl);
      vec3 dy = abs(zu - z) < abs(z - zd) ? wpos(vUv + vec2(0.0, uPx.y), zu) - P : P - wpos(vUv - vec2(0.0, uPx.y), zd);
      vec3 N = normalize(cross(dx, dy)); if (dot(N, uCamDir) > 0.0) N = -N;
      float occ = 0.0, ang = bayer4(gl_FragCoord.xy) * 6.2831853, r2 = uAO.y * uAO.y;
      for (int i = 0; i < 20; i++) {
        float fi = (float(i) + 0.5) / 20.0, a = ang + float(i) * 2.39996;
        vec2 suv = vUv + vec2(cos(a), sin(a)) * sqrt(fi) * uAOuv;
        vec3 V = wpos(suv, texture2D(tDepth, suv).x) - P; float vv = dot(V, V);
        occ += max(0.0, dot(V, N) - 0.04) / (vv + 0.03) * step(vv, r2);
      }
      float ao = clamp(1.0 - occ * uAO.x * 0.05, 0.0, 1.0);
      ao = mix(ao, 1.0, smoothstep(0.8, 1.5, max(col.r, max(col.g, col.b))));     // what glows is not shaded
      col = uAO.z > 0.5 ? vec3(ao * ao * ao * 0.5) : col * ao;
    }
    if (uMist.x > 0.0) {
      float n = vn(P.xz * 0.16 + 3.0) * 0.65 + vn(P.xz * 0.47 + 11.0) * 0.35;
      float tau = min(uMist.x * exp(-(max(P.y, 0.0) - uMist.y) / uMist.z), 1.6) * mix(1.0, smoothstep(0.3, 0.8, n), uMist.w);
      vec3 L = uMistCol, g = vec3(0.0);                   // the mist picks up what glows around it: a wide ring of taps, only the HDR part
      float a0 = bayer4(gl_FragCoord.xy + 2.0) * 6.2831853;
      for (int i = 0; i < 12; i++) { float a = a0 + float(i) * 2.39996, fi = (float(i) + 0.5) / 12.0;
        g += max(texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * sqrt(fi) * uGlowUv).rgb - 0.9, 0.0); }
      L += g / 12.0 * uMistGlow;
      col = mix(col, L, 1.0 - exp(-tau));
    }
  }
  gl_FragColor = vec4(col, 1.0);
}` });
  const U = pass.uniforms;                               // ShaderPass clones what it is given
  pass.enabled = false;
  const render0 = pass.render.bind(pass);
  pass.render = (renderer, writeBuffer, readBuffer, dt, mask) => { U.tDepth.value = readBuffer.depthTexture; return render0(renderer, writeBuffer, readBuffer, dt, mask); };
  comp.insertPass(pass, 1);

  // ---- scenes: staged, played a fixed number of frames, then the clock stands ----
  const SCENES = __SCENES__, STAGE = __STAGE__;
  let nudge = '';
  function render() {
    run(nudge + `d.calm(); d.car.vel.set(0, 0, 0);
      d.camFocus.copy(d.car.pos); d.camera.position.copy(d.car.pos).add(d.ISO_OFFSET); d.camera.lookAt(d.camFocus); d.camera.updateMatrixWorld();
      const gp = d.gradePass; gp.uniforms.time.value = 1.0; gp.uniforms.hurt.value = 0; gp.uniforms.lowHp.value = 0; d.renderer.shadowMap.needsUpdate = true;`);
    const cam = d.camera, rt = comp.renderTarget1;
    U.uInvVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert(); cam.getWorldDirection(U.uCamDir.value);
    U.uPx.value.set(1 / rt.width, 1 / rt.height);
    const w = cam.right - cam.left, h = cam.top - cam.bottom;
    U.uAOuv.value.set(U.uAO.value.y / w, U.uAO.value.y / h); U.uGlowUv.value.set(4 / w, 4 / h);
    pass.enabled = U.uAO.value.x > 0 || U.uMist.value.x > 0;
    comp.render(); nudge = '';
  }
  let busy = false;
  async function stage(s) {
    if (busy) return; busy = true; status.textContent = s.label + '…';
    if (d.ride !== s.ride) { hx.thaw(); run('d.setRide(a);', s.ride); await sleep(600); }
    let x = s.x, z = s.z; if (x === null) [x, z] = run('return [d.LAIR_POS.x - 12, d.LAIR_POS.z + 6];');
    run(STAGE + s.extra + '\nwindow.__hx.step(a[5], 1 / 30);', [7, x, z, s.h, s.rng, s.n]);
    for (let i = 0; i < 3000 && hx.queue > 0; i++) await sleep(20);
    await sleep(120); nudge = s.nudge || ''; render(); status.textContent = s.label; busy = false;
  }

  // ---- the panel ----
  const css = document.createElement('style'); css.textContent = `
#lab{position:fixed;top:8px;right:8px;z-index:99999;width:250px;max-height:calc(100vh - 16px);overflow:auto;background:#17131ee6;color:#eee;font:12px/1.35 system-ui,sans-serif;border:1px solid #fff3;border-radius:10px;padding:8px 10px}
#lab h4{margin:8px 0 4px;font-size:12px;color:#ffc86a}#lab label{display:flex;align-items:center;gap:6px;margin:3px 0}#lab label span{flex:0 0 78px}#lab input[type=range]{flex:1;min-width:0}
#lab b{flex:0 0 30px;text-align:right;font-weight:400;opacity:.8}#lab button{background:#2c2538;color:#eee;border:1px solid #fff3;border-radius:6px;padding:5px 7px;margin:2px 2px 2px 0;font:inherit}
#lab button.on{background:#ffc86a;color:#201a10}#lab.min>:not(#labhead){display:none}.labkeep>:not(.labkeep):not(#lab):not(script):not(style){display:none!important}
#labhead{display:flex;justify-content:space-between;align-items:center;font-weight:600}`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'lab'; document.body.appendChild(el);
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'keydown', 'wheel']) el.addEventListener(ev, e => e.stopPropagation());
  el.innerHTML = '<div id="labhead"><span>Свет: проба</span><button id="labmin">—</button></div><div id="labscenes"></div><div id="labst" style="opacity:.7"></div>';
  const status = el.querySelector('#labst');
  el.querySelector('#labmin').onclick = () => el.classList.toggle('min');
  const sb = el.querySelector('#labscenes');
  // a scene is staged once per page load (what the last one cast would stay in the world), so a scene button reloads the page
  const save = () => { try { localStorage.setItem('chubzLab', JSON.stringify(cfg)); } catch (e) {} };
  let cfg = {}; try { cfg = JSON.parse(localStorage.getItem('chubzLab')) || {}; } catch (e) {}
  const cur = Math.min(SCENES.length - 1, Math.max(0, +(location.hash.match(/s=(\d+)/) || [0, 0])[1]));
  SCENES.forEach((s, i) => { const b = document.createElement('button'); b.textContent = s.label; if (i === cur) b.classList.add('on');
    b.onclick = () => { if (i !== cur) { location.hash = 's=' + i; location.reload(); } }; sb.appendChild(b); });
  const head = t => { const h = document.createElement('h4'); h.textContent = t; el.appendChild(h); };
  const slider = (name, min, max, step, val, set) => { const l = document.createElement('label'); l.innerHTML = `<span>${name}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><b>${val}</b>`;
    const i = l.querySelector('input'), o = l.querySelector('b'); if (cfg[name] !== undefined) { i.value = cfg[name]; o.textContent = i.value; }
    i.oninput = () => { o.textContent = i.value; set(+i.value); cfg[name] = +i.value; save(); if (!busy) render(); }; set(+i.value); el.appendChild(l); };
  const check = (name, val, set) => { const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" ${val ? 'checked' : ''}><span style="flex:1">${name}</span>`;
    const i = l.querySelector('input'); if (cfg[name] !== undefined) i.checked = cfg[name];
    i.onchange = () => { set(i.checked); cfg[name] = i.checked; save(); if (!busy) render(); }; set(i.checked); el.appendChild(l); };
  const st = { ao: true, aoK: 3, mist: true, mistK: 0.25 };
  const sync = () => { U.uAO.value.x = st.ao ? st.aoK : 0; U.uMist.value.x = st.mist ? st.mistK : 0; };
  head('SSAO (тени в углах)');
  check('SSAO включено', true, v => { st.ao = v; sync(); });
  slider('сила AO', 0, 8, 0.1, 3, v => { st.aoK = v; sync(); });
  slider('радиус, м', 0.3, 4, 0.1, 1.2, v => { U.uAO.value.y = v; });
  check('показать только AO', false, v => { U.uAO.value.z = v ? 1 : 0; });
  head('Туман у земли');
  check('туман включён', true, v => { st.mist = v; sync(); });
  slider('плотность', 0, 2, 0.05, 0.25, v => { st.mistK = v; sync(); });
  slider('высота, м', 0.2, 6, 0.1, 1.2, v => { U.uMist.value.z = v; });
  slider('клочья', 0, 1, 0.05, 0.6, v => { U.uMist.value.w = v; });
  slider('свет от свечений', 0, 4, 0.1, 1, v => { U.uMistGlow.value = v; });
  { const l = document.createElement('label'); l.innerHTML = '<span>цвет</span><input type="color" value="#8a7a96">'; const i = l.querySelector('input');
    if (cfg.mistCol) i.value = cfg.mistCol;
    const set = () => { const c = new T.Color(i.value); U.uMistCol.value.set(c.r, c.g, c.b); }; i.oninput = () => { set(); cfg.mistCol = i.value; save(); if (!busy) render(); }; set(); el.appendChild(l); }
  { const b = document.createElement('button'); b.textContent = 'сбросить настройки'; b.onclick = () => { try { localStorage.removeItem('chubzLab'); } catch (e) {} location.reload(); }; el.appendChild(b); }
  head('Свечения (билд 151)');
  slider('цвет в ярком', 0, 1, 0.05, 0.7, v => { d.gradePass.uniforms.hueKeep.value = v; });
  addEventListener('resize', () => setTimeout(() => { if (!busy) render(); }, 250));
  window.__lab = { U, pass, render, stage, SCENES };
  for (let n = d.renderer.domElement; n && n !== document.body; n = n.parentElement) n.classList.add('labkeep');   // the game's HUD, minimap and markers: out of the picture
  document.body.classList.add('labkeep');
  await stage(SCENES[cur]);
})();
