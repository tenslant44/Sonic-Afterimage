// The Act scene: gameplay for one stage.
import { buildAct } from './levelgen.js';
import { ZONES, eraPalette, ERA_NAMES } from './zones.js';
import { buildBackground, drawBackground } from './background.js';
import { Player } from './player.js';
import './hazards.js';
import { TYPES, LooseRing, Animal, BigRing, Obj, Projectile } from './objects.js';
import { BOSSES, MetalRacer } from './bosses.js';
import { FX } from './fx.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { save } from './save.js';
import { drawText } from './font.js';
import { hash, fmtTime, rectsOverlap, clamp, sign, mix } from './util.js';
import { hogFrame, machineSprite, eggFrame, ringFrame, sprite } from './sprites.js';

export const VW = 424, VH = 240;
const ERA_STYLE = { past: 'past', present: 'present', good: 'good', bad: 'bad' };

export function zoneSong(z, era) {
  const Z = ZONES[z];
  return Object.assign({ style: ERA_STYLE[era], seed: hash(Z.name + era) % 100000 }, Z.music);
}

export class Act {
  constructor(app, o) {
    this.app = app;
    this.zoneIdx = o.zone; this.act = o.act; this.era = o.era;
    this.zoneDef = ZONES[o.zone];
    this.opts = o;
    this.frame = 0; this.time = o.time || 0; this.timerOn = true;
    this.rings = o.rings || 0; this.ringFrame = 0;
    this.nextLifeAt = (Math.floor(save.data.score / 50000) + 1) * 50000;
    this.checkpoint = o.checkpoint || null;
    this.fx = new FX();
    this.shake = 0; this.flash = 0; this.camDelay = 0; this.bumperScore = 0;
    this.state = 'play'; this.st = 0;
    this.card = o.warpFrom ? 0 : 170;
    this.camLock = null; this.boss = null; this.raceOver = false;
    this.warpArmed = null; this.warpT = 0; this.warpSlow = 0;
    this.lookShift = 0; this.lookT = 0;
    this.medalGot = false; this.bigRingSpawned = false; this.enteredBigRing = false;
    this.paused = false; this.pauseSel = 0;
    this.build();
  }
  build() {
    const gen = buildAct(this.zoneIdx, this.act, this.era);
    this.gen = gen; this.level = gen.level;
    this.visualEra = this.era;
    this.P = eraPalette(this.zoneDef, this.era, this.act);
    this.level.setupRender(this.zoneDef.tex, this.P);
    this.bg = buildBackground(this.zoneDef.bg, this.era, this.P, hash(this.zoneDef.name + this.era + this.act));
    this.enemyColor = this.era === 'bad' ? '#a06040' : this.era === 'past' ? '#e06030' : mix(this.P.g.accent, '#e02020', 0.4);
    this.waterY = gen.waterY;
    // objects
    this.objs = [];
    this.dyn = [];
    for (const s of gen.spawns) {
      const C = TYPES[s.type];
      if (!C) continue;
      if (s.type === 'ring' && this.gen.level.solid(s.x, s.y)) continue;
      const o = new C(this, s);
      if (o.alive) this.objs.push(o);
    }
    this.objs.sort((a, b) => a.x - b.x);
    // player start
    let sx = gen.start.x, sy = gen.start.y;
    if (this.checkpoint) { sx = this.checkpoint.x; sy = this.checkpoint.y + 20; }
    if (this.opts.warpFrom) { sx = this.opts.warpFrom.x; sy = this.findGround(sx, this.opts.warpFrom.y); }
    this.player = new Player(this, sx, sy);
    if (this.opts.warpFrom) { this.player.gsp = 8; this.player.facing = 1; }
    this.cam = { x: clamp(sx - VW / 2, 0, this.level.pw - VW), y: clamp(sy - 140, 0, this.level.ph - VH) };
    this.baseY = this.cam.y;
    this.bossArena = gen.bossArena;
    if (this.bossArena && this.bossArena.race) {
      const m = new MetalRacer(this, this.bossArena, this.bossArena.type === 'metalchase' ? 'chase' : 'race');
      this.dyn.push(m); this.racer = m;
    }
    if (!this.opts.warpFrom && !this.opts.keepMusic) audio.playSong(zoneSong(this.zoneIdx, this.era));
    else if (this.opts.warpFrom) audio.playSong(zoneSong(this.zoneIdx, this.era));
  }
  findGround(x, y) {
    for (let yy = Math.max(0, y - 200); yy < this.level.ph; yy += 4) if (this.level.solidF(x, yy) && !this.level.solidF(x, yy - 40)) return yy;
    return y;
  }

