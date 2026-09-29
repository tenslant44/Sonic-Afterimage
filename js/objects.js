// Stage objects, enemies and hazards.
import { audio } from './audio.js';
import * as S from './sprites.js';
import { rectsOverlap, sign, clamp } from './util.js';

export class Obj {
  constructor(g, s) {
    this.g = g; this.x = s.x; this.y = s.y; this.spawn = s; this.alive = true;
    this.w = 16; this.h = 16; this.t = 0;
    this.always = false; // update even far from camera
  }
  box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  update() { }
  draw() { }
  touch() { }
}

const img = (ctx, im, x, y, cam, flip = false) => {
  if (flip) {
    ctx.save(); ctx.translate(Math.round(x - cam.x + im.width / 2), Math.round(y - cam.y)); ctx.scale(-1, 1);
    ctx.drawImage(im, -im.width / 2, 0); ctx.restore();
  } else ctx.drawImage(im, Math.round(x - cam.x), Math.round(y - cam.y));
};

// ------------------------------------------------------------------ rings
export class Ring extends Obj {
  constructor(g, s) { super(g, s); this.w = 14; this.h = 14; this.y += 7; }
  update() {
    const p = this.g.player;
    if (p.shield && p.shield === 'magnet') { }
  }
  touch(p) {
    if (p.dead) return;
    this.alive = false; this.g.addRings(1);
    this.g.fx.sparkle(this.x, this.y - 7);
  }
  draw(ctx, cam) { img(ctx, S.ringFrame(this.g.ringFrame), this.x - 8, this.y - 15, cam); }
}
export class LooseRing extends Obj {
  constructor(g, s) { super(g, s); this.xsp = s.xsp; this.ysp = s.ysp; this.life = 256; this.w = 14; this.h = 14; this.always = true; this.grace = 64; }
  update() {
    const g = this.g, lv = g.level;
    this.ysp += 0.09375 * g.player.gdir;
    this.x += this.xsp; this.y += this.ysp;
    if (this.ysp > 0 && lv.solidF(this.x, this.y)) { this.ysp *= -0.75; this.y -= 2; }
    if (this.ysp < 0 && lv.solid(this.x, this.y - 14)) this.ysp *= -0.75;
    if (lv.solid(this.x + sign(this.xsp) * 7, this.y - 7)) this.xsp *= -0.75;
    if (--this.life <= 0) this.alive = false;
    if (this.grace > 0) this.grace--;
  }
  touch(p) { if (this.grace > 0 || p.state === 'hurt') return; this.alive = false; this.g.addRings(1); this.g.fx.sparkle(this.x, this.y - 7); }
  draw(ctx, cam) {
    if (this.life < 60 && this.life % 4 < 2) return;
    img(ctx, S.ringFrame(Math.floor(this.g.frame / 2) % 4), this.x - 8, this.y - 15, cam);
  }
}

// ------------------------------------------------------------------ monitor
export class Monitor extends Obj {
  constructor(g, s) { super(g, s); this.kind = s.kind; this.w = 28; this.h = 30; this.solidTop = true; }
  platformTop() { return this.y - 30; }
  touch(p) {
    const hb = p.hitbox();
    const fromAbove = p.ysp * p.gdir > 0 && hb.y + hb.h - 8 < this.y - 22;
    if (p.ball) {
      if (!p.ground && fromAbove) { p.ysp = -p.ysp * 0.9; if (Math.abs(p.ysp) < 3) p.ysp = -3; }
      this.pop();
    } else if (p.ground && Math.abs(p.x - this.x) < 20 && hb.y + hb.h > this.y - 20) {
      // treat as wall
      p.x = this.x + sign(p.x - this.x) * 24; if (sign(p.gsp) === -sign(p.x - this.x)) p.gsp = 0;
    }
  }
  pop() {
    this.alive = false;
    audio.sfx('monitor'); audio.sfx('pop', { vol: 0.5 });
    this.g.fx.explode(this.x, this.y - 15);
    this.g.addObj(new MonitorIcon(this.g, { x: this.x, y: this.y - 16, kind: this.kind }));
    this.g.addScore(10);
    this.g.addObj(new Broken(this.g, { x: this.x, y: this.y }));
  }
  draw(ctx, cam) { img(ctx, S.monitorSprite(this.kind, Math.floor(this.g.frame / 3)), this.x - 15, this.y - 32, cam); }
}
class Broken extends Obj {
  constructor(g, s) { super(g, s); }
  draw(ctx, cam) { ctx.fillStyle = '#606870'; ctx.fillRect(Math.round(this.x - 14 - cam.x), Math.round(this.y - 6 - cam.y), 28, 6); ctx.fillStyle = '#a0a8b0'; ctx.fillRect(Math.round(this.x - 14 - cam.x), Math.round(this.y - 6 - cam.y), 28, 2); }
}
class MonitorIcon extends Obj {
  constructor(g, s) { super(g, s); this.kind = s.kind; this.always = true; this.vy = -3; }
  update() {
    this.t++; this.y += this.vy; this.vy = Math.min(0, this.vy + 0.1);
    if (this.t === 32) this.g.monitorEffect(this.kind);
    if (this.t > 60) this.alive = false;
  }
  draw(ctx, cam) {
    const s = S.monitorSprite(this.kind, 0);
    ctx.drawImage(s, 4, 6, 22, 18, Math.round(this.x - 11 - cam.x), Math.round(this.y - 9 - cam.y), 22, 18);
  }
}

