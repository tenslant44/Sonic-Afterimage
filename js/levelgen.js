// Act builder. Deterministic per zone/act (so time travel keeps the layout).
//
// An act is a chain of SECTIONS, each preceded by a checkpoint:
//   - gauntlets: one or two rooms on a single path (zone gimmicks, puzzles, platforming)
//   - forks: the path splits. Jump the first gap and stay on the floating HIGH lane (fast, bottomless
//     gaps, hazards, rewards) or drop to the LOW route (floored pits, detours, slower but forgiving).
// Every room adds to a time estimate; sections are added until the act reaches its target length.
import { Level } from './level.js';
import { T, HEIGHTS } from './tiles.js';
import { rng, hash, clamp } from './util.js';
import { ZONES } from './zones.js';

const H = 80;
const WMAX = 2600;
const FLY = new Set(['buzzer', 'bat', 'hoverbot']);

// Gimmicks: each only appears in its own zone (Chrono Citadel remixes everything).
export const GIMMICKS = [
  ['logBridge', 'swingPit', 'loopRun'],           // Palmtree Panic
  ['bumperPit', 'neonLift', 'quarterPipe'],       // Neon Overpass
  ['sinkPlats', 'floodRoom'],                     // Sunken Sanctum
  ['railGap', 'crystalSpikes'],                   // Crystal Crawl
  ['bounceRoom', 'electricRun', 'pressRow'],      // Wacky Workbench
  ['zipGap', 'windShaft', 'rooftopPillars'],      // Skyline Scramble
  ['icePlats', 'icicleSteps', 'snowRun'],         // Frostbite Peak
  ['magnetCeil', 'drumPit', 'cannonNest'],        // Scrapyard Symphony
  ['sandSlide', 'breakChain'],                    // Mirage Mesa
  ['lanternRise', 'fireworkUp', 'lagoonDive'],    // Lantern Lagoon
  ['lavaPlats', 'crumbleRun', 'jetRow'],          // Volcanic Vault
  ['timedGate', 'conveyorRun'],                   // Stardust Speedway
  ['lightningRun', 'airshipGap'],                 // Cloudburst Citadel
  ['gravFlip', 'firebarHall'],                    // Gravity Gardens
  ['glitchGap', 'sawRun'],                        // Metallic Madness
  [],                                             // Chrono Citadel (remix)
];
const LAUNCH = new Set(['loopRun', 'snowRun', 'fireworkUp']);
// Rooms that fit under a high lane (need < 8 rows of headroom and no walls to the sky)
const LOW_OK = new Set(['logBridge', 'swingPit', 'bumperPit', 'quarterPipe', 'sinkPlats', 'floodRoom', 'railGap', 'crystalSpikes',
  'electricRun', 'pressRow', 'icePlats', 'icicleSteps', 'drumPit', 'breakChain', 'lagoonDive', 'lavaPlats', 'crumbleRun', 'jetRow',
  'conveyorRun', 'lightningRun', 'airshipGap', 'glitchGap', 'sawRun', 'rooftopPillars']);
// High-lane island variants per zone
const HI_KIND = [
  ['solid', 'solid', 'swing'], ['solid', 'v'], ['solid', 'fall'], ['solid', 'solid'], ['solid', 'h'], ['solid', 'solid'],
  ['solid', 'h'], ['solid', 'h'], ['solid', 'crumble'], ['solid', 'h'], ['solid', 'crumble', 'fall'], ['solid', 'h'],
  ['solid', 'airship'], ['solid', 'v'], ['solid', 'glitch'], ['solid', 'glitch', 'fall', 'crumble', 'h'],
];

export function difficulty(zoneIdx, act) {
  const tut = zoneIdx < 3;
  let d = tut ? zoneIdx * 0.04 : 0.16 + (zoneIdx - 3) / 12 * 0.84;
  if (act === 1) d += tut ? 0.04 : 0.07;
  if (act === 2) d += 0.03;
  return clamp(d, 0, 1);
}
// Skilled-player target length in seconds for each act (Act 3 = the stretch before the boss)
export function targetSecs(zoneIdx, act) {
  if (act === 0) return 64 + zoneIdx * 2.6;
  if (act === 1) return 78 + zoneIdx * 3.6;
  return 30 + zoneIdx * 1.6;
}