  // ------------------------------------------------------------ API for objects
  near(x, r) { return Math.abs(x - this.player.x) < r; }
  addObj(o) { this.dyn.push(o); return o; }
  text(ctx, s, x, y, o) { drawText(ctx, s, x, y, o); }
  addScore(n, x, y) {
    save.data.score += n;
    if (x != null) this.fx.score(x, y, n);
    if (save.data.score >= this.nextLifeAt) { this.nextLifeAt += 50000; this.addLife(); }
  }
  addLife() { save.data.lives++; audio.jingle('oneup', () => this.resumeMusic()); }
  addRings(n) {
    const before = this.rings;
    this.rings = Math.min(999, this.rings + n);
    audio.sfx('ring', { vol: 0.7 });
    if (Math.floor(this.rings / 100) > Math.floor(before / 100)) this.addLife();
  }
  scatterRings() {
    const n = Math.min(32, this.rings);
    this.rings = 0;
    audio.sfx('ringloss');
    let a = 101.25 * Math.PI / 180, spd = 4;
    for (let i = 0; i < n; i++) {
      if (i === 16) { spd = 2; a = 101.25 * Math.PI / 180; }
      const vx = Math.cos(a) * spd * (i % 2 ? -1 : 1), vy = -Math.sin(a) * spd;
      if (i % 2) a += 22.5 * Math.PI / 180;
      this.dyn.push(new LooseRing(this, { x: this.player.x, y: this.player.y, xsp: vx, ysp: vy * this.player.gdir }));
    }
  }
  monitorEffect(kind) {
    const p = this.player;
    switch (kind) {
      case 'rings': this.addRings(10); break;
      case 'shield': p.shield = true; audio.sfx('spring', { rate: 1.6 }); break;
      case 'speed': p.speedShoes = 1200; audio.setTempoMul(1.25); break;
      case 'invinc': p.invinc = 1200; audio.playSong('invincible'); break;
      case 'life': this.addLife(); break;
    }
  }
  onPowerEnd(kind) {
    if (kind === 'speed') audio.setTempoMul(1);
    if (kind === 'invinc') this.resumeMusic();
  }
  resumeMusic() {
    if (this.player.invinc > 0) return audio.playSong('invincible');
    if (this.state !== 'play' && this.state !== 'boss') return;
    if (this.boss && this.boss.alive) return audio.playSong(this.zoneIdx === 15 ? 'finalboss' : 'boss');
    if (this.raceMusic) return audio.playSong('race');
    audio.playSong(zoneSong(this.zoneIdx, this.era));
  }
  onLand() { }
  setCheckpoint(cp) { this.checkpoint = Object.assign({ time: this.time }, cp); }
  hasMedal() { return !!save.data.medals[this.stageKey()]; }
  stageKey() { return this.zoneIdx + '-' + this.act; }
  collectMedal() { save.data.medals[this.stageKey()] = true; this.medalGot = true; this.addScore(5000, this.player.x, this.player.y - 30); save.write(); this.banner = { text: 'SONIC MEDAL!', t: 120 }; }
  machineBroken() { return !!save.data.pastMachines[this.zoneIdx]; }
  onMachineDestroyed() {
    save.data.pastMachines[this.zoneIdx] = true; save.write();
    this.addScore(10000); audio.sfx('boom'); this.shake = 20; this.flash = 8;
    this.banner = { text: 'GOOD FUTURE SECURED!', t: 200 };
  }
  spawnAnimal(x, y) { this.dyn.push(new Animal(this, { x, y, kind: Math.floor(Math.random() * 3) })); }
  solidObjAt(x, y, player = null) {
    for (const o of this.activeList) {
      if (!o.solid || !o.alive || !o.solidAt(x, y)) continue;
      // A breakable wall blocks the hitbox before the normal object overlap pass.
      // Resolve the spin impact here, while the player's movement speed is intact.
      if (player && o instanceof TYPES.breakwall) o.touch(player);
      if (o.alive) return true;
    }
    return false;
  }
  platformUnder(x, feet, up, down, gd) {
    if (gd !== 1) return null;
    let best = null;
    for (const o of this.activeList) {
      if (!o.solidTop || !o.alive) continue;
      const top = o.platformTop();
      if (top == null) continue;
      const half = (o.w || 32) / 2;
      const ox = o instanceof TYPES.crumble || o instanceof TYPES.spikes ? o.x + half : o.x;
      if (x < ox - half - 4 || x > ox + half + 4) continue;
      const d = top - feet;
      if (d >= -up && d <= down && (!best || top < best.top)) best = { top, obj: o };
    }
    return best;
  }
  windAt(x, y) {
    const f = { x: 0, y: 0 };
    for (const o of this.activeList) if (o.force) { const v = o.force(x, y); if (v) { f.x += v.x; f.y += v.y; } }
    return f;
  }
  armWarp(kind) {
    if (this.act !== 1) return;
    this.warpArmed = kind; this.warpT = 0; this.warpSlow = 0;
    this.banner = { text: kind === 'past' ? 'TIME WARP: PAST' : 'TIME WARP: FUTURE', t: 90 };
  }
  cycleEraVisual() {
    const order = ['past', 'present', this.machineBroken() ? 'good' : 'bad'];
    const i = (order.indexOf(this.visualEra) + 1) % 3;
    this.setEraVisual(order[i]);
  }
  setEraVisual(era) {
    this.visualEra = era;
    this.P = eraPalette(this.zoneDef, era, this.act);
    this.level.setupRender(this.zoneDef.tex, this.P);
    this.bg = buildBackground(this.zoneDef.bg, era, this.P, hash(this.zoneDef.name + era + this.act));
    this.flash = 6; audio.sfx('warp', { rate: 1.5, vol: 0.5 });
  }
  addShockwave(x, y, dir) { this.dyn.push(new Shockwave(this, { x, y, dir })); }
  bossFloor() { return this.bossArena ? this.bossArena.y : this.level.ph; }

