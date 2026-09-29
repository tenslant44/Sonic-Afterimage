// Procedurally painted, pixel-crisp sprites (cached canvases).
const cache = new Map();

// Create a crisp sprite: paint with vector ops, then threshold alpha and add outline
export function sprite(key, w, h, paint, outline = '#000') {
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  paint(g);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  if (outline) {
    const o = hex(outline);
    const copy = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (copy[i + 3]) continue;
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && copy[(yy * w + xx) * 4 + 3];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255; }
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}
function hex(h) { const c = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); }

// ------------------------------------------------------------------ helpers
const E = (g, x, y, rx, ry, col, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2); g.fill(); };
const C = (g, x, y, r, col) => E(g, x, y, r, r, col);
const Poly = (g, pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };
const Ln = (g, pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

// ------------------------------------------------------------------ hedgehogs
export const PAL = {
  sonic: { b: '#2058e8', bd: '#1234a8', bl: '#5890ff', skin: '#f8c088', skd: '#d08850', shoe: '#e82828', shoed: '#901414', strap: '#f8f8f8', eye: '#ffffff', pupil: '#101830', nose: '#101010', glove: '#ffffff' },
  metal: { b: '#2c4cb0', bd: '#16286a', bl: '#7ea0f0', skin: '#b8c0d0', skd: '#687088', shoe: '#d03030', shoed: '#701818', strap: '#c8c8d8', eye: '#200808', pupil: '#ff2020', nose: '#8890a8', glove: '#c8d0e0', metal: true },
  super: { b: '#f8e040', bd: '#c89010', bl: '#fff8a0', skin: '#f8c088', skd: '#d08850', shoe: '#e82828', shoed: '#901414', strap: '#f8f8f8', eye: '#ffffff', pupil: '#b01010', nose: '#101010', glove: '#ffffff' },
};

function quills(g, hx, hy, P, flare = 0) {
  Poly(g, [hx + 1, hy - 9, hx - 17 - flare, hy - 10, hx - 7, hy - 4, hx - 21 - flare, hy + 1, hx - 7, hy + 3, hx - 16 - flare, hy + 11, hx - 1, hy + 7], P.b);
  Poly(g, [hx - 7, hy - 4, hx - 17 - flare, hy - 10, hx - 5, hy - 7], P.bl);
  Poly(g, [hx - 7, hy + 3, hx - 16 - flare, hy + 11, hx - 4, hy + 6], P.bd);
}
function head(g, hx, hy, P, eyes = 'normal', look = 0) {
  // ear
  Poly(g, [hx - 5, hy - 6, hx - 2, hy - 15, hx + 3, hy - 7], P.b);
  Poly(g, [hx - 3, hy - 7, hx - 2, hy - 12, hx + 1, hy - 7], P.skd);
  C(g, hx, hy, 9.5, P.b);
  E(g, hx - 2, hy - 3, 6, 5, P.bl);
  C(g, hx - 1, hy + 1, 8, P.b);
  // muzzle
  E(g, hx + 6, hy + 4, 6.5, 4.6, P.skin);
  E(g, hx + 5, hy + 7, 4, 1.5, P.skd);
  // eyes
  if (eyes === 'closed') {
    Ln(g, [hx + 1, hy - 1, hx + 5, hy, hx + 9, hy - 1], P.pupil, 1.4);
  } else if (eyes === 'hurt') {
    E(g, hx + 5, hy - 2, 4.5, 5, P.eye);
    Ln(g, [hx + 3, hy - 5, hx + 8, hy + 1], P.pupil, 1.3); Ln(g, [hx + 8, hy - 5, hx + 3, hy + 1], P.pupil, 1.3);
  } else {
    E(g, hx + 4, hy - 2, 4.5, 5.5, P.eye);
    E(g, hx + 8, hy - 2, 3, 5, P.eye);
    E(g, hx + 6 + look, hy - 1 + (eyes === 'up' ? -2 : 0), 1.5, 3, P.pupil);
    if (P.metal) E(g, hx + 6 + look, hy - 1, 1.2, 2, '#ff8080');
    else R(g, hx + 6 + look, hy - 3, 1, 1, '#ffffff');
  }
  // nose
  C(g, hx + 12, hy + 1, 2.2, P.nose);
  if (!P.metal) R(g, hx + 11, hy, 1, 1, '#7080a0');
  if (eyes === 'normal' || eyes === 'up') Ln(g, [hx + 5, hy + 6, hx + 9, hy + 6.5], P.skd, 1);
}
function leg(g, hip, knee, foot, P, fAng = 0) {
  Ln(g, [hip[0], hip[1], knee[0], knee[1], foot[0], foot[1]], P.b, 3);
  // shoe
  g.save(); g.translate(foot[0], foot[1]); g.rotate(fAng);
  E(g, 3, 1, 6.5, 3.4, P.shoe);
  R(g, -3, 2.5, 12, 1.6, P.shoed);
  R(g, 0, -2.5, 1.8, 4, P.strap);
  R(g, -1, -3, 4, 1.4, P.strap);
  g.restore();
}
function arm(g, sh, hand, P) {
  Ln(g, [sh[0], sh[1], (sh[0] + hand[0]) / 2, (sh[1] + hand[1]) / 2 + 1, hand[0], hand[1]], P.metal ? P.b : P.skin, 2);
  C(g, hand[0], hand[1], 2.8, P.glove);
}
function body(g, bx, by, P) {
  E(g, bx, by, 6.5, 8, P.b);
  if (P.metal) { C(g, bx + 3, by - 1, 3, '#ffd040'); C(g, bx + 3, by - 1, 1.6, '#fff8c0'); }
  else E(g, bx + 3, by + 1, 3.8, 6, P.skin);
}

const hog = {};
// pose: {hx,hy,bx,by, legs:[[hip,knee,foot,ang],...], arms:[[sh,hand],...], eyes, blur, flare, look}
function paintHog(g, P, pose) {
  const { hx, hy, bx, by } = pose;
  const [backL, frontL] = pose.legs, [backA, frontA] = pose.arms;
  if (pose.blur === 'run') {
    g.globalAlpha = 1;
    E(g, bx + 2, by + 9, 10, 6, P.shoe);
    E(g, bx + 2, by + 9, 7, 3.5, P.shoed);
    R(g, bx - 7, by + 8, 18, 1.4, P.strap);
  } else if (pose.blur === 'peel') {
    g.lineWidth = 3.5; g.strokeStyle = P.shoe;
    g.beginPath();
    for (let t = 0; t <= Math.PI * 2 + 0.1; t += 0.2) {
      const x = bx + 2 + Math.sin(t) * 11, y = by + 9 + Math.sin(t * 2) * 4;
      t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.lineWidth = 1.3; g.strokeStyle = P.strap; g.stroke();
  } else if (backL) leg(g, ...backL, P);
  if (pose.streak) { g.globalAlpha = 0.35; R(g, bx - 16, by + 6, 9, 1.5, P.bl); R(g, bx - 20, by + 11, 11, 1.5, P.bl); g.globalAlpha = 1; }
  if (backA) arm(g, ...backA, P);
  quills(g, hx, hy, P, pose.flare || 0);
  body(g, bx, by, P);
  head(g, hx, hy, P, pose.eyes || 'normal', pose.look || 0);
  if (!pose.blur && frontL) leg(g, ...frontL, P);
  if (frontA) arm(g, ...frontA, P);
}

function poseFor(anim, f) {
  const P = { hx: 26, hy: 14, bx: 23, by: 30, eyes: 'normal' };
  const hip = [P.bx, P.by + 6];
  const sh = [P.bx + 1, P.by - 3];
  switch (anim) {
    case 'stand':
      P.legs = [[hip, [20, 39], [19, 42], 0], [hip, [26, 39], [26, 42], 0]];
      P.arms = [[sh, [20, 35]], [sh, [26, 36]]];
      break;
    case 'wait': {
      const tap = f % 2;
      P.eyes = 'normal'; P.look = -1;
      P.legs = [[hip, [20, 39], [19, 42], 0], [hip, [27, 39], [28, 42 - tap * 2], -tap * 0.4]];
      P.arms = [[sh, [18, 30]], [sh, [17, 31]]];
      break;
    }
    case 'lookup':
      P.hy = 13; P.hx = 25; P.eyes = 'up';
      P.legs = [[hip, [20, 39], [19, 42], 0], [hip, [26, 39], [26, 42], 0]];
      P.arms = [[sh, [20, 35]], [sh, [27, 35]]];
      break;
    case 'crouch':
      P.hy = 24; P.hx = 27; P.by = 35; P.bx = 22;
      P.legs = [[[22, 40], [18, 40], [18, 43], 0], [[22, 40], [28, 39], [27, 43], 0]];
      P.arms = [[[23, 33], [28, 38]], [[23, 33], [30, 39]]];
      break;
    case 'walk': {
      const t = f / 8 * Math.PI * 2;
      P.hx = 27; P.hy = 15 + Math.abs(Math.sin(t)) * 1; P.bx = 23; P.by = 30 + Math.abs(Math.sin(t));
      const hp = [P.bx, P.by + 6];
      // foot x = cos(phase): it slides back while planted (sin>=0) and swings forward lifted (sin<0),
      // so the stride always travels in the facing direction. Toe tips up on the forward swing.
      const fx = s => P.bx + 1 + Math.cos(t + s) * 7, lift = s => Math.max(0, -Math.sin(t + s));
      const fy = s => 42 - lift(s) * 5;
      const lg = s => [hp, [(hp[0] + fx(s)) / 2 + 3, 37 - lift(s) * 2], [fx(s), fy(s)], -lift(s) * 0.35];
      P.legs = [lg(Math.PI), lg(0)];
      const s2 = [P.bx + 1, P.by - 3];
      P.arms = [[s2, [P.bx - Math.cos(t) * 6 + 1, 35]], [s2, [P.bx + Math.cos(t) * 6 + 1, 35]]];
      break;
    }
    case 'run': {
      const t = f / 4 * Math.PI * 2;
      P.hx = 29; P.hy = 16; P.bx = 24; P.by = 30; P.flare = 2;
      P.streak = true;
      const s2 = [P.bx + 1, P.by - 3];
      P.arms = [[s2, [P.bx - 6, 30 + Math.sin(t) * 2]], [s2, [P.bx + 9, 30 - Math.sin(t) * 2]]];
      // long forward stride: planted foot sweeps back, lifted foot swings forward, toes point ahead
      const hp = [P.bx, P.by + 6];
      const fx = s => P.bx + 2 + Math.cos(t + s) * 10, lift = s => Math.max(0, -Math.sin(t + s));
      const lg = s => [hp, [(hp[0] + fx(s)) / 2 + 4, 38 - lift(s) * 4], [fx(s), 42 - lift(s) * 6], -lift(s) * 0.3];
      P.legs = [lg(Math.PI), lg(0)];
      break;
    }
    case 'peel': {
      P.hx = 30; P.hy = 16; P.bx = 25; P.by = 30; P.flare = 4; P.blur = 'peel';
      const s2 = [P.bx + 1, P.by - 3];
      P.arms = [[s2, [P.bx - 8, 31]], [s2, [P.bx + 10, 28]]];
      P.legs = [];
      break;
    }
    case 'skid':
      P.hx = 21; P.hy = 15; P.bx = 20; P.by = 30; P.look = 1;
      P.legs = [[[20, 36], [27, 40], [30, 43], -0.3], [[20, 36], [23, 41], [24, 43], 0]];
      P.arms = [[[20, 27], [12, 25]], [[20, 27], [14, 29]]];
      break;
    case 'push':
      P.hx = 29; P.hy = 18; P.bx = 24; P.by = 31;
      P.legs = [[[24, 37], [18, 40], [14, 43], 0.2], [[24, 37], [20, 40], [18, 43], 0.2]];
      P.arms = [[[25, 28], [34, 27]], [[25, 28], [35, 30]]];
      break;
    case 'spring':
      P.hy = 12; P.by = 28;
      P.legs = [[[P.bx, 34], [22, 40], [22, 45], 0.2], [[P.bx, 34], [25, 40], [26, 45], 0.2]];
      P.arms = [[[P.bx, 25], [18, 9]], [[P.bx, 25], [28, 8]]];
      P.eyes = 'up';
      break;
    case 'hurt':
      P.hx = 22; P.hy = 16; P.bx = 25; P.by = 29; P.eyes = 'hurt';
      P.legs = [[[25, 35], [31, 38], [35, 36], -0.4], [[25, 35], [30, 40], [33, 41], -0.2]];
      P.arms = [[[25, 26], [16, 20]], [[25, 26], [33, 20]]];
      break;
    case 'die':
      P.eyes = 'hurt'; P.hy = 14;
      P.legs = [[[P.bx, 36], [18, 39], [14, 38], -0.6], [[P.bx, 36], [28, 39], [32, 38], 0.6]];
      P.arms = [[[P.bx, 27], [13, 18]], [[P.bx, 27], [33, 18]]];
      break;
    case 'hang':
      P.hy = 16; P.by = 31;
      P.legs = [[[P.bx, 37], [21, 42], [20, 46], 0.3], [[P.bx, 37], [26, 41], [28, 45], 0.2]];
      P.arms = [[[P.bx, 26], [21, 2]], [[P.bx, 26], [25, 2]]];
      P.eyes = 'up';
      break;
    case 'victory':
      P.look = 0;
      P.legs = [[hip, [20, 39], [19, 42], 0], [hip, [26, 39], [26, 42], 0]];
      P.arms = [[sh, [18, 34]], [sh, [34, 12]]];
      break;
    case 'board':
      P.hx = 28; P.hy = 17; P.bx = 24; P.by = 31; P.flare = 3;
      P.legs = [[[24, 37], [19, 40], [17, 43], 0], [[24, 37], [29, 40], [29, 43], 0]];
      P.arms = [[[24, 28], [14, 26]], [[24, 28], [34, 27]]];
      break;
    default:
      return poseFor('stand', 0);
  }
  return P;
}

export function hogFrame(pal, anim, f = 0) {
  const key = `hog-${pal}-${anim}-${f}`;
  return sprite(key, 48, 48, g => {
    const P = PAL[pal];
    if (anim === 'ball') return paintBall(g, P, f);
    paintHog(g, P, poseFor(anim, f));
    if (anim === 'board') {
      R(g, 8, 44, 32, 3, '#f0f040'); R(g, 8, 44, 32, 1, '#fff8c0'); C(g, 8, 45.5, 1.5, '#f0f040'); C(g, 40, 45, 2, '#f0f040');
    }
  });
}
function paintBall(g, P, f) {
  const cx = 24, cy = 24;
  C(g, cx, cy, 14, P.b);
  g.save(); g.translate(cx, cy); g.rotate(-f * Math.PI / 2);
  // spikes silhouette
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    Poly(g, [Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a + 0.5) * 15.5, Math.sin(a + 0.5) * 15.5, Math.cos(a + 0.9) * 12, Math.sin(a + 0.9) * 12], P.b);
  }
  g.lineWidth = 2; g.strokeStyle = P.bd;
  g.beginPath(); g.arc(0, 0, 8, 0.3, 2.2); g.stroke();
  g.beginPath(); g.arc(0, 0, 11, 3.2, 4.6); g.stroke();
  g.strokeStyle = P.bl; g.beginPath(); g.arc(0, 0, 10, 4.9, 5.9); g.stroke();
  E(g, 5, 6, 4, 3, P.skin, 0.6);
  C(g, 9, 3, 1.5, P.nose);
  g.restore();
}

