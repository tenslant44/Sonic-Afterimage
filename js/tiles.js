// Tile shapes (height masks) and per-pixel terrain shaders.
export const T = { EMPTY: 0, FULL: 1, UP45: 2, DN45: 3, UP22A: 4, UP22B: 5, DN22A: 6, DN22B: 7, ONEWAY: 8, HALF: 9 };

export const HEIGHTS = [];
(function build() {
  const f = [
    i => 0, i => 16, i => i + 1, i => 16 - i,
    i => (i >> 1) + 1, i => 9 + (i >> 1), i => 16 - (i >> 1), i => 8 - (i >> 1),
    i => 16, i => 8,
  ];
  for (let s = 0; s < f.length; s++) {
    const a = new Uint8Array(16);
    for (let i = 0; i < 16; i++) a[i] = f[s](i);
    HEIGHTS.push(a);
  }
})();

export function hexToRgb(h) {
  const c = h.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

// Build a shader for a texture style. Returns fn(x, y, d, edge) -> [r,g,b]
// d = depth below the surface (1 = top pixel), edge = 1 if exposed on side/below
export function makeShader(tex, P) {
  const C = {};
  for (const k in P.g) C[k] = hexToRgb(P.g[k]);
  const dk = (c, f) => [c[0] * f | 0, c[1] * f | 0, c[2] * f | 0];
  const lt = (c, f) => [c[0] + (255 - c[0]) * f | 0, c[1] + (255 - c[1]) * f | 0, c[2] + (255 - c[2]) * f | 0];
  const top = C.top, top2 = C.top2, A = C.a, B = C.b, D = C.dark, X = C.accent;
  const topHi = lt(top, 0.35), aHi = lt(A, 0.18), bLo = dk(B, 0.8);
  const hsh = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h >>> 0) & 255; };
  const strip = (x, y, d, depth) => {
    // generic top strip with tufts
    if (d === 1) return topHi;
    if (d <= depth - 2) return (hsh(x, 0) & 3) === 0 && d === 2 ? topHi : top;
    if (d <= depth) return top2;
    return null;
  };
  const deepen = (c, d) => d > 90 ? dk(c, 0.72) : d > 50 ? dk(c, 0.86) : c;
  const S = {
    checker(x, y, d) {
      const s = strip(x, y, d, 7 + ((hsh(x >> 2, 1) & 1) * 2)); if (s) return s;
      const cx = (x >> 4) & 1, cy = ((y) >> 4) & 1;
      let c = (cx ^ cy) ? A : B;
      if ((x & 15) === 0 || (y & 15) === 0) c = dk(c, 0.85);
      if (d < 12) c = dk(c, 0.8);
      return deepen(c, d);
    },
    neon(x, y, d) {
      if (d <= 2) return d === 1 ? lt(top, 0.5) : top;
      if (d <= 4) return top2;
      const gx = x & 31, gy = y & 31;
      if (gx === 0 || gy === 0) return dk(top2, 0.6);
      if ((gx === 16 && gy > 8 && gy < 24)) return dk(X, 0.6);
      return ((x >> 5) + (y >> 5)) & 1 ? A : B;
    },
    brick(x, y, d) {
      const s = strip(x, y, d, 5); if (s) return s;
      const row = y >> 3; const off = (row & 1) * 8;
      const bx = (x + off) & 15, by = y & 7;
      if (bx === 0 || by === 0) return D;
      let c = (hsh((x + off) >> 4, row) & 1) ? A : aHi;
      if (by === 1) c = lt(c, 0.12);
      if ((hsh(x, y) & 31) === 0) c = dk(c, 0.85);
      return deepen(c, d);
    },
    crystal(x, y, d) {
      if (d <= 3) return d === 1 ? lt(top, 0.5) : top;
      const h = hsh(x >> 3, y >> 3);
      const lx = x & 7, ly = y & 7;
      if ((h & 15) < 3) { // crystal shard
        if (Math.abs(lx - 3.5) < 4 - ly * 0.5) return ly < 3 ? lt(X, 0.3) : X;
      }
      let c = ((x + y) >> 3) & 1 ? A : B;
      if ((h & 7) === 0) c = dk(c, 0.8);
      return deepen(c, d);
    },
    toy(x, y, d) {
      if (d <= 6) return d === 1 ? topHi : d > 4 ? top2 : top;
      const bx = x & 31, by = (y - 6) & 15;
      const colors = [A, X, top, B];
      let c = colors[hsh(x >> 5, (y - 6) >> 4) & 3];
      if (bx === 0 || by === 0) return D;
      if (by < 4 && ((bx - 8) & 15) < 6 && bx > 2 && bx < 30) c = lt(c, 0.25); // studs
      if (by === 1) c = lt(c, 0.2);
      return c;
    },
    rooftop(x, y, d) {
      if (d <= 4) return d === 1 ? lt(top, 0.4) : d === 4 ? dk(top, 0.7) : top;
      const wx = x & 31, wy = (y) & 31;
      if (wx > 6 && wx < 26 && wy > 6 && wy < 22 && d > 12) return (hsh(x >> 5, y >> 5) & 3) ? dk(D, 0.9) : [240, 220, 120];
      const brick = ((y >> 2) & 1) ? ((x + 4) & 7) : (x & 7);
      if (brick === 0 || (y & 3) === 0) return dk(A, 0.8);
      return deepen(A, d);
    },
    ice(x, y, d) {
      const s = strip(x, y, d, 6); if (s) return s;
      const band = Math.sin((x + y * 2) * 0.05) + Math.sin(x * 0.13 - y * 0.07);
      let c = band > 1.1 ? lt(A, 0.4) : band > 0 ? A : B;
      if (((x - y) & 63) < 2) c = lt(c, 0.5);
      return deepen(c, d);
    },
    scrap(x, y, d) {
      if (d <= 3) return d === 1 ? lt(top, 0.3) : top2;
      const px = x & 31, py = y & 23;
      let c = [A, B, dk(X, 0.55), top2][hsh(x >> 5, y / 24 | 0) & 3];
      if (px === 0 || py === 0) return D;
      if ((px === 3 || px === 28) && (py === 3 || py === 20)) return lt(c, 0.4);
      if ((hsh(x, y) & 15) === 0) c = dk(c, 0.8);
      return c;
    },
    sand(x, y, d) {
      const s = strip(x, y, d, 6); if (s) return s;
      const layer = Math.floor((y + Math.sin(x * 0.04) * 6) / 10) % 3;
      let c = layer === 0 ? A : layer === 1 ? B : aHi;
      if ((hsh(x, y) & 31) === 0) c = lt(c, 0.2);
      return deepen(c, d);
    },
    wood(x, y, d) {
      if (d <= 4) return d === 1 ? topHi : top;
      if (d <= 6) return top2;
      const plank = y >> 3;
      const px = (x + (plank & 1) * 20) % 40;
      if ((y & 7) === 0 || px === 0) return D;
      let c = (hsh(plank, (x + (plank & 1) * 20) / 40 | 0) & 1) ? A : B;
      if (((x * 3 + y * 7) & 31) === 0) c = dk(c, 0.8);
      return deepen(c, d);
    },
    rock(x, y, d) {
      if (d <= 3) return d === 1 ? lt(top, 0.3) : top;
      const n = Math.sin(x * 0.11 + Math.sin(y * 0.09) * 2) + Math.cos(y * 0.13 + x * 0.03);
      if (Math.abs(n) < 0.06) return X; // glowing cracks
      if (Math.abs(n) < 0.14) return dk(X, 0.6);
      return deepen(n > 0.5 ? A : B, d);
    },
    speedway(x, y, d) {
      if (d <= 3) return d === 1 ? lt(top, 0.4) : top;
      if (d <= 5) return D;
      const px = x & 63;
      if (d < 16 && px < 32) return dk(X, 0.8);
      if (d < 16) return lt(A, 0.1);
      const gx = x & 15, gy = y & 15;
      if (gx === 0 || gy === 0) return D;
      return deepen(((x >> 4) + (y >> 4)) & 1 ? A : B, d);
    },
    fortress(x, y, d) {
      if (d <= 4) return d === 1 ? lt(top, 0.4) : top;
      const row = y / 12 | 0; const off = (row & 1) * 12;
      const bx = (x + off) % 24, by = y % 12;
      if (bx === 0 || by === 0) return D;
      let c = (hsh((x + off) / 24 | 0, row) & 3) === 0 ? B : A;
      if (by === 1 || bx === 1) c = lt(c, 0.15);
      return deepen(c, d);
    },
    vine(x, y, d) {
      const s = strip(x, y, d, 8 + (hsh(x >> 1, 2) & 3)); if (s) return s;
      const v = Math.sin(x * 0.2 + Math.sin(y * 0.1) * 3);
      if (v > 0.93 && d < 60) return dk(top2, 0.8);
      let c = ((hsh(x >> 2, y >> 2) & 7) === 0) ? B : A;
      return deepen(c, d);
    },
    metal(x, y, d) {
      if (d <= 3) return d === 1 ? lt(top, 0.4) : top;
      if (d <= 8) return ((x + y) & 8) ? [230, 190, 30] : [30, 30, 30]; // hazard stripe
      const px = x & 31, py = y & 31;
      if (px === 0 || py === 0) return D;
      if (px === 1 || py === 1) return lt(A, 0.15);
      if ((px === 4 || px === 27) && (py === 4 || py === 27)) return lt(A, 0.4);
      return deepen(((x >> 5) + (y >> 5)) & 1 ? A : B, d);
    },
    clock(x, y, d) {
      if (d <= 4) return d === 1 ? lt(top, 0.5) : top;
      const cx = (x & 31) - 16, cy = (y & 31) - 16;
      const r = Math.sqrt(cx * cx + cy * cy);
      const ang = Math.atan2(cy, cx);
      const gear = 11 + (Math.cos(ang * 8) > 0.3 ? 3 : 0);
      if (r < gear && r > 5) return ((x >> 5) + (y >> 5)) & 1 ? dk(top2, 0.8) : dk(X, 0.6);
      if (r <= 2) return top;
      return deepen(((x >> 5) + (y >> 5)) & 1 ? A : B, d);
    },
  };
  const base = S[tex] || S.checker;
  const edgeC = dk(D, 0.7);
  return (x, y, d, edge) => edge && d > 2 ? edgeC : base(x, y, d);
}

// Oneway plank / log shader colour
export function plankColor(x, y, P) {
  const A = hexToRgb(P.g.a), D = hexToRgb(P.g.dark);
  const ly = y & 15;
  if (ly === 0 || ly === 5) return D;
  if ((x & 15) === 0) return D;
  if (ly === 1) return [Math.min(255, A[0] + 50), Math.min(255, A[1] + 50), Math.min(255, A[2] + 50)];
  return A;
}
