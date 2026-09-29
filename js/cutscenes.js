// Story scenes: intro, between-zone beats, endings, credits.
import { input } from './input.js';
import { audio } from './audio.js';
import { save } from './save.js';
import { drawText, wrap } from './font.js';
import { VW, VH } from './game.js';
import { ZONES, TIME_STONE_COLORS } from './zones.js';
import { hogFrame, amyFrame, eggFrame, timeStone, machineSprite, animalSprite } from './sprites.js';

const NAMES = { sonic: 'SONIC', amy: 'AMY', egg: 'EGGMAN', metal: 'METAL SONIC', core: 'CHRONO CORE', none: '' };
const NAME_STYLE = { sonic: 'blue', amy: 'pink', egg: 'red', metal: 'cyan', core: 'purple', none: 'white' };
const SKIES = {
  dawn: ['#402060', '#f0a060'], day: ['#3070e0', '#a0e0ff'], dusk: ['#301040', '#e06040'],
  night: ['#040818', '#203070'], lab: ['#100818', '#402040'], void: ['#000000', '#200030'],
  storm: ['#101020', '#404860'], gold: ['#603000', '#ffe080'],
};

function actorImg(who, anim, f) {
  if (who === 'sonic') return hogFrame('sonic', anim || 'stand', f);
  if (who === 'metal') return hogFrame('metal', anim || 'stand', f);
  if (who === 'super') return hogFrame('super', anim || 'stand', f);
  if (who === 'amy') return amyFrame(anim || 'stand', f);
  if (who === 'egg') return eggFrame(anim || 'normal', f, true);
  if (who === 'eggfoot') return eggFrame(anim || 'normal', f, false);
  if (who === 'machine') return machineSprite(f, anim === 'broken');
  if (who === 'animal') return animalSprite(anim || 0, f);
  return null;
}

function drawCore(ctx, x, y, t, cracked) {
  const r = 16 + Math.sin(t / 10) * 2;
  const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2.2);
  g.addColorStop(0, cracked ? '#ff8080' : '#ffffff'); g.addColorStop(0.3, cracked ? '#c02040' : '#80e0ff'); g.addColorStop(1, 'rgba(60,40,200,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, 7); ctx.fill();
  ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x, y, r + 6, 5, t / 30 + i * 1.05, 0, 7); ctx.stroke(); }
}
function drawTower(ctx, x, t) {
  ctx.fillStyle = '#281838'; ctx.fillRect(x - 22, 40, 44, 160);
  ctx.fillStyle = '#3a2850'; ctx.fillRect(x - 18, 40, 6, 160);
  ctx.fillStyle = '#281838'; ctx.beginPath(); ctx.moveTo(x - 28, 44); ctx.lineTo(x, 8); ctx.lineTo(x + 28, 44); ctx.fill();
  ctx.fillStyle = '#e8e0c0'; ctx.beginPath(); ctx.arc(x, 70, 16, 0, 7); ctx.fill();
  ctx.strokeStyle = '#302030'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x + Math.cos(-t / 40) * 12, 70 + Math.sin(-t / 40) * 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x + Math.cos(-t / 400) * 8, 70 + Math.sin(-t / 400) * 8); ctx.stroke();
}

// Shot: { sky, ground, props:[], actors:[{who,x,y,anim,flip,move,bob}], lines:[[who,text]] }
const S = (sky, actors, lines, extra = {}) => Object.assign({ sky, actors, lines }, extra);

