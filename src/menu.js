// The menus: the title (Race / Circuit / Settings / Controls), the difficulty select, pause (Esc), settings,
// controls and the results' actions - by keyboard, mouse or gamepad. Behind the title a slow camera films the grid;
// into the race the camera swings round to the ship (a blend) instead of cutting.
// main.js calls: filter(inp) after reading the input (the menus keep the game's keys), camera(dt) after the rig, and
// reads `paused` (a paused frame ticks with dt = 0: no physics, nothing moves).
import * as THREE from 'three';
import { AI_LEVELS, LAPS, TEAMS } from './race.js';
import { controlsHTML, GAMEPAD, fmt } from './hud.js';
import { UPDATES, VERSION } from './changelog.js';
import { Scoreboard } from './scoreboard.js';
import { SHIPS, HANDLING, LIVERIES, shipName } from './ships.js';
import { standardGamepad } from './input.js';

const ui = (name) => window.__feather?.audio?.ui?.(name);
const wake = () => window.__feather?.audio?.start?.();          // audio needs a user gesture: any menu key or click
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
const pad2 = (i) => String(i + 1).padStart(2, '0');

// the rivals' classes (race.js AI_LEVELS); the stat bars come from the levels' own numbers
const LEVELS = [
  { id: 'easy', name: 'Easy', tag: 'Learn the tracks',
    desc: 'Slower rivals that give you room, and wall knocks cost you only a fifth of the speed.' },
  { id: 'normal', name: 'Normal', tag: 'A fair fight',
    desc: 'Rivals miss about half the boost pads, fire their boost at random and drift off the line. They never block you.' },
  { id: 'hard', name: 'Hard', tag: 'Sharp racecraft',
    desc: 'Every pad, boost spent where it pays, the fast line. They cover your way past.' },
  { id: 'brutal', name: 'Brutal', tag: 'Flawless',
    desc: 'The ideal line, every pad, perfect boost. They pass close, give way late and block you on every straight.' },
];
const IDS = LEVELS.map((l) => l.id);
// each ship's stat bars, from how it flies (ships.js HANDLING): the Feather at 6 of 10 on each, the others by how far
// their numbers stand from its - top speed (the pull over the drag), acceleration, boost, handling, toughness (its
// hull, and how little a knock costs it) and ramming (the damage it deals another ship)
const bars = (x) => Math.max(1, Math.min(10, Math.round(x)));
const shipStats = (H) => [
  ['Top speed', bars(6 + 50 * (Math.sqrt(H.thrust / H.drag) - 1))],
  ['Acceleration', bars(6 + 40 * (H.thrust - 1))],
  ['Boost', bars(6 + 20 * (H.boost - 1))],
  ['Handling', bars(6 + 40 * (H.turn - 1))],
  ['Toughness', bars(6 + 6 * (1 / H.impact - 1) + 8 * ((H.health || 100) / 100 - 1))],
  ['Ramming', bars(6 * (H.ram || 1))],
];
const statRows = (list) => list.map(([n, v]) => `<div class="d-stat"><span>${n}</span><b class="d-bar">${
  Array.from({ length: 10 }, (_, k) => `<i class="${k < v ? 'on' : ''}" style="--k:${k}"></i>`).join('')}</b></div>`).join('');
const stats = (L) => [
  ['Rival pace', L.speed],
  ['Aggression', L.aggression],
  ['Defence', L.defend],
  ['Pad use', L.pads],
  ['Racing line', clamp01(1 - (L.lane + L.wander) / 16)],
];

// ("remove the free flight option": the race on the track is the game)
const MAIN = [['race', 'Race'], ['circuit', 'Circuit'], ['ship', 'Ship'], ['scoreboard', 'Global scoreboard'], ['settings', 'Settings'], ['controls', 'Controls'], ['support', 'Support']];
// the circuits (main.js loads the one chosen: the page reloads into it)
export const CIRCUITS = [['space', 'Space', 'The orbital circuit over the ringed gas giant: a colossal broken derelict to thread, upside down through its hold, a meteorite to fly through, a glass tunnel, a loop'],
  ['forest', 'Forest moon', 'High over a jungle moon: floating islands, a river arching over the track, a colossal tree, two kilometres of caverns, a giant\'s skull, home upside down'],
  ['ice', 'Ice planet', 'Over a frozen sea at dusk, a storm in the east: a crevasse down an ice shelf, a glacier to fly through, two rifts to jump, upside down over the floes'],
  ['desert', 'Desert planet', 'Dunes at sunset: a half-buried city, a sandstorm, a sandstone gorge under natural bridges, a banked wall, a gravity flip'],
  ['ocean', 'Ocean planet', 'A world of sea at night under a great moon: sea stacks and spray, a dive into the deep through a drowned city, a surge back out of the water']];
// donations (the author's Revolut)
const DONATE_URL = 'https://revolut.me/alexan_vic', DONATE_HANDLE = '@alexan_vic';
const donate = () => window.open(DONATE_URL, '_blank', 'noopener');
const PAUSE = [['resume', 'Resume'], ['restart', 'Restart race'], ['difficulty', 'Difficulty'], ['scoreboard', 'Global scoreboard'], ['settings', 'Settings'],
  ['controls', 'Controls'], ['quit', 'Quit to menu']];