// ------------------------------------------------------------------ Amy (classic CD look)
export function amyFrame(anim = 'stand', f = 0) {
  return sprite(`amy-${anim}-${f}`, 48, 48, g => {
    const pink = '#f878b8', pd = '#c04880', skin = '#f8c890', dress = '#e02838', dd = '#901018';
    const hx = 25, hy = 16;
    // legs
    const run = anim === 'run';
    const t = f / 4 * Math.PI * 2;
    const l1 = run ? Math.cos(t) * 5 : 0;
    Ln(g, [22, 34, 21 - l1, 42], skin, 2.4); Ln(g, [26, 34, 27 + l1, 42], skin, 2.4);
    E(g, 22 - l1, 43, 4, 2.2, '#e02030'); E(g, 28 + l1, 43, 4, 2.2, '#e02030');
    // dress
    Poly(g, [19, 26, 29, 26, 33, 37, 15, 37], dress);
    R(g, 15, 36, 18, 1.5, dd);
    // arms
    if (anim === 'held') { Ln(g, [21, 27, 17, 18], skin, 2); Ln(g, [27, 27, 31, 18], skin, 2); C(g, 17, 18, 2.2, '#fff'); C(g, 31, 18, 2.2, '#fff'); }
    else { Ln(g, [20, 28, 16, 33], skin, 2); Ln(g, [28, 28, 32, 33], skin, 2); C(g, 16, 33, 2.2, '#fff'); C(g, 32, 33, 2.2, '#fff'); }
    // hair quills (back, drooping)
    Poly(g, [hx - 6, hy - 4, hx - 13, hy + 6, hx - 8, hy + 4, hx - 11, hy + 11, hx - 4, hy + 6], pink);
    C(g, hx, hy, 9, pink);
    // bangs
    Poly(g, [hx - 5, hy - 8, hx + 9, hy - 7, hx + 8, hy - 2, hx + 4, hy - 4, hx + 1, hy - 1, hx - 2, hy - 5], pd);
    // headband
    Ln(g, [hx - 7, hy - 6, hx + 6, hy - 9], '#e02838', 2);
    // face
    E(g, hx + 5, hy + 4, 5, 4, skin);
    E(g, hx + 3, hy, 3.2, 4, '#fff'); E(g, hx + 7, hy, 2.5, 3.8, '#fff');
    E(g, hx + 4, hy + 1, 1.4, 2.4, '#208040'); E(g, hx + 8, hy + 1, 1.2, 2.2, '#208040');
    C(g, hx + 10, hy + 3, 1.4, '#301010');
    Ln(g, [hx + 4, hy + 6.5, hx + 7, hy + 7], pd, 1);
  });
}

