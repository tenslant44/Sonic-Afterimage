// Title screen, stage select, game over / continue.
import { input } from './input.js';
import { audio } from './audio.js';
import { save } from './save.js';
import { drawText } from './font.js';
import { VW, VH } from './game.js';
import { ZONES, TIME_STONE_COLORS } from './zones.js';
import { hogFrame, timeStone, medalSprite, ringFrame } from './sprites.js';
import { fmtTime } from './util.js';

function menuNav(sel, n) {
  if (input.pressed('down')) { audio.sfx('select', { vol: 0.5 }); return (sel + 1) % n; }
  if (input.pressed('up')) { audio.sfx('select', { vol: 0.5 }); return (sel + n - 1) % n; }
  return sel;
}
const confirm = () => input.pressed('jump') || input.pressed('start');

function drawStars(ctx, t, n = 70) {
  for (let i = 0; i < n; i++) {
    const x = (i * 97.3 + t * (0.2 + (i % 5) * 0.15)) % VW;
    const y = (i * 53.7) % VH;
    ctx.fillStyle = i % 7 === 0 ? '#ffe080' : i % 3 ? '#8090ff' : '#ffffff';
    ctx.fillRect(VW - x | 0, y | 0, 1 + (i % 9 === 0), 1 + (i % 9 === 0));
  }
}

// Logo: big clock face with Sonic in front.
function drawLogo(ctx, t, cx, cy) {
  ctx.save();
  // clock
  const R = 46;
  ctx.fillStyle = '#10205a'; ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, 7); ctx.fill();
  ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, 7); ctx.stroke();
  ctx.fillStyle = '#2040a0'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    ctx.fillStyle = i % 3 ? '#80a0ff' : '#ffffff';
    ctx.fillRect(Math.round(cx + Math.cos(a) * (R - 6)) - 1, Math.round(cy + Math.sin(a) * (R - 6)) - 1, 3, 3);
  }
  const hand = (a, l, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); ctx.stroke(); };
  // hands run backwards, one afterimage
  const a1 = -t * 0.02 - Math.PI / 2, a2 = -t * 0.0017 - Math.PI / 2;
  ctx.globalAlpha = 0.3; hand(a1 + 0.25, R - 10, 2, '#80ffff'); ctx.globalAlpha = 1;
  hand(a2, R - 22, 3, '#ffd040'); hand(a1, R - 10, 2, '#ffffff');
  ctx.restore();
  // Sonic afterimages
  const f = (t >> 3) % 4;
  for (let i = 3; i >= 0; i--) {
    const im = hogFrame('sonic', 'stand', 0);
    ctx.globalAlpha = i === 0 ? 1 : 0.18 * (4 - i);
    ctx.drawImage(im, Math.round(cx - im.width / 2 - i * 9 + Math.sin(t / 20) * 2), Math.round(cy - im.height / 2 + 6));
  }
  ctx.globalAlpha = 1;
  drawText(ctx, 'SONIC', cx, cy + 44, { style: 'blue', scale: 3, align: 'center', italic: 1 });
  drawText(ctx, 'AFTERIMAGE', cx, cy + 70, { style: 'hud', scale: 2, align: 'center', italic: 1 });
}

