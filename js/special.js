// Special Stage: mode-7 UFO chase for Time Stones.
import { input } from './input.js';
import { audio } from './audio.js';
import { save } from './save.js';
import { drawText } from './font.js';
import { rng, clamp } from './util.js';
import { sprite, timeStone, ringFrame } from './sprites.js';
import { TIME_STONE_COLORS } from './zones.js';
import { VW, VH } from './game.js';

const MAP = 512; // texture size (world units)
const HZ = 78;   // horizon row
const CAMH = 38, FOC = 170;

const THEMES = [
  { a: [240, 200, 80], b: [220, 120, 40], path: [80, 200, 240], sky: ['#1030a0', '#60a0ff'] },
  { a: [120, 220, 120], b: [60, 160, 80], path: [240, 240, 120], sky: ['#402080', '#e080c0'] },
  { a: [200, 120, 240], b: [140, 60, 200], path: [120, 240, 240], sky: ['#200840', '#6040c0'] },
  { a: [240, 140, 140], b: [200, 80, 100], path: [255, 230, 160], sky: ['#301020', '#f08060'] },
  { a: [140, 200, 255], b: [80, 140, 220], path: [255, 255, 255], sky: ['#082040', '#40c0e0'] },
  { a: [255, 220, 120], b: [200, 160, 60], path: [240, 100, 200], sky: ['#201008', '#e0a040'] },
  { a: [180, 180, 200], b: [110, 110, 140], path: [255, 80, 80], sky: ['#000010', '#402060'] },
];

function backSonic(f, air) {
  return sprite(`bsonic-${f}-${air}`, 40, 44, g => {
    const E = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
    const legs = air ? [0, 0] : [Math.sin(f / 4 * Math.PI * 2) * 4, -Math.sin(f / 4 * Math.PI * 2) * 4];
    E(14, 38 + legs[0] * 0.5, 5, 4 - legs[0] * 0.3, '#e82828'); E(26, 38 + legs[1] * 0.5, 5, 4 - legs[1] * 0.3, '#e82828');
    g.fillStyle = '#2058e8'; g.fillRect(12, 28, 4, 8); g.fillRect(24, 28, 4, 8);
    E(20, 24, 9, 9, '#2058e8');
    // quills radiating down/out
    const Q = (x1, y1, x2, y2, x3, y3) => { g.fillStyle = '#1a4cd0'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.fill(); };
    Q(12, 12, 3, 24, 14, 20); Q(28, 12, 37, 24, 26, 20); Q(16, 18, 12, 32, 22, 22); Q(24, 18, 28, 32, 18, 22);
    E(20, 13, 10, 9, '#2058e8');
    g.fillStyle = '#2058e8'; g.beginPath(); g.moveTo(11, 9); g.lineTo(9, 1); g.lineTo(16, 6); g.fill(); g.beginPath(); g.moveTo(29, 9); g.lineTo(31, 1); g.lineTo(24, 6); g.fill();
    E(20, 26, 3, 2, '#f8c088');
    g.fillStyle = '#fff'; g.beginPath(); g.arc(10, 24 + (air ? -6 : legs[1]), 3, 0, 7); g.fill(); g.beginPath(); g.arc(30, 24 + (air ? -6 : legs[0]), 3, 0, 7); g.fill();
  });
}
function ufoSprite(f, kind) {
  return sprite(`ufo-${f % 4}-${kind}`, 48, 32, g => {
    const E = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
    E(24, 20, 22, 7, '#c0c8d8'); E(24, 18, 22, 4, '#e8f0ff');
    E(24, 12, 10, 9, kind === 'time' ? '#80ff80' : '#80d0ff'); E(21, 9, 3, 2, '#ffffff');
    for (let i = 0; i < 4; i++) { const x = 8 + ((i * 10 + f * 3) % 32); E(x, 22, 2, 1.5, i % 2 ? '#ff4040' : '#ffe040'); }
  });
}
function ufoColor(kind) { return { time: '#80ff80', flee: '#ffa040', high: '#ff60ff', zig: '#ffff60', armor: '#d0d8e8' }[kind] || '#80d0ff'; }
function ufoSprite2(f, kind) {
  return sprite(`ufo2-${f % 4}-${kind}`, 48, 34, g => {
    const E = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
    E(24, 21, 22, 7, '#b8c0d0'); E(24, 19, 22, 4, '#e8f0ff');
    E(24, 13, 10, 9, ufoColor(kind)); E(21, 10, 3, 2, '#ffffff');
    for (let i = 0; i < 4; i++) { const x = 8 + ((i * 10 + f * 3) % 32); E(x, 23, 2, 1.5, i % 2 ? '#ff4040' : '#ffe040'); }
    if (kind === 'high') { g.fillStyle = '#ffffff'; g.fillRect(22, 28, 4, 5); }
  });
}
function mineSprite(f) {
  return sprite('smine-' + (f % 2), 24, 24, g => {
    g.fillStyle = '#c0c0d0';
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + f * 0.2; g.beginPath(); g.moveTo(12 + Math.cos(a) * 11, 12 + Math.sin(a) * 11); g.lineTo(12 + Math.cos(a + 0.35) * 6, 12 + Math.sin(a + 0.35) * 6); g.lineTo(12 + Math.cos(a - 0.35) * 6, 12 + Math.sin(a - 0.35) * 6); g.fill(); }
    g.fillStyle = '#383848'; g.beginPath(); g.arc(12, 12, 7, 0, 7); g.fill();
    g.fillStyle = f % 2 ? '#ff3030' : '#ffb030'; g.beginPath(); g.arc(12, 12, 2.5, 0, 7); g.fill();
  });
}


