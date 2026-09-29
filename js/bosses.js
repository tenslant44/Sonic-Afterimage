// Bosses for every zone's Act 3, plus Metal Sonic races/chase.
import { audio } from './audio.js';
import { sprite, eggFrame, hogFrame, projectile } from './sprites.js';
import { Obj, Projectile } from './objects.js';
import { rectsOverlap, sign, clamp } from './util.js';

const E = (g, x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, Math.max(.5, rx), Math.max(.5, ry), 0, 0, 7); g.fill(); };
const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const Poly = (g, pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); };

// Draw a cached image centred at (x,y) world coords, with optional flip & hit flash
function blit(ctx, cam, im, x, y, flip = false, flash = false, rot = 0) {
  ctx.save();
  ctx.translate(Math.round(x - cam.x), Math.round(y - cam.y));
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -im.width / 2, -im.height / 2);
  if (flash) { ctx.globalCompositeOperation = 'source-atop'; }
  ctx.restore();
  if (flash) {
    ctx.save(); ctx.globalAlpha = 0.6; ctx.globalCompositeOperation = 'lighter';
    ctx.translate(Math.round(x - cam.x), Math.round(y - cam.y)); if (rot) ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -im.width / 2, -im.height / 2);
    ctx.restore();
  }
}

export class Boss extends Obj {
  constructor(g, arena, hp = 8) {
    super(g, { x: (arena.x0 + arena.x1) / 2, y: arena.y });
    // later zones: tougher bosses (more hits), and every boss escalates as it loses health
    this.tier = clamp((g.zoneIdx - 2.5) / 12, 0, 1);
    hp += Math.round(this.tier * 4);
    this.arena = arena; this.hp = hp; this.maxHp = hp; this.inv = 0; this.always = true;
    this.state = 'intro'; this.st = 0; this.dying = 0; this.face = -1; this.floor = arena.y;
    this.vulnerable = true;
    this.clock = 0; this.rage = 0; this.extra = []; this.extraT = 0;
  }
  // 0 = full health, 1 = below 2/3, 2 = below 1/3
  get ragePhase() { return this.hp > this.maxHp * 2 / 3 ? 0 : this.hp > this.maxHp / 3 ? 1 : 2; }
  // how many think() steps per frame: bosses literally speed up
  get tempo() { return 1 + this.tier * 0.3 + this.ragePhase * (0.12 + this.tier * 0.12); }
  get cx() { return (this.arena.x0 + this.arena.x1) / 2; }
  box() { return { x: 0, y: -9999, w: 0, h: 0 }; }
  bodyRect() { return { x: this.x - 24, y: this.y - 48, w: 48, h: 48 }; }
  dangerRects() { return []; }
  set(s) { this.state = s; this.st = 0; }
  update() {
    this.t++; this.st++;
    if (this.inv > 0) this.inv--;
    if (this.dying) {
      this.dying++;
      if (this.dying % 5 === 0) { const r = this.bodyRect(); this.g.fx.explode(r.x + Math.random() * r.w, r.y + Math.random() * r.h); audio.sfx('pop', { vol: 0.5 }); }
      if (this.dying === 120) { audio.sfx('boom'); this.g.shake = 12; }
      if (this.dying > 150) { this.alive = false; this.g.onBossDefeated(this); }
      return;
    }
    this.clock += this.tempo;
    while (this.clock >= 1) { this.clock -= 1; this.think(); if (this.dying) break; }
    if (this.state !== 'intro') this.extraAttacks();
    this.collide(this.g.player);
  }
  think() { }
  // Phase attacks layered on top of each boss's own pattern. Always telegraphed.
  extraAttacks() {
    const ph = this.ragePhase, p = this.g.player, A = this.arena;
    const early = this.g.zoneIdx < 3;
    if (ph !== this.rage) {
      this.rage = ph; this.extraT = 0;
      if (ph > 0) { this.g.banner = { text: ph === 1 ? 'EGGMAN IS GETTING ANGRY!' : 'EGGMAN IS FURIOUS!', t: 90 }; audio.sfx('bosshit', { rate: 0.6 }); this.g.flash = 4; }
    }
    this.extraT++;
    // phase 1+: aimed shot from the boss's cockpit (a blinking warning first)
    const shotRate = early ? 200 : Math.round(170 - this.tier * 70 - ph * 15);
    if (ph >= (early ? 2 : 1) && this.extraT % shotRate === shotRate - 40) this.warnShot = 40;
    if (this.warnShot > 0 && --this.warnShot === 0 && !p.dead) {
      const br = this.bodyRect(); const bx = br.x + br.w / 2, by = br.y + 8;
      const dx = p.x - bx, dy = p.y - by, d = Math.hypot(dx, dy) || 1, sp = early ? 2.2 : 2.6 + this.tier;
      const n = ph === 2 && this.tier > 0.4 ? 3 : 1;
      for (let i = 0; i < n; i++) { const a = Math.atan2(dy, dx) + (i - (n - 1) / 2) * 0.28; this.shoot(bx, by, Math.cos(a) * sp, Math.sin(a) * sp, 'ball', false, 200); }
      audio.sfx('shot', { vol: 0.5 });
    }
    // phase 2 (zone 4+): debris falls from above; its landing spot is marked first
    if (ph === 2 && !early && !A.race) {
      const rate = Math.round(150 - this.tier * 60);
      if (this.extraT % rate === 0) {
        const n = 1 + (this.tier > 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) this.extra.push({ x: clamp(p.x + (i ? (Math.random() < 0.5 ? -80 : 80) : 0), A.x0 + 20, A.x1 - 20), t: 50 });
      }
      for (const d of this.extra) {
        if (--d.t === 0) this.shoot(d.x, this.floor - 220, 0, 3.5, 'rock', true, 200);
      }
      this.extra = this.extra.filter(d => d.t > 0);
    } else this.extra.length = 0;
  }
  drawExtras(ctx, cam) {
    for (const d of this.extra) {
      if (d.t % 8 < 5) { ctx.fillStyle = 'rgba(255,40,40,0.7)'; ctx.fillRect(Math.round(d.x - 10 - cam.x), Math.round(this.floor - 3 - cam.y), 20, 3); }
    }
    if (this.warnShot > 0 && this.warnShot % 6 < 3) {
      const br = this.bodyRect(); ctx.fillStyle = '#ff3030';
      ctx.beginPath(); ctx.arc(Math.round(br.x + br.w / 2 - cam.x), Math.round(br.y + 8 - cam.y), 5, 0, 7); ctx.fill();
    }
  }
  collide(p) {
    if (p.dead) return;
    const hb = p.hitbox();
    for (const d of this.dangerRects()) if (rectsOverlap(hb, d)) { p.hurt(d.x + d.w / 2); break; }
    const br = this.bodyRect();
    if (br && rectsOverlap(hb, br)) {
      if ((p.ball || p.invinc) && this.vulnerable && this.inv === 0) this.hit(p);
      else if (this.inv === 0 && !(p.ball && this.vulnerable)) { if (this.contactHurts !== false) p.hurt(br.x + br.w / 2); }
      else if (p.ball) this.bounceOff(p);
    }
  }
  bounceOff(p) {
    const br = this.bodyRect();
    const cx = br.x + br.w / 2, cy = br.y + br.h / 2;
    const a = Math.atan2(p.y - cy, p.x - cx);
    p.ground = false; p.rail = null; p.platform = null;
    p.xsp = Math.cos(a) * 4.5; p.ysp = Math.min(-3, Math.sin(a) * 4.5);
    p.jumping = true;
  }
  hit(p) {
    this.hp--; this.inv = 40;
    audio.sfx('bosshit');
    this.g.addScore(100);
    this.bounceOff(p);
    this.onHit && this.onHit();
    if (this.hp <= 0) { this.dying = 1; this.g.addScore(1000); audio.stopMusic(0.5); }
  }
  flash() { return this.inv > 0 && this.inv % 4 < 2; }
  shoot(x, y, vx, vy, kind = 'ball', grav = false, life = 240) {
    this.g.addObj(new Projectile(this.g, { x, y, vx, vy, kind, grav, life }));
  }
  eggmanMood() { return this.inv > 0 ? 'hurt' : (this.st % 120 < 30 ? 'laugh' : 'normal'); }
  drawEgg(ctx, cam, x, y, flip) {
    blit(ctx, cam, eggFrame(this.dying ? 'hurt' : this.eggmanMood(), (this.t >> 3) & 1), x, y, flip, this.flash());
  }
}

