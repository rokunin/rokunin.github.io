// The crew: Roxy drives, Vee shoots and navigates. CrewArt draws them on a canvas (no assets): busts for the chat,
// full figures for the intro comic. createCrew() is their banter: lines picked by what happens in the game, with cooldowns.

// ---------- crew art: two procedurally drawn wastelanders (Roxy drives, Vee shoots and navigates) ----------
// Pure canvas 2D, no assets. head() is shared by the bust portraits (in-game chat) and the full figures (intro comic).
export const CrewArt = (() => {
  const INK = '#1b1421', TAU = Math.PI * 2;
  const WHO: any = {
    roxy: { name: 'ROXY', role: 'driver', skin: '#e2a57c', skinSh: '#c4835c', hair: '#e8402c', hairDk: '#a81f1c', hairHi: '#ff8a4a', eye: '#3fd07a', lip: '#c2264a', top: '#d4302e', topDk: '#8f1c22', jacket: '#2a2630', jacketHi: '#4a4452', accent: '#ff8c32' },
    vee:  { name: 'VEE', role: 'gunner · navigator', skin: '#f3cdb0', skinSh: '#d9a888', hair: '#2fd0c0', hairDk: '#1a8f92', hairHi: '#9af5e4', eye: '#b06cff', lip: '#d8457a', top: '#6f7a45', topDk: '#4a5330', jacket: '#3a3f2a', jacketHi: '#5d6540', accent: '#5ff5e6' },
  };
  WHO.jan = { name: 'FORE', skin: '#f6e3d0', skinSh: '#dcbfa6', hair: '#f6e7b4', hairDk: '#c9a85a', hairHi: '#ffffff', eye: '#5fb0ff', lip: '#c98a7a', top: '#f4f1e8', topDk: '#cfc8b8', jacket: '#d9c88a', jacketHi: '#f0e2b0', accent: '#ffd95a' };
  WHO.jan2 = { ...WHO.jan, name: 'AFT', hair: '#cfd8ea', hairDk: '#8f9ab8', eye: '#ffb040', accent: '#9ad0ff' };
  const S = c => { c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; };
  const fs = (c, fill, lw = 3) => { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); };

  // ---- head, centred on (0,0), face about 34 wide / 46 tall each way ----
  function eye(c, W, x, side, expr) {
    const y = 0;
    c.save(); c.translate(x, y);
    if (expr === 'grin') {                           // happy closed arcs
      c.lineWidth = 3.5; c.beginPath(); c.moveTo(-9, 2); c.quadraticCurveTo(0, -8, 9, 2); c.stroke();
      c.lineWidth = 2.5; c.beginPath(); c.moveTo(side * 9, 2); c.lineTo(side * 13, -2); c.stroke();
    } else if (expr === 'ouch') {                    // squeezed shut
      c.lineWidth = 3.5; c.beginPath(); c.moveTo(-side * 8, -5); c.lineTo(side * 6, 0); c.lineTo(-side * 8, 5); c.stroke();
    } else {
      const open = expr === 'wow' ? 1.25 : expr === 'smirk' ? 0.7 : expr === 'angry' ? 0.75 : 1;
      c.beginPath(); c.moveTo(-10, 1); c.quadraticCurveTo(0, -10 * open, 10, 0); c.quadraticCurveTo(0, 8 * open, -10, 1); c.closePath();
      c.fillStyle = '#fffaf0'; c.fill();
      c.save(); c.clip();
      const lx = expr === 'smirk' ? side * 1.5 + 1.5 : 0;
      c.fillStyle = W.eye; c.beginPath(); c.arc(lx, 0, 6.2, 0, TAU); c.fill();
      c.fillStyle = INK; c.beginPath(); c.arc(lx, 0, expr === 'wow' ? 2.2 : 3.2, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(lx - 2.2, -2.4, 1.7, 0, TAU); c.fill();
      c.restore();
      c.lineWidth = 3.4; c.beginPath(); c.moveTo(-10.5, 1.5); c.quadraticCurveTo(0, -10.5 * open, 10.5, 0); c.stroke();     // heavy upper lid
      c.lineWidth = 2.6; c.beginPath(); c.moveTo(side * 9.5, -1); c.lineTo(side * 15, -6); c.stroke();                       // lash wing
      c.lineWidth = 1.3; c.beginPath(); c.moveTo(-8, 3); c.quadraticCurveTo(0, 8 * open, 9, 1.5); c.stroke();
    }
    c.restore();
  }
  function brow(c, x, side, expr, col) {
    let a = 0, dy = 0;
    if (expr === 'angry') { a = 0.38; dy = 3; } else if (expr === 'ouch') { a = -0.3; dy = -1; } else if (expr === 'wow') dy = -5;
    else if (expr === 'smirk') { if (side > 0) dy = -5; else { a = 0.15; dy = 1; } } else if (expr === 'grin') dy = -2;
    c.save(); c.translate(x, -14 + dy); c.rotate(-side * a);
    c.strokeStyle = col; c.lineWidth = 3.6; c.beginPath(); c.moveTo(-side * 9, 1); c.quadraticCurveTo(0, -4, side * 10, 0); c.stroke();
    c.restore(); c.strokeStyle = INK;
  }
  function mouth(c, W, expr) {
    c.save(); c.translate(0, 27);
    if (expr === 'grin') {
      c.beginPath(); c.moveTo(-13, -3); c.quadraticCurveTo(0, 1, 13, -3); c.quadraticCurveTo(0, 17, -13, -3); c.closePath(); fs(c, '#5a1028', 2.6);
      c.save(); c.clip(); c.fillStyle = '#fffaf0'; c.fillRect(-14, -5, 28, 6); c.fillStyle = '#e8607c'; c.beginPath(); c.ellipse(0, 11, 7, 4, 0, 0, TAU); c.fill(); c.restore();
    } else if (expr === 'angry') {
      c.beginPath(); c.moveTo(-11, -3); c.lineTo(11, -4); c.lineTo(9, 5); c.lineTo(-9, 5); c.closePath(); fs(c, '#fffaf0', 2.6);
      c.lineWidth = 1.4; c.beginPath(); c.moveTo(-10, 1); c.lineTo(10, 0.5); for (const x of [-5, 0, 5]) { c.moveTo(x, -3.5); c.lineTo(x, 5); } c.stroke();
    } else if (expr === 'ouch') {
      c.beginPath(); c.moveTo(-10, 0); c.quadraticCurveTo(-5, -6, 0, -2); c.quadraticCurveTo(5, -6, 10, 0); c.quadraticCurveTo(0, 12, -10, 0); c.closePath(); fs(c, '#5a1028', 2.6);
    } else if (expr === 'wow') {
      c.beginPath(); c.ellipse(0, 2, 5.5, 7.5, 0, 0, TAU); fs(c, '#5a1028', 2.6);
    } else if (expr === 'smirk') {
      c.lineWidth = 3; c.strokeStyle = W.lip; c.beginPath(); c.moveTo(-9, 2); c.quadraticCurveTo(2, 5, 12, -5); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(11, -7); c.lineTo(14, -4); c.stroke();
    } else {
      c.fillStyle = W.lip; c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(-4, -4, 0, -1.5); c.quadraticCurveTo(4, -4, 9, 0); c.quadraticCurveTo(0, 8, -9, 0); c.fill();
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(-10, -0.5); c.quadraticCurveTo(0, 3, 10, -0.5); c.stroke();
    }
    c.restore();
  }
  let hairBack = function (c, who, W) {
    if (who === 'roxy') {                            // big wild mane, flicked ends
      c.beginPath(); c.moveTo(-30, -44);
      c.bezierCurveTo(-64, -50, -66, 0, -54, 28); c.lineTo(-66, 44); c.lineTo(-48, 46); c.lineTo(-52, 66); c.lineTo(-34, 56);
      c.lineTo(34, 60); c.lineTo(56, 74); c.lineTo(50, 52); c.lineTo(70, 50); c.lineTo(56, 30);
      c.bezierCurveTo(70, -6, 62, -56, 22, -58); c.bezierCurveTo(0, -64, -20, -56, -30, -44); c.closePath(); fs(c, W.hairDk, 3.4);
    } else {                                         // bob with two high buns
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 33, -47, 17, 0, TAU); fs(c, W.hair, 3.4); c.lineWidth = 2; c.strokeStyle = W.hairDk; c.beginPath(); c.arc(s * 33, -47, 9, 0.4, 3.6); c.stroke(); c.strokeStyle = INK; }
      c.beginPath(); c.moveTo(-40, -30); c.bezierCurveTo(-50, 0, -46, 30, -40, 46); c.lineTo(-22, 40); c.lineTo(22, 40); c.lineTo(40, 46);
      c.bezierCurveTo(46, 30, 50, 0, 40, -30); c.closePath(); fs(c, W.hairDk, 3.4);
    }
  };
  function hairFront(c, who, W) {
    if (who === 'roxy') {
      c.beginPath(); c.moveTo(-36, -8); c.bezierCurveTo(-42, -52, 0, -62, 30, -50); c.bezierCurveTo(44, -40, 42, -16, 38, 6);
      c.bezierCurveTo(34, -10, 30, -22, 18, -30); c.bezierCurveTo(8, -18, -14, -14, -24, -22); c.bezierCurveTo(-30, -18, -34, -14, -36, -8); c.closePath(); fs(c, W.hair, 3.2);
      c.strokeStyle = W.hairHi; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-22, -40); c.quadraticCurveTo(-4, -52, 18, -44); c.stroke(); c.strokeStyle = INK;
      // goggles pushed up on the forehead
      c.lineWidth = 6; c.strokeStyle = '#2a2630'; c.beginPath(); c.moveTo(-38, -32); c.quadraticCurveTo(0, -46, 38, -32); c.stroke(); c.strokeStyle = INK;
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 15, -40, 12, 8.5, s * 0.12, 0, TAU); fs(c, '#6b6570', 3); c.beginPath(); c.ellipse(s * 15, -40, 8, 5.3, s * 0.12, 0, TAU); fs(c, '#ffb040', 2); c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(s * 15 - 3, -42, 2.6, 1.4, -0.5, 0, TAU); c.fill(); }
    } else {
      c.beginPath(); c.moveTo(-38, 14); c.bezierCurveTo(-44, -46, -14, -56, 0, -56); c.bezierCurveTo(14, -56, 44, -46, 38, 14);
      c.lineTo(31, 10); c.lineTo(31, -14); c.lineTo(22, -19); c.lineTo(15, -13); c.lineTo(6, -20); c.lineTo(-3, -13); c.lineTo(-12, -20); c.lineTo(-21, -13); c.lineTo(-31, -18); c.lineTo(-31, 10); c.closePath(); fs(c, W.hair, 3.2);
      c.strokeStyle = W.hairHi; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-22, -38); c.quadraticCurveTo(0, -48, 22, -38); c.stroke(); c.strokeStyle = INK;
      if (who !== 'vee') return;
      // headset: band, ear cup, mic boom
      c.lineWidth = 5; c.strokeStyle = '#2a2630'; c.beginPath(); c.moveTo(-40, -6); c.bezierCurveTo(-44, -66, 44, -66, 40, -6); c.stroke(); c.strokeStyle = INK;
      c.beginPath(); c.ellipse(-39, 2, 8, 12, 0, 0, TAU); fs(c, '#3a3642', 3); c.beginPath(); c.ellipse(-39, 2, 3.5, 6, 0, 0, TAU); fs(c, W.accent, 1.5);
      c.lineWidth = 2.6; c.beginPath(); c.moveTo(-38, 13); c.quadraticCurveTo(-34, 32, -16, 31); c.stroke(); c.beginPath(); c.arc(-14, 31, 3.6, 0, TAU); fs(c, '#3a3642', 2);
    }
  }
  function head(c, who, expr = 'neutral') {
    const W = WHO[who]; S(c);
    hairBack(c, who, W);
    c.beginPath(); c.moveTo(-34, -10); c.bezierCurveTo(-36, -52, 36, -52, 34, -10); c.bezierCurveTo(34, 18, 17, 39, 0, 44); c.bezierCurveTo(-17, 39, -34, 18, -34, -10); c.closePath(); fs(c, W.skin, 3.4);
    c.save(); c.clip();
    c.fillStyle = W.skinSh; c.globalAlpha = 0.5; c.beginPath(); c.ellipse(26, 26, 20, 26, 0.5, 0, TAU); c.fill(); c.globalAlpha = 1;
    c.fillStyle = 'rgba(240,80,90,.3)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 21, 13, 8, 4.5, 0, 0, TAU); c.fill(); }
    if (who === 'vee') { c.fillStyle = W.accent; c.globalAlpha = 0.9; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 10, 10); c.lineTo(s * 30, 6); c.lineTo(s * 30, 11); c.lineTo(s * 10, 13); c.fill(); } c.globalAlpha = 1; }
    if (who === 'roxy') { c.fillStyle = W.skinSh; for (const [x, y] of [[-20, 9], [-15, 12], [-24, 13], [16, 10], [21, 13], [25, 9]]) { c.beginPath(); c.arc(x, y, 1.2, 0, TAU); c.fill(); } }
    c.restore();
    eye(c, W, -15, -1, expr); eye(c, W, 15, 1, expr);
    brow(c, -15, -1, expr, W.hairDk); brow(c, 15, 1, expr, W.hairDk);
    c.lineWidth = 1.8; c.beginPath(); c.moveTo(1, 9); c.quadraticCurveTo(4, 15, 0, 16); c.stroke();
    mouth(c, W, expr);
    if (who === 'roxy') { c.save(); c.translate(23, 20); c.rotate(-0.5); c.fillStyle = '#f2e2c8'; c.beginPath(); c.rect(-7, -3, 14, 6); c.fill(); c.lineWidth = 1.4; c.stroke(); c.restore(); }
    hairFront(c, who, W);
  }

  // ---- bust portrait in a 200 x 200 box ----
  function bust(c, who, expr = 'neutral') {
    const W = WHO[who]; S(c);
    c.save(); c.translate(100, 92);
    // shoulders + chest
    c.beginPath(); c.moveTo(-13, 34); c.lineTo(-14, 56); c.bezierCurveTo(-40, 60, -70, 68, -78, 112); c.lineTo(78, 112); c.bezierCurveTo(70, 68, 40, 60, 14, 56); c.lineTo(13, 34); c.closePath(); fs(c, W.skin, 3.4);
    c.fillStyle = W.skinSh; c.globalAlpha = 0.55; c.beginPath(); c.moveTo(-13, 44); c.quadraticCurveTo(0, 54, 13, 44); c.lineTo(13, 52); c.quadraticCurveTo(0, 60, -13, 52); c.fill(); c.globalAlpha = 1;
    if (who === 'roxy') {
      c.beginPath(); c.moveTo(-36, 112); c.bezierCurveTo(-38, 88, -22, 80, 0, 92); c.bezierCurveTo(22, 80, 38, 88, 36, 112); c.closePath(); fs(c, W.top, 3);          // bandeau
      c.lineWidth = 2; c.beginPath(); c.moveTo(0, 92); c.lineTo(0, 112); c.stroke();
      for (const s of [-1, 1]) {                                            // open leather jacket, spiked shoulders
        c.beginPath(); c.moveTo(s * 16, 57); c.bezierCurveTo(s * 44, 60, s * 74, 66, s * 84, 112); c.lineTo(s * 40, 112); c.bezierCurveTo(s * 44, 90, s * 34, 72, s * 16, 57); c.closePath(); fs(c, W.jacket, 3.2);
        c.beginPath(); c.moveTo(s * 20, 60); c.lineTo(s * 40, 82); c.lineTo(s * 30, 86); c.closePath(); fs(c, W.jacketHi, 2.2);
        for (let i = 0; i < 3; i++) { const x = s * (50 + i * 10), y = 68 + i * 7; c.beginPath(); c.moveTo(x - 4, y + 3); c.lineTo(x + s * 2, y - 11); c.lineTo(x + 5, y + 4); c.closePath(); fs(c, '#c9c4cf', 2); }
      }
      c.lineWidth = 6; c.strokeStyle = '#1b1421'; c.beginPath(); c.moveTo(-13, 46); c.quadraticCurveTo(0, 54, 13, 46); c.stroke(); c.strokeStyle = INK;         // choker
      c.beginPath(); c.arc(0, 53, 3.4, 0, TAU); fs(c, W.accent, 1.6);
    } else {
      c.beginPath(); c.moveTo(-30, 62); c.lineTo(-22, 60); c.bezierCurveTo(-18, 84, 18, 84, 22, 60); c.lineTo(30, 62); c.bezierCurveTo(42, 80, 44, 96, 44, 112); c.lineTo(-44, 112); c.bezierCurveTo(-44, 96, -42, 80, -30, 62); c.closePath(); fs(c, W.top, 3);   // tank top
      c.lineWidth = 2; c.beginPath(); c.moveTo(0, 82); c.quadraticCurveTo(-2, 96, 0, 112); c.stroke();
      c.save(); c.beginPath(); c.moveTo(-52, 62); c.lineTo(-36, 58); c.lineTo(50, 112); c.lineTo(26, 112); c.closePath(); fs(c, '#5a4030', 3); c.restore();        // bandolier
      for (let i = 0; i < 5; i++) { const x = -34 + i * 15, y = 68 + i * 9.6; c.save(); c.translate(x, y); c.rotate(-0.55); c.beginPath(); c.rect(-3, -8, 6, 14); fs(c, '#e8b83a', 1.8); c.restore(); }
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(-12, 50); c.lineTo(0, 76); c.lineTo(12, 50); c.stroke(); c.beginPath(); c.rect(-4, 74, 8, 11); fs(c, '#c9c4cf', 1.6);   // dog tag
      c.fillStyle = W.accent; c.beginPath(); c.moveTo(56, 78); c.lineTo(66, 84); c.lineTo(60, 96); c.lineTo(52, 88); c.fill(); c.lineWidth = 1.6; c.stroke();          // shoulder tattoo
    }
    head(c, who, expr);
    c.restore();
  }

  // ---- full figure, feet at (0,0), about 330 tall. pose: { aL, aR: [upper, fore] radians from straight down (+ = outward), fL, fR: foot x, held(c, hx, hy) } ----
  function limb(c, pts, w, col) {
    c.strokeStyle = INK; c.lineWidth = w + 5; c.beginPath(); pts.forEach((p, i) => c[i ? 'lineTo' : 'moveTo'](p[0], p[1])); c.stroke();
    c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.strokeStyle = INK;
  }
  function armPts(side, [a1, a2]) {
    const sx = side * 29, sy = -250, ex = sx + side * Math.sin(a1) * 44, ey = sy + Math.cos(a1) * 44;
    return [[sx, sy], [ex, ey], [ex + side * Math.sin(a2) * 42, ey + Math.cos(a2) * 42]];
  }
  function figure(c, who, pose: any = {}, expr = 'neutral') {
    const W = WHO[who], P: any = { aL: [0.15, 0.1], aR: [0.15, 0.1], fL: -16, fR: 16, ...pose }; S(c);
    const legs = who === 'roxy' ? W.skin : W.jacket, boot = who === 'roxy' ? '#221e28' : '#3a2c22';
    const arm = (side, a) => {
      const p = armPts(side, a);
      limb(c, [p[0], p[1]], 13, who === 'roxy' ? W.jacket : W.skin); limb(c, [p[1], p[2]], 11, who === 'roxy' ? W.jacket : W.skin);
      c.beginPath(); c.arc(p[2][0], p[2][1], 7.5, 0, TAU); fs(c, who === 'roxy' ? W.skin : '#2a2630', 2.6);
      return p[2];
    };
    const leg = (side, fx) => {
      const hip = [side * 13, -160], knee = [side * 13 * 0.4 + fx * 0.6, -84], ank = [fx, -14];
      limb(c, [hip, knee], 21, legs); limb(c, [knee, ank], 14, who === 'roxy' ? W.skin : legs);
      const bt = who === 'roxy' ? 0.15 : 0.55, bx = knee[0] + (ank[0] - knee[0]) * bt, by = knee[1] + (ank[1] - knee[1]) * bt;
      limb(c, [who === 'roxy' ? [knee[0] + (hip[0] - knee[0]) * 0.3, knee[1] + (hip[1] - knee[1]) * 0.3] : [bx, by], ank], who === 'roxy' ? 16 : 16, boot);
      if (who === 'roxy') limb(c, [[bx, by], ank], 15, boot);
      c.beginPath(); c.moveTo(fx - 9, -16); c.lineTo(fx + side * 20, -8); c.lineTo(fx + side * 20, 0); c.lineTo(fx - 10, 0); c.closePath(); fs(c, boot, 3);
    };
    const back = P.back === 'L' ? -1 : 1;
    c.save(); c.translate(0, -292); c.scale(0.5, 0.5); hairBack(c, who, W); c.restore();
    const hBack = arm(back, back < 0 ? P.aL : P.aR);
    leg(-1, P.fL); leg(1, P.fR);
    // torso: hourglass
    c.beginPath(); c.moveTo(-9, -272); c.lineTo(-9, -260); c.bezierCurveTo(-24, -258, -32, -254, -30, -244); c.bezierCurveTo(-27, -226, -16, -212, -15, -196);
    c.bezierCurveTo(-16, -184, -29, -176, -28, -160); c.lineTo(-22, -146); c.lineTo(22, -146); c.lineTo(28, -160);
    c.bezierCurveTo(29, -176, 16, -184, 15, -196); c.bezierCurveTo(16, -212, 27, -226, 30, -244); c.bezierCurveTo(32, -254, 24, -258, 9, -260); c.lineTo(9, -272); c.closePath(); fs(c, W.skin, 3.2);
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -206); c.lineTo(0, -186); c.stroke(); c.beginPath(); c.arc(0, -182, 1.6, 0, TAU); c.stroke();
    // shorts / low-rise trousers
    c.beginPath(); c.moveTo(-26, -172); c.quadraticCurveTo(0, -164, 26, -172); c.lineTo(29, -158); c.lineTo(24, -142); c.lineTo(4, -142); c.lineTo(0, -150); c.lineTo(-4, -142); c.lineTo(-24, -142); c.lineTo(-29, -158); c.closePath(); fs(c, who === 'roxy' ? '#221e28' : W.jacket, 3);
    c.lineWidth = 4; c.strokeStyle = who === 'roxy' ? W.accent : '#5a4030'; c.beginPath(); c.moveTo(-26, -170); c.quadraticCurveTo(0, -162, 26, -170); c.stroke(); c.strokeStyle = INK;
    c.beginPath(); c.rect(-5, -171, 10, 8); fs(c, '#c9c4cf', 2);
    // top
    c.beginPath(); c.moveTo(-28, -246); c.bezierCurveTo(-30, -222, -14, -212, 0, -220); c.bezierCurveTo(14, -212, 30, -222, 28, -246); c.quadraticCurveTo(14, -236, 0, -240); c.quadraticCurveTo(-14, -236, -28, -246); c.closePath(); fs(c, W.top, 3);
    c.lineWidth = 2; c.beginPath(); c.moveTo(0, -240); c.lineTo(0, -220); c.stroke();
    if (who === 'vee') {
      c.lineWidth = 3; c.strokeStyle = W.top; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 20, -242); c.lineTo(s * 12, -260); c.stroke(); } c.strokeStyle = INK;
      c.beginPath(); c.moveTo(-28, -256); c.lineTo(-18, -260); c.lineTo(26, -178); c.lineTo(15, -174); c.closePath(); fs(c, '#5a4030', 2.6);
      for (let i = 0; i < 5; i++) { c.save(); c.translate(-17 + i * 8.6, -246 + i * 15.5); c.rotate(-0.5); c.beginPath(); c.rect(-2, -5, 4, 9); fs(c, '#e8b83a', 1.4); c.restore(); }
      c.beginPath(); c.rect(-34, -150, 12, 26); fs(c, '#5a4030', 2.4);                                       // thigh holster
    } else {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 10, -260); c.bezierCurveTo(s * 26, -260, s * 36, -254, s * 33, -240); c.lineTo(s * 29, -214); c.lineTo(s * 21, -216); c.bezierCurveTo(s * 26, -236, s * 22, -250, s * 10, -260); c.closePath(); fs(c, W.jacket, 2.8);
        for (let i = 0; i < 2; i++) { const x = s * (22 + i * 8), y = -258 + i * 4; c.beginPath(); c.moveTo(x - 3, y + 2); c.lineTo(x + s * 2, y - 9); c.lineTo(x + 4, y + 3); c.closePath(); fs(c, '#c9c4cf', 1.6); } }
      c.lineWidth = 4; c.strokeStyle = '#1b1421'; c.beginPath(); c.moveTo(-9, -266); c.lineTo(9, -266); c.stroke(); c.strokeStyle = INK;
    }
    c.save(); c.translate(0, -292); c.scale(0.5, 0.5);
    // head without redrawing the back hair
    const hb = hairBackSkip; hairBackSkip = true; head(c, who, expr); hairBackSkip = hb; c.restore();
    const hFront = arm(-back, back < 0 ? P.aR : P.aL);
    if (P.held) P.held(c, hFront, hBack);
  }
  let hairBackSkip = false;
  const _hairBack = hairBack;
  hairBack = function (c, who, W) { if (!hairBackSkip) _hairBack(c, who, W); };

  // ---- side-view wasteland buggy for the comic, wheels on y = 0, about 330 long, nose to the right ----
  function buggy(c, crew = false, shakeY = 0) {
    S(c); c.save(); c.translate(0, shakeY);
    const rust = '#8a4a26', rustDk = '#5e2f18', steel = '#8f8a86', blk = '#2b282e';
    // exhaust stacks
    for (let i = 0; i < 3; i++) { c.save(); c.translate(52 + i * 13, -78); c.rotate(-0.35); c.beginPath(); c.rect(-4, -44, 8, 46); fs(c, steel, 3); c.restore(); }
    // roll cage
    c.lineWidth = 9; c.strokeStyle = INK; c.beginPath(); c.moveTo(-96, -74); c.lineTo(-86, -138); c.lineTo(8, -138); c.lineTo(30, -80); c.moveTo(-40, -138); c.lineTo(-40, -76); c.stroke();
    c.lineWidth = 4.5; c.strokeStyle = blk; c.stroke(); c.strokeStyle = INK;
    if (crew) {
      c.save(); c.translate(-6, -108); c.scale(0.3, 0.3); head(c, 'roxy', 'grin'); c.restore();
      c.save(); c.translate(-64, -150); c.scale(0.3, 0.3); head(c, 'vee', 'smirk'); c.restore();
    }
    // gun on the cage
    c.beginPath(); c.rect(-58, -150, 86, 9); fs(c, blk, 3); c.beginPath(); c.rect(-52, -156, 30, 20); fs(c, steel, 3); c.beginPath(); c.rect(24, -153, 12, 15); fs(c, blk, 3);
    // body
    c.beginPath(); c.moveTo(-150, -44); c.lineTo(-156, -84); c.lineTo(-104, -92); c.lineTo(-96, -74); c.lineTo(30, -80); c.lineTo(50, -84); c.lineTo(138, -74); c.lineTo(160, -58); c.lineTo(160, -36); c.lineTo(120, -30); c.lineTo(-130, -30); c.closePath(); fs(c, rust, 4);
    c.fillStyle = rustDk; c.beginPath(); c.moveTo(-90, -70); c.lineTo(24, -76); c.lineTo(20, -40); c.lineTo(-86, -40); c.closePath(); c.fill(); c.lineWidth = 2.5; c.stroke();
    c.fillStyle = steel; for (const [x, y] of [[-80, -64], [14, -68], [-80, -46], [14, -46]]) { c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill(); }
    // blower through the hood
    c.beginPath(); c.rect(66, -106, 44, 24); fs(c, steel, 3.4); c.beginPath(); c.moveTo(62, -106); c.lineTo(72, -122); c.lineTo(112, -122); c.lineTo(116, -106); c.closePath(); fs(c, blk, 3.4);
    // fuel drums on the tail
    for (const x of [-146, -124]) { c.beginPath(); c.rect(x, -118, 20, 30); fs(c, '#9a2f22', 3); c.lineWidth = 2; c.beginPath(); c.moveTo(x, -108); c.lineTo(x + 20, -108); c.moveTo(x, -98); c.lineTo(x + 20, -98); c.stroke(); }
    // plow + spikes
    c.beginPath(); c.moveTo(158, -66); c.lineTo(186, -40); c.lineTo(186, -14); c.lineTo(160, -24); c.closePath(); fs(c, blk, 4);
    for (const y of [-52, -38, -24]) { c.beginPath(); c.moveTo(180, y - 5); c.lineTo(202, y); c.lineTo(180, y + 6); c.closePath(); fs(c, steel, 2.4); }
    // wheels
    for (const [x, r] of [[-98, 44], [104, 34]]) {
      c.beginPath(); c.arc(x, -r, r, 0, TAU); fs(c, '#1d1b20', 4.5);
      c.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.beginPath(); c.moveTo(x + Math.cos(a) * (r - 7), -r + Math.sin(a) * (r - 7)); c.lineTo(x + Math.cos(a) * r, -r + Math.sin(a) * r); c.stroke(); }
      c.beginPath(); c.arc(x, -r, r * 0.45, 0, TAU); fs(c, steel, 3.4);
      c.beginPath(); c.moveTo(x - 6, -r + 4); c.lineTo(x, -r - 12); c.lineTo(x + 6, -r + 4); c.closePath(); fs(c, '#c9c4cf', 2.4);
    }
    c.restore();
  }

  // ---- intro comic ----
  function sky(c, w, h, top, mid, low) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, low); c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function dunes(c, w, h, y, col, seed) {
    c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) c.lineTo(x, y + Math.sin(x * 0.011 + seed) * 16 + Math.sin(x * 0.031 + seed * 2) * 7);
    c.lineTo(w, h); c.fill();
  }
  function balloon(c, x, y, lines, tail, size = 22) {
    c.font = `800 ${size}px "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.max(...lines.map(l => c.measureText(l).width)) + 56, h = lines.length * (size + 5) + 34;
    S(c); c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, TAU);
    c.fillStyle = '#fffdf4'; c.fill(); c.lineWidth = 3.4; c.stroke();
    if (tail) { c.beginPath(); c.moveTo(x + tail[0] * 0.25 - 10, y + h / 2 - 5); c.lineTo(x + tail[0], y + h / 2 + tail[1]); c.lineTo(x + tail[0] * 0.25 + 12, y + h / 2 - 6); c.fillStyle = '#fffdf4'; c.fill(); c.stroke();
      c.fillStyle = '#fffdf4'; c.beginPath(); c.ellipse(x, y, w / 2 - 2, h / 2 - 2, 0, 0, TAU); c.fill(); }
    c.fillStyle = INK; lines.forEach((l, i) => c.fillText(l, x, y + (i - (lines.length - 1) / 2) * (size + 5)));
  }
  function caption(c, x, y, text, w?) {
    c.font = '700 17px "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    const tw = w || c.measureText(text).width + 22; S(c); c.beginPath(); c.rect(x, y, tw, 32); c.fillStyle = '#ffd95a'; c.fill(); c.lineWidth = 3; c.stroke();
    c.fillStyle = INK; c.fillText(text, x + 11, y + 17);
  }
  const keys = (c, h) => { S(c); c.lineWidth = 3; c.beginPath(); c.arc(h[0], h[1] - 14, 9, 0, TAU); c.stroke(); c.save(); c.translate(h[0] + 6, h[1] - 20); c.rotate(0.6); c.beginPath(); c.rect(-3, -22, 6, 20); fs(c, '#e8b83a', 2); c.beginPath(); c.rect(3, -20, 5, 4); c.rect(3, -12, 5, 4); fs(c, '#e8b83a', 1.6); c.restore(); };
  const bigGun = (c, h) => { S(c); c.save(); c.translate(h[0] + 6, h[1] + 4); c.rotate(-1.0); c.beginPath(); c.rect(-70, -11, 150, 20); fs(c, '#3a3642', 3.2); c.beginPath(); c.rect(80, -6, 60, 10); fs(c, '#8f8a86', 3); c.beginPath(); c.rect(134, -9, 14, 16); fs(c, '#2b282e', 3);
    c.beginPath(); c.rect(-20, 9, 26, 26); fs(c, '#6f7a45', 3); c.beginPath(); c.rect(-92, -8, 24, 26); fs(c, '#5a4030', 3); c.restore(); };
  const PANELS = [
    (c, w, h) => {                                   // 1: establishing shot
      sky(c, w, h, '#3b2a55', '#e2603e', '#ffc46a');
      c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(w * 0.74, h * 0.5, 46, 0, TAU); c.fill();
      dunes(c, w, h, h * 0.6, '#b0502e', 1); dunes(c, w, h, h * 0.72, '#7a3422', 3); dunes(c, w, h, h * 0.86, '#3c1c1c', 5);
      c.save(); c.translate(w * 0.64, h * 0.9); c.scale(0.78, 0.78); buggy(c); c.restore();
      c.save(); c.translate(w * 0.17, h * 0.97); c.scale(0.74, 0.74); figure(c, 'roxy', { aL: [0.2, 0.2], aR: [0.5, 1.9], fL: -22, fR: 14, held: keys }, 'smirk'); c.restore();
      c.save(); c.translate(w * 0.34, h * 0.98); c.scale(0.74, 0.74); figure(c, 'vee', { aL: [0.3, -0.2], aR: [0.2, 0.3], fL: -12, fR: 24 }, 'neutral'); c.restore();
      caption(c, 14, 14, 'The wasteland. Everything here bites.');
    },
    (c, w, h) => {                                   // 2: Roxy
      sky(c, w, h, '#ff9a4a', '#ffc46a', '#ffe2a0');
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 10; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.beginPath(); c.moveTo(w * 0.42 + Math.cos(a) * 150, h * 0.5 + Math.sin(a) * 150); c.lineTo(w * 0.42 + Math.cos(a) * 700, h * 0.5 + Math.sin(a) * 700); c.stroke(); }
      c.save(); c.translate(w * 0.36, h * 1.74); c.scale(1.85, 1.85); figure(c, 'roxy', { aL: [0.5, 2.5], aR: [0.35, -0.5], back: 'R', held: keys }, 'smirk'); c.restore();
      balloon(c, w * 0.8, h * 0.2, ['I drive.'], [-60, 36], 28);
      caption(c, w - 262, h - 46, 'ROXY — wheels, bad ideas');
    },
    (c, w, h) => {                                   // 3: Vee
      sky(c, w, h, '#2a8f9a', '#5fd0c8', '#c8f5e6');
      c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 10; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2; c.beginPath(); c.moveTo(w * 0.6 + Math.cos(a) * 150, h * 0.5 + Math.sin(a) * 150); c.lineTo(w * 0.6 + Math.cos(a) * 700, h * 0.5 + Math.sin(a) * 700); c.stroke(); }
      c.save(); c.translate(w * 0.66, h * 1.74); c.scale(1.85, 1.85); figure(c, 'vee', { aL: [0.5, -0.5], aR: [1.0, 2.3], back: 'L', held: bigGun }, 'grin'); c.restore();
      balloon(c, w * 0.23, h * 0.22, ['I shoot.', 'And navigate.'], [70, 40], 24);
      caption(c, 14, h - 46, 'VEE — guns, maps, opinions');
    },
    (c, w, h) => {                                   // 4: off they go
      sky(c, w, h, '#3b2a55', '#e2603e', '#ffc46a');
      dunes(c, w, h, h * 0.62, '#b0502e', 2); dunes(c, w, h, h * 0.8, '#5a2820', 4);
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 5; for (let i = 0; i < 7; i++) { const y = h * (0.3 + i * 0.09); c.beginPath(); c.moveTo(10 + (i % 3) * 30, y); c.lineTo(110 + (i % 2) * 60, y); c.stroke(); }
      for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(240,200,160,${0.75 - i * 0.08})`; c.beginPath(); c.arc(w * 0.3 - i * 34, h * 0.86 - (i % 2) * 14, 26 + i * 5, 0, TAU); c.fill(); }
      c.save(); c.translate(w * 0.58, h * 0.9); c.rotate(-0.05); c.scale(1.02, 1.02); buggy(c, true); c.restore();
      c.save(); c.translate(w * 0.27, h * 0.2); c.rotate(-0.12); c.font = '900 50px Impact, "Arial Black", system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 9; c.strokeStyle = INK; c.lineJoin = 'round'; c.strokeText('VRRROOOM!', 0, 0); c.fillStyle = '#ffd95a'; c.fillText('VRRROOOM!', 0, 0); c.restore();
      caption(c, w - 250, h - 46, 'Time to bite back.');
    },
  ];
  function panel(i, w = 640, h = 400) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip(); PANELS[i](c, w, h); c.restore();
    return cv;
  }
  const cache = {};
  function portrait(who, expr) {                     // cached 200px bust on the character's colour
    const k = who + expr; if (cache[k]) return cache[k];
    const cv = document.createElement('canvas'); cv.width = cv.height = 200; const c = cv.getContext('2d');
    const g = c.createRadialGradient(100, 80, 10, 100, 100, 130); g.addColorStop(0, who === 'roxy' ? '#ffb066' : '#7fe8dc'); g.addColorStop(1, who === 'roxy' ? '#b8402a' : '#1f7f8a');
    c.fillStyle = g; c.fillRect(0, 0, 200, 200); bust(c, who, expr);
    return cache[k] = cv.toDataURL();
  }
  return { WHO, head, bust, figure, buggy, panel, portrait, PANELS };
})();

