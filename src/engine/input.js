// Input layer. Keyboard, gamepad and touch all feed the same tables.
//
//   held actions (left, right, up, down, jump): a level. Each is down while
//     ANY source bound to it is down (two keys, or a key and a touch button).
//     A tap that starts and ends between two samples still reads as down for
//     one sample. The sim finds jump's edge itself and needs the level for ropes.
//   edge actions (start, pause, mute): delivered exactly once per press.
//
// The game calls sample() once per fixed tick.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyX: 'jump',
  Enter: 'start',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
};

const HELD = ['left', 'right', 'up', 'down', 'jump'];
const EDGES = ['start', 'pause', 'mute'];

export function createInput(target = window) {
  const sources = Object.fromEntries(HELD.map((k) => [k, new Set()]));   // who is holding each action down
  const tapped = Object.fromEntries(HELD.map((k) => [k, false]));        // pressed since the last sample
  const edges = Object.fromEntries(EDGES.map((k) => [k, false]));
  const padPrev = { start: false, any: false };
  const out = { left: false, right: false, up: false, down: false, jump: false, start: false, pause: false, mute: false };
  let gesture = null;

  function press(action, source) {
    if (action in sources) {
      sources[action].add(source);
      tapped[action] = true;
    } else {
      edges[action] = true;
    }
    if (gesture) gesture();
  }
  function release(action, source) {
    if (action in sources) sources[action].delete(source);
  }
  function clearHeld() {
    for (const k of HELD) { sources[k].clear(); tapped[k] = false; }
  }

  target.addEventListener('keydown', (e) => {
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return; // auto-repeat is not a press
    press(action, e.code);
  });
  target.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    release(action, e.code);
  });
  // A missed keyup is a stuck input: drop all held state when focus leaves.
  target.addEventListener('blur', clearHeld);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearHeld(); });
  }

  let buttons = 0;
  function bindButton(el, action) {
    const source = `button${buttons++}`;
    const down = (e) => { e.preventDefault(); press(action, source); };
    const up = (e) => { e.preventDefault(); release(action, source); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function pollGamepad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return null;
    const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    const jump = b(0) || b(1) || b(2);
    const start = b(9);
    const state = {
      left: ax < -0.4 || b(14),
      right: ax > 0.4 || b(15),
      up: ay < -0.5 || b(12),
      down: ay > 0.5 || b(13),
      jump,
      startEdge: start && !padPrev.start,
    };
    const any = jump || start;
    if (any && !padPrev.any && gesture) gesture();
    padPrev.start = start;
    padPrev.any = any;
    return state;
  }

  function sample() {
    const pad = pollGamepad();
    for (const k of HELD) {
      out[k] = sources[k].size > 0 || tapped[k] || !!(pad && pad[k]);
      tapped[k] = false;
    }
    out.start = edges.start || !!(pad && pad.startEdge);
    out.pause = edges.pause;
    out.mute = edges.mute;
    for (const k of EDGES) edges[k] = false;
    return out;
  }

  return {
    sample,
    bindButton,
    // Runs on every press: the shell uses it to start or resume audio.
    onGesture(fn) { gesture = fn; },
  };
}
