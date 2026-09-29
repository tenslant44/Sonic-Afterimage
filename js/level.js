// Level runtime: tile storage, collision queries, and chunked terrain rendering.
import { HEIGHTS, T, makeShader, plankColor } from './tiles.js';

const CHUNK = 256;

export class Level {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.lines = [];        // rails / slanted one-way lines {x1,y1,x2,y2,kind}
    this.lineBuckets = new Map();
    this.chunks = new Map();
    this.pw = w * 16; this.ph = h * 16;
  }
  get(tx, ty) {
    if (tx < 0 || tx >= this.w) return T.FULL;
    if (ty < 0 || ty >= this.h) return T.EMPTY;
    return this.tiles[ty * this.w + tx];
  }
  set(tx, ty, v) {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return;
    this.tiles[ty * this.w + tx] = v;
  }
  fill(x0, y0, x1, y1, v) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v); }
  // pixel solidity; oneway=false excludes platforms
  solid(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= this.pw) return y < this.ph + 64;
    const t = this.get(x >> 4, y >> 4);
    if (t === 0 || t === T.ONEWAY) return false;
    return (y & 15) >= 16 - HEIGHTS[t][x & 15];
  }
  solidF(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= this.pw) return y < this.ph + 64;
    const t = this.get(x >> 4, y >> 4);
    if (t === 0) return false;
    if (t === T.ONEWAY) return (y & 15) < 6;
    return (y & 15) >= 16 - HEIGHTS[t][x & 15];
  }
  // Find the floor surface near (x,y). gdir: 1 = floor below, -1 = ceiling above (gravity flipped)
  floorScan(x, y, range, gdir = 1, useOneway = true) {
    y = Math.floor(y);
    if (gdir === 1) {
      const S = useOneway ? (a, b) => this.solidF(a, b) : (a, b) => this.solid(a, b);
      if (S(x, y)) {
        for (let k = 1; k <= 20; k++) if (!S(x, y - k)) return y - k + 1;
        return null; // buried
      }
      for (let k = 1; k <= range; k++) if (S(x, y + k)) return y + k;
      return null;
    } else {
      if (this.solid(x, y - 1)) {
        for (let k = 1; k <= 20; k++) if (!this.solid(x, y - 1 + k)) return y + k - 1;
        return null;
      }
      for (let k = 1; k <= range; k++) if (this.solid(x, y - 1 - k)) return y - k;
      return null;
    }
  }
  addLine(x1, y1, x2, y2, kind = 'rail') {
    if (x2 < x1) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const L = { x1, y1, x2, y2, kind, ang: Math.atan2(y2 - y1, x2 - x1) };
    this.lines.push(L);
    for (let b = Math.floor(x1 / 512); b <= Math.floor(x2 / 512); b++) {
      if (!this.lineBuckets.has(b)) this.lineBuckets.set(b, []);
      this.lineBuckets.get(b).push(L);
    }
    return L;
  }
  // Nearest line surface under x within [y-up, y+down]
  lineAt(x, y, up, down, kind = null) {
    const list = this.lineBuckets.get(Math.floor(x / 512));
    if (!list) return null;
    let best = null, bd = 1e9;
    for (const L of list) {
      if (x < L.x1 || x > L.x2) continue;
      if (kind && L.kind !== kind) continue;
      const ly = L.y1 + (L.y2 - L.y1) * (x - L.x1) / (L.x2 - L.x1 || 1);
      const dd = ly - y;
      if (dd >= -up && dd <= down && Math.abs(dd) < bd) { bd = Math.abs(dd); best = { L, y: ly }; }
    }
    return best;
  }
  linesNear(x0, x1) {
    const out = new Set();
    for (let b = Math.floor(x0 / 512); b <= Math.floor(x1 / 512); b++) {
      const l = this.lineBuckets.get(b); if (l) l.forEach(v => out.add(v));
    }
    return out;
  }

  // ------------------------------------------------------------ rendering
  setupRender(tex, P) {
    this.shader = makeShader(tex, P);
    this.P = P;
    this.chunks.clear();
  }
  pixKind(x, y) {
    if (x < 0 || x >= this.pw || y < 0 || y >= this.ph) return 0;
    const t = this.tiles[(y >> 4) * this.w + (x >> 4)];
    if (t === 0) return 0;
    if (t === T.ONEWAY) return (y & 15) < 6 ? 2 : 0;
    return (y & 15) >= 16 - HEIGHTS[t][x & 15] ? 1 : 0;
  }
  buildChunk(cx, cy) {
    const c = document.createElement('canvas');
    c.width = CHUNK; c.height = CHUNK;
    const g = c.getContext('2d');
    const img = g.createImageData(CHUNK, CHUNK);
    const px = img.data;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    let any = false;
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx;
      let d = 0;
      // establish depth above the chunk
      let ys = y0 - 1;
      while (ys > y0 - 100 && this.pixKind(x, ys) === 1) { d++; ys--; }
      for (let ly = 0; ly < CHUNK; ly++) {
        const y = y0 + ly;
        const k = this.pixKind(x, y);
        if (k === 0) { d = 0; continue; }
        const i = (ly * CHUNK + lx) * 4;
        let col;
        if (k === 2) { col = plankColor(x, y, this.P); d = 0; }
        else {
          d++;
          const edge = this.pixKind(x - 1, y) === 0 || this.pixKind(x + 1, y) === 0 || this.pixKind(x, y + 1) === 0;
          col = this.shader(x, y, d, edge);
        }
        px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
        any = true;
      }
    }
    if (!any) return null;
    g.putImageData(img, 0, 0);
    return c;
  }
  getChunk(cx, cy) {
    const key = cx + ',' + cy;
    if (this.chunks.has(key)) {
      const v = this.chunks.get(key);
      this.chunks.delete(key); this.chunks.set(key, v); // LRU refresh
      return v;
    }
    const c = this.buildChunk(cx, cy);
    this.chunks.set(key, c);
    if (this.chunks.size > 90) this.chunks.delete(this.chunks.keys().next().value);
    return c;
  }
  invalidateTile(tx, ty) {
    const cx = Math.floor(tx * 16 / CHUNK), cy = Math.floor(ty * 16 / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) this.chunks.delete((cx + dx) + ',' + (cy + dy));
  }
  drawTerrain(ctx, camx, camy, vw, vh) {
    const cx0 = Math.floor(camx / CHUNK), cx1 = Math.floor((camx + vw) / CHUNK);
    const cy0 = Math.floor(camy / CHUNK), cy1 = Math.floor((camy + vh) / CHUNK);
    let built = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx * CHUNK >= this.pw || cy * CHUNK >= this.ph) continue;
      const c = this.getChunk(cx, cy);
      if (c) ctx.drawImage(c, Math.round(cx * CHUNK - camx), Math.round(cy * CHUNK - camy));
    }
    // prewarm one neighbour chunk per frame
    const key = (cx1 + 1) + ',' + cy0;
    if (!this.chunks.has(key) && (cx1 + 1) * CHUNK < this.pw) this.getChunk(cx1 + 1, cy0);
    else {
      const k2 = (cx1 + 1) + ',' + cy1;
      if (!this.chunks.has(k2) && (cx1 + 1) * CHUNK < this.pw && cy1 * CHUNK < this.ph) this.getChunk(cx1 + 1, cy1);
    }
  }
}