const BEATS = {
  intro: [
    S('night', [{ who: 'egg', x: 212, y: 110, bob: 1 }], [
      ['none', 'Beneath Little Planet sleeps the CHRONO CORE: the heart that keeps every era ticking.'],
      ['egg', "Hoh hoh! Why wait for the future when I can simply BORROW it?"],
      ['egg', "Sixteen Anchor Machines, rooted in the past, pumping tomorrow's time straight into my empire!"],
    ], { props: ['core'] }),
    S('dawn', [{ who: 'sonic', x: 150, anim: 'stand' }, { who: 'amy', x: 190, anim: 'stand' }], [
      ['amy', "Sonic! The sky's flickering. Yesterday and tomorrow keep swapping places!"],
      ['sonic', "Somebody's messing with the clock again. Three guesses who."],
    ]),
    S('dawn', [{ who: 'sonic', x: 150, anim: 'stand' }, { who: 'metal', x: 330, move: -3, stop: 210, anim: 'run' }], [
      ['none', 'A blue streak tears through the grass...'],
      ['amy', 'SONIC! HELP!'],
      ['sonic', 'Metal! Let her go!'],
    ], { flashAmy: true }),
    S('dawn', [{ who: 'sonic', x: 200, anim: 'lookup' }], [
      ['sonic', "Break the Anchor Machines, find Amy, and hand Eggman his time back. Easy."],
      ['none', 'Smash the machine hidden in each PAST to save its FUTURE. Collect all 7 TIME STONES to make it stick.'],
    ]),
  ],
  metal1: [
    S('night', [{ who: 'metal', x: 260, anim: 'stand', flip: 1 }, { who: 'sonic', x: 160, anim: 'stand' }], [
      ['metal', 'SPEED: INSUFFICIENT. THE PRINCESS REMAINS IN CUSTODY.'],
      ['sonic', "Princess? She'd hit you with a hammer for that."],
      ['none', 'Metal Sonic boosts toward the skyline...'],
    ]),
  ],
  metal2: [
    S('day', [{ who: 'sonic', x: 150, anim: 'stand' }, { who: 'amy', x: 300, y: 70, anim: 'held', bob: 1 }], [
      ['amy', "I'm fine! Mostly! Metal won't stop copying you, it's creepy!"],
      ['sonic', "Hang tight, Amy. I'm getting faster every zone."],
    ]),
  ],
  metal3: [
    S('dusk', [{ who: 'metal', x: 250, anim: 'stand', flip: 1 }, { who: 'sonic', x: 150, anim: 'stand' }], [
      ['metal', 'UPGRADING. NEXT CONTACT: METALLIC MADNESS.'],
      ['sonic', "Then I'll see you there. Bring your A-game, tin can."],
    ]),
  ],
  amyfree: [
    S('lab', [{ who: 'sonic', x: 170, anim: 'stand' }, { who: 'amy', x: 210, anim: 'stand' }], [
      ['amy', 'You came! I knew you would!'],
      ['sonic', "Wouldn't miss it. Now let's go stop the clock thief."],
      ['amy', "He's at the Chrono Citadel, draining the Core. Everything will freeze if he wins!"],
    ]),
  ],
  final: [
    S('void', [{ who: 'egg', x: 212, y: 100, anim: 'angry', bob: 1 }, { who: 'sonic', x: 110, anim: 'stand' }], [
      ['egg', "Too late, hedgehog! The Core is MINE, and with it, every second that ever was!"],
      ['sonic', "Then I'll just take them back. One second at a time."],
    ], { props: ['core'] }),
  ],
};

// interstitial lines: after zone z is cleared
const HOPS = [
  "The first anchor is down. Time shivers, then settles.",
  "The overpass lights go dark. Metal Sonic is still out there.",
  "Water drains from the sanctum. Somewhere, a gear turns the right way.",
  "Crystals hum a clearer note. Three anchors gone.",
  "The workbench toys wind down. Eggman's laughter echoes, a little quieter.",
  "The skyline quiets. Metal Sonic retreats toward the peaks.",
  "Ice cracks on the peak. The future thaws.",
  "The scrapyard falls silent, its symphony finished.",
  "Mirages fade from the mesa. What remains is real.",
  "Lanterns flicker back on across the lagoon.",
  "The vault cools. Halfway to midnight.",
  "The speedway's stars stop spinning. One more race won.",
  "Storm clouds break over the citadel.",
  "The gardens drift back down to earth.",
  "The factory powers down. Amy is free.",
];

