// Keyboard / gamepad / touch input with edge detection.
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', KeyX: 'jump', KeyC: 'jump', Space: 'jump', KeyJ: 'jump', KeyK: 'jump',
  Enter: 'start', Escape: 'start', KeyP: 'start',
};
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'start'];

const raw = {};      // keyboard
const touchRaw = {};
const state = {};
const prev = {};
let anyKeyListeners = [];

export const input = {
  held(a) { return !!state[a]; },
  pressed(a) { return !!state[a] && !prev[a]; },
  released(a) { return !state[a] && !!prev[a]; },
  anyPressed() { return ACTIONS.some(a => this.pressed(a)); },
  onFirstInteraction(fn) { anyKeyListeners.push(fn); },
  update() {
    for (const a of ACTIONS) prev[a] = state[a];
    const pad = pollPad();
    for (const a of ACTIONS) state[a] = !!(raw[a] || touchRaw[a] || pad[a]);
    if (state.left && state.right) { state.left = state.right = false; }
  },
};

function fireFirst() {
  if (!anyKeyListeners.length) return;
  const l = anyKeyListeners; anyKeyListeners = [];
  l.forEach(f => f());
}

window.addEventListener('keydown', e => {
  const a = KEYMAP[e.code];
  if (a) { raw[a] = true; e.preventDefault(); }
  fireFirst();
});
window.addEventListener('keyup', e => {
  const a = KEYMAP[e.code];
  if (a) { raw[a] = false; e.preventDefault(); }
});
window.addEventListener('blur', () => { for (const k in raw) raw[k] = false; });
window.addEventListener('pointerdown', fireFirst);

function pollPad() {
  const out = {};
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const b = i => p.buttons[i] && p.buttons[i].pressed;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (ax < -0.4 || b(14)) out.left = true;
    if (ax > 0.4 || b(15)) out.right = true;
    if (ay < -0.5 || b(12)) out.up = true;
    if (ay > 0.5 || b(13)) out.down = true;
    if (b(0) || b(1) || b(2) || b(3)) out.jump = true;
    if (b(9) || b(8)) out.start = true;
    if (Object.keys(out).length) fireFirst();
  }
  return out;
}

// Touch controls
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) {
  document.body.classList.add('touch');
  const btns = document.querySelectorAll('#touch button');
  const active = new Map();
  const refresh = () => {
    for (const a of ACTIONS) touchRaw[a] = false;
    for (const k of active.values()) touchRaw[k] = true;
  };
  btns.forEach(btn => {
    const k = btn.dataset.k;
    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); active.set(e.pointerId, k); refresh(); fireFirst(); });
    const up = e => { active.delete(e.pointerId); refresh(); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
}