// a hint along the bottom: its keys and what they do, and clickable like the key ("can only go back pressing Esc"):
// act - one action for the whole hint, or one per key (the arrows)
const K = (keys, what, act) => {
  const one = typeof act === 'string';
  const key = (k, i) => (!one && act?.[i] ? `<kbd class="hk" data-key="${act[i]}">${k}</kbd>` : `<kbd>${k}</kbd>`);
  return `<span${one ? ` class="hk" data-key="${act}"` : ''}>${keys.map(key).join('')}${what}</span>`;
};
const UD = ['up', 'down'], LR = ['left', 'right'];
const HINTS = {
  main: K(['↑', '↓'], 'Select', UD) + K(['Enter'], 'Confirm', 'ok'),
  pause: K(['↑', '↓'], 'Select', UD) + K(['Enter'], 'Confirm', 'ok') + K(['Esc'], 'Resume', 'back'),
  diff: K(['←', '→'], 'Choose', LR) + K(['Enter'], 'Confirm', 'ok') + K(['Esc'], 'Back', 'back'),
  settings: K(['↑', '↓'], 'Option', UD) + K(['←', '→'], 'Change', LR) + K(['Esc'], 'Back', 'back'),
  controls: K(['Esc'], 'Back', 'back'),
  support: K(['Enter'], 'Donate on Revolut', 'ok') + K(['Esc'], 'Back', 'back'),
  circuit: K(['↑', '↓'], 'Select', UD) + K(['Enter'], 'Fly it', 'ok') + K(['Esc'], 'Back', 'back'),
  ship: K(['↑', '↓'], 'Select', UD) + K(['←', '→'], 'Paint', LR) + K(['Enter'], 'Confirm', 'ok') + K(['Esc'], 'Back', 'back'),
  scoreboard: K(['↑', '↓'], 'Circuit', UD) + K(['←', '→'], 'Difficulty', LR) + K(['R'], 'Refresh', 'refresh') + K(['Esc'], 'Back', 'back'),
  results: K(['←', '→'], 'Select', LR) + K(['Enter'], 'Confirm', 'ok') + K(['R'], 'Race again', 'again') + K(['Esc'], 'Main menu', 'back'),
};
const UP = new Set(['ArrowUp', 'KeyW']), DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']), RIGHT = new Set(['ArrowRight', 'KeyD']);
// the game's one-shot actions, held back while a menu is up (the analog inputs stay: profile.js drives through them)
const EDGES = ['engine', 'canopy', 'camera', 'reset', 'respawn', 'help', 'mute', 'assist', 'invert', 'click', 'settings', 'mode', 'slam'];