// ------------------------------------------------------------ 1. Drill Crab (Palmtree Panic)
class DrillCrab extends Boss {
  constructor(g, a) { super(g, a, 8); this.x = a.x1 - 60; this.y = a.y; this.drill = 0; this.set('walk'); }
  think() {
    const p = this.g.player;
    if (this.state === 'walk') {
      this.x += this.face * 0.8;
      if (this.x < this.arena.x0 + 50) this.face = 1; if (this.x > this.arena.x1 - 50) this.face = -1;
      if (this.st > 150) { this.set('aim'); this.face = sign(p.x - this.x) || -1; }
    } else if (this.state === 'aim') {
      this.drill = Math.min(1, this.st / 40);
      if (this.st > 50) this.set('charge');
    } else if (this.state === 'charge') {
      this.x += this.face * 4;
      if (this.st % 6 === 0) this.g.fx.dust(this.x - this.face * 20, this.y, -this.face);
      if (this.x < this.arena.x0 + 40 || this.x > this.arena.x1 - 40) { this.x = clamp(this.x, this.arena.x0 + 40, this.arena.x1 - 40); this.g.shake = 8; audio.sfx('boom', { vol: 0.4 }); this.set('stun'); this.face *= -1; }
    } else if (this.state === 'stun') {
      this.drill = Math.max(0, this.drill - 0.05);
      if (this.st > 70) this.set('walk');
    }
  }
  bodyRect() { return { x: this.x - 30, y: this.y - 70, w: 60, h: 50 }; }
  dangerRects() {
    const r = [{ x: this.x - 34, y: this.y - 20, w: 68, h: 20 }]; // legs
    if (this.drill > 0.5) r.push({ x: this.x + this.face * (40 + 20 * this.drill) - 16, y: this.y - 46, w: 32, h: 22 });
    return r;
  }
  draw(ctx, cam) {
    const leg = Math.sin(this.t * 0.2) * 3;
    const body = sprite('dc-body', 96, 48, g => {
      E(g, 48, 26, 40, 18, '#d04020'); E(g, 48, 20, 32, 10, '#f07040');
      for (let i = 0; i < 5; i++) R(g, 18 + i * 13, 34, 4, 3, '#802010');
    });
    const drill = sprite('dc-drill', 40, 24, g => {
      Poly(g, [0, 4, 30, 12, 0, 20], '#c0c8d0'); for (let i = 0; i < 4; i++) Poly(g, [i * 7, 5 + i * 1.5, i * 7 + 4, 12, i * 7, 19 - i * 1.5], '#707880');
      R(g, 0, 6, 6, 12, '#e8b020');
    });
    const flip = this.face > 0;
    // legs
    ctx.fillStyle = '#801810';
    for (let i = -1; i <= 1; i += 2) for (let k = 0; k < 3; k++) {
      const lx = Math.round(this.x - cam.x + i * (14 + k * 8)), ly = Math.round(this.y - cam.y);
      ctx.fillRect(lx - 2, ly - 22 + (k % 2 ? leg : -leg), 4, 22 - (k % 2 ? leg : -leg));
    }
    this.drawEgg(ctx, cam, this.x, this.y - 70, !flip);
    blit(ctx, cam, body, this.x, this.y - 38, flip, this.flash());
    const dx = this.face * (38 + 22 * this.drill);
    blit(ctx, cam, drill, this.x + dx, this.y - 36, !flip ? true : false, false, this.drill > 0.5 ? Math.sin(this.t) * 0.05 : 0);
    blit(ctx, cam, drill, this.x - this.face * 40, this.y - 36, !flip ? false : true);
  }
}

// ------------------------------------------------------------ 3. Mechanical Eel (Sunken Sanctum)
class Eel extends Boss {
  constructor(g, a) { super(g, a, 8); this.segs = []; this.phase = 0; this.set('dive'); this.x = a.x1; this.y = a.y + 60; this.path = []; }
  think() {
    const a = this.arena, p = this.g.player;
    if (this.state === 'dive') {
      // hidden below floor, then leap across in an arc
      this.y = a.y + 80;
      if (this.st > 60) { this.set('leap'); this.from = this.face < 0 ? a.x1 - 30 : a.x0 + 30; this.to = this.face < 0 ? a.x0 + 30 : a.x1 - 30; this.hgt = 90 + Math.random() * 50; this.warn = 0; }
    } else if (this.state === 'leap') {
      const t = Math.min(1, this.st / 110);
      this.x = this.from + (this.to - this.from) * t;
      this.y = a.y + 40 - Math.sin(t * Math.PI) * (this.hgt + 40);
      if (this.st === 50 && Math.abs(p.x - this.x) < 240) { for (let i = -1; i <= 1; i++) this.shoot(this.x, this.y, i * 1.5 + this.face * 1, -2, 'spark', true); audio.sfx('shot'); }
      if (t >= 1) { this.face *= -1; this.set('dive'); }
    }
    this.path.unshift({ x: this.x, y: this.y });
    if (this.path.length > 60) this.path.pop();
    if (this.st % 20 === 0 && this.state === 'leap' && this.st < 12) audio.sfx('splash');
  }
  bodyRect() { return this.y < this.arena.y + 10 ? { x: this.x - 16, y: this.y - 16, w: 32, h: 32 } : null; }
  dangerRects() {
    const r = [];
    for (let i = 8; i < this.path.length; i += 8) { const s = this.path[i]; if (s.y < this.arena.y) r.push({ x: s.x - 10, y: s.y - 10, w: 20, h: 20 }); }
    return r;
  }
  draw(ctx, cam) {
    const seg = sprite('eel-seg', 28, 28, g => { E(g, 14, 14, 12, 12, '#506878'); E(g, 14, 14, 8, 8, '#80a0b0'); R(g, 6, 12, 16, 4, '#e0c040'); });
    const head = sprite('eel-head', 48, 36, g => {
      E(g, 22, 18, 20, 14, '#506878'); Poly(g, [30, 8, 48, 14, 48, 22, 30, 28], '#405060');
      E(g, 26, 12, 5, 4, '#fff'); E(g, 28, 12, 2, 3, '#ff2020'); R(g, 32, 20, 16, 2, '#101010');
      for (let i = 0; i < 4; i++) Poly(g, [34 + i * 3, 22, 36 + i * 3, 26, 38 + i * 3, 22], '#fff');
      E(g, 12, 18, 6, 6, '#e0c040');
    });
    for (let i = this.path.length - 1; i >= 8; i -= 8) { const s = this.path[i]; if (s.y < this.arena.y + 10) blit(ctx, cam, seg, s.x, s.y); }
    if (this.y < this.arena.y + 20) {
      const n = this.path[3] || this;
      const ang = Math.atan2(this.y - n.y, this.x - n.x);
      blit(ctx, cam, head, this.x, this.y, false, this.flash(), ang);
      this.drawEgg(ctx, cam, this.x, this.y - 30, this.face > 0);
    } else {
      // ripple warning
      ctx.fillStyle = '#e0f8ff';
      const wx = (this.face < 0 ? this.arena.x1 - 30 : this.arena.x0 + 30) - cam.x;
      if (this.st > 30 && this.t % 6 < 3) ctx.fillRect(Math.round(wx) - 12, Math.round(this.arena.y - cam.y) - 3, 24, 2);
    }
  }
}

