// Audio: sample SFX + a procedural FM-style music sequencer.
import { rng, hash } from './util.js';

let ctx = null, master, musicBus, sfxBus, noiseBuf;
const buffers = {};
const SFX = ['jump', 'ring', 'rev', 'release', 'spring', 'ringloss', 'pop', 'bosshit', 'monitor', 'skid', 'checkpoint',
  'bumper', 'hurt', 'warp', 'boom', 'splash', 'zap', 'shot', 'dash', 'signpost', 'select', 'bigring', 'bubble', 'fire', 'thunder', 'grind'];

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export const audio = {
  ready: false,
  musicVol: 0.55, sfxVol: 0.8,
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    comp.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = this.musicVol; musicBus.connect(comp);
    sfxBus = ctx.createGain(); sfxBus.gain.value = this.sfxVol; sfxBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ready = true;
    SFX.forEach(n => this.loadSfx(n));
    setInterval(() => sched.tick(), 25);
    if (sched.pending) { const p = sched.pending; sched.pending = null; this.playSong(p.song, p.opts); }
  },
  async loadSfx(name) {
    try {
      const r = await fetch(`sfx/${name}.wav`);
      if (!r.ok) return;
      const ab = await r.arrayBuffer();
      buffers[name] = await ctx.decodeAudioData(ab);
    } catch (e) { /* missing sound: fall back to synth */ }
  },
  sfx(name, opts = {}) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const b = buffers[name];
    if (b) {
      const s = ctx.createBufferSource(); s.buffer = b;
      s.playbackRate.value = opts.rate || 1;
      const g = ctx.createGain(); g.gain.value = opts.vol ?? 1;
      s.connect(g); g.connect(sfxBus); s.start(t);
      return s;
    }
    synthSfx(name, t, opts);
  },
  // Play a song: a spec object or preset name
  playSong(song, opts = {}) {
    if (!ctx) { sched.pending = { song, opts }; return; }
    const spec = typeof song === 'string' ? PRESETS[song]() : song;
    const key = JSON.stringify(spec);
    if (sched.key === key && sched.playing && !opts.restart) return;
    sched.start(compose(spec), key, opts);
  },
  stopMusic(fade = 0) {
    sched.stop(fade);
  },
  setTempoMul(m) { sched.tempoMul = m; },
  jingle(name, done) {
    const spec = JINGLES[name];
    if (!ctx) { done && setTimeout(done, 100); return; }
    sched.start(spec(), 'jingle-' + name + Math.random(), { once: true, done });
  },
  get currentKey() { return sched.key; },
};

// ---------------------------------------------------------------- synth voices
function env(g, t, a, peak, dec, sus, end, rel) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + dec);
  g.gain.setValueAtTime(Math.max(0.0001, peak * sus), end);
  g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
}

function fm(dest, t, freq, dur, o) {
  const c = ctx.createOscillator(); c.type = o.wave || 'sine'; c.frequency.value = freq;
  if (o.detune) c.detune.value = o.detune;
  const g = ctx.createGain();
  let m, mg;
  if (o.index) {
    m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = freq * (o.ratio || 1);
    mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * o.index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.01, freq * (o.indexEnd ?? o.index * 0.3)), t + Math.max(0.02, o.indexTime || dur));
    m.connect(mg); mg.connect(c.frequency); m.start(t); m.stop(t + dur + (o.rel || 0.1) + 0.05);
  }
  if (o.vib) {
    const v = ctx.createOscillator(); v.frequency.value = 5.5;
    const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(freq * o.vib, t + 0.25);
    v.connect(vg); vg.connect(c.frequency); v.start(t); v.stop(t + dur + 0.3);
  }
  if (o.slide) c.frequency.exponentialRampToValueAtTime(freq * o.slide, t + dur);
  let out = g;
  if (o.lp) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 1;
    g.connect(f); out = f;
  }
  c.connect(g); out.connect(dest);
  env(g, t, o.a ?? 0.005, o.vol ?? 0.2, o.d ?? 0.15, o.s ?? 0.6, t + dur, o.rel ?? 0.08);
  c.start(t); c.stop(t + dur + (o.rel ?? 0.08) + 0.05);
}

function noise(dest, t, dur, o) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.value = o.freq || 6000; f.Q.value = o.q || 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

function kick(dest, t, vol = 0.5) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.22);
}
function snare(dest, t, vol = 0.3) {
  noise(dest, t, 0.16, { type: 'bandpass', freq: 1800, q: 0.7, vol });
  const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'triangle';
  o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
  g.gain.setValueAtTime(vol * 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.12);
}
function tom(dest, t, f, vol = 0.3) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.15);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.22);
}

