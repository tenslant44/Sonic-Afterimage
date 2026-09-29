// Skill / puzzle objects for later zones: switches & gates, firebars, crushers, pop-up spikes, cannons.
import { audio } from './audio.js';
import { Obj, TYPES } from './objects.js';
import { clamp } from './util.js';

const NOBOX = { x: 0, y: -999, w: 0, h: 0 };

// Floor switch: stand on it to open every gate with the same id.
// timed > 0: gates close again after that many frames (a race against the clock).
export class Button extends Obj {
  constructor(g, s) { super(g, s); this.id = s.id; this.timed = s.timed || 0; this.w = 28; this.h = 8; this.solidTop = true; this.down = 0; this.always = true; }
  platformTop() { return this.y - (this.down ? 3 : 7); }
  box() { return NOBOX; }
  onStand() {
    if (this.down) { this.down = 2; return; }
    this.down = 2;
    audio.sfx('checkpoint', { rate: 1.6, vol: 0.7 });
    let any = false;
    for (const o of this.g.objs.concat(this.g.dyn)) if (o instanceof Gate && o.id === this.id) { o.open(this.timed); any = true; }
    if (any && this.timed) this.g.banner = { text: 'HURRY!', t: 60 };
  }
  update() { if (this.down > 0 && !this.timed) this.down = 1; else if (this.down > 0) this.down--; }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#303848'; ctx.fillRect(x - 16, y - 4, 32, 4);
    const h = this.down ? 2 : 5;
    ctx.fillStyle = this.timed ? '#ffb020' : '#ff3050'; ctx.fillRect(x - 11, y - 4 - h, 22, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 9, y - 4 - h, 6, 1);
  }
}

// Gate: a solid shutter from the floor up to h pixels. Opens (slides up) when its switch is pressed.
export class Gate extends Obj {
  constructor(g, s) { super(g, s); this.id = s.id; this.h = s.h || 96; this.w = 20; this.solid = true; this.lift = 0; this.openT = 0; this.always = true; this.max = 0; }
  open(t) { this.until = t ? this.g.frame + t : Infinity; this.max = t || 0; this.openT = t || -1; if (!this.g.near(this.x, 460)) this.lift = this.h; }
  box() { return NOBOX; }
  solidAt(x, y) { const top = this.y - this.h - 0, bot = this.y - this.lift; return x >= this.x - 10 && x < this.x + 10 && y >= top && y < bot; }
  update() {
    const want = this.openT !== 0 ? this.h : 0;
    const was = this.lift;
    this.lift += clamp(want - this.lift, -6, 4);
    if (this.openT > 0) {
      this.openT = Math.max(0, this.until - this.g.frame);
      if (this.openT < 90 && this.openT % 15 === 0) audio.sfx('select', { rate: 2, vol: 0.35 });
      if (this.openT === 0) audio.sfx('bosshit', { rate: 0.7, vol: 0.4 });
    }
    // closing on the player shoves them out instead of trapping them
    if (this.lift < was) { const p = this.g.player; if (Math.abs(p.x - this.x) < 12 && p.y > this.y - this.h && p.y - p.hr < this.y - this.lift) p.x = this.x + (p.x < this.x ? -14 : 14); }
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - 10 - cam.x), top = Math.round(this.y - this.h - cam.y), bot = Math.round(this.y - this.lift - cam.y);
    const h = bot - top;
    // frame
    ctx.fillStyle = '#202530'; ctx.fillRect(x - 3, top - 6, 26, 6);
    if (h > 0) {
      ctx.fillStyle = '#5a6478'; ctx.fillRect(x, top, 20, h);
      ctx.fillStyle = '#8a96b0'; for (let yy = top + 4; yy < bot - 2; yy += 12) ctx.fillRect(x + 2, yy, 16, 3);
      ctx.fillStyle = this.max ? '#ffb020' : '#ff3050'; ctx.fillRect(x + 7, bot - 10, 6, 6);
    }
    if (this.openT > 0 && this.max) {
      const k = this.openT / this.max;
      ctx.fillStyle = '#000'; ctx.fillRect(x - 6, top - 14, 32, 5);
      ctx.fillStyle = k < 0.3 ? '#ff4040' : '#ffd040'; ctx.fillRect(x - 5, top - 13, Math.round(30 * k), 3);
    }
  }
}