// tiles
const FLOOR = 0, PATH = 1, WATER = 2, BOOST = 3, BUMP = 4, EDGE = 5, PAD = 6, VOID = 7;

export class SpecialStage {
  constructor(app, idx) {
    this.app = app; this.idx = idx;
    this.k = Math.min(1, idx / 6);                       // difficulty 0..1 across the seven stages
    this.theme = THEMES[idx % THEMES.length];
    this.r = rng(9001 + idx * 77);
    this.buildMap();
    this.x = MAP / 2; this.y = MAP - 60; this.ang = -Math.PI / 2; this.spd = 0;
    this.safe = { x: this.x, y: this.y, ang: this.ang };
    this.z = 0; this.vz = 0; this.air = false;
    this.time = 60 * (52 - this.idx * 2); this.frame = 0;
    this.rings = 0; this.combo = 0; this.popups = [];
    this.fallT = 0; this.hitT = 0;
    this.spawnUfos();
    this.spawnItems();
    this.state = 'intro'; this.st = 0;
    this.img = null;
    audio.playSong('special');
  }
  spawnUfos() {
    const r = this.r, k = this.k;
    const n = 7 + Math.round(k * 5);
    const kinds = [];
    for (let i = 0; i < n; i++) {
      let kind = 'normal';
      if (i % 3 === 1) kind = 'flee';
      if (this.idx >= 1 && i % 4 === 2) kind = 'zig';
      if (this.idx >= 2 && i % 5 === 4) kind = 'high';
      if (this.idx >= 4 && i % 6 === 5) kind = 'armor';
      kinds.push(kind);
    }
    this.ufos = kinds.map((kind, i) => {
      const a = i / n * Math.PI * 2 + r() * 0.4;
      const rad = 110 + r() * 110;
      const u = { cx: MAP / 2 + Math.cos(a) * rad, cy: MAP / 2 + Math.sin(a) * rad, r: 18 + r() * 30, ph: r() * 7,
        sp: (0.008 + r() * 0.01) * (1 + k * 1.3) * (r() < 0.5 ? 1 : -1), h: 22 + r() * 10, alive: true, kind, dash: 0, dx: 0, dy: 0 };
      if (kind === 'high') { u.h = 84 + r() * 10; u.r = 10; }
      if (kind === 'zig') { u.za = r() * Math.PI; u.zl = 70 + r() * 40; u.sp *= 1.8; }
      u.x = u.cx; u.y = u.cy;
      return u;
    });
    this.ufos.push({ cx: MAP / 2, cy: MAP / 2, r: 70, ph: 0, sp: 0.022 + k * 0.012, h: 28, alive: true, kind: 'time', x: MAP / 2, y: MAP / 2, dash: 0, dx: 0, dy: 0 });
    // high UFOs get a jump pad underneath their orbit
    for (const u of this.ufos) if (u.kind === 'high') this.blob(u.cx, u.cy, 14, PAD);
  }
  spawnItems() {
    const r = this.r, k = this.k;
    this.items = [];
    // ring trails curving between UFO orbits
    for (let t = 0; t < 6 + this.idx; t++) {
      const a = r() * Math.PI * 2, rad = 60 + r() * 160, len = 8 + (r() * 6 | 0), turn = (r() - 0.5) * 0.06;
      let x = MAP / 2 + Math.cos(a) * rad, y = MAP / 2 + Math.sin(a) * rad, h = r() * 7;
      for (let i = 0; i < len; i++) {
        h += turn * 8; x += Math.cos(h) * 12; y += Math.sin(h) * 12;
        const tl = this.tileAt(x, y);
        if (tl !== VOID && tl !== EDGE && tl !== BUMP) this.items.push({ type: 'ring', x, y, h: 8, alive: true });
      }
    }
    // rolling mines
    const mines = 3 + Math.round(k * 12);
    for (let i = 0; i < mines; i++) {
      // keep the opening straight (start is bottom-centre heading north) mine-free
      let cx, cy, rr, tries = 0;
      do {
        const a = r() * Math.PI * 2, rad = 50 + r() * 180;
        cx = MAP / 2 + Math.cos(a) * rad; cy = MAP / 2 + Math.sin(a) * rad; rr = 20 + r() * 50;
      } while (tries++ < 30 && Math.abs(cx - MAP / 2) < rr + 30 && cy + rr > MAP - 220);
      this.items.push({ type: 'mine', cx, cy, ph: r() * 7, sp: (0.01 + r() * 0.015) * (r() < 0.5 ? -1 : 1), rr, h: 10, alive: true, x: 0, y: 0 });
    }
  }
  blob(cx, cy, rr, v) {
    const m = this.map;
    for (let y = cy - rr; y < cy + rr; y++) for (let x = cx - rr; x < cx + rr; x++) if (x > 24 && y > 24 && x < MAP - 24 && y < MAP - 24 && (x - cx) ** 2 + (y - cy) ** 2 < rr * rr) m[(y | 0) * MAP + (x | 0)] = v;
    if (this.tex) this.paintTex();
  }
  buildMap() {
    const r = this.r, k = this.k;
    const m = new Uint8Array(MAP * MAP);
    this.map = m;
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const e = x < 24 || y < 24 || x >= MAP - 24 || y >= MAP - 24;
      m[y * MAP + x] = e ? EDGE : FLOOR;
    }
    const blob = (cx, cy, rr, v) => this.blob(cx, cy, rr, v);
    // void holes from stage 3 on: the floor turns into islands joined by paths
    if (this.idx >= 2) {
      const holes = 3 + Math.round(k * 6);
      for (let i = 0; i < holes; i++) {
        const a = r() * Math.PI * 2, rad = 70 + r() * 150;
        blob(MAP / 2 + Math.cos(a) * rad, MAP / 2 + Math.sin(a) * rad, 16 + r() * (18 + k * 16), VOID);
      }
    }
    // curvy path (safe, speedy)
    for (let a = 0; a < Math.PI * 2; a += 0.004) { const rr = 150 + Math.sin(a * 3) * 30; blob(MAP / 2 + Math.cos(a) * rr, MAP / 2 + Math.sin(a) * rr, 10 - k * 3, PATH); }
    for (let i = 0; i < 5 + this.idx; i++) blob(40 + r() * (MAP - 80), 40 + r() * (MAP - 80), 12 + r() * 20, WATER);
    for (let i = 0; i < 8; i++) { const a = r() * 7; blob(MAP / 2 + Math.cos(a) * 150, MAP / 2 + Math.sin(a) * 150, 6, BOOST); }
    for (let i = 0; i < 8 + this.idx * 2; i++) blob(40 + r() * (MAP - 80), 40 + r() * (MAP - 80), 6, BUMP);
    for (let i = 0; i < 3; i++) blob(60 + r() * (MAP - 120), 60 + r() * (MAP - 120), 9, PAD);
    // keep the start clear
    blob(MAP / 2, MAP - 60, 30, FLOOR);
    this.paintTex();
  }
  paintTex() {
    const t = this.theme, m = this.map;
    const tex = this.tex || new Uint32Array(MAP * MAP);
    const pack = (c) => (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
    const A = pack(t.a), B = pack(t.b), Pth = pack(t.path), Wt = pack([40, 90, 220]), Wt2 = pack([90, 150, 255]), Bo = pack([255, 255, 80]), Bo2 = pack([255, 120, 40]), Bu = pack([240, 40, 80]), Bu2 = pack([255, 255, 255]), Ed = pack([40, 20, 60]), Ed2 = pack([90, 50, 120]);
    const Pd = pack([60, 240, 120]), Pd2 = pack([230, 255, 230]), V = pack([6, 4, 20]), V2 = pack([120, 120, 200]);
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
      const v = m[y * MAP + x];
      let c;
      if (v === FLOOR) c = ((x >> 4) + (y >> 4)) & 1 ? A : B;
      else if (v === PATH) c = ((x >> 3) + (y >> 3)) & 1 ? Pth : A;
      else if (v === WATER) c = ((x + y) >> 2) % 5 === 0 ? Wt2 : Wt;
      else if (v === BOOST) c = ((y >> 2) & 1) ? Bo : Bo2;
      else if (v === BUMP) c = ((x >> 2) + (y >> 2)) & 1 ? Bu : Bu2;
      else if (v === PAD) { const d = Math.hypot((x & 15) - 8, (y & 15) - 8); c = d < 3 || (d > 5 && d < 7) ? Pd2 : Pd; }
      else if (v === VOID) c = ((x * 73856093) ^ (y * 19349663)) % 97 === 0 ? V2 : V;
      else c = ((x >> 3) + (y >> 3)) & 1 ? Ed : Ed2;
      tex[y * MAP + x] = c;
    }
    this.tex = tex;
    const dk = (c, f) => pack(c.map(v => Math.round(v * f)));
    this.outA = dk(t.a, 0.55); this.outB = dk(t.b, 0.45);
  }
  tileAt(x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= MAP || y >= MAP) return EDGE; return this.map[y * MAP + x]; }
  clearAhead() {
    for (let d = 8; d <= 48; d += 8) for (const o of [-0.5, 0, 0.5]) { const t = this.tileAt(this.x + Math.cos(this.ang + o) * d, this.y + Math.sin(this.ang + o) * d); if (t === VOID || t === EDGE) return false; }
    return true;
  }
  pop(text, style = 'white') { this.popups.push({ text, style, t: 60 }); }
  addTime(f, label) { this.time += f; if (label) this.pop(label, f >= 0 ? 'green' : 'red'); }

  update() {
    this.frame++; this.st++;
    for (const p of this.popups) p.t--;
    this.popups = this.popups.filter(p => p.t > 0);
    if (this.state === 'intro') { this.moveThings(); if (this.st > 100) { this.state = 'play'; this.st = 0; } return; }
    if (this.state === 'done') {
      if (this.st === 60 && this.win) audio.jingle('stone');
      if (this.st > 240 || (this.st > 90 && input.pressed('jump'))) this.app.flow.afterSpecial(this.win);
      return;
    }
    const k = this.k;
    // falling into the void
    if (this.fallT > 0) {
      this.fallT--; this.z -= 3;
      if (this.fallT === 0) { this.x = this.safe.x; this.y = this.safe.y; this.ang = this.safe.ang; this.z = 0; this.vz = 0; this.spd = 0; this.hitT = 60; }
      this.time -= 1; this.moveThings(); this.checkEnd(); return;
    }
    // steering: tighter turning at speed feels better when it eases in
    const turn = 0.042 + k * 0.008;
    if (input.held('left')) this.ang -= turn;
    if (input.held('right')) this.ang += turn;
    const onGround = this.z <= 0;
    const tile = this.tileAt(this.x, this.y);
    const top = 3.4 + k * 1.2;
    let maxS = input.held('up') ? top + 1.1 : top;
    if (input.held('down')) maxS = 1.2;
    if (tile === WATER && onGround) maxS *= 0.55;
    if (this.hitT > 0) { this.hitT--; maxS = Math.min(maxS, 2); }
    if (this.padT > 0) { this.padT--; maxS = Math.min(maxS, 1.2); }
    this.spd += clamp(maxS - this.spd, -0.14, 0.08);
    if (tile === BOOST && onGround) { if (this.spd < 7.5) audio.sfx('dash', { vol: 0.5 }); this.spd = 8; }
    const nx = this.x + Math.cos(this.ang) * this.spd, ny = this.y + Math.sin(this.ang) * this.spd;
    const nt = this.tileAt(nx, ny);
    if (nt === EDGE || (nt === BUMP && this.z <= 6)) {
      this.ang += Math.PI; this.spd = 3; audio.sfx('bumper');
      this.x += Math.cos(this.ang) * 6; this.y += Math.sin(this.ang) * 6;
    } else { this.x = nx; this.y = ny; }
    // jump / pads
    if (input.pressed('jump') && onGround) { this.vz = 5; this.combo = 0; audio.sfx('jump'); }
    if (tile === PAD && onGround) { this.vz = 8.6; this.combo = 0; this.spd = Math.min(this.spd, 1.2); this.padT = 40; audio.sfx('spring'); }
    this.vz -= 0.22; this.z = Math.max(0, this.z + this.vz);
    if (this.z === 0) { this.combo = 0; this.vz = 0; }
    const nowTile = this.tileAt(this.x, this.y);
    if (this.z <= 0) {
      if (nowTile === VOID) { this.fallT = 40; audio.sfx('warp', { rate: 0.6, vol: 0.5 }); this.addTime(-(this.idx >= 4 ? 7 : 5) * 60, this.idx >= 4 ? '-7 SEC' : '-5 SEC'); return; }
      if (this.frame % 10 === 0 && nowTile !== WATER && this.clearAhead()) this.safe = { x: this.x, y: this.y, ang: this.ang };
    }
    // time drains; water drains it much faster
    this.time -= (nowTile === WATER && this.z <= 0) ? 4 + Math.round(k * 2) : 1;
    this.moveThings();
    this.collide();
    this.checkEnd();
  }
  moveThings() {
    const k = this.k;
    for (const u of this.ufos) {
      if (!u.alive) continue;
      u.ph += u.sp;
      let tx, ty;
      if (u.kind === 'zig') { const s = Math.sin(u.ph * 2); tx = u.cx + Math.cos(u.za) * u.zl * s; ty = u.cy + Math.sin(u.za) * u.zl * s; }
      else { tx = u.cx + Math.cos(u.ph) * u.r; ty = u.cy + Math.sin(u.ph) * u.r; }
      // flee: bolt away from Sonic when he gets close, then drift home
      if (u.kind === 'flee' && this.state === 'play') {
        const d = Math.hypot(u.x - this.x, u.y - this.y);
        if (d < 80 + k * 30 && !u.dash) { u.dash = 50; const a = Math.atan2(u.y - this.y, u.x - this.x) + (Math.random() - 0.5) * 0.8; u.dx = Math.cos(a) * (3.2 + k * 1.2); u.dy = Math.sin(a) * (3.2 + k * 1.2); audio.sfx('zap', { rate: 1.6, vol: 0.3 }); }
      }
      if (u.dash > 0) {
        u.dash--; u.x += u.dx; u.y += u.dy; u.dx *= 0.97; u.dy *= 0.97;
        u.x = clamp(u.x, 40, MAP - 40); u.y = clamp(u.y, 40, MAP - 40);
        if (u.dash === 0) { u.cx = u.x - Math.cos(u.ph) * u.r; u.cy = u.y - Math.sin(u.ph) * u.r; u.dash = -40; }
      } else { if (u.dash < 0) u.dash++; u.x = tx; u.y = ty; }
    }
    for (const it of this.items) if (it.type === 'mine') { it.ph += it.sp; it.x = it.cx + Math.cos(it.ph) * it.rr; it.y = it.cy + Math.sin(it.ph * 1.3) * it.rr; }
  }
  collide() {
    for (const u of this.ufos) {
      if (!u.alive) continue;
      if (u.inv > 0) { u.inv--; continue; }
      const d = Math.hypot(u.x - this.x, u.y - this.y);
      if (d < (u.kind === 'high' ? 28 : 20) && this.z > u.h - 18 && this.z < u.h + 24) {
        if (u.kind === 'armor') {
          // first hit cracks the shell and sends it running
          u.kind = 'normal'; audio.sfx('bosshit', { vol: 0.6, rate: 1.4 }); this.pop('SHELL CRACKED!', 'white');
          const a = Math.atan2(u.y - this.y, u.x - this.x); u.dx = Math.cos(a) * 3.2; u.dy = Math.sin(a) * 3.2; u.dash = 50; u.inv = 30;
          this.vz = Math.max(this.vz, 3.2); this.burst = { x: u.x, y: u.y, h: u.h, t: 12 };
          continue;
        }
        u.alive = false; audio.sfx('pop'); audio.sfx('bosshit', { vol: 0.5 });
        this.combo++;
        if (u.kind === 'time') this.addTime(20 * 60, '+20 SEC');
        else if (this.combo > 1) { this.addTime(5 * 60, `COMBO x${this.combo}  +5 SEC`); }
        else this.pop('UFO DOWN!', 'hud');
        this.vz = Math.max(this.vz, 3.2); // bounce off for chaining
        this.burst = { x: u.x, y: u.y, h: u.h, t: 20 };
      }
    }
    for (const it of this.items) {
      if (!it.alive) continue;
      const d = Math.hypot(it.x - this.x, it.y - this.y);
      if (it.type === 'ring' && d < 12 && this.z < 30) {
        it.alive = false; this.rings++; audio.sfx('ring', { vol: 0.6 });
        if (this.rings % 10 === 0) this.addTime(3 * 60, '+3 SEC');
      }
      if (it.type === 'mine' && d < 13 && this.z < 14 && this.hitT <= 0) {
        this.hitT = 70; this.spd = -2; this.vz = 3; audio.sfx('hurt'); this.addTime(-5 * 60, '-5 SEC');
      }
    }
  }
  checkEnd() {
    const left = this.ufos.filter(u => u.alive && u.kind !== 'time').length;
    if (left === 0) { this.state = 'done'; this.st = 0; this.win = true; audio.stopMusic(0.3); }
    else if (this.time <= 0) { this.time = 0; this.state = 'done'; this.st = 0; this.win = false; audio.stopMusic(0.3); }
  }

  draw(ctx) {
    const th = this.theme;
    const gr = ctx.createLinearGradient(0, 0, 0, HZ);
    gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, HZ);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 - this.ang;
      const xx = ((((a / (Math.PI * 2)) * VW * 3) % (VW * 3)) + VW * 3) % (VW * 3) - VW;
      const y = 26 + (i % 3) * 13, w = 30 + (i % 4) * 8;
      ctx.beginPath(); ctx.ellipse(Math.round(xx), y, w / 2, 4, 0, 0, 7); ctx.fill();
    }
    // floor
    if (!this.img) { this.img = ctx.createImageData(VW, VH - HZ); this.buf = new Uint32Array(this.img.data.buffer); }
    const buf = this.buf, tex = this.tex;
    const ca = Math.cos(this.ang), sa = Math.sin(this.ang);
    const camx = this.x - ca * 50, camy = this.y - sa * 50;
    const outA = this.outA, outB = this.outB;
    for (let row = 1; row < VH - HZ; row++) {
      const dist = CAMH * FOC / row;
      const fx = camx + ca * dist, fy = camy + sa * dist;
      const kk = dist / FOC;
      const rx = -sa * kk, ry = ca * kk;
      let wx = fx - rx * VW / 2, wy = fy - ry * VW / 2;
      const o = row * VW;
      for (let x = 0; x < VW; x++) {
        const ix = wx | 0, iy = wy | 0;
        buf[o + x] = (ix >= 0 && iy >= 0 && ix < MAP && iy < MAP) ? tex[iy * MAP + ix] : (((ix >> 5) + (iy >> 5)) & 1 ? outA : outB);
        wx += rx; wy += ry;
      }
    }
    ctx.putImageData(this.img, 0, HZ);
    const haze = ctx.createLinearGradient(0, HZ, 0, HZ + 34);
    haze.addColorStop(0, th.sky[1]); haze.addColorStop(1, th.sky[1] + '00');
    ctx.fillStyle = haze; ctx.fillRect(0, HZ, VW, 34);
    // billboards
    const bills = [];
    const proj = (x, y, h) => {
      const dx = x - camx, dy = y - camy;
      const fwd = dx * ca + dy * sa, side = -dx * sa + dy * ca;
      if (fwd < 10) return null;
      const sc = FOC / fwd;
      return { fwd, sx: VW / 2 + side * sc, sy: HZ + (CAMH - h) * sc, gy: HZ + CAMH * sc, sc };
    };
    for (const u of this.ufos) if (u.alive) { const p = proj(u.x, u.y, u.h); if (p) bills.push(Object.assign(p, { kind: 'ufo', u })); }
    for (const it of this.items) if (it.alive) { const p = proj(it.x, it.y, it.h); if (p && p.fwd < 420) bills.push(Object.assign(p, { kind: it.type })); }
    if (this.burst && this.burst.t > 0) { this.burst.t--; const p = proj(this.burst.x, this.burst.y, this.burst.h); if (p) bills.push(Object.assign(p, { kind: 'burst', t: this.burst.t })); }
    bills.sort((a, b) => b.fwd - a.fwd);
    for (const b of bills) {
      if (b.kind === 'ufo') {
        const im = ufoSprite2(this.frame >> 2, b.u.kind);
        const s = Math.min(3, b.sc * 0.9);
        const w = im.width * s, h = im.height * s;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(b.sx, b.gy, w * 0.35, Math.max(1, h * 0.12), 0, 0, 7); ctx.fill();
        if (b.u.kind === 'high') { ctx.strokeStyle = 'rgba(255,120,255,0.35)'; ctx.lineWidth = Math.max(1, s); ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(b.sx, b.gy); ctx.stroke(); }
        ctx.drawImage(im, Math.round(b.sx - w / 2), Math.round(b.sy - h / 2), Math.round(w), Math.round(h));
      } else if (b.kind === 'ring') {
        const im = ringFrame((this.frame >> 3) % 4); const s = Math.min(2.5, b.sc * 0.7);
        ctx.drawImage(im, Math.round(b.sx - 8 * s), Math.round(b.sy - 8 * s), Math.round(16 * s), Math.round(16 * s));
      } else if (b.kind === 'mine') {
        const im = mineSprite(this.frame >> 3); const s = Math.min(2.5, b.sc * 0.7);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(b.sx, b.gy, 8 * s, 2 * s, 0, 0, 7); ctx.fill();
        ctx.drawImage(im, Math.round(b.sx - 12 * s), Math.round(b.sy - 12 * s), Math.round(24 * s), Math.round(24 * s));
      } else if (b.kind === 'burst') {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        const rr = (20 - b.t) * 2 * Math.min(2, b.sc);
        ctx.beginPath(); ctx.arc(b.sx, b.sy, rr, 0, 7); ctx.stroke();
      }
    }
    // sonic
    const sscale = FOC / 50;
    const sy = HZ + CAMH * sscale;
    const falling = this.fallT > 0;
    if (!falling) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(VW / 2, sy, 14 - Math.min(8, this.z / 8), 4, 0, 0, 7); ctx.fill(); }
    if (!(this.hitT > 0 && this.frame % 4 < 2)) {
      const im = backSonic((this.frame >> 2) % 4, this.z > 0);
      if (falling) { const s = this.fallT / 40; ctx.globalAlpha = s; ctx.drawImage(im, VW / 2 - 20 * s, Math.round(sy - 42 * s + (1 - s) * 30), 40 * s, 44 * s); ctx.globalAlpha = 1; }
      else ctx.drawImage(im, VW / 2 - 20, Math.round(sy - 42 - this.z * sscale * 0.5));
    }
    this.drawHud(ctx, ca, sa);
  }
  drawHud(ctx, ca, sa) {
    const secs = Math.ceil(this.time / 60);
    drawText(ctx, 'TIME', 12, 10, { style: 'hud', italic: 1 });
    drawText(ctx, String(secs), 80, 10, { style: secs < 10 && this.frame % 30 < 15 ? 'red' : 'white', align: 'right' });
    drawText(ctx, 'RINGS', 12, 24, { style: 'hud', italic: 1 });
    drawText(ctx, String(this.rings), 80, 24, { style: 'white', align: 'right' });
    const left = this.ufos.filter(u => u.alive && u.kind !== 'time').length;
    drawText(ctx, 'UFO ' + left, VW - 12, 10, { style: 'hud', align: 'right' });
    // radar
    const RX = VW - 34, RY = 44, RR = 20;
    ctx.fillStyle = 'rgba(0,0,30,0.55)'; ctx.beginPath(); ctx.arc(RX, RY, RR, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(RX, RY, RR, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(RX - 1, RY - 1, 3, 3);
    for (const u of this.ufos) {
      if (!u.alive) continue;
      const dx = u.x - this.x, dy = u.y - this.y;
      const f = dx * ca + dy * sa, s = -dx * sa + dy * ca;
      const d = Math.hypot(f, s), sc = Math.min(1, d / 300) * RR / (d || 1);
      ctx.fillStyle = ufoColor(u.kind);
      ctx.fillRect(Math.round(RX + s * sc) - 1, Math.round(RY - f * sc) - 1, 3, 3);
    }
    let y = 60;
    for (const p of this.popups) { ctx.globalAlpha = Math.min(1, p.t / 15); drawText(ctx, p.text, VW / 2, y - (60 - p.t) * 0.3, { style: p.style, align: 'center' }); y += 12; }
    ctx.globalAlpha = 1;
    if (this.state === 'intro') {
      drawText(ctx, 'SPECIAL STAGE ' + (this.idx + 1), VW / 2, 104, { style: 'white', scale: 2, align: 'center' });
      drawText(ctx, 'DESTROY ALL UFOS!', VW / 2, 130, { style: 'hud', align: 'center' });
      drawText(ctx, ['ORANGE UFOS RUN AWAY', 'YELLOW UFOS ZIGZAG', 'PINK UFOS FLY HIGH: USE GREEN PADS', 'DON\'T FALL INTO THE VOID', 'SILVER UFOS TAKE TWO HITS', 'EVERY 10 RINGS = +3 SEC', 'THE FINAL STONE'][this.idx] || '', VW / 2, 146, { style: 'cyan', align: 'center' });
    }
    if (this.state === 'done') {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, this.st / 40)})`; ctx.fillRect(0, 0, VW, VH);
      if (this.win) {
        const col = TIME_STONE_COLORS[save.data.stones.length % 7];
        drawText(ctx, 'YOU GOT A', VW / 2, 70, { style: 'blue', scale: 2, align: 'center' });
        drawText(ctx, 'TIME STONE', VW / 2, 92, { style: 'blue', scale: 2, align: 'center' });
        ctx.drawImage(timeStone(col, this.frame >> 3), VW / 2 - 24, 128, 48, 48);
      } else drawText(ctx, 'TIME UP', VW / 2, 100, { style: 'red', scale: 3, align: 'center' });
    }
  }
}