  onPlayerDeath() {
    this.timerOn = false;
    audio.stopMusic(0.2);
    this.state = 'dead'; this.st = 0;
  }
  onSignpost() {
    this.timerOn = false;
    audio.stopMusic(0.1);
  }
  onSignpostDone() {
    this.state = 'goal'; this.st = 0;
    this.player.controlLock = 9999;
  }
  enterBigRing() {
    this.enteredBigRing = true; this.timerOn = false;
    this.state = 'bigring'; this.st = 0; this.player.visible = false;
    audio.stopMusic(0.3);
  }
  onRaceStart(mode) {
    this.raceMusic = true;
    audio.playSong('race');
    this.banner = { text: mode === 'chase' ? 'METAL SONIC IS CLOSING IN!' : 'RACE METAL SONIC!', t: 150 };
  }
  onRaceGoal(who) {
    if (this.raceOver) return;
    this.raceOver = true;
    if (who === 'metal') {
      // losing a race costs no life: retry from the starting line
      this.banner = { text: 'TOO SLOW! TRY AGAIN', t: 150 };
      this.timerOn = false; this.raceMusic = false;
      audio.stopMusic(0.5);
      const a = this.bossArena, rx = a.x0 - 110;
      const cp = { x: rx, y: this.findGround(rx, a.y - 120) - 20, time: this.checkpoint ? this.checkpoint.time : 0 };
      this.raceRetry = { t: 130, cp };
    } else {
      this.raceMusic = false;
      if (this.racer) this.racer.won = true;
      this.onBossDefeated(null);
    }
  }
  onBossDefeated(boss) {
    this.state = 'bossclear'; this.st = 0;
    this.timerOn = false;
    this.fleeX = boss ? boss.x : this.player.x + 120; this.fleeY = boss ? boss.y - 60 : this.player.y - 80;
    audio.playSong(zoneSong(this.zoneIdx, this.era));
  }

