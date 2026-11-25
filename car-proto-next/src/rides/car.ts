// @ts-nocheck: moved from legacy.js as is; it gets types together with its unit tests (ADR-0004)
// ---------- car ----------
// Moved from legacy.js (step 3): what it uses from the rest of the game comes through GAME, what it hands back is returned.
import { THREE } from '../three.js';
import { GS } from '../game/state.ts';

export function createCarModel(GAME) {
  const carGroup = new THREE.Group();
  const body = new THREE.Group();     // tilts for roll/pitch
  carGroup.add(body);
  GAME.scene.add(carGroup);

  const paint = new THREE.MeshStandardMaterial({ color: 0x3a3532, metalness: 0.55, roughness: 0.55, envMap: GS.ENV, envMapIntensity: 1.1, flatShading: true });   // scorched matte black
  const paint2 = new THREE.MeshStandardMaterial({ color: 0x5e2c14, metalness: 0.45, roughness: 0.78, flatShading: true });                            // rust plates
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e23, roughness: 0.7, metalness: 0.2, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x3a2814, metalness: 0.9, roughness: 0.06, envMap: GS.ENV, envMapIntensity: 2.2, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x7c828c, metalness: 0.9, roughness: 0.38, flatShading: true });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.95, flatShading: true });

  // low-poly building blocks
  function prism(pts, width) {                         // side profile [[z, y], ...] extruded across x, centred
    const sh = new THREE.Shape(); pts.forEach(([z, y], i) => i ? sh.lineTo(z, y) : sh.moveTo(z, y));
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(width / 2, 0, 0);
    return g;
  }
  function taperX(geo, y0, y1, k) {                    // pinch the width toward the top
    const q = geo.attributes.position;
    for (let i = 0; i < q.count; i++) q.setX(i, q.getX(i) * (1 + (k - 1) * THREE.MathUtils.clamp((q.getY(i) - y0) / (y1 - y0), 0, 1)));
    geo.computeVertexNormals(); return geo;
  }
  const put = (geo, mat, x = 0, y = 0, z = 0, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // wasteland buggy: scorched hull, rust plates, open cockpit under a roll cage, blower through the hood, side stacks, plow
  put(taperX(prism([[-2.12, 0.62], [-2.18, 1.0], [-2.0, 1.22], [0.9, 1.22], [1.95, 1.02], [2.15, 0.88], [2.1, 0.55], [1.75, 0.45], [-1.8, 0.45]], 2.1), 0.45, 1.22, 0.9), paint);
  put(box(1.5, 0.04, 0.8), paint2, 0, 1.13, 1.46).rotation.x = 0.188;                 // welded hood plate
  put(box(0.8, 0.04, 0.5), metal, -0.4, 1.235, -1.75);                                // bare patch on the tail
  // cockpit tub + armoured windscreen
  for (const x of [-0.98, 0.98]) {
    put(box(0.1, 0.44, 1.95), paint2, x, 1.42, -0.37);
    put(box(0.05, 0.26, 0.7), metal, x * 1.05, 1.42, -0.1);
    for (const z of [-1.1, 0.4]) put(box(0.06, 0.06, 0.06), dark, x * 1.07, 1.56, z);
  }
  put(box(2.0, 0.44, 0.1), paint2, 0, 1.42, -1.32);
  put(box(1.86, 0.52, 0.06), glass, 0, 1.5, 0.8).rotation.x = -0.35;
  for (const y of [1.36, 1.5, 1.64]) put(box(1.92, 0.07, 0.1), dark, 0, y, 0.8 - (y - 1.5) * 0.36);
  // roll cage with a light bar
  for (const x of [-0.92, 0.92]) {
    for (const z of [0.6, -1.44]) put(box(0.11, 0.86, 0.11), dark, x, 1.63, z);
    put(box(0.11, 0.11, 2.15), dark, x, 2.04, -0.42);
    put(box(0.09, 0.09, 1.1), dark, x, 1.72, -0.95).rotation.x = 0.62;                // rear brace
  }
  for (const z of [0.6, -1.44]) put(box(1.95, 0.11, 0.11), dark, 0, 2.04, z);
  // crew: Roxy at the wheel, Vee on the gun (she turns with the turret)
  const skinR = new THREE.MeshStandardMaterial({ color: 0xd9966a, roughness: 0.7, flatShading: true });
  const skinV = new THREE.MeshStandardMaterial({ color: 0xf0c4a2, roughness: 0.7, flatShading: true });
  const hairR = new THREE.MeshStandardMaterial({ color: 0xe8402c, roughness: 0.6, flatShading: true });
  const hairV = new THREE.MeshStandardMaterial({ color: 0x2fd0c0, roughness: 0.6, flatShading: true });
  const topV = new THREE.MeshStandardMaterial({ color: 0x6f7a45, roughness: 0.8, flatShading: true });
  const gogMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffb040 }), 1.4);
  const driver = new THREE.Group(); driver.position.set(0.44, 1.22, 0.02); body.add(driver);
  put(box(0.44, 0.5, 0.26), dark, 0, 0.3, 0, driver);                                 // leather jacket
  put(box(0.3, 0.3, 0.3), skinR, 0, 0.72, 0.02, driver);
  put(box(0.38, 0.2, 0.36), hairR, 0, 0.9, -0.03, driver);
  put(box(0.4, 0.46, 0.14), hairR, 0, 0.62, -0.2, driver);                            // mane down the back
  put(box(0.32, 0.08, 0.06), gogMat, 0, 0.84, 0.18, driver);
  for (const x of [-0.2, 0.2]) put(box(0.1, 0.1, 0.46), dark, x, 0.36, 0.26, driver).rotation.x = 0.25;
  const wheelRim = put(new THREE.TorusGeometry(0.17, 0.035, 4, 8), metal, 0.44, 1.52, 0.52); wheelRim.rotation.x = -0.5;
  // gun on a post in the back of the cage
  put(new THREE.CylinderGeometry(0.09, 0.13, 0.84, 6), metal, 0, 1.62, -0.5);
  const turret = new THREE.Group();          // крутится за мышкой
  turret.position.set(0, 2.04, -0.5); body.add(turret);
  put(new THREE.CylinderGeometry(0.42, 0.52, 0.2, 8), metal, 0, 0, 0, turret);
  put(prism([[-0.48, 0.08], [-0.4, 0.44], [0.12, 0.44], [0.52, 0.26], [0.52, 0.08]], 0.58), paint, 0, 0, 0, turret);
  put(box(0.5, 0.5, 0.06), paint2, 0, 0.36, 0.5, turret).rotation.x = -0.25;          // gun shield
  put(box(0.2, 0.26, 0.42), metal, 0.4, 0.24, -0.08, turret);                       // ammo box
  const barrel = put(new THREE.CylinderGeometry(0.075, 0.1, 1.5, 6), dark, 0, 0.2, 1.2, turret); barrel.rotation.x = Math.PI / 2;
  put(box(0.22, 0.16, 0.26), dark, 0, 0.2, 1.93, turret);                           // muzzle brake
  put(box(0.42, 0.62, 0.26), topV, 0, -0.34, -0.66, turret);                          // Vee
  put(box(0.3, 0.3, 0.3), skinV, 0, 0.14, -0.64, turret);
  put(box(0.38, 0.18, 0.36), hairV, 0, 0.31, -0.66, turret);
  put(box(0.36, 0.3, 0.1), hairV, 0, 0.12, -0.83, turret);
  for (const x of [-0.2, 0.2]) {
    put(box(0.17, 0.17, 0.17), hairV, x, 0.46, -0.72, turret);                        // buns
    put(box(0.1, 0.1, 0.5), skinV, x, -0.1, -0.42, turret).rotation.x = -0.2;
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
    GAME.glow(new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 2.6));
  muzzle.position.set(0, 0.2, 2.1); muzzle.visible = false; turret.add(muzzle);
  // fenders: rear ones sit higher over the big tyres
  const archGeo = prism([[-0.8, 0.48], [-0.68, 1.0], [-0.34, 1.24], [0.34, 1.24], [0.68, 1.0], [0.8, 0.48],
                         [0.62, 0.48], [0.54, 0.9], [0.27, 1.08], [-0.27, 1.08], [-0.54, 0.9], [-0.62, 0.48]], 0.5);
  for (const x of [-1.14, 1.14]) { put(archGeo, paint2, x, 0, 1.35); put(archGeo, paint2, x * 1.04, 0.1, -1.35).scale.set(1, 1.16, 1.2); }
  // blower through the hood
  put(box(0.62, 0.36, 0.86), metal, 0, 1.34, 1.3);
  put(prism([[-0.48, 0], [-0.4, 0.26], [0.5, 0.32], [0.54, 0]], 0.72), dark, 0, 1.52, 1.3);
  put(box(0.56, 0.2, 0.04), GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff5a1a }), 1.6), 0, 1.66, 1.83);
  put(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8), dark, 0, 1.3, 1.78).rotation.x = Math.PI / 2;
  // side stacks
  for (const x of [-1, 1]) for (let i = 0; i < 3; i++) {
    const p = put(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 6), metal, x * 1.1, 1.62, 0.5 - i * 0.2);
    p.rotation.x = -0.42; p.rotation.z = -x * 0.14;
  }
  // lights
  const lampMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xfff0c0 }), 2.6);
  const tailMat = GAME.glow(new THREE.MeshBasicMaterial({ color: 0xff2a1a }), 4);
  put(box(1.0, 0.2, 0.06), dark, 0, 0.76, 2.13);                                    // grille
  for (const x of [-0.6, -0.2, 0.2, 0.6]) { put(box(0.3, 0.24, 0.14), dark, x, 2.2, 0.6); put(box(0.22, 0.16, 0.04), lampMat, x, 2.2, 0.68); }
  for (const x of [-0.68, 0.68]) {
    put(box(0.38, 0.16, 0.08), lampMat, x, 0.78, 2.13);
    put(box(0.5, 0.14, 0.08), tailMat, x, 0.9, -2.17);
    put(box(0.08, 0.16, 1.5), dark, x * 1.56, 0.52, 0);                             // side skirts
  }
  put(box(2.2, 0.22, 0.24), dark, 0, 0.56, -2.2);                                   // rear bumper
  // tail load: fuel drums, a spare, a rag on a pole
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x9a2f22, metalness: 0.4, roughness: 0.7, flatShading: true });
  for (const x of [-0.42, 0.42]) { put(new THREE.CylinderGeometry(0.27, 0.27, 0.6, 8), drumMat, x, 1.52, -1.78); put(new THREE.CylinderGeometry(0.285, 0.285, 0.07, 8), dark, x, 1.56, -1.78); }
  put(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), tyreMat, 0, 0.98, -2.3).rotation.x = Math.PI / 2;
  put(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 4), metal, -0.92, 2.8, -1.44);
  put(box(0.03, 0.34, 0.62), new THREE.MeshStandardMaterial({ color: 0xc2264a, roughness: 0.9, flatShading: true }), -0.92, 3.3, -1.78);
  // plow with spikes (swapped out for the drill once it is unlocked)
  const bullbar = new THREE.Group(); body.add(bullbar);
  put(box(2.3, 0.2, 0.26), dark, 0, 0.5, 2.22, bullbar);
  for (const sd of [-1, 1]) put(box(1.22, 0.62, 0.08), metal, sd * 0.57, 0.74, 2.44, bullbar).rotation.y = sd * 0.36;
  for (const x of [-0.9, -0.45, 0, 0.45, 0.9]) put(new THREE.ConeGeometry(0.09, 0.42, 4), paint2, x, 0.8, 2.84 - Math.abs(x) * 0.38, bullbar).rotation.x = Math.PI / 2;
  // headlight beam: lives in the scene (not under the car) so hiding the car never changes the light count
  const headLight = new THREE.SpotLight(0xffe2b0, 0, 34, 0.55, 0.7, 1.2);
  GAME.scene.add(headLight, headLight.target);
  function updateHeadlight() {
    const fx = Math.sin(GAME.car.heading), fz = Math.cos(GAME.car.heading);
    headLight.position.set(GAME.car.pos.x + fx * 2.2, 1.4 + GAME.car.y, GAME.car.pos.z + fz * 2.2);
    headLight.target.position.set(GAME.car.pos.x + fx * 16, GAME.car.y, GAME.car.pos.z + fz * 16);
    headLight.intensity = GAME.car.alive && GAME.car.depth < 0.5 ? 1.5 * GAME.LIGHT : 0;
  }
  // ---- бур ----
  const drill = new THREE.Group();               // крепление на морде
  drill.position.set(0, 0.85, 2.05);
  body.add(drill);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.38, 8), metal);
  collar.rotation.x = Math.PI / 2; collar.position.z = 0.1; drill.add(collar);
  [-0.85, 0.85].forEach(x => {                   // распорки к раме
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), metal);
    strut.position.set(x * 0.8, 0, 0); strut.rotation.y = -x * 0.5; drill.add(strut);
  });
  const drillSpin = new THREE.Group();           // крутится вокруг своей оси (z)
  drillSpin.position.z = 0.25; drill.add(drillSpin);
  const DRILL_LEN = 2.3, DRILL_R = 0.6;
  const coneGeo = new THREE.ConeGeometry(DRILL_R, DRILL_LEN, 7);
  coneGeo.translate(0, DRILL_LEN / 2, 0); coneGeo.rotateX(Math.PI / 2);
  const drillMat = new THREE.MeshStandardMaterial({ color: 0xc4c9d2, emissive: 0x000000, metalness: 1, roughness: 0.25, envMap: GS.ENV, envMapIntensity: 1.6, flatShading: true });
  drillSpin.add(new THREE.Mesh(coneGeo, drillMat));
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0xf0b428, metalness: 0.7, roughness: 0.35 });
  for (let strand = 0; strand < 2; strand++) {   // две спирали
    for (let i = 0; i < 11; i++) {
      const t = i / 11, rr = DRILL_R * (1 - t) + 0.04;
      const a = strand * Math.PI + t * Math.PI * 4;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.32), ridgeMat);
      seg.position.set(Math.cos(a) * rr, Math.sin(a) * rr, t * DRILL_LEN);
      seg.rotation.z = a;
      drillSpin.add(seg);
    }
  }
  // ---- хваталка (правый бок = локальный -X) ----
  const arm = new THREE.Group();
  // мачта на правом переднем углу — рука на ней крутится сама по себе за курсором
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.95, 6), metal);
  mast.position.set(-0.78, 1.6, 1.4); body.add(mast);
  arm.position.set(-0.78, 2.05, 1.4); arm.rotation.y = Math.PI / 2; body.add(arm);
  const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.6), metal); arm.add(shoulder);
  const armGeo = new THREE.BoxGeometry(1, 0.2, 0.22); armGeo.translate(-0.5, 0, 0);
  const armSeg = new THREE.Mesh(armGeo, ridgeMat); arm.add(armSeg);
  const claw = new THREE.Group(); arm.add(claw);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.6), metal);
  palm.position.x = -0.1; claw.add(palm);
  const fingers = [];
  [-1, 1].forEach(side => {
    const piv = new THREE.Group(); piv.position.set(-0.2, 0, side * 0.24); claw.add(piv);
    const fg = new THREE.BoxGeometry(0.75, 0.16, 0.12); fg.translate(-0.37, 0, 0);
    piv.add(new THREE.Mesh(fg, dark));
    const tipM = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.3), dark);
    tipM.position.set(-0.72, 0, -side * 0.12); piv.add(tipM);
    fingers.push({ piv, side });
  });
  body.traverse(m => { if (m.isMesh) m.castShadow = true; });

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.44, 10); wheelGeo.rotateZ(Math.PI / 2);     // chunky faceted tyres
  const hubGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.47, 6); hubGeo.rotateZ(Math.PI / 2);
  [[-1.15, 1.35, true], [1.15, 1.35, true], [-1.15, -1.35, false], [1.15, -1.35, false]].forEach(([x, z, front]) => {
    const big = front ? 1 : 1.28;
    const pivot = new THREE.Group(); pivot.position.set(x * (front ? 1 : 1.05), 0.5 * big, z);
    const w = new THREE.Mesh(wheelGeo, tyreMat); w.castShadow = true; w.scale.setScalar(big);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 4), metal); spike.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; spike.position.x = (x > 0 ? 1 : -1) * 0.36; w.add(spike);
    const hub = new THREE.Mesh(hubGeo, metal); hub.rotation.z = x > 0 ? 0 : Math.PI; w.add(hub);
    w.add(new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.09, 0.4), dark));      // spoke, so the spin reads
    pivot.add(w); carGroup.add(pivot);
    wheels.push({ pivot, mesh: w, front });
  });

  return { carGroup, body, paint, dark, metal, tyreMat, turret, muzzle, bullbar, updateHeadlight, drill, drillSpin, drillMat, arm, mast, armSeg, claw, fingers, wheels };
}
