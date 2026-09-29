// Sonic: movement physics and animation.
import { input } from './input.js';
import { audio } from './audio.js';
import { hogFrame } from './sprites.js';
import { clamp, sign } from './util.js';

const PHYS = {
  acc: 0.046875, dec: 0.5, frc: 0.046875, top: 6, slp: 0.125, slpUp: 0.078125, slpDown: 0.3125,
  rollFrc: 0.0234375, rollDec: 0.125, air: 0.09375, jmp: 6.5, grv: 0.21875, maxSpd: 16,
};
const WR = 9, HR_STAND = 19, HR_ROLL = 14;

export class Player {
  constructor(game, x, y) {
    this.g = game;
    this.x = x; this.y = y - HR_STAND;
    this.xsp = 0; this.ysp = 0; this.gsp = 0; this.a = 0;
    this.ground = true; this.rolling = false; this.jumping = false;
    this.gdir = 1; this.facing = 1;
    this.hr = HR_STAND;
    this.state = 'normal';
    this.anim = 'stand'; this.frame = 0; this.animT = 0; this.idle = 0;
    this.invuln = 0; this.invinc = 0; this.speedShoes = 0; this.shield = false;
    this.air = 1800; this.underwater = false;
    this.spinRev = 0; this.peel = 0;
    this.spring = false; this.skidding = false; this.pushing = false;
    this.rail = null; this.zip = null; this.loop = null; this.platform = null;
    this.board = false; this.sand = false;
    this.controlLock = 0;
    this.dead = false; this.deadT = 0;
    this.visible = true;
    this.combo = 0;
    this.autoRun = 0;
    this.trail = [];
  }
  get speed() { return this.ground ? Math.abs(this.gsp) : Math.hypot(this.xsp, this.ysp); }
  get ball() { return this.rolling || (this.jumping && !this.ground) || this.state === 'spindash'; }
  get phys() {
    const p = { ...PHYS };
    if (this.speedShoes > 0) { p.acc *= 2; p.top *= 2; p.air *= 2; p.frc *= 2; }
    if (this.underwater) { p.acc /= 2; p.dec /= 2; p.frc /= 2; p.top /= 2; p.air /= 2; p.grv = 0.0625; p.jmp = 3.5; }
    if (this.g.zoneDef.ice && this.ground) { p.frc *= 0.25; p.dec *= 0.3; }
    return p;
  }
  hitbox() {
    const h = this.ball ? HR_ROLL : HR_STAND;
    return { x: this.x - 8, y: this.y - h + 3, w: 16, h: h * 2 - 6 };
  }
  setRadius(roll) {
    const nh = roll ? HR_ROLL : HR_STAND;
    if (nh === this.hr) return;
    if (this.ground) this.y += (this.hr - nh) * this.gdir;
    this.hr = nh;
  }