// ------------------------------------------------------------ 4. Crystal Golem
class Golem extends Boss {
  constructor(g, a) { super(g, a, 8); this.x = a.x1 - 70; this.y = a.y; this.vy = 0; this.set('walk'); this.contactHurts = true; }
  think() {
    const p = this.g.player, a = this.arena;
    this.vulnerable = this.state !== 'jump';
    if (this.state === 'walk') {
      this.face = sign(p.x - this.x) || -1;
      this.x += this.face * 0.6;
      if (this.st % 90 === 45) { this.throwCrystal(p); }
      if (this.st > 180) { this.set('jump'); this.vy = -8; this.tx = clamp(p.x, a.x0 + 50, a.x1 - 50); }
    } else if (this.state === 'jump') {
      this.vy += 0.25; this.y += this.vy; this.x += (this.tx - this.x) * 0.04;
      if (this.y >= a.y) {
        this.y = a.y; this.g.shake = 14; audio.sfx('boom', { vol: 0.7 });
        this.g.addShockwave(this.x, a.y, 1); this.g.addShockwave(this.x, a.y, -1);
        for (let i = 0; i < 5; i++) this.shoot(a.x0 + 30 + Math.random() * (a.x1 - a.x0 - 60), a.y - 240, 0, 1, 'crystal', true);
        this.set('stomp');
      }
    } else if (this.state === 'stomp') { if (this.st > 60) this.set('walk'); }
  }
  throwCrystal(p) { const dx = p.x - this.x; this.shoot(this.x, this.y - 80, dx / 60, -5, 'crystal', true); audio.sfx('shot'); }
  bodyRect() { return { x: this.x - 22, y: this.y - 100, w: 44, h: 36 }; }
  dangerRects() { return [{ x: this.x - 30, y: this.y - 64, w: 60, h: 64 }]; }
  draw(ctx, cam) {
    const body = sprite('golem', 96, 110, g => {
      Poly(g, [20, 50, 76, 50, 86, 90, 10, 90], '#503870');
      Poly(g, [26, 20, 70, 20, 80, 56, 16, 56], '#7050a0');
      for (let i = 0; i < 5; i++) Poly(g, [22 + i * 12, 22, 28 + i * 12, 2 + (i % 2) * 8, 34 + i * 12, 22], '#60f0ff');
      E(g, 38, 36, 5, 4, '#ff4080'); E(g, 58, 36, 5, 4, '#ff4080');
      R(g, 14, 90, 22, 18, '#3a2854'); R(g, 60, 90, 22, 18, '#3a2854');
      Poly(g, [0, 56, 16, 50, 20, 80, 4, 86], '#60f0ff'); Poly(g, [96, 56, 80, 50, 76, 80, 92, 86], '#60f0ff');
    });
    blit(ctx, cam, body, this.x, this.y - 55, this.face > 0, this.flash());
    this.drawEgg(ctx, cam, this.x, this.y - 118, this.face > 0);
  }
}

// ------------------------------------------------------------ 5. Wind-up Eggman (Wacky Workbench)
class WindUp extends Boss {
  constructor(g, a) { super(g, a, 8); this.x = a.x1 - 80; this.y = a.y; this.vy = 0; this.vx = 0; this.set('hop'); this.hops = 0; }
  think() {
    const p = this.g.player, a = this.arena;
    this.vulnerable = this.state === 'dizzy' || this.state === 'hop';
    if (this.state === 'hop') {
      if (this.st === 1) { this.vy = -7 - Math.random() * 2; this.vx = clamp((p.x - this.x) / 60, -3, 3); this.hops++; }
      this.vy += 0.25; this.y += this.vy; this.x = clamp(this.x + this.vx, a.x0 + 40, a.x1 - 40);
      if (this.y >= a.y && this.vy > 0) {
        this.y = a.y; this.g.shake = 6; audio.sfx('spring', { rate: 0.7 });
        if (this.hops % 4 === 0) this.set('spin'); else this.set('hop');
      }
    } else if (this.state === 'spin') {
      // spins, throwing toy bolts
      if (this.st % 16 === 0) { const ang = this.st / 16; this.shoot(this.x, this.y - 60, Math.cos(ang) * 3, -3 - Math.sin(ang), 'spark', true); audio.sfx('zap', { vol: 0.4 }); }
      if (this.st > 110) this.set('dizzy');
    } else if (this.state === 'dizzy') {
      if (this.st > 90) this.set('hop');
    }
  }
  bodyRect() { return { x: this.x - 30, y: this.y - 96, w: 60, h: 80 }; }
  dangerRects() { return this.state === 'spin' ? [{ x: this.x - 36, y: this.y - 96, w: 72, h: 96 }] : []; }
  draw(ctx, cam) {
    const body = sprite('windup', 88, 104, g => {
      E(g, 44, 58, 36, 36, '#e02020'); E(g, 36, 48, 18, 14, '#ff6060');
      E(g, 44, 26, 22, 20, '#f8c890');
      E(g, 36, 22, 5, 4, '#101010'); E(g, 52, 22, 5, 4, '#101010');
      Poly(g, [44, 32, 16, 34, 10, 26, 20, 40, 68, 40, 78, 26, 72, 34], '#c06818');
      E(g, 44, 29, 5, 4, '#f0a878');
      R(g, 26, 88, 14, 14, '#303848'); R(g, 48, 88, 14, 14, '#303848');
      E(g, 44, 70, 10, 8, '#ffe040'); R(g, 43, 62, 2, 16, '#c0a020');
    });
    const key = sprite('windkey', 40, 20, g => { E(g, 8, 10, 8, 9, '#e0c040'); E(g, 32, 10, 8, 9, '#e0c040'); R(g, 8, 8, 24, 4, '#a08020'); E(g, 8, 10, 3, 4, '#806010'); E(g, 32, 10, 3, 4, '#806010'); });
    const bob = this.state === 'dizzy' ? Math.sin(this.t * 0.3) * 0.15 : this.state === 'spin' ? this.st * 0.3 : 0;
    blit(ctx, cam, body, this.x, this.y - 52, this.face > 0, this.flash(), this.state === 'spin' ? 0 : bob);
    const kx = this.x - (this.state === 'spin' ? Math.cos(this.st * 0.3) * 30 : this.face * 30);
    ctx.save(); ctx.translate(Math.round(kx - cam.x), Math.round(this.y - 60 - cam.y)); ctx.scale(Math.cos(this.t * 0.2), 1); ctx.drawImage(key, -20, -10); ctx.restore();
    if (this.state === 'dizzy') for (let i = 0; i < 3; i++) { const a = this.t * 0.1 + i * 2.1; ctx.fillStyle = '#ffff60'; ctx.fillRect(Math.round(this.x + Math.cos(a) * 20 - cam.x), Math.round(this.y - 110 + Math.sin(a) * 5 - cam.y), 4, 4); }
  }
}

