// Phones and tablets: a floating stick for the left thumb and buttons for the right, over the game, read by Input like a
// gamepad.
//  - left stick: steer (in the air: nose up / down; free flight: roll and pitch); pushed all the way to a side, that
//    side's airbrake
//  - right thumb: Thrust held - full throttle, let go - off (anywhere on the right half that is not another button);
//    Boost beside it (boosting keeps the thrust on: the thumb slides from Thrust onto Boost and back); Slam under Boost
//    (its ring the charge); Brake under Thrust, smaller
//  - pause, camera; Engines in free flight (where Slam is)
// The stick appears where the thumb lands in its half of the screen (a faint ring shows where it rests). The first tap
// asks for full screen in landscape where the browser allows it; held upright, the page asks to be turned.
// On by the setting (Auto / On / Off): Auto is a phone or tablet - a touch screen and a mobile browser - or, failing
// that, the first finger on the screen. (A Galaxy S24 Ultra's S Pen makes it report a fine pointer that hovers: the
// first test, "(hover: none) and (pointer: coarse)", took it for a desktop - no sticks.)
export const isTouch = () => {
  const ua = navigator.userAgent || '';
  const screenTouch = navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
  const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return (screenTouch && mobile) || matchMedia('(hover: none) and (pointer: coarse)').matches;
};

const DEAD = 0.12;
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not allowed here */ } };
const ICON = {
  thrust: '<svg viewBox="0 0 24 24"><path d="M12 3l7 7h-4.5v4h-5v-4H5z"/><path d="M9.5 16h5v2h-5zM9.5 19.5h5V21h-5z" opacity=".7"/></svg>',
  boost: '<svg viewBox="0 0 24 24"><path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6.2z"/></svg>',
  slam: '<svg viewBox="0 0 24 24"><path d="M3 12h9M8.5 7.5L13 12l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 5.5l1.6 3.4 3.4-.6-1.9 2.9 1.9 2.9-3.4-.6L16 18.5l-.6-3.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  brake: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="5" height="14" rx="1"/><rect x="14" y="5" width="5" height="14" rx="1"/></svg>',
};