// ---------- crew chatter: emote bubbles from the two of them, triggered by what happens in the game ----------
export function createCrew() {
  const crewEl = document.getElementById('crew');
  const BANTER = {
    start:    [[['roxy', 'grin', '🔥', 'Buckle up!'], ['vee', 'smirk', '🎯', 'Guns are hot.']],
               [['vee', 'neutral', '🗺️', 'Map says: trouble everywhere.'], ['roxy', 'smirk', '😏', 'My favourite direction.']]],
    wave:     [[['vee', 'wow', '👀', 'Contacts! Lots of them!'], ['roxy', 'grin', '😈', 'More speed bumps.']],
               [['vee', 'angry', '📡', 'Incoming, all sides!'], ['roxy', 'smirk', '🛞', 'Then we drive in circles.']],
               [['roxy', 'wow', '😳', 'Uh, Vee?'], ['vee', 'grin', '💜', 'I see them. Hold steady.']]],
    hurt:     [[['roxy', 'ouch', '💢', 'Hey! Watch the paint!'], ['vee', 'smirk', '🙄', 'What paint?']],
               [['vee', 'ouch', '😵', 'Drive straighter!'], ['roxy', 'angry', '😤', 'Shoot faster!']],
               [['roxy', 'angry', '🤬', 'That one bit the bumper!']]],
    lowhp:    [[['vee', 'wow', '🛢️', 'We are leaking. Everything.'], ['roxy', 'ouch', '😬', 'It adds character.']],
               [['roxy', 'ouch', '🚨', "She won't take much more!"], ['vee', 'angry', '🔧', 'Then stop getting hit!']]],
    streak:   [[['vee', 'grin', '😎', 'Did you see that?!'], ['roxy', 'smirk', '👀', 'Eyes on the road, sorry.']],
               [['vee', 'grin', '💥', 'Five in a row!'], ['roxy', 'grin', '👏', 'Show-off.']],
               [['roxy', 'grin', '🤘', 'Paint the desert!']]],
    elite:    [[['vee', 'grin', '✨', 'Shiny one down!'], ['roxy', 'wow', '🎁', 'Dibs on the loot.']]],
    weapon:   [[['vee', 'wow', '😍', 'New toy! Mine!'], ['roxy', 'smirk', '🙃', 'Try not to shoot the hood.']],
               [['vee', 'grin', '💜', 'Oh, I like this one.']]],
    ability:  [[['roxy', 'wow', '🔩', 'Ooh, bolt it on!'], ['vee', 'neutral', '📖', 'No manual. Classic.']],
               [['roxy', 'grin', '🛠️', 'Upgrade time!']]],
    burrow:   [[['roxy', 'grin', '🕳️', 'Going down!'], ['vee', 'ouch', '😖', 'I hate this part.']],
               [['vee', 'ouch', '🪱', 'Dirt in my hair. Again.']]],
    jump:     [[['roxy', 'grin', '🦘', 'Wheee!'], ['vee', 'wow', '😱', 'Warn me first!']],
               [['roxy', 'grin', '🚀', 'Hold on!']]],
    smash:    [[['roxy', 'grin', '🧱', 'Shortcut!'], ['vee', 'ouch', '🤕', 'That was a wall.']],
               [['roxy', 'smirk', '💪', 'Was that load-bearing?']],
               [['vee', 'grin', '🎳', 'Strike!']]],
    chub:     [[['vee', 'wow', '🥺', "It's so fluffy!"], ['roxy', 'smirk', '🛒', 'It is cargo. Fluffy cargo.']],
               [['roxy', 'grin', '💙', 'All aboard, blue thing!']],
               [['vee', 'grin', '🫶', 'Got you, little guy.']]],
    lost:     [[['vee', 'wow', '😱', 'We dropped one!'], ['roxy', 'ouch', '😬', 'It bounced. It is fine.']],
               [['vee', 'angry', '🛒', 'Easy on the turns!'], ['roxy', 'smirk', '🙃', 'No.']]],
    eaten:    [[['vee', 'ouch', '😢', 'They got a little guy...'], ['roxy', 'angry', '😠', 'Payback time.']],
               [['roxy', 'angry', '🤬', 'Hey! That one was ours!']]],
    offer:    [[['vee', 'wow', '😨', 'Wait, we are FEEDING them to it?'], ['roxy', 'smirk', '🤷', 'Gate fee.']],
               [['roxy', 'neutral', '🫡', 'Thank you for your service, blue thing.']]],
    altar:    [[['vee', 'neutral', '🔮', 'The altar is humming.'], ['roxy', 'grin', '🚪', 'One step closer to the gate.']]],
    gate:     [[['vee', 'wow', '🚪', 'The gate is open!'], ['roxy', 'grin', '😈', 'Knock knock, pyramid.']]],
    dig:      [[['vee', 'wow', '⛏️', "They're digging us out!"], ['roxy', 'angry', '😤', 'Rude.']]],
    eshot:    [[['vee', 'wow', '❓', 'Since when do crates SHOOT?!'], ['roxy', 'smirk', '🤷', 'Since today, apparently.']],
               [['roxy', 'angry', '🎯', 'They spit now. Great.']]],
    boss:     [[['vee', 'wow', '🔺', 'That is a very large pyramid.'], ['roxy', 'smirk', '😏', 'Bigger target.']]],
    bossdead: [[['roxy', 'grin', '🎉', 'Flattened!'], ['vee', 'grin', '🏆', 'Mark the map: OURS.']]],
    dead:     [[['vee', 'ouch', '💀', 'I said left. LEFT.']]],
    respawn:  [[['roxy', 'smirk', '🙈', 'We never speak of that.'], ['vee', 'smirk', '🤐', 'Speak of what?']]],
    idle:     [[['vee', 'neutral', '🥱', 'Quiet out here.'], ['roxy', 'smirk', '🤫', "Don't jinx it."]],
               [['roxy', 'neutral', '🎶', 'Got any music?'], ['vee', 'smirk', '📻', 'Only engine noise.']],
               [['vee', 'neutral', '🧭', 'Technically, we are lost.'], ['roxy', 'grin', '😌', 'Technically, we are exploring.']]],
  };
  const BANTER_CD = { offer: 30, chub: 14, lost: 12, eaten: 16, smash: 12, hurt: 10, lowhp: 20, streak: 14, elite: 8, jump: 25, burrow: 16, eshot: 45, idle: 30, dig: 25, weapon: 6, ability: 6 };
  const crew = { on: false, busy: 0, last: {}, pick: {}, nodes: {}, kills: [], calm: 0 };
  function crewLine(who, expr, emote, text) {
    if (crew.nodes[who]) crew.nodes[who].remove();
    const el = document.createElement('div'); el.className = 'say ' + who;
    el.innerHTML = `<i style="background-image:url(${CrewArt.portrait(who, expr)})"></i><b><em>${emote}</em>${text}</b>`;
    crewEl.appendChild(el); crew.nodes[who] = el;
    setTimeout(() => el.classList.add('out'), 3900);
    setTimeout(() => { el.remove(); if (crew.nodes[who] === el) crew.nodes[who] = null; }, 4300);
  }
  const CHAT_ON = false;                               // top-left banter is parked for now; the crew talks in bubbles over the car
  function crewSay(ev, chance = 1, force = false) {
    if (!CHAT_ON) return;
    const now = performance.now() / 1000;
    if (!crew.on || (!force && now < crew.busy) || now - (crew.last[ev] || -99) < (BANTER_CD[ev] || 4) || Math.random() > chance) return;
    const opts = BANTER[ev]; let i = Math.floor(Math.random() * opts.length);
    if (opts.length > 1 && i === crew.pick[ev]) i = (i + 1) % opts.length;
    crew.pick[ev] = i; crew.last[ev] = now; crew.busy = now + 5.5;
    opts[i].forEach((l, k) => setTimeout(() => crewLine(...(l as [string, string, string, string])), k * 1300));
  }
  function crewKill(elite) {                            // five kills inside four seconds earns a comment
    const now = performance.now() / 1000;
    crew.kills.push(now); while (crew.kills.length && now - crew.kills[0] > 4) crew.kills.shift();
    if (elite) crewSay('elite'); else if (crew.kills.length >= 5) { crew.kills.length = 0; crewSay('streak'); }
  }
  return { crew, crewSay, crewKill };
}