// ------------------------------------------------------------------ springs / boosters / bumpers
export class Spring extends Obj {
  constructor(g, s) { super(g, s); this.dir = s.dir; this.power = s.power || 'yellow'; this.w = 28; this.h = 16; this.cmp = 0; }
  update() { if (this.cmp > 0) this.cmp--; }
  box() {
    if (this.dir === 'right' || this.dir === 'left') return { x: this.x - 8, y: this.y - 28, w: 16, h: 28 };
    return { x: this.x - 14, y: this.y - 16, w: 28, h: 16 };
  }
  touch(p) {
    const f = this.power === 'red' ? 16 : 10;
    const g = this.g;
    if (this.dir === 'up') {
      if (p.ysp * p.gdir < -1 && !p.ground) return;
      p.y = this.y - 16 - p.hr; p.bounce(null, -f);
    } else if (this.dir === 'down') { p.bounce(null, f); }
    else if (this.dir === 'right') { p.bounce(f, null); p.gsp = f; p.controlLock = 16; }
    else if (this.dir === 'left') { p.bounce(-f, null); p.gsp = -f; p.controlLock = 16; }
    else if (this.dir === 'upright') { p.y = this.y - 16 - p.hr; p.bounce(f * 0.75, -f * 0.9); }
    else if (this.dir === 'upleft') { p.y = this.y - 16 - p.hr; p.bounce(-f * 0.75, -f * 0.9); }
    this.cmp = 10;
    audio.sfx('spring');
  }
  draw(ctx, cam) {
    const s = S.springSprite(this.power, this.cmp > 0 && this.cmp < 8);
    ctx.save(); ctx.translate(Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    const rot = { up: 0, right: Math.PI / 2, left: -Math.PI / 2, down: Math.PI, upright: Math.PI / 4, upleft: -Math.PI / 4 }[this.dir];
    if (this.dir === 'right' || this.dir === 'left') ctx.translate(0, -14);
    ctx.rotate(rot);
    ctx.drawImage(s, -16, -22);
    ctx.restore();
  }
}
export class Booster extends Obj {
  constructor(g, s) { super(g, s); this.dir = s.dir || 1; this.w = 32; this.h = 12; }
  touch(p) {
    if (!p.ground) return;
    const v = Math.max(Math.abs(p.gsp), 12) * this.dir;
    if (Math.abs(p.gsp) < 11.9 || sign(p.gsp) !== this.dir) audio.sfx('dash');
    p.gsp = v; p.facing = this.dir;
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - 16 - cam.x), y = Math.round(this.y - 6 - cam.y);
    ctx.fillStyle = '#404850'; ctx.fillRect(x, y, 32, 6);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = (Math.floor(this.g.frame / 4) + i) % 3 === 0 ? '#ffff60' : '#e08020';
      const ax = x + 4 + i * 9;
      ctx.fillRect(ax, y + 1, 4, 4); ctx.fillRect(ax + 4, y + 2, 2, 2);
    }
  }
}
export class Bumper extends Obj {
  constructor(g, s) { super(g, s); this.w = 26; this.h = 26; this.y += 13; this.hit = 0; }
  update() { if (this.hit) this.hit--; }
  touch(p) {
    if (this.hit > 4) return;
    const cx = this.x, cy = this.y - 13;
    const a = Math.atan2(p.y - cy, p.x - cx);
    p.ground = false; p.rail = null;
    p.xsp = Math.cos(a) * 7; p.ysp = Math.sin(a) * 7;
    p.jumping = false;
    this.hit = 10; audio.sfx('bumper');
    if (this.g.bumperScore++ < 10) this.g.addScore(10, this.x, this.y - 30);
  }
  draw(ctx, cam) { img(ctx, S.bumperSprite(this.hit > 0 ? 1 : 0), this.x - 16, this.y - 29, cam); }
}
export class DrumPad extends Obj {
  constructor(g, s) { super(g, s); this.w = 40; this.h = 10; this.hit = 0; this.beat = s.beat; }
  update() { if (this.hit) this.hit--; }
  onBeat() { return (this.g.frame % 32) < 9; }
  touch(p) {
    if (p.ysp < 0) return;
    const on = this.onBeat();
    p.y = this.y - 10 - p.hr;
    p.bounce(null, on ? -12 : -8.5);
    p.jumping = true; p.rolling = true; p.setRadius(true); p.spring = false;
    this.hit = 12;
    audio.sfx('bumper', { rate: on ? 1.3 : 0.8 });
    if (on) { this.g.addScore(100, this.x, this.y - 20); this.g.fx.sparkle(this.x, this.y - 10); }
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    const on = this.onBeat();
    ctx.fillStyle = '#505058'; ctx.fillRect(x - 22, y - 4, 44, 14);
    ctx.fillStyle = on ? '#ffe040' : '#c07020';
    ctx.beginPath(); ctx.ellipse(x, y - 4, 20, this.hit ? 3 : 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff8c0'; ctx.fillRect(x - 8, y - 7, 6, 2);
  }
}

// ------------------------------------------------------------------ hazards
export class Spikes extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w || 32; this.h = 16; this.ceil = s.ceil; this.solidTop = !s.ceil; }
  platformTop() { return this.y - 16; }
  box() { return this.ceil ? { x: this.x, y: this.y, w: this.w, h: 16 } : { x: this.x, y: this.y - 16, w: this.w, h: 16 }; }
  touch(p) { p.hurt(this.x + this.w / 2); if (p.state === 'hurt') audio.sfx('hurt'); }
  draw(ctx, cam) { img(ctx, S.spikesSprite(this.w, this.ceil), this.x, this.ceil ? this.y : this.y - 16, cam); }
}
export class Electric extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.h = 6; this.phase = s.phase || 0; }
  on() { return (this.g.frame + this.phase) % 150 > 100; }
  warn() { return (this.g.frame + this.phase) % 150 > 80; }
  box() { return { x: this.x, y: this.y - 8, w: this.w, h: 8 }; }
  touch(p) { if (this.on() && p.ground) { p.hurt(this.x + this.w / 2); } }
  update() { if (this.on() && (this.g.frame + this.phase) % 150 === 101 && this.g.near(this.x, 300)) audio.sfx('zap', { vol: 0.5 }); }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#303840'; ctx.fillRect(x, y - 3, this.w, 3);
    ctx.fillStyle = this.warn() ? (this.g.frame % 4 < 2 ? '#ffff80' : '#4080ff') : '#205080';
    ctx.fillRect(x + 2, y - 3, this.w - 4, 1);
    if (this.on()) {
      ctx.strokeStyle = '#a0e0ff'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= this.w; i += 4) ctx.lineTo(x + i, y - 4 - Math.random() * 14);
      ctx.stroke();
    }
  }
}
export class BounceFloor extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.h = 6; this.squash = 0; }
  box() { return { x: this.x, y: this.y - 4, w: this.w, h: 6 }; }
  update() { if (this.squash) this.squash--; }
  touch(p) {
    if (!p.ground || p.gdir !== 1) return;
    p.bounce(null, input_jumpHeld() ? -11 : -8);
    p.jumping = true; p.rolling = true; p.setRadius(true); p.spring = false;
    this.squash = 10; audio.sfx('spring', { rate: 1.3, vol: 0.6 });
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#40c040'; ctx.fillRect(x, y - 5 + (this.squash ? 2 : 0), this.w, 5 - (this.squash ? 2 : 0));
    ctx.fillStyle = '#a0ffa0'; for (let i = 4; i < this.w; i += 16) ctx.fillRect(x + i, y - 5 + (this.squash ? 2 : 0), 8, 1);
  }
}
import { input } from './input.js';
const input_jumpHeld = () => input.held('jump');