// ------------------------------------------------------------------ Eggman
export function eggFrame(mood = 'normal', f = 0, withMobile = true) {
  return sprite(`egg-${mood}-${f}-${withMobile}`, 64, 56, g => {
    const cx = 32, top = withMobile ? 4 : 10;
    // body (red jacket)
    E(g, cx, top + 24, 12, 9, '#e02020');
    E(g, cx - 3, top + 22, 5, 5, '#ff5050');
    // head
    E(g, cx + 1, top + 11, 9, 9, '#f8c890');
    E(g, cx - 2, top + 5, 5, 3, '#fff0d8');
    // goggles on forehead
    E(g, cx - 1, top + 4, 3.5, 2.2, '#303848'); E(g, cx + 6, top + 4, 3.5, 2.2, '#303848');
    E(g, cx - 1, top + 4, 2, 1.2, '#80c0ff'); E(g, cx + 6, top + 4, 2, 1.2, '#80c0ff');
    // glasses (dark)
    E(g, cx + 1, top + 10, 3, 2.4, '#101010'); E(g, cx + 8, top + 10, 3, 2.4, '#101010');
    if (mood === 'angry') { Ln(g, [cx - 2, top + 6, cx + 4, top + 8], '#6a3000', 1.5); Ln(g, [cx + 11, top + 6, cx + 6, top + 8], '#6a3000', 1.5); }
    // nose
    E(g, cx + 9, top + 14, 3.5, 3, '#f0a878');
    // moustache
    Poly(g, [cx + 9, top + 15, cx - 4, top + 17, cx - 10 + (f % 2), top + 13, cx - 6, top + 20, cx + 4, top + 19, cx + 13, top + 20, cx + 18, top + 15], '#c06818');
    if (mood === 'laugh') { E(g, cx + 6, top + 20, 3, 2.2 + (f % 2), '#801818'); }
    if (mood === 'hurt') { E(g, cx + 6, top + 21, 2.5, 2, '#801818'); R(g, cx - 1, top + 9, 12, 1, '#fff'); }
    // arms
    Ln(g, [cx - 8, top + 22, cx - 14, top + 28], '#e02020', 4); C(g, cx - 14, top + 29, 3, '#fff');
    Ln(g, [cx + 8, top + 22, cx + 14, top + 28], '#e02020', 4); C(g, cx + 14, top + 29, 3, '#fff');
    if (withMobile) {
      // Egg Mobile
      Poly(g, [4, top + 26, 60, top + 26, 54, top + 42, 16, top + 46, 8, top + 38], '#b8c0c8');
      Poly(g, [4, top + 26, 60, top + 26, 58, top + 30, 6, top + 30], '#e8f0f8');
      Poly(g, [16, top + 46, 54, top + 42, 50, top + 48, 22, top + 50], '#707880');
      R(g, 10, top + 32, 44, 2, '#8890a0');
      C(g, 48, top + 37, 3, '#303030'); C(g, 48, top + 37, 1.5, (f % 2) ? '#ff4040' : '#ffe040');
      // glass
      g.globalAlpha = 0.9;
      Poly(g, [8, top + 26, 20, top + 4, 26, top + 4, 16, top + 26], '#a0e0ff');
      g.globalAlpha = 1;
      if (f % 2) Poly(g, [24, top + 52, 36, top + 52, 30, top + 56], '#ffb030');
    } else {
      Ln(g, [cx - 5, top + 32, cx - 6, top + 42], '#303848', 4); Ln(g, [cx + 5, top + 32, cx + 6, top + 42], '#303848', 4);
      E(g, cx - 6, top + 43, 4, 2, '#303030'); E(g, cx + 7, top + 43, 4, 2, '#303030');
    }
  });
}

