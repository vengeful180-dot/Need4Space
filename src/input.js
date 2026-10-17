// Keyboard, mouse (pointer-lock virtual stick), gamepad and the touch sticks (touch.js), merged into one control state
// per frame.
import { clamp } from './noise.js';

export const AIRBRAKE_HOLD = 1, AIRBRAKE_WAIT = 3;       // an airbrake: on for a second at most, ready again 3 s after it fired

// XR motion controllers use a different mapping. Only a standard gamepad (Xbox,
// DualSense, etc.) belongs on this path; share the selection with the menus.
export const standardGamepad = (pads = navigator.getGamepads?.() || []) =>
  Array.from(pads).find((p) => p?.connected && p.mapping === 'standard') || null;
export const deadzone = (v) => Math.abs(v) <= 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88;

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();          // edge-triggered this frame
    this.stick = { x: 0, y: 0 };       // mouse virtual stick, recentres by itself
    this.drag = { dx: 0, dy: 0, wheel: 0, down: false };
    this.invert = false;
    this.canvas = canvas;
    this.locked = false;
    this.padPrev = [];
    this.padId = null;
    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.pad = false;                  // (the last used: the keyboard - the slam prompt shows Space)
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear(); this.pressed.clear();
      this.stick.x = this.stick.y = 0;
      this.drag.down = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.drag.down = true;
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', () => (this.drag.down = false));
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.stick.x = clamp(this.stick.x + e.movementX * 0.0035, -1, 1);
        this.stick.y = clamp(this.stick.y + e.movementY * 0.0035, -1, 1);
      } else if (this.drag.down) {
        this.drag.dx += e.movementX;
        this.drag.dy += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.drag.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.stick.x = this.stick.y = 0;
    });
  }

  lock() { if (!this.locked) this.canvas.requestPointerLock?.(); }
  unlock() { if (this.locked) document.exitPointerLock?.(); }

  was(code) { return this.pressed.has(code); }

  // the control state for this frame
  read(dt) {
    const k = (c) => (this.keys.has(c) ? 1 : 0);
    // the mouse stick drifts back to centre: hold the mouse still and the ship stops rotating
    const back = Math.exp(-2.6 * dt);
    this.stick.x *= back;
    this.stick.y *= back;
    const s = {
      throttleUp: k('KeyW'), throttleDown: k('KeyS'), throttleAxis: null,
      pitch: k('ArrowUp') - k('ArrowDown') - this.stick.y,
      // (the left / right arrows are the airbrakes, as Z / X: steering is A / D, the mouse, the sticks; in free
      // flight they still roll the ship - rollKeys)
      roll: this.stick.x, rollKeys: k('ArrowRight') - k('ArrowLeft'),
      yaw: k('KeyD') - k('KeyA'),
      climb: k('Space'), descend: k('KeyC'),
      boost: k('ShiftLeft') || k('ShiftRight'),
      engine: this.was('KeyE'), canopy: this.was('KeyF'), camera: this.was('KeyV'),
      reset: this.was('KeyR'), respawn: this.was('KeyT'), help: this.was('KeyH'), mute: this.was('KeyM'),
      assist: this.was('KeyL'), invert: this.was('KeyI'), click: this.was('Mouse0'), settings: this.was('KeyO'),
      airL: Math.max(k('KeyZ'), k('ArrowLeft')), airR: Math.max(k('KeyX'), k('ArrowRight')),
      slam: this.was('Space'),                  // the race's slam (the touch Slam button presses Space too)
      recenter: this.was('KeyU'),
      hudToggle: !!this.xr && this.was('KeyY'),
    };
    // gamepad (standard mapping)
    const p = standardGamepad();
    const id = p ? `${p.index}:${p.id}` : null;
    if (id !== this.padId) { this.padPrev = []; this.padId = id; this.pad = false; }
    if (p) {
      const dz = deadzone;
      const b = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const edge = (i) => b(i) > 0.5 && !(this.padPrev[i] > 0.5);
      s.roll += dz(p.axes[0] || 0);
      const vertical = dz(p.axes[1] || 0);
      s.pitch += dz(p.axes[this.xr ? 3 : 1] || 0); // in VR the right stick pitches; the left stick controls thrust
      s.yaw += dz(p.axes[2] || 0);
      s.throttleUp = Math.max(s.throttleUp, b(7));
      s.throttleDown = Math.max(s.throttleDown, b(6));
      if (this.xr) {
        // Direct analog thrust: releasing the stick / RT returns thrust to zero.
        // Keyboard W / S retain their throttle-lever behaviour.
        if (!k('KeyW') && !k('KeyS')) s.throttleAxis = Math.max(0, -vertical, b(7));
        s.throttleDown = Math.max(s.throttleDown, vertical);
      }
      s.boost = s.boost || b(0) > 0.5;
      s.climb = Math.max(s.climb, b(5));
      s.descend = Math.max(s.descend, b(4));
      s.airL = Math.max(s.airL, b(4)); s.airR = Math.max(s.airR, b(5));     // race: the bumpers are airbrakes
      s.slam = s.slam || edge(2);             // X: slam (or canopy with engines off)
      if (this.xr) s.hudToggle = s.hudToggle || edge(3); // Y: headset instruments; E still controls engines
      else s.engine = s.engine || edge(3);
      s.canopy = s.canopy || edge(2);
      s.camera = s.camera || edge(1);
      s.respawn = s.respawn || edge(10);       // left stick: recover to the track
      s.recenter = s.recenter || edge(11);     // right stick: also centre the seated XR view
      this.padPrev = p.buttons.map((x) => x.value);
      if (p.buttons.some((x) => x.value > 0.5) || [0, 1, 2, 3].some((i) => Math.abs(p.axes[i] || 0) > 0.5)) this.pad = true;
    } else this.padPrev = [];
    s.pad = !!this.pad;
    // touch: left stick steer / roll and pitch, right stick the throttle lever (up / down, as W / S) and the airbrakes
    const t = this.touch?.on && this.touch.state;
    if (t) {
      s.roll += t.lx;
      s.pitch -= t.ly;                          // pushed up: as the up arrow
      if (t.ry > 0.35 && Math.abs(t.rx) > 0.35) { s.throttleUp = 1; s.throttleDown = 1; }    // down and to a side: drift
      else {
        if (t.ry < -0.35) s.throttleUp = 1;
        if (t.ry > 0.35) s.throttleDown = 1;
        if (t.rx < -0.55) s.airL = 1;
        if (t.rx > 0.55) s.airR = 1;
      }
      s.boost = s.boost || t.boost;
    }
    // the airbrakes (keys, bumpers, the touch stick): a press fires one - on while held, a second at most - spending a
    // charge; a charge comes back three seconds after it was spent ("once every 3 seconds"). The ship holds
    // `airbrakes` of them (ships.js: the Anvil two - fired one after the other). Pressed a little early and held, one
    // fires the moment a charge is back; one held on past its second does not fire again until let go. airCharge: the
    // charges held over the most (the HUD's meter), airCharges: the most
    {
      const want = s.airL > 0.5 ? -1 : s.airR > 0.5 ? 1 : 0, N = this.airbrakes || 1;
      this.abC = Math.min(N, (this.abC ?? N) + dt / AIRBRAKE_WAIT);
      this.abT = (this.abT ?? AIRBRAKE_WAIT) + dt;
      if (!want) this.abSpent = false;
      if (this.abOn && (want !== this.abOn || this.abT > AIRBRAKE_HOLD)) { this.abOn = 0; if (want) this.abSpent = true; }
      else if (!this.abOn && want && !this.abSpent && this.abC >= 1) { this.abOn = want; this.abT = 0; this.abC -= 1; }
      s.airL = this.abOn < 0 ? 1 : 0; s.airR = this.abOn > 0 ? 1 : 0;
      s.airCharge = this.abC / N;
      s.airCharges = N;
    }
    if (this.invert) s.pitch = -s.pitch;
    s.pitch = clamp(s.pitch, -1, 1);
    s.roll = clamp(s.roll, -1, 1);
    s.yaw = clamp(s.yaw, -1, 1);
    s.drag = { ...this.drag };
    this.drag.dx = this.drag.dy = this.drag.wheel = 0;
    this.pressed.clear();
    return s;
  }
}