export class Title {
  constructor(app) {
    this.app = app; this.t = 0; this.sel = 0; this.started = false;
    this.msg = null; this.busy = false;
    this.buildOpts();
    audio.playSong('title');
  }
  buildOpts() {
    const cur = this.opts && this.opts[this.sel];
    this.opts = [];
    if (save.hasProgress()) this.opts.push('CONTINUE');
    this.opts.push('NEW GAME');
    this.opts.push('LOAD SAVE FILE');
    if (save.hasAnything()) this.opts.push('SAVE TO FILE');
    if (Object.keys(save.data.cleared).length) this.opts.push('STAGE SELECT');
    this.sel = Math.max(0, this.opts.indexOf(cur));
  }
  say(text, style = 'white') { this.msg = { text, style, t: 240 }; }
  async doLoad() {
    this.busy = true;
    try {
      await save.importFile();
      audio.sfx('checkpoint');
      this.buildOpts(); this.sel = Math.max(0, this.opts.indexOf('CONTINUE'));
      const d = save.data;
      this.say(`LOADED: ZONE ${d.zone + 1} ACT ${d.act + 1}  STONES ${d.stones.length}/7`, 'green');
    } catch (e) { if (e.message !== 'CANCELLED') { audio.sfx('hurt'); this.say(e.message || 'COULD NOT LOAD', 'red'); } }
    this.busy = false;
  }
  async doSave() {
    this.busy = true;
    try { await save.exportFile(); audio.sfx('checkpoint'); this.say('SAVE FILE DOWNLOADED', 'green'); }
    catch (e) { audio.sfx('hurt'); this.say('COULD NOT SAVE', 'red'); }
    this.busy = false;
  }
  update() {
    this.t++;
    if (!this.started) { if (input.anyPressed()) { this.started = true; audio.init(); audio.playSong('title'); audio.sfx('select'); } return; }
    if (this.msg && --this.msg.t <= 0) this.msg = null;
    if (this.busy) return;
    this.sel = menuNav(this.sel, this.opts.length);
    if (confirm()) {
      audio.sfx('ring');
      const o = this.opts[this.sel];
      if (o === 'CONTINUE') this.app.flow.continueGame();
      else if (o === 'NEW GAME') this.app.flow.newGame();
      else if (o === 'LOAD SAVE FILE') this.doLoad();
      else if (o === 'SAVE TO FILE') this.doSave();
      else this.app.flow.stageSelect();
    }
  }
  draw(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#050820'); g.addColorStop(1, '#301050');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    drawStars(ctx, this.t);
    drawLogo(ctx, this.t, VW / 2, 62);
    if (!this.started) {
      if (this.t % 60 < 40) drawText(ctx, 'PRESS START', VW / 2, 190, { style: 'white', align: 'center' });
    } else {
      const y0 = 214 - this.opts.length * 12;
      this.opts.forEach((o, i) => {
        const y = y0 + i * 12;
        drawText(ctx, o, VW / 2, y, { style: i === this.sel ? 'hud' : 'grey', align: 'center' });
        if (i === this.sel) ctx.drawImage(ringFrame(this.t >> 2), VW / 2 - 80, y - 3);
        if (o === 'SAVE TO FILE' && save.dirty) {
          // blinking red warning badge + label
          const on = this.t % 40 < 26;
          const bx = VW / 2 + 46;
          ctx.fillStyle = on ? '#ff2030' : '#701018';
          ctx.beginPath(); ctx.arc(bx + 5, y + 3, 6, 0, 7); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + 4, y - 1, 2, 5); ctx.fillRect(bx + 4, y + 5, 2, 2);
          drawText(ctx, 'UNSAVED', bx + 14, y, { style: on ? 'red' : 'grey' });
        }
      });
      if (this.busy) drawText(ctx, 'PLEASE WAIT...', VW / 2, 226, { style: 'white', align: 'center' });
      else if (this.msg) drawText(ctx, this.msg.text, VW / 2, 226, { style: this.msg.style, align: 'center' });
    }
    // progress strip
    const st = save.data.stones;
    for (let i = 0; i < 7; i++) {
      const has = st.includes(i);
      ctx.globalAlpha = has ? 1 : 0.18;
      ctx.drawImage(timeStone(TIME_STONE_COLORS[i], this.t >> 3), 8 + i * 14, 6, 12, 12);
    }
    ctx.globalAlpha = 1;
    const m = save.medalCount ? save.medalCount() : 0;
    if (m) { ctx.drawImage(medalSprite(this.t >> 3), VW - 44, 5, 14, 14); drawText(ctx, String(m), VW - 8, 9, { style: 'white', align: 'right' }); }
  }
}