// ------------------------------------------------------------------ badniks
export function badnik(kind, f, col) {
  return sprite(`bad-${kind}-${f}-${col}`, 40, 40, g => {
    const acc = col || '#e03030';
    switch (kind) {
      case 'motobug': {
        E(g, 20, 22, 11, 9, acc); E(g, 17, 18, 5, 3, '#ffffff66'.slice(0, 7));
        E(g, 16, 18, 4, 2.5, '#ffb0b0');
        C(g, 29, 22, 5, '#e0e0e0'); C(g, 30, 21, 2, '#101010');
        C(g, 20, 34, 5, '#303030'); C(g, 20, 34, 2, '#a0a0a0');
        R(g, 20 + (f % 2 ? -1 : 1), 30, 1, 5, '#808080');
        Ln(g, [10, 20, 5, 17], '#606060', 2); C(g, 5, 16, 2, (f % 2) ? '#ff8000' : '#ffe000');
        break;
      }
      case 'buzzer': {
        Poly(g, [6, 18, 32, 16, 36, 22, 28, 26, 10, 24], '#303848');
        R(g, 12, 18, 3, 7, acc); R(g, 19, 17, 3, 8, acc);
        C(g, 33, 18, 4, acc); C(g, 34, 17, 1.5, '#fff');
        Poly(g, [22, 25, 26, 25, 22, 33], '#e0e0e0');
        g.globalAlpha = 0.95;
        E(g, 18, 11 + (f % 2) * 2, 9, 3, '#c0e8ff');
        break;
      }
      case 'crab': {
        E(g, 20, 24, 12, 8, acc); E(g, 20, 21, 8, 4, '#ff9070');
        C(g, 16, 16, 3, '#fff'); C(g, 24, 16, 3, '#fff'); C(g, 16, 16, 1.3, '#000'); C(g, 24, 16, 1.3, '#000');
        const cl = (f % 2) * 3;
        C(g, 5, 16 - cl, 4.5, acc); Poly(g, [2, 12 - cl, 8, 12 - cl, 5, 17 - cl], '#ffffff');
        C(g, 35, 16 - cl, 4.5, acc); Poly(g, [32, 12 - cl, 38, 12 - cl, 35, 17 - cl], '#ffffff');
        for (let i = 0; i < 3; i++) { Ln(g, [12 + i * 3, 30, 8 + i * 3, 36], '#606060', 2); Ln(g, [28 - i * 3, 30, 32 - i * 3, 36], '#606060', 2); }
        break;
      }
      case 'hoverbot': {
        C(g, 20, 22, 10, '#c0c8d0'); C(g, 20, 22, 7, acc);
        C(g, 22, 21, 3, '#fff'); C(g, 23, 21, 1.5, '#000');
        R(g, 19, 7, 2, 6, '#606060');
        R(g, f % 2 ? 8 : 12, 6, f % 2 ? 24 : 16, 2, '#a0a0a0');
        Poly(g, [14, 31, 26, 31, 20, 37], '#606060');
        break;
      }
      case 'turret': {
        R(g, 8, 26, 24, 12, '#606870'); R(g, 8, 26, 24, 3, '#9098a0');
        C(g, 20, 24, 9, acc); C(g, 20, 24, 5, '#303030');
        C(g, 20, 24, 2.4, f % 2 ? '#ff3030' : '#ffd030');
        R(g, 27, 21, 10, 5, '#404850');
        break;
      }
      case 'fish': {
        E(g, 20, 20, 13, 9, acc); E(g, 22, 24, 9, 4, '#f0f0f0');
        Poly(g, [6, 20, 0, 12 + (f % 2) * 2, 0, 28 - (f % 2) * 2], acc);
        Poly(g, [16, 12, 22, 5, 26, 12], '#f0f0f0');
        C(g, 27, 16, 3, '#fff'); C(g, 28, 16, 1.5, '#000');
        for (let i = 0; i < 4; i++) Poly(g, [24 + i * 3, 25, 26 + i * 3, 22, 28 + i * 3, 25], '#fff');
        break;
      }
      case 'bat': {
        C(g, 20, 20, 7, '#503070');
        const w = f % 2 ? 6 : -4;
        Poly(g, [14, 18, 2, 12 + w, 6, 22, 12, 22], acc);
        Poly(g, [26, 18, 38, 12 + w, 34, 22, 28, 22], acc);
        C(g, 17, 18, 2, '#ffe040'); C(g, 23, 18, 2, '#ffe040');
        Poly(g, [18, 25, 20, 29, 22, 25], '#fff');
        break;
      }
      case 'spiker': {
        E(g, 20, 30, 13, 6, '#909090');
        E(g, 20, 26, 9, 7, acc);
        const up = f % 4 < 2;
        if (up) Poly(g, [12, 22, 20, 4, 28, 22], '#e0e0e0'); else Poly(g, [14, 22, 20, 15, 26, 22], '#e0e0e0');
        C(g, 28, 28, 2.5, '#fff'); C(g, 29, 28, 1.2, '#000');
        break;
      }
      case 'hopper': {
        E(g, 20, 20, 10, 8, acc); C(g, 15, 13, 3.5, '#fff'); C(g, 25, 13, 3.5, '#fff'); C(g, 16, 13, 1.5, '#000'); C(g, 26, 13, 1.5, '#000');
        const sq = f % 2 ? 4 : 0;
        for (let i = 0; i < 3; i++) Ln(g, [14, 27 + i * (3 - sq / 3), 26, 28 + i * (3 - sq / 3)], '#c0c0c0', 1.5);
        R(g, 10, 35 - sq, 20, 3, '#404040');
        break;
      }
      case 'penguin': {
        E(g, 20, 22, 9, 12, '#303848'); E(g, 22, 24, 6, 9, '#f0f0f0');
        C(g, 24, 14, 2.5, '#fff'); C(g, 25, 14, 1.2, '#000');
        Poly(g, [28, 16, 35, 18, 28, 20], '#ffb020');
        R(g, 10, 34, 22, 3, acc);
        break;
      }
      case 'scorp': {
        E(g, 18, 28, 12, 6, acc);
        Ln(g, [8, 27, 4, 16, 10, 8, 20, 8], acc, 4);
        Poly(g, [20, 5, 26, 8, 20, 12], '#e0e0e0');
        C(g, 30, 26, 4, acc); C(g, 32, 22, 2, '#fff');
        for (let i = 0; i < 3; i++) Ln(g, [12 + i * 5, 32, 10 + i * 5, 37], '#505050', 2);
        break;
      }
      default: C(g, 20, 20, 10, acc);
    }
  });
}