export class Menu {
  // h: { settings, hud, input, rig, camera, race, track, ship, world, startRace(), restart(), quit(),
  //      status(), mode(), engineOn(), focus() }
  constructor(h) {
    this.h = h;
    this.el = document.getElementById('menu');
    this.screen = null;            // the screen showing (null: in the game)
    this.ctx = null;               // 'title' | 'pause' | 'results'
    this.stack = [];
    this.sel = { main: 0, pause: 0, results: 0 };
    this.paused = false;
    this.busy = false;             // a veiled transition under way: input waits
    this.filming = false;          // the title camera
    this.bl = null;                // a camera blend under way
    this.pad = {};
    this.diffI = Math.max(0, IDS.indexOf(h.settings.v.ai));
    this.diffMode = 'start';
    this.build();
    this.board = new Scoreboard(this);
    this.setLevel(h.settings.v.ai, false);
    h.settings.onSet = (k, v) => { if (k === 'ai') { this.levelSet(v); this.board.difficultyChanged(v); } };
    h.hud.onResults = () => this.showResults();
    h.hud.onHideResults = () => { if (this.ctx === 'results' && !this.busy) this.resume(); };
    addEventListener('keydown', (e) => this.key(e), true);       // capture: before input.js sees the key
    this.el.addEventListener('pointermove', (e) => this.hover(e));
    this.el.addEventListener('click', (e) => this.click(e));
    // a pointer lock lost mid-game (Esc while steering by mouse, alt-tab) pauses - unless the game released it
    const unlock = h.input.unlock.bind(h.input);
    h.input.unlock = () => { this.ownUnlock = performance.now(); unlock(); };
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement || this.open || this.busy || performance.now() - (this.ownUnlock || 0) < 500) return;
      this.lockLost = performance.now();
      this.pause();
    });
  }

  get open() { return !!this.screen; }

  build() {
    const h = this.h;
    const map = h.map || 'space', mapName = CIRCUITS.find(([id]) => id === map)?.[1] || '';
    const shipId = h.shipId || 'feather';
    const item = ([act, name], i) => `<button class="m-item" data-act="${act}" tabindex="-1"><span class="m-num">${pad2(i)}</span>` +
      `<span class="m-name">${name}</span>${act === 'race' || act === 'difficulty' ? '<span class="m-meta m-lvl"></span>'
        : act === 'circuit' ? `<span class="m-meta">${mapName}</span>` : act === 'ship' ? `<span class="m-meta">${shipName(shipId)}</span>`
          : act === 'map:' + map || act === 'ship:' + shipId ? '<span class="m-meta">Now</span>' : ''}</button>`;
    // the Ship screen's rows: each ship with a chip per paint beside it ("make the skins ui better, people can barely
    // see it") - its two colours, the one it wears ringed and named; a chip paints the ship, the row itself picks it
    const chips = (id) => {
      const L = LIVERIES[id];
      return L ? `<span class="s-chips"><em></em>${L.names.map((n, k) => `<i data-act="paint:${id}:${n}" title="${L.labels[k]}" ` +
        `style="--a: ${L.colors[k][0]}; --b: ${L.colors[k][1]}"></i>`).join('')}</span>` : '';
    };
    const main = MAIN.filter(([a]) => a !== 'race' || h.race);
    const pause = PAUSE.filter(([a]) => a !== 'difficulty' || h.race);
    const cards = LEVELS.map((L, i) => `<div class="d-slot" data-i="${i}" data-id="${L.id}" style="--c: var(--c-${L.id})">
      <div class="d-glow"></div>
      <button class="d-card" tabindex="-1">
        <div class="d-top"><span class="d-num">${pad2(i)}</span><span class="d-pips">${[0, 1, 2].map((k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span></div>
        <div class="d-name">${L.name}</div>
        <div class="d-tag">${L.tag}</div>
        <p class="d-desc">${L.desc}</p>
        <div class="d-stats">${stats(AI_LEVELS[L.id]).map(([n, v]) => `<div class="d-stat"><span>${n}</span><b class="d-bar">${
          Array.from({ length: 10 }, (_, k) => `<i class="${k < Math.round(v * 10) ? 'on' : ''}" style="--k:${k}"></i>`).join('')}</b></div>`).join('')}</div>
        <div class="d-sweep"></div>
      </button></div>`).join('');
    const km = h.track ? (h.track.length / 1000).toFixed(1) : null;
    const U = UPDATES[0];                                // the latest update's notes on the title (changelog.js)
    const news = `<aside class="m-news"><div class="n-head"><span class="n-tag">What's new</span>` +
      `<span class="n-ver">v${U.version} &middot; ${U.date}</span></div><div class="n-name">${U.name}</div>` +
      `<ul class="n-list">${U.notes.map((n) => `<li>${n}</li>`).join('')}</ul></aside>`;
    this.el.innerHTML = `<div class="m-bg"></div><div class="m-fade"></div><div class="m-pulse"></div><div class="m-scan"></div>
      <section class="m-screen" data-s="main">
        <header><div class="m-kicker">Anti-gravity racing</div><h1 class="m-logo brand-logo" aria-label="Need4Space"><span class="brand-fallback" aria-hidden="true"><span>NEED</span><i>4</i><span>SPACE</span></span><svg class="brand-mark" viewBox="0 0 2172 440" aria-hidden="true" focusable="false"><use href="#brand-wordmark"/></svg></h1><div class="m-sub">${shipName(shipId)} <span class="m-v">v${VERSION}</span></div></header>
        <nav class="m-list">${main.map(item).join('')}</nav>
        <div class="m-desc"></div>
        ${news}
      </section>
      <section class="m-screen" data-s="diff">
        <div class="d-word" aria-hidden="true"></div>
        <header class="d-head"><div class="m-kicker">Choose your rivals</div><h2 class="m-h2">Difficulty</h2></header>
        <div class="d-body"><div class="d-cards">${cards}</div>
          <div class="d-foot"><button class="m-cta" data-act="confirm" tabindex="-1"><span class="d-go">Start race</span><kbd>Enter</kbd></button></div></div>
      </section>
      <section class="m-screen" data-s="circuit">
        <header><div class="m-kicker">Where to race</div><h2 class="m-h2">Circuit</h2></header>
        <nav class="m-list">${CIRCUITS.map(([id, name]) => ['map:' + id, name]).map(item).join('')}</nav>
        <div class="m-desc"></div>
      </section>
      <section class="m-screen" data-s="ship">
        <header><div class="m-kicker">What to fly</div><h2 class="m-h2">Ship</h2></header>
        <nav class="m-list">${SHIPS.map(([id, name], i) => item(['ship:' + id, name], i).replace(/<\/button>$/, chips(id) + '</button>')).join('')}</nav>
        <div class="m-desc"></div>
        <div class="d-stats s-stats"></div>
        <button class="s-fly" data-act="shipfly" tabindex="-1"><kbd>Enter</kbd><span class="s-fly-t">Confirm</span></button>
      </section>
      <section class="m-screen" data-s="settings">
        <header><div class="m-kicker">Options</div><h2 class="m-h2">Settings</h2></header>
        <div class="m-slot-settings"></div>
      </section>
      <section class="m-screen" data-s="controls">
        <header><div class="m-kicker"><span class="k-keys">Keyboard, mouse, gamepad</span><span class="k-touch">Touch</span></div><h2 class="m-h2">Controls</h2></header>
        <div class="c-touch">
          <div class="c-row"><span class="c-keys"><kbd>Left stick</kbd></span><span>Steer (in the air: nose up / down)</span></div>
          <div class="c-row"><span class="c-keys"><kbd>Right stick</kbd></span><span>Up: throttle - down: brake - sideways: airbrakes</span></div>
          <div class="c-row"><span class="c-keys"><kbd>Boost</kbd></span><span>Boost (orange pads on the track kick too)</span></div>
          <div class="c-row"><span class="c-keys"><kbd>Cam</kbd></span><span>Camera: chase, far, canopy, fly-by, orbit</span></div>
          <div class="c-row"><span class="c-keys"><kbd>II</kbd></span><span>Pause menu</span></div>
        </div>
        <div class="c-grid">${controlsHTML()}</div>
        <div class="c-pad"><b>Gamepad</b>${GAMEPAD}</div>
      </section>
      <section class="m-screen" data-s="support">
        <header><div class="m-kicker">Keep it flying</div><h2 class="m-h2">Support</h2></header>
        <div class="s-body">
          <p class="s-text">Need4Space is free to play. If you enjoy it, a donation helps keep new tracks, ships and music coming.</p>
          <button class="m-cta s-go" data-act="donate" tabindex="-1"><span>Donate on Revolut</span><kbd>Enter</kbd></button>
          <div class="s-handle">revolut.me/<b>alexan_vic</b></div>
          <p class="s-thanks">Thank you for flying.</p>
        </div>
      </section>
      <section class="m-screen" data-s="pause">
        <header><div class="m-kicker p-kicker">Race</div><h2 class="m-h2">Paused</h2><div class="p-status"></div></header>
        <nav class="m-list">${pause.map(item).join('')}</nav>
        <div class="m-desc"></div>
      </section>
      <section class="m-screen" data-s="results"><div class="m-slot-results"></div></section>
      <section class="m-screen" data-s="scoreboard"></section>
      <button class="m-back" data-act="back" tabindex="-1">Back</button>
      <footer class="m-foot"><div class="m-hints"></div>
        <div class="m-info">${km ? `Circuit ${km} km &middot; ${LAPS} laps &middot; ${TEAMS.length} ships` : ''}</div></footer>`;
    this.el.querySelector('.m-slot-settings').append(h.settings.el);
    this.el.querySelector('.m-slot-results').append(document.getElementById('results'));
    this.slots = [...this.el.querySelectorAll('.d-slot')];
    this.fadeEl = this.el.querySelector('.m-fade');
  }

  // ---------------------------------------------------------------- screens
  show(screen) {
    this.screen = screen;
    // A title-camera cut must not cover the race's pause or results screens.
    if (this.ctx !== 'title') {
      this.fadeEl.style.opacity = '0';
      this.fadeV = 0;
    }
    this.el.classList.toggle('on', !!screen);
    document.body.dataset.ui = screen ? this.ctx : 'game';
    this.h.settings.el.classList.toggle('hidden', screen !== 'settings');
    // (the Ship screen opens on the ship being flown)
    if (screen === 'ship' && this.sel.ship == null) this.sel.ship = Math.max(0, SHIPS.findIndex(([id]) => id === (this.h.shipId || 'feather')));
    this.h.showroom?.(screen === 'ship');
    this.board?.setOpen(screen === 'scoreboard');
    if (!screen) { document.getElementById('support-toast')?.classList.remove('on'); return; }   // (the last screen stays drawn while the menu fades out)
    this.el.dataset.ctx = this.ctx;
    this.el.dataset.depth = this.stack.length > 1 || (this.ctx === 'pause' && screen !== 'pause') ? 'sub' : 'top';   // (touch: a Back button)
    this.el.dataset.screen = screen;
    for (const s of this.el.querySelectorAll('.m-screen')) s.classList.toggle('active', s.dataset.s === screen);
    this.el.querySelector('.m-hints').innerHTML = HINTS[screen] || '';
    if (screen === 'diff') this.enterDiff();
    this.refresh();
  }

  go(screen, diffMode) {
    if (diffMode) this.diffMode = diffMode;
    this.stack.push(screen);
    this.show(screen);
  }

  showTitle() {
    Object.assign(this, { ctx: 'title', paused: false, stack: ['main'], filming: true, shotT: 0, shotI: 0, bl: null, rigWas: null });
    this.sel.main = 0;
    this.h.input.unlock();
    this.prepareShots();
    this.show('main');
    this.nudge('title');
  }

  // A quiet note about supporting the game: a few seconds into the title screen and after a race - once each per
  // session, never over a race; it closes itself (or with its x)
  nudge(where) {
    try { if (sessionStorage.getItem('n4s-nudge-' + where)) return; sessionStorage.setItem('n4s-nudge-' + where, '1'); } catch { /* storage blocked */ }
    clearTimeout(this.nudgeT);
    this.nudgeT = setTimeout(() => {
      if (this.ctx !== 'title' && this.ctx !== 'results') return;
      let t = document.getElementById('support-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'support-toast';
        t.className = 'm-toast';
        t.innerHTML = `<div class="t-text"><b>Enjoying Need4Space?</b><span>Support it on Revolut <em>${DONATE_HANDLE}</em></span></div>`
          + '<button class="t-go" type="button">Donate</button><button class="t-x" type="button" aria-label="Close">&times;</button>';
        document.body.append(t);
        t.querySelector('.t-x').onclick = () => t.classList.remove('on');
        t.querySelector('.t-go').onclick = () => { ui('select'); donate(); t.classList.remove('on'); };
      }
      t.classList.add('on');
      clearTimeout(this.nudgeHide);
      this.nudgeHide = setTimeout(() => t.classList.remove('on'), 12000);
    }, where === 'title' ? 6000 : 2500);
  }

  pause() {
    if (this.open || this.busy) return;
    Object.assign(this, { ctx: 'pause', paused: true, stack: ['pause'] });
    this.sel.pause = 0;
    this.h.input.unlock();
    this.renderPause();
    this.show('pause');
    ui('select');
  }

  // O in the game: the settings over the paused game (Esc or O goes straight back to it)
  openSettings() {
    if (this.open || this.busy) return;
    Object.assign(this, { ctx: 'pause', paused: true, stack: ['settings'] });
    this.h.input.unlock();
    this.renderPause();
    this.show('settings');
    ui('select');
  }

  resume() {
    Object.assign(this, { ctx: null, paused: false, stack: [] });
    this.show(null);
  }

  showResults() {
    if (this.ctx === 'title' || this.busy) return;
    Object.assign(this, { ctx: 'results', paused: false, stack: ['results'] });
    this.sel.results = 0;
    const rig = this.h.rig;                        // the fly-by camera behind the table while the AI flies the cool-down lap
    if (!this.rigWas) { this.rigWas = rig.mode; rig.mode = 'cinematic'; rig.anchor = null; }
    this.h.input.unlock();
    this.board.captureResult();
    this.show('results');
    this.nudge('results');
  }

  restoreRig() {
    if (!this.rigWas) return;
    this.h.rig.mode = this.rigWas;
    this.h.rig.anchor = null;
    this.rigWas = null;
  }

  // close the menu and do `fn` - under a dip to black where the camera would cut
  leave(fn, veil = true) {
    Object.assign(this, { ctx: null, stack: [] });
    this.show(null);
    if (!veil) { this.paused = false; this.filming = false; fn(); return; }
    this.busy = true;
    this.veil(() => { Object.assign(this, { paused: false, busy: false, filming: false }); fn(); });
  }

  fromResults(fn, veil = true) { this.restoreRig(); this.leave(fn, veil); }

  toTitle() {
    this.busy = true;
    this.rigWas = null;
    this.veil(() => { this.h.quit(); this.busy = false; this.showTitle(); });
  }

  // the race from the title: the menu fades, the camera swings from its shot round to the ship as the engines start
  startRace() {
    this.blend(2.2);
    Object.assign(this, { ctx: null, stack: [], paused: false, filming: false });
    this.show(null);
    this.h.startRace();
  }

  veil(fn) {
    const v = document.getElementById('veil');
    v.classList.add('on');
    setTimeout(() => { fn(); setTimeout(() => v.classList.remove('on'), 140); }, 260);
  }

  // ---------------------------------------------------------------- lists
  items() {
    const s = this.screen;
    if (s !== 'main' && s !== 'pause' && s !== 'results' && s !== 'circuit' && s !== 'ship') return [];
    const list = [...this.el.querySelectorAll(`.m-screen[data-s="${s}"] .m-item`)];
    // a finished race not yet saved: Save time first in the row, so Enter / A saves (or goes to the name)
    const save = s === 'results' && this.el.querySelector('#results .sb-save:not(:disabled)');
    return save ? [save, ...list] : list;
  }

  refresh() {
    const s = this.screen, items = this.items();
    if (!items.length) return;
    const i = Math.min(this.sel[s] || 0, items.length - 1);
    this.sel[s] = i;
    items.forEach((el, k) => el.classList.toggle('sel', k === i));
    if (s === 'ship') {
      const id = items[i].dataset.act.slice(5);
      this.h.showroom?.(true, id);
      const st = this.el.querySelector('.s-stats');
      if (st && st.dataset.id !== id) { st.dataset.id = id; st.innerHTML = statRows(shipStats(HANDLING[id] || HANDLING.feather)); retrigger(st, 'swap'); }
      // the confirm button: fly the ship on the stand (the one flown already: just back to the menu)
      const fly = this.el.querySelector('.s-fly-t'), now = id === (this.h.shipId || 'feather');
      const label = now ? `Keep the ${shipName(id)}` : `Fly the ${shipName(id)}`;
      if (fly && fly.textContent !== label) fly.textContent = label;
      // the paints: on every row, the one each ship wears ringed and named (left / right or a chip changes it; the
      // stand's ship takes it at once - main.js Ship.liveries)
      for (const it of items) {
        const k = it.dataset.act.slice(5), L = LIVERIES[k];
        if (!L) continue;
        const cur = L.names.includes(this.h.settings.v[L.key]) ? this.h.settings.v[L.key] : L.names[0];
        it.querySelectorAll('.s-chips i').forEach((c) => c.classList.toggle('on', c.dataset.act.endsWith(':' + cur)));
        const em = it.querySelector('.s-chips em'), label = L.labels[L.names.indexOf(cur)];
        if (em && em.textContent !== label) em.textContent = label;
      }
    }
    const d = this.el.querySelector(`.m-screen[data-s="${s}"] .m-desc`);
    if (d) {
      const t = this.describe(items[i].dataset.act);
      if (d.textContent !== t) { d.textContent = t; retrigger(d, 'swap'); }
    }
  }

  describe(a) {
    const free = this.h.mode() === 'free', km = this.h.track ? `${(this.h.track.length / 1000).toFixed(1)} km ` : '';
    return {
      race: `${LAPS} laps against ${TEAMS.length - 1} rivals on the ${km}circuit`,
      settings: 'Picture, effects, audio and performance',
      controls: 'Keyboard, mouse and gamepad',
      support: 'Donate to keep Need4Space flying',
      circuit: 'Space, the forest moon, the ice planet or the desert planet',
      ship: 'The Feather S1, the Comet R1 or the Anvil H1 - look them over in the showroom',
      scoreboard: 'The global top 10 for each circuit and difficulty',
      ...Object.fromEntries(CIRCUITS.map(([id, , d]) => ['map:' + id, d])),
      ...Object.fromEntries(SHIPS.map(([id, , d]) => ['ship:' + id, d])),
      resume: free ? 'Back to free flight' : 'Back to the race',
      restart: free ? 'Back over the start line' : 'Back to the grid and the lights',
      difficulty: 'The rivals’ pace and racecraft, changed at once',
      quit: 'Leave for the title screen',
    }[a] || '';
  }

  renderPause() {
    const st = this.h.status(), sec = this.el.querySelector('.m-screen[data-s="pause"]'), r = st.race;
    sec.querySelector('.p-kicker').textContent = r ? 'Race' : 'Free flight';
    let chips = '';
    if (r) {
      chips = `<span>Lap <b>${r.lap}/${r.laps}</b></span><span>Pos <b>${r.pos}/${r.total}</b></span>` +
        (Number.isFinite(r.time) ? `<span>Time <b>${fmt(r.time)}</b></span>` : `<span>${r.state === 'countdown' ? 'Lights' : 'On the grid'}</span>`);
    }
    if (this.h.race) chips += `<span class="lv">${LEVELS[IDS.indexOf(this.h.settings.v.ai)]?.name || ''}</span>`;
    sec.querySelector('.p-status').innerHTML = chips;
    const rs = sec.querySelector('[data-act="restart"] .m-name');
    if (rs) rs.textContent = r ? 'Restart race' : 'Back to start';
  }

  // ---------------------------------------------------------------- input
  key(e) {
    const c = e.code;
    if (!this.open) {
      if (this.busy) { e.stopImmediatePropagation(); return; }
      if ((c === 'Escape' || c === 'KeyP') && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); wake(); this.pause(); }
      return;
    }
    e.stopImmediatePropagation();                  // the menu has the keyboard (key-ups still reach the game: no stuck keys)
    if (e.target.matches('input, select, textarea')) {
      if (c === 'Escape') { e.preventDefault(); e.target.blur(); this.back(); }
      return;
    }
    if (this.busy) return;
    if (e.target.matches('.sb-tabs button, .sb-btn') && ['Enter', 'NumpadEnter', 'Space'].includes(c)) {
      e.preventDefault();
      if (!e.repeat) e.target.click();
      return;
    }
    wake();
    if (c === 'Escape' && performance.now() - (this.lockLost || 0) < 400) { e.preventDefault(); return; }   // the Esc that freed the mouse
    const dir = UP.has(c) ? -1 : DOWN.has(c) ? 1 : LEFT.has(c) ? -2 : RIGHT.has(c) ? 2 : 0;
    let used = true;
    if (dir) this.nav(dir);
    else if (e.repeat) used = ['Enter', 'NumpadEnter', 'Space', 'Escape', 'Backspace'].includes(c);
    else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') this.ok();
    else if (c === 'Escape' || c === 'Backspace') this.back();
    else if (c === 'KeyO') this.toggle('settings');
    else if (c === 'KeyH') this.toggle('controls');
    else if (this.screen === 'results' && c === 'KeyR') this.act('again');
    else if (this.screen === 'scoreboard' && c === 'KeyR') this.board.refresh();
    else used = false;
    if (used) e.preventDefault();
  }

  // gamepad in the menus (d-pad or left stick, A, B; Menu / View pause)
  filter(inp, interactive = true) {
    const p = standardGamepad();
    const id = p ? `${p.index}:${p.id}` : null;
    if (id !== this.padId) { this.pad = {}; this.padId = id; }
    let ev = null;
    if (p) {
      const b = (i) => (p.buttons[i]?.value || 0) > 0.5, ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const now = { up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, a: b(0), b: b(1), view: b(8) || b(9) };
      ev = {};
      for (const k in now) ev[k] = now[k] && !this.pad[k];
      this.pad = now;
    }
    if (!interactive) return inp; // retain button edges while XR prepares, without starting a race behind its loading panel
    if (this.open || this.busy) {
      for (const k of EDGES) inp[k] = false;
      if (ev && this.open && !this.busy && Object.values(ev).some(Boolean)) {
        wake();
        if (ev.up) this.nav(-1); else if (ev.down) this.nav(1); else if (ev.left) this.nav(-2); else if (ev.right) this.nav(2);
        else if (ev.a) this.ok(); else if (ev.b || ev.view) this.back();
      }
    } else if (ev?.view) {
      this.pause();
      for (const k of EDGES) inp[k] = false;
    }
    return inp;
  }

  hover(e) {
    const it = e.target.closest('.m-item');
    if (!it || this.busy || this.screen === 'ship') return;     // (the Ship screen: a ship is put on the stand by a click)
    const i = this.items().indexOf(it);
    if (i >= 0 && i !== (this.sel[this.screen] || 0)) { this.sel[this.screen] = i; this.refresh(); ui('move'); }
  }

  click(e) {
    if (this.busy || !this.open) return;
    wake();
    const hk = e.target.closest('[data-key]');               // a hint along the bottom, clicked: as its key
    if (hk) { this.press(hk.dataset.key); return; }
    const slot = e.target.closest('.d-slot');
    if (slot) { const i = +slot.dataset.i; if (i === this.diffI) this.confirmDiff(); else this.pick(i); return; }
    const b = e.target.closest('[data-act]');
    // the Ship screen: a row clicked puts that ship on the stand (a second click by mistake, reaching for its paints,
    // no longer flies it - "make it so you really have to press enter or a confirm button")
    if (b && this.screen === 'ship' && b.dataset.act.startsWith('ship:')) { this.pickShip(this.items().indexOf(b)); return; }
    if (b) this.act(b.dataset.act);
    else if (e.target.closest('button[data-k]') && !e.target.closest('[data-lv]')) ui('move');
  }

  // the Ship screen: ship i on the stand (its stats, its paints), chosen - not yet flown
  pickShip(i) {
    if (i < 0 || i === (this.sel.ship || 0)) return;
    this.sel.ship = i;
    this.refresh();
    ui('move');
  }

  press(k) {
    if (k === 'back') this.back();
    else if (k === 'ok') this.ok();
    else if (k === 'again') this.act('again');
    else if (k === 'refresh') this.board.refresh();
    else this.nav({ up: -1, down: 1, left: -2, right: 2 }[k] || 0);
  }

  nav(dir) {
    const s = this.screen, d = Math.sign(dir), vert = Math.abs(dir) === 1;
    if (s === 'scoreboard') { this.board.nav(dir); return; }
    if (s === 'diff') { this.pick(this.diffI + d); return; }
    if (s === 'settings') {
      if (vert) { this.h.settings.move(d); ui('move'); } else if (this.h.settings.cycle(d) && this.h.settings.focusKey !== 'ai') ui('move');
      return;
    }
    if (s === 'ship' && !vert) { this.paint(d); return; }
    if (s === 'controls' || (!vert && s !== 'results')) return;
    const n = this.items().length;
    if (!n) return;
    this.sel[s] = ((this.sel[s] || 0) + d + n) % n;
    this.refresh();
    ui('move');
  }

  // the Ship screen's paint: the selected ship's next livery (d), or the one named
  paint(d, name) {
    const id = this.items()[this.sel.ship || 0]?.dataset.act.slice(5), L = LIVERIES[id];
    if (!L) return;
    const n = L.names.length, i = Math.max(0, L.names.indexOf(this.h.settings.v[L.key]));
    const next = name || L.names[(i + d + n) % n];
    if (!L.names.includes(next) || next === L.names[i]) return;
    this.h.settings.set(L.key, next);
    this.refresh();
    ui('move');
  }

  ok() {
    const s = this.screen;
    if (s === 'scoreboard') { if (!this.board.saveFromMenu()) this.board.refresh(); return; }
    if (s === 'diff') { this.confirmDiff(); return; }
    if (s === 'settings') {
      if (this.h.settings.focusKey === 'ai') { ui('select'); this.go('diff', 'apply'); } else if (this.h.settings.cycle(1, true)) ui('move');
      return;
    }
    if (s === 'controls') { this.back(); return; }
    if (s === 'support') { this.act('donate'); return; }
    const it = this.items()[this.sel[s] || 0];
    if (it?.classList.contains('sb-save')) this.board.saveFromMenu();
    else if (it) this.act(it.dataset.act);
  }

  back(silent) {
    if (this.ctx === 'title' && this.stack.length <= 1) return;     // the title's own list: nothing behind it
    if (!silent) ui('back');
    if (this.screen === 'diff') {                  // backing out of the select: the accent returns to the level in force
      const v = this.h.settings.v.ai;
      if (IDS[this.diffI] !== v) { const was = this.diffI; this.diffI = IDS.indexOf(v); this.setLevel(v, true, Math.sign(this.diffI - was)); }
    }
    if (this.stack.length > 1) { this.stack.pop(); this.show(this.stack[this.stack.length - 1]); return; }
    if (this.ctx === 'pause') this.resume();
    else if (this.ctx === 'results') this.act('menu');
  }

  // O and H inside the menus: open that screen, or close it again
  toggle(name) {
    if (this.screen === name) { this.back(); return; }
    if (this.screen === 'diff') return;
    if (this.screen === 'settings' || this.screen === 'controls') this.stack.pop();
    ui('select');
    this.go(name);
  }

  act(a) {
    const h = this.h;
    switch (a) {
      case 'race': ui('select'); this.go('diff', 'start'); break;
      case 'settings': case 'controls': case 'support': case 'circuit': case 'ship': case 'scoreboard': ui('select'); this.go(a); break;
      case 'donate': ui('select'); donate(); break;
      case 'difficulty': ui('select'); this.go('diff', this.ctx === 'results' ? 'restart' : 'apply'); break;
      case 'confirm': this.confirmDiff(); break;
      case 'shipfly': { const it = this.items()[this.sel.ship || 0]; if (it) this.act(it.dataset.act); break; }
      case 'resume': ui('select'); this.resume(); break;
      case 'restart': ui('select'); this.leave(() => h.restart()); break;
      case 'again': ui('select'); this.fromResults(() => h.restart()); break;
      case 'quit': case 'menu': ui('back'); this.toTitle(); break;
      case 'back': this.back(); break;
      default:
        if (a.startsWith('map:')) {                 // another circuit: saved, and the page reloads into it
          const id = a.slice(4);
          ui('select');
          if (id === (h.map || 'space')) { this.back(true); break; }
          h.settings.set('map', id);
          this.busy = true;
          document.getElementById('veil').classList.add('on');
          const u = new URL(location.href);
          u.searchParams.delete('map');
          setTimeout(() => location.replace(u.href), 300);
        } else if (a.startsWith('paint:')) {          // a chip: that ship on the stand, in that paint
          const [, id, name] = a.split(':'), i = this.items().findIndex((el) => el.dataset.act === 'ship:' + id);
          this.pickShip(i);
          this.paint(0, name);
        } else if (a.startsWith('ship:')) {         // another ship: saved, and the page reloads into it
          // (picked: straight back out - the one flown already: back to the menu at once)
          const id = a.slice(5);
          ui('select');
          if (id === (h.shipId || 'feather')) { this.back(true); break; }
          h.settings.set('ship', id);
          this.busy = true;
          document.getElementById('veil').classList.add('on');
          const u = new URL(location.href);
          u.searchParams.delete('ship');
          setTimeout(() => location.replace(u.href), 300);
        }
    }
  }

  // ---------------------------------------------------------------- difficulty
  enterDiff() {
    this.diffI = Math.max(0, IDS.indexOf(this.h.settings.v.ai));
    this.markCards(false);
    const w = this.el.querySelector('.d-word');
    w.innerHTML = `<span>${LEVELS[this.diffI].name}</span>`;
    this.el.querySelector('.d-go').textContent = { start: 'Start race', apply: 'Apply', restart: 'Race again' }[this.diffMode];
  }

  markCards(sweep) {
    this.slots.forEach((s, k) => s.classList.toggle('sel', k === this.diffI));
    if (sweep) retrigger(this.slots[this.diffI], 'swept');
  }

  // a card picked (not yet confirmed): the whole menu takes its colour
  pick(i) {
    i = Math.max(0, Math.min(LEVELS.length - 1, i));
    if (i === this.diffI) return;
    const dir = Math.sign(i - this.diffI);
    this.diffI = i;
    this.markCards(true);
    this.setLevel(IDS[i], true, dir);
  }

  confirmDiff() {
    const id = IDS[this.diffI];
    ui('select');
    this.h.settings.set('ai', id);                 // (records aiPicked; race.setDifficulty through the settings' apply)
    if (this.diffMode === 'start') this.startRace();
    else if (this.diffMode === 'restart') this.fromResults(() => this.h.restart());
    else this.back(true);
  }

  // the settings changed the AI level (here, or the Settings row)
  levelSet(v) {
    this.diffI = Math.max(0, IDS.indexOf(v));
    if (this.screen === 'diff') this.markCards(false);
    this.setLevel(v, this.open);
  }

  // the accent colour (html[data-level], animated in ui.css) and the flourish: an edge pulse in the new colour, the
  // big word sliding through, for Brutal a glitch (RGB split, shake, scanlines)
  setLevel(id, fx = true, dir = 1) {
    const root = document.documentElement, prev = root.dataset.level;
    root.dataset.level = id;
    const icon = document.getElementById('game-icon'), iconLevel = IDS.includes(id) ? id : 'normal';
    if (icon && icon.dataset.level !== iconLevel) {
      icon.dataset.level = iconLevel;
      icon.setAttribute('href', `assets/ui/need4space-v1/icon-${iconLevel}.svg`);
    }
    const name = LEVELS[IDS.indexOf(id)]?.name || id;
    this.el.querySelectorAll('.m-lvl').forEach((e) => (e.textContent = name));
    if (!fx || prev === id) return;
    retrigger(this.el.querySelector('.m-pulse'), 'go');
    this.word(name, dir);
    clearTimeout(this.glitchT);
    this.el.classList.remove('glitch');
    if (id === 'brutal') {
      void this.el.offsetWidth;
      this.el.classList.add('glitch');
      this.glitchT = setTimeout(() => this.el.classList.remove('glitch'), 650);
    }
    ui('difficulty');
  }

  word(name, dir) {
    const w = this.el.querySelector('.d-word');
    for (const s of w.querySelectorAll('span:not(.out)')) {
      s.classList.add('out');
      if (dir < 0) s.classList.add('to-r');
      setTimeout(() => s.remove(), 600);
    }
    const s = document.createElement('span');
    s.textContent = name;
    if (dir < 0) s.className = 'from-l';
    w.append(s);
  }

  // ---------------------------------------------------------------- cameras
  // the title's shots of the grid, in the start line's frame (R right, U up, T along the track)
  prepareShots() {
    const h = this.h, race = h.race;
    const P = (race ? race.player.racer.pos : h.ship.root.position).clone();
    const C = P.clone(), R = new THREE.Vector3(1, 0, 0), U = new THREE.Vector3(0, 1, 0), T = new THREE.Vector3(0, 0, -1);
    if (race && h.track) {
      C.set(0, 0, 0);
      for (const e of race.entries) C.add(e.racer.pos);
      C.divideScalar(race.entries.length);
      const i = h.track.start;
      R.copy(h.track.R[i]); U.copy(h.track.U[i]); T.copy(h.track.T[i]);
    } else {
      T.set(0, 0, -1).applyQuaternion(h.ship.root.quaternion).setY(0).normalize();
      R.crossVectors(T, U).normalize();
    }
    const at = (o, x, y, z) => o.clone().addScaledVector(R, x).addScaledVector(U, y).addScaledVector(T, z);
    this.up = U;
    this.shots = [
      // high and wide round the whole grid
      { dur: 16, at: (u) => { const a = 0.5 + 0.55 * u; return { pos: at(C, Math.sin(a) * 82, 21 + 5 * u, Math.cos(a) * 82), look: at(C, 0, 0, -8), fov: 36 }; } },
      // the player's ship from above its nose (the ship ahead is 30 m up the grid: the camera stays clear of it)
      { dur: 13, at: (u) => ({ pos: at(P, -4 + 7 * u, 3.4 + 1.2 * u, 16.5 - 2 * u), look: at(P, 0, 0.6, -1.5), fov: 40 }) },
      // from behind the grid down the straight
      { dur: 13, at: (u) => ({ pos: at(C, -6 + 12 * u, 5.5, -74 + 16 * u), look: at(C, 0, 1.5, 60), fov: 34 }) },
      // a crane along the side of the grid, over the barrier
      { dur: 14, at: (u) => ({ pos: at(C, -48, 20 + 6 * u, 34 - 60 * u), look: at(C, -2, 0, 22 - 50 * u), fov: 36 }) },
    ];
  }

  film(dt) {
    const S = this.shots, cam = this.h.camera;
    if (!S) return;
    this.shotT += dt;
    while (this.shotT > S[this.shotI].dur) { this.shotT -= S[this.shotI].dur; this.shotI = (this.shotI + 1) % S.length; }
    const sh = S[this.shotI], v = sh.at(this.shotT / sh.dur);
    const g = this.h.world?.surface?.(v.pos.x, v.pos.z);            // (the meadow's hills; space has no ground)
    if (g > -1e8 && v.pos.y < g + 2) v.pos.y = g + 2;
    cam.position.copy(v.pos);
    cam.up.copy(this.up);
    cam.lookAt(v.look);
    // the subject right of centre, clear of the menu on the left (the difficulty cards sit in the middle)
    const side = this.screen === 'main' || this.screen === 'settings' || this.screen === 'controls' || this.screen === 'support' || this.screen === 'circuit' || this.screen === 'ship' ? 1 : 0;
    this.offK = (this.offK ?? side) + (side - (this.offK ?? side)) * (1 - Math.exp(-3 * dt));
    cam.rotateY(THREE.MathUtils.degToRad(v.fov * cam.aspect * 0.16 * this.offK));
    cam.fov = v.fov;
    cam.updateProjectionMatrix();
    // a dip to black across each cut
    const edge = Math.min(this.shotT, sh.dur - this.shotT);
    const f = edge < 0.6 ? 1 - ease(edge / 0.6) : 0;
    if (Math.abs(f - (this.fadeV ?? -1)) > 0.004 || (f === 0 && this.fadeV !== 0)) { this.fadeEl.style.opacity = f.toFixed(3); this.fadeV = f; }
  }

  // from the camera's pose now to wherever the rig takes it, over `secs`: round the ship (the offset's direction turns,
  // its length eases) rather than through it
  blend(secs = 1.2) {
    const c = this.h.camera;
    this.bl = { t: 0, dur: secs, pos: c.position.clone(), q: c.quaternion.clone(), fov: c.fov };
  }

  camera(dt) {
    const cam = this.h.camera;
    if (this.filming) {
      // the engines started by something else (profile.js's gridView, scenario): the title steps aside
      if (this.ctx === 'title' && !this.busy && this.h.engineOn()) { this.filming = false; this.resume(); return; }
      this.film(dt);
      return;
    }
    const b = this.bl;
    if (!b) return;
    b.t += dt;
    const k = ease(Math.min(1, b.t / b.dur)), F = this.h.focus();
    const a = b.pos.clone().sub(F), z = cam.position.clone().sub(F), la = a.length() || 1, lz = z.length() || 1;
    const turn = new THREE.Quaternion().setFromUnitVectors(a.divideScalar(la), z.divideScalar(lz));
    a.applyQuaternion(new THREE.Quaternion().slerp(turn, k));
    cam.position.copy(F).addScaledVector(a, la + (lz - la) * k);
    cam.quaternion.copy(b.q.clone().slerp(cam.quaternion, k));
    cam.fov = b.fov + (cam.fov - b.fov) * k;
    cam.updateProjectionMatrix();
    if (b.t >= b.dur) this.bl = null;
  }
}