// ------------------------------------------------------------------ instruments
const INST = {
  brass: { index: 2.2, indexEnd: 0.9, indexTime: 0.2, ratio: 1, vol: 0.13, d: 0.2, s: 0.7, vib: 0.012 },
  lead2: { wave: 'square', vol: 0.06, d: 0.1, s: 0.8, vib: 0.015, lp: 3200 },
  saw: { wave: 'sawtooth', vol: 0.07, d: 0.2, s: 0.6, lp: 1800, vib: 0.01, detune: 8 },
  bell: { index: 3, indexEnd: 0.2, indexTime: 0.4, ratio: 3.5, vol: 0.12, d: 0.4, s: 0.15, rel: 0.3 },
  marimba: { index: 2, indexEnd: 0.05, indexTime: 0.1, ratio: 4, vol: 0.16, d: 0.25, s: 0.05, rel: 0.1 },
  flute: { wave: 'triangle', vol: 0.13, a: 0.03, d: 0.2, s: 0.8, vib: 0.02 },
  fmbass: { index: 1.6, indexEnd: 0.3, indexTime: 0.12, ratio: 1, vol: 0.2, d: 0.15, s: 0.5 },
  slapbass: { index: 3.5, indexEnd: 0.4, indexTime: 0.06, ratio: 2, vol: 0.18, d: 0.12, s: 0.4 },
  softbass: { wave: 'triangle', vol: 0.25, d: 0.2, s: 0.6 },
  sawbass: { wave: 'sawtooth', vol: 0.1, d: 0.15, s: 0.6, lp: 700, q: 4 },
  pad: { wave: 'sawtooth', vol: 0.025, a: 0.25, d: 0.5, s: 0.8, lp: 1400, detune: 10, rel: 0.4 },
  arp: { wave: 'square', vol: 0.035, d: 0.06, s: 0.3, lp: 4000 },
  darkpad: { wave: 'sawtooth', vol: 0.03, a: 0.4, d: 0.6, s: 0.8, lp: 700, detune: -15, rel: 0.5 },
};

// ----------------------------------------------------------------- composition
const STYLE = {
  present: { lead: 'brass', bass: 'slapbass', pad: null, arp: false, drums: 'rock', tempoAdd: 0 },
  past: { lead: 'marimba', lead2: 'flute', bass: 'softbass', pad: 'pad', arp: false, drums: 'light', tempoAdd: -8 },
  good: { lead: 'lead2', bass: 'fmbass', pad: 'pad', arp: true, drums: 'dance', tempoAdd: 8 },
  bad: { lead: 'saw', bass: 'sawbass', pad: 'darkpad', arp: false, drums: 'industrial', tempoAdd: -6, dark: true },
  boss: { lead: 'saw', bass: 'slapbass', pad: 'darkpad', arp: true, drums: 'driving', tempoAdd: 0 },
  race: { lead: 'brass', bass: 'slapbass', pad: null, arp: true, drums: 'driving', tempoAdd: 0 },
  title: { lead: 'brass', bass: 'fmbass', pad: 'pad', arp: true, drums: 'rock', tempoAdd: 0 },
  special: { lead: 'bell', bass: 'fmbass', pad: 'pad', arp: true, drums: 'dance', tempoAdd: 0 },
  calm: { lead: 'bell', bass: 'softbass', pad: 'pad', arp: false, drums: 'none', tempoAdd: 0 },
  final: { lead: 'saw', bass: 'sawbass', pad: 'darkpad', arp: true, drums: 'driving', tempoAdd: 0, dark: true },
};

