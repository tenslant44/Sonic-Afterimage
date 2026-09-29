// Boot, main loop, scene manager and game progression.
import { input } from './input.js';
import { audio } from './audio.js';
import { save } from './save.js';
import { Act, VW, VH } from './game.js';
import { SpecialStage } from './special.js';
import { Title, GameOver, StageSelect } from './menus.js';
import { Story, storyAfterZone, Ending, Credits } from './cutscenes.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resize() {
  const s = Math.max(1, Math.min(innerWidth / VW, innerHeight / VH));
  const k = s >= 2 ? Math.floor(s) : s;
  canvas.style.width = Math.floor(VW * k) + 'px';
  canvas.style.height = Math.floor(VH * k) + 'px';
}
addEventListener('resize', resize); resize();
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');

input.onFirstInteraction(() => audio.init());

// Mouse/touch clicks on the canvas, in game pixels, forwarded to the scene (for on-screen buttons).
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * VW, y = (e.clientY - r.top) / r.height * VH;
  if (app.scene && app.scene.click && app.fadeDir === 0) app.scene.click(x, y);
});
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * VW, y = (e.clientY - r.top) / r.height * VH;
  const hot = !!(app.scene && app.scene.hot && app.scene.hot(x, y));
  canvas.style.cursor = hot ? 'pointer' : '';
});

export function eraFor(zone, act) {
  if (act === 0) return 'past';
  if (act === 1) return 'present';
  return save.data.pastMachines[zone] ? 'good' : 'bad';
}

const app = {
  scene: null, next: null, fade: 0, fadeDir: 0,
  go(scene, instant) {
    if (instant) { this.scene = typeof scene === 'function' ? scene() : scene; this.fade = 0; return; }
    this.next = scene; this.fadeDir = 1;
  },
};

app.flow = {
  pending: null,
  newGame() {
    save.reset(); save.data.started = true; save.write();
    app.go(() => new Story(app, 'intro', () => this.startStage(0, 0)));
  },
  continueGame() { this.startStage(save.data.zone, save.data.act); },
  startStage(zone, act, opts = {}) {
    save.data.zone = zone; save.data.act = act; save.write();
    app.go(() => new Act(app, Object.assign({ zone, act, era: eraFor(zone, act) }, opts)));
  },
  restartAct(a, checkpoint) {
    app.go(() => new Act(app, { zone: a.zoneIdx, act: a.act, era: a.era, checkpoint, time: checkpoint ? checkpoint.time : 0 }));
  },
  warpTo(a, era, pos) {
    app.go(() => new Act(app, { zone: a.zoneIdx, act: a.act, era, warpFrom: pos, rings: a.rings, time: a.time }), true);
  },
  afterAct(a, { bigRing }) {
    let z = a.zoneIdx, n = a.act + 1;
    const zoneDone = n > 2;
    if (zoneDone) { z++; n = 0; }
    save.data.zone = Math.min(z, 15); save.data.act = zoneDone && z > 15 ? 2 : n; save.write();
    const proceed = () => {
      if (zoneDone && z > 15) { this.ending(); return; }
      if (zoneDone) {
        const beat = storyAfterZone(z - 1);
        app.go(() => new Story(app, beat, () => this.startStage(z, n)));
      } else this.startStage(z, n);
    };
    if (bigRing && save.data.stones.length < 7) {
      this.pending = proceed;
      app.go(() => new SpecialStage(app, save.data.stones.length));
    } else proceed();
  },
  afterSpecial(win) {
    if (win && save.data.stones.length < 7) { save.data.stones.push(save.data.stones.length); save.write(); }
    const p = this.pending; this.pending = null;
    if (p) p(); else this.toTitle();
  },
  gameOver(a) { app.go(() => new GameOver(app, a)); },
  continueFrom(a) {
    save.data.continues--; save.data.lives = 3; save.write();
    this.startStage(a.zoneIdx, a.act);
  },
  ending() {
    const good = save.data.stones.length >= 7 || Object.keys(save.data.goodFutures).length >= 16;
    save.data.endingSeen = good ? 'good' : 'bad';
    save.data.started = false; save.write();
    app.go(() => new Ending(app, good, () => app.go(() => new Credits(app, good, () => this.toTitle()))));
  },
  stageSelect() { app.go(() => new StageSelect(app)); },
  toTitle() { audio.stopMusic(0.4); app.go(() => new Title(app)); },
};

save.load();
const q = new URLSearchParams(location.search).get('stage') || '';
if (q) { window.__app = app; window.__input = input; window.__save = save; }
const dbg = q.match(/^(\d+)-(\d)(?:-(\w+))?$/);
if (dbg) app.go(new Act(app, { zone: +dbg[1], act: +dbg[2], era: dbg[3] || eraFor(+dbg[1], +dbg[2]) }), true);
else if (q.startsWith('special')) app.go(new SpecialStage(app, +(q.split('-')[1] || 0)), true);
else app.go(new Title(app), true);

// fixed-step loop
const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(100, now - last); last = now;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    input.update();
    if (app.fadeDir === 1) {
      app.fade += 0.08;
      if (app.fade >= 1) { app.fade = 1; app.scene = typeof app.next === 'function' ? app.next() : app.next; app.next = null; app.fadeDir = -1; }
    } else if (app.fadeDir === -1) {
      app.fade -= 0.08; if (app.fade <= 0) { app.fade = 0; app.fadeDir = 0; }
    }
    if (app.scene && app.fadeDir !== 1) {
      try { app.scene.update(); } catch (e) { console.error(e); }
    }
    acc -= STEP; steps++;
  }
  if (steps === 4) acc = 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (app.scene) { try { app.scene.draw(ctx); } catch (e) { console.error(e); } }
  if (app.fade > 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = `rgba(0,0,0,${app.fade})`; ctx.fillRect(0, 0, VW, VH); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