export class StageSelect {
  constructor(app) {
    this.app = app; this.t = 0;
    // one row per zone, its three acts side by side
    this.rows = [];
    for (let z = 0; z < 16; z++) {
      const acts = [];
      for (let a = 0; a < 3; a++) {
        const k = z + '-' + a;
        const prevDone = (z === 0 && a === 0) || save.data.cleared[a === 0 ? (z - 1) + '-2' : z + '-' + (a - 1)];
        acts.push({ z, a, k, open: !!(save.data.cleared[k] || prevDone) });
      }
      if (acts.some(x => x.open)) this.rows.push({ z, acts });
    }
    this.r = 0; this.c = 0; this.scroll = 0;
    audio.playSong('menu');
  }
  fixCol() {
    const acts = this.rows[this.r].acts;
    if (!acts[this.c].open) { let c = this.c; while (c > 0 && !acts[c].open) c--; if (!acts[c].open) c = acts.findIndex(x => x.open); this.c = c; }
  }
  update() {
    this.t++;
    const n = this.rows.length;
    if (input.pressed('up')) { this.r = (this.r - 1 + n) % n; this.fixCol(); audio.sfx('select', { vol: 0.4 }); }
    if (input.pressed('down')) { this.r = (this.r + 1) % n; this.fixCol(); audio.sfx('select', { vol: 0.4 }); }
    const acts = this.rows[this.r].acts;
    if (input.pressed('left') && this.c > 0 && acts[this.c - 1].open) { this.c--; audio.sfx('select', { vol: 0.4 }); }
    if (input.pressed('right') && this.c < 2 && acts[this.c + 1].open) { this.c++; audio.sfx('select', { vol: 0.4 }); }
    const vis = 10;
    if (this.r < this.scroll) this.scroll = this.r;
    if (this.r >= this.scroll + vis) this.scroll = this.r - vis + 1;
    if (confirm()) {
      audio.sfx('ring');
      const s = acts[this.c];
      save.data.started = true; save.data.lives = Math.max(3, save.data.lives); save.write();
      this.app.flow.startStage(s.z, s.a);
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#0a1030'; ctx.fillRect(0, 0, VW, VH);
    drawStars(ctx, this.t, 40);
    drawText(ctx, 'STAGE SELECT', VW / 2, 10, { style: 'hud', scale: 2, align: 'center', italic: 1 });
    const vis = 10;
    for (let i = this.scroll; i < Math.min(this.rows.length, this.scroll + vis); i++) {
      const row = this.rows[i], y = 38 + (i - this.scroll) * 20;
      const on = i === this.r;
      if (on) { ctx.fillStyle = 'rgba(80,120,255,0.22)'; ctx.fillRect(10, y - 4, VW - 20, 18); }
      drawText(ctx, ZONES[row.z].name.toUpperCase(), 16, y + 1, { style: on ? 'white' : 'grey' });
      row.acts.forEach((s, a) => {
        const x = 186 + a * 78;
        const sel = on && a === this.c;
        if (sel) { ctx.fillStyle = 'rgba(255,220,60,0.28)'; ctx.fillRect(x - 3, y - 3, 74, 16); }
        drawText(ctx, 'ACT ' + (a + 1), x, y + 1, { style: !s.open ? 'grey' : sel ? 'hud' : 'white' });
        if (!s.open) { ctx.fillStyle = 'rgba(10,16,48,0.6)'; ctx.fillRect(x - 3, y - 3, 74, 16); return; }
        const bt = save.data.bestTimes[s.k];
        if (bt) drawText(ctx, fmtTime(bt), x + 34, y + 1, { style: 'cyan' });
        if (save.data.medals[s.k]) ctx.drawImage(medalSprite(this.t >> 3), x + 24, y - 2, 10, 10);
      });
    }
  }
}

export class GameOver {
  constructor(app, act) {
    this.app = app; this.act = act; this.t = 0;
    this.canContinue = save.data.continues > 0;
    this.count = 10 * 60; this.sel = 0;
    audio.jingle('gameover');
  }
  update() {
    this.t++;
    if (this.t < 120) return;
    if (!this.canContinue) {
      if (this.t > 300 || confirm()) { save.data.started = false; save.write(); this.app.flow.toTitle(); }
      return;
    }
    this.count--;
    if (this.count <= 0) { save.data.started = false; save.write(); this.app.flow.toTitle(); return; }
    if (confirm()) { audio.sfx('ring'); this.app.flow.continueFrom(this.act); }
  }
  draw(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
    const slide = Math.min(1, this.t / 60);
    drawText(ctx, 'GAME', VW / 2 - 60 + (1 - slide) * -200, 80, { style: 'hud', scale: 3, align: 'right', italic: 1 });
    drawText(ctx, 'OVER', VW / 2 - 40 + (1 - slide) * 300, 80, { style: 'hud', scale: 3, italic: 1 });
    if (this.t >= 120 && this.canContinue) {
      drawText(ctx, 'CONTINUE?', VW / 2, 140, { style: 'white', scale: 2, align: 'center' });
      drawText(ctx, String(Math.ceil(this.count / 60)), VW / 2, 170, { style: 'hud', scale: 2, align: 'center' });
      const im = hogFrame('sonic', this.count % 60 < 30 ? 'stand' : 'wait', 1);
      ctx.drawImage(im, VW / 2 + 60, 150);
      drawText(ctx, 'CREDITS ' + save.data.continues, VW / 2, 206, { style: 'grey', align: 'center' });
    }
  }
}