export class TouchControls {
  constructor(input) {
    this.input = input;
    input.touch = this;
    this.state = { lx: 0, ly: 0, thrust: false, boost: false, brake: false };
    this.mode = null;
    this.on = false;
    this.pref = 'auto';
    this.auto = isTouch();
    const el = (this.el = document.createElement('div'));
    el.id = 'touch';
    el.innerHTML = `
      <div class="t-zone" data-side="l"><div class="t-stick"><i></i><b class="t-ar l"></b><b class="t-ar r"></b></div></div>
      <div class="t-pad"></div>
      <div class="t-btn t-thrust" aria-hidden="true">${ICON.thrust}<span>Thrust</span></div>
      <button class="t-btn t-boost" data-b="boost">${ICON.boost}<span>Boost</span></button>
      <button class="t-btn t-slam" data-b="Space">${ICON.slam}<span>Slam</span></button>
      <button class="t-btn t-brake" data-b="brake">${ICON.brake}<span>Brake</span></button>
      <button class="t-btn t-engine" data-b="KeyE"><span>Engines</span></button>
      <button class="t-btn t-small t-pause" data-b="pause" aria-label="Pause"><span class="t-bars"><i></i><i></i></span></button>
      <button class="t-btn t-small t-cam" data-b="KeyV" aria-label="Camera"><span>Cam</span></button>`;
    document.body.appendChild(el);
    const turn = document.createElement('div');
    turn.id = 'rotate';
    turn.innerHTML = '<div><div class="r-phone"></div><b>Turn your phone sideways</b><span>Need4Space plays in landscape</span></div>';
    document.body.appendChild(turn);
    this.stick(el.querySelector('.t-zone'));
    this.pad(el.querySelector('.t-pad'), el.querySelector('.t-thrust'), el.querySelector('.t-boost'));
    for (const b of el.querySelectorAll('button.t-btn')) this.button(b);
    // full screen and landscape on the first tap (a user gesture is needed; iPhones have no full screen for pages)
    let asked = false;
    const full = () => {
      const d = document.documentElement;
      if (asked || !this.on || document.fullscreenElement || !d.requestFullscreen) return;
      asked = true;
      d.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    };
    addEventListener('pointerup', full);
    // Auto: a finger on the screen is enough (whatever the browser said it was)
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && !this.auto) { this.auto = true; this.setPref(this.pref); }
    }, true);
    // no pinch or double-tap zoom (Safari ignores the viewport's user-scalable)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  // the left thumb's floating stick: its centre where the thumb lands, its reach 13 % of the screen's short side
  stick(zone) {
    const base = zone.querySelector('.t-stick'), knob = base.querySelector('i');
    let id = null, x0 = 0, y0 = 0;
    const reach = () => Math.min(innerWidth, innerHeight) * 0.13;
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - x0, dy = e.clientY - y0;
      const r = reach(), d = Math.hypot(dx, dy);
      if (d > r) { dx *= r / d; dy *= r / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.state.lx = dz(dx / r);
      this.state.ly = dz(dy / r);
      zone.classList.toggle('lock-l', this.state.lx < -0.85);
      zone.classList.toggle('lock-r', this.state.lx > 0.85);
    };
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      zone.classList.remove('on', 'lock-l', 'lock-r');
      knob.style.transform = base.style.left = base.style.top = '';
      this.state.lx = this.state.ly = 0;
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      try { zone.setPointerCapture(id); } catch { /* a pointer the browser no longer tracks */ }
      x0 = e.clientX; y0 = e.clientY;
      const rc = zone.getBoundingClientRect();
      base.style.left = `${x0 - rc.left}px`;
      base.style.top = `${y0 - rc.top}px`;
      zone.classList.add('on');
      move(e);
    });
    zone.addEventListener('pointermove', move);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, up);
  }

  // the right thumb's pad: held anywhere on it, thrust; slid onto Boost, boost too (and back off it, thrust alone)
  pad(pad, thrust, boost) {
    let id = null;
    const over = (e) => { const r = boost.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
    const move = (e) => {
      if (e.pointerId !== id) return;
      const b = over(e);
      if (b !== this.padBoost) { this.padBoost = b; this.state.boost = b || this.boostHeld; boost.classList.toggle('on', this.state.boost); }
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      try { pad.setPointerCapture(id); } catch { /* (as above) */ }
      this.state.thrust = true;
      thrust.classList.add('on');
      move(e);
    });
    pad.addEventListener('pointermove', move);
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.state.thrust = false;
      thrust.classList.remove('on');
      if (this.padBoost) { this.padBoost = false; this.state.boost = !!this.boostHeld; boost.classList.toggle('on', this.state.boost); }
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, up);
  }

  // Boost and Brake while held; pause as the Esc key (the menu's own path); the rest as their keys pressed this frame
  button(b) {
    const k = b.dataset.b;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('on');
      if (k === 'boost' || k === 'brake') {
        if (k === 'boost') this.boostHeld = this.state.boost = true; else this.state.brake = true;
        try { b.setPointerCapture(e.pointerId); } catch { /* (as above) */ }
      } else if (k === 'pause') dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
      else {
        this.input.pressed.add(k);
        if (k === 'Space') buzz(18);                   // (the slam: a knock in the hand)
      }
    });
    const up = () => {
      if (k === 'boost') { this.boostHeld = false; this.state.boost = !!this.padBoost; b.classList.toggle('on', this.state.boost); return; }
      b.classList.remove('on');
      if (k === 'brake') this.state.brake = false;
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
  }

  // the setting: 'auto' | 'on' | 'off'
  setPref(p) {
    this.pref = p || 'auto';
    const on = this.pref === 'on' || (this.pref === 'auto' && this.auto);
    if (on === this.on) return;
    this.on = on;
    document.body.classList.toggle('touch', on);
    if (!on) Object.assign(this.state, { lx: 0, ly: 0, thrust: false, brake: false });
    this.state.boost = this.boostHeld = this.padBoost = false;
  }

  // race or free flight (the Engines button is free flight's)
  setMode(m) { if (m !== this.mode) { this.mode = m; this.el.dataset.mode = m; } }
}