// ------------------------------------------------------------ 7. Avalanche robot (Frostbite Peak)
class Avalanche extends Boss {
  constructor(g, a) { super(g, a, 8); this.x = a.x1 - 50; this.hy = a.y - 110; this.y = this.hy; this.set('throw'); }
  think() {
    const p = this.g.player, a = this.arena;
    this.vulnerable = this.state === 'scoop' || this.state === 'down';
    if (this.state === 'throw') {
      this.y = this.hy + Math.sin(this.t * 0.05) * 6;
      if (this.st % 70 === 35) {
        this.g.addObj(new Snowball(this.g, { x: this.x - 30, y: a.y - 14, vx: -2.2 - Math.random(), floor: a.y, big: Math.random() < 0.4 }));
        audio.sfx('pop', { rate: 0.5, vol: 0.5 });
      }
      if (this.st % 50 === 20) this.shoot(this.x - 20, this.y, (p.x - this.x) / 70, -3, 'snow', true);
      if (this.st > 260) this.set('drop');
    } else if (this.state === 'drop') {
      this.y = Math.min(a.y - 40, this.y + 4);
      if (this.y >= a.y - 40) { this.set('down'); this.g.shake = 10; audio.sfx('boom', { vol: 0.5 }); }
    } else if (this.state === 'down') {
      this.x += (a.x0 + 80 - this.x) * 0.01 * (this.st < 120 ? 1 : 0);
      if (this.st > 150) this.set('rise');
    } else if (this.state === 'rise') {
      this.y -= 2; this.x += (a.x1 - 50 - this.x) * 0.05;
      if (this.y <= this.hy) { this.set('throw'); }
    }
  }
  bodyRect() { return { x: this.x - 34, y: this.y - 34, w: 68, h: 54 }; }
  draw(ctx, cam) {
    const body = sprite('aval', 96, 72, g => {
      E(g, 48, 40, 44, 28, '#6088c0'); E(g, 48, 32, 36, 18, '#c8e0f8');
      Poly(g, [4, 40, 0, 70, 30, 60], '#304870'); Poly(g, [92, 40, 96, 70, 66, 60], '#304870');
      R(g, 20, 58, 56, 10, '#304870');
      for (let i = 0; i < 6; i++) Poly(g, [14 + i * 12, 16, 20 + i * 12, 4, 26 + i * 12, 16], '#ffffff');
    });
    blit(ctx, cam, body, this.x, this.y, false, this.flash());
    this.drawEgg(ctx, cam, this.x, this.y - 38, false);
    // jet flames
    if (this.state !== 'down') { ctx.fillStyle = this.t % 4 < 2 ? '#ffe040' : '#ff8020'; ctx.fillRect(Math.round(this.x - 20 - cam.x), Math.round(this.y + 36 - cam.y), 8, 6); ctx.fillRect(Math.round(this.x + 12 - cam.x), Math.round(this.y + 36 - cam.y), 8, 6); }
  }
}
class Snowball extends Obj {
  constructor(g, s) { super(g, s); this.vx = s.vx; this.floor = s.floor; this.always = true; this.r = s.big ? 16 : 10; this.rot = 0; }
  box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
  update() {
    this.x += this.vx; this.rot += this.vx / this.r; this.y = this.floor - this.r;
    if (this.x < this.g.camLock?.x0 - 40 || this.x < 0) this.alive = false;
  }
  touch(p) { if (p.invinc) { this.alive = false; this.g.fx.puff(this.x, this.y); } else p.hurt(this.x); }
  draw(ctx, cam) {
    ctx.fillStyle = '#f0f8ff'; ctx.beginPath(); ctx.arc(Math.round(this.x - cam.x), Math.round(this.y - cam.y), this.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#a0c0e0'; ctx.fillRect(Math.round(this.x - cam.x + Math.cos(this.rot) * this.r * 0.5) - 2, Math.round(this.y - cam.y + Math.sin(this.rot) * this.r * 0.5) - 2, 4, 4);
  }
}

// ------------------------------------------------------------ Serpent base (Scrap Dragon, Sandworm)
class ScrapDragon extends Boss {
  constructor(g, a) { super(g, a, 8); this.path = []; this.x = a.x1; this.y = a.y - 100; this.set('fly'); }
  think() {
    const a = this.arena, p = this.g.player;
    const t = this.t * 0.018;
    const w = (a.x1 - a.x0) / 2 - 40;
    if (this.state === 'fly') {
      this.x = this.cx + Math.sin(t) * w;
      this.y = a.y - 110 + Math.sin(t * 2) * 50;
      if (this.st % 100 === 60) { for (let i = 0; i < 3; i++) { const ang = Math.atan2(p.y - this.y, p.x - this.x) + (i - 1) * 0.3; this.shoot(this.x, this.y, Math.cos(ang) * 3, Math.sin(ang) * 3, 'spark'); } audio.sfx('zap', { vol: 0.5 }); }
      if (this.st > 300) this.set('swoop');
    } else if (this.state === 'swoop') {
      this.x += (p.x - this.x) * 0.03;
      this.y += (a.y - 30 - this.y) * 0.05;
      if (this.st > 70) this.set('fly');
    }
    this.path.unshift({ x: this.x, y: this.y }); if (this.path.length > 80) this.path.pop();
  }
  bodyRect() { return { x: this.x - 18, y: this.y - 18, w: 36, h: 36 }; }
  dangerRects() { const r = []; for (let i = 10; i < this.path.length; i += 10) r.push({ x: this.path[i].x - 11, y: this.path[i].y - 11, w: 22, h: 22 }); return r; }
  draw(ctx, cam) {
    const seg = sprite('sd-seg', 28, 28, g => { R(g, 3, 3, 22, 22, '#706858'); R(g, 5, 5, 18, 6, '#a09080'); R(g, 10, 12, 8, 8, '#f0c020'); });
    const head = sprite('sd-head', 56, 44, g => { Poly(g, [4, 8, 40, 4, 56, 20, 40, 40, 4, 36], '#706858'); Poly(g, [40, 22, 56, 20, 40, 40], '#403830'); E(g, 30, 14, 5, 4, '#ff3030'); for (let i = 0; i < 3; i++) Poly(g, [8 + i * 10, 8, 12 + i * 10, -2, 16 + i * 10, 8], '#a09080'); });
    for (let i = this.path.length - 1; i >= 10; i -= 10) blit(ctx, cam, seg, this.path[i].x, this.path[i].y, false, false, i * 0.1);
    const n = this.path[4] || this;
    blit(ctx, cam, head, this.x, this.y, this.x < n.x, this.flash());
    this.drawEgg(ctx, cam, this.x, this.y - 38, this.x > n.x);
  }
}
class Sandworm extends Boss {
  constructor(g, a) { super(g, a, 8); this.path = []; this.x = a.x0 + 100; this.y = a.y + 80; this.set('burrow'); }
  think() {
    const a = this.arena, p = this.g.player;
    if (this.state === 'burrow') {
      this.y = a.y + 80;
      this.x += (p.x - this.x) * 0.02;
      if (this.st % 8 === 0) this.g.fx.dust(this.x, a.y, 0);
      if (this.st > 110) { this.set('erupt'); audio.sfx('boom', { vol: 0.5 }); this.g.shake = 8; this.vy = -9; }
    } else if (this.state === 'erupt') {
      this.vy += 0.2; this.y += this.vy; this.x += this.face * 1.5;
      if (this.st === 30) for (let i = 0; i < 4; i++) this.shoot(this.x, this.y, (i - 1.5) * 1.5, -3, 'rock', true);
      if (this.y > a.y + 80) { this.set('burrow'); this.face = sign(p.x - this.x) || 1; }
    }
    this.vulnerable = this.state === 'erupt';
    this.path.unshift({ x: this.x, y: this.y }); if (this.path.length > 70) this.path.pop();
  }
  bodyRect() { return this.y < this.arena.y ? { x: this.x - 20, y: this.y - 20, w: 40, h: 40 } : null; }
  dangerRects() { const r = []; for (let i = 8; i < this.path.length; i += 8) if (this.path[i].y < this.arena.y) r.push({ x: this.path[i].x - 14, y: this.path[i].y - 14, w: 28, h: 28 }); if (this.state === 'erupt' && this.st < 20) r.push({ x: this.x - 24, y: this.arena.y - 60, w: 48, h: 60 }); return r; }
  draw(ctx, cam) {
    const seg = sprite('sw-seg', 36, 36, g => { E(g, 18, 18, 16, 16, '#c08040'); E(g, 18, 18, 12, 12, '#e0a060'); R(g, 4, 16, 28, 3, '#805020'); });
    const head = sprite('sw-head', 56, 56, g => { E(g, 28, 28, 26, 26, '#c08040'); E(g, 28, 28, 16, 16, '#401810'); for (let i = 0; i < 10; i++) { const a = i / 10 * 7; Poly(g, [28 + Math.cos(a) * 16, 28 + Math.sin(a) * 16, 28 + Math.cos(a + 0.3) * 8, 28 + Math.sin(a + 0.3) * 8, 28 + Math.cos(a + 0.6) * 16, 28 + Math.sin(a + 0.6) * 16], '#fff'); } E(g, 28, 28, 5, 5, '#ff3030'); });
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 424, Math.round(this.arena.y - cam.y)); ctx.clip();
    for (let i = this.path.length - 1; i >= 8; i -= 8) blit(ctx, cam, seg, this.path[i].x, this.path[i].y);
    const n = this.path[4] || this;
    blit(ctx, cam, head, this.x, this.y, false, this.flash(), Math.atan2(this.y - n.y, this.x - n.x));
    ctx.restore();
    if (this.state === 'burrow' && this.st > 60 && this.t % 6 < 3) { ctx.fillStyle = '#f0c870'; ctx.fillRect(Math.round(this.x - 16 - cam.x), Math.round(this.arena.y - 4 - cam.y), 32, 4); }
  }
}

