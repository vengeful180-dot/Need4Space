// Settings (O): every look feature has a switch that changes the picture and costs what it costs; saved per browser.
import { VERSION } from './changelog.js';

const KEY = 'feather.settings.v4';
export const DEFAULTS = { ship: 'feather', tonemap: 'aces', ao: true, bloom: true, shadows: 'high', scale: 1, exposure: 0, fps: true,
  blur: true, reflections: true, streaks: true, ai: 'easy', music: 'high', sfx: 'high', aa: 'smaa', aoRes: 'auto',
  brakeLights: true, laptop: false, touch: 'auto', map: 'space', shafts: true, lensWater: true, iceSnow: true, iceDust: true, aurora: true,
  iceStorm: true, iceGeysers: true, wreckFx: true, wreckMist: true, airPitch: true, sandFx: true, dustDevils: true, heatHaze: true,
  sandstorm: true, caveFx: true, canyonAO: true, engineHeat: true, engineTrails: 'puffs', colossus: true, nozzleMotion: true, featherLivery: 'classic', cometLivery: 'titanium', heavyLivery: 'hazard', umbraLivery: 'umbra', pulseRings: true, sharpEdges: true, showroom: true,
  damage: true, shipBlast: true, slamCam: true, shockwaves: true, rivalMix: 'mixed',
  deckLight: true, hullShadows: true, engineFaces: 'dark', shipPaint: 'gloss', shipTrim: 'dark', shipAccents: true,
  seaLife: true, seaReflect: true, oceanStorm: true, shipWet: true, kraken: true, oceanRain: true, oceanPillars: true, xrScale: 0.8,
  pilots: true, slamNote: true, umbraAura: true, umbraTime: true, umbraArcs: true, pyrRuins: true, pyrTomb: true };
// Graphics quality presets ("low, which would be laptop, balanced in between, and high the actual default"): each sets
// the rows below at once; a row changed by hand afterwards shows the preset as Custom. Low is Laptop mode (quality.js:
// the lite shaders and fewer lights as well - tested on a Core Ultra 5 235U; the render scale stays at 100 %), High
// the defaults. Balanced keeps every material and light and most of the look, and halves the costly parts: MSAA 2x,
// AO at half resolution, medium shadows, no deck reflections, the heaviest weather left out.
const PRESET_KEYS = ['laptop', 'scale', 'aa', 'ao', 'aoRes', 'reflections', 'shadows', 'streaks', 'blur', 'shafts', 'iceSnow', 'iceDust',
  'iceGeysers', 'wreckFx', 'wreckMist', 'sandFx', 'dustDevils', 'heatHaze', 'caveFx', 'engineHeat', 'engineTrails', 'seaReflect',
  'shockwaves', 'showroom', 'umbraTime'];
export const PRESETS = {
  low: { laptop: true, scale: 1, aa: 'smaa1', ao: false, aoRes: 'auto', reflections: false, shadows: 'off', streaks: false, blur: false,
    shafts: false, iceSnow: false, iceDust: false, iceGeysers: false, wreckFx: false, wreckMist: false, sandFx: false, dustDevils: false,
    heatHaze: false, caveFx: false, engineHeat: false, engineTrails: 'ribbon', seaReflect: false, shockwaves: false, showroom: false, umbraTime: false },
  balanced: { laptop: false, scale: 1, aa: 'fast', ao: true, aoRes: 'half', reflections: false, shadows: 'medium', streaks: true, blur: true,
    shafts: true, iceSnow: true, iceDust: false, iceGeysers: true, wreckFx: true, wreckMist: false, sandFx: true, dustDevils: false,
    heatHaze: false, caveFx: true, engineHeat: true, engineTrails: 'puffs', seaReflect: true, shockwaves: true, showroom: true, umbraTime: true },
  high: Object.fromEntries(PRESET_KEYS.map((k) => [k, DEFAULTS[k]])),
};
// no row of their own any more: the race's mechanics and the ships' look as the game has them, for everyone, whatever
// was saved before; the costly ship effects (heat shimmer, trails, shockwaves, showroom) as the saved preset has them
const FIXED = ['damage', 'shipBlast', 'rivalMix', 'deckLight', 'hullShadows', 'engineFaces', 'shipPaint', 'shipTrim', 'shipAccents',
  'nozzleMotion', 'pulseRings', 'sharpEdges', 'brakeLights'];