const DRUMS = {
  rock: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  light: { k: 'x.........x.....', s: '............x...', h: '..x...x...x...x.', t: 'x..x..x.....x.x.' },
  dance: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...xx' },
  industrial: { k: 'x..x..x...x..x..', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx' },
  driving: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
  none: { k: '', s: '', h: '' },
};
const BASS = [
  'R.RR..R.R.o...R.', 'R..R..R.R..R.o.o', 'R.oR.oR.R.oR.o.R', 'RRo.RRo.RRo.R.o.', 'R...R.o.R...R.fo', 'R.R.o.R.R.R.o.fR',
];

export function compose(spec) {
  const st = STYLE[spec.style] || STYLE.present;
  const r = rng(spec.seed || hash(JSON.stringify(spec)));
  let mode = spec.mode || 'major';
  if (st.dark && (mode === 'major' || mode === 'lydian' || mode === 'mixolydian')) mode = spec.style === 'final' ? 'harmonic' : 'minor';
  const scale = SCALES[mode];
  const root = spec.root ?? 60;
  const bpm = (spec.tempo || 140) + st.tempoAdd;
  const prog = spec.prog || [0, 5, 3, 4];
  const progB = spec.progB || [3, 4, 5, 4];
  const bars = 16;
  const bassPat = spec.bass != null ? BASS[spec.bass % BASS.length] : r.pick(BASS);
  const drum = DRUMS[spec.drums || st.drums];
  const notes = []; // {step, len, midi, inst, vel}
  const deg2midi = (deg, oct = 0) => {
    const o = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7;
    return root + scale[d] + 12 * (o + oct);
  };
  const chordOf = bar => {
    const sec = Math.floor(bar / 4);
    const p = sec === 2 ? progB : prog;
    return p[(bar % 4) % p.length];
  };

  // Melody phrase generator (2 bars = 32 steps)
  const genPhrase = (bar0, high, seedOff) => {
    const pr = rng((spec.seed || 1) * 31 + seedOff);
    const out = [];
    let s = 0;
    let deg = chordOf(bar0) + (high ? 7 : 2) + pr.int(0, 2) * 2;
    const lens = spec.style === 'past' ? [2, 2, 4, 3, 6] : [1, 2, 2, 2, 3, 4, 1, 6];
    while (s < 32) {
      let len = pr.pick(lens);
      if (s + len > 32) len = 32 - s;
      const bar = bar0 + Math.floor(s / 16);
      const ch = chordOf(bar);
      if (pr() < (s % 8 === 0 ? 0.08 : 0.22)) { s += len; continue; } // rest
      if (s % 4 === 0) {
        // snap to nearest chord tone
        const tones = [ch, ch + 2, ch + 4, ch + 7, ch + 9, ch + 11, ch - 3, ch - 5];
        deg = tones.reduce((b, t) => Math.abs(t - deg) < Math.abs(b - deg) ? t : b, tones[0]);
      } else {
        deg += pr.pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
      }
      deg = Math.max(high ? 5 : 0, Math.min(high ? 14 : 11, deg));
      out.push({ s, len, deg });
      s += len;
    }
    return out;
  };
  const A = genPhrase(0, false, 1), A2 = genPhrase(2, false, 2), A3 = genPhrase(2, false, 3);
  const B = genPhrase(8, true, 4), B2 = genPhrase(10, true, 5);
  const layout = [[0, A], [2, A2], [4, A], [6, A3], [8, B], [10, B2], [12, A], [14, A2]];
  const leadInst = st.lead;
  for (const [bar, ph] of layout) {
    for (const n of ph) {
      const inst = (st.lead2 && bar >= 8 && bar < 12) ? st.lead2 : leadInst;
      notes.push({ step: bar * 16 + n.s, len: n.len, midi: deg2midi(n.deg, spec.leadOct ?? 0), inst, ch: 'lead' });
    }
  }
  // Bass + pad + arp
  for (let bar = 0; bar < bars; bar++) {
    const ch = chordOf(bar);
    for (let i = 0; i < 16; i++) {
      const c = bassPat[i];
      if (c === '.') continue;
      const deg = c === 'R' ? ch : c === 'o' ? ch + 7 : c === 'f' ? ch + 4 : ch;
      let len = 1; while (i + len < 16 && bassPat[i + len] === '.' && len < 3) len++;
      notes.push({ step: bar * 16 + i, len, midi: deg2midi(deg, -2), inst: st.bass, ch: 'bass' });
    }
    if (st.pad) {
      for (const d of [0, 2, 4]) notes.push({ step: bar * 16, len: 16, midi: deg2midi(ch + d, -1), inst: st.pad, ch: 'pad' });
    }
    if (st.arp) {
      const seq = [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 4, 7];
      for (let i = 0; i < 16; i += (spec.style === 'boss' || spec.style === 'final' ? 1 : 2)) {
        notes.push({ step: bar * 16 + i, len: 1, midi: deg2midi(ch + seq[i], 1), inst: 'arp', ch: 'arp' });
      }
    }
  }
  // Drums
  const drumNotes = [];
  for (let bar = 0; bar < bars; bar++) {
    for (let i = 0; i < 16; i++) {
      const step = bar * 16 + i;
      if (drum.k[i] === 'x') drumNotes.push({ step, d: 'k' });
      if (drum.s[i] === 'x') drumNotes.push({ step, d: 's' });
      if (drum.h[i] === 'x') drumNotes.push({ step, d: 'h' });
      if (drum.t && drum.t[i] === 'x') drumNotes.push({ step, d: 't', f: 180 + ((i * 37) % 5) * 40 });
    }
    if (bar % 4 === 3 && drum.s) {
      for (const i of [12, 13, 14, 15]) drumNotes.push({ step: bar * 16 + i, d: 's', v: 0.5 });
    }
  }
  return { bpm, len: bars * 16, notes, drumNotes, loop: true };
}

// ------------------------------------------------------------------- scheduler
const sched = {
  song: null, key: null, playing: false, step: 0, next: 0, tempoMul: 1, bus: null, opts: {}, pending: null,
  start(song, key, opts) {
    this.stop(0.05);
    this.song = song; this.key = key; this.playing = true; this.step = 0; this.opts = opts || {};
    this.next = ctx.currentTime + 0.06;
    this.bus = ctx.createGain(); this.bus.gain.value = song.vol || 1; this.bus.connect(musicBus);
    this.byStep = new Map();
    for (const n of song.notes) { if (!this.byStep.has(n.step)) this.byStep.set(n.step, []); this.byStep.get(n.step).push(n); }
    for (const n of song.drumNotes) { if (!this.byStep.has(n.step)) this.byStep.set(n.step, []); this.byStep.get(n.step).push(n); }
  },
  stop(fade) {
    if (this.bus) {
      const b = this.bus; const t = ctx.currentTime;
      b.gain.setValueAtTime(b.gain.value, t);
      b.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
      setTimeout(() => b.disconnect(), (fade + 0.5) * 1000);
    }
    this.bus = null; this.playing = false; this.key = null;
  },
  tick() {
    if (!this.playing || !ctx) return;
    const song = this.song;
    const stepDur = 60 / (song.bpm * this.tempoMul) / 4;
    while (this.next < ctx.currentTime + 0.12) {
      const list = this.byStep.get(this.step);
      if (list) for (const n of list) this.play(n, this.next, stepDur);
      this.next += stepDur;
      this.step++;
      if (this.step >= song.len) {
        if (song.loop && !this.opts.once) this.step = 0;
        else {
          this.playing = false;
          const d = this.opts.done;
          const wait = (this.next - ctx.currentTime) * 1000 + 300;
          if (d) setTimeout(d, wait);
          return;
        }
      }
    }
  },
  play(n, t, sd) {
    const b = this.bus;
    if (n.d) {
      const v = n.v || 1;
      if (n.d === 'k') kick(b, t, 0.45 * v);
      else if (n.d === 's') snare(b, t, 0.22 * v);
      else if (n.d === 'h') noise(b, t, 0.04, { freq: 8000, vol: 0.05 * v });
      else if (n.d === 't') tom(b, t, n.f, 0.2);
      else if (n.d === 'c') noise(b, t, 0.8, { freq: 5000, vol: 0.09 });
      return;
    }
    const inst = INST[n.inst] || INST.brass;
    fm(b, t, mtof(n.midi), n.len * sd * 0.92, n.vol ? Object.assign({}, inst, { vol: inst.vol * n.vol }) : inst);
  },
};

// ------------------------------------------------------------------ presets
function fixed(bpm, lead, bass, opts = {}) {
  // lead/bass: arrays of [step, len, midi]
  const notes = [];
  for (const [s, l, m] of lead) notes.push({ step: s, len: l, midi: m, inst: opts.lead || 'brass' });
  for (const [s, l, m] of bass) notes.push({ step: s, len: l, midi: m, inst: opts.bass || 'slapbass' });
  if (opts.harm) for (const [s, l, m] of opts.harm) notes.push({ step: s, len: l, midi: m, inst: opts.harmInst || 'lead2' });
  const len = opts.len || Math.max(...lead.map(n => n[0] + n[1]), ...bass.map(n => n[0] + n[1]));
  return { bpm, len, notes, drumNotes: opts.drums || [], loop: !!opts.loop };
}

const JINGLES = {
  clear: () => fixed(150, [
    [0, 2, 72], [2, 2, 76], [4, 2, 79], [6, 2, 84], [8, 2, 83], [10, 2, 79], [12, 4, 81], [16, 2, 79], [18, 2, 81], [20, 2, 83], [22, 10, 84],
  ], [[0, 4, 48], [4, 4, 52], [8, 4, 55], [12, 4, 53], [16, 4, 55], [20, 4, 55], [22, 10, 48]],
    { harm: [[0, 2, 64], [2, 2, 67], [4, 2, 72], [6, 2, 76], [8, 2, 74], [10, 2, 71], [12, 4, 72], [16, 2, 71], [18, 2, 72], [20, 2, 74], [22, 10, 76]],
      drums: [{ step: 0, d: 'k' }, { step: 4, d: 's' }, { step: 8, d: 'k' }, { step: 12, d: 's' }, { step: 16, d: 'k' }, { step: 20, d: 's' }, { step: 22, d: 'c' }, { step: 22, d: 'k' }] }),
  oneup: () => fixed(170, [[0, 2, 76], [2, 2, 79], [4, 2, 88], [6, 2, 84], [8, 2, 86], [10, 6, 91]], [[0, 4, 52], [4, 4, 55], [8, 8, 60]], { lead: 'lead2' }),
  gameover: () => fixed(90, [[0, 4, 67], [4, 4, 66], [8, 4, 65], [12, 12, 64]], [[0, 8, 43], [8, 8, 41], [16, 8, 36]], { lead: 'saw', bass: 'sawbass' }),
  stone: () => fixed(120, [[0, 2, 72], [2, 2, 79], [4, 2, 84], [6, 2, 88], [8, 16, 91]], [[0, 8, 48], [8, 16, 55]], { lead: 'bell', bass: 'softbass' }),
  warp: () => fixed(160, [[0, 1, 72], [1, 1, 76], [2, 1, 79], [3, 1, 84], [4, 1, 88], [5, 1, 91], [6, 6, 96]], [[0, 12, 48]], { lead: 'bell', bass: 'softbass' }),
};

export const PRESETS = {
  title: () => ({ style: 'title', root: 62, mode: 'major', tempo: 138, prog: [0, 4, 5, 3], progB: [3, 4, 2, 5], seed: 777 }),
  menu: () => ({ style: 'calm', root: 60, mode: 'lydian', tempo: 100, prog: [0, 3, 0, 4], seed: 99 }),
  boss: () => ({ style: 'boss', root: 57, mode: 'minor', tempo: 158, prog: [0, 5, 6, 4], progB: [3, 4, 0, 4], seed: 1313, bass: 5 }),
  finalboss: () => ({ style: 'final', root: 55, mode: 'harmonic', tempo: 164, prog: [0, 5, 1, 4], progB: [3, 4, 5, 4], seed: 6666, bass: 2 }),
  race: () => ({ style: 'race', root: 59, mode: 'minor', tempo: 170, prog: [0, 5, 3, 4], progB: [5, 6, 4, 4], seed: 4242, bass: 2 }),
  special: () => ({ style: 'special', root: 64, mode: 'mixolydian', tempo: 146, prog: [0, 6, 3, 4], seed: 2020 }),
  invincible: () => ({ style: 'good', root: 65, mode: 'major', tempo: 176, prog: [0, 3, 4, 0], seed: 88, bass: 3 }),
  story: () => ({ style: 'calm', root: 57, mode: 'dorian', tempo: 84, prog: [0, 3, 6, 4], seed: 314 }),
  ending: () => ({ style: 'past', root: 62, mode: 'major', tempo: 116, prog: [0, 5, 3, 4], progB: [1, 4, 0, 3], seed: 1991 }),
  badending: () => ({ style: 'calm', root: 57, mode: 'minor', tempo: 76, prog: [0, 5, 3, 4], seed: 1992 }),
  credits: () => ({ style: 'present', root: 62, mode: 'mixolydian', tempo: 132, prog: [0, 6, 3, 4], progB: [3, 4, 5, 4], seed: 2026 }),
  gameover: () => ({ style: 'calm', root: 50, mode: 'minor', tempo: 70, prog: [0, 5], seed: 13 }),
};

// Fallback synth sfx if a sample is missing
function synthSfx(name, t, opts) {
  const d = sfxBus;
  const tone = (f, dur, o = {}) => fm(d, t + (o.at || 0), f, dur, Object.assign({ wave: 'square', vol: 0.08, d: dur, s: 0.3 }, o));
  switch (name) {
    case 'ring': tone(1568, 0.08); tone(2093, 0.25, { at: 0.07 }); break;
    case 'jump': tone(300, 0.15, { slide: 2.5 }); break;
    case 'spring': tone(200, 0.3, { slide: 4, wave: 'triangle', vol: 0.2 }); break;
    case 'pop': noise(d, t, 0.3, { type: 'lowpass', freq: 1500, vol: 0.4 }); break;
    case 'boom': noise(d, t, 0.8, { type: 'lowpass', freq: 600, vol: 0.6 }); break;
    case 'select': tone(880, 0.06); break;
    default: noise(d, t, 0.15, { type: 'bandpass', freq: 2000, vol: 0.2 });
  }
}