// ------------------------------------------------------------ 10. Carnival Mech (Lantern Lagoon)
class Carnival extends Boss {
  constructor(g, a) { super(g, a, 8); this.x = a.x1 - 80; this.y = a.y; this.wheel = 0; this.set('roll'); }
  think() {
    const p = this.g.player, a = this.arena;
    this.wheel += 0.03;
    if (this.state === 'roll') {
      this.x += this.face * 1.2;
      if (this.x < a.x0 + 70) this.face = 1; if (this.x > a.x1 - 70) this.face = -1;
      if (this.st % 80 === 40) { this.g.addObj(new Balloon(this.g, { x: this.x, y: this.y - 110, vx: (p.x - this.x) / 90 })); audio.sfx('shot', { rate: 0.6 }); }
      if (this.st > 240) this.set('fireworks');
    } else if (this.state === 'fireworks') {
      if (this.st % 20 === 0) { this.shoot(this.x, this.y - 100, (Math.random() - 0.5) * 6, -6, 'fire', true); audio.sfx('fire', { vol: 0.4 }); }
      if (this.st > 120) this.set('roll');
    }
  }
  bodyRect() { return { x: this.x - 22, y: this.y - 130, w: 44, h: 36 }; }
  dangerRects() {
    const r = [{ x: this.x - 40, y: this.y - 40, w: 80, h: 40 }];
    for (let i = 0; i < 4; i++) { const an = this.wheel + i * Math.PI / 2; r.push({ x: this.x + Math.cos(an) * 56 - 10, y: this.y - 80 + Math.sin(an) * 56 - 10, w: 20, h: 20 }); }
    return r;
  }
  draw(ctx, cam) {
    const base = sprite('carn-base', 96, 48, g => { R(g, 4, 8, 88, 28, '#a02828'); R(g, 4, 8, 88, 5, '#ff6060'); for (let i = 0; i < 6; i++) E(g, 12 + i * 14, 20, 4, 4, i % 2 ? '#ffe040' : '#40e0ff'); E(g, 20, 40, 8, 8, '#303030'); E(g, 76, 40, 8, 8, '#303030'); });
    const x = this.x - cam.x, y = this.y - cam.y;
    ctx.strokeStyle = '#c0a060'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y - 80), 56, 0, 7); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const an = this.wheel + i * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(x, y - 80); ctx.lineTo(x + Math.cos(an) * 56, y - 80 + Math.sin(an) * 56); ctx.stroke();
      ctx.fillStyle = ['#ff4080', '#40e0ff', '#ffe040', '#80ff40'][i];
      ctx.fillRect(Math.round(x + Math.cos(an) * 56) - 10, Math.round(y - 80 + Math.sin(an) * 56) - 8, 20, 16);
    }
    ctx.lineWidth = 1;
    blit(ctx, cam, base, this.x, this.y - 24, false, this.flash());
    this.drawEgg(ctx, cam, this.x, this.y - 110, this.face > 0);
  }
}
class Balloon extends Obj {
  constructor(g, s) { super(g, s); this.vx = s.vx; this.vy = -1; this.always = true; this.life = 300; }
  box() { return { x: this.x - 9, y: this.y - 9, w: 18, h: 18 }; }
  update() { this.vy += 0.03; this.x += this.vx; this.y += this.vy; if (this.y > this.g.bossFloor() - 10 || --this.life < 0) { this.alive = false; this.g.fx.explode(this.x, this.y); audio.sfx('pop', { vol: 0.5 }); } }
  touch(p) { this.alive = false; this.g.fx.explode(this.x, this.y); if (!p.ball || p.ysp < 0) p.hurt(this.x); else { p.ysp = -5; this.g.addScore(100, this.x, this.y); } }
  draw(ctx, cam) { ctx.fillStyle = '#ff3060'; ctx.beginPath(); ctx.arc(Math.round(this.x - cam.x), Math.round(this.y - cam.y), 9, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(this.x - cam.x) - 4, Math.round(this.y - cam.y) - 5, 3, 3); ctx.fillStyle = '#303030'; ctx.fillRect(Math.round(this.x - cam.x) - 1, Math.round(this.y - cam.y) + 9, 2, 4); }
}

