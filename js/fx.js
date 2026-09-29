// Lightweight particle / effect system.
import { sparkle, explosionFrame } from './sprites.js';
import { drawText } from './font.js';

export class FX {
  constructor() { this.list = []; }
  add(p) { this.list.push(p); if (this.list.length > 400) this.list.shift(); return p; }
  sparkle(x, y) { this.add({ k: 'spark4', x, y, t: 0, life: 16 }); }
  explode(x, y) { this.add({ k: 'expl', x, y, t: 0, life: 24 }); }
  puff(x, y) { for (let i = 0; i < 4; i++) this.add({ k: 'dot', x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, t: 0, life: 16, c: '#e0e0e0', s: 3 }); }
  dust(x, y, dir) { this.add({ k: 'dot', x, y: y - 3, vx: dir * (1 + Math.random()) - Math.random() * 0.4, vy: -Math.random() * 0.8, t: 0, life: 18, c: '#f0f0f0', s: 3, fade: true }); }
  spark(x, y) { this.add({ k: 'dot', x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, t: 0, life: 12, c: Math.random() < 0.5 ? '#ffe060' : '#ffffff', s: 2, g: 0.2 }); }
  jet(x, y) { this.add({ k: 'dot', x, y, vx: -1.5, vy: (Math.random() - 0.5), t: 0, life: 10, c: Math.random() < 0.5 ? '#80e0ff' : '#ffffff', s: 3, fade: true }); }
  debris(x, y, c) { this.add({ k: 'dot', x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5, t: 0, life: 60, c, s: 6, g: 0.25 }); }
  splash(x, y) { for (let i = 0; i < 10; i++) this.add({ k: 'dot', x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 3, t: 0, life: 30, c: '#e0f8ff', s: 3, g: 0.2 }); }
  bubble(x, y) { this.add({ k: 'bub', x, y, t: 0, life: 90 }); }
  number(x, y, n) { this.add({ k: 'num', x, y, n, t: 0, life: 60 }); }
  score(x, y, n) { this.add({ k: 'score', x, y, n, t: 0, life: 45 }); }
  firework(x, y) {
    const cols = ['#ff4040', '#ffe040', '#40ff80', '#40c0ff', '#ff80ff'];
    const c = cols[Math.floor(Math.random() * cols.length)];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; this.add({ k: 'dot', x, y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, t: 0, life: 50, c, s: 3, g: 0.04, fade: true }); }
  }
  update(waterY) {
    for (const p of this.list) {
      p.t++;
      if (p.vx != null) { p.x += p.vx; p.y += p.vy; if (p.g) p.vy += p.g; }
      if (p.k === 'bub') { p.y -= 0.7; p.x += Math.sin(p.t * 0.2) * 0.3; if (waterY != null && p.y < waterY) p.t = p.life; }
      if (p.k === 'num') p.y -= 0.3;
      if (p.k === 'score') p.y -= p.t < 20 ? 1 : 0;
    }
    this.list = this.list.filter(p => p.t < p.life);
  }
  draw(ctx, cam) {
    for (const p of this.list) {
      const x = Math.round(p.x - cam.x), y = Math.round(p.y - cam.y);
      if (x < -40 || x > 470 || y < -40 || y > 280) continue;
      switch (p.k) {
        case 'spark4': ctx.drawImage(sparkle(Math.floor(p.t / 4)), x - 8, y - 8); break;
        case 'expl': ctx.drawImage(explosionFrame(Math.min(7, Math.floor(p.t / 3))), x - 16, y - 16); break;
        case 'dot':
          if (p.fade) ctx.globalAlpha = 1 - p.t / p.life;
          ctx.fillStyle = p.c; ctx.fillRect(x - (p.s >> 1), y - (p.s >> 1), p.s, p.s);
          ctx.globalAlpha = 1; break;
        case 'bub': ctx.strokeStyle = '#e0f8ff'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.stroke(); break;
        case 'num': drawText(ctx, String(p.n), x, y, { style: 'white', scale: 2, align: 'center' }); break;
        case 'score': drawText(ctx, String(p.n), x, y, { style: 'white', align: 'center' }); break;
      }
    }
  }
}