  // ---------------------------------------------------------------- update
  update() {
    const g = this.g;
    if (this.dead) return this.updateDead();
    if (this.invuln > 0) this.invuln--;
    if (this.invinc > 0) { this.invinc--; if (this.invinc === 0) g.onPowerEnd('invinc'); }
    if (this.speedShoes > 0) { this.speedShoes--; if (this.speedShoes === 0) g.onPowerEnd('speed'); }
    if (this.controlLock > 0) this.controlLock--;
    this.updateWater();

    switch (this.state) {
      case 'loop': this.updateLoop(); break;
      case 'hang': this.updateHang(); break;
      case 'hurt': this.updateAir(true); break;
      case 'victory': this.updateVictory(); break;
      case 'frozen': break;
      default:
        if (this.ground) this.updateGround(); else this.updateAir(false);
    }
    // level bounds
    const minX = g.camLock ? g.camLock.x0 + 10 : 10;
    const maxX = g.camLock ? g.camLock.x1 - 10 : g.level.pw - 10;
    if (this.x < minX) { this.x = minX; if (this.xsp < 0) this.xsp = 0; if (this.gsp < 0) this.gsp = 0; }
    if (this.x > maxX) { this.x = maxX; if (this.xsp > 0) this.xsp = 0; if (this.gsp > 0) this.gsp = 0; }
    if (this.gdir === 1 && this.y > g.level.ph + 40) this.die(true);
    if (this.gdir === -1 && this.y < -60) this.die(true);
    this.animate();
    if (this.speed > 9 || this.invinc > 0 || this.speedShoes > 0) {
      this.trail.push({ x: this.x, y: this.y, a: this.drawAngle(), anim: this.anim, frame: this.frame, f: this.facing });
      if (this.trail.length > 6) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
  }

  updateWater() {
    const g = this.g;
    const wy = g.waterY;
    const was = this.underwater;
    this.underwater = wy != null && this.y > wy;
    if (this.underwater !== was) {
      if (Math.abs(this.ysp) > 1) { audio.sfx('splash'); g.fx.splash(this.x, wy); }
      if (this.underwater) { this.xsp *= 0.5; this.ysp *= 0.25; this.gsp *= 0.5; }
      else if (this.ysp < 0) this.ysp *= 2;
    }
    if (this.underwater && !this.shieldWater) {
      this.air--;
      if (this.air === 1500 || this.air === 1200 || this.air === 900) audio.sfx('bubble', { rate: 0.7 });
      if (this.air < 720 && this.air % 120 === 0) g.fx.number(this.x, this.y - 30, Math.floor(this.air / 120));
      if (this.air <= 0) this.die(false, true);
    } else this.air = 1800;
    if (this.underwater && Math.random() < 0.03) g.fx.bubble(this.x + this.facing * 8, this.y - 10);
  }

  // ---------------------------------------------------------------- ground
  updateGround() {
    const g = this.g, P = this.phys;
    const L = this.controlLock > 0 ? false : input.held('left');
    const Rt = this.controlLock > 0 ? false : input.held('right');
    const down = input.held('down'), up = input.held('up');

    // spindash
    if (this.state === 'spindash') {
      if (input.pressed('jump')) { this.spinRev = Math.min(8, this.spinRev + 2); audio.sfx('rev', { rate: 1 + this.spinRev * 0.06 }); }
      this.spinRev -= ((this.spinRev / 0.125) | 0) / 256;
      if (!down) {
        this.state = 'normal';
        this.rolling = true;
        this.gsp = (8 + Math.floor(this.spinRev) / 2) * this.facing;
        if (this.speedShoes) this.gsp *= 1.25;
        audio.sfx('release');
        g.camDelay = 14;
      } else { g.fx.dust(this.x - this.facing * 10, this.y + this.hr * this.gdir, -this.facing); return this.snapFloor(); }
    }
    if (this.state === 'peelout') {
      this.peel++;
      if (this.peel % 10 === 1) audio.sfx('rev', { rate: 0.8 + Math.min(this.peel, 30) * 0.02 });
      if (!up) {
        this.state = 'normal';
        if (this.peel >= 30) { this.gsp = 12 * this.facing; if (this.speedShoes) this.gsp *= 1.25; audio.sfx('release'); g.camDelay = 14; }
        this.peel = 0;
      } else return this.snapFloor();
    }

    if (input.pressed('jump') && this.controlLock === 0) {
      if (down && Math.abs(this.gsp) < 1 && !this.rolling) {
        this.state = 'spindash'; this.spinRev = 0; this.gsp = 0; this.setRadius(true);
        audio.sfx('rev'); return;
      }
      if (up && Math.abs(this.gsp) < 1 && !this.rolling) {
        this.state = 'peelout'; this.peel = 0; this.gsp = 0; return;
      }
      return this.jump(P);
    }

    // slope factor
    const sA = Math.sin(this.a);
    if (this.gdir === 1) {
      if (this.rolling) {
        const s = sign(this.gsp) === sign(sA) ? P.slpDown : P.slpUp;
        this.gsp += s * sA;
      } else if (Math.abs(this.gsp) > 0.05 || Math.abs(sA) > 0.4) this.gsp += P.slp * sA;
    }
    if (this.sand) { this.gsp += 0.2 * sA + 0.06 * this.facing * 0; if (Math.abs(this.gsp) < 4) this.gsp += 0.12 * (this.gsp >= 0 ? 1 : -1); }

    this.skidding = false;
    if (this.rolling) {
      if (L && this.gsp > 0) this.gsp -= P.rollDec;
      if (Rt && this.gsp < 0) this.gsp += P.rollDec;
      this.gsp -= Math.min(Math.abs(this.gsp), P.rollFrc) * sign(this.gsp);
      if (Math.abs(this.gsp) < 0.5 && !this.board) { this.rolling = false; this.setRadius(false); }
    } else {
      if (L) {
        if (this.gsp > 0) { this.gsp -= P.dec; if (this.gsp > 4 && Math.abs(this.a) < 0.5) this.skid(); if (this.gsp <= 0) this.gsp = -0.5; }
        else if (this.gsp > -P.top) { this.gsp = Math.max(-P.top, this.gsp - P.acc); }
        this.facing = this.gsp <= 0 ? -1 : this.facing;
      } else if (Rt) {
        if (this.gsp < 0) { this.gsp += P.dec; if (this.gsp < -4 && Math.abs(this.a) < 0.5) this.skid(); if (this.gsp >= 0) this.gsp = 0.5; }
        else if (this.gsp < P.top) { this.gsp = Math.min(P.top, this.gsp + P.acc); }
        this.facing = this.gsp >= 0 ? 1 : this.facing;
      } else if (!this.board) {
        this.gsp -= Math.min(Math.abs(this.gsp), P.frc) * sign(this.gsp);
      }
      if (this.board) { this.gsp = Math.max(this.gsp, 6); this.facing = 1; }
      if (down && Math.abs(this.gsp) >= 1 && !this.board) { this.rolling = true; this.setRadius(true); audio.sfx('rev', { rate: 1.4, vol: 0.5 }); }
    }
    if (this.rail) {
      // grinding: little friction, a push from gravity
      this.gsp += 0.06 * sA;
      if (Math.abs(this.gsp) < 3) this.gsp = 3 * (this.gsp >= 0 ? 1 : -1);
      if (g.frame % 4 === 0) g.fx.spark(this.x - this.facing * 6, this.y + this.hr);
    }
    this.gsp = clamp(this.gsp, -P.maxSpd, P.maxSpd);

    // move
    const ca = Math.cos(this.a), sa = Math.sin(this.a);
    let dx = this.gsp * ca, dy = this.gsp * sa;
    // wall check (substeps for high speed)
    const steps = Math.ceil(Math.abs(dx) / 8) || 1;
    this.pushing = false;
    for (let i = 0; i < steps; i++) {
      this.x += dx / steps; this.y += dy / steps;
      if (this.wallCheck(this.gsp)) { this.gsp = 0; if (L || Rt) this.pushing = true; break; }
    }
    // platform carry
    if (this.platform) { this.x += this.platform.dx || 0; this.y += this.platform.dy || 0; }
    this.snapFloor();
    if (this.ground && Math.abs(this.a) > 1.1 && Math.abs(this.gsp) < 2.5 && this.gdir === 1) {
      this.fall(); this.controlLock = 30;
    }
    if (this.ground && this.gsp === 0 && !L && !Rt) this.idle++; else this.idle = 0;
  }
  skid() {
    if (!this.skidding) { if (this.g.frame % 6 === 0) audio.sfx('skid', { vol: 0.6 }); }
    this.skidding = true;
    if (this.g.frame % 4 === 0) this.g.fx.dust(this.x, this.y + this.hr, 0);
  }
  jump(P) {
    const ca = Math.cos(this.a), sa = Math.sin(this.a);
    const j = P.jmp * (this.board ? 1.1 : 1);
    this.xsp = this.gsp * ca + j * sa * this.gdir;
    this.ysp = this.gsp * sa - j * ca * this.gdir;
    this.ground = false; this.jumping = true; this.rolling = true; this.spring = false;
    this.rail = null; this.platform = null;
    this.setRadius(true);
    this.y -= 2 * this.gdir;
    audio.sfx('jump');
  }
  fall() {
    this.xsp = this.gsp * Math.cos(this.a);
    this.ysp = this.gsp * Math.sin(this.a);
    this.ground = false; this.rail = null; this.platform = null;
    this.a = 0;
  }
  wallCheck(dir) {
    const lv = this.g.level;
    if (dir === 0) return false;
    const s = dir > 0 ? 1 : -1;
    const wx = this.x + s * (WR + 1);
    const wy = this.y + (Math.abs(this.a) < 0.1 ? 4 * this.gdir : 0);
    if (lv.solid(wx, wy) || this.g.solidObjAt(wx, wy, this)) {
      // push out
      let n = 0;
      while ((lv.solid(this.x + s * (WR + 1), wy) || this.g.solidObjAt(this.x + s * (WR + 1), wy)) && n++ < 16) this.x -= s;
      return true;
    }
    return false;
  }
  // Find ground under the feet; returns true if still grounded
  snapFloor() {
    const lv = this.g.level;
    const gd = this.gdir;
    const feet = this.y + this.hr * gd;
    const range = 14 + Math.min(Math.abs(this.gsp), 10);
    const ca = Math.cos(this.a);
    const ax = this.x - WR * ca, bx = this.x + WR * ca;
    let ya = lv.floorScan(ax, feet - Math.sin(this.a) * -WR * 0, range, gd);
    let yb = lv.floorScan(bx, feet, range, gd);
    // rails
    let railHit = null;
    if (gd === 1) {
      const rh = lv.lineAt(this.x, feet, 10, range, 'rail');
      if (rh && (this.rail || this.g.frame > 0)) {
        const best = Math.min(ya ?? 1e9, yb ?? 1e9);
        if (rh.y <= best + 2) railHit = rh;
      }
    }
    // platforms
    const plat = this.g.platformUnder(this.x, feet, 10, range, gd);
    if (railHit) {
      this.y = railHit.y - this.hr; this.a = railHit.L.ang; this.rail = railHit.L; this.platform = null;
      return true;
    }
    this.rail = null;
    if (plat && (gd === 1 ? plat.top <= Math.min(ya ?? 1e9, yb ?? 1e9) : true)) {
      this.y = plat.top - this.hr * gd; this.a = 0; this.platform = plat.obj;
      plat.obj.onStand && plat.obj.onStand(this);
      return true;
    }
    this.platform = null;
    if (ya == null && yb == null) { this.fall(); return false; }
    let fy;
    if (gd === 1) {
      fy = Math.min(ya ?? 1e9, yb ?? 1e9);
      if (ya != null && yb != null) {
        let ang = Math.atan2(yb - ya, bx - ax);
        if (Math.abs(ang) > 1.2) ang = this.a; // edge noise
        this.a = ang;
      } else this.a *= 0.5;
    } else {
      fy = Math.max(ya ?? -1e9, yb ?? -1e9);
      this.a = 0;
    }
    this.y = fy - this.hr * gd;
    return true;
  }

  // ---------------------------------------------------------------- air
  updateAir(hurt) {
    const g = this.g, P = this.phys;
    const gd = this.gdir;
    if (!hurt && this.controlLock === 0) {
      if (input.held('left')) { this.xsp = Math.max(this.xsp - P.air * 2 * (this.xsp > 0 ? 1 : 0.5) * 1, this.xsp > -P.top ? -P.top : this.xsp); this.facing = -1; }
      if (input.held('right')) { this.xsp = Math.min(this.xsp + P.air * 2 * (this.xsp < 0 ? 1 : 0.5), this.xsp < P.top ? P.top : this.xsp); this.facing = 1; }
      // variable jump
      if (this.jumping && !input.held('jump') && this.ysp * gd < -4) this.ysp = -4 * gd;
      // air drag
      if (this.ysp * gd < 0 && this.ysp * gd > -4) this.xsp -= (this.xsp / 0.125) / 256;
      // shield abilities (insta-shield style: nothing) ; drop dash-free
    }
    const wind = g.windAt(this.x, this.y);
    this.xsp += wind.x; this.ysp += wind.y;
    this.ysp += (hurt ? 0.1875 : P.grv) * gd;
    if (this.ysp * gd > P.maxSpd) this.ysp = P.maxSpd * gd;
    if (this.spring && this.ysp * gd > 0) this.spring = false;

    const steps = Math.ceil(Math.max(Math.abs(this.xsp), Math.abs(this.ysp)) / 7) || 1;
    for (let i = 0; i < steps; i++) {
      this.x += this.xsp / steps; this.y += this.ysp / steps;
      if (this.wallCheck(this.xsp)) this.xsp = 0;
      // ceiling
      if (this.ysp * gd < 0) {
        const hy = this.y - this.hr * gd;
        const lv = g.level;
        const hit = gd === 1 ? (lv.solid(this.x - 6, hy) || lv.solid(this.x + 6, hy)) : (lv.solidF(this.x - 6, hy) || lv.solidF(this.x + 6, hy));
        if (hit) { this.ysp = 0; let n = 0; while (n++ < 12 && (gd === 1 ? (lv.solid(this.x - 6, this.y - this.hr * gd) || lv.solid(this.x + 6, this.y - this.hr * gd)) : lv.solidF(this.x, this.y - this.hr * gd))) this.y += gd; }
      } else if (this.landCheck()) break;
    }
    // zipline grab
    if (!hurt && this.ysp * gd > -2) {
      const zh = g.level.lineAt(this.x, this.y - this.hr - 6, 10, 12, 'zip');
      if (zh && this.gdir === 1 && !this.zipCooldown) { this.state = 'hang'; this.zip = zh.L; this.zipSpd = Math.max(2, this.xsp); audio.sfx('grind', { vol: 0.4 }); }
    }
    if (this.zipCooldown) this.zipCooldown--;
  }
  landCheck() {
    const g = this.g, lv = g.level, gd = this.gdir;
    const feet = this.y + this.hr * gd;
    const rng = 2;
    let ya = lv.floorScan(this.x - WR, feet, rng, gd);
    let yb = lv.floorScan(this.x + WR, feet, rng, gd);
    const railHit = gd === 1 ? lv.lineAt(this.x, feet, 4 + Math.max(0, this.ysp), 2, 'rail') : null;
    const plat = g.platformUnder(this.x, feet, 4 + Math.abs(this.ysp), rng, gd);
    if (!(ya != null || yb != null || railHit || plat)) return false;
    // compute angle
    this.ground = true;
    if (this.state === 'hurt') { this.state = 'normal'; this.invuln = 120; this.xsp = 0; this.ysp = 0; this.gsp = 0; }
    this.jumping = false; this.spring = false; this.g.onLand();
    this.combo = 0;
    if (this.rolling && !(input.held('down'))) { this.rolling = false; }
    this.setRadius(this.rolling);
    this.a = 0;
    if (railHit) { this.a = railHit.L.ang; this.rail = railHit.L; }
    else if (ya != null && yb != null && gd === 1) this.a = Math.atan2(yb - ya, 2 * WR);
    if (Math.abs(this.a) > 1.2) this.a = 0;
    this.gsp = this.xsp * Math.cos(this.a) + this.ysp * Math.sin(this.a);
    if (gd === -1) this.gsp = this.xsp;
    this.snapFloor();
    return true;
  }

  // ---------------------------------------------------------------- special states
  enterLoop(lp) {
    this.state = 'loop'; this.loop = lp; this.loopPhi = Math.PI / 2; this.rolling = this.rolling;
    this.loopDir = sign(this.gsp);
  }
  updateLoop() {
    const lp = this.loop;
    const R = lp.r - this.hr;
    const tangentA = this.loopPhi - Math.PI / 2; // travel direction when moving "forward"
    this.gsp += 0.125 * Math.sin(tangentA) * this.loopDir * (this.loopDir > 0 ? 1 : -1);
    if (input.held('right') && this.loopDir > 0) this.gsp = Math.min(this.gsp + 0.03, 16);
    if (input.held('left') && this.loopDir < 0) this.gsp = Math.max(this.gsp - 0.03, -16);
    this.loopPhi -= (this.gsp / R);
    this.x = lp.x + Math.cos(this.loopPhi) * R;
    this.y = lp.y + Math.sin(this.loopPhi) * R;
    this.a = this.loopPhi - Math.PI / 2;
    const done = this.loopDir > 0 ? this.loopPhi <= -1.5 * Math.PI : this.loopPhi >= 2.5 * Math.PI;
    const upper = Math.sin(this.loopPhi) < -0.2;
    if (Math.abs(this.gsp) < 2.2 && upper) {
      // fell off
      this.state = 'normal';
      const d = { x: -Math.sin(this.loopPhi), y: Math.cos(this.loopPhi) };
      this.xsp = this.gsp * Math.cos(this.a); this.ysp = this.gsp * Math.sin(this.a);
      this.ground = false; this.a = 0; lp.cool = 60;
      return;
    }
    if (done) {
      this.state = 'normal'; this.a = 0;
      this.x = lp.x + this.loopDir * 2; this.y = lp.y + lp.r - this.hr;
      lp.cool = 40;
      this.snapFloor();
    }
  }
  updateHang() {
    const L = this.zip;
    const dirx = Math.cos(L.ang), diry = Math.sin(L.ang);
    this.zipSpd = Math.min(this.zipSpd + 0.18 * diry + 0.02, 9);
    this.x += this.zipSpd * dirx;
    const ly = L.y1 + (L.y2 - L.y1) * (this.x - L.x1) / (L.x2 - L.x1);
    this.y = ly + this.hr + 6;
    this.facing = 1;
    if (this.g.frame % 5 === 0) this.g.fx.spark(this.x, ly);
    if (input.pressed('jump') || this.x >= L.x2 - 4) {
      this.state = 'normal'; this.ground = false;
      this.xsp = this.zipSpd * dirx; this.ysp = input.pressed('jump') ? -5 : this.zipSpd * diry;
      this.jumping = input.pressed('jump'); this.rolling = this.jumping; this.setRadius(this.rolling);
      this.zipCooldown = 20; this.zip = null;
      if (this.jumping) audio.sfx('jump');
    }
  }
  updateVictory() {
    if (!this.ground) { this.updateAir(true); if (this.ground) this.state = 'victory'; return; }
    this.gsp *= 0.9;
    this.x += this.gsp;
    this.snapFloor();
  }

  // ---------------------------------------------------------------- interactions
  bounce(vx, vy, isSpring = true) {
    if (vx != null) { this.xsp = vx; if (this.ground) this.gsp = vx; }
    if (vy != null) {
      this.ysp = vy; this.ground = false; this.rail = null; this.platform = null;
      this.jumping = false; this.spring = isSpring; this.rolling = false; this.setRadius(false);
      this.a = 0;
    }
    if (vx != null && vx !== 0) this.facing = sign(vx);
    if (this.state === 'hang' || this.state === 'loop') this.state = 'normal';
  }
  hurt(srcX) {
    if (this.invuln > 0 || this.invinc > 0 || this.dead || this.state === 'victory') return false;
    const g = this.g;
    if (this.shield) { this.shield = false; audio.sfx('hurt'); }
    else if (g.rings > 0) { g.scatterRings(); }
    else { this.die(); return true; }
    this.state = 'hurt'; this.ground = false; this.rolling = false; this.jumping = false; this.rail = null;
    this.setRadius(false);
    const d = srcX != null ? sign(this.x - srcX) || -this.facing : -this.facing;
    this.xsp = 2 * d; this.ysp = -4 * this.gdir;
    if (this.underwater) { this.xsp /= 2; this.ysp /= 2; }
    this.invuln = 120;
    return true;
  }
  die(pit = false, drown = false) {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; this.state = 'dead';
    this.shield = false; this.invinc = 0;
    this.drowned = drown;
    this.xsp = 0; this.ysp = drown ? 0 : -7 * this.gdir;
    audio.sfx('hurt');
    this.g.onPlayerDeath();
  }
  updateDead() {
    this.deadT++;
    this.ysp += (this.drowned ? 0.06 : 0.21875) * this.gdir;
    this.y += this.ysp;
    this.anim = 'die';
  }

  // ---------------------------------------------------------------- animation
  animate() {
    const s = Math.abs(this.ground ? this.gsp : this.xsp);
    let anim = this.anim;
    this.animT++;
    if (this.dead) anim = 'die';
    else if (this.state === 'hurt') anim = 'hurt';
    else if (this.state === 'hang') anim = 'hang';
    else if (this.state === 'victory') anim = 'victory';
    else if (this.state === 'spindash' || this.ball) anim = 'ball';
    else if (this.state === 'peelout') anim = this.peel < 10 ? 'walk' : this.peel < 25 ? 'run' : 'peel';
    else if (this.spring) anim = 'spring';
    else if (this.board && this.ground) anim = 'board';
    else if (!this.ground) anim = s > 6 ? 'run' : 'walk';
    else if (this.skidding) anim = 'skid';
    else if (this.pushing) anim = 'push';
    else if (Math.abs(this.gsp) < 0.1) {
      if (input.held('up')) anim = 'lookup';
      else if (input.held('down')) anim = 'crouch';
      else anim = this.idle > 240 ? 'wait' : 'stand';
    } else anim = s >= 10 ? 'peel' : s >= 6 ? 'run' : 'walk';
    if (anim !== this.anim) { this.anim = anim; this.frame = 0; this.animT = 0; }
    let rate;
    switch (anim) {
      case 'walk': rate = Math.max(2, 8 - Math.floor(s)); this.frame = Math.floor(this.animT / rate) % 8; break;
      case 'run': case 'peel': rate = Math.max(1, 4 - Math.floor(s / 3)); this.frame = Math.floor(this.animT / rate) % 4; break;
      case 'ball': rate = Math.max(1, 5 - Math.floor(s)); this.frame = Math.floor(this.animT / rate) % 4; if (this.state === 'spindash') this.frame = Math.floor(this.animT) % 4; break;
      case 'wait': this.frame = Math.floor(this.animT / 12) % 2; break;
      default: this.frame = 0;
    }
    if (anim === 'peelout' && this.state === 'peelout') { }
  }
  drawAngle() {
    if (this.ball || !this.ground && this.state !== 'loop') return 0;
    let a = this.a;
    if (Math.abs(a) < 0.25) a = 0;
    return a;
  }
  draw(ctx, cam) {
    if (!this.visible) return;
    if (this.invuln > 0 && !this.dead && Math.floor(this.invuln / 3) % 2 === 0 && this.state !== 'hurt') return;
    const pal = this.g.superPal ? 'super' : 'sonic';
    // afterimages
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      ctx.globalAlpha = (i + 1) / (this.trail.length + 2) * 0.35;
      this.drawAt(ctx, cam, t.x, t.y, t.a, t.anim, t.frame, t.f, pal);
    }
    ctx.globalAlpha = 1;
    this.drawAt(ctx, cam, this.x, this.y, this.drawAngle(), this.anim, this.frame, this.facing, pal);
    // cart in Crystal Crawl
    if (this.rail && this.g.zoneDef.tex === 'crystal') {
      ctx.save(); ctx.translate(Math.round(this.x - cam.x), Math.round(this.y - cam.y)); ctx.rotate(this.a);
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-14, 4, 28, 12); ctx.fillStyle = '#8a6a3a'; ctx.fillRect(-14, 4, 28, 3);
      ctx.fillStyle = '#303030'; ctx.fillRect(-11, 15, 6, 5); ctx.fillRect(5, 15, 6, 5);
      ctx.restore();
    }
    // shield
    if (this.shield) {
      ctx.globalAlpha = 0.45 + Math.sin(this.g.frame * 0.3) * 0.15;
      ctx.fillStyle = '#60c0ff';
      ctx.beginPath(); ctx.arc(Math.round(this.x - cam.x), Math.round(this.y - cam.y), 22, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.fillStyle = '#e0f8ff';
      ctx.fillRect(Math.round(this.x - cam.x) - 10, Math.round(this.y - cam.y) - 14, 4, 4);
      ctx.globalAlpha = 1;
    }
    if (this.invinc > 0) {
      for (let i = 0; i < 4; i++) {
        const a = this.g.frame * 0.25 + i * Math.PI / 2;
        ctx.fillStyle = ['#ffffff', '#ffff80', '#80ffff', '#ff80ff'][i];
        ctx.fillRect(Math.round(this.x - cam.x + Math.cos(a) * 18) - 2, Math.round(this.y - cam.y + Math.sin(a) * 18) - 2, 4, 4);
      }
    }
  }
  drawAt(ctx, cam, x, y, a, anim, frame, facing, pal) {
    const img = hogFrame(pal, anim, frame);
    ctx.save();
    ctx.translate(Math.round(x - cam.x), Math.round(y - cam.y));
    if (this.gdir === -1) ctx.scale(1, -1);
    if (a) ctx.rotate(a * this.gdir);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -24, anim === 'ball' ? -24 : -25);
    ctx.restore();
  }
}