export function storyAfterZone(z) {
  // every zone clear opens on the anchor board (with its SAVE TO FILE button), then any story beat
  if (z === 1) return ['hop', z, 'metal1'];
  if (z === 5) return ['hop', z, 'metal2'];
  if (z === 11) return ['hop', z, 'metal3'];
  if (z === 14) return ['hop', z, 'amyfree'];
  if (z === 13) return ['hop', z, 'final'];
  return ['hop', z];
}

function anchorShot(z) {
  const n = z + 1;
  const lines = [['none', HOPS[z] || '...'], ['none', `ANCHORS DESTROYED: ${save.data.anchors}/16`]];
  if (save.dirty) lines.push(['none', 'Click SAVE TO FILE (or press UP) to download your progress. Load it from the title screen on any computer.']);
  return S('night', [], lines, { props: ['anchors'], zone: z, next: ZONES[z + 1] ? ZONES[z + 1].name : '' });
}

export class Story {
  constructor(app, beat, done) {
    this.app = app; this.done = done;
    let shots;
    if (Array.isArray(beat)) {
      shots = [anchorShot(beat[1])];
      if (beat[2]) shots = shots.concat(BEATS[beat[2]]);
    } else shots = BEATS[beat] || [];
    this.shots = shots.map(s => Object.assign({}, s, { actors: s.actors.map(a => Object.assign({}, a)) }));
    this.si = 0; this.li = 0; this.chars = 0; this.t = 0; this.st = 0;
    if (!this.shots.length) { this.finished = true; }
    audio.playSong('story');
  }
  get shot() { return this.shots[this.si]; }
  update() {
    this.t++; this.st++;
    if (this.finished) { if (!this.called) { this.called = true; this.done(); } return; }
    if (input.pressed('start')) { this.finished = true; return; }
    const sh = this.shot;
    if (this.saveBtn() && input.pressed('up')) this.doSave();
    if (this.saveMsg && --this.saveMsg.t <= 0) this.saveMsg = null;
    for (const a of sh.actors) if (a.move) { a.x += a.move; if (a.stop != null && ((a.move < 0 && a.x <= a.stop) || (a.move > 0 && a.x >= a.stop))) { a.x = a.stop; a.move = 0; a.anim = 'stand'; a.flip = a.flip ?? 1; } }
    if (sh.flashAmy && !sh.amyGone && this.li >= 1) {
      // Metal grabs Amy and flies off
      sh.amyGone = true; sh.actors.find(a => a.who === 'metal').move = 5; sh.actors.find(a => a.who === 'metal').stop = 520; sh.actors.find(a => a.who === 'metal').anim = 'run'; sh.actors.find(a => a.who === 'metal').flip = 0; sh.actors.find(a => a.who === 'metal').carry = true;
    }
    const line = sh.lines[this.li];
    const full = line ? line[1].length : 0;
    if (this.chars < full) this.chars += 0.8;
    if (input.pressed('jump')) {
      if (this.chars < full) this.chars = full;
      else {
        this.li++; this.chars = 0; audio.sfx('select', { vol: 0.4 });
        if (this.li >= sh.lines.length) { this.si++; this.li = 0; this.st = 0; if (this.si >= this.shots.length) this.finished = true; }
      }
    }
  }
  // SAVE TO FILE button on the zone-clear (anchor) board
  saveBtn() { const sh = this.shot; return sh && sh.props && sh.props.includes('anchors') ? { x: VW / 2 - 62, y: 90, w: 124, h: 15 } : null; }
  hot(x, y) { const b = this.saveBtn(); return b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; }
  click(x, y) { if (this.hot(x, y)) this.doSave(); }
  doSave() {
    if (this.saving) return;
    this.saving = true;
    save.exportFile().then(() => { audio.sfx('checkpoint'); this.saveMsg = { text: 'SAVE FILE DOWNLOADED', style: 'green', t: 200 }; },
      () => { audio.sfx('hurt'); this.saveMsg = { text: 'COULD NOT SAVE', style: 'red', t: 200 }; }).finally(() => { this.saving = false; });
  }
  draw(ctx) {
    const sh = this.shot || this.shots[this.shots.length - 1];
    if (!sh) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH); return; }
    const sk = SKIES[sh.sky] || SKIES.night;
    const g = ctx.createLinearGradient(0, 0, 0, 170);
    g.addColorStop(0, sk[0]); g.addColorStop(1, sk[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect((i * 83 + this.t * 0.1) % VW, (i * 47) % 120, 1, 1); }
    // hills
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.moveTo(0, 150);
    for (let x = 0; x <= VW; x += 8) ctx.lineTo(x, 136 + Math.sin(x / 40) * 10 + Math.sin(x / 13) * 3);
    ctx.lineTo(VW, 170); ctx.lineTo(0, 170); ctx.fill();
    if (sh.sky !== 'void' && sh.sky !== 'lab') drawTower(ctx, 340, this.t);
    ctx.fillStyle = sh.sky === 'lab' ? '#302838' : sh.sky === 'void' ? '#180828' : '#206030';
    ctx.fillRect(0, 150, VW, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (let x = 0; x < VW; x += 16) ctx.fillRect(x, 150, 8, 2);
    if (sh.props && sh.props.includes('core')) drawCore(ctx, 212, 70, this.t, false);
    if (sh.props && sh.props.includes('anchors')) {
      drawText(ctx, ZONES[sh.zone].name.toUpperCase() + ' CLEAR', VW / 2, 18, { style: 'hud', scale: 2, align: 'center', italic: 1 });
      for (let i = 0; i < 16; i++) {
        const x = 62 + i * 20, y = 52;
        const done = i < save.data.anchors;
        ctx.globalAlpha = done ? 0.35 : 1;
        const im = machineSprite(this.t >> 3, done);
        ctx.drawImage(im, x - 8, y - 8, 16, 16 * im.height / im.width);
        ctx.globalAlpha = 1;
        if (done) { ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke(); }
      }
      if (sh.next) drawText(ctx, 'NEXT: ' + sh.next.toUpperCase(), VW / 2, 72, { style: 'white', align: 'center' });
      const b = this.saveBtn();
      const blink = save.dirty && this.t % 50 < 30;
      ctx.fillStyle = blink ? '#a01828' : '#203070'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      drawText(ctx, this.saving ? 'SAVING...' : save.dirty ? 'SAVE TO FILE' : 'SAVED', VW / 2, b.y + 4, { style: 'white', align: 'center' });
      if (this.saveMsg) drawText(ctx, this.saveMsg.text, VW / 2, b.y + 20, { style: this.saveMsg.style, align: 'center' });
      else drawText(ctx, 'CLICK OR PRESS UP', VW / 2, b.y + 20, { style: 'grey', align: 'center' });
      const im = hogFrame('sonic', 'run', (this.t >> 2) % 4);
      ctx.drawImage(im, (this.t * 3) % (VW + 60) - 50, 106);
    }
    for (const a of sh.actors) {
      if (sh.amyGone === undefined && false) continue;
      const im = actorImg(a.who, a.anim, a.anim === 'run' ? (this.t >> 2) % 4 : (this.t >> 4) % 2);
      if (!im) continue;
      const y = (a.y ?? 150 - im.height + 4) + (a.bob ? Math.sin(this.t / 15) * 3 : 0);
      ctx.save();
      if (a.flip) { ctx.translate(Math.round(a.x), 0); ctx.scale(-1, 1); ctx.drawImage(im, -im.width / 2, Math.round(y)); }
      else ctx.drawImage(im, Math.round(a.x - im.width / 2), Math.round(y));
      ctx.restore();
      if (a.carry) { const am = amyFrame('held', 0); ctx.drawImage(am, Math.round(a.x - 10), Math.round(y - 20)); }
    }
    if (sh.flashAmy && !sh.amyGone) { const am = amyFrame('stand', 0); ctx.drawImage(am, 190 - 24, 150 - 44); }
    // dialogue
    const line = sh.lines[this.li];
    if (line) {
      ctx.fillStyle = 'rgba(0,0,20,0.85)'; ctx.fillRect(8, 176, VW - 16, 58);
      ctx.strokeStyle = '#4060c0'; ctx.lineWidth = 1; ctx.strokeRect(8.5, 176.5, VW - 17, 57);
      const who = line[0];
      let tx = 18;
      const pim = who !== 'none' ? actorImg(who, who === 'egg' ? 'normal' : 'stand', 0) : null;
      if (pim) {
        ctx.save(); ctx.beginPath(); ctx.rect(14, 180, 44, 50); ctx.clip();
        ctx.drawImage(pim, 36 - pim.width / 2 - (who === 'egg' ? 0 : 0), 184 - (who === 'egg' ? 4 : 2));
        ctx.restore(); tx = 66;
        drawText(ctx, NAMES[who], tx, 181, { style: NAME_STYLE[who] });
      }
      const txt = line[1].slice(0, Math.floor(this.chars));
      const lines = wrap(txt, VW - tx - 20);
      lines.slice(0, 4).forEach((l, i) => drawText(ctx, l, tx, (pim ? 193 : 184) + i * 10, { style: 'white' }));
      if (this.chars >= line[1].length && this.t % 40 < 25) drawText(ctx, '>', VW - 20, 222, { style: 'hud' });
    }
  }
}