// ------------------------------------------------------------ 11. Magma Titan
class Magma extends Boss {
  constructor(g, a) { super(g, a, 8); this.side = 1; this.x = a.x1 - 60; this.y = a.y + 120; this.set('rise'); }
  think() {
    const a = this.arena, p = this.g.player;
    this.vulnerable = this.state === 'punch' && this.st > 30;
    if (this.state === 'rise') {
      this.x = this.side > 0 ? a.x1 - 60 : a.x0 + 60; this.face = -this.side;
      this.y = Math.max(a.y, this.y - 2);
      if (this.y === a.y) this.set('throw');
    } else if (this.state === 'throw') {
      if (this.st % 45 === 20) { this.shoot(this.x, this.y - 90, (p.x - this.x) / 55, -5.5, 'fire', true); audio.sfx('fire', { vol: 0.5 }); }
      if (this.st > 160) this.set('punch');
    } else if (this.state === 'punch') {
      if (this.st === 30) { this.g.shake = 14; audio.sfx('boom', { vol: 0.7 }); for (let i = 1; i <= 5; i++) this.g.addObj(new Eruption(this.g, { x: this.x + this.face * i * 50, y: a.y, delay: i * 10 })); }
      if (this.st > 120) this.set('sink');
    } else if (this.state === 'sink') {
      this.y += 2.5;
      if (this.y > a.y + 130) { this.side *= -1; this.set('rise'); }
    }
  }
  bodyRect() { return { x: this.x - 20, y: this.y - 130, w: 40, h: 36 }; }
  dangerRects() {
    const r = [{ x: this.x - 36, y: this.y - 96, w: 72, h: 96 }];
    if (this.state === 'punch' && this.st > 20 && this.st < 60) r.push({ x: this.x + this.face * 50 - 20, y: this.y - 30, w: 40, h: 30 });
    return r;
  }
  draw(ctx, cam) {
    const body = sprite('magma', 100, 110, g => {
      Poly(g, [20, 110, 30, 30, 70, 30, 80, 110], '#402020');
      for (let i = 0; i < 8; i++) R(g, 28 + (i * 13) % 44, 40 + i * 9, 10, 3, '#ff8020');
      E(g, 50, 30, 26, 18, '#583030'); E(g, 42, 28, 4, 3, '#ffe040'); E(g, 58, 28, 4, 3, '#ffe040');
      Poly(g, [26, 20, 34, 0, 40, 18], '#ff6020'); Poly(g, [60, 18, 66, 0, 74, 20], '#ff6020');
    });
    const fist = sprite('magma-fist', 36, 30, g => { E(g, 18, 15, 16, 13, '#583030'); R(g, 6, 8, 24, 3, '#ff8020'); });
    const clip = this.arena.y - cam.y + 4;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 424, Math.round(clip)); ctx.clip();
    blit(ctx, cam, body, this.x, this.y - 55, this.face > 0, this.flash());
    const reach = this.state === 'punch' ? Math.min(1, this.st / 25) * 50 : 20;
    const fy = this.state === 'punch' ? this.y - 16 : this.y - 70;
    blit(ctx, cam, fist, this.x + this.face * (30 + reach), fy);
    this.drawEgg(ctx, cam, this.x, this.y - 118, this.face > 0);
    ctx.restore();
  }
}
class Eruption extends Obj {
  constructor(g, s) { super(g, s); this.delay = s.delay; this.always = true; this.life = 50; }
  box() { return this.delay <= 0 && this.life > 10 ? { x: this.x - 10, y: this.y - 70, w: 20, h: 70 } : { x: 0, y: -999, w: 0, h: 0 }; }
  update() { if (this.delay > 0) { this.delay--; if (this.delay === 0) audio.sfx('fire', { vol: 0.4 }); return; } if (--this.life <= 0) this.alive = false; }
  touch(p) { p.hurt(this.x); }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    if (this.delay > 0) { if (this.delay % 4 < 2) { ctx.fillStyle = '#ff8020'; ctx.fillRect(x - 8, y - 3, 16, 3); } return; }
    const h = Math.min(70, (50 - this.life) * 8) * (this.life < 10 ? this.life / 10 : 1);
    ctx.fillStyle = '#ff5010'; ctx.fillRect(x - 10, y - h, 20, h);
    ctx.fillStyle = '#ffe060'; ctx.fillRect(x - 5, y - h + 4, 10, h - 4);
  }
}

// ------------------------------------------------------------ 13. Thunder Battleship
class Battleship extends Boss {
  constructor(g, a) { super(g, a, 8); this.x = this.cx; this.hy = a.y - 150; this.y = this.hy; this.set('cruise'); }
  think() {
    const a = this.arena, p = this.g.player;
    this.vulnerable = this.state === 'dip';
    if (this.state === 'cruise') {
      this.x = this.cx + Math.sin(this.t * 0.012) * ((a.x1 - a.x0) / 2 - 80);
      this.y = this.hy + Math.sin(this.t * 0.04) * 8;
      if (this.st % 60 === 30) { this.shoot(this.x, this.y + 20, 0, 1, 'ball', true); audio.sfx('shot', { rate: 0.5 }); }
      if (this.st % 150 === 100) this.g.addObj(new Bolt(this.g, { x: p.x, y: a.y }));
      if (this.st > 330) this.set('dip');
    } else if (this.state === 'dip') {
      this.y += ((a.y - 70) - this.y) * 0.05;
      if (this.st > 130) this.set('up');
    } else if (this.state === 'up') {
      this.y += (this.hy - this.y) * 0.05;
      if (this.st > 50) this.set('cruise');
    }
  }
  bodyRect() { return { x: this.x - 24, y: this.y - 34, w: 48, h: 30 }; }
  dangerRects() { return [{ x: this.x - 70, y: this.y, w: 140, h: 22 }]; }
  draw(ctx, cam) {
    const ship = sprite('bship', 176, 64, g => {
      Poly(g, [0, 20, 176, 20, 150, 50, 26, 50], '#505860'); Poly(g, [0, 20, 176, 20, 170, 26, 6, 26], '#9098a0');
      for (let i = 0; i < 7; i++) E(g, 30 + i * 20, 34, 4, 4, '#ffe040');
      R(g, 60, 50, 56, 8, '#303840'); Poly(g, [150, 20, 176, 4, 176, 20], '#707880');
      R(g, 20, 10, 20, 10, '#606870'); R(g, 136, 10, 20, 10, '#606870');
      E(g, 30, 8, 14, 3, '#a0a8b0'); E(g, 146, 8, 14, 3, '#a0a8b0');
    });
    blit(ctx, cam, ship, this.x, this.y + 12, false, this.flash());
    this.drawEgg(ctx, cam, this.x, this.y - 22, false);
    ctx.fillStyle = this.t % 4 < 2 ? '#ffffff' : '#80c0ff';
    ctx.fillRect(Math.round(this.x - 60 - cam.x), Math.round(this.y + 42 - cam.y), 4, 4); ctx.fillRect(Math.round(this.x + 56 - cam.x), Math.round(this.y + 42 - cam.y), 4, 4);
  }
}
class Bolt extends Obj {
  constructor(g, s) { super(g, s); this.always = true; this.t = 0; }
  box() { return this.t > 50 && this.t < 66 ? { x: this.x - 10, y: this.y - 300, w: 20, h: 300 } : { x: 0, y: -999, w: 0, h: 0 }; }
  update() { this.t++; if (this.t === 50) { audio.sfx('thunder'); this.g.flash = 3; } if (this.t > 70) this.alive = false; }
  touch(p) { p.hurt(this.x); }
  draw(ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    if (this.t < 50) { if (this.t % 6 < 3) { ctx.fillStyle = '#ffff60'; ctx.fillRect(Math.round(x) - 10, Math.round(y) - 2, 20, 2); } return; }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y - 300);
    for (let yy = y - 300; yy < y; yy += 20) ctx.lineTo(x + (Math.random() - 0.5) * 16, yy);
    ctx.lineTo(x, y); ctx.stroke(); ctx.strokeStyle = '#ffff80'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
  }
}

