// Progress. The portable, encrypted SAVE FILE is the real save (works on any device).
// The browser's own storage is only a best-effort cache so a page refresh doesn't lose the session.
import { encryptSave, decryptSave, downloadText, pickFileText } from './savefile.js';

const CACHE = 'sonic-afterimage-session-v2';

function blank() {
  return {
    started: false,
    zone: 0, act: 0,          // next stage to play
    lives: 3,
    score: 0,
    continues: 2,
    stones: [],               // indices 0..6 of time stones owned
    medals: {},               // "z-a": true
    pastMachines: {},         // zone index: true (Act 1 anchor destroyed)
    goodFutures: {},          // zone index: true (Act 3 cleared in good future)
    cleared: {},              // "z-a": true
    bestTimes: {},            // "z-a": frames
    anchors: 0,               // bosses defeated (0..16)
    endingSeen: null,         // 'good' | 'bad'
  };
}

const int = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : d);
const stageKeyOk = k => /^(\d|1[0-5])-[0-2]$/.test(k);
// Rebuild a clean save object from untrusted input: unknown keys dropped, values clamped.
function sanitize(d) {
  const o = blank();
  if (!d || typeof d !== 'object') return o;
  o.started = !!d.started;
  o.zone = int(d.zone, 0, 15, 0); o.act = int(d.act, 0, 2, 0);
  o.lives = int(d.lives, 1, 99, 3); o.score = int(d.score, 0, 99999990, 0);
  o.continues = int(d.continues, 0, 9, 2);
  o.stones = Array.isArray(d.stones) ? [...new Set(d.stones.map(v => int(v, 0, 6, 0)))].slice(0, 7) : [];
  const boolMap = (m, okKey) => { const r = {}; if (m && typeof m === 'object') for (const k in m) if (okKey(k) && m[k]) r[k] = true; return r; };
  const zoneKey = k => /^(\d|1[0-5])$/.test(k);
  o.medals = boolMap(d.medals, stageKeyOk);
  o.cleared = boolMap(d.cleared, stageKeyOk);
  o.pastMachines = boolMap(d.pastMachines, zoneKey);
  o.goodFutures = boolMap(d.goodFutures, zoneKey);
  if (d.bestTimes && typeof d.bestTimes === 'object') for (const k in d.bestTimes) if (stageKeyOk(k)) { const t = int(d.bestTimes[k], 600, 36000, 0); if (t) o.bestTimes[k] = t; }
  o.anchors = int(d.anchors, 0, 16, 0);
  o.endingSeen = d.endingSeen === 'good' || d.endingSeen === 'bad' ? d.endingSeen : null;
  return o;
}

export const save = {
  data: blank(),
  dirty: false,        // progress not yet written to a save file
  lastFileAt: 0,
  load() {
    try { const s = JSON.parse(sessionStorage.getItem(CACHE) || localStorage.getItem(CACHE)); if (s) { this.data = sanitize(s.data); this.dirty = !!s.dirty; } } catch (e) {}
    return this.data;
  },
  write() {
    this.dirty = true;
    const s = JSON.stringify({ data: this.data, dirty: true });
    try { sessionStorage.setItem(CACHE, s); } catch (e) {}
    try { localStorage.setItem(CACHE, s); } catch (e) {}
  },
  reset() {
    const keep = { bestTimes: this.data.bestTimes, medals: this.data.medals, endingSeen: this.data.endingSeen };
    this.data = Object.assign(blank(), keep);
    this.write();
  },
  hasProgress() { return this.data.started; },
  hasAnything() { return this.data.started || Object.keys(this.data.cleared).length > 0; },
  stageKey(z, a) { return z + '-' + a; },
  medalCount() { return Object.keys(this.data.medals).length; },

  // ---- portable save file
  fileName() {
    const d = this.data;
    return `sonic-afterimage-zone${d.zone + 1}-act${d.act + 1}.sav`;
  },
  async exportFile() {
    const text = await encryptSave(this.data);
    downloadText(text, this.fileName());
    this.dirty = false; this.lastFileAt = Date.now();
    const s = JSON.stringify({ data: this.data, dirty: false });
    try { sessionStorage.setItem(CACHE, s); localStorage.setItem(CACHE, s); } catch (e) {}
  },
  async importFile() {
    const text = await pickFileText();
    const d = await decryptSave(text);
    this.data = sanitize(d);
    this.write(); this.dirty = false;
    return this.data;
  },
};
save.load();