export class Ending {
  constructor(app, good, done) {
    this.app = app; this.good = good; this.done = done; this.t = 0; this.page = 0;
    this.pages = good ? [
      ['core', 'The seven Time Stones blaze around the Chrono Core. Every borrowed second rushes home.'],
      ['egg', "No, no, NO! My beautiful stolen afternoons!"],
      ['amy', 'Look, Sonic! The futures... they are all green again.'],
      ['sonic', "Told you. Nobody outruns the clock. Except me."],
      ['egg', "This isn't over, Sonic! I'll be back... yesterday!"],
    ] : [
      ['core', 'The Core stops draining... but without the Time Stones, the cracks remain.'],
      ['amy', 'Some futures are still grey, Sonic.'],
      ['sonic', "Then we'll come back and fix them. All seven stones, next time."],
      ['egg', "Hoh hoh! Enjoy your tomorrow, hedgehog... while it lasts!"],
    ];
    this.chars = 0;
    audio.playSong(good ? 'ending' : 'badending');
  }
  update() {
    this.t++;
    const p = this.pages[this.page];
    if (this.chars < p[1].length) this.chars += 0.8;
    if (input.pressed('jump')) {
      if (this.chars < p[1].length) this.chars = p[1].length;
      else { this.page++; this.chars = 0; if (this.page >= this.pages.length) { this.page = this.pages.length - 1; if (!this.called) { this.called = true; this.done(); } } }
    }
  }
  draw(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    if (this.good) { g.addColorStop(0, '#2060e0'); g.addColorStop(1, '#ffe0a0'); } else { g.addColorStop(0, '#202030'); g.addColorStop(1, '#605060'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    drawCore(ctx, VW / 2, 70, this.t, !this.good);
    if (this.good) for (let i = 0; i < 7; i++) {
      const a = this.t / 50 + i / 7 * Math.PI * 2;
      ctx.drawImage(timeStone(TIME_STONE_COLORS[i], this.t >> 3), VW / 2 + Math.cos(a) * 50 - 6, 70 + Math.sin(a) * 18 - 6, 12, 12);
    }
    ctx.fillStyle = this.good ? '#30a040' : '#484048'; ctx.fillRect(0, 150, VW, 90);
    const s = hogFrame('sonic', 'stand', 0), am = amyFrame('stand', 0);
    ctx.drawImage(s, 150, 108); ctx.drawImage(am, 190, 108);
    const e = eggFrame(this.good ? 'hurt' : 'laugh', (this.t >> 3) % 2, true);
    const ex = this.page >= this.pages.length - 1 ? 300 + this.t % 400 : 300;
    ctx.drawImage(e, ex, 70 + Math.sin(this.t / 12) * 4);
    if (this.good) for (let i = 0; i < 5; i++) { const im = animalSprite(i, (this.t >> 3) % 2); ctx.drawImage(im, 40 + i * 30 + Math.sin(this.t / 20 + i) * 6, 130 - Math.abs(Math.sin(this.t / 10 + i)) * 10); }
    const p = this.pages[this.page];
    ctx.fillStyle = 'rgba(0,0,20,0.8)'; ctx.fillRect(8, 180, VW - 16, 54);
    drawText(ctx, NAMES[p[0]], 18, 185, { style: NAME_STYLE[p[0]] });
    wrap(p[1].slice(0, Math.floor(this.chars)), VW - 40).slice(0, 3).forEach((l, i) => drawText(ctx, l, 18, 198 + i * 10, { style: 'white' }));
  }
}

export class Credits {
  constructor(app, good, done) {
    this.app = app; this.good = good; this.done = done; this.t = 0;
    const rows = [['h', 'SONIC AFTERIMAGE'], ['', ''], ['h', 'STARRING'], ['', 'SONIC THE HEDGEHOG'], ['', 'AMY ROSE'], ['', 'METAL SONIC'], ['', 'DR. EGGMAN'], ['', '']];
    rows.push(['h', 'ZONES']);
    ZONES.forEach(z => rows.push(['', z.name.toUpperCase()]));
    rows.push(['', ''], ['h', 'YOUR RECORD']);
    rows.push(['', 'SCORE ' + save.data.score]);
    rows.push(['', 'TIME STONES ' + save.data.stones.length + '/7']);
    rows.push(['', 'GOOD FUTURES ' + Object.keys(save.data.goodFutures).length + '/16']);
    rows.push(['', 'SONIC MEDALS ' + save.medalCount() + '/48']);
    rows.push(['', ''], ['h', 'MADE WITH WEBSIM'], ['', ''], ['', ''], ['h', good ? 'THANK YOU FOR PLAYING' : 'TRY FOR THE GOOD ENDING!']);
    this.rows = rows;
    this.end = rows.length * 16 + VH + 40;
    audio.playSong('credits');
  }
  update() {
    this.t++;
    this.off = (this.off || 0) + (input.held('jump') ? 2 : 0.5);
    const y = this.off;
    if (y > this.end && !this.tick) { this.tick = this.t; audio.stopMusic(0.5); }
    if (this.tick && this.t - this.tick === 90) audio.sfx('checkpoint', { vol: 0.6 });
    if (this.tick && this.t - this.tick > 260 && !this.called) { this.called = true; this.done(); }
  }
  draw(ctx) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
    if (this.tick) {
      // post-credits: a lone clock ticks... then one hand moves backward.
      const k = this.t - this.tick;
      const cx = VW / 2, cy = VH / 2;
      ctx.globalAlpha = Math.min(1, k / 40);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 7); ctx.stroke();
      const back = k > 90 ? -1 : 0;
      const a = -Math.PI / 2 + back * 0.52;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 14, cy); ctx.stroke();
      if (k > 130) drawText(ctx, 'TICK.', cx, cy + 50, { style: this.good ? 'grey' : 'red', align: 'center' });
      ctx.globalAlpha = 1;
      return;
    }
    const off = this.off || 0;
    this.rows.forEach((r, i) => {
      const y = VH + i * 16 - off;
      if (y < -10 || y > VH) return;
      drawText(ctx, r[1], VW / 2, y, { style: r[0] === 'h' ? 'hud' : 'white', align: 'center', scale: r[0] === 'h' ? 1 : 1 });
    });
    const im = hogFrame('sonic', 'run', (this.t >> 2) % 4);
    ctx.drawImage(im, 20, VH - 60);
  }
}