// ------------------------------------------------------------------ objects
export function ringFrame(f) {
  return sprite('ring-' + f, 16, 16, g => {
    const w = [7, 5, 2, 5][f % 4];
    const flip = f % 4 === 2;
    g.lineWidth = 2.6; g.strokeStyle = '#d89000';
    g.beginPath(); g.ellipse(8, 8, Math.max(1, w), 6.5, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = flip ? '#fff0a0' : '#ffe040';
    g.beginPath(); g.ellipse(8, 8, Math.max(1, w), 6.5, 0, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
    if (w > 3) R(g, 8 - w + 1, 5, 1, 2, '#ffffff');
  }, '#503000');
}
export function sparkle(f) {
  return sprite('spark-' + f, 16, 16, g => {
    const s = [2, 5, 7, 4][f % 4];
    Poly(g, [8, 8 - s, 9, 7, 8 + s, 8, 9, 9, 8, 8 + s, 7, 9, 8 - s, 8, 7, 7], '#ffffff');
    C(g, 8, 8, 1.5, '#fff8a0');
  }, null);
}
export function monitorSprite(kind, f) {
  return sprite(`mon-${kind}-${f % 8 < 7 ? 0 : 1}`, 30, 32, g => {
    R(g, 1, 2, 28, 26, '#a0a8b0'); R(g, 1, 2, 28, 3, '#e0e8f0'); R(g, 3, 27, 24, 4, '#606870');
    R(g, 4, 6, 22, 18, f % 8 < 7 ? '#202830' : '#a0e0ff');
    if (f % 8 < 7) iconOn(g, kind, 15, 15);
  });
}
function iconOn(g, kind, x, y) {
  if (kind === 'rings') { g.lineWidth = 2; g.strokeStyle = '#ffd020'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke(); }
  else if (kind === 'shield') { C(g, x, y, 6, '#40a0ff'); C(g, x - 2, y - 2, 2, '#e0f0ff'); }
  else if (kind === 'speed') { E(g, x, y + 1, 6, 3.5, '#e82828'); R(g, x - 1, y - 2, 2, 3, '#fff'); Ln(g, [x - 9, y - 2, x - 6, y - 2], '#fff', 1); }
  else if (kind === 'invinc') { for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; C(g, x + Math.cos(a) * 4, y + Math.sin(a) * 4, 2, '#ffff80'); } C(g, x, y, 2, '#fff'); }
  else if (kind === 'life') { C(g, x, y, 6, '#2058e8'); E(g, x + 2, y + 2, 3, 2, '#f8c088'); C(g, x + 1, y - 2, 1.5, '#fff'); }
  else if (kind === 'eggman') { C(g, x, y, 6, '#f8c890'); R(g, x - 5, y + 1, 10, 2, '#c06818'); }
}
export function springSprite(power, compressed) {
  return sprite(`spring-${power}-${compressed}`, 32, 24, g => {
    const col = power === 'red' ? '#e82020' : '#f0d020';
    const hi = power === 'red' ? '#ff9090' : '#fff8a0';
    const h = compressed ? 6 : 14;
    R(g, 3, 20, 26, 4, '#808890');
    for (let i = 0; i < (compressed ? 1 : 3); i++) R(g, 8, 20 - (i + 1) * 4, 16, 2, '#c0c8d0');
    R(g, 1, 20 - h - 2, 30, 6, col); R(g, 1, 20 - h - 2, 30, 2, hi);
  });
}
export function spikesSprite(w, ceil) {
  return sprite(`spikes-${w}-${ceil}`, w, 16, g => {
    g.save();
    if (ceil) { g.translate(0, 16); g.scale(1, -1); }
    R(g, 0, 12, w, 4, '#707880');
    for (let x = 0; x < w; x += 8) { Poly(g, [x, 12, x + 4, 0, x + 8, 12], '#d0d8e0'); Poly(g, [x + 4, 0, x + 8, 12, x + 5, 12], '#808890'); }
    g.restore();
  });
}
export function eggPostFace(f) {
  return sprite('sign-' + f, 40, 48, g => {
    R(g, 19, 30, 3, 18, '#909090');
    const w = Math.abs(Math.cos(f / 8 * Math.PI)) * 18 + 1;
    const side = Math.floor(((f + 4) % 16) / 8);
    E(g, 20, 16, w, 15, '#e8e8f0');
    E(g, 20, 16, Math.max(0.5, w - 3), 12, side ? '#2058e8' : '#f8c890');
    if (w > 10) {
      if (side) { E(g, 23, 13, 4, 4, '#fff'); C(g, 24, 13, 1.5, '#000'); E(g, 24, 20, 5, 3, '#f8c088'); }
      else { E(g, 15, 10, 2.5, 2, '#101010'); E(g, 24, 10, 2.5, 2, '#101010'); Poly(g, [8, 19, 20, 17, 32, 19, 26, 23, 14, 23], '#c06818'); }
    }
  });
}
export function lampPost(active, f) {
  return sprite(`lamp-${active}-${f % 8}`, 16, 48, g => {
    R(g, 6, 12, 4, 34, '#3050c0'); R(g, 6, 12, 1, 34, '#6080ff');
    R(g, 3, 44, 10, 4, '#303848');
    C(g, 8, 8, 5, active ? ((f % 8 < 4) ? '#ff3030' : '#ffe040') : '#3050c0');
    C(g, 7, 6, 1.5, '#ffffff');
  });
}
export function timePost(kind, f) {
  return sprite(`tp-${kind}-${f % 16 < 8}`, 40, 56, g => {
    R(g, 18, 18, 4, 38, '#a0a0a8');
    const w = f % 16 < 8 ? 18 : 12;
    Poly(g, [20 - w, 2, 20 + w, 2, 20 + w, 20, 20 - w, 20], kind === 'past' ? '#40a0ff' : '#ffb020');
    Poly(g, [20 - w + 2, 4, 20 + w - 2, 4, 20 + w - 2, 18, 20 - w + 2, 18], '#fff');
  });
}
export function animalSprite(kind, f) {
  return sprite(`animal-${kind}-${f % 2}`, 16, 16, g => {
    if (kind === 0) { // flicky
      C(g, 8, 9, 4.5, '#3070ff'); E(g, 9, 11, 2.5, 2, '#fff'); C(g, 10, 7, 1, '#000');
      Poly(g, [12, 8, 15, 9, 12, 10], '#ffb020');
      Poly(g, [5, 8, 1, 4 + (f % 2) * 6, 7, 10], '#2050d0');
    } else if (kind === 1) { // pocky
      E(g, 8, 10, 4, 4.5, '#f0e8e0'); R(g, 5, 1, 2, 6, '#f0e8e0'); R(g, 9, 1, 2, 6, '#f0e8e0'); C(g, 9, 8, 0.9, '#000');
      R(g, 5, 14 - (f % 2), 2, 2, '#f0e8e0'); R(g, 9, 14, 2, 2, '#f0e8e0');
    } else { // ricky
      C(g, 8, 9, 4.5, '#8a6a4a'); C(g, 8, 11, 2.5, '#f0e0c0'); C(g, 10, 8, 0.9, '#000'); Poly(g, [4, 5, 6, 1, 8, 5], '#8a6a4a');
    }
  });
}
export function explosionFrame(f) {
  return sprite('expl-' + f, 32, 32, g => {
    const r = 4 + f * 2.2;
    C(g, 16, 16, r, f < 3 ? '#ffffff' : '#ffb020');
    if (f >= 2) C(g, 16, 16, r * 0.7, f < 5 ? '#ffe060' : '#ff6020');
    if (f >= 5) C(g, 16, 16, r * 0.45, '#80402080'.slice(0, 7));
    for (let i = 0; i < 6; i++) { const a = i + f * 0.3; C(g, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 2 + (6 - f) * 0.4, '#fff0a0'); }
  }, null);
}
export function medalSprite(f) {
  return sprite('medal-' + f, 24, 24, g => {
    const w = Math.max(1, Math.abs(Math.cos(f / 16 * Math.PI * 2)) * 10);
    E(g, 12, 12, w, 10, '#c0c8d8'); E(g, 12, 12, Math.max(0.5, w - 2.5), 7.5, '#e8f0ff');
    if (w > 5) {
      const s = w / 10;
      Poly(g, [12, 6, 13.5 * s + 12 - 13.5 * s + 1.5 * s, 10, 12 + 5 * s, 10, 12 + 2 * s, 13, 12 + 3 * s, 17, 12, 14.5, 12 - 3 * s, 17, 12 - 2 * s, 13, 12 - 5 * s, 10, 12 - 1.5 * s, 10], '#4080ff');
    }
  }, '#202840');
}
export function timeStone(col, f) {
  return sprite(`stone-${col}-${f % 4}`, 24, 24, g => {
    Poly(g, [12, 2, 20, 9, 16, 22, 8, 22, 4, 9], col);
    Poly(g, [12, 2, 20, 9, 12, 11, 4, 9], '#ffffff');
    g.globalAlpha = 1;
    Poly(g, [12, 11, 16, 22, 8, 22], col);
    if (f % 4 === 0) C(g, 9, 7, 1.5, '#ffffff');
  }, '#101010');
}
export function bumperSprite(hit) {
  return sprite('bumper-' + hit, 32, 32, g => {
    C(g, 16, 16, hit ? 15 : 13, '#c02040'); C(g, 16, 16, hit ? 11 : 9, '#ff6080');
    C(g, 16, 16, 5, '#fff'); C(g, 13, 13, 2, '#ffffff');
  });
}
export function machineSprite(f, broken) {
  return sprite(`machine-${f % 4}-${broken}`, 80, 80, g => {
    // base
    R(g, 4, 60, 72, 20, '#505860'); R(g, 4, 60, 72, 4, '#8890a0');
    if (broken) {
      Poly(g, [10, 60, 30, 34, 44, 60], '#606870'); Poly(g, [40, 60, 58, 40, 72, 60], '#404850');
      return;
    }
    R(g, 14, 20, 52, 42, '#707880'); R(g, 14, 20, 52, 4, '#a0a8b8');
    // clock face
    C(g, 40, 38, 16, '#e8d8a0'); C(g, 40, 38, 13, '#fff8e0');
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; R(g, 40 + Math.cos(a) * 11 - 1, 38 + Math.sin(a) * 11 - 1, 2, 2, '#503010'); }
    const a = -f * 0.5;
    Ln(g, [40, 38, 40 + Math.cos(a) * 10, 38 + Math.sin(a) * 10], '#c02020', 2);
    Ln(g, [40, 38, 40 + Math.cos(a * 0.3) * 6, 38 + Math.sin(a * 0.3) * 6], '#303030', 2);
    Ln(g, [30, 26, 50, 50], '#503010', 1); // crack
    // antenna + eggman emblem
    R(g, 38, 4, 4, 16, '#808890'); C(g, 40, 4, 4, (f % 4 < 2) ? '#ff3030' : '#ffe040');
    C(g, 20, 66, 3, '#ffe040'); C(g, 60, 66, 3, '#ffe040');
    // side pipes
    R(g, 4, 30, 10, 6, '#606870'); R(g, 66, 30, 10, 6, '#606870');
  });
}
export function bigRingFrame(f) {
  return sprite('bigring-' + f, 64, 64, g => {
    const w = Math.max(3, Math.abs(Math.cos(f / 24 * Math.PI * 2)) * 28);
    g.lineWidth = 7; g.strokeStyle = '#d89000';
    g.beginPath(); g.ellipse(32, 32, w, 28, 0, 0, 7); g.stroke();
    g.lineWidth = 3; g.strokeStyle = '#ffe860';
    g.beginPath(); g.ellipse(32, 32, w, 28, 0, Math.PI, Math.PI * 1.9); g.stroke();
  }, '#503000');
}
export function projectile(kind) {
  return sprite('proj-' + kind, 12, 12, g => {
    if (kind === 'fire') { C(g, 6, 6, 5, '#ff6020'); C(g, 6, 6, 3, '#ffe060'); }
    else if (kind === 'laser') { R(g, 0, 4, 12, 4, '#ff3030'); R(g, 0, 5, 12, 2, '#ffd0d0'); }
    else if (kind === 'rock') { C(g, 6, 6, 5, '#806850'); C(g, 5, 5, 2, '#a89070'); }
    else if (kind === 'crystal') { Poly(g, [6, 0, 11, 6, 6, 12, 1, 6], '#60f0ff'); Poly(g, [6, 0, 11, 6, 6, 6], '#e0ffff'); }
    else if (kind === 'snow') { C(g, 6, 6, 5, '#f0f8ff'); C(g, 4, 4, 2, '#ffffff'); }
    else if (kind === 'spark') { C(g, 6, 6, 5, '#80e0ff'); C(g, 6, 6, 2.5, '#ffffff'); }
    else if (kind === 'seed') { E(g, 6, 6, 5, 4, '#a040c0'); C(g, 5, 5, 1.5, '#ffb0ff'); }
    else { C(g, 6, 6, 5, '#303030'); C(g, 4, 4, 1.5, '#a0a0a0'); }
  });
}