export class Lava extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.h = s.h; }
  box() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  touch(p) {
    if (p.invinc) { p.bounce(null, -6, false); return; }
    if (p.hurt(p.x)) { p.ysp = -7; audio.sfx('fire'); }
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#e04010'; ctx.fillRect(x, y + 4, this.w, this.h);
    ctx.fillStyle = '#ff8020';
    for (let i = 0; i < this.w; i += 8) { const hh = 3 + Math.sin((i + this.g.frame * 2) * 0.1) * 2; ctx.fillRect(x + i, y + 4 - hh, 8, hh + 2); }
    ctx.fillStyle = '#ffe060';
    for (let i = 0; i < this.w; i += 24) ctx.fillRect(x + i + (this.g.frame >> 2) % 16, y + 6, 6, 2);
  }
}
export class FireJet extends Obj {
  constructor(g, s) { super(g, s); this.w = 16; this.h = 80; this.phase = s.phase || 0; }
  on() { return (this.g.frame + this.phase) % 140 < 50; }
  box() { return this.on() ? { x: this.x - 8, y: this.y - 80, w: 16, h: 80 } : { x: 0, y: -999, w: 0, h: 0 }; }
  update() { if ((this.g.frame + this.phase) % 140 === 0 && this.g.near(this.x, 260)) audio.sfx('fire', { vol: 0.6 }); }
  touch(p) { p.hurt(this.x); }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#505058'; ctx.fillRect(x - 10, y - 8, 20, 8); ctx.fillStyle = '#303038'; ctx.fillRect(x - 6, y - 10, 12, 3);
    const ph = (this.g.frame + this.phase) % 140;
    if (ph > 120) { ctx.fillStyle = '#ff8020'; ctx.fillRect(x - 3, y - 14 - (ph % 4), 6, 4); }
    if (this.on()) {
      for (let i = 0; i < 10; i++) {
        const yy = y - 10 - i * 7 - (this.g.frame * 3 % 7);
        const w = 12 - i * 0.6 + Math.sin(this.g.frame + i) * 2;
        ctx.fillStyle = i < 3 ? '#fff0a0' : i < 6 ? '#ffb020' : '#ff5010';
        ctx.fillRect(x - w / 2, yy, w, 7);
      }
    }
  }
}
export class LightningZone extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.timer = 90; this.strikeX = null; this.bolt = 0; }
  box() { return { x: 0, y: -999, w: 0, h: 0 }; }
  update() {
    const p = this.g.player;
    const inside = p.x > this.x - 40 && p.x < this.x + this.w + 40;
    if (this.bolt > 0) {
      this.bolt--;
      if (this.bolt > 8 && Math.abs(p.x - this.strikeX) < 14 && p.y < this.y + 4) p.hurt(this.strikeX);
    }
    if (!inside) return;
    if (--this.timer === 45) { this.strikeX = clamp(p.x + p.xsp * 30, this.x, this.x + this.w); }
    if (this.timer <= 0) { this.timer = 110; this.bolt = 16; audio.sfx('thunder', { vol: 0.8 }); this.g.flash = 3; this.g.shake = 6; }
  }
  draw(ctx, cam) {
    if (this.timer < 45 && this.timer > 0 && this.strikeX != null && this.timer % 6 < 3) {
      ctx.fillStyle = '#ffff60'; const x = Math.round(this.strikeX - cam.x), y = Math.round(this.y - cam.y);
      ctx.fillRect(x - 10, y - 2, 20, 2); ctx.fillRect(x - 1, y - 12, 2, 8);
    }
    if (this.bolt > 0) {
      const x = this.strikeX - cam.x, y = this.y - cam.y;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath();
      let bx = x; ctx.moveTo(bx, -10);
      for (let yy = 0; yy < y; yy += 16) { bx = x + (Math.random() - 0.5) * 20; ctx.lineTo(bx, yy); }
      ctx.lineTo(x, y); ctx.stroke();
      ctx.strokeStyle = '#ffff80'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ platforms
export class Platform extends Obj {
  constructor(g, s) {
    super(g, s); this.move = s.move; this.range = s.range || 40; this.speed = s.speed || 0.02; this.phase = s.phase || 0;
    this.w = s.w || 48; this.h = 16; this.bx = s.x; this.by = s.y; this.dx = 0; this.dy = 0; this.solidTop = true;
    this.fallT = -1; this.vy = 0; this.always = true; this.stood = false; this.rise = 0;
  }
  platformTop() { return this.y - 8; }
  onStand() { this.stood = true; if (this.move === 'fall' && this.fallT < 0) this.fallT = 30; }
  update() {
    this.t++;
    const ox = this.x, oy = this.y;
    const ph = this.t * this.speed + this.phase;
    switch (this.move) {
      case 'h': this.x = this.bx + Math.sin(ph) * this.range; break;
      case 'v': this.y = this.by + Math.sin(ph) * this.range; break;
      case 'airship': this.x = this.bx + Math.sin(ph) * this.range; this.y = this.by + Math.sin(ph * 2.1) * 6; break;
      case 'lantern':
        if (this.stood) this.rise = Math.min(this.rise + 0.4, 140); else this.rise = Math.max(0, this.rise - 0.3);
        this.y = this.by - this.rise + Math.sin(ph) * 4; break;
      case 'fall':
        if (this.fallT > 0) { this.fallT--; this.x = this.bx + (this.fallT % 4 < 2 ? 1 : -1); }
        else if (this.fallT === 0) { this.vy += 0.2; this.y += this.vy; if (this.y > this.by + 600) { this.fallT = -2; this.respawn = 240; } }
        else if (this.fallT === -2) { if (--this.respawn <= 0 && !this.g.near(this.bx, 260)) { this.fallT = -1; this.y = this.by; this.vy = 0; this.x = this.bx; } }
        break;
    }
    this.dx = this.x - ox; this.dy = this.y - oy;
    this.stood = false;
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - this.w / 2 - cam.x), y = Math.round(this.y - 8 - cam.y);
    const P = this.g.P.g;
    if (this.move === 'lantern') {
      ctx.fillStyle = '#ff4040'; ctx.beginPath(); ctx.ellipse(x + this.w / 2, y + 14, this.w / 2 - 4, 13, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd060'; ctx.globalAlpha = 0.6 + Math.sin(this.t * 0.1) * 0.2; ctx.beginPath(); ctx.ellipse(x + this.w / 2, y + 14, this.w / 2 - 12, 8, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#402010'; ctx.fillRect(x + 2, y, this.w - 4, 4); ctx.fillRect(x + 8, y + 26, this.w - 16, 3);
      return;
    }
    if (this.move === 'airship') {
      ctx.fillStyle = '#705030'; ctx.fillRect(x, y, this.w, 8); ctx.fillStyle = '#a07848'; ctx.fillRect(x, y, this.w, 2);
      ctx.fillStyle = '#505860'; ctx.beginPath(); ctx.ellipse(x + this.w / 2, y + 16, this.w / 2 - 6, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c0c8d0'; ctx.fillRect(x + (this.t % 6 < 3 ? 2 : 6), y + 14, 6, 2); ctx.fillRect(x + this.w - 10, y + 12, 8, 6);
      return;
    }
    ctx.fillStyle = P.dark; ctx.fillRect(x, y, this.w, 14);
    ctx.fillStyle = P.top; ctx.fillRect(x + 1, y + 1, this.w - 2, 5);
    ctx.fillStyle = P.a; ctx.fillRect(x + 1, y + 6, this.w - 2, 7);
    if (this.move === 'fall' && this.fallT > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 4, y + 2, 2, 2); }
  }
}
export class Crumble extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.h = 16; this.solidTop = true; this.state = 0; this.timer = 0; this.always = true; this.pieces = []; }
  platformTop() { return this.state < 2 ? this.y : null; }
  onStand() { if (this.state === 0) { this.state = 1; this.timer = 22; } }
  box() { return { x: this.x, y: this.y, w: this.w, h: 16 }; }
  update() {
    if (this.state === 1 && --this.timer <= 0) {
      this.state = 2; this.timer = 300;
      for (let i = 0; i < 4; i++) this.pieces.push({ x: this.x + i * 8, y: this.y, vy: -1 - Math.random(), vx: (Math.random() - 0.5) });
      audio.sfx('pop', { rate: 0.6, vol: 0.4 });
    }
    if (this.state === 2) {
      for (const p of this.pieces) { p.vy += 0.25; p.y += p.vy; p.x += p.vx; }
      if (--this.timer <= 0 && !this.g.near(this.x, 250)) { this.state = 0; this.pieces = []; }
    }
  }
  draw(ctx, cam) {
    const P = this.g.P.g;
    if (this.state < 2) {
      const sh = this.state === 1 ? (this.timer % 4 < 2 ? 1 : -1) : 0;
      const x = Math.round(this.x - cam.x) + sh, y = Math.round(this.y - cam.y);
      ctx.fillStyle = P.dark; ctx.fillRect(x, y, this.w, 16);
      ctx.fillStyle = P.b; ctx.fillRect(x + 1, y + 1, this.w - 2, 14);
      ctx.fillStyle = P.top2; ctx.fillRect(x + 1, y + 1, this.w - 2, 3);
      ctx.fillStyle = P.dark; ctx.fillRect(x + this.w / 2, y + 4, 1, 12); ctx.fillRect(x + 4, y + 9, this.w / 2 - 4, 1);
    } else for (const p of this.pieces) { ctx.fillStyle = P.b; ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), 8, 8); }
  }
}
export class GlitchBlock extends Obj {
  constructor(g, s) { super(g, s); this.w = 48; this.h = 16; this.phase = s.phase || 0; this.solidTop = true; this.always = true; }
  cyc() { return (this.g.frame + this.phase) % 200; }
  platformTop() { return this.cyc() < 140 ? this.y - 8 : null; }
  draw(ctx, cam) {
    const c = this.cyc();
    if (c >= 140) { if (c % 8 < 2) { ctx.globalAlpha = 0.3; } else return; }
    else if (c > 110 && c % 4 < 2) ctx.globalAlpha = 0.5;
    const x = Math.round(this.x - 24 - cam.x), y = Math.round(this.y - 8 - cam.y);
    ctx.fillStyle = '#ff2080'; ctx.fillRect(x - 2 + (c % 7 === 0 ? 3 : 0), y, 48, 14);
    ctx.fillStyle = '#20e0ff'; ctx.fillRect(x + 2, y + 2, 48, 10);
    ctx.fillStyle = '#101018'; ctx.fillRect(x, y + 1, 48, 12);
    ctx.fillStyle = '#40ff80';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 3 + ((i * 17 + (this.g.frame >> 2)) % 42), y + 3 + (i % 3) * 3, 4, 2);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ area effects
export class Wind extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.h = s.h; this.fx = s.fx; this.fy = s.fy; this.always = true; }
  box() { return { x: 0, y: -999, w: 0, h: 0 }; }
  force(x, y) { return (x > this.x && x < this.x + this.w && y > this.y && y < this.y + this.h) ? { x: this.fx, y: this.fy } : null; }
  draw(ctx, cam) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 18; i++) {
      const xx = this.x + ((i * 97) % this.w);
      const yy = this.y + this.h - ((this.g.frame * 6 + i * 131) % this.h);
      ctx.fillRect(Math.round(xx - cam.x), Math.round(yy - cam.y), 1, 10);
    }
  }
}
export class Magnet extends Obj {
  constructor(g, s) { super(g, s); this.w = s.w; this.always = true; }
  box() { return { x: 0, y: -999, w: 0, h: 0 }; }
  force(x, y) {
    if (x > this.x && x < this.x + this.w && y > this.y && y < this.y + 150 && !input.held('down')) {
      return { x: 0, y: -0.55 };
    }
    return null;
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    for (let i = 0; i < this.w; i += 32) {
      ctx.fillStyle = '#c02020'; ctx.fillRect(x + i + 4, y, 10, 8); ctx.fillStyle = '#c0c0c8'; ctx.fillRect(x + i + 4, y + 8, 10, 4);
      ctx.fillStyle = '#2040c0'; ctx.fillRect(x + i + 18, y, 10, 8); ctx.fillStyle = '#c0c0c8'; ctx.fillRect(x + i + 18, y + 8, 10, 4);
    }
    ctx.strokeStyle = 'rgba(160,200,255,0.4)';
    for (let k = 0; k < 3; k++) { const yy = y + 20 + ((this.g.frame + k * 30) % 90); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + this.w, yy); ctx.stroke(); }
  }
}
export class Zone extends Obj { // boardzone / sandzone markers
  constructor(g, s) { super(g, s); this.kind = s.type; this.start = s.start; this.w = 16; this.h = 2000; this.used = false; }
  box() { return { x: this.x - 4, y: -100, w: 8, h: 3000 }; }
  touch(p) {
    if (this.kind === 'boardzone') { if (this.start && !p.board && p.xsp >= 0 | p.gsp >= 0) { p.board = true; audio.sfx('dash'); } if (!this.start) p.board = false; }
    if (this.kind === 'sandzone') p.sand = !!this.start;
  }
}
export class EraShift extends Obj {
  constructor(g, s) { super(g, s); this.used = false; }
  box() { return { x: this.x - 4, y: -100, w: 8, h: 3000 }; }
  touch() { if (!this.used) { this.used = true; this.g.cycleEraVisual(); } }
}
export class GravPad extends Obj {
  constructor(g, s) { super(g, s); this.flip = s.flip; this.w = 30; this.h = 12; this.cool = 0; }
  box() { return this.flip === -1 ? { x: this.x - 15, y: this.y - 12, w: 30, h: 12 } : { x: this.x - 15, y: this.y, w: 30, h: 12 }; }
  update() { if (this.cool) this.cool--; }
  touch(p) {
    if (this.cool || p.gdir === this.flip) return;
    p.gdir = this.flip; p.ground = false; p.rail = null; p.platform = null;
    p.ysp = -2 * this.flip * -1 * -1; p.ysp = this.flip * 2; p.xsp = p.gsp || p.xsp;
    p.a = 0; this.cool = 30;
    audio.sfx('warp', { rate: 2, vol: 0.5 });
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.save(); ctx.translate(x, y); if (this.flip === 1) ctx.scale(1, -1);
    ctx.fillStyle = '#404048'; ctx.fillRect(-15, -5, 30, 5);
    ctx.fillStyle = this.g.frame % 20 < 10 ? '#ff60e0' : '#60e0ff';
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(0, -14); ctx.lineTo(8, -6); ctx.fill();
    ctx.restore();
  }
}
export class Firework extends Obj {
  constructor(g, s) { super(g, s); this.w = 24; this.h = 24; this.cool = 0; }
  update() { if (this.cool) this.cool--; }
  touch(p) {
    if (this.cool) return;
    p.y = this.y - 24 - p.hr; p.bounce(p.xsp * 0.5, -15);
    this.cool = 40; audio.sfx('boom', { rate: 1.6, vol: 0.6 });
    this.g.fx.firework(this.x, this.y - 180);
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#802020'; ctx.fillRect(x - 10, y - 12, 20, 12);
    ctx.fillStyle = '#ffd040'; ctx.fillRect(x - 10, y - 12, 20, 3);
    ctx.fillStyle = '#e03030'; ctx.fillRect(x - 5, y - 26, 10, 14);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, y - 20, 10, 2);
    ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.moveTo(x - 6, y - 26); ctx.lineTo(x, y - 33); ctx.lineTo(x + 6, y - 26); ctx.fill();
  }
}
export class Bubbles extends Obj {
  constructor(g, s) { super(g, s); this.timer = 60; this.h = 8; this.w = 16; }
  update() {
    if (--this.timer <= 0) { this.timer = 180; if (this.g.near(this.x, 300)) this.g.addObj(new BigBubble(this.g, { x: this.x, y: this.y - 8 })); }
    if (this.g.frame % 20 === 0 && this.g.near(this.x, 300)) this.g.fx.bubble(this.x + (Math.random() - 0.5) * 8, this.y - 6);
  }
  draw(ctx, cam) { const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y); ctx.fillStyle = '#607080'; ctx.fillRect(x - 6, y - 4, 12, 4); ctx.fillStyle = '#304050'; ctx.fillRect(x - 3, y - 5, 6, 2); }
}
class BigBubble extends Obj {
  constructor(g, s) { super(g, s); this.w = 20; this.h = 20; this.r = 2; this.always = true; }
  update() {
    this.t++; this.r = Math.min(10, this.r + 0.1); this.y -= 0.6; this.x += Math.sin(this.t * 0.1) * 0.5;
    if (this.g.waterY == null || this.y < this.g.waterY) this.alive = false;
  }
  box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
  touch(p) { if (this.r >= 8) { p.air = 1800; this.alive = false; audio.sfx('bubble'); p.xsp = 0; p.ysp = 0; p.gsp = 0; } }
  draw(ctx, cam) {
    ctx.strokeStyle = '#e0f8ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.r, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(this.x - cam.x - this.r / 2), Math.round(this.y - cam.y - this.r / 2), 2, 2);
  }
}
export class BreakWall extends Obj {
  constructor(g, s) { super(g, s); this.w = 16; this.h = s.h; this.solid = true; }
  box() { return { x: this.x - 2, y: this.y, w: 20, h: this.h }; }
  solidAt(x, y) { return x >= this.x && x < this.x + 16 && y >= this.y && y < this.y + this.h; }
  touch(p) {
    if ((p.ball && Math.abs(p.ground ? p.gsp : p.xsp) > 3.5) || p.invinc) {
      this.alive = false; audio.sfx('pop'); audio.sfx('boom', { vol: 0.4, rate: 1.5 });
      for (let i = 0; i < 8; i++) this.g.fx.debris(this.x + 8, this.y + i * 8, this.g.P.g.b);
      this.g.addScore(100, this.x, this.y);
    }
  }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    const P = this.g.P.g;
    ctx.fillStyle = P.dark; ctx.fillRect(x, y, 16, this.h);
    for (let i = 0; i < this.h; i += 16) { ctx.fillStyle = P.a; ctx.fillRect(x + 1, y + i + 1, 14, 14); ctx.fillStyle = P.b; ctx.fillRect(x + 3, y + i + 8, 10, 1); ctx.fillRect(x + 8, y + i + 1, 1, 7); }
  }
}