  // ------------------------------------------------------------ update
  update() {
    if (this.paused) return this.updatePause();
    if (input.pressed('start') && (this.state === 'play' || this.state === 'boss')) { this.paused = true; this.pauseSel = 0; audio.sfx('select'); return; }
    this.frame++; this.st++;
    if (this.card > 0) this.card--;
    if (this.frame % 8 === 0) this.ringFrame = (this.ringFrame + 1) % 4;
    if (this.timerOn && this.card < 110 && (this.state === 'play' || this.state === 'boss')) {
      this.time++;
      if (this.time >= 60 * 60 * 10 - 1 && !this.player.dead) { this.timeOver = true; this.player.die(); }
    }
    const p = this.player;
    if (this.state === 'warp') return this.updateWarp();
    if (this.state === 'bigring') { if (this.st === 1) audio.sfx('warp'); if (this.st > 90) this.finishAct(); return; }
    if (this.card < 130 || this.opts.warpFrom) p.update(); else p.animate();
    this.updateObjects();
    this.fx.update(this.waterY);
    this.updateCamera();
    this.checkEvents();
    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash--;
    if (this.banner && --this.banner.t <= 0) this.banner = null;
    if (this.raceRetry && --this.raceRetry.t <= 0) { const cp = this.raceRetry.cp; this.raceRetry = null; this.app.flow.restartAct(this, cp); return; }

    if (this.state === 'dead') {
      if (this.st === 150) {
        save.data.lives--;
        if (save.data.lives <= 0) { this.app.flow.gameOver(this); return; }
        save.write();
        this.app.flow.restartAct(this, this.checkpoint);
      }
    } else if (this.state === 'goal') {
      if (this.st === 30) { p.state = 'victory'; audio.jingle('clear'); }
      if (this.st === 60) this.startResults();
    } else if (this.state === 'results') this.updateResults();
    else if (this.state === 'bossclear') this.updateBossClear();
  }
  updatePause() {
    if (this.pauseMsg && --this.pauseMsg.t <= 0) this.pauseMsg = null;
    if (this.pauseBusy) return;
    const N = 4;
    if (input.pressed('up')) { this.pauseSel = (this.pauseSel + N - 1) % N; audio.sfx('select'); }
    if (input.pressed('down')) { this.pauseSel = (this.pauseSel + 1) % N; audio.sfx('select'); }
    if (input.pressed('start') || input.pressed('jump')) {
      audio.sfx('select');
      if (this.pauseSel === 0) this.paused = false;
      else if (this.pauseSel === 1) { this.paused = false; save.data.lives = Math.max(1, save.data.lives - 1); this.app.flow.restartAct(this, null); }
      else if (this.pauseSel === 2) {
        // file holds progress up to the start of this act
        this.pauseBusy = true;
        save.data.zone = this.zoneIdx; save.data.act = this.act; save.data.started = true;
        save.exportFile().then(() => { audio.sfx('checkpoint'); this.pauseMsg = { text: 'SAVE FILE DOWNLOADED', style: 'green', t: 180 }; },
          () => { audio.sfx('hurt'); this.pauseMsg = { text: 'COULD NOT SAVE', style: 'red', t: 180 }; }).finally(() => { this.pauseBusy = false; });
      }
      else { this.paused = false; save.write(); this.app.flow.toTitle(); }
    }
  }
  updateObjects() {
    const x0 = this.cam.x - 320, x1 = this.cam.x + VW + 320;
    // binary search window in static list
    let lo = 0, hi = this.objs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.objs[m].x < x0 - 200) lo = m + 1; else hi = m; }
    const act = [];
    for (let i = lo; i < this.objs.length; i++) {
      const o = this.objs[i];
      if (o.x > x1 + 200) break;
      if (o.alive) act.push(o);
    }
    for (const o of this.dyn) if (o.alive) act.push(o);
    this.activeList = act;
    const p = this.player;
    for (const o of act) o.update();
    if (!p.dead) {
      const hb = p.hitbox();
      for (const o of act) {
        if (!o.alive) continue;
        const b = o.box();
        if (b.w && rectsOverlap(hb, b)) o.touch(p);
      }
    }
    if (this.frame % 60 === 0) {
      this.objs = this.objs.filter(o => o.alive);
      this.dyn = this.dyn.filter(o => o.alive);
    } else this.dyn = this.dyn.filter(o => o.alive);
  }
  updateCamera() {
    const p = this.player, c = this.cam;
    if (p.dead) return;
    if (this.camDelay > 0) this.camDelay--;
    else {
      const sx = p.x - c.x;
      if (sx > VW / 2 + 4) c.x += Math.min(sx - VW / 2 - 4, 16);
      if (sx < VW / 2 - 20) c.x -= Math.min(VW / 2 - 20 - sx, 16);
    }
    // look up / down
    const still = p.ground && Math.abs(p.gsp) < 0.1 && p.state === 'normal';
    if (still && (input.held('up') || input.held('down'))) this.lookT++; else this.lookT = 0;
    const want = this.lookT > 60 ? (input.held('up') ? -90 : 80) : 0;
    this.lookShift += clamp(want - this.lookShift, -2, 2);
    const target = VH / 2 + 8 - this.lookShift - (p.gdir === -1 ? -20 : 0);
    const sy = p.y - c.y;
    if (p.ground || p.state === 'loop') {
      const mv = Math.abs(p.gsp) >= 8 ? 16 : 6;
      c.y += clamp(sy - target, -mv, mv);
    } else {
      if (sy > target + 32) c.y += Math.min(sy - target - 32, 16);
      if (sy < target - 32) c.y -= Math.min(target - 32 - sy, 16);
    }
    if (this.camLock) {
      c.x += clamp(this.camLock.x0 - c.x, -4, 4);
      if (this.camLock.y != null) c.y += clamp(this.camLock.y - c.y, -4, 4);
    }
    c.x = clamp(c.x, 0, this.level.pw - VW);
    c.y = clamp(c.y, 0, this.level.ph - VH);
  }
  checkEvents() {
    const p = this.player;
    // Boss arena
    const A = this.bossArena;
    if (A && !A.race && !this.boss && p.x > A.x0 + 40 && this.state === 'play') {
      this.camLock = { x0: A.x0 - 16, x1: A.x0 - 16 + VW, y: clamp(A.y - 190, 0, this.level.ph - VH) };
      const B = BOSSES[A.type];
      if (B) {
        this.boss = new B(this, A);
        this.dyn.push(this.boss);
        this.state = 'boss';
        audio.playSong(this.zoneIdx === 15 ? 'finalboss' : 'boss');
        this.banner = { text: this.zoneIdx === 15 ? 'TIME DEVOURER' : '', t: 120 };
      }
    }
    // Big ring spawn near goal
    if (!this.bigRingSpawned && this.act < 2 && this.rings >= 50 && save.data.stones.length < 7 && p.x > this.gen.goalX - 700) {
      this.bigRingSpawned = true;
      const bx = this.gen.goalX - 260;
      const gy = this.findGround(bx, p.y);
      this.dyn.push(new BigRing(this, { x: bx, y: gy - 110 }));
    }
    // time warp
    if (this.warpArmed && this.state === 'play') {
      const spd = p.ground ? Math.abs(p.gsp) : Math.abs(p.xsp);
      if (spd >= 6 || p.state === 'loop') { this.warpT++; this.warpSlow = 0; }
      else if (++this.warpSlow > 50) { this.warpArmed = null; this.warpT = 0; }
      if (this.frame % 3 === 0 && this.warpT > 0) this.fx.sparkle(p.x + (Math.random() - 0.5) * 30, p.y + (Math.random() - 0.5) * 30);
      if (this.warpT >= 150) this.startWarp();
    }
  }
  startWarp() {
    const kind = this.warpArmed;
    this.warpArmed = null;
    let target;
    if (this.era === 'present') target = kind === 'past' ? 'past' : (this.machineBroken() ? 'good' : 'bad');
    else target = 'present';
    this.warpTarget = target;
    this.state = 'warp'; this.st = 0;
    audio.stopMusic(0.2); audio.sfx('warp');
    this.player.state = 'frozen';
  }
  updateWarp() {
    this.fx.update();
    if (this.st > 110) {
      this.app.flow.warpTo(this, this.warpTarget, { x: this.player.x, y: this.player.y });
    }
  }
  startResults() {
    this.state = 'results'; this.st = 0;
    const secs = Math.floor(this.time / 60);
    // Time bonus: 10000 for a sub-minute clear, falling linearly to 0 at 6:00.
    const tb = secs <= 60 ? 10000 : Math.max(0, Math.round(10000 * (360 - secs) / 300 / 100) * 100);
    const res = { time: tb, ring: this.rings * 100, medal: this.medalGot ? 5000 : 0 };
    res.sum = res.time + res.ring + res.medal;
    res.shown = 0; res.paid = false;
    this.res = res;
  }
  updateResults() {
    const r = this.res;
    if (this.st > 90) {
      // the bonus rows stay fixed; TOTAL counts up to exactly their sum
      if (r.shown < r.sum) {
        r.shown = Math.min(r.sum, r.shown + Math.max(100, Math.ceil(r.sum / 150 / 100) * 100));
        if (input.pressed('jump')) r.shown = r.sum;
        if (this.st % 4 === 0) audio.sfx('select', { vol: 0.4 });
      } else if (!r.doneT) {
        r.doneT = this.st; audio.sfx('checkpoint');
        if (!r.paid) { r.paid = true; save.data.score += r.sum; }
      }
      if (r.doneT && this.st - r.doneT > 100) this.finishAct();
    }
  }
  updateBossClear() {
    const p = this.player;
    if (this.st === 1 && this.boss) { this.shake = 10; }
    if (this.st < 100) { this.fleeX += 3; this.fleeY -= 1.2; }
    if (this.st === 100) {
      // Anchor machine drops in
      const ax = this.bossArena.race ? this.bossArena.x1 + 120 : (this.bossArena.x0 + this.bossArena.x1) / 2 + 40;
      const gy = this.bossArena.race ? this.findGround(ax, this.bossArena.y - 100) : this.bossArena.y;
      this.anchor = new AnchorCore(this, { x: ax, y: gy });
      this.dyn.push(this.anchor);
      this.banner = { text: 'SMASH THE ANCHOR MACHINE!', t: 150 };
    }
    if (this.anchor && this.anchor.done && !this.anchorDoneT) { this.anchorDoneT = this.st; }
    if (this.anchorDoneT && this.st - this.anchorDoneT === 60) { p.state = 'victory'; audio.jingle('clear'); }
    if (this.anchorDoneT && this.st - this.anchorDoneT === 90) this.startResults();
    if (this.state === 'results') return;
  }
  finishAct() {
    const k = this.stageKey();
    save.data.cleared[k] = true;
    if (!save.data.bestTimes[k] || this.time < save.data.bestTimes[k]) save.data.bestTimes[k] = this.time;
    if (this.act === 2) {
      save.data.anchors = Math.max(save.data.anchors, this.zoneIdx + 1);
      if (this.era === 'good') save.data.goodFutures[this.zoneIdx] = true;
    }
    save.write();
    this.app.flow.afterAct(this, { bigRing: this.enteredBigRing });
  }

  // ------------------------------------------------------------ draw
  draw(ctx) {
    const cam = { x: Math.round(this.cam.x + (this.shake ? (Math.random() - 0.5) * this.shake : 0)), y: Math.round(this.cam.y + (this.shake ? (Math.random() - 0.5) * this.shake : 0)) };
    drawBackground(ctx, this.bg, cam.x, cam.y, this.frame, VW, VH, this.baseY);
    const act = this.activeList || [];
    for (const o of act) if (o.drawBack) o.drawBack(ctx, cam);
    // rails & zip lines
    for (const L of this.level.linesNear(cam.x - 50, cam.x + VW + 50)) {
      ctx.strokeStyle = L.kind === 'zip' ? '#303030' : '#8890a0'; ctx.lineWidth = L.kind === 'zip' ? 2 : 3;
      ctx.beginPath(); ctx.moveTo(L.x1 - cam.x, L.y1 - cam.y); ctx.lineTo(L.x2 - cam.x, L.y2 - cam.y); ctx.stroke();
      if (L.kind === 'rail') { ctx.strokeStyle = '#e0e8f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L.x1 - cam.x, L.y1 - cam.y - 1); ctx.lineTo(L.x2 - cam.x, L.y2 - cam.y - 1); ctx.stroke(); }
    }
    ctx.lineWidth = 1;
    this.level.drawTerrain(ctx, cam.x, cam.y, VW, VH);
    for (const o of act) if (!(o instanceof Projectile)) o.draw(ctx, cam);
    if (this.state !== 'bigring') this.player.draw(ctx, cam);
    for (const o of act) if (o instanceof Projectile) o.draw(ctx, cam);
    if (this.boss && this.boss.alive && this.boss.drawExtras) this.boss.drawExtras(ctx, cam);
    this.fx.draw(ctx, cam);
    if (this.state === 'bossclear' && this.st < 110) {
      ctx.save(); ctx.translate(Math.round(this.fleeX - cam.x), Math.round(this.fleeY - cam.y)); ctx.drawImage(eggFrame('hurt', (this.frame >> 2) & 1), -32, -28); ctx.restore();
      if (this.frame % 6 === 0) this.fx.puff(this.fleeX - 20, this.fleeY + 10);
    }
    // water
    if (this.waterY != null) {
      const wy = Math.round(this.waterY - cam.y);
      if (wy < VH) {
        ctx.fillStyle = this.zoneIdx === 2 ? 'rgba(20,120,170,0.42)' : 'rgba(20,30,90,0.45)';
        ctx.fillRect(0, Math.max(0, wy), VW, VH - Math.max(0, wy));
        if (wy > -4) {
          ctx.fillStyle = 'rgba(220,250,255,0.8)';
          for (let x = -(this.frame % 16); x < VW; x += 16) ctx.fillRect(x, wy, 8, 1);
          ctx.fillStyle = 'rgba(160,220,255,0.5)'; ctx.fillRect(0, wy + 1, VW, 1);
        }
      }
    }
    // dark tint for bad future / metallic madness glitch
    if (this.zoneIdx === 14 && this.frame % 97 < 3) { ctx.fillStyle = 'rgba(255,0,80,0.15)'; ctx.fillRect(0, (this.frame * 37) % VH, VW, 12); ctx.drawImage(ctx.canvas, 0, 100, VW, 20, 6, 100, VW, 20); }
    this.drawHUD(ctx);
    if (this.boss && this.boss.alive && !this.boss.dying) this.drawBossBar(ctx);
    if (this.card > 0) this.drawTitleCard(ctx);
    if (this.banner && this.banner.text) {
      const t = this.banner.t;
      if (t > 20 || t % 4 < 2) drawText(ctx, this.banner.text, VW / 2, 60, { align: 'center', style: 'hud', scale: 1 });
    }
    if (this.state === 'results') this.drawResults(ctx);
    if (this.state === 'warp') this.drawWarp(ctx);
    if (this.state === 'bigring') { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.st / 60)})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.state === 'dead' && this.st > 110) { ctx.fillStyle = `rgba(0,0,0,${(this.st - 110) / 40})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.state === 'dead' && this.timeOver && this.st > 30) drawText(ctx, 'TIME OVER', VW / 2, 100, { align: 'center', style: 'hud', scale: 3 });
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash / 10})`; ctx.fillRect(0, 0, VW, VH); }
    if (this.paused) this.drawPause(ctx);
  }
  drawHUD(ctx) {
    const blink = this.frame % 30 < 15;
    drawText(ctx, 'SCORE', 12, 10, { style: 'hud', italic: 1 });
    drawText(ctx, String(save.data.score), 112, 10, { style: 'white', align: 'right' });
    drawText(ctx, 'TIME', 12, 24, { style: (this.time > 60 * 60 * 9 && blink) ? 'red' : 'hud', italic: 1 });
    drawText(ctx, fmtTime(this.time), 112, 24, { style: 'white', align: 'right' });
    drawText(ctx, 'RINGS', 12, 38, { style: (this.rings === 0 && blink) ? 'red' : 'hud', italic: 1 });
    drawText(ctx, String(this.rings), 112, 38, { style: 'white', align: 'right' });
    // lives
    const head = sprite('lifeicon', 16, 16, g => {
      g.fillStyle = '#2058e8'; g.beginPath(); g.arc(8, 8, 6, 0, 7); g.fill();
      g.beginPath(); g.moveTo(3, 5); g.lineTo(-1, 4); g.lineTo(3, 9); g.fill();
      g.fillStyle = '#f8c088'; g.beginPath(); g.ellipse(11, 10, 3.5, 2.5, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.fillRect(9, 5, 3, 3); g.fillStyle = '#000'; g.fillRect(11, 6, 1, 2);
    });
    ctx.drawImage(head, 10, VH - 24);
    drawText(ctx, 'SONIC', 28, VH - 25, { style: 'hud' });
    drawText(ctx, 'X ' + save.data.lives, 28, VH - 15, { style: 'white' });
    // era indicator
    const eraCol = { past: 'blue', present: 'white', good: 'cyan', bad: 'red' }[this.era];
    drawText(ctx, ERA_NAMES[this.era], VW - 10, 10, { style: eraCol, align: 'right' });
    if (this.warpArmed) drawText(ctx, (this.warpArmed === 'past' ? 'PAST ' : 'FUTURE ') + '>'.repeat(1 + Math.floor(this.warpT / 30)), VW - 10, 22, { style: 'hud', align: 'right' });
    if (this.keys && Object.keys(this.keys).length) {
      const kx = VW - 30, ky = 44, bob = Math.round(Math.sin(this.frame * 0.1));
      ctx.fillStyle = '#7a5000'; ctx.fillRect(kx, ky + bob, 12, 4); ctx.fillRect(kx + 7, ky + 3 + bob, 2, 4); ctx.fillRect(kx + 10, ky + 3 + bob, 2, 3);
      ctx.fillStyle = '#ffe070'; ctx.fillRect(kx - 6, ky - 3 + bob, 8, 9); ctx.fillStyle = '#7a5000'; ctx.fillRect(kx - 4, ky - 1 + bob, 4, 5);
      drawText(ctx, 'KEY', VW - 34, ky - 2, { style: 'hud', align: 'right' });
    }
    if (this.player.underwater && this.player.air < 720) drawText(ctx, 'AIR ' + Math.ceil(this.player.air / 120), VW - 10, 34, { style: 'cyan', align: 'right' });
  }
  drawBossBar(ctx) {
    const b = this.boss;
    const w = 100, x = VW - w - 12, y = VH - 16;
    ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#602020'; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = b.inv ? '#ffffff' : '#ff4040'; ctx.fillRect(x, y, w * b.hp / b.maxHp, 5);
    drawText(ctx, 'EGGMAN', x, y - 11, { style: 'red' });
  }
  drawTitleCard(ctx) {
    const t = 170 - this.card; // 0..170
    const out = this.card < 30 ? (30 - this.card) / 30 : 0;
    const inn = Math.min(1, t / 20);
    const Z = this.zoneDef;
    // coloured bands
    const bx = -VW * (1 - inn) - VW * out * 1.2;
    ctx.fillStyle = '#1040c0'; ctx.fillRect(bx, 0, VW, VH);
    ctx.fillStyle = '#f0c000';
    ctx.beginPath(); ctx.moveTo(bx + 60, 0); ctx.lineTo(bx + 120, 0); ctx.lineTo(bx + 60, VH); ctx.lineTo(bx + 0, VH); ctx.fill();
    ctx.fillStyle = '#e02020'; ctx.fillRect(bx, VH - 40, VW, 14);
    const tx = VW / 2 + 20 + VW * (1 - inn) + VW * out * 1.5;
    const words = Z.name.split(' ');
    drawText(ctx, words[0], tx, 64, { style: 'white', scale: 3, align: 'center' });
    if (words[1]) drawText(ctx, words[1], tx, 94, { style: 'white', scale: 3, align: 'center' });
    drawText(ctx, 'ZONE', tx + 60, 126, { style: 'hud', scale: 2, align: 'center' });
    const ax = VW / 2 + 20 - VW * (1 - inn) - VW * out * 1.5;
    drawText(ctx, 'ACT ' + (this.act + 1), ax - 40, 156, { style: 'hud', scale: 3 });
    drawText(ctx, ERA_NAMES[this.era], ax - 40, 188, { style: { past: 'blue', present: 'white', good: 'cyan', bad: 'red' }[this.era], scale: 1 });
  }
  drawResults(ctx) {
    const r = this.res;
    const slide = Math.min(1, this.st / 30);
    const x = VW / 2;
    const got = this.act === 2 ? 'ANCHOR SMASHED' : 'SONIC GOT THROUGH';
    drawText(ctx, got, x + (1 - slide) * 300, 50, { style: 'white', scale: 2, align: 'center' });
    drawText(ctx, 'ACT ' + (this.act + 1), x - (1 - slide) * 300, 74, { style: 'hud', scale: 2, align: 'center' });
    if (this.st > 50) {
      const rows = [['TIME BONUS', r.time], ['RING BONUS', r.ring]];
      if (this.medalGot) rows.push(['MEDAL BONUS', r.medal]);
      rows.push(['TOTAL', r.shown]);
      rows.forEach(([l, v], i) => {
        const yy = 110 + i * 18;
        drawText(ctx, l, x - 110, yy, { style: 'hud', italic: 1 });
        drawText(ctx, String(v), x + 110, yy, { style: 'white', align: 'right' });
      });
    }
  }
  drawWarp(ctx) {
    const t = this.st;
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, t / 30)})`;
    ctx.fillRect(0, 0, VW, VH);
    if (t > 30) {
      ctx.fillStyle = this.warpTarget === 'past' ? '#80a0ff' : '#ffc040';
      for (let i = 0; i < 60; i++) {
        const a = i * 2.4, d = ((t * 6 + i * 37) % 300);
        const x = VW / 2 + Math.cos(a) * d, y = VH / 2 + Math.sin(a) * d * 0.6;
        ctx.fillRect(x, y, 2 + d / 60, 2 + d / 60);
      }
      const hog = hogFrame('sonic', 'run', (t >> 1) % 4);
      ctx.drawImage(hog, VW / 2 - 24, VH / 2 - 24);
      drawText(ctx, this.warpTarget === 'past' ? 'TO THE PAST' : this.warpTarget === 'present' ? 'TO THE PRESENT' : 'TO THE FUTURE', VW / 2, VH - 50, { style: 'blue', scale: 2, align: 'center' });
    }
  }
  drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,20,0.6)'; ctx.fillRect(0, 0, VW, VH);
    drawText(ctx, 'PAUSE', VW / 2, 70, { style: 'hud', scale: 3, align: 'center' });
    ['CONTINUE', 'RESTART ACT', 'SAVE TO FILE', 'QUIT TO TITLE'].forEach((s, i) => drawText(ctx, (i === this.pauseSel ? '> ' : '  ') + s, VW / 2 - 60, 112 + i * 18, { style: i === this.pauseSel ? 'white' : 'grey' }));
    if (this.pauseBusy) drawText(ctx, 'PLEASE WAIT...', VW / 2, 190, { style: 'white', align: 'center' });
    else if (this.pauseMsg) drawText(ctx, this.pauseMsg.text, VW / 2, 190, { style: this.pauseMsg.style, align: 'center' });
  }
}

// ------------------------------------------------------------ act-local objects
class Shockwave extends Obj {
  constructor(g, s) { super(g, s); this.dir = s.dir; this.always = true; this.life = 70; }
  box() { return { x: this.x - 8, y: this.y - 16, w: 16, h: 16 }; }
  update() { this.x += this.dir * 4; if (--this.life <= 0) this.alive = false; }
  touch(p) { if (p.ground) p.hurt(this.x); }
  draw(ctx, cam) {
    const x = Math.round(this.x - cam.x), y = Math.round(this.y - cam.y);
    ctx.fillStyle = '#60f0ff'; ctx.fillRect(x - 6, y - 10, 12, 10); ctx.fillStyle = '#e0ffff'; ctx.fillRect(x - 3, y - 14, 6, 6);
  }
}
class AnchorCore extends Obj {
  constructor(g, s) { super(g, s); this.ty = s.y; this.y = s.y - 300; this.vy = 0; this.always = true; this.w = 64; this.h = 70; this.hp = 1; this.done = false; this.landed = false; this.boomT = 0; }
  box() { return { x: this.x - 34, y: this.y - 76, w: 68, h: 76 }; }
  update() {
    this.t++;
    if (!this.landed) { this.vy += 0.3; this.y += this.vy; if (this.y >= this.ty) { this.y = this.ty; this.landed = true; this.g.shake = 12; audio.sfx('boom', { vol: 0.6 }); } }
    if (this.boomT > 0) {
      this.boomT++;
      if (this.boomT % 4 === 0) { this.g.fx.explode(this.x + (Math.random() - 0.5) * 70, this.y - Math.random() * 70); audio.sfx('pop', { vol: 0.5 }); }
      if (this.boomT % 8 === 0) this.g.spawnAnimal(this.x + (Math.random() - 0.5) * 40, this.y - 30);
      if (this.boomT === 80) { this.g.flash = 10; audio.sfx('boom'); this.done = true; }
    }
  }
  touch(p) {
    if (!this.landed || this.boomT) return;
    if (p.ball || p.invinc) { this.boomT = 1; audio.sfx('bosshit'); p.xsp = -4 * sign(this.x - p.x || 1); p.ysp = -5; p.ground = false; this.g.addScore(5000, this.x, this.y - 90); }
    else if (p.ground) { p.x = this.x + sign(p.x - this.x) * 46; p.gsp = 0; }
  }
  draw(ctx, cam) {
    if (this.done) { ctx.drawImage(machineSprite(0, 1), Math.round(this.x - 40 - cam.x), Math.round(this.y - 80 - cam.y)); return; }
    ctx.drawImage(machineSprite(this.t >> 2, 0), Math.round(this.x - 40 - cam.x), Math.round(this.y - 80 - cam.y));
    if (this.landed && !this.boomT && this.t % 40 < 20) drawText(ctx, 'V', Math.round(this.x - cam.x), Math.round(this.y - 100 - cam.y), { style: 'hud', align: 'center', scale: 2 });
  }
}
