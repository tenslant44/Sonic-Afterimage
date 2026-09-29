// Zone definitions for all 16 zones.
import { mix, shade } from './util.js';

// Present-era base palettes; other eras derived + overridden.
// sky: [top, bottom], g: ground colours {top, top2, a, b, dark, accent}
export const ZONES = [
  {
    name: 'PALMTREE PANIC', short: 'PPZ', tex: 'checker', bg: 'beach', boss: 'drillcrab',
    sky: ['#3070f0', '#a0e0ff'], g: { top: '#40c020', top2: '#208810', a: '#c07028', b: '#8a4a18', dark: '#502808', accent: '#f0d060' },
    features: ['loop', 'spring', 'hill', 'halfpipe', 'bridge', 'booster', 'spikes', 'movplat'], enemies: ['motobug', 'buzzer', 'crab'],
    music: { root: 62, mode: 'major', tempo: 144, prog: [0, 3, 4, 3], progB: [5, 3, 1, 4] },
    blurb: 'Sunny shores where the journey begins.',
  },
  {
    name: 'NEON OVERPASS', short: 'NOZ', tex: 'neon', bg: 'city', boss: 'metalrace1',
    sky: ['#100830', '#602070'], g: { top: '#30f0e0', top2: '#1090a0', a: '#282848', b: '#1c1c34', dark: '#0c0c1c', accent: '#ff40c0' },
    features: ['bumpers', 'booster', 'loop', 'spring', 'ramp', 'halfpipe', 'movplat', 'spikes'], enemies: ['hoverbot', 'motobug', 'turret'],
    music: { root: 64, mode: 'dorian', tempo: 152, prog: [0, 6, 5, 6], progB: [3, 4, 3, 6] },
    blurb: 'Glittering highways buzzing with pinball neon.',
  },
  {
    name: 'SUNKEN SANCTUM', short: 'SSZ', tex: 'brick', bg: 'ruins', boss: 'eel', water: true,
    sky: ['#2080a0', '#80d0c0'], g: { top: '#60b060', top2: '#407840', a: '#b0a078', b: '#887858', dark: '#504430', accent: '#40e0d0' },
    features: ['water', 'spring', 'bridge', 'hill', 'movplat', 'spikes', 'booster', 'loop'], enemies: ['fish', 'crab', 'buzzer'],
    music: { root: 60, mode: 'dorian', tempo: 118, prog: [0, 3, 6, 4], progB: [5, 4, 3, 4] },
    blurb: 'Flooded ruins of a kingdom lost to the lake.',
  },
  {
    name: 'CRYSTAL CRAWL', short: 'CCZ', tex: 'crystal', bg: 'cave', boss: 'golem',
    sky: ['#180828', '#402060'], g: { top: '#c080ff', top2: '#8040c0', a: '#503870', b: '#3a2854', dark: '#1c1030', accent: '#60f0ff' },
    features: ['rail', 'cart', 'spring', 'halfpipe', 'spikes', 'movplat', 'hill', 'booster'], enemies: ['bat', 'spiker', 'turret'],
    music: { root: 61, mode: 'minor', tempo: 136, prog: [0, 5, 2, 6], progB: [3, 4, 5, 6] },
    blurb: 'Glowing mines strung with rails and minecarts.',
  },
  {
    name: 'WACKY WORKBENCH', short: 'WWZ', tex: 'toy', bg: 'factory', boss: 'windup',
    sky: ['#f0a040', '#ffe0a0'], g: { top: '#f04040', top2: '#b02020', a: '#e0c070', b: '#b09048', dark: '#604820', accent: '#40a0ff' },
    features: ['bouncy', 'electric', 'spring', 'movplat', 'booster', 'spikes', 'hill', 'bumpers'], enemies: ['hopper', 'motobug', 'hoverbot'],
    music: { root: 65, mode: 'mixolydian', tempo: 148, prog: [0, 6, 3, 4], progB: [1, 4, 1, 4] },
    blurb: 'A toy factory where the floor fights back.',
  },
  {
    name: 'SKYLINE SCRAMBLE', short: 'SKZ', tex: 'rooftop', bg: 'skyline', boss: 'metalchase',
    sky: ['#f08040', '#ffd0a0'], g: { top: '#909098', top2: '#606068', a: '#a05840', b: '#804030', dark: '#402018', accent: '#ffe040' },
    features: ['zipline', 'wind', 'spring', 'ramp', 'booster', 'movplat', 'gaps', 'spikes'], enemies: ['buzzer', 'hoverbot', 'turret'],
    music: { root: 63, mode: 'major', tempo: 156, prog: [0, 4, 5, 3], progB: [1, 4, 3, 4] },
    blurb: 'Rooftop parkour high above the city.',
  },
  {
    name: 'FROSTBITE PEAK', short: 'FPZ', tex: 'ice', bg: 'mountain', boss: 'avalanche', ice: true,
    sky: ['#6090e0', '#e0f0ff'], g: { top: '#ffffff', top2: '#c8e0f8', a: '#80a8d8', b: '#6088c0', dark: '#304870', accent: '#a0f0ff' },
    features: ['snowboard', 'halfpipe', 'spring', 'hill', 'spikes', 'movplat', 'loop', 'booster'], enemies: ['penguin', 'buzzer', 'spiker'],
    music: { root: 64, mode: 'lydian', tempo: 140, prog: [0, 1, 4, 0], progB: [5, 3, 1, 4] },
    blurb: 'Snowboard slopes and glittering ice caves.',
  },
  {
    name: 'SCRAPYARD SYMPHONY', short: 'SYZ', tex: 'scrap', bg: 'junk', boss: 'scrapdragon',
    sky: ['#806040', '#e0b070'], g: { top: '#a08060', top2: '#705840', a: '#706858', b: '#585044', dark: '#282420', accent: '#f0c020' },
    features: ['magnet', 'rail', 'rhythm', 'spring', 'movplat', 'spikes', 'hill', 'booster'], enemies: ['crab', 'turret', 'motobug'],
    music: { root: 58, mode: 'mixolydian', tempo: 128, prog: [0, 6, 0, 3], progB: [3, 4, 6, 4], bass: 1 },
    blurb: 'A junkyard that plays itself like an orchestra.',
  },
  {
    name: 'MIRAGE MESA', short: 'MMZ', tex: 'sand', bg: 'desert', boss: 'sandworm',
    sky: ['#40a0f0', '#ffe8b0'], g: { top: '#f0c870', top2: '#d8a050', a: '#d07840', b: '#a85830', dark: '#603018', accent: '#40c0a0' },
    features: ['sandslide', 'halfpipe', 'spring', 'hill', 'loop', 'spikes', 'secret', 'booster'], enemies: ['scorp', 'buzzer', 'spiker'],
    music: { root: 62, mode: 'phrygian', tempo: 132, prog: [0, 1, 0, 6], progB: [3, 1, 0, 6] },
    blurb: 'Canyons of sliding sand and hidden pyramids.',
  },
  {
    name: 'LANTERN LAGOON', short: 'LLZ', tex: 'wood', bg: 'festival', boss: 'carnival', water: true,
    sky: ['#101848', '#402868'], g: { top: '#e04040', top2: '#a02828', a: '#806040', b: '#604428', dark: '#301c10', accent: '#ffc040' },
    features: ['lantern', 'bumpers', 'spring', 'water', 'bridge', 'fireworks', 'movplat', 'booster'], enemies: ['bat', 'fish', 'hoverbot'],
    music: { root: 60, mode: 'major', tempo: 126, prog: [0, 5, 3, 4], progB: [3, 0, 3, 4] },
    blurb: 'A night festival of fireworks and drifting lanterns.',
  },
  {
    name: 'VOLCANIC VAULT', short: 'VVZ', tex: 'rock', bg: 'volcano', boss: 'magma',
    sky: ['#300808', '#a03010'], g: { top: '#604040', top2: '#402828', a: '#583030', b: '#402020', dark: '#200c0c', accent: '#ff8020' },
    features: ['lava', 'crumble', 'firejet', 'spring', 'halfpipe', 'movplat', 'spikes', 'booster'], enemies: ['spiker', 'turret', 'bat'],
    music: { root: 57, mode: 'harmonic', tempo: 146, prog: [0, 5, 4, 4], progB: [3, 5, 4, 0] },
    blurb: 'Molten vaults where the floor gives way.',
  },
  {
    name: 'STARDUST SPEEDWAY', short: 'SDZ', tex: 'speedway', bg: 'highway', boss: 'metalrace2',
    sky: ['#080820', '#302060'], g: { top: '#f0e060', top2: '#c0a020', a: '#4050a0', b: '#303c80', dark: '#141c40', accent: '#ff6080' },
    features: ['booster', 'loop', 'halfpipe', 'spring', 'bumpers', 'ramp', 'movplat', 'spikes'], enemies: ['hoverbot', 'buzzer', 'motobug'],
    music: { root: 62, mode: 'minor', tempo: 150, prog: [0, 3, 6, 5], progB: [5, 6, 0, 4] },
    blurb: 'A starlit highway built for one final race.',
  },
  {
    name: 'CLOUDBURST CITADEL', short: 'CBZ', tex: 'fortress', bg: 'storm', boss: 'battleship',
    sky: ['#202838', '#606878'], g: { top: '#b0b8c0', top2: '#808890', a: '#606878', b: '#4c5460', dark: '#202428', accent: '#f0e040' },
    features: ['lightning', 'airship', 'wind', 'spring', 'movplat', 'gaps', 'spikes', 'booster'], enemies: ['hoverbot', 'turret', 'buzzer'],
    music: { root: 59, mode: 'dorian', tempo: 150, prog: [0, 6, 5, 4], progB: [3, 4, 0, 6] },
    blurb: 'A sky fortress battered by an endless storm.',
  },
  {
    name: 'GRAVITY GARDENS', short: 'GGZ', tex: 'vine', bg: 'garden', boss: 'plantmech',
    sky: ['#60c0a0', '#e0ffd0'], g: { top: '#80e040', top2: '#50a828', a: '#806850', b: '#5c4c38', dark: '#302418', accent: '#ff80c0' },
    features: ['gravity', 'spring', 'hill', 'movplat', 'loop', 'spikes', 'booster', 'halfpipe'], enemies: ['hopper', 'buzzer', 'bat'],
    music: { root: 65, mode: 'lydian', tempo: 134, prog: [0, 1, 5, 4], progB: [3, 2, 1, 4] },
    blurb: 'Floating gardens where up is only a suggestion.',
  },
  {
    name: 'METALLIC MADNESS', short: 'MTZ', tex: 'metal', bg: 'metalfactory', boss: 'metalfinal',
    sky: ['#101418', '#384048'], g: { top: '#90a0a8', top2: '#607078', a: '#485058', b: '#384048', dark: '#181c20', accent: '#ff3030' },
    features: ['glitch', 'electric', 'spring', 'movplat', 'spikes', 'booster', 'crumble', 'halfpipe'], enemies: ['turret', 'hoverbot', 'spiker'],
    music: { root: 56, mode: 'phrygian', tempo: 142, prog: [0, 1, 0, 5], progB: [3, 1, 6, 0] },
    blurb: "Eggman's factory, where time itself is breaking.",
  },
  {
    name: 'CHRONO CITADEL', short: 'CHZ', tex: 'clock', bg: 'core', boss: 'devourer',
    sky: ['#281040', '#8050a0'], g: { top: '#f0d080', top2: '#c0a050', a: '#705890', b: '#584070', dark: '#281838', accent: '#60f0ff' },
    features: ['eras', 'loop', 'rail', 'gravity', 'bumpers', 'spring', 'booster', 'spikes'], enemies: ['hoverbot', 'bat', 'turret', 'buzzer'],
    music: { root: 60, mode: 'harmonic', tempo: 150, prog: [0, 5, 3, 4], progB: [1, 4, 0, 4] },
    blurb: 'The planet\'s core, where every era collides.',
  },
];