// ------------------------------------------------------------------ markers
export class Checkpoint extends Obj {
  constructor(g, s) { super(g, s); this.id = s.id; this.w = 16; this.h = 48; this.on = g.checkpoint && g.checkpoint.id >= s.id; this.spin = 0; }
  touch(p) {
    if (this.on) return;
    this.on = true; this.spin = 30; audio.sfx('checkpoint');
    this.g.setCheckpoint({ id: this.id, x: this.x, y: this.y - 20 });
  }
  update() { if (this.spin) this.spin--; }
  draw(ctx, cam) {
    img(ctx, S.lampPost(this.on, this.g.frame >> 1), this.x - 8, this.y - 48, cam);
    if (this.spin) { const a = this.spin * 0.6; ctx.fillStyle = '#ffe040'; ctx.fillRect(Math.round(this.x + Math.cos(a) * 8 - cam.x - 2), Math.round(this.y - 40 + Math.sin(a) * 8 - cam.y - 2), 4, 4); }
  }
}
export class Signpost extends Obj {
  constructor(g, s) { super(g, s); this.w = 32; this.h = 300; this.spinning = 0; this.done = false; this.f = 0; this.always = true; }
  box() { return { x: this.x - 16, y: this.y - 400, w: 32, h: 420 }; }
  touch(p) {
    if (this.spinning || this.done) return;
    this.spinning = 1; audio.sfx('signpost');
    this.g.onSignpost(this);
  }
  update() {
    if (this.spinning && !this.done) {
      this.spinning++; this.f++;
      if (this.spinning > 110 && this.f % 16 === 12) { this.done = true; this.f = 12; this.g.onSignpostDone(this); }
      if (this.spinning % 12 === 0) this.g.fx.sparkle(this.x + (Math.random() - 0.5) * 30, this.y - 40 + (Math.random() - 0.5) * 30);
    }
  }
  draw(ctx, cam) { img(ctx, S.eggPostFace(this.done ? 12 : this.f), this.x - 20, this.y - 48, cam); }
}
export class TimePost extends Obj {
  constructor(g, s) { super(g, s); this.kind = s.kind; this.w = 20; this.h = 56; this.spin = 0; }
  touch() {
    if (this.spin) return;
    this.spin = 90; audio.sfx('signpost', { rate: 1.4, vol: 0.7 });
    this.g.armWarp(this.kind);
  }
  update() { if (this.spin > 1) this.spin--; }
  draw(ctx, cam) {
    img(ctx, S.timePost(this.kind, this.spin > 1 ? this.g.frame * 2 : 0), this.x - 20, this.y - 56, cam);
    const lbl = this.kind === 'past' ? 'PAST' : 'FUTURE';
    this.g.text(ctx, lbl, Math.round(this.x - cam.x), Math.round(this.y - 48 - cam.y), { align: 'center', style: this.kind === 'past' ? 'blue' : 'hud', outline: null });
  }
}
export class Medal extends Obj {
  constructor(g, s) { super(g, s); this.w = 20; this.h = 20; this.y += 10; if (g.hasMedal()) this.alive = false; }
  touch() {
    this.alive = false; this.g.collectMedal(); audio.sfx('bigring', { rate: 1.3 });
    for (let i = 0; i < 6; i++) this.g.fx.sparkle(this.x + (Math.random() - 0.5) * 30, this.y - 10 + (Math.random() - 0.5) * 30);
  }
  draw(ctx, cam) { img(ctx, S.medalSprite(this.g.frame >> 1 & 15), this.x - 12, this.y - 22 + Math.sin(this.g.frame * 0.08) * 2, cam); }
}
export class Machine extends Obj {
  constructor(g, s) { super(g, s); this.w = 64; this.h = 70; this.hp = 3; this.hitT = 0; this.broken = g.machineBroken(); this.boom = 0; this.solidTop = false; }
  touch(p) {
    if (this.broken || this.hitT) return;
    if (!p.ball && !p.invinc) { if (p.ground) { p.x = this.x + sign(p.x - this.x) * 44; p.gsp = 0; } return; }
    this.hp--; this.hitT = 30; audio.sfx('bosshit');
    p.xsp = sign(p.x - this.x) * 4 || -4; p.ysp = -4; p.ground = false; p.gsp = 0;
    if (this.hp <= 0) { this.broken = true; this.boom = 90; this.g.onMachineDestroyed(this); }
  }
  update() {
    if (this.hitT) this.hitT--;
    if (this.boom > 0) {
      this.boom--;
      if (this.boom % 6 === 0) { this.g.fx.explode(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 60); audio.sfx('pop', { vol: 0.6 }); }
      if (this.boom % 10 === 0) this.g.spawnAnimal(this.x + (Math.random() - 0.5) * 40, this.y - 20);
    }
  }
  draw(ctx, cam) {
    if (this.hitT % 4 >= 2) return;
    img(ctx, S.machineSprite(this.g.frame >> 3, this.broken ? 1 : 0), this.x - 40, this.y - 80, cam);
  }
}
export class Loop extends Obj {
  constructor(g, s) { super(g, s); this.r = s.r; this.cool = 0; this.w = 20; this.always = false; this.inY = s.y + s.r; }
  box() { return { x: this.x - 6, y: this.y + this.r - 40, w: 12, h: 40 }; }
  update() { if (this.cool) this.cool--; }
  touch(p) {
    if (this.cool || p.state !== 'normal' || !p.ground || p.gdir !== 1) return;
    if (p.gsp > 4.5) { p.enterLoop(this); this.cool = 999; }
    else if (p.gsp < -4.5) { p.enterLoop(this); p.loopPhi = Math.PI / 2; this.cool = 999; }
  }
  drawBack(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    if (x < -120 || x > 540) return;
    const P = this.g.P.g;
    ctx.lineWidth = 16; ctx.strokeStyle = P.dark;
    ctx.beginPath(); ctx.arc(x, y, this.r + 7, 0, 7); ctx.stroke();
    ctx.lineWidth = 12; ctx.strokeStyle = P.a;
    ctx.beginPath(); ctx.arc(x, y, this.r + 7, 0, 7); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = P.top;
    ctx.beginPath(); ctx.arc(x, y, this.r + 1, 0, 7); ctx.stroke();
    ctx.lineWidth = 1;
    // checker marks
    ctx.fillStyle = P.b;
    for (let i = 0; i < 24; i += 2) { const a = i / 24 * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(a) * (this.r + 9)) - 3, Math.round(y + Math.sin(a) * (this.r + 9)) - 3, 6, 6); }
  }
  draw() { }
  drawFront(ctx, cam) {
    // lower-left post overlaps the player a little for depth
    const x = this.x - cam.x, y = this.y - cam.y;
    if (this.g.player.state !== 'loop') return;
  }
}
export class Decor extends Obj {
  constructor(g, s) { super(g, s); this.kind = s.type; }
  box() { return { x: 0, y: -999, w: 0, h: 0 }; }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    if (this.kind === 'railpost' || this.kind === 'zippole') {
      ctx.fillStyle = '#505860'; ctx.fillRect(x - 3, y, 6, 400);
      ctx.fillStyle = '#90a0b0'; ctx.fillRect(x - 5, y - 4, 10, 6);
    } else if (this.kind === 'bridge') {
      ctx.fillStyle = this.g.P.g.dark; ctx.fillRect(x - 4, y - 16, 5, 24); ctx.fillRect(x + this.spawn.w - 1, y - 16, 5, 24);
    }
  }
}
export class RaceGoal extends Obj {
  constructor(g, s) { super(g, s); this.w = 20; this.h = 400; this.hit = false; }
  box() { return { x: this.x - 4, y: this.y - 400, w: 8, h: 420 }; }
  touch() { if (!this.hit) { this.hit = true; this.g.onRaceGoal('player'); } }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(x - 40, y - 100, 4, 100); ctx.fillRect(x + 36, y - 100, 4, 100);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#101010' : '#ffffff'; ctx.fillRect(x - 36 + i * 7.2, y - 100 + j * 7, 8, 7); }
    this.g.text(ctx, 'GOAL', x, y - 120, { align: 'center', style: 'hud' });
  }
}