const BY_PRESET = ['engineHeat', 'engineTrails', 'shockwaves', 'showroom'];
// which preset the rows match now (or 'custom')
export const presetOf = (v) => Object.keys(PRESETS).find((p) => PRESET_KEYS.every((k) => v[k] === PRESETS[p][k])) || 'custom';
// (AI difficulty: the rivals, race.js AI_LEVELS - Normal a fair fight, Hard close to a flawless lap, Brutal at it)
const ROWS = [
  ['quality', 'Graphics quality', [['low', 'Low (laptop)'], ['balanced', 'Balanced'], ['high', 'High'], ['custom', 'Custom']]],
  ['xrScale', 'VR race resolution', [[0.65, 'Performance (65%)'], [0.8, 'Balanced (80%)'], [1, 'Full (100%)']]],
  ['ai', 'AI difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['brutal', 'Brutal']]],
  ['slamCam', 'Slam camera (your slams in slow motion, seen from the side)', [[true, 'On'], [false, 'Off']]],
  ['slamNote', 'Slam ready notice', [[true, 'On'], [false, 'Off']]],
  ['airPitch', 'Nose control in the air', [[true, 'On'], [false, 'Off']]],
  ['pilots', 'Rival pilots (their faces and what they say)', [[true, 'On'], [false, 'Off']]],
  ['music', 'Music', [['off', 'Off'], ['low', 'Low'], ['mid', 'Medium'], ['high', 'High']]],
  // (not a setting: the song playing, skipped - main.js onAction)
  ['song', 'Song', [['prev', 'Previous'], ['next', 'Next song']]],
  ['sfx', 'Sound effects', [['low', 'Low'], ['mid', 'Medium'], ['high', 'High']]],
  ['touch', 'Touch controls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]],
  ['tonemap', 'Tone mapping', [['punchy', 'AgX Punchy'], ['agx', 'AgX Medium'], ['aces', 'ACES']]],
  ['exposure', 'Exposure', [[-1.5, '-1.5'], [-1, '-1'], [-0.5, '-0.5'], [0, '0'], [0.5, '+0.5']]],
  ['aa', 'Anti-aliasing', [['smaa1', 'SMAA'], ['msaa', 'MSAA 4x'], ['fast', 'MSAA 2x + SMAA'], ['smaa', 'MSAA 4x + SMAA'], ['high', 'MSAA 8x + SMAA']]],
  ['ao', 'Ambient occlusion', [[true, 'On'], [false, 'Off']]],
  ['aoRes', 'AO resolution', [['auto', 'Auto'], ['full', 'Full'], ['half', 'Half']]],
  ['canyonAO', 'Canyon shading (ice, desert; needs AO)', [[true, 'On'], [false, 'Off']]],
  ['bloom', 'Bloom', [[true, 'On'], [false, 'Off']]],
  ['reflections', 'Deck reflections (needs AO)', [[true, 'On'], [false, 'Off']]],
  ['streaks', 'Light streaks', [[true, 'On'], [false, 'Off']]],
  ['blur', 'Speed blur', [[true, 'On'], [false, 'Off']]],
  ['shafts', 'Light shafts (forest moon, ice planet, desert)', [[true, 'On'], [false, 'Off']]],
  ['iceSnow', 'Blowing snow', [[true, 'On'], [false, 'Off']]],
  ['iceDust', 'Diamond dust', [[true, 'On'], [false, 'Off']]],
  ['aurora', 'Aurora', [[true, 'On'], [false, 'Off']]],
  ['iceStorm', 'Storm and lightning', [[true, 'On'], [false, 'Off']]],
  ['iceGeysers', 'Steam geysers', [[true, 'On'], [false, 'Off']]],
  ['sandFx', 'Blowing sand and wakes', [[true, 'On'], [false, 'Off']]],
  ['dustDevils', 'Dust devils', [[true, 'On'], [false, 'Off']]],
  ['heatHaze', 'Heat shimmer', [[true, 'On'], [false, 'Off']]],
  ['sandstorm', 'Sandstorm', [[true, 'On'], [false, 'Off']]],
  ['lensWater', 'Water on the lens', [[true, 'On'], [false, 'Off']]],
  ['umbraAura', 'Umbra: dark aura and dark-matter boost', [[true, 'On'], [false, 'Off']]],
  ['umbraArcs', 'Umbra: lightning between the blades and the hull', [[true, 'On'], [false, 'Off']]],
  ['umbraTime', 'Umbra: time slowed round the engine on the boost', [[true, 'On'], [false, 'Off']]],
  ['pyrRuins', 'Ruins on the planet', [[true, 'On'], [false, 'Off']]],
  ['pyrTomb', "The tunnel's columns, monoliths and sandfalls", [[true, 'On'], [false, 'Off']]],
  ['colossus', 'Broken capital ship in the sky', [[true, 'On'], [false, 'Off']]],
  ['wreckFx', 'Derelict: sparks, flicker, drift, arcs', [[true, 'On'], [false, 'Off']]],
  ['wreckMist', 'Derelict: coolant mist, sun beams', [[true, 'On'], [false, 'Off']]],
  ['caveFx', 'Cave: daylight beams, spray, glowworms', [[true, 'On'], [false, 'Off']]],
  ['seaLife', 'Sea life: leaping fish, leviathans, birds, shoals', [[true, 'On'], [false, 'Off']]],
  ['seaReflect', 'Sea reflections', [[true, 'On'], [false, 'Off']]],
  ['oceanStorm', 'Lightning storm', [[true, 'On'], [false, 'Off']]],
  ['shipWet', 'Water running off the ships out of the sea', [[true, 'On'], [false, 'Off']]],
  ['kraken', 'The giant squid on its rock off the start', [[true, 'On'], [false, 'Off']]],
  ['oceanRain', 'Rain: streaks, splashes on the deck, rings on the sea', [[true, 'On'], [false, 'Off']]],
  ['oceanPillars', 'The alien pillars round the circuit', [[true, 'On'], [false, 'Off']]],
  ['shadows', 'Shadows', [['high', 'High'], ['medium', 'Medium'], ['off', 'Off']]],
  ['scale', 'Render scale', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']]],
  ['fps', 'FPS readout', [[true, 'On'], [false, 'Off']]],
];

// the Settings screen's sections: each a bar that opens and closes (General open on arrival), each circuit's own
// effects under that circuit's bar. A row not listed here lands in Picture.
const SECTIONS = [
  ['general', 'General', ['quality', 'xrScale', 'ai', 'pilots', 'slamCam', 'slamNote', 'airPitch', 'music', 'song', 'sfx', 'touch']],
  ['picture', 'Picture', ['tonemap', 'exposure', 'bloom', 'streaks', 'blur', 'shafts', 'lensWater', 'umbraAura', 'umbraArcs', 'umbraTime']],
  ['perf', 'Performance', ['scale', 'aa', 'shadows', 'ao', 'aoRes', 'canyonAO', 'reflections', 'fps']],
  ['space', 'Space', ['colossus', 'wreckFx', 'wreckMist']],
  ['forest', 'Forest moon', ['caveFx']],
  ['ice', 'Ice planet', ['iceSnow', 'iceDust', 'aurora', 'iceStorm', 'iceGeysers']],
  ['desert', 'Desert planet', ['sandFx', 'dustDevils', 'heatHaze', 'sandstorm']],
  ['ocean', 'Ocean planet', ['seaLife', 'seaReflect', 'oceanStorm', 'shipWet', 'kraken', 'oceanRain', 'oceanPillars']],
  ['pyramid', 'Pyramid Run', ['pyrRuins', 'pyrTomb']],
];
{
  const placed = new Set(SECTIONS.flatMap(([, , keys]) => keys));
  SECTIONS[1][2].push(...ROWS.map(([k]) => k).filter((k) => !placed.has(k)));
}
const FIRST_CIRCUIT = 'space';                       // (the circuits' bars from here on, under a "Circuits" heading)
const ROW = Object.fromEntries(ROWS.map((r) => [r[0], r]));
// the screen's lines in order: a section's bar, then its rows
const ITEMS = SECTIONS.flatMap(([id, label, keys]) => [{ id, label }, ...keys.map((k) => ({ id, row: ROW[k] }))]);

// the saved settings as they are (main.js reads Laptop mode before the ship loads)
export function savedSettings() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export class Settings {
  // integrated: the GPU looks built-in (quality.js) - a first visit starts on Low (Laptop mode)
  constructor(apply, integrated = false) {
    this.apply = apply;
    this.v = { ...DEFAULTS };
    let saved = null;
    try { saved = localStorage.getItem(KEY); Object.assign(this.v, JSON.parse(saved || '{}')); } catch { /* private window */ }
    if (!saved && integrated) Object.assign(this.v, PRESETS.low);
    // a preset saved before a row joined it: that row as the preset has it (a Low player stays on Low, not Custom
    // with a new effect on)
    try { const sv = JSON.parse(saved || '{}'); if (PRESETS[sv.quality]) for (const k of PRESET_KEYS) if (!(k in sv)) this.v[k] = PRESETS[sv.quality][k]; } catch { /* as it is */ }
    for (const k of FIXED) this.v[k] = DEFAULTS[k];
    try { const q = PRESETS[JSON.parse(saved || '{}').quality]; if (q) for (const k of BY_PRESET) this.v[k] = q[k]; } catch { /* as it is */ }
    delete this.v.beforeLaptop;                      // (what the old Laptop switch kept to restore: the presets do that now)
    this.v.quality = presetOf(this.v);
    // Normal is the default difficulty: a Hard saved before the player ever chose one goes back to it
    if (!this.v.aiPicked) this.v.ai = DEFAULTS.ai;
    // and the music's level High, unless one was chosen
    if (!this.v.musicPicked) this.v.music = DEFAULTS.music;
    delete this.v.drift; delete this.v.driftPicked;    // (drifting is no longer a setting: off)
    this.focus = 0;                                  // the line (ITEMS) the keyboard / gamepad is on
    this.opened = new Set(['general']);              // the sections open
    this.xrOK = false;                               // in a VR session (xr.js): the VR rows show
    this.onSet = null;                               // (k, value) after every change (menu.js: the difficulty accent)
    this.el = document.getElementById('settings');
    this.el.addEventListener('click', (e) => {
      const bar = e.target.closest('.s-bar');
      if (bar) { this.fold(bar.dataset.sec); return; }
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      this.focus = +b.closest('.srow').dataset.r;
      this.set(b.dataset.k, JSON.parse(b.dataset.v));
    });
    this.el.addEventListener('mousemove', (e) => {
      const row = e.target.closest('.srow');
      if (row && +row.dataset.r !== this.focus) { this.focus = +row.dataset.r; this.mark(); }
    });
    this.draw();
    apply(this.v);
  }

  set(k, val) {
    if (k === 'song') { this.onAction?.(k, val); return; }       // (an action, nothing kept)
    if (k === 'quality') { if (!PRESETS[val]) return; Object.assign(this.v, PRESETS[val]); }   // (Custom is only shown)
    this.v[k] = val;
    this.v.quality = presetOf(this.v);
    if (k === 'ai') this.v.aiPicked = true;
    if (k === 'music') this.v.musicPicked = true;
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* storage blocked */ }
    this.apply(this.v);
    this.draw();
    this.onSet?.(k, val);
  }

  get open() { return !this.el.classList.contains('hidden'); }

  toggle() { this.el.classList.toggle('hidden'); return this.open; }

  get focusKey() { const it = ITEMS[this.focus]; return it.row ? it.row[0] : 'section'; }

  hidden(k) { return k === 'xrScale' && !this.xrOK; }

  // a line on the screen: a section's bar always, a row while its section is open
  shown(i) { const it = ITEMS[i]; return !it.row || (this.opened.has(it.id) && !this.hidden(it.row[0])); }

  // a section opened or closed (toggled when `open` is left out); the focus goes to its bar
  fold(id, open = !this.opened.has(id)) {
    this.focus = ITEMS.findIndex((it) => it.id === id && !it.row);
    if (open === this.opened.has(id)) { this.mark(); return false; }
    if (open) this.opened.add(id); else this.opened.delete(id);
    this.draw();
    // its rows into view, the bar kept on screen
    const rows = this.el.querySelectorAll(`.srow[data-sec="${id}"]`);
    if (open) rows[rows.length - 1]?.scrollIntoView({ block: 'nearest' });
    this.el.querySelector('.srow.focus')?.scrollIntoView({ block: 'nearest' });
    return true;
  }

  setXR(ok) {
    if (this.xrOK === ok) return;
    this.xrOK = ok;
    if (!this.shown(this.focus)) this.focus = 0;
    this.draw();
  }

  // keyboard / gamepad: the next line up or down (past rows not shown); left / right the focused row's option one step,
  // or on a bar: right opens its section, left closes it (Enter / A toggles)
  move(d) {
    do this.focus = (this.focus + d + ITEMS.length) % ITEMS.length; while (!this.shown(this.focus));
    this.mark();
    this.el.querySelector('.srow.focus')?.scrollIntoView({ block: 'nearest' });
  }

  cycle(d, wrap = false) {
    const it = ITEMS[this.focus];
    if (!it.row) return wrap ? this.fold(it.id) : this.fold(it.id, d > 0);
    if (it.row[0] === 'song') { this.set('song', d < 0 ? 'prev' : 'next'); return true; }
    const [k, , all] = it.row, opts = all.filter(([val]) => val !== 'custom'), n = opts.length;
    const i = opts.findIndex(([val]) => val === this.v[k]);
    let j = i + d;
    if (wrap) j = (j + n) % n; else j = Math.max(0, Math.min(n - 1, j));
    if (j !== i) this.set(k, opts[j][0]);
    return j !== i;
  }

  mark() { this.el.querySelectorAll('.srow').forEach((r) => r.classList.toggle('focus', +r.dataset.r === this.focus)); }

  draw() {
    this.el.innerHTML = ITEMS.map((it, i) => {
      if (!this.shown(i)) return '';
      const focus = i === this.focus ? ' focus' : '';
      if (!it.row) {
        // a section's bar: its name (the circuit being raced marked), how many settings it holds
        const n = ITEMS.filter((x) => x.id === it.id && x.row && !this.hidden(x.row[0])).length;
        return (it.id === FIRST_CIRCUIT ? '<div class="s-group">Circuits</div>' : '') +
          `<div class="srow s-bar${this.opened.has(it.id) ? ' open' : ''}${focus}" data-r="${i}" data-sec="${it.id}"><span>${it.label}` +
          `${it.id === (this.circuit || this.v.map) ? '<em class="s-cur">Current circuit</em>' : ''}</span><b class="s-n">${n}</b></div>`;
      }
      const [k, label, all] = it.row, opts = all.filter(([val]) => val !== 'custom' || this.v.quality === 'custom');
      return `<div class="srow${focus}" data-r="${i}" data-sec="${it.id}"><span>${label}${k === 'xrScale' ? '<small class="s-help">Lower for smoother racing; higher for sharper scenery. Saved in this browser.</small>' : ''}${k === 'song' && this.songName ? `<small class="s-help">Now playing: ${this.songName}</small>` : ''}</span><div class="seg">${opts.map(([val, t]) =>
        `<button tabindex="-1" data-k="${k}" data-v='${JSON.stringify(val)}'${k === 'ai' ? ` data-lv="${val}"` : ''} class="${this.v[k] === val ? 'on' : ''}">${t}</button>`)
        .join('')}</div></div>`;
    }).join('') +
      // which version is running (tools/stamp.py; a phone can keep an old one a while after an update)
      `<div class="s-ver">Version ${VERSION} &middot; build ${document.querySelector('meta[name="build"]')?.content || 'dev'}</div>` +
      `<div class="s-ver">Credits: VR (WebXR) and Xbox controller support by Michael Sitarzewski</div>` +
      `<div class="s-ver">© 2026 vengeful180. All rights reserved.</div>`;
  }
}