// Rotating chain of fireballs around a pivot.
export class Firebar extends Obj {
  constructor(g, s) { super(g, s); this.n = s.n || 5; this.spd = s.speed || 0.03; this.ang = s.phase || 0; this.dir = s.dir || 1; this.always = false; }
  box() { const R = this.n * 12 + 8; return { x: this.x - R, y: this.y - R, w: R * 2, h: R * 2 }; }
  update() { this.ang += this.spd * this.dir; }
  touch(p) {
    for (let i = 1; i <= this.n; i++) {
      const bx = this.x + Math.cos(this.ang) * i * 12, by = this.y + Math.sin(this.ang) * i * 12;
      if (Math.abs(p.x - bx) < 13 && Math.abs(p.y - by) < p.hr + 4) { p.hurt(bx); return; }
    }
  }
  draw(ctx, cam) {
    const cx = this.x - cam.x, cy = this.y - cam.y;
    ctx.fillStyle = '#404048'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#808890'; ctx.beginPath(); ctx.arc(cx - 2, cy - 2, 2, 0, 7); ctx.fill();
    for (let i = 1; i <= this.n; i++) {
      const bx = Math.round(cx + Math.cos(this.ang) * i * 12), by = Math.round(cy + Math.sin(this.ang) * i * 12);
      const f = (this.t + i * 3) % 8 < 4;
      ctx.fillStyle = '#ff5010'; ctx.beginPath(); ctx.arc(bx, by, 6, 0, 7); ctx.fill();
      ctx.fillStyle = f ? '#ffe040' : '#ffb020'; ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, 7); ctx.fill();
    }
  }
}

// Crusher: a heavy block that slams from the ceiling to the floor on a cycle. Ride its top or slip under it.
export class Crusher extends Obj {
  constructor(g, s) {
    super(g, s); this.top = s.top; this.floor = s.y; this.w = s.w || 48; this.bh = 40;
    this.period = s.period || 150; this.t = s.phase || 0; this.solid = true; this.solidTop = true; this.always = true;
    this.pos = 0; // 0 up .. 1 down
  }
  get by() { return this.top + (this.floor - this.bh - this.top) * this.pos; } // block top y
  platformTop() { return this.by; }
  solidAt(x, y) { return x >= this.x - this.w / 2 && x < this.x + this.w / 2 && y >= this.by + 4 && y < this.by + this.bh; }
  box() { return { x: this.x - this.w / 2 + 3, y: this.by + this.bh - 6, w: this.w - 6, h: 8 }; }
  update() {
    this.t++;
    const k = this.t % this.period, P = this.period;
    const was = this.pos;
    if (k < P * 0.45) this.pos = 0;                                 // waiting up
    else if (k < P * 0.6) this.pos = 0;                             // shaking warning
    else if (k < P * 0.65) this.pos = Math.min(1, (k - P * 0.6) / (P * 0.05)); // slam
    else if (k < P * 0.8) this.pos = 1;                             // resting down
    else this.pos = 1 - (k - P * 0.8) / (P * 0.2);                  // rising
    this.falling = this.pos > was;
    if (was < 1 && this.pos === 1 && this.g.near(this.x, 300)) { audio.sfx('boom', { vol: 0.35, rate: 1.6 }); this.g.shake = Math.max(this.g.shake, 4); }
    this.shakeX = (k >= P * 0.45 && k < P * 0.6) ? (this.t % 4 < 2 ? 1 : -1) : 0;
    this.dy = this.pos !== was ? (this.floor - this.bh - this.top) * (this.pos - was) : 0;
  }
  touch(p) { if (this.falling && p.y > this.by) p.hurt(this.x); }
  draw(ctx, cam) {
    const x = Math.round(this.x - this.w / 2 - cam.x + (this.shakeX || 0)), y = Math.round(this.by - cam.y), top = Math.round(this.top - cam.y);
    ctx.fillStyle = '#303038'; ctx.fillRect(x + this.w / 2 - 4, top, 8, Math.max(0, y - top));
    ctx.fillStyle = '#50505c'; ctx.fillRect(x, y, this.w, this.bh);
    ctx.fillStyle = '#70707e'; ctx.fillRect(x + 2, y + 2, this.w - 4, 6);
    ctx.fillStyle = '#ffd030'; for (let i = 0; i < this.w; i += 12) ctx.fillRect(x + i + 2, y + 14, 6, 6);
    ctx.fillStyle = '#c0c0d0';
    for (let i = 0; i < this.w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + this.bh); ctx.lineTo(x + i + 4, y + this.bh + 7); ctx.lineTo(x + i + 8, y + this.bh); ctx.fill(); }
  }
}