// ------------------------------------------------------------ 14. Plant Mech (Gravity Gardens)
class PlantMech extends Boss {
  constructor(g, a) { super(g, a, 8); this.x = this.cx; this.y = a.y; this.open = 0; this.set('vines'); this.vines = []; }
  think() {
    const p = this.g.player, a = this.arena;
    this.vulnerable = this.open > 0.7;
    if (this.state === 'vines') {
      this.open = Math.max(0, this.open - 0.05);
      if (this.st % 70 === 10) { const side = p.x < this.x ? -1 : 1; this.vines.push({ side, t: 0 }); audio.sfx('rev', { rate: 0.5, vol: 0.5 }); }
      if (this.st % 50 === 25) { for (let i = -1; i <= 1; i++) this.shoot(this.x, this.y - 110, i * 2.4, -4, 'seed', true); }
      if (this.st > 260) this.set('bloom');
    } else if (this.state === 'bloom') {
      this.open = Math.min(1, this.open + 0.04);
      if (this.st > 150) this.set('vines');
    }
    for (const v of this.vines) v.t++;
    this.vines = this.vines.filter(v => v.t < 80);
  }
  bodyRect() { return { x: this.x - 22, y: this.y - 140, w: 44, h: 36 }; }
  dangerRects() {
    const r = [{ x: this.x - 30, y: this.y - 100, w: 60, h: 100 }];
    for (const v of this.vines) if (v.t > 30 && v.t < 70) { const len = Math.min(1, (v.t - 30) / 12) * 170; r.push({ x: v.side > 0 ? this.x + 30 : this.x - 30 - len, y: this.y - 18, w: len, h: 18 }); }
    return r;
  }
  draw(ctx, cam) {
    const stem = sprite('pm-stem', 72, 110, g => { R(g, 28, 0, 16, 110, '#408030'); for (let i = 0; i < 5; i++) E(g, i % 2 ? 50 : 22, 20 + i * 20, 14, 5, '#60b040'); R(g, 6, 92, 60, 18, '#606870'); R(g, 6, 92, 60, 4, '#a0a8b0'); });
    blit(ctx, cam, stem, this.x, this.y - 55, false, false);
    const x = this.x - cam.x, y = this.y - cam.y;
    // petals
    for (let i = 0; i < 6; i++) {
      const an = i / 6 * Math.PI * 2 + this.t * 0.01;
      const d = 16 + this.open * 18;
      ctx.fillStyle = i % 2 ? '#ff80c0' : '#ff50a0';
      ctx.beginPath(); ctx.ellipse(Math.round(x + Math.cos(an) * d), Math.round(y - 124 + Math.sin(an) * d), 14, 9, an, 0, 7); ctx.fill();
    }
    if (this.open > 0.5) this.drawEgg(ctx, cam, this.x, this.y - 130, false);
    else { ctx.fillStyle = '#ffe040'; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y - 124), 16, 0, 7); ctx.fill(); }
    for (const v of this.vines) {
      if (v.t < 30) { if (v.t % 6 < 3) { ctx.fillStyle = '#80ff40'; ctx.fillRect(Math.round(x + v.side * 40), Math.round(y - 20), 10 * v.side, 4); } continue; }
      const len = Math.min(1, (v.t - 30) / 12) * 170 * (v.t > 70 ? (80 - v.t) / 10 : 1);
      ctx.fillStyle = '#306020'; ctx.fillRect(Math.round(v.side > 0 ? x + 30 : x - 30 - len), Math.round(y - 16), len, 14);
      ctx.fillStyle = '#80e040'; for (let k = 0; k < len; k += 12) ctx.fillRect(Math.round((v.side > 0 ? x + 30 + k : x - 30 - k)), Math.round(y - 18), 4, 4);
    }
  }
}

// ------------------------------------------------------------ 15. Metal Sonic final fight
class MetalFinal extends Boss {
  constructor(g, a) { super(g, a, 10); this.x = a.x1 - 60; this.y = a.y - 19; this.vx = 0; this.vy = 0; this.set('taunt'); this.anim = 'stand'; this.shieldOn = false; }
  think() {
    const p = this.g.player, a = this.arena;
    this.vulnerable = !this.shieldOn;
    const ground = a.y - 19;
    switch (this.state) {
      case 'taunt': this.anim = 'stand'; this.face = sign(p.x - this.x) || -1; if (this.st > 50) this.set(this.hp <= 5 && Math.random() < 0.5 ? 'shield' : ['dash', 'hop', 'laser'][Math.floor(Math.random() * 3)]); break;
      case 'dash':
        this.anim = this.st < 30 ? 'ball' : 'peel'; this.shieldOn = this.st >= 30 && this.st < 30 + 60;
        if (this.st === 30) { this.vx = this.face * 9; audio.sfx('release'); }
        if (this.st >= 30) { this.x += this.vx; if (this.x < a.x0 + 20 || this.x > a.x1 - 20) { this.x = clamp(this.x, a.x0 + 20, a.x1 - 20); this.vx = 0; this.shieldOn = false; this.set('tired'); } }
        break;
      case 'hop':
        this.anim = 'ball';
        if (this.st === 1) { this.vy = -8; this.vx = (p.x - this.x) / 50; audio.sfx('jump'); }
        this.vy += 0.25; this.x = clamp(this.x + this.vx, a.x0 + 20, a.x1 - 20); this.y += this.vy;
        if (this.y >= ground) { this.y = ground; this.set('tired'); }
        break;
      case 'laser':
        this.anim = 'stand';
        if (this.st % 20 === 10 && this.st < 70) { this.shoot(this.x + this.face * 14, this.y - 4, this.face * 5, 0, 'laser'); audio.sfx('shot'); }
        if (this.st > 90) this.set('taunt');
        break;
      case 'shield':
        this.anim = 'stand'; this.shieldOn = true;
        if (this.st % 12 === 0) { const an = this.st / 12; this.shoot(this.x, this.y, Math.cos(an) * 3, Math.sin(an) * 3, 'spark'); }
        if (this.st === 90) { audio.sfx('zap'); }
        if (this.st > 110) { this.shieldOn = false; this.set('dash'); }
        break;
      case 'tired': this.anim = 'stand'; this.shieldOn = false; if (this.st > 55) this.set('taunt'); break;
    }
  }
  bodyRect() { return { x: this.x - 12, y: this.y - 18, w: 24, h: 36 }; }
  dangerRects() { return this.state === 'dash' && this.st > 30 ? [{ x: this.x - 14, y: this.y - 16, w: 28, h: 34 }] : []; }
  collide(p) {
    if (this.shieldOn) { const hb = p.hitbox(); if (rectsOverlap(hb, this.bodyRect())) { p.hurt(this.x); } return; }
    super.collide(p);
  }
  draw(ctx, cam) {
    const fr = this.anim === 'ball' || this.anim === 'peel' ? (this.t >> 1) % 4 : 0;
    const im = hogFrame('metal', this.anim, fr);
    ctx.save(); ctx.translate(Math.round(this.x - cam.x), Math.round(this.y - cam.y)); if (this.face < 0) ctx.scale(-1, 1);
    if (this.flash()) ctx.globalAlpha = 0.5;
    ctx.drawImage(im, -24, this.anim === 'ball' ? -24 : -25); ctx.restore();
    if (this.shieldOn) {
      ctx.strokeStyle = this.t % 4 < 2 ? '#80e0ff' : '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(Math.round(this.x - cam.x), Math.round(this.y - cam.y), 24, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    }
  }
}

// ------------------------------------------------------------ 16. Time Devourer (final)
class Devourer extends Boss {
  constructor(g, a) { super(g, a, 18); this.x = this.cx; this.hy = a.y - 120; this.y = this.hy; this.phase = 0; this.set('float'); }
  onHit() {
    const np = this.hp > 12 ? 0 : this.hp > 6 ? 1 : 2;
    if (np !== this.phase) { this.phase = np; this.set('morph'); this.g.flash = 10; audio.sfx('warp'); this.g.setEraVisual(['past', 'present', 'bad'][np]); }
  }
  think() {
    const p = this.g.player, a = this.arena;
    this.vulnerable = this.state === 'low';
    if (this.state === 'morph') { if (this.st > 60) this.set('float'); return; }
    if (this.state === 'float') {
      this.x = this.cx + Math.sin(this.t * 0.015) * 120;
      this.y = this.hy + Math.sin(this.t * 0.05) * 10;
      const rate = [80, 55, 40][this.phase];
      if (this.st % rate === rate - 1) this.attack(p);
      if (this.st > 300) this.set('low');
    } else if (this.state === 'low') {
      this.y += ((a.y - 70) - this.y) * 0.06;
      if (this.phase === 2 && this.st % 30 === 0) this.shoot(this.x, this.y, sign(p.x - this.x) * 4, 0, 'laser');
      if (this.st > 120) this.set('rise');
    } else if (this.state === 'rise') { this.y += (this.hy - this.y) * 0.06; if (this.st > 40) this.set('float'); }
  }
  attack(p) {
    if (this.phase === 0) { for (let i = 0; i < 3; i++) this.shoot(this.x, this.y + 20, (p.x - this.x) / 70 + (i - 1), -3, 'rock', true); audio.sfx('pop', { rate: 0.5 }); }
    else if (this.phase === 1) { const an = Math.atan2(p.y - this.y, p.x - this.x); for (let i = -2; i <= 2; i++) this.shoot(this.x, this.y, Math.cos(an + i * 0.2) * 3.5, Math.sin(an + i * 0.2) * 3.5, 'laser'); audio.sfx('shot'); }
    else { for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2 + this.t; this.shoot(this.x, this.y, Math.cos(an) * 2.5, Math.sin(an) * 2.5, 'spark'); } this.g.addObj(new Bolt(this.g, { x: p.x, y: this.arena.y })); audio.sfx('zap'); }
  }
  bodyRect() { return { x: this.x - 24, y: this.y - 50, w: 48, h: 36 }; }
  dangerRects() { return [{ x: this.x - 56, y: this.y - 14, w: 112, h: 40 }]; }
  draw(ctx, cam) {
    const forms = [
      g => { E(g, 64, 50, 60, 30, '#8a7a60'); E(g, 64, 44, 50, 20, '#b0a080'); for (let i = 0; i < 12; i++) { const a = i / 12 * 7; R(g, 64 + Math.cos(a) * 40 - 2, 50 + Math.sin(a) * 22 - 2, 4, 4, '#503010'); } Poly(g, [8, 50, 0, 80, 30, 70], '#6a5a40'); Poly(g, [120, 50, 128, 80, 98, 70], '#6a5a40'); },
      g => { E(g, 64, 50, 60, 28, '#606878'); E(g, 64, 42, 48, 16, '#a0a8b8'); R(g, 20, 60, 88, 10, '#303840'); for (let i = 0; i < 5; i++) E(g, 30 + i * 17, 64, 4, 3, '#ff3030'); Poly(g, [4, 44, 0, 84, 24, 64], '#404850'); Poly(g, [124, 44, 128, 84, 104, 64], '#404850'); },
      g => { Poly(g, [0, 50, 40, 20, 88, 20, 128, 50, 88, 76, 40, 76], '#301040'); Poly(g, [20, 50, 44, 30, 84, 30, 108, 50, 84, 66, 44, 66], '#8040c0'); for (let i = 0; i < 6; i++) R(g, 30 + i * 13, 48, 6, 3, '#60f0ff'); Poly(g, [0, 50, -0, 90, 30, 70], '#60f0ff'); Poly(g, [128, 50, 128, 90, 98, 70], '#60f0ff'); },
    ];
    const im = sprite('dev-' + this.phase, 128, 96, forms[this.phase]);
    if (this.state === 'morph' && this.st % 6 < 3) ctx.globalAlpha = 0.5;
    // clock ring behind
    const x = this.x - cam.x, y = this.y - cam.y;
    ctx.strokeStyle = '#f0d080'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y - 30), 44, 0, 7); ctx.stroke();
    const hand = -this.t * 0.05;
    ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + Math.cos(hand) * 38, y - 30 + Math.sin(hand) * 38); ctx.stroke(); ctx.lineWidth = 1;
    blit(ctx, cam, im, this.x, this.y + 4, false, this.flash());
    ctx.globalAlpha = 1;
    this.drawEgg(ctx, cam, this.x, this.y - 40, sign(this.g.player.x - this.x) > 0);
  }
}