// ------------------------------------------------------------------ enemies
export class Enemy extends Obj {
  constructor(g, s) {
    super(g, s); this.kind = s.kind; this.range = Math.max(40, s.range || 80);
    this.bx = s.x; this.by = s.y; this.dir = -1; this.w = 28; this.h = 26; this.cool = 60 + (s.x % 60); this.vy = 0;
    this.fly = ['buzzer', 'bat', 'hoverbot'].includes(this.kind);
    this.color = g.enemyColor;
    this.broken = g.era === 'good' && (s.x % 3 === 0);
    // later zones: faster, more aggressive badniks
    this.D = Math.max(0, Math.min(1, (g.zoneIdx - 2.5) / 12));
    this.agg = 1 + this.D * 0.9;
  }
  box() { return { x: this.x - 12, y: this.y - 26, w: 24, h: 24 }; }
  update() {
    this.t++;
    if (this.broken) { return; }
    const p = this.g.player, lv = this.g.level;
    const dx = p.x - this.x, dist = Math.abs(dx);
    switch (this.kind) {
      case 'motobug': case 'crab': case 'scorp': case 'spiker': {
        const spd = (this.kind === 'motobug' ? 1 : this.kind === 'spiker' ? 0.4 : 0.5) * this.agg;
        if (this.D > 0.35 && this.kind === 'motobug' && dist < 140 && Math.abs(p.y - this.y) < 40 && this.t % 30 === 0) this.dir = sign(dx) || this.dir;
        if (this.kind === 'crab' || this.kind === 'scorp') {
          if (this.cool-- <= 0) {
            this.cool = Math.round(150 / this.agg);
            this.pause = 40;
          }
          if (this.pause > 0) {
            this.pause--;
            if (this.pause === 20 && dist < 300) {
              if (this.kind === 'crab') { this.shoot(-2, -4, 'ball', true); this.shoot(2, -4, 'ball', true); }
              else this.shoot(sign(dx) * 3, -3, 'seed', true);
            }
            break;
          }
        }
        this.x += this.dir * spd;
        const ahead = this.x + this.dir * 12;
        const fy = lv.floorScan(ahead, this.y - 4, 20, 1);
        if (fy == null || Math.abs(this.x - this.bx) > this.range / 2 || lv.solid(ahead, this.y - 12)) this.dir *= -1;
        else this.y = fy;
        break;
      }
      case 'penguin': {
        if (dist < 220 && !this.go) { this.go = true; this.dir = sign(dx); }
        if (this.go) {
          this.x += this.dir * 3;
          const fy = lv.floorScan(this.x, this.y - 8, 24, 1);
          if (fy == null) { this.vy += 0.2; this.y += this.vy; } else { this.y = fy; this.vy = 0; }
          if (lv.solid(this.x + this.dir * 12, this.y - 12)) this.dir *= -1;
        }
        break;
      }
      case 'hopper': {
        if (this.onGround !== false) {
          if (this.cool-- <= 0) { this.cool = 60; this.vy = -5; this.vx = sign(dx) * 1.5 || 1; this.onGround = false; this.dir = sign(dx); }
        } else {
          this.vy += 0.2; this.y += this.vy; this.x += this.vx;
          if (lv.solid(this.x + this.vx * 4, this.y - 10)) this.vx = 0;
          if (this.vy > 0) { const fy = lv.floorScan(this.x, this.y - 4, Math.ceil(this.vy) + 2, 1); if (fy != null) { this.y = fy; this.onGround = true; } }
          if (this.y > this.by + 500) this.alive = false;
        }
        break;
      }
      case 'buzzer': {
        if (this.pause > 0) { this.pause--; if (this.pause === 30) this.shoot(this.dir * 2, 2.5, 'laser'); break; }
        this.x += this.dir * 1.2;
        if (Math.abs(this.x - this.bx) > this.range / 2 + 40) this.dir *= -1;
        if (this.cool-- <= 0 && dist < 120 && p.y > this.y) { this.pause = 60; this.cool = 180; this.dir = sign(dx); }
        break;
      }
      case 'hoverbot': {
        this.y = this.by + Math.sin(this.t * 0.05) * 16;
        if (dist < 200) this.x += sign(dx) * 0.6; this.dir = sign(dx) || -1;
        if (this.cool-- <= 0 && dist < 200) { this.cool = 140; this.shoot(sign(dx) * 2.5, (p.y - this.y) / Math.max(40, dist) * 2.5, 'spark'); }
        break;
      }
      case 'bat': {
        if (!this.swoop && dist < 130 && p.y > this.y) { this.swoop = 1; this.sa = 0; this.dir = sign(dx); }
        if (this.swoop) {
          this.sa += 0.03;
          this.x += this.dir * 2.2; this.y = this.by + Math.sin(this.sa * Math.PI) * 70;
          if (this.sa >= 1) { this.swoop = 0; this.by = this.y; }
        } else this.y = this.by + Math.sin(this.t * 0.06) * 4;
        break;
      }
      case 'turret': {
        this.dir = sign(dx) || -1;
        if (this.cool-- <= 0 && dist < 260) {
          this.cool = 120;
          const a = Math.atan2(p.y - 10 - (this.y - 20), dx);
          this.shoot(Math.cos(a) * 2.5, Math.sin(a) * 2.5, this.g.zoneDef.tex === 'crystal' ? 'crystal' : 'ball');
        }
        break;
      }
      case 'fish': {
        if (this.cool-- <= 0) { this.cool = 150; this.vy = -8; this.jumpY = this.by; }
        if (this.vy !== 0 || this.y < this.by) { this.vy += 0.18; this.y += this.vy; if (this.y >= this.by && this.vy > 0) { this.y = this.by; this.vy = 0; } }
        break;
      }
    }
  }
  shoot(vx, vy, kind, grav = false) {
    if (!this.g.near(this.x, 260)) return;
    this.g.addObj(new Projectile(this.g, { x: this.x, y: this.y - 14, vx, vy, kind, grav }));
    audio.sfx('shot', { vol: 0.4 });
  }
  touch(p) {
    if (this.broken) return;
    const spikeUp = this.kind === 'spiker' && (this.t >> 4) % 4 < 2;
    if ((p.ball || p.invinc) && !(spikeUp && p.ysp > 0 && p.y < this.y - 20 && !p.invinc)) {
      this.alive = false;
      audio.sfx('pop');
      this.g.fx.explode(this.x, this.y - 13);
      this.g.spawnAnimal(this.x, this.y - 13);
      const pts = [100, 200, 500, 1000][Math.min(3, p.combo)];
      p.combo++;
      this.g.addScore(pts, this.x, this.y - 20);
      if (!p.ground) {
        if (p.ysp * p.gdir > 0 && p.y * p.gdir < this.y * p.gdir) p.ysp = -p.ysp;
        else p.ysp -= sign(p.ysp) * 1;
      }
    } else p.hurt(this.x);
  }
  draw(ctx, cam) {
    const f = this.broken ? 0 : Math.floor(this.t / 8);
    let fr = this.kind === 'spiker' ? ((this.t >> 4) % 4) : f;
    const s = S.badnik(this.kind, fr, this.color);
    const flip = this.dir > 0;
    if (this.broken) ctx.globalAlpha = 0.7;
    img(ctx, s, this.x - 20, this.y - 38 + (this.fly ? 10 : 0), cam, flip);
    if (this.broken) {
      ctx.globalAlpha = 1;
      if (this.t % 30 < 3) { ctx.fillStyle = '#ffff80'; ctx.fillRect(Math.round(this.x - cam.x), Math.round(this.y - 30 - cam.y), 2, 2); }
    }
  }
}
export class Projectile extends Obj {
  constructor(g, s) { super(g, s); this.vx = s.vx; this.vy = s.vy; this.kind = s.kind; this.grav = s.grav; this.life = s.life || 240; this.always = true; this.w = 8; this.h = 8; this.hostile = s.hostile !== false; }
  box() { return { x: this.x - 4, y: this.y - 4, w: 8, h: 8 }; }
  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.grav) this.vy += 0.12;
    if (--this.life <= 0) this.alive = false;
    if (this.kind !== 'laser' && this.g.level.solid(this.x, this.y) && this.life < 230) { this.alive = false; this.g.fx.puff(this.x, this.y); }
  }
  touch(p) { if (this.hostile) { if (p.shield || p.invinc) { if (p.invinc || p.shield) { this.alive = false; this.g.fx.puff(this.x, this.y); if (!p.invinc) p.hurt(this.x); } } else p.hurt(this.x); } }
  draw(ctx, cam) { img(ctx, S.projectile(this.kind), this.x - 6, this.y - 6, cam); }
}
export class Animal extends Obj {
  constructor(g, s) { super(g, s); this.kind = s.kind; this.vy = -4; this.vx = 0; this.always = true; this.life = 300; this.onG = false; }
  box() { return { x: 0, y: -999, w: 0, h: 0 }; }
  update() {
    this.t++;
    this.vy += 0.21875; this.x += this.vx; this.y += this.vy;
    if (this.vy > 0) {
      const fy = this.g.level.floorScan(this.x, this.y - 2, Math.ceil(this.vy) + 2, 1);
      if (fy != null) { this.y = fy; this.vy = this.kind === 0 ? -4 : -3.5; this.vx = this.kind === 0 ? -3 : -2; }
    }
    if (--this.life <= 0 || this.y > this.g.level.ph) this.alive = false;
  }
  draw(ctx, cam) { img(ctx, S.animalSprite(this.kind, this.t >> 3), this.x - 8, this.y - 16, cam, this.vx > 0); }
}
export class BigRing extends Obj {
  constructor(g, s) { super(g, s); this.w = 48; this.h = 56; this.used = false; this.always = true; this.y += 28; }
  touch(p) { if (this.used) return; this.used = true; audio.sfx('bigring'); this.g.enterBigRing(this); }
  draw(ctx, cam) { if (!this.used) img(ctx, S.bigRingFrame(this.g.frame % 48 >> 1), this.x - 32, this.y - 60, cam); }
}

export const TYPES = {
  ring: Ring, monitor: Monitor, spring: Spring, booster: Booster, bumper: Bumper, drumpad: DrumPad, spikes: Spikes,
  electric: Electric, bouncefloor: BounceFloor, lava: Lava, firejet: FireJet, lightningzone: LightningZone,
  platform: Platform, crumble: Crumble, glitchblock: GlitchBlock, wind: Wind, magnet: Magnet, boardzone: Zone,
  sandzone: Zone, erashift: EraShift, gravpad: GravPad, firework: Firework, bubbles: Bubbles, breakwall: BreakWall,
  checkpoint: Checkpoint, signpost: Signpost, timepost: TimePost, medal: Medal, machine: Machine, loop: Loop,
  railpost: Decor, zippole: Decor, bridge: Decor, racegoal: RaceGoal, enemy: Enemy,
};