// Spikes that pop out of the floor on a rhythm.
export class PopSpikes extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w || 32; this.period = s.period || 120; this.t = s.phase || 0; this.always = false; }
  up() { const k = this.t % this.period; return k > this.period * 0.5; }
  warn() { const k = this.t % this.period; return k > this.period * 0.38 && k <= this.period * 0.5; }
  box() { return this.up() ? { x: this.x, y: this.y - 14, w: this.w, h: 14 } : NOBOX; }
  update() { this.t++; if (this.t % this.period === Math.floor(this.period * 0.5) + 1 && this.g.near(this.x, 220)) audio.sfx('zap', { rate: 1.8, vol: 0.25 }); }
  touch(p) { p.hurt(this.x + this.w / 2); }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#282830'; ctx.fillRect(x, y - 3, this.w, 3);
    const h = this.up() ? 14 : this.warn() ? 3 : 0;
    if (!h) { ctx.fillStyle = '#606070'; for (let i = 0; i < this.w; i += 8) ctx.fillRect(x + i + 3, y - 3, 2, 1); return; }
    for (let i = 0; i < this.w; i += 8) {
      ctx.fillStyle = '#d8d8e8'; ctx.beginPath(); ctx.moveTo(x + i, y - 2); ctx.lineTo(x + i + 4, y - 2 - h); ctx.lineTo(x + i + 8, y - 2); ctx.fill();
      ctx.fillStyle = '#9090a0'; ctx.fillRect(x + i + 4, y - 2 - h + 2, 1, h - 2);
    }
  }
}

// Cannon: fires slow bullets at the player when in range. Destroyable with a spin attack.
export class Cannon extends Obj {
  constructor(g, s) { super(g, s); this.w = 22; this.h = 18; this.rate = s.rate || 120; this.t = s.phase || 0; }
  update() {
    this.t++;
    const p = this.g.player;
    this.face = p.x < this.x ? -1 : 1;
    if (this.t % this.rate === 0 && Math.abs(p.x - this.x) < 260 && Math.abs(p.y - this.y) < 160) {
      const dx = p.x - this.x, dy = (p.y - 6) - (this.y - 12), d = Math.hypot(dx, dy) || 1;
      this.g.addObj(new Bullet(this.g, { x: this.x + this.face * 10, y: this.y - 12, vx: dx / d * 2.4, vy: dy / d * 2.4 }));
      audio.sfx('shot', { vol: 0.5 });
    }
  }
  touch(p) {
    if (p.ball || p.invinc) {
      this.alive = false; audio.sfx('pop'); this.g.fx.explode(this.x, this.y - 8); this.g.addScore(200, this.x, this.y - 20);
      if (!p.ground) p.ysp = -Math.abs(p.ysp) * p.gdir;
    } else p.hurt(this.x);
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#404850'; ctx.fillRect(x - 11, y - 8, 22, 8);
    ctx.fillStyle = '#606a78'; ctx.beginPath(); ctx.arc(x, y - 10, 8, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2a2f36'; ctx.fillRect(this.face > 0 ? x + 2 : x - 14, y - 14, 12, 6);
    if (this.t % this.rate > this.rate - 20) { ctx.fillStyle = '#ff4020'; ctx.fillRect(x - 2, y - 13, 4, 3); }
  }
}
class Bullet extends Obj {
  constructor(g, s) { super(g, s); this.vx = s.vx; this.vy = s.vy; this.life = 200; this.always = true; }
  box() { return { x: this.x - 4, y: this.y - 4, w: 8, h: 8 }; }
  update() { this.x += this.vx; this.y += this.vy; if (--this.life <= 0 || this.g.level.solid(this.x, this.y)) this.alive = false; }
  touch(p) { if (p.invinc) { this.alive = false; return; } if (p.hurt(this.x)) this.alive = false; }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#200808'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = this.life % 6 < 3 ? '#ff6040' : '#ffd040'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
  }
}