export function buildAct(zoneIdx, act, era) {
  const zone = ZONES[zoneIdx];
  const seed = hash(`afterimage-v3-${zoneIdx}-${act}`);
  const r = rng(seed);
  const isBoss = act === 2;
  const bossType = zone.boss;
  const raceBoss = isBoss && (bossType === 'metalrace1' || bossType === 'metalrace2' || bossType === 'metalchase');
  const d = difficulty(zoneIdx, act);
  const tut = zoneIdx < 3;
  const lv = new Level(WMAX, H);
  const spawns = [];
  const surf = new Float32Array(WMAX).fill(-1);
  const b = { cx: 0, gy: 44 };
  let minG = 14, maxG = H - 8;
  let safe = false;            // low route: pits always get floors
  let est = 0, estFirst = 0;   // time estimates (seconds)
  const log = [];
  const sp = (type, x, y, o = {}) => { const s = Object.assign({ type, x, y }, o); spawns.push(s); return s; };
  const px = c => c * 16;
  const gyPx = () => b.gy * 16;
  const P = {
    gapMax: Math.round(4 + 3 * d),
    isleMin: Math.max(2, Math.round(5 - 3 * d)), isleMax: Math.max(3, Math.round(8 - 4 * d)),
    rise: d < 0.45 ? 3 : 4,
    voidP: zoneIdx < 2 ? 0 : zoneIdx === 2 ? 0.25 : 0.35 + 0.55 * d,
    enemy: 0.35 + 0.5 * d,
    platW: d < 0.35 ? 64 : d < 0.7 ? 48 : 40,
    platSpd: 0.018 + 0.018 * d,
    period: Math.round(160 - 70 * d),
  };
  const groundKinds = zone.enemies.filter(k => !FLY.has(k) && k !== 'fish');
  const flyKinds = zone.enemies.filter(k => FLY.has(k));
  if (!groundKinds.length) groundKinds.push('motobug');
  if (!flyKinds.length) flyKinds.push('buzzer');

  // ---------------------------------------------------------------- terrain primitives
  const setSurf = (c, row, shape) => { surf[c] = row * 16 + 16 - HEIGHTS[shape][8]; };
  const column = (c, row, shape = T.FULL) => {
    if (c >= WMAX) return;
    lv.set(c, row, shape);
    for (let y = row + 1; y < H; y++) lv.set(c, y, T.FULL);
    setSurf(c, row, shape);
  };
  const flat = n => { for (let i = 0; i < n; i++) column(b.cx++, b.gy); };
  const up45 = n => { for (let i = 0; i < n && b.gy > minG; i++) { column(b.cx++, b.gy - 1, T.UP45); b.gy--; } };
  const dn45 = n => { for (let i = 0; i < n && b.gy < maxG; i++) { column(b.cx++, b.gy, T.DN45); b.gy++; } };
  const up22 = n => { for (let i = 0; i < n && b.gy > minG; i++) { column(b.cx++, b.gy - 1, T.UP22A); column(b.cx++, b.gy - 1, T.UP22B); b.gy--; } };
  const dn22 = n => { for (let i = 0; i < n && b.gy < maxG; i++) { column(b.cx++, b.gy, T.DN22A); column(b.cx++, b.gy, T.DN22B); b.gy++; } };
  const bumpy = n => { for (let i = 0; i < n; i++) { const k = r(); if (k < 0.2 && b.gy > minG + 1) up22(1); else if (k < 0.4 && b.gy < maxG - 1) dn22(1); else flat(2); } };
  // pit: 'void' = bottomless, number = floored this many rows down
  const isVoid = () => !safe && r() < P.voidP;
  const pit = (n, mode) => {
    if (mode === 'void' && safe) mode = 4;
    for (let i = 0; i < n; i++) {
      const c = b.cx++;
      if (mode === 'void') surf[c] = -1;
      else column(c, Math.min(H - 2, b.gy + mode));
    }
  };
  const spikeFloor = (c0, n, depth, keepRight = 2) => {
    for (let i = 0; i + 2 <= n - keepRight; i += 2) sp('spikes', px(c0 + i), (b.gy + depth) * 16, { w: 32 });
  };
  const hazardPit = n => { // void, or floored with spikes (late) / plain (early)
    const c0 = b.cx;
    if (isVoid()) { pit(n, 'void'); return 'void'; }
    pit(n, 4);
    if (d > 0.25 || (zoneIdx > 0 && r() < 0.5)) spikeFloor(c0, n, 4);
    return 4;
  };
  const ledge = (c0, n, row, oneway = true) => {
    for (let c = c0; c < c0 + n; c++) { lv.set(c, row, oneway ? T.ONEWAY : T.FULL); if (!oneway) lv.set(c, row + 1, T.FULL); }
  };
  const wallUp = (c, fromRow, toRow) => { for (let y = Math.max(0, toRow); y <= fromRow; y++) lv.set(c, y, T.FULL); };
  const ringLine = (x, y, n, dx = 20, dy = 0) => { for (let i = 0; i < n; i++) sp('ring', x + i * dx, y + i * dy); };
  const ringArc = (x0, y0, x1, y1, n, h) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; sp('ring', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * h); } };
  const ringsOnSurf = (c0, c1, step = 2, lift = 20) => { for (let c = c0; c < c1; c += step) if (surf[c] > 0) sp('ring', px(c) + 8, surf[c] - lift); };
  const enemyAt = (c, fly = false, range = 64) => {
    if (era === 'good' && r() < 0.35) return;
    if (fly) sp('enemy', px(c) + 8, (surf[c] > 0 ? surf[c] : gyPx()) - r.int(44, 70), { kind: r.pick(flyKinds), range });
    else if (surf[c] > 0) sp('enemy', px(c) + 8, surf[c], { kind: r.pick(groundKinds), range });
  };
  const enemies = (c0, c1, chance = P.enemy) => {
    const n = Math.max(1, Math.round((c1 - c0) / 12));
    for (let i = 0; i < n; i++) if (r() < chance) enemyAt(r.int(c0, Math.max(c0, c1 - 1)), r() < 0.35 + d * 0.2, 60 + r.int(0, 40));
  };
  const monitor = (x, y, kinds) => sp('monitor', x, y, { kind: r.pick(kinds || ['rings', 'rings', 'shield', 'shield', 'speed', 'invinc', 'life']) });
  // time bookkeeping: cols of travel at a given pace (px/frame) plus extra seconds of care/waiting
  const cost = (c0, pace, extra = 0, firstMul = 2.4) => {
    const s = (b.cx - c0) * 16 / (60 * pace) + extra;
    est += s; estFirst += s * firstMul;
  };

  // ---------------------------------------------------------------- generic rooms
  const R = {};
  // Step-ups, some with a gap in front: plain jumping practice that later gets tight.
  R.steps = () => {
    const c0 = b.cx;
    const n = r.int(3, 4 + Math.round(d * 2));
    for (let i = 0; i < n; i++) {
      flat(r.int(2, 4));
      const h = r.int(2, P.rise);
      if (b.gy - h < minG + 2) break;
      if (d > 0.2 && r() < 0.4 + d * 0.4) hazardPit(r.int(2, 2 + Math.round(d * 2)));
      b.gy -= h;
      const lc = b.cx; flat(r.int(3, Math.max(3, 6 - Math.round(d * 3))));
      if (r() < P.enemy * 0.6 && b.cx - lc >= 4) enemyAt(lc + 2, false, 40);
      else sp('ring', px(lc) + 16, gyPx() - 20);
    }
    flat(2);
    cost(c0, 2.6, 0.6 * n);
  };
  // Gaps between small islands at varying heights.
  R.pitRun = () => {
    const c0 = b.cx;
    const k = r.int(3, 4 + Math.round(d * 2));
    flat(3);
    for (let i = 0; i < k; i++) {
      const gx = px(b.cx);
      const gw = r.int(3, P.gapMax);
      hazardPit(gw);
      b.gy = clamp(b.gy + r.int(-2, 2), minG + 1, maxG - 1);
      const iw = r.int(P.isleMin, P.isleMax);
      const ic = b.cx; flat(iw);
      ringArc(gx - 8, gyPx() - 24, px(ic) + 8, gyPx() - 24, 3, 30);
      if (d > 0.35 && r() < d * 0.5) enemyAt(ic + (iw >> 1), true, 40);
      else if (iw >= 4 && r() < P.enemy * 0.5) enemyAt(ic + 1, false, (iw - 2) * 16);
    }
    flat(3);
    cost(c0, 2.4, 0.5 * k);
  };
  // Wide gap crossed on moving (and later falling) platforms.
  R.platGap = () => {
    flat(3);
    const c0 = b.cx;
    const cnt = r.int(2, 3 + Math.round(d));
    const n = cnt * 6 + 2;
    const mode = hazardPit(n);
    const kinds = d < 0.3 ? ['h', 'v'] : d < 0.6 ? ['h', 'v', 'fall'] : ['h', 'fall', 'v', 'fall'];
    for (let i = 0; i < cnt; i++) {
      const mv = r.pick(kinds);
      const x = px(c0) + 16 + (i + 0.5) * ((n * 16 - 32) / cnt);
      const y = gyPx() - 8 + (mv === 'v' ? 0 : -r.int(0, 1) * 16);
      sp('platform', x, y, { move: mv, range: mv === 'h' ? 30 : 40, speed: P.platSpd + r() * 0.01, phase: i * 1.9, w: P.platW });
      sp('ring', x, y - 40);
    }
    if (d > 0.45) enemyAt(c0 + (n >> 1), true, 50);
    b.gy = clamp(b.gy + r.int(-1, 1), minG, maxG);
    flat(4);
    cost(c0, 1.6, 1.2 * cnt + (mode === 'void' ? 0.6 : 0));
  };
  // Climb a tall cliff on floating ledges. No springs.
  R.climb = () => {
    flat(2);
    const c0 = b.cx;
    const hTot = Math.min(b.gy - minG - 2, r.int(8, 10 + Math.round(d * 4)));
    if (hTot < 6) { flat(4); return; }
    const w = d > 0.55 ? 2 : 3;
    flat(9);
    const g0 = b.gy;
    let i = 1;
    for (; i * 3 < hTot; i++) {
      const row = g0 - i * 3;
      const sc = c0 + (i % 2 ? 1 : 5);
      ledge(sc, w, row);
      sp('ring', px(sc) + w * 8, row * 16 - 18);
      if (i === 2 && d > 0.3) enemyAt(sc + (i % 2 ? 4 : -2), true, 30);
    }
    b.gy = g0 - hTot;
    // top ledge must be <= 3 rows under the new ground and next to it
    const lastRow = g0 - (i - 1) * 3;
    if (lastRow - b.gy > 3) ledge(c0 + 6, 3, b.gy + 3);
    flat(5);
    cost(c0, 1.5, 1.5 + hTot * 0.25);
  };
  // Descend a cliff via ledges over a hazard, flyers guarding.
  R.descent = () => {
    flat(3);
    const c0 = b.cx;
    const drop = Math.min(maxG - b.gy - 1, r.int(7, 10));
    if (drop < 5) { flat(3); return; }
    const g0 = b.gy;
    const n = 12;
    const mode = isVoid() ? 'void' : drop;
    pit(n, mode);
    if (mode !== 'void' && d > 0.25) spikeFloor(c0, n, drop);
    ledge(c0 + 2, 3, g0 + 3); ledge(c0 + 7, 3, g0 + 6);
    enemyAt(c0 + 5, true, 40);
    b.gy = g0 + drop;
    flat(5);
    enemies(b.cx - 5, b.cx);
    cost(c0, 2.2, 1);
  };
  // Uneven ground with enemies placed where you land.
  R.enemyRun = () => {
    const c0 = b.cx;
    bumpy(r.int(8, 12));
    if (d > 0.3) { hazardPit(3); flat(2); }
    bumpy(r.int(6, 10));
    enemies(c0 + 2, b.cx - 1, 0.6 + d * 0.4);
    if (d > 0.4) enemies(c0 + 2, b.cx - 1, d);
    ringsOnSurf(c0, b.cx, 3, 20);
    cost(c0, 3.2, 0.8);
  };
  // Gate blocks the path. Its switch sits up a ledge climb before the gate.
  let gateId = 0, keyId = 0;
  const seals = [];
  R.switchGate = (low = false) => {
    const id = ++gateId;
    flat(3);
    const c0 = b.cx, g0 = b.gy;
    flat(14);
    const gc = b.cx - 2;
    const hi = low ? 5 : 8 + Math.round(d * 3);
    const steps = Math.ceil(hi / 3);
    for (let i = 1; i <= steps; i++) {
      const row = g0 - Math.min(hi, i * 3);
      const sc = c0 + 1 + ((steps - i) % 2 ? 4 : 0);   // last hop always goes back left
      ledge(sc, d > 0.6 && !low ? 2 : 3, row);
      if (i === steps) sp('button', px(sc + 1) + 8, row * 16, { id, timed: d > 0.55 && !low ? Math.round(460 - d * 140) : 0 });
    }
    sp('gate', px(gc) + 8, g0 * 16, { id, h: 96 });
    if (low) seals.push({ c: gc, from: g0 - 7 }); else wallUp(gc, g0 - 7, 0);
    if (d > 0.2) enemyAt(c0 + 8, false, 60);
    if (d > 0.6 && !low) sp('firebar', px(c0 + 6), (g0 - 5) * 16, { n: 3, speed: 0.03, dir: r() < 0.5 ? 1 : -1 });
    flat(3);
    cost(c0, 2, 4 + hi * 0.2);
  };
  // Locked door. The key is up a tower, down in a basement, or behind a wall you must roll through.
  R.keyRoom = () => {
    const id = ++keyId;
    const c0 = b.cx, g0 = b.gy;
    const v = r.pick(g0 - minG > 16 ? ['tower', 'basement', 'alcove'] : ['basement', 'alcove']);
    let extra = 6;
    if (v === 'tower') {
      flat(12);
      const hk = 12 + Math.round(d * 4);
      const w = d > 0.55 ? 2 : 3;
      let row = g0;
      for (let i = 1; i * 3 <= hk; i++) {
        row = g0 - i * 3;
        const sc = c0 + 1 + (i % 3) * 3;
        ledge(sc, w, row);
        if (d > 0.4 && i === 3) enemyAt(sc + 2, true, 30);
      }
      sp('key', px(c0 + 1 + (Math.floor(hk / 3) % 3) * 3) + w * 8, row * 16 - 30, { id });
      extra = 7 + hk * 0.2;
    } else if (v === 'basement') {
      flat(3);
      const bc = b.cx, n = 12, depth = 8 + Math.round(d * 2);
      pit(n, depth);
      // ledges to climb back out, alternating
      ledge(bc + n - 4, 3, g0 + depth - 3); ledge(bc + n - 8, 3, g0 + depth - 6);
      if (depth > 8) ledge(bc + n - 4, 3, g0 + 1);
      sp('key', px(bc + 2) + 8, (g0 + depth) * 16 - 24, { id });
      if (d > 0.3) sp('enemy', px(bc + 5), (g0 + depth) * 16, { kind: r.pick(groundKinds), range: 60 });
      if (d > 0.5) for (let i = 4; i < 8; i += 2) sp('spikes', px(bc + i), (g0 + depth) * 16, { w: 32 });
      flat(8);
      extra = 7;
    } else {
      // roll downhill into a breakable wall; the key waits in the alcove behind it
      flat(2); dn22(2); dn45(2);
      const ac = b.cx, ag = b.gy;
      flat(9);
      for (let c = ac + 1; c < ac + 8; c++) { wallUp(c, ag - 4, ag - 9); }
      // alcove: carve rows ag-3..ag-1 under the block, entrance sealed by a breakwall
      sp('breakwall', px(ac + 1), (ag - 3) * 16, { h: 48 });
      wallUp(ac + 8, ag - 1, ag - 9);
      sp('key', px(ac + 6) + 8, ag * 16 - 20, { id });
      // climb over the block to continue
      ledge(ac - 3, 3, ag - 6);
      b.gy = ag - 9; flat(2);
      b.gy = ag; flat(6);
      ringLine(px(ac + 2), ag * 16 - 20, 3, 18);
      extra = 5;
    }
    flat(2);
    const dc = b.cx;
    sp('keydoor', px(dc) + 8, gyPx(), { id, h: 96 });
    wallUp(dc, b.gy - 7, 0);
    flat(4);
    cost(c0, 2, extra);
  };
  // Tall block: climb over it slowly, or roll fast through the breakable wall at its foot.
  R.breakShortcut = () => {
    const c0 = b.cx;
    flat(2); dn22(2); dn45(1);
    const ac = b.cx, ag = b.gy;
    const hgt = 8;
    for (let i = 0; i < 12; i++) column(b.cx++, ag);
    for (let c = ac + 3; c < ac + 10; c++) wallUp(c, ag - 1, ag - hgt);
    for (let c = ac + 3; c < ac + 10; c++) for (let y = ag - 3; y < ag; y++) lv.set(c, y, T.EMPTY);
    sp('breakwall', px(ac + 3), (ag - 3) * 16, { h: 48 });
    ringLine(px(ac + 4), ag * 16 - 20, 5, 18);
    ledge(ac, 2, ag - 3); ledge(ac + 1, 2, ag - 6);
    if (d > 0.35) enemyAt(ac + 6, false, 30);
    flat(3);
    cost(c0, 3, 1.5);
  };
  // Time post + rolling hills runway to hit warp speed.
  R.timeRun = kind => {
    flat(3);
    if (!(era === 'past' && kind === 'past') && !(era !== 'present' && era !== 'past' && kind === 'future')) sp('timepost', px(b.cx - 2), gyPx(), { kind });
    const c0 = b.cx;
    for (let i = 0; i < 4; i++) { dn22(2); flat(2); up22(1); flat(2); }
    ringsOnSurf(c0, b.cx, 4, 22);
    cost(c0, 5.5, 0);
  };

  // ---------------------------------------------------------------- zone gimmick rooms
  const G = {};
  // Palmtree Panic
  G.logBridge = () => {
    flat(2);
    const c0 = b.cx, n = r.int(12, 16);
    const brk = act >= 1 || d > 0.05 ? r.int(4, n - 6) : -1;
    const depth = 4;
    for (let i = 0; i < n; i++) {
      const c = b.cx++;
      column(c, b.gy + depth);
      if (brk >= 0 && (i === brk || i === brk + 1)) continue;
      lv.set(c, b.gy, T.ONEWAY); surf[c] = gyPx();
    }
    spikeFloor(c0, n, depth);
    sp('bridge', px(c0), gyPx(), { w: n * 16 });
    ringLine(px(c0 + 1), gyPx() - 20, Math.floor(n / 2), 32);
    enemyAt(c0 + (n >> 1), true, 80);
    flat(3);
    cost(c0, 2.6, 1);
  };
  G.swingPit = () => {
    flat(3);
    const c0 = b.cx, cnt = 2 + (act >= 1 ? 1 : 0), n = cnt * 6 + 2;
    const mode = hazardPit(n);
    for (let i = 0; i < cnt; i++) {
      const x = px(c0) + 16 + (i + 0.5) * ((n * 16 - 32) / cnt);
      sp('swing', x, gyPx() - 90, { len: 84, amp: 0.55, speed: 0.03 + d * 0.01, phase: i * 2.2, w: 48 });
      sp('ring', x, gyPx() - 30);
    }
    flat(4);
    cost(c0, 1.6, 1.6 * cnt + (mode === 'void' ? 0.5 : 0));
  };
  G.loopRun = () => {
    if (b.gy > maxG - 6) b.gy -= 3;
    const c0 = b.cx;
    dn22(1); dn45(2);
    const lc = b.cx;
    sp('booster', px(lc), gyPx(), { dir: 1 });
    flat(20);
    const Rr = 76;
    sp('loop', px(lc + 10), gyPx() - Rr, { r: Rr });
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 - (i + 1) / 11 * Math.PI * 2; sp('ring', px(lc + 10) + Math.cos(a) * (Rr - 22), gyPx() - Rr + Math.sin(a) * (Rr - 22)); }
    cost(c0, 6, 0);
  };
  // Neon Overpass
  G.bumperPit = () => {
    flat(3);
    const c0 = b.cx, n = r.int(14, 18);
    const mode = hazardPit(n);
    // small stepping platforms, bumpers between them knock you off if you're sloppy
    const cnt = 3;
    for (let i = 0; i < cnt; i++) {
      const x = px(c0) + 24 + (i + 0.5) * ((n * 16 - 48) / cnt);
      sp('platform', x, gyPx() - 8 - (i % 2) * 24, { move: 'none', w: 40 });
      sp('bumper', x + 40, gyPx() - 70 - (i % 2) * 20);
      sp('ring', x, gyPx() - 40 - (i % 2) * 24);
    }
    if (d > 0.1) sp('bumper', px(c0) + 12, gyPx() - 60);
    flat(4);
    cost(c0, 1.8, 2.5 + (mode === 'void' ? 0.5 : 0));
  };
  G.neonLift = () => {
    flat(3);
    const c0 = b.cx;
    const hgt = Math.min(b.gy - minG - 2, 10);
    if (hgt < 7) { flat(4); return; }
    flat(5);
    const shaft = b.cx; flat(4);
    // elevator rides up a shaft; bumpers stick out of the shaft wall
    sp('platform', px(shaft) + 32, gyPx() - 8 - hgt * 8, { move: 'v', range: hgt * 8, speed: 0.02 + d * 0.01, w: 48 });
    if (d > 0.05) sp('bumper', px(shaft) - 10, gyPx() - hgt * 8);
    b.gy -= hgt;
    flat(5);
    enemyAt(b.cx - 3, false, 40);
    cost(c0, 2, 3);
  };
  G.quarterPipe = () => {
    const c0 = b.cx;
    const dd = Math.min(5, maxG - b.gy - 1);
    if (dd < 3) { flat(4); return; }
    dn22(1); dn45(dd); flat(4);
    // far wall is higher than the near side: rock back and forth or spindash to clear it
    up45(dd + 3); flat(1);
    sp('ring', px(b.cx - 1), gyPx() - 24);
    flat(4);
    ringsOnSurf(c0, b.cx, 2, 20);
    enemyAt(b.cx - 2, false, 30);
    cost(c0, 3, 1.2);
  };
  // Sunken Sanctum
  G.sinkPlats = () => {
    flat(3);
    const c0 = b.cx, cnt = r.int(3, 4), n = cnt * 5 + 2;
    pit(n, 7);
    const sc = b.cx;
    for (let i = 0; i < cnt; i++) {
      const x = px(c0) + 24 + i * 80;
      sp('platform', x, gyPx() - 8 - (i % 2) * 16, { move: 'fall', range: 0, speed: 0, w: P.platW });
      sp('ring', x, gyPx() - 40 - (i % 2) * 16);
    }
    ledge(sc - 5, 3, b.gy + 3); // climb out if you sink
    sp('bubbles', px(c0 + 3), (b.gy + 7) * 16);
    flat(4);
    cost(c0, 1.8, 2 + cnt * 0.5);
  };
  G.floodRoom = () => {
    const c0 = b.cx;
    const wr = (zone.water ? (zoneIdx === 2 ? 52 : 60) : 60);
    const floor = Math.min(maxG, Math.max(b.gy + 4, wr + 4));
    const dd = floor - b.gy;
    if (dd <= 0) { flat(4); return; }
    dn45(Math.min(dd, 4)); b.gy = floor;
    const fc = b.cx;
    flat(6);
    for (let k = 0; k < 2; k++) {
      sp('bubbles', px(b.cx - 3), gyPx());
      pit(3, 3);
      flat(5);
      if (d > 0.1 || act > 0) { sp('spikes', px(b.cx - 3), gyPx(), { w: 32 }); }
    }
    sp('enemy', px(fc + 6), gyPx() - 50, { kind: zone.enemies.includes('fish') ? 'fish' : r.pick(flyKinds), range: 80 });
    // stairs back up to the surface
    const back = floor - b.gy + dd;
    for (let i = 0; i < 3; i++) { flat(2); b.gy -= Math.min(3, b.gy - (floor - dd)); }
    flat(4);
    cost(c0, 1.3, 4 + back * 0);
  };
  // Crystal Crawl
  G.railGap = () => {
    flat(3);
    const c0 = b.cx, n = r.int(24, 32);
    const startY = gyPx() - 8;
    const drop = r.int(2, 5) * 16;
    const mode = hazardPit(n);
    b.gy = Math.min(maxG, b.gy + Math.floor(drop / 16));
    const x0 = px(c0) - 8, x1 = px(c0 + n) + 8;
    const gaps = 1 + (d > 0.3 ? 1 : 0);
    const segs = gaps + 1;
    const gapW = 40 + Math.round(d * 16);
    for (let i = 0; i < segs; i++) {
      const a = x0 + (x1 - x0) * i / segs + (i ? gapW / 2 : 0), bq = x0 + (x1 - x0) * (i + 1) / segs - (i < segs - 1 ? gapW / 2 : 0);
      const ya = startY + (gyPx() - startY) * ((a - x0) / (x1 - x0)) - (i % 2) * 12, yb = startY + (gyPx() - startY) * ((bq - x0) / (x1 - x0)) - (i % 2) * 12;
      lv.addLine(a, ya, bq, yb, 'rail'); lines.push([a, ya, bq, yb, 'rail']);
      sp('railpost', a, ya);
      ringLine(a + 10, ya - 20, 3, 18, (yb - ya) / ((bq - a) / 18));
    }
    sp('railpost', x1, gyPx());
    if (d > 0.4) enemyAt(c0 + (n >> 1), true, 40);
    flat(5);
    cost(c0, 4, 1 + gaps * 0.8 + (mode === 'void' ? 0.5 : 0));
  };
  G.crystalSpikes = () => {
    flat(2);
    const c0 = b.cx, n = r.int(16, 22);
    flat(n);
    const roof = b.gy - (d > 0.5 ? 5 : 6);
    for (let c = c0 + 1; c < c0 + n - 1; c++) lv.set(c, roof, T.FULL);
    const per = Math.max(80, P.period - 20);
    for (let i = 2; i < n - 3; i += 4) {
      sp('popspikes', px(c0 + i), gyPx(), { w: 32, period: per, phase: i * 9 });
      if (d > 0.45) sp('spikes', px(c0 + i + 2), roof * 16 + 16, { w: 32, ceil: true });
    }
    ringLine(px(c0 + 1), gyPx() - 16, Math.floor(n / 2), 32);
    cost(c0, 2, 2.5);
  };
  // Wacky Workbench
  G.bounceRoom = () => {
    flat(2);
    const c0 = b.cx, n = r.int(14, 18);
    flat(n);
    sp('bouncefloor', px(c0 + 1), gyPx(), { w: (n - 2) * 16 });
    const roof = b.gy - 11;
    for (let c = c0; c < c0 + n; c++) lv.set(c, roof, T.FULL);
    // ceiling spikes with a readable safe gap to aim for
    for (let i = 1; i < n - 1; i += 2) if (!(i >= (n >> 1) - 2 && i <= (n >> 1) + 1)) sp('spikes', px(c0 + i), roof * 16 + 16, { w: 32, ceil: true });
    ledge(c0 + (n >> 1) - 1, 3, roof + 4);
    sp('ring', px(c0 + (n >> 1)) + 8, (roof + 4) * 16 - 16);
    b.gy -= 7; flat(0);
    // exit ledge above: reach it from the bounce
    for (let c = b.cx; c < b.cx + 5; c++) column(c, b.gy);
    b.cx += 5;
    cost(c0, 1.8, 2.5);
  };
  G.electricRun = () => {
    flat(2);
    const c0 = b.cx, n = r.int(16, 20);
    flat(n);
    const k = Math.floor((n - 2) / 4);
    for (let i = 0; i < k; i++) sp('electric', px(c0 + 1 + i * 4), gyPx(), { w: 48, phase: i * Math.round(30 + d * 20) });
    // oneway catwalk above the strips
    ledge(c0 + 3, n - 6, b.gy - 4);
    if (d > 0.3) enemyAt(c0 + (n >> 1), true, 50);
    ringLine(px(c0 + 3), (b.gy - 4) * 16 - 20, Math.floor((n - 6) / 2), 32);
    cost(c0, 2, 2);
  };
  G.pressRow = () => {
    flat(3);
    const c0 = b.cx;
    const cnt = 3 + Math.round(d * 2);
    flat(cnt * 5 + 2);
    const period = Math.round(170 - d * 50);
    for (let i = 0; i < cnt; i++) {
      const x = px(c0 + 2 + i * 5) + 16;
      sp('crusher', x, gyPx(), { top: gyPx() - 112, w: 48, period, phase: i * Math.round(period / cnt) });
      if (d > 0.5 && i < cnt - 1) sp('electric', x + 28, gyPx(), { w: 16, phase: i * 30 });
    }
    ringLine(px(c0 + 1), gyPx() - 20, cnt * 2, 40);
    cost(c0, 1.4, cnt * 0.9);
  };
  // Skyline Scramble
  G.zipGap = () => {
    flat(3);
    sp('spring', px(b.cx - 2), gyPx(), { dir: 'up', power: 'yellow' });
    const c0 = b.cx, n = r.int(20, 26);
    const y0 = gyPx() - 110;
    pit(n, 'void');
    // mid-air pillar with an enemy: let go early or ride over it
    const mid = c0 + (n >> 1);
    b.gy = Math.min(maxG, b.gy + r.int(2, 4));
    lv.addLine(px(c0) - 20, y0, px(c0 + n) + 10, gyPx() - 64, 'zip'); lines.push([px(c0) - 20, y0, px(c0 + n) + 10, gyPx() - 64, 'zip']);
    sp('zippole', px(c0) - 20, y0); sp('zippole', px(c0 + n) + 10, gyPx() - 64);
    if (d > 0.25) sp('enemy', px(mid), y0 + (gyPx() - 64 - y0) / 2 + 12, { kind: 'buzzer', range: 30 });
    flat(6);
    ringLine(px(c0), y0 + 30, 8, (n * 16) / 8, (gyPx() - 64 - y0) / 8);
    cost(c0, 4, 1.2);
  };
  G.windShaft = () => {
    flat(3);
    const c0 = b.cx, n = r.int(12, 16);
    pit(n, 'void');
    sp('wind', px(c0), gyPx() - 200, { w: n * 16, h: 400, fx: 0.05, fy: -0.5 });
    // flyers patrol the updraft
    for (let i = 0; i < 1 + Math.round(d * 2); i++) sp('enemy', px(c0 + 3 + i * 4), gyPx() - 120 - i * 30, { kind: r.pick(flyKinds), range: 40 });
    b.gy = Math.max(minG, b.gy - r.int(2, 4));
    if (d > 0.3) enemyAt(c0 + (n >> 1), true, 40);
    flat(6);
    ringArc(px(c0), gyPx() - 60, px(c0 + n), gyPx() - 60, 8, 60);
    cost(c0, 2, 1.8);
  };
  G.rooftopPillars = () => {
    flat(3);
    const c0 = b.cx;
    const cnt = 4 + Math.round(d * 3);
    for (let i = 0; i < cnt; i++) {
      pit(r.int(3, 4) + (d > 0.7 ? 1 : 0), safe ? 4 : 'void');
      b.gy = clamp(b.gy + r.int(-2, 2), minG, maxG - 4);
      const w = 2;
      const cc = b.cx; flat(w);
      sp('ring', px(cc) + w * 8, gyPx() - 24);
      if (d > 0.35 && i % 3 === 1) enemyAt(cc, true, 40);
    }
    flat(4);
    cost(c0, 2, cnt * 0.6);
  };
  // Frostbite Peak (ice physics everywhere in this zone)
  G.icePlats = () => {
    flat(3);
    const c0 = b.cx, cnt = r.int(2, 3), n = cnt * 7 + 2;
    const mode = hazardPit(n);
    for (let i = 0; i < cnt; i++) {
      const x = px(c0) + 16 + (i + 0.5) * ((n * 16 - 32) / cnt);
      sp('platform', x, gyPx() - 8, { move: 'h', range: 34, speed: P.platSpd, phase: i * 2, w: Math.max(40, P.platW - 8) });
      sp('ring', x, gyPx() - 40);
    }
    enemyAt(c0 + (n >> 1), true, 60);
    flat(4);
    cost(c0, 1.5, 1.6 * cnt + (mode === 'void' ? 0.5 : 0));
  };
  G.icicleSteps = () => {
    flat(3);
    const c0 = b.cx, cnt = 4, n = cnt * 4 + 3;
    const mode = hazardPit(n);
    for (let i = 0; i < cnt; i++) {
      const x = px(c0) + 24 + i * 64;
      sp('platform', x, gyPx() - 8 - i * 12, { move: 'fall', w: 40 });
    }
    b.gy = Math.max(minG, b.gy - 3);
    flat(4);
    cost(c0, 1.8, 2 + (mode === 'void' ? 0.5 : 0));
  };
  G.snowRun = () => {
    const c0 = b.cx;
    flat(2);
    sp('boardzone', px(c0), 0, { w: 0, start: true });
    for (let k = 0; k < 4; k++) {
      dn22(r.int(2, 3)); dn45(r.int(1, 2));
      if (b.gy > maxG - 8) { up22(2); up45(2); pit(r.int(5, 7), safe ? 4 : 'void'); b.gy += 2; }
      else if (r() < 0.6) { up45(1); pit(r.int(3, 5), 5); b.gy += 1; }
      flat(r.int(2, 4));
      ringsOnSurf(b.cx - 6, b.cx, 2, 20);
      if (r() < 0.5 + d * 0.3) sp('spikes', px(b.cx - 2), gyPx(), { w: 16 });
    }
    flat(4);
    sp('boardzone', px(b.cx), 0, { end: true });
    cost(c0, 5.5, 1);
  };
  // Scrapyard Symphony
  G.magnetCeil = () => {
    flat(3);
    const c0 = b.cx, n = r.int(16, 20);
    pit(n, safe ? 6 : 8);
    spikeFloor(c0, n, safe ? 6 : 8, 0);
    const ceil = b.gy - 9;
    for (let c = c0 - 2; c < c0 + n + 2; c++) lv.set(c, ceil, T.FULL);
    sp('magnet', px(c0), ceil * 16 + 16, { w: n * 16 });
    sp('spring', px(c0 - 2) + 8, gyPx(), { dir: 'up', power: 'yellow' });
    if (d > 0.3) for (let i = 4; i < n - 4; i += 6) sp('spikes', px(c0 + i), ceil * 16 + 16, { w: 16, ceil: true });
    ringLine(px(c0 + 1), ceil * 16 + 36, Math.floor(n / 2), 32);
    // escape ledges if you drop
    ledge(c0 + n - 4, 3, b.gy + 4);
    flat(5);
    cost(c0, 2, 2);
  };
  G.drumPit = () => {
    flat(2);
    const c0 = b.cx, n = r.int(16, 20);
    pit(n, 7);
    spikeFloor(c0, n, 7, 0);
    for (let i = 0; i < 4; i++) sp('drumpad', px(c0) + 24 + i * (n * 16 - 48) / 3, gyPx() + 24 - (i % 2) * 24, { beat: i });
    for (let i = 0; i < 12; i++) sp('ring', px(c0) + i * n * 16 / 12, gyPx() - 60 - Math.sin(i) * 20);
    ledge(c0 + n - 4, 3, b.gy + 4);
    flat(4);
    cost(c0, 1.6, 2.5);
  };
  G.cannonNest = () => {
    const c0 = b.cx;
    flat(3);
    const hgt = Math.min(b.gy - minG - 2, 6);
    ledge(b.cx + 2, 3, b.gy - 3);
    sp('cannon', px(b.cx + 3) + 8, (b.gy - 3) * 16, { rate: Math.round(130 - d * 40) });
    flat(6);
    b.gy -= Math.max(3, hgt);
    flat(6);
    sp('cannon', px(b.cx - 2) + 8, gyPx(), { rate: Math.round(150 - d * 40), phase: 60 });
    ledge(b.cx - 5, 3, b.gy - 4);
    if (d > 0.4) sp('cannon', px(b.cx - 4) + 8, (b.gy - 4) * 16, { rate: 170, phase: 100 });
    enemies(c0 + 2, b.cx - 2, 0.7);
    flat(3);
    cost(c0, 1.8, 2.5);
  };
  // Mirage Mesa
  G.sandSlide = () => {
    const c0 = b.cx;
    sp('sandzone', px(c0), 0, { start: true });
    dn22(2); dn45(Math.min(3, maxG - b.gy - 2));
    const pw = r.int(3, 4 + Math.round(d * 2));
    hazardPit(pw);
    dn22(2);
    if (d > 0.3) { up45(1); hazardPit(r.int(3, 4)); dn22(1); }
    flat(3);
    sp('sandzone', px(b.cx), 0, { end: true });
    ringsOnSurf(c0, b.cx, 2, 18);
    up22(1); up45(Math.min(2, b.gy - minG)); flat(3);
    cost(c0, 3.5, 1);
  };
  G.breakChain = () => {
    const c0 = b.cx;
    flat(2); dn22(2); dn45(Math.min(3, maxG - b.gy - 1));
    const ag = b.gy;
    const cnt = 2 + Math.round(d * 2);
    for (let k = 0; k < cnt; k++) {
      const ac = b.cx;
      for (let i = 0; i < 7; i++) column(b.cx++, ag);
      for (let c = ac + 2; c < ac + 6; c++) wallUp(c, ag - 1, ag - 7);
      for (let c = ac + 2; c < ac + 6; c++) for (let y = ag - 3; y < ag; y++) lv.set(c, y, T.EMPTY);
      sp('breakwall', px(ac + 2), (ag - 3) * 16, { h: 48 });
      ledge(ac - 1, 2, ag - 4);
      if (k === cnt - 1 && d > 0.3) sp('popspikes', px(ac + 3), ag * 16, { w: 32, period: 100 });
    }
    flat(3);
    ringsOnSurf(c0, b.cx, 3, 20);
    cost(c0, 2.8, 1.5);
  };
  // Lantern Lagoon
  G.lanternRise = () => {
    flat(3);
    const c0 = b.cx;
    const hgt = Math.min(b.gy - minG - 2, 8);
    if (hgt < 6) { flat(4); return; }
    const n = 10;
    pit(n, safe ? 4 : 6);
    for (let i = 0; i < 2; i++) sp('platform', px(c0) + 40 + i * 80, gyPx() + 10, { move: 'lantern', range: 70, speed: 0.02, phase: i * 2, w: 48 });
    if (d > 0.3) enemyAt(c0 + 5, true, 40);
    b.gy -= hgt;
    flat(5);
    cost(c0, 1.4, 3);
  };
  G.fireworkUp = () => {
    const c0 = b.cx; flat(5);
    sp('firework', px(c0 + 2) + 8, gyPx());
    const up = Math.min(b.gy - minG - 2, r.int(8, 10));
    b.gy -= Math.max(0, up);
    flat(6);
    ringLine(px(c0 + 2) + 8, gyPx() + 20, 5, 0, -30);
    cost(c0, 3, 1);
  };
  G.lagoonDive = () => G.floodRoom();
  // Volcanic Vault
  G.lavaPlats = () => {
    flat(3);
    const c0 = b.cx, cnt = 3, n = cnt * 5 + 2;
    pit(n, 4);
    sp('lava', px(c0), (b.gy + 2) * 16 + 8, { w: n * 16, h: 48 });
    for (let i = 0; i < cnt; i++) sp('platform', px(c0) + 32 + i * 80, gyPx() - 8, { move: i === 1 || d > 0.5 ? 'fall' : 'v', range: 28, speed: 0.03, phase: i, w: P.platW });
    if (d > 0.3) sp('firebar', px(c0 + (n >> 1)), gyPx() - 72, { n: 3, speed: 0.025, dir: 1 });
    ringArc(px(c0), gyPx() - 30, px(c0 + n), gyPx() - 30, 6, 60);
    flat(4);
    cost(c0, 1.5, 2.8);
  };
  G.crumbleRun = () => {
    flat(3);
    const c0 = b.cx, n = r.int(10, 14);
    const mode = isVoid() ? 'void' : 4;
    pit(n, mode);
    if (mode !== 'void') sp('lava', px(c0), (b.gy + 2) * 16 + 8, { w: n * 16, h: 32 });
    for (let i = 0; i < n; i += 2) sp('crumble', px(c0 + i), gyPx(), { w: 32 });
    if (d > 0.4) sp('firebar', px(c0 + (n >> 1)), gyPx() - 56, { n: 3, speed: 0.03 });
    ringLine(px(c0), gyPx() - 20, n / 2 | 0, 32);
    flat(4);
    cost(c0, 3, 0.8);
  };
  G.jetRow = () => {
    const c0 = b.cx; flat(r.int(14, 18));
    const cnt = 3 + Math.round(d);
    for (let i = 0; i < cnt; i++) sp('firejet', px(c0 + 3 + i * 3) + 8, gyPx(), { phase: i * Math.round(45 - d * 15) });
    ringLine(px(c0 + 2), gyPx() - 20, 8, 24);
    if (d > 0.4) enemyAt(c0 + 2, true, 30);
    cost(c0, 1.6, 2);
  };
  // Stardust Speedway
  G.timedGate = () => {
    const id = ++gateId;
    flat(3);
    const btn = sp('button', px(b.cx - 2) + 8, gyPx(), { id, timed: 1 });
    const c0 = b.cx;
    for (let k = 0; k < 3 + Math.round(d); k++) {
      flat(r.int(3, 4));
      const pick = r.int(0, 2);
      if (pick === 0) { hazardPit(r.int(3, 4)); b.gy = clamp(b.gy - r.int(0, 1), minG, maxG); }
      else if (pick === 1) { sp('conveyor', px(b.cx), gyPx(), { w: 64, speed: -1.2 - d }); flat(4); }
      else { up45(2); flat(2); }
    }
    flat(3);
    const gc = b.cx;
    sp('gate', px(gc) + 8, gyPx(), { id, h: 96 });
    wallUp(gc, b.gy - 7, 0);
    const dist = px(gc) - btn.x;
    btn.timed = Math.round(dist / (4 + d * 0.6) + 80 - d * 30);
    flat(4);
    ringLine(px(c0), gyPx() - 20, 6, 40);
    cost(c0, 3.5, 1.5);
  };
  G.conveyorRun = () => {
    flat(2);
    const c0 = b.cx;
    for (let k = 0; k < 3; k++) {
      const cc = b.cx; flat(6);
      const back = k % 2 === 0 || d > 0.5;
      sp('conveyor', px(cc), gyPx(), { w: 96, speed: back ? -(1.3 + d) : 1.5 });
      if (k < 2) hazardPit(r.int(3, 4));
    }
    if (d > 0.3) enemyAt(c0 + 8, true, 50);
    flat(3);
    cost(c0, 2, 2);
  };
  // Cloudburst Citadel
  G.lightningRun = () => {
    const c0 = b.cx; flat(4);
    hazardPit(3); flat(6); hazardPit(4); flat(6);
    sp('lightningzone', px(c0), gyPx(), { w: (b.cx - c0) * 16 });
    ringLine(px(c0 + 1), gyPx() - 20, 8, 28);
    cost(c0, 2.2, 1.5);
  };
  G.airshipGap = () => {
    flat(3);
    const c0 = b.cx, n = r.int(22, 28);
    pit(n, safe ? 4 : 'void');
    const cnt = Math.ceil(n / 8);
    for (let i = 0; i < cnt; i++) sp('platform', px(c0) + 56 + i * (n * 16 - 112) / Math.max(1, cnt - 1), gyPx() - 8 + (i % 2) * 20, { move: 'airship', range: 40, speed: 0.015 + d * 0.006, phase: i, w: Math.max(56, 80 - Math.round(d * 20)) });
    if (d > 0.3) enemyAt(c0 + (n >> 1), true, 60);
    ringArc(px(c0), gyPx() - 40, px(c0 + n), gyPx() - 40, 10, 50);
    flat(4);
    cost(c0, 1.5, 3);
  };
  // Gravity Gardens
  G.gravFlip = () => {
    flat(4);
    const c0 = b.cx, n = r.int(18, 24);
    const ceil = b.gy - 8;
    sp('gravpad', px(c0 - 2) + 8, gyPx(), { flip: -1 });
    pit(n, 'void');
    for (let c = c0 - 3; c < c0 + n + 3; c++) for (let y = ceil - 2; y <= ceil; y++) lv.set(c, y, T.FULL);
    // gaps in the ceiling you must hop across upside down
    const gaps = 1 + (d > 0.5 ? 1 : 0);
    for (let k = 0; k < gaps; k++) { const gcx = c0 + 5 + k * 8; for (let c = gcx; c < gcx + 3; c++) for (let y = ceil - 2; y <= ceil; y++) lv.set(c, y, T.EMPTY); }
    sp('gravpad', px(c0 + n + 1) + 8, ceil * 16 + 16, { flip: 1 });
    for (let i = 1; i < n; i += 2) sp('ring', px(c0 + i), ceil * 16 + 36);
    sp('spikes', px(c0 + n - 4), ceil * 16 + 16, { w: 32, ceil: true });
    flat(6);
    cost(c0, 2.2, 2.5);
  };
  G.firebarHall = () => {
    flat(3);
    const c0 = b.cx, n = r.int(18, 24);
    flat(n);
    const roof = b.gy - 8;
    for (let c = c0; c < c0 + n; c++) { lv.set(c, roof, T.FULL); lv.set(c, roof - 1, T.FULL); }
    const cnt = 2 + Math.round(d * 2);
    for (let i = 0; i < cnt; i++) sp('firebar', px(c0 + 3) + i * ((n - 6) * 16) / Math.max(1, cnt - 1), (b.gy - 4) * 16, { n: 3 + (d > 0.6 ? 1 : 0), speed: 0.03 + d * 0.015, dir: i % 2 ? 1 : -1, phase: i * 1.3 });
    ringLine(px(c0 + 2), gyPx() - 20, Math.floor(n / 3), 48);
    cost(c0, 1.6, 2.5);
  };
  // Metallic Madness
  G.glitchGap = () => {
    flat(3);
    const c0 = b.cx, n = r.int(14, 18);
    pit(n, safe ? 4 : 'void');
    for (let i = 0; i < Math.ceil(n / 4); i++) sp('glitchblock', px(c0) + 24 + i * 64, gyPx() - 8 - (i % 2) * 16, { phase: i * 50 });
    ringLine(px(c0), gyPx() - 40, n / 2 | 0, 32);
    flat(4);
    cost(c0, 1.5, 2.8);
  };
  G.sawRun = () => {
    flat(2);
    const c0 = b.cx, n = r.int(18, 22);
    flat(n);
    ledge(c0 + 4, 4, b.gy - 4); ledge(c0 + 12, 4, b.gy - 4);
    sp('saw', px(c0 + 3), gyPx() - 12, { move: 'h', range: 40, speed: 0.03 + d * 0.01 });
    sp('saw', px(c0 + 10), gyPx() - 60, { move: 'v', range: 44, speed: 0.035, phase: 1.5 });
    if (d > 0.6) sp('saw', px(c0 + 17), gyPx() - 12, { move: 'h', range: 32, speed: 0.04, phase: 3 });
    ringLine(px(c0 + 4), (b.gy - 4) * 16 - 20, 8, 20);
    cost(c0, 1.7, 2.5);
  };

  // zone gimmick pool for this act
  const lines = [];
  let gims = GIMMICKS[zoneIdx].slice();
  if (zoneIdx === 15) gims = ['railGap', 'pressRow', 'rooftopPillars', 'drumPit', 'breakChain', 'lavaPlats', 'timedGate', 'conveyorRun', 'airshipGap', 'gravFlip', 'firebarHall', 'glitchGap', 'sawRun', 'crystalSpikes', 'swingPit'];
  let launched = false;
  const pickGim = (lowOnly) => {
    let pool = gims.filter(g => (!LAUNCH.has(g) || !launched) && (!lowOnly || LOW_OK.has(g)));
    if (zone.water === undefined) pool = pool.filter(g => g !== 'floodRoom' && g !== 'lagoonDive');
    if (!pool.length) return null;
    const g = r.pick(pool);
    if (LAUNCH.has(g)) launched = true;
    return g;
  };
  const runGim = g => { if (g && G[g]) { const e0 = est; G[g](); log.push(g + ':' + (est - e0).toFixed(1)); } };
  const runRoom = k => { const e0 = est; if (k === 'switchGateLow') R.switchGate(true); else R[k](); log.push(k + ':' + (est - e0).toFixed(1)); };

  // ---------------------------------------------------------------- forks
  let medalSpot = null, machineSpots = [];
  const fork = () => {
    const Gr = b.gy;               // high lane row
    const LB = Gr + 10;            // low route ground
    flat(3);
    const f0 = b.cx;
    // the low route: a drop, then rooms squeezed under the high lane
    b.gy = LB; flat(4);
    const sMin = minG, sMax = maxG, sSafe = safe;
    minG = Gr + 8; maxG = Math.min(H - 6, Gr + 13); safe = true;
    const eLow0 = est;
    const nLow = 2 + (d > 0.5 ? 1 : 0);
    const lowRooms = [];
    for (let i = 0; i < nLow; i++) {
      const gim = i === 1 || r() < 0.4 ? pickGim(true) : null;
      if (gim) { runGim(gim); lowRooms.push(gim); }
      else { const k = r.pick(i === 0 && d > 0.1 ? ['switchGateLow', 'pitRun', 'platGap', 'enemyRun'] : ['pitRun', 'platGap', 'enemyRun']); runRoom(k); lowRooms.push(k); }
    }
    flat(4);
    const lowEst = est - eLow0;
    est = eLow0; // the skilled time is the high lane's; keep the low route for first-timers
    estFirst += lowEst * 0.4;
    minG = sMin; maxG = sMax; safe = sSafe;
    const f1 = b.cx;
    // --- high lane over [f0, f1)
    const isles = [];
    const kinds = HI_KIND[zoneIdx];
    let c = f0 + r.int(3, Math.min(5, P.gapMax));
    let row = Gr;
    const need = seals.filter(s => s.c >= f0 && s.c < f1).map(s => s.c);
    while (c < f1 - 4) {
      let w = r.int(P.isleMin, P.isleMax);
      const forced = need.find(sc => sc >= c && sc < c + w + P.gapMax + 1);
      if (forced != null && forced >= c + w) w = forced - c + 2;
      if (c + w > f1 - 1) w = f1 - 1 - c;
      if (w < 2) break;
      row = clamp(row + r.int(-2, 2), Gr - 2, Gr + 1);
      // headroom check against the low route
      let ok = true;
      for (let k = c; k < c + w && ok; k++) {
        if (surf[k] > 0 && surf[k] < (row + 6) * 16) ok = false;
        for (let y = row - 3; y <= row + 3; y++) if (lv.get(k, y) !== T.EMPTY) ok = false;
      }
      if (!ok) { row = Gr - 2; ok = true; for (let k = c; k < c + w; k++) for (let y = row - 3; y <= row + 3; y++) if (lv.get(k, y) !== T.EMPTY) ok = false; }
      if (ok) {
        const covers = need.some(sc => sc >= c && sc < c + w);
        let kind = covers || isles.length === 0 ? 'solid' : r.pick(kinds);
        if (kind !== 'solid' && w < 3) kind = 'solid';
        if (kind === 'solid') { ledge(c, w, row, false); }
        else if (kind === 'crumble') { for (let k = 0; k + 2 <= w; k += 2) sp('crumble', px(c + k), row * 16, { w: 32 }); }
        else if (kind === 'fall' || kind === 'h' || kind === 'v' || kind === 'airship') sp('platform', px(c) + w * 8, row * 16 + 8, { move: kind, range: kind === 'v' ? 24 : 26, speed: P.platSpd, phase: isles.length, w: Math.max(40, w * 16) });
        else if (kind === 'glitch') sp('glitchblock', px(c) + w * 8, row * 16 + 8, { phase: isles.length * 60 });
        else if (kind === 'swing') sp('swing', px(c) + w * 8, row * 16 - 70, { len: 70, amp: 0.4, speed: 0.03, phase: isles.length, w: 48 });
        isles.push({ c, w, row, kind });
        ringLine(px(c) + 8, row * 16 - 20, Math.min(4, w), 16);
        // hazards: flyers over gaps, zone dressing on the islands
        if (kind === 'solid' && w >= 3 && r() < 0.25 + d * 0.5) hiSpice(c, w, row);
      }
      c += w + r.int(3, P.gapMax);
    }
    if (isles.length) {
      const last = isles[isles.length - 1];
      if (r() < 0.6) monitor(px(last.c) + last.w * 8, last.row * 16);
      if (last.kind === 'solid') medalSpot = medalSpot || { x: px(last.c) + last.w * 8, y: last.row * 16 - 30 };
      const mid = isles[Math.floor(isles.length * 0.6)];
      if (mid && mid.kind === 'solid') machineSpots.push({ x: px(mid.c) + mid.w * 8, y: mid.row * 16 });
      for (let i = 1; i < isles.length; i++) if (d > 0.3 && r() < d * 0.5) {
        const gx = (isles[i - 1].c + isles[i - 1].w + isles[i].c) >> 1;
        sp('enemy', px(gx) + 8, Math.min(isles[i - 1].row, isles[i].row) * 16 - 40, { kind: r.pick(flyKinds), range: 30 });
      }
    }
    // seals: low-route gate walls reach up to the island above
    for (const s of seals.filter(s => s.c >= f0 && s.c < f1)) {
      for (let y = s.from; y >= 0; y--) { if (lv.get(s.c, y) !== T.EMPTY && lv.get(s.c, y) !== T.ONEWAY) break; lv.set(s.c, y, T.FULL); }
    }
    // high lane time: fast
    const hs = (f1 - f0) * 16 / (60 * 3.4) + isles.length * 0.3;
    est += hs; estFirst += hs * 1.2;
    log.push(`FORK[${lowRooms.join(',')}] hi:${hs.toFixed(1)} lo:${lowEst.toFixed(1)}`);
  };
  const hiSpice = (c, w, row) => {
    const y = row * 16, cx = px(c) + w * 8;
    switch (zoneIdx) {
      case 3: sp('popspikes', px(c + 1), y, { w: 16, period: 110, phase: c * 7 }); break;
      case 4: sp('electric', px(c), y, { w: w * 16, phase: c * 5 }); break;
      case 7: sp('cannon', cx, y, { rate: 150 }); break;
      case 10: sp('firejet', cx, y, { phase: c * 3 }); break;
      case 13: sp('firebar', cx, y - 40, { n: 2, speed: 0.03 }); break;
      case 14: sp('saw', cx, y - 10, { move: 'h', range: Math.max(8, w * 5), speed: 0.03 }); break;
      case 15: sp('firebar', cx, y - 40, { n: 2, speed: 0.035 }); break;
      default: sp('enemy', cx, y, { kind: r.pick(groundKinds), range: Math.max(16, (w - 2) * 16) });
    }
  };

  // ---------------------------------------------------------------- build
  b.gy = 44;
  flat(12);
  const start = { x: px(5), y: gyPx() };
  let cpN = 0;
  const cp = () => { flat(3); sp('checkpoint', px(b.cx - 2), gyPx(), { id: cpN++ }); flat(2); };
  const target = targetSecs(zoneIdx, act);
  const genericPool = ['steps', 'pitRun', 'platGap', 'enemyRun', 'climb', 'descent', 'breakShortcut'];
  const puzzles = act === 1 ? ['keyRoom', 'switchGate', 'keyRoom'] : ['switchGate', 'keyRoom'];
  if (isBoss) puzzles.length = 1;
  if (tut && act === 0) puzzles.length = 1;
  const timePosts = act === 1 ? ['past', 'future'] : [];
  let forks = 0, sec = 0;
  const steer = k => {
    if (b.gy > 54 && ['descent', 'floodRoom', 'lagoonDive', 'sandSlide', 'snowRun', 'quarterPipe', 'breakChain'].includes(k)) return r.pick(['steps', 'climb']);
    if (b.gy < 26 && ['steps', 'climb', 'neonLift', 'lanternRise', 'fireworkUp', 'cannonNest', 'windShaft'].includes(k)) return 'descent';
    return k;
  };
  if (!raceBoss) {
    // warm-up room (no checkpoint needed at the start)
    runRoom(tut ? 'steps' : r.pick(['steps', 'pitRun']));
    while (est < target) {
      const prog = est / target;
      cp();
      sec++;
      if (timePosts.length && prog > (timePosts.length === 2 ? 0.18 : 0.55)) { R.timeRun(timePosts.shift()); log.push('timepost'); }
      const wantFork = !isBoss && (sec % 3 === 2 || (forks === 0 && prog > 0.3) || (forks < 2 && prog > 0.6));
      if (wantFork && b.gy >= 22 && b.gy <= 54) { fork(); forks++; continue; }
      if (wantFork && b.gy > 54) { runRoom('climb'); }
      // gauntlet: a zone gimmick plus a puzzle or platforming room; later ones stack two gimmicks
      const g1 = pickGim(false);
      if (g1) runGim(steer(g1) === g1 ? g1 : null);
      if (puzzles.length && (prog > 0.15 || sec > 1) && r() < 0.6 + prog) runRoom(puzzles.shift());
      else runRoom(steer(r.pick(genericPool)));
      if (prog > 0.45 && d > 0.2) { const g2 = pickGim(false); if (g2 && g2 !== g1) runGim(steer(g2) === g2 ? g2 : null); }
      if (est > target * 3 || b.cx > WMAX - 400) break;
    }
    while (puzzles.length && !isBoss) { cp(); runRoom(puzzles.shift()); }
  }

  // ---------------------------------------------------------------- medal & machine
  if (medalSpot) sp('medal', medalSpot.x, medalSpot.y, {});
  else { const bw = spawns.find(s => s.type === 'breakwall'); if (bw) sp('medal', bw.x + 40, bw.y + 20, {}); }
  if (era === 'past' && act < 2) {
    let m = machineSpots[machineSpots.length - 1];
    if (!m) { let cc = Math.floor(b.cx * 0.7); while (surf[cc] < 0) cc++; m = { x: px(cc), y: surf[cc] }; }
    sp('machine', m.x, m.y);
  }

  // ---------------------------------------------------------------- ending
  let bossArena = null, goalX = 0, W;
  if (!isBoss) {
    cp();
    flat(8);
    const gc = b.cx + 14;
    flat(40);
    goalX = px(gc);
    sp('signpost', goalX, gyPx());
    W = b.cx;
  } else if (raceBoss) {
    // race track: hills, halfpipes, small hops and one loop
    b.gy = clamp(b.gy, 36, 50);
    flat(10);
    const raceStart = px(b.cx);
    const rr = rng(seed + 9);
    const RL = 520 + zoneIdx * 10;
    let looped = false;
    while (b.cx < raceStart / 16 + RL) {
      const k = rr.int(0, 5);
      if (k === 0) { up22(rr.int(1, 2)); flat(rr.int(2, 4)); dn22(rr.int(1, 2)); }
      else if (k === 1) { const dd = rr.int(3, 4); dn22(1); dn45(dd); flat(rr.int(3, 5)); up45(dd); up22(1); }
      else if (k === 2) { flat(rr.int(6, 10)); }
      else if (k === 3 && !looped && b.cx > raceStart / 16 + RL / 2) { looped = true; G.loopRun(); }
      else if (k === 4) { flat(3); up45(1); pit(3, 3); b.gy = Math.min(maxG, b.gy + 1); flat(4); }
      else { dn22(rr.int(1, 2)); flat(3); up22(rr.int(1, 2)); }
      b.gy = clamp(b.gy, 30, 56);
      ringsOnSurf(b.cx - 8, b.cx, 3, 20);
    }
    flat(60);
    W = b.cx;
    goalX = px(W - 28);
    bossArena = { type: bossType, x0: raceStart, x1: goalX, y: gyPx(), race: true };
    sp('racegoal', goalX, surf[W - 28]);
  } else {
    cp();
    flat(10);
    b.gy = Math.min(Math.max(b.gy, 40), 56);
    const a0 = b.cx;
    flat(30);
    W = b.cx;
    const floorY = gyPx();
    bossArena = { type: bossType, x0: px(a0) + 16, x1: px(a0) + 16 + 424 - 32, y: floorY };
    goalX = bossArena.x1;
  }

  // ---------------------------------------------------------------- copy into a level of the exact width
  const out = new Level(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.set(x, y, lv.get(x, y));
  for (const L of lines) out.addLine(...L);
  const surfOut = surf.slice(0, W);
  const walls = spawns.filter(s => s.type === 'breakwall');
  const spawnsOut = spawns.filter(s => s.x < W * 16 && (s.type !== 'spring' || !walls.some(w =>
    Math.abs(s.x - w.x) < 80 && s.y >= w.y - 24 && s.y <= w.y + w.h + 16
  )));

  let waterY = null;
  if (zone.water) waterY = zoneIdx === 2 ? 52 * 16 : 60 * 16;
  if (zoneIdx === 2 && era === 'past') waterY = 55 * 16;

  return { level: out, spawns: spawnsOut, start, goalX, surf: surfOut, bossArena, waterY, L: W, est, estFirst, log, d };
}
