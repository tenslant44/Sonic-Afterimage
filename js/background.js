// Parallax backgrounds for each zone style & era.
import { rng, shade, mix } from './util.js';

const W = 512, H = 240;
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };

function mountains(g, r, base, amp, col, rough = 1, peaks = 6) {
  g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
  const pts = [];
  for (let i = 0; i <= peaks; i++) pts.push(base - amp * (0.4 + r() * 0.6));
  pts[peaks] = pts[0];
  for (let x = 0; x <= W; x += 4) {
    const f = x / W * peaks, i = Math.floor(f), t = f - i;
    const y = pts[i] + (pts[Math.min(peaks, i + 1)] - pts[i]) * (rough > 1 ? t : (1 - Math.cos(t * Math.PI)) / 2) + Math.sin(x * 0.2) * rough;
    g.lineTo(x, y);
  }
  g.lineTo(W, H); g.fill();
}
function hills(g, r, base, amp, col, n = 4) {
  g.fillStyle = col;
  for (let i = 0; i < n + 1; i++) {
    const cx = i * W / n + r() * 40, rw = W / n * (0.6 + r() * 0.4), rh = amp * (0.5 + r() * 0.5);
    for (const off of [-W, 0, W]) { g.beginPath(); g.ellipse(cx + off, base, rw, rh, 0, Math.PI, 0); g.fill(); }
  }
  g.fillRect(0, base, W, H - base);
}
function cloud(g, x, y, s, col) {
  g.fillStyle = col;
  for (const [dx, dy, rr] of [[0, 0, 1], [-1.1, 0.3, 0.7], [1.1, 0.3, 0.75], [0.5, -0.4, 0.7], [-0.5, -0.3, 0.6]]) {
    for (const off of [-W, 0, W]) { g.beginPath(); g.arc(x + dx * s + off, y + dy * s, rr * s, 0, 7); g.fill(); }
  }
}
function buildings(g, r, base, col, win, minH, maxH, wmin = 20, wmax = 44) {
  let x = 0;
  while (x < W) {
    const w = wmin + r() * (wmax - wmin), h = minH + r() * (maxH - minH);
    g.fillStyle = col; g.fillRect(x, base - h, w, h + H);
    if (win) {
      g.fillStyle = win;
      for (let yy = base - h + 6; yy < base - 4; yy += 8) for (let xx = x + 4; xx < x + w - 4; xx += 6) if (r() < 0.55) g.fillRect(xx, yy, 3, 4);
    }
    if (r() < 0.3) { g.fillStyle = col; g.fillRect(x + w / 2 - 1, base - h - 14, 2, 14); }
    x += w + r() * 6;
  }
}
function palm(g, x, y, h, trunk, leaf) {
  g.strokeStyle = trunk; g.lineWidth = 4;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - h / 2, x + 4, y - h); g.stroke();
  g.fillStyle = leaf;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55;
    g.beginPath(); g.ellipse(x + 4 + Math.cos(a) * 14, y - h + Math.sin(a) * 6 + 6, 16, 4, a, 0, 7); g.fill();
  }
  g.lineWidth = 1;
}
function pine(g, x, y, h, col) {
  g.fillStyle = col;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x, y - h + i * h * 0.25); g.lineTo(x - h * 0.3 - i * 3, y - h * 0.35 + i * h * 0.25); g.lineTo(x + h * 0.3 + i * 3, y - h * 0.35 + i * h * 0.25); g.fill(); }
  g.fillRect(x - 2, y - h * 0.2, 4, h * 0.2);
}
function roundTree(g, x, y, h, trunk, leaf) {
  g.fillStyle = trunk; g.fillRect(x - 2, y - h * 0.5, 4, h * 0.5);
  g.fillStyle = leaf; g.beginPath(); g.arc(x, y - h * 0.65, h * 0.35, 0, 7); g.fill();
}
function stars(g, r, n, maxY, col = '#ffffff') {
  for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.2 ? '#ffe0a0' : col; const s = r() < 0.1 ? 2 : 1; g.fillRect(r() * W | 0, r() * maxY | 0, s, s); }
}
function waterBand(g, y, col, hi) {
  g.fillStyle = col; g.fillRect(0, y, W, H - y);
  g.fillStyle = hi;
  for (let yy = y + 3; yy < H; yy += 5 + (yy - y) / 8) for (let x = (yy * 13) % 30; x < W; x += 30 + (yy % 20)) g.fillRect(x, yy, 8 + (yy - y) / 6, 1);
}
function smog(g, r, col) {
  g.globalAlpha = 0.5;
  for (let i = 0; i < 10; i++) cloud(g, r() * W, 40 + r() * 100, 14 + r() * 20, col);
  g.globalAlpha = 1;
}
function smokestacks(g, r, base, col) {
  for (let i = 0; i < 5; i++) {
    const x = r() * W, h = 50 + r() * 60;
    g.fillStyle = col; g.fillRect(x, base - h, 10, h + 40);
    g.fillStyle = '#ff4020'; g.fillRect(x, base - h + 6, 10, 2);
    g.globalAlpha = 0.4; g.fillStyle = '#404040';
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + 5 + k * 6, base - h - 8 - k * 10, 6 + k * 3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
}
function domes(g, r, base, col, glow) {
  for (let i = 0; i < 4; i++) {
    const x = r() * W, rr = 16 + r() * 22;
    g.fillStyle = col; g.beginPath(); g.arc(x, base, rr, Math.PI, 0); g.fill();
    g.fillStyle = glow; g.fillRect(x - rr * 0.6, base - rr * 0.5, rr * 1.2, 2);
    g.fillRect(x - 1, base - rr - 16, 2, 16); g.beginPath(); g.arc(x, base - rr - 16, 3, 0, 7); g.fill();
  }
}

// Build layers: returns {sky:[top,bot], layers:[{c, f, fy}], night, anim}
export function buildBackground(style, era, P, seed) {
  const r = rng(seed);
  const sky = P.sky;
  const L = [];
  const add = (f, fy, paint) => { const c = mk(); const g = c.getContext('2d'); paint(g); L.push({ c, f, fy }); };
  const far = mix(sky[1], P.g.dark, 0.35), mid = mix(sky[1], P.g.dark, 0.6), near = P.g.dark;
  const bad = era === 'bad', good = era === 'good', past = era === 'past';
  let night = false;
  const leaf = bad ? '#606048' : past ? '#40b040' : '#30a030';
  switch (style) {
    case 'beach':
      add(0.05, 0.02, g => { for (let i = 0; i < 6; i++) cloud(g, r() * W, 30 + r() * 60, 10 + r() * 14, bad ? '#b09090' : '#ffffff'); });
      add(0.12, 0.05, g => { mountains(g, r, 150, 60, far, 1, 5); if (bad) smokestacks(g, r, 150, mid); if (good) domes(g, r, 150, mix(far, '#ffffff', 0.3), '#80ffff'); waterBand(g, 150, bad ? '#506070' : '#2080e0', bad ? '#8090a0' : '#a0e0ff'); });
      add(0.35, 0.15, g => { for (let i = 0; i < 7; i++) palm(g, r() * W, 230, 50 + r() * 40, bad ? '#504030' : '#906030', leaf); g.fillStyle = mix(P.g.accent, near, 0.3); g.fillRect(0, 226, W, 20); });
      break;
    case 'city':
      night = true;
      add(0.05, 0.02, g => stars(g, r, 80, 140));
      add(0.12, 0.06, g => buildings(g, r, 190, far, past ? null : (bad ? '#806040' : '#ff60e0'), 50, 130));
      add(0.3, 0.14, g => { buildings(g, r, 220, mid, past ? '#ffd080' : '#40f0ff', 30, 90, 30, 60); g.fillStyle = P.g.accent; g.fillRect(0, 200, W, 3); });
      break;
    case 'ruins':
      add(0.05, 0.02, g => { for (let i = 0; i < 5; i++) cloud(g, r() * W, 30 + r() * 40, 12 + r() * 10, '#ffffffc0'.slice(0, 7)); });
      add(0.12, 0.05, g => {
        mountains(g, r, 140, 40, far, 1, 4);
        if (past) { for (let i = 0; i < 4; i++) { const x = r() * W; g.fillStyle = mix(far, '#f0e0c0', 0.3); g.fillRect(x, 80, 30, 70); g.beginPath(); g.moveTo(x - 4, 80); g.lineTo(x + 15, 60); g.lineTo(x + 34, 80); g.fill(); } }
        waterBand(g, 140, bad ? '#405048' : '#20a0b0', '#a0f0f0');
      });
      add(0.35, 0.15, g => { for (let i = 0; i < 8; i++) { const x = i * 64 + r() * 20, h = past ? 120 : 40 + r() * 70; g.fillStyle = mid; g.fillRect(x, 240 - h, 14, h); g.fillRect(x - 3, 240 - h, 20, 5); } });
      break;
    case 'cave':
      night = true;
      add(0.1, 0.1, g => { g.fillStyle = far; for (let i = 0; i < 20; i++) { const x = r() * W, h = 20 + r() * 60; g.beginPath(); g.moveTo(x - 10, 0); g.lineTo(x, h); g.lineTo(x + 10, 0); g.fill(); } mountains(g, r, 200, 60, far, 3, 8); });
      add(0.3, 0.2, g => { for (let i = 0; i < 14; i++) { const x = r() * W, y = 100 + r() * 130, s = 6 + r() * 14; g.fillStyle = bad ? '#605070' : P.g.accent; g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.6, y); g.lineTo(x - s * 0.6, y); g.fill(); g.fillStyle = '#ffffff'; g.fillRect(x - 1, y - s * 1.5, 1, s); } });
      break;
    case 'factory':
      add(0.08, 0.04, g => { for (let i = 0; i < 8; i++) { const x = r() * W, y = 40 + r() * 140, rr = 14 + r() * 26; g.fillStyle = far; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, d = k % 2 ? rr : rr * 0.8; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.fill(); g.fillStyle = sky[1]; g.beginPath(); g.arc(x, y, rr * 0.3, 0, 7); g.fill(); } });
      add(0.3, 0.15, g => { g.fillStyle = mid; for (let x = 0; x < W; x += 64) { g.fillRect(x, 60, 8, 180); g.fillRect(x, 60 + (x % 128 ? 40 : 80), 64, 6); } g.globalAlpha = 0.35; for (let i = 0; i < 10; i++) { g.fillStyle = ['#ff6060', '#60a0ff', '#ffe060', '#60ff80'][i % 4]; g.fillRect(r() * W, 150 + r() * 70, 10, 6); } g.globalAlpha = 1; });
      break;
    case 'skyline':
      add(0.05, 0.02, g => { for (let i = 0; i < 6; i++) cloud(g, r() * W, 20 + r() * 80, 10 + r() * 16, bad ? '#a08080' : '#fff0e0'); g.fillStyle = '#fff0a0'; g.beginPath(); g.arc(380, 60, 18, 0, 7); g.fill(); });
      add(0.14, 0.05, g => buildings(g, r, 200, far, bad ? null : '#ffe0a0', 60, 160, 24, 50));
      add(0.35, 0.15, g => { buildings(g, r, 240, mid, '#ffe070', 30, 90, 40, 70); for (let i = 0; i < 5; i++) { g.fillStyle = mid; const x = r() * W; g.fillRect(x, 120, 2, 120); g.fillRect(x - 10, 120, 22, 3); } });
      break;
    case 'mountain':
      add(0.06, 0.03, g => { for (let i = 0; i < 5; i++) cloud(g, r() * W, 20 + r() * 50, 10 + r() * 14, '#ffffff'); });
      add(0.12, 0.06, g => { mountains(g, r, 170, 110, far, 2, 5); g.fillStyle = '#ffffff'; for (let x = 0; x < W; x += 2) { } });
      add(0.35, 0.15, g => { mountains(g, r, 220, 50, mid, 2, 7); for (let i = 0; i < 14; i++) pine(g, r() * W, 235, 30 + r() * 30, bad ? '#404840' : '#206040'); });
      break;
    case 'junk':
      add(0.08, 0.04, g => { mountains(g, r, 180, 80, far, 5, 10); smokestacks(g, r, 180, mid); });
      add(0.3, 0.15, g => { for (let i = 0; i < 30; i++) { g.fillStyle = [mid, P.g.b, P.g.a][i % 3]; const x = r() * W, y = 170 + r() * 70; g.save(); g.translate(x, y); g.rotate(r() * 3); g.fillRect(-10, -6, 20 + r() * 20, 12); g.restore(); } for (let i = 0; i < 4; i++) { g.strokeStyle = mid; g.lineWidth = 3; const x = r() * W; g.beginPath(); g.moveTo(x, 240); g.lineTo(x + 20, 90); g.lineTo(x + 80, 90); g.stroke(); g.lineWidth = 1; } });
      break;
    case 'desert':
      add(0.05, 0.02, g => { g.fillStyle = '#fff8d0'; g.beginPath(); g.arc(100, 50, 20, 0, 7); g.fill(); });
      add(0.12, 0.06, g => { hills(g, r, 190, 30, far, 3); for (let i = 0; i < 3; i++) { const x = r() * W, s = 30 + r() * 40; g.fillStyle = mix(far, '#f0d080', 0.3); g.beginPath(); g.moveTo(x - s, 190); g.lineTo(x, 190 - s * 0.9); g.lineTo(x + s, 190); g.fill(); g.fillStyle = mix(far, '#000', 0.2); g.beginPath(); g.moveTo(x, 190 - s * 0.9); g.lineTo(x + s, 190); g.lineTo(x + s * 0.3, 190); g.fill(); } });
      add(0.3, 0.15, g => { for (let i = 0; i < 5; i++) { const x = r() * W, w = 40 + r() * 60, h = 50 + r() * 60; g.fillStyle = mid; g.fillRect(x, 240 - h, w, h); g.fillRect(x - 6, 240 - h, w + 12, 8); } for (let i = 0; i < 6; i++) { const x = r() * W; g.fillStyle = bad ? '#606040' : '#308040'; g.fillRect(x, 200, 6, 40); g.fillRect(x - 8, 210, 8, 4); g.fillRect(x - 8, 200, 4, 12); g.fillRect(x + 6, 205, 8, 4); g.fillRect(x + 10, 196, 4, 12); } });
      break;
    case 'festival':
      night = true;
      add(0.04, 0.02, g => { stars(g, r, 70, 120); g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(360, 40, 14, 0, 7); g.fill(); });
      add(0.12, 0.05, g => { hills(g, r, 170, 30, far, 3); waterBand(g, 170, '#101838', '#ffd080'); });
      add(0.3, 0.15, g => { for (let i = 0; i < 18; i++) { const x = r() * W, y = 60 + r() * 120; g.fillStyle = ['#ff4040', '#ffb040', '#ff80c0'][i % 3]; g.beginPath(); g.ellipse(x, y, 5, 7, 0, 0, 7); g.fill(); g.fillStyle = '#fff0a0'; g.fillRect(x - 1, y - 2, 2, 4); } g.strokeStyle = '#402010'; for (let k = 0; k < 2; k++) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 70 + k * 40 + Math.sin(x / W * Math.PI * 4) * 10); g.stroke(); } });
      break;
    case 'volcano':
      add(0.06, 0.03, g => { smog(g, r, '#602020'); });
      add(0.12, 0.06, g => { mountains(g, r, 200, 120, far, 2, 3); g.fillStyle = '#ff6020'; for (let i = 0; i < 3; i++) { const x = i * W / 3 + 60; g.fillRect(x, 90 + i * 20, 4, 110); g.fillRect(x + 6, 110 + i * 20, 3, 90); } });
      add(0.3, 0.15, g => { mountains(g, r, 240, 60, mid, 5, 9); g.fillStyle = '#ff5010'; g.fillRect(0, 234, W, 6); });
      break;
    case 'highway':
      night = true;
      add(0.03, 0.02, g => { stars(g, r, 150, 200); g.fillStyle = '#ffe0f0'; for (let i = 0; i < 4; i++) { const x = r() * W, y = r() * 100; g.fillRect(x, y, 3, 3); g.fillRect(x - 3, y + 1, 9, 1); g.fillRect(x + 1, y - 3, 1, 9); } });
      add(0.1, 0.05, g => { buildings(g, r, 210, far, past ? '#ffe0a0' : '#ff80c0', 40, 110, 16, 30); });
      add(0.3, 0.15, g => { for (let i = 0; i < 3; i++) { const y = 150 + i * 30; g.fillStyle = mid; g.fillRect(0, y, W, 6); g.fillStyle = P.g.accent; for (let x = (i * 50) % 40; x < W; x += 40) g.fillRect(x, y + 2, 12, 2); for (let x = 30; x < W; x += 128) g.fillRect(x, y + 6, 6, 240); } });
      break;
    case 'storm':
      night = true;
      add(0.05, 0.03, g => { for (let i = 0; i < 12; i++) cloud(g, r() * W, 20 + r() * 80, 16 + r() * 20, mix(sky[0], '#000000', 0.2)); });
      add(0.14, 0.08, g => { for (let i = 0; i < 10; i++) cloud(g, r() * W, 150 + r() * 70, 20 + r() * 26, mix(sky[1], '#000000', 0.15)); g.fillStyle = far; for (let i = 0; i < 3; i++) { const x = r() * W; g.fillRect(x, 100, 40, 50); g.fillRect(x + 8, 70, 8, 30); g.fillRect(x + 24, 80, 8, 20); } });
      add(0.35, 0.15, g => { for (let i = 0; i < 10; i++) cloud(g, r() * W, 220 + r() * 20, 18 + r() * 12, mix(sky[1], '#ffffff', 0.15)); });
      break;
    case 'garden':
      add(0.05, 0.03, g => { for (let i = 0; i < 6; i++) cloud(g, r() * W, 20 + r() * 150, 8 + r() * 14, '#ffffff'); });
      add(0.14, 0.08, g => { for (let i = 0; i < 6; i++) { const x = r() * W, y = 60 + r() * 120, w = 30 + r() * 40; g.fillStyle = far; g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + w, y); g.lineTo(x, y + w * 0.8); g.fill(); g.fillStyle = bad ? '#606048' : '#60c040'; g.fillRect(x - w, y - 4, w * 2, 6); roundTree(g, x, y - 2, 30, '#604020', bad ? '#606048' : '#40a030'); } });
      add(0.35, 0.18, g => { g.strokeStyle = bad ? '#505038' : '#40a030'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { const x = r() * W; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y < 180; y += 10) g.lineTo(x + Math.sin(y * 0.05 + i) * 8, y); g.stroke(); g.fillStyle = '#ff80c0'; g.beginPath(); g.arc(x, 180, 4, 0, 7); g.fill(); } g.lineWidth = 1; });
      break;
    case 'metalfactory':
      night = true;
      add(0.08, 0.04, g => { g.fillStyle = far; for (let x = 0; x < W; x += 48) { g.fillRect(x, 0, 20, H); } for (let i = 0; i < 6; i++) { const x = r() * W, y = r() * 200, rr = 20 + r() * 30; g.fillStyle = mid; g.beginPath(); for (let k = 0; k < 20; k++) { const a = k / 20 * 7, d = k % 2 ? rr : rr * 0.85; g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.fill(); } });
      add(0.3, 0.15, g => { g.fillStyle = mid; for (let y = 40; y < H; y += 60) g.fillRect(0, y, W, 10); for (let i = 0; i < 12; i++) { g.fillStyle = r() < 0.5 ? '#ff3030' : '#30ff60'; g.fillRect(r() * W, r() * H, 3, 3); } });
      break;
    case 'core':
    default:
      night = true;
      add(0.05, 0.03, g => { stars(g, r, 90, 240, '#e0c0ff'); });
      add(0.12, 0.06, g => { for (let i = 0; i < 5; i++) { const x = r() * W, y = 40 + r() * 160, rr = 20 + r() * 40; g.strokeStyle = far; g.lineWidth = 4; g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke(); for (let k = 0; k < 12; k++) { const a = k / 12 * 7; g.fillStyle = far; g.fillRect(x + Math.cos(a) * rr - 2, y + Math.sin(a) * rr - 2, 4, 4); } g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr * 0.7, y - rr * 0.3); g.stroke(); } g.lineWidth = 1; });
      add(0.3, 0.15, g => { for (let i = 0; i < 8; i++) { const x = r() * W; g.fillStyle = mid; g.fillRect(x, 120 + r() * 60, 16, 200); g.fillStyle = P.g.accent; g.fillRect(x + 6, 140, 4, 60); } });
  }
  if (bad && !['volcano', 'junk'].includes(style)) {
    // polluted overlay on the mid layer
    const c = L[L.length - 2] || L[0];
    const g = c.c.getContext('2d');
    smokestacks(g, r, 200, mix(far, '#202020', 0.5));
  }
  return { sky, layers: L, night, style };
}

export function drawBackground(ctx, bg, camx, camy, frame, vw, vh, baseY) {
  const grad = bg.grad || (bg.grad = (() => { const gg = ctx.createLinearGradient(0, 0, 0, vh); gg.addColorStop(0, bg.sky[0]); gg.addColorStop(1, bg.sky[1]); return gg; })());
  ctx.fillStyle = grad; ctx.fillRect(0, 0, vw, vh);
  for (let i = 0; i < bg.layers.length; i++) {
    const l = bg.layers[i];
    let ox = -(camx * l.f + (i === 0 ? frame * 0.1 : 0)) % W; if (ox > 0) ox -= W;
    const oy = Math.round(Math.max(-60, Math.min(60, -(camy - baseY) * l.fy)));
    for (let x = Math.floor(ox); x < vw; x += W) ctx.drawImage(l.c, x, oy);
    // extend bottom colour if shifted up
    if (oy < 0) { }
  }
}
