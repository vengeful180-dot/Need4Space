// Settings (O): every look feature has a switch that changes the picture and costs what it costs; saved per browser.
import { VERSION } from './changelog.js';
import { LIVERIES, shipName } from './ships.js';

const KEY = 'feather.settings.v4';
export const DEFAULTS = { ship: 'feather', tonemap: 'aces', ao: true, bloom: true, shadows: 'high', scale: 1, exposure: 0, fps: true,
  blur: true, reflections: true, streaks: true, ai: 'easy', music: 'high', sfx: 'high', aa: 'smaa', aoRes: 'auto',
  brakeLights: true, laptop: false, touch: 'auto', map: 'space', shafts: true, lensWater: true, iceSnow: true, iceDust: true, aurora: true,
  iceStorm: true, iceGeysers: true, wreckFx: true, wreckMist: true, airPitch: true, sandFx: true, dustDevils: true, heatHaze: true,
  sandstorm: true, caveFx: true, canyonAO: true, engineHeat: true, engineTrails: 'puffs', colossus: true, nozzleMotion: true, featherLivery: 'classic', cometLivery: 'titanium', heavyLivery: 'hazard', pulseRings: true, sharpEdges: true, showroom: true,
  damage: true, shipBlast: true, slamCam: true, shockwaves: true, rivalMix: 'mixed',
  deckLight: true, hullShadows: true, engineFaces: 'dark', shipPaint: 'gloss', shipTrim: 'dark', shipAccents: true,
  seaLife: true, seaReflect: true, oceanStorm: true, shipWet: true, kraken: true, oceanRain: true, oceanPillars: true, xrScale: 0.8 };
// Graphics quality presets ("low, which would be laptop, balanced in between, and high the actual default"): each sets
// the rows below at once; a row changed by hand afterwards shows the preset as Custom. Low is Laptop mode (quality.js:
// the lite shaders and fewer lights as well - tested on a Core Ultra 5 235U; the render scale stays at 100 %), High
// the defaults. Balanced keeps every material and light and most of the look, and halves the costly parts: MSAA 2x,
// AO at half resolution, medium shadows, no deck reflections, the heaviest weather left out.
const PRESET_KEYS = ['laptop', 'scale', 'aa', 'ao', 'aoRes', 'reflections', 'shadows', 'streaks', 'blur', 'shafts', 'iceSnow', 'iceDust',
  'iceGeysers', 'wreckFx', 'wreckMist', 'sandFx', 'dustDevils', 'heatHaze', 'caveFx', 'engineHeat', 'engineTrails', 'seaReflect'];