// ------------------------------------------------------------ Metal Sonic racer / chaser
export class MetalRacer extends Obj {
  constructor(g, arena, mode) {
    super(g, { x: arena.x0 - 40, y: arena.y - 19 });
    this.arena = arena; this.mode = mode; this.always = true; this.speed = 0; this.started = false; this.won = false;
    this.anim = 'stand'; this.laserT = 120; this.face = 1;
    if (mode === 'chase') this.x = arena.x0 - 300;
  }
  box() { return { x: this.x - 10, y: this.y - 16, w: 20, h: 32 }; }
  surfY(x) { const s = this.g.gen.surf[Math.floor(x / 16)]; return s > 0 ? s : null; }
  update() {
    this.t++;
    const p = this.g.player, a = this.arena;
    if (!this.started) {
      if (p.x > a.x0 - 60) { this.started = true; this.startT = this.t; this.g.onRaceStart(this.mode); }
      else { const s = this.surfY(this.x); if (s) this.y = s - 19; return; }
    }
    if (this.won || this.g.raceOver) { this.anim = 'stand'; return; }
    const lead = this.x - p.x;
    const race2 = this.g.zoneIdx >= 10;
    const pspd = Math.abs(p.ground ? p.gsp : p.xsp);
    let target;
    if (this.mode === 'chase') {
      // stays behind you as long as you keep moving; only closes in if you stall
      target = lead < -360 ? 8 : lead < -120 ? Math.max(3.5, pspd * 0.9) : 4;
      this.laserT--;
      if (this.laserT === 30) this.warn = 30;
      if (this.laserT <= 0 && lead < -60 && lead > -280) { this.laserT = 220; this.g.addObj(new Projectile(this.g, { x: this.x + 12, y: this.y, vx: 5, vy: 0, kind: 'laser', life: 90 })); audio.sfx('shot'); }
      else if (this.laserT <= 0) this.laserT = 60;
    } else {
      // pace is below Sonic's top running speed; rubber-bands both ways but never runs away
      const base = race2 ? 5.6 : 5.2;
      if (this.t < this.startT + 50) target = 0;
      else if (lead > 0) target = base - Math.min(2.4, lead / 90);
      else target = Math.min(base + 2.5, base + -lead / 140);
      if (p.state === 'hurt' || p.dead) target = Math.min(target, 3);
    }
    this.speed += (target - this.speed) * 0.05;
    this.x += this.speed;
    const s = this.surfY(this.x + 8);
    if (s != null) this.y += ((s - 19) - this.y) * 0.35;
    this.anim = this.speed < 0.5 ? 'stand' : this.speed > 9 ? 'peel' : 'run';
    if (this.t % 3 === 0) this.g.fx.jet(this.x - 10, this.y + 4);
    if (this.mode === 'race' && this.x >= a.x1) { this.won = true; this.g.onRaceGoal('metal'); }
    if (this.mode === 'chase' && this.x >= a.x1 - 20) { this.won = true; }
  }
  touch(p) {
    if (this.mode === 'chase') p.hurt(this.x);
    else if (p.ball && !this.bumpT) { this.bumpT = 30; this.speed *= 0.4; audio.sfx('bosshit'); p.xsp = -p.xsp * 0.3; }
  }
  draw(ctx, cam) {
    if (this.bumpT) this.bumpT--;
    if (this.warn) this.warn--;
    const im = hogFrame('metal', this.anim, (this.t >> 1) % 4);
    ctx.save(); ctx.translate(Math.round(this.x - cam.x), Math.round(this.y - cam.y));
    if (this.warn && this.warn % 6 < 3) ctx.filter = 'brightness(2.2)';
    ctx.drawImage(im, -24, -25); ctx.filter = 'none'; ctx.restore();
    const sx = this.x - cam.x;
    if (sx < -10 || sx > 434) {
      // off-screen indicator
      const ix = sx < 0 ? 6 : 410;
      this.g.text(ctx, sx < 0 ? '<M' : 'M>', ix, 110, { style: 'red' });
    }
  }
}

export const BOSSES = {
  drillcrab: DrillCrab, eel: Eel, golem: Golem, windup: WindUp, avalanche: Avalanche, scrapdragon: ScrapDragon,
  sandworm: Sandworm, carnival: Carnival, magma: Magma, battleship: Battleship, plantmech: PlantMech,
  metalfinal: MetalFinal, devourer: Devourer,
};