// Key: floating collectible. Opens every KeyDoor with the same id.
export class Key extends Obj {
  constructor(g, s) { super(g, s); this.id = s.id; this.w = 18; this.h = 18; this.always = true; }
  box() { return { x: this.x - 9, y: this.y - 9 + Math.sin(this.t * 0.08) * 3, w: 18, h: 18 }; }
  update() { this.t++; }
  touch() {
    this.alive = false; this.g.keys = this.g.keys || {}; this.g.keys[this.id] = true;
    audio.sfx('checkpoint', { rate: 1.3 }); this.g.banner = { text: 'KEY FOUND! FIND THE DOOR', t: 100 };
    for (let i = 0; i < 6; i++) this.g.fx.sparkle(this.x + (Math.random() - 0.5) * 20, this.y + (Math.random() - 0.5) * 20);
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y + Math.sin(this.t * 0.08) * 3);
    ctx.fillStyle = 'rgba(255,240,120,0.25)'; ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(this.t * 0.15) * 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5000'; ctx.fillRect(x - 2, y - 2, 11, 4); ctx.fillRect(x + 5, y + 1, 2, 4); ctx.fillRect(x + 8, y + 1, 2, 3);
    ctx.fillStyle = '#ffd030'; ctx.fillRect(x - 1, y - 1, 10, 2); ctx.fillRect(x + 5, y + 1, 2, 3); ctx.fillRect(x + 8, y + 1, 1, 2);
    ctx.fillStyle = '#7a5000'; ctx.beginPath(); ctx.arc(x - 5, y, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd030'; ctx.beginPath(); ctx.arc(x - 5, y, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5000'; ctx.beginPath(); ctx.arc(x - 5, y, 2, 0, 7); ctx.fill();
  }
}
// Locked door: a solid wall that slides open when Sonic touches it holding the right key.
export class KeyDoor extends Obj {
  constructor(g, s) { super(g, s); this.id = s.id; this.h = s.h || 96; this.w = 24; this.solid = true; this.lift = 0; this.opening = false; this.always = true; }
  box() { return { x: this.x - 16, y: this.y - this.h, w: 32, h: this.h }; }
  solidAt(x, y) { return !this.gone && x >= this.x - 12 && x < this.x + 12 && y >= this.y - this.h && y < this.y - this.lift; }
  touch() {
    if (this.opening) return;
    if (this.g.keys && this.g.keys[this.id]) { this.opening = true; delete this.g.keys[this.id]; audio.sfx('bosshit', { rate: 1.4, vol: 0.6 }); }
    else if (!this.warned || this.g.frame - this.warned > 120) { this.warned = this.g.frame; this.g.banner = { text: 'LOCKED - FIND THE KEY', t: 80 }; audio.sfx('select', { rate: 0.6 }); }
  }
  update() { this.t++; if (this.opening && this.lift < this.h) { this.lift = Math.min(this.h, this.lift + 3); if (this.lift >= this.h) this.gone = true; } }
  draw(ctx, cam) {
    const x = Math.round(this.x - 12 - cam.x), top = Math.round(this.y - this.h - cam.y), bot = Math.round(this.y - this.lift - cam.y);
    ctx.fillStyle = '#1a1420'; ctx.fillRect(x - 3, top - 6, 30, 6);
    const h = bot - top; if (h <= 0) return;
    ctx.fillStyle = '#6a3c1c'; ctx.fillRect(x, top, 24, h);
    ctx.fillStyle = '#8a5428'; for (let yy = top + 3; yy < bot - 2; yy += 10) ctx.fillRect(x + 2, yy, 20, 6);
    ctx.fillStyle = '#ffd030'; ctx.fillRect(x, top, 2, h); ctx.fillRect(x + 22, top, 2, h);
    const ly = bot - 26;
    if (ly > top) {
      ctx.fillStyle = '#ffd030'; ctx.fillRect(x + 6, ly, 12, 12);
      ctx.fillStyle = '#201008'; ctx.beginPath(); ctx.arc(x + 12, ly + 5, 2.5, 0, 7); ctx.fill(); ctx.fillRect(x + 11, ly + 6, 2, 4);
      ctx.strokeStyle = '#ffd030'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 12, ly, 4, Math.PI, 0); ctx.stroke();
    }
  }
}
// Swinging platform on a chain.
export class Swing extends Obj {
  constructor(g, s) {
    super(g, s); this.px = s.x; this.py = s.y; this.len = s.len || 80; this.amp = s.amp || 1; this.spd = s.speed || 0.025; this.phase = s.phase || 0;
    this.w = s.w || 48; this.solidTop = true; this.always = true; this.dx = 0; this.dy = 0; this.place(0);
  }
  place(t) { const a = Math.sin(t * this.spd + this.phase) * this.amp; this.x = this.px + Math.sin(a) * this.len; this.y = this.py + Math.cos(a) * this.len; }
  platformTop() { return this.y - 8; }
  box() { return NOBOX; }
  update() { this.t++; const ox = this.x, oy = this.y; this.place(this.t); this.dx = this.x - ox; this.dy = this.y - oy; }
  draw(ctx, cam) {
    const P = this.g.P.g;
    ctx.fillStyle = '#707078';
    for (let i = 0; i <= 8; i++) { const k = i / 8; ctx.fillRect(Math.round(this.px + (this.x - this.px) * k - cam.x) - 1, Math.round(this.py + (this.y - 8 - this.py) * k - cam.y) - 1, 3, 3); }
    ctx.fillStyle = '#404048'; ctx.beginPath(); ctx.arc(Math.round(this.px - cam.x), Math.round(this.py - cam.y), 4, 0, 7); ctx.fill();
    const x = Math.round(this.x - this.w / 2 - cam.x), y = Math.round(this.y - 8 - cam.y);
    ctx.fillStyle = P.dark; ctx.fillRect(x, y, this.w, 12);
    ctx.fillStyle = P.accent; ctx.fillRect(x + 1, y + 1, this.w - 2, 4);
    ctx.fillStyle = P.a; ctx.fillRect(x + 1, y + 5, this.w - 2, 6);
  }
}
// Conveyor belt laid on the floor: carries Sonic along (speed px/frame, sign = direction).
export class Conveyor extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.speed = s.speed || 2; this.solidTop = true; this.always = true; this.dx = this.speed; this.dy = 0; this.x = s.x + s.w / 2; }
  platformTop() { return this.y; }
  box() { return NOBOX; }
  update() { this.t++; }
  draw(ctx, cam) {
    const x = Math.round(this.x - this.w / 2 - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#202028'; ctx.fillRect(x, y, this.w, 6);
    ctx.fillStyle = this.speed > 0 ? '#ffb020' : '#20b0ff';
    const off = ((this.t * this.speed) % 16 + 16) % 16;
    for (let i = -16; i < this.w; i += 16) { const xx = x + i + off; if (xx >= x && xx + 6 <= x + this.w) ctx.fillRect(xx, y + 1, 6, 3); }
    ctx.fillStyle = '#50505c'; ctx.fillRect(x, y + 4, this.w, 2);
  }
}
// Buzz saw sliding on a rail (h or v).
export class Saw extends Obj {
  constructor(g, s) { super(g, s); this.bx = s.x; this.by = s.y; this.move = s.move || 'h'; this.range = s.range || 60; this.spd = s.speed || 0.03; this.phase = s.phase || 0; this.r = s.r || 14; this.always = true; }
  box() { return { x: this.x - this.r + 3, y: this.y - this.r + 3, w: this.r * 2 - 6, h: this.r * 2 - 6 }; }
  update() { this.t++; const k = Math.sin(this.t * this.spd + this.phase) * this.range; if (this.move === 'h') this.x = this.bx + k; else this.y = this.by + k; }
  touch(p) { p.hurt(this.x); }
  draw(ctx, cam) {
    const cx = Math.round(this.x - cam.x), cy = Math.round(this.y - cam.y);
    ctx.strokeStyle = 'rgba(60,60,70,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
    if (this.move === 'h') { ctx.moveTo(this.bx - this.range - cam.x, this.by - cam.y); ctx.lineTo(this.bx + this.range - cam.x, this.by - cam.y); }
    else { ctx.moveTo(this.bx - cam.x, this.by - this.range - cam.y); ctx.lineTo(this.bx - cam.x, this.by + this.range - cam.y); }
    ctx.stroke();
    const a = this.t * 0.4;
    ctx.fillStyle = '#c8ccd8'; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const rr = i % 2 ? this.r - 4 : this.r; const aa = a + i * Math.PI / 8; i ? ctx.lineTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr) : ctx.moveTo(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr); }
    ctx.fill(); ctx.fillStyle = '#606878'; ctx.beginPath(); ctx.arc(cx, cy, this.r * 0.45, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff4030'; ctx.fillRect(cx - 1, cy - 1, 3, 3);
  }
}

export const HAZARDS = { button: Button, gate: Gate, firebar: Firebar, crusher: Crusher, popspikes: PopSpikes, cannon: Cannon, key: Key, keydoor: KeyDoor, swing: Swing, conveyor: Conveyor, saw: Saw };
Object.assign(TYPES, HAZARDS);