export const PRESETS = {
  low: { laptop: true, scale: 1, aa: 'smaa1', ao: false, aoRes: 'auto', reflections: false, shadows: 'off', streaks: false, blur: false,
    shafts: false, iceSnow: false, iceDust: false, iceGeysers: false, wreckFx: false, wreckMist: false, sandFx: false, dustDevils: false,
    heatHaze: false, caveFx: false, engineHeat: false, engineTrails: 'ribbon', seaReflect: false },
  balanced: { laptop: false, scale: 1, aa: 'fast', ao: true, aoRes: 'half', reflections: false, shadows: 'medium', streaks: true, blur: true,
    shafts: true, iceSnow: true, iceDust: false, iceGeysers: true, wreckFx: true, wreckMist: false, sandFx: true, dustDevils: false,
    heatHaze: false, caveFx: true, engineHeat: true, engineTrails: 'puffs', seaReflect: true },
  high: Object.fromEntries(PRESET_KEYS.map((k) => [k, DEFAULTS[k]])),
};
// which preset the rows match now (or 'custom')
export const presetOf = (v) => Object.keys(PRESETS).find((p) => PRESET_KEYS.every((k) => v[k] === PRESETS[p][k])) || 'custom';
// (AI difficulty: the rivals, race.js AI_LEVELS - Normal a fair fight, Hard close to a flawless lap, Brutal at it)
const ROWS = [
  ['quality', 'Graphics quality', [['low', 'Low (laptop)'], ['balanced', 'Balanced'], ['high', 'High'], ['custom', 'Custom']]],
  ['xrScale', 'VR race resolution', [[0.65, 'Performance (65%)'], [0.8, 'Balanced (80%)'], [1, 'Full (100%)']]],
  ['ai', 'AI difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['brutal', 'Brutal']]],
  ['damage', 'Ship damage (hulls wear down, a wreck resets)', [[true, 'On'], [false, 'Off']]],
  ['shipBlast', 'Ship explosions (a hull destroyed blows up)', [[true, 'On'], [false, 'Off']]],
  ['slamCam', 'Slam camera (your slams in slow motion, seen from the side)', [[true, 'On'], [false, 'Off']]],
  ['shockwaves', 'Shockwaves (slams and blasts bend the air)', [[true, 'On'], [false, 'Off']]],
  ['rivalMix', 'Rival ships (from the next load)', [['mixed', 'Feathers, Comets, Anvils'], ['feather', 'Feathers only']]],
  ['airPitch', 'Nose control in the air', [[true, 'On'], [false, 'Off']]],
  ['music', 'Music', [['off', 'Off'], ['low', 'Low'], ['mid', 'Medium'], ['high', 'High']]],
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
  ['deckLight', 'Road light on the ships', [[true, 'On'], [false, 'Off']]],
  ['hullShadows', 'Ship seam shadows', [[true, 'On'], [false, 'Off']]],
  ['engineFaces', 'Engine faces', [['dark', 'Dark, ring glow only'], ['glow', 'Glowing']]],
  ['shipPaint', 'Ship paint', [['gloss', 'Deep gloss, metal flake'], ['classic', 'Classic']]],
  ['shipTrim', 'Ship metal trim', [['dark', 'Dark satin'], ['classic', 'Classic']]],
  ['shipAccents', 'Ship accent lights', [[true, 'On'], [false, 'Off']]],
  ['engineHeat', 'Engine heat shimmer', [[true, 'On'], [false, 'Off']]],
  ['engineTrails', 'Engine trails', [['puffs', 'Glowing gas'], ['ribbon', 'Light ribbons']]],
  ['nozzleMotion', 'Rocket nozzle: spinning, folding teeth (Comet)', [[true, 'On'], [false, 'Off']]],
  ...Object.entries(LIVERIES).map(([id, L]) => [L.key, `${shipName(id)} livery`, L.names.map((n, k) => [n, L.labels[k]])]),
  ['pulseRings', 'Pulse engine rings and shock diamonds (Anvil)', [[true, 'On'], [false, 'Off']]],
  ['sharpEdges', 'Sharp paint edges up close', [[true, 'On'], [false, 'Off']]],
  ['showroom', 'Ship screen: the ships in a showroom', [[true, 'On'], [false, 'Off']]],
  ['streaks', 'Light streaks', [[true, 'On'], [false, 'Off']]],
  ['blur', 'Speed blur', [[true, 'On'], [false, 'Off']]],
  ['shafts', 'Light shafts (forest moon, ice planet, desert)', [[true, 'On'], [false, 'Off']]],
  ['iceSnow', 'Blowing snow (ice planet)', [[true, 'On'], [false, 'Off']]],
  ['iceDust', 'Diamond dust (ice planet)', [[true, 'On'], [false, 'Off']]],
  ['aurora', 'Aurora (ice planet)', [[true, 'On'], [false, 'Off']]],
  ['iceStorm', 'Storm and lightning (ice planet)', [[true, 'On'], [false, 'Off']]],
  ['iceGeysers', 'Steam geysers (ice planet)', [[true, 'On'], [false, 'Off']]],
  ['sandFx', 'Blowing sand and wakes (desert)', [[true, 'On'], [false, 'Off']]],
  ['dustDevils', 'Dust devils (desert)', [[true, 'On'], [false, 'Off']]],
  ['heatHaze', 'Heat shimmer (desert)', [[true, 'On'], [false, 'Off']]],
  ['sandstorm', 'Sandstorm (desert)', [[true, 'On'], [false, 'Off']]],
  ['lensWater', 'Water on the lens', [[true, 'On'], [false, 'Off']]],
  ['colossus', 'Broken capital ship in the sky (space)', [[true, 'On'], [false, 'Off']]],
  ['wreckFx', 'Derelict: sparks, flicker, drift, arcs (space)', [[true, 'On'], [false, 'Off']]],
  ['wreckMist', 'Derelict: coolant mist, sun beams (space)', [[true, 'On'], [false, 'Off']]],
  ['caveFx', 'Cave: daylight beams, spray, glowworms (forest moon)', [[true, 'On'], [false, 'Off']]],
  ['seaLife', 'Sea life: leaping fish, leviathans, birds, shoals (ocean)', [[true, 'On'], [false, 'Off']]],
  ['seaReflect', 'Sea reflections (ocean)', [[true, 'On'], [false, 'Off']]],
  ['oceanStorm', 'Lightning storm (ocean)', [[true, 'On'], [false, 'Off']]],
  ['shipWet', 'Water running off the ships out of the sea (ocean)', [[true, 'On'], [false, 'Off']]],
  ['kraken', 'The giant squid on its rock off the start (ocean)', [[true, 'On'], [false, 'Off']]],
  ['oceanRain', 'Rain: streaks, splashes on the deck, rings on the sea (ocean)', [[true, 'On'], [false, 'Off']]],
  ['oceanPillars', 'The alien pillars round the circuit (ocean)', [[true, 'On'], [false, 'Off']]],
  ['brakeLights', 'Brake lights', [[true, 'On'], [false, 'Off']]],
  ['shadows', 'Shadows', [['high', 'High'], ['medium', 'Medium'], ['off', 'Off']]],
  ['scale', 'Render scale', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']]],
  ['fps', 'FPS readout', [[true, 'On'], [false, 'Off']]],
];

// the headings the rows fall under (in the menu's Settings screen)
const GROUPS = { quality: 'Graphics', ai: 'Race', music: 'Audio', touch: 'Controls', tonemap: 'Picture', ao: 'Effects', shadows: 'Performance' };

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
    delete this.v.beforeLaptop;                      // (what the old Laptop switch kept to restore: the presets do that now)
    this.v.quality = presetOf(this.v);
    // Normal is the default difficulty: a Hard saved before the player ever chose one goes back to it
    if (!this.v.aiPicked) this.v.ai = DEFAULTS.ai;
    // and the music's level High, unless one was chosen
    if (!this.v.musicPicked) this.v.music = DEFAULTS.music;
    delete this.v.drift; delete this.v.driftPicked;    // (drifting is no longer a setting: off)
    this.focus = 0;                                  // the row the keyboard / gamepad is on
    this.onSet = null;                               // (k, value) after every change (menu.js: the difficulty accent)
    this.el = document.getElementById('settings');
    this.el.addEventListener('click', (e) => {
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

  get focusKey() { return ROWS[this.focus][0]; }

  // keyboard / gamepad: the next row up or down, the focused row's option one step left or right
  move(d) {
    this.focus = (this.focus + d + ROWS.length) % ROWS.length;
    this.mark();
    this.el.querySelector('.srow.focus')?.scrollIntoView({ block: 'nearest' });
  }

  cycle(d, wrap = false) {
    const [k, , all] = ROWS[this.focus], opts = all.filter(([val]) => val !== 'custom'), n = opts.length;
    const i = opts.findIndex(([val]) => val === this.v[k]);
    let j = i + d;
    if (wrap) j = (j + n) % n; else j = Math.max(0, Math.min(n - 1, j));
    if (j !== i) this.set(k, opts[j][0]);
    return j !== i;
  }

  mark() { this.el.querySelectorAll('.srow').forEach((r) => r.classList.toggle('focus', +r.dataset.r === this.focus)); }

  draw() {
    this.el.innerHTML = ROWS.map(([k, label, all], r) => [k, label, all.filter(([val]) => val !== 'custom' || this.v.quality === 'custom'), r])
      .map(([k, label, opts, r]) => (GROUPS[k] ? `<div class="s-group">${GROUPS[k]}</div>` : '') +
      `<div class="srow${r === this.focus ? ' focus' : ''}" data-r="${r}"><span>${label}${k === 'xrScale' ? '<small class="s-help">Lower for smoother racing; higher for sharper scenery. Saved in this browser.</small>' : ''}</span><div class="seg">${opts.map(([val, t]) =>
        `<button tabindex="-1" data-k="${k}" data-v='${JSON.stringify(val)}'${k === 'ai' ? ` data-lv="${val}"` : ''} class="${this.v[k] === val ? 'on' : ''}">${t}</button>`)
        .join('')}</div></div>`).join('') +
      // which version is running (tools/stamp.py; a phone can keep an old one a while after an update)
      `<div class="s-ver">Version ${VERSION} &middot; build ${document.querySelector('meta[name="build"]')?.content || 'dev'}</div>` +
      `<div class="s-ver">© 2026 vengeful180. All rights reserved.</div>`;
  }
}