export const ERA_NAMES = { past: 'PAST', present: 'PRESENT', good: 'GOOD FUTURE', bad: 'BAD FUTURE' };

// Derive an era palette from the present palette
export function eraPalette(zone, era, act = 0) {
  const P = { sky: [...zone.sky], g: { ...zone.g } };
  // each act has its own time of day: act 1 as designed, act 2 toward dusk, act 3 toward night
  if (act === 1) {
    P.sky = [mix(zone.sky[0], '#503070', 0.3), mix(zone.sky[1], '#ff9860', 0.35)];
    P.g.a = mix(zone.g.a, '#c06040', 0.12); P.g.b = mix(zone.g.b, '#903040', 0.12);
  } else if (act === 2) {
    P.sky = [mix(zone.sky[0], '#080820', 0.45), mix(zone.sky[1], '#403070', 0.4)];
    P.g.a = shade(mix(zone.g.a, '#404080', 0.15), -0.08); P.g.b = shade(mix(zone.g.b, '#303070', 0.15), -0.08);
    P.g.top = mix(zone.g.top, '#8080ff', 0.1);
  }
  zone = { sky: [...P.sky], g: { ...P.g } };
  const map = (fn) => {
    P.sky = P.sky.map(fn);
    for (const k in P.g) P.g[k] = fn(P.g[k]);
  };
  if (era === 'past') {
    map(c => mix(c, '#f0c080', 0.22));
    P.g.top = mix(zone.g.top, '#50d040', 0.35);
    P.g.top2 = mix(zone.g.top2, '#309020', 0.35);
  } else if (era === 'good') {
    map(c => shade(mix(c, '#80fff0', 0.12), 0.08));
  } else if (era === 'bad') {
    map(c => shade(mix(c, '#503048', 0.5), -0.2));
    P.sky = [mix(zone.sky[0], '#401828', 0.7), mix(zone.sky[1], '#704040', 0.65)];
    P.g.top = mix(zone.g.top, '#606058', 0.6);
    P.g.top2 = mix(zone.g.top2, '#403c38', 0.6);
    P.g.accent = mix(zone.g.accent, '#c04020', 0.5);
  }
  return P;
}

export const TIME_STONE_COLORS = ['#ff4040', '#ff9020', '#ffe030', '#40e060', '#40c0ff', '#6060ff', '#e060ff'];
