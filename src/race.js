// The race: nine ships on a grid (the player fifth), lights, three laps, live positions, ship-to-ship bumping and
// damage, a score and a results table. Rivals - four Feathers in their teams' paint, two Comets and two Anvils in
// liveries of their own - are clones of the loaded ships, driven by AI on the same track physics.
import * as THREE from 'three';
import { TrackRacer, TRACK_W, turnRate, gripAt, speedScale, DAMAGE, damageSpeed, ATTACK } from './track.js';
import { Ship } from './ship.js';
import { HANDLING, RIVAL_SHIPS, LIVERIES } from './ships.js';
import { clamp, damp, mulberry32, smoothstep } from './noise.js';

export const LAPS = 3;
// livery replaces the red, body multiplies the white (linear); css is the HUD colour
export const TEAMS = [
  { name: 'Feather S1', css: '#e0443c', engine: [0.1, 0.42, 1.0] },
  { name: 'Cobalt', livery: [0.015, 0.09, 0.62], body: [1, 1, 1], css: '#3a6cf0', engine: [0.3, 0.5, 1.0] },
  { name: 'Solar', livery: [0.80, 0.50, 0.02], body: [0.10, 0.10, 0.11], css: '#f2b528', engine: [1.0, 0.55, 0.08] },
  { name: 'Viper', livery: [0.04, 0.42, 0.06], body: [0.92, 0.96, 0.90], css: '#35c255', engine: [0.15, 1.0, 0.25] },
  { name: 'Ember', livery: [0.90, 0.20, 0.01], body: [0.42, 0.43, 0.46], css: '#ff7428', engine: [1.0, 0.28, 0.05] },
  { name: 'Nebula', livery: [0.28, 0.04, 0.60], body: [0.95, 0.94, 1.0], css: '#9a4cf0', engine: [0.6, 0.2, 1.0] },
  { name: 'Glacier', livery: [0.02, 0.50, 0.65], body: [0.10, 0.15, 0.32], css: '#30d0f0', engine: [0.1, 0.85, 1.0] },
  { name: 'Onyx', livery: [0.75, 0.52, 0.16], body: [0.05, 0.05, 0.055], css: '#d2aa58', engine: [1.0, 0.75, 0.25] },
  { name: 'Rose', livery: [0.75, 0.03, 0.32], body: [1, 0.96, 0.97], css: '#f24c94', engine: [1.0, 0.2, 0.6] },
];
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2];
const PLAYER_SLOT = 4;
const HOLD = { throttleUp: 0, throttleDown: 0, throttleAxis: 0, boost: 0, yaw: 0, roll: 0, airL: 0, airR: 0, pitch: 0 };

// AI difficulty (settings: "AI difficulty"). pace: engine thrust = p0 - slot * step + rnd * spread (the front of the
// grid a touch quicker); corner: the share of the line's speed limit it dares; pads: the chance it takes each pad;
// boost: 'plan' (spent where the lap has room to use it) or 'random'; lane: how far it strays off the line where that
// costs nothing; band: more / less thrust when far behind / far ahead of the player - never within sight of it; hold:
// how much one of the first three eases off with open road behind it (the front stays a fighting bunch);
// wander: a slow drift off the line, everywhere (m: a human's line); defend: how firmly it covers the player's way
// past; aggression: how close it passes, how late it gives way.
// ace: the one rival a bit smarter and faster than the rest ("anvil the smartest and mostly a winner at lower
// difficulties ... comet the fastest at higher ... balanced the winner at the highest"): the first rival of that ship
// on the grid, starting on pole (the fastest ship mid-field was always passing: it brushed hulls and ran into tails
// until its hull gave out, or sat boxed in), its engine pace per cent stronger and its racecraft (drive) a step up. kinds: each ship's engine (pace)
// on top of the level's, and the share of its own speed limit in the bends it dares (corner), so the ships finish
// close together - the Comet a little ahead overall ("a slight
// cheater"), the Feather and the Anvil level (the Anvil gains on the levels that plan their boost, wrecks least)
export const AI_LEVELS = {
  // "add an easy setting ... and the enemies are also slower": a tenth less engine than Normal, careful in the bends,
  // pads and boost left to chance, wide of the line, never blocking, easing off more when well ahead of the player
  easy: { pace: [0.84, 0.004, 0.02], corner: 0.9, pads: 0.3, boost: 'random', lane: 10, wander: 7, band: [0.03, 0.08], defend: 0, aggression: 0.35, speed: 0.25, hold: 0.08, counter: 0.08,
    kinds: { rocket: { pace: 0.92 }, heavy: { pace: 1.035 } }, ace: { kind: 'heavy', pace: 0, drive: { pads: 0.55, boost: 'plan', lane: 6, wander: 4, corner: 0.92 } } },
  // "make normal, hard and brutal a bit easier, like 30 % easier overall": each one's lap a third of the way back
  // toward Easy's (median laps on the ice: Normal 47.0 -> 48.2 s, Hard 44.9 -> 46.4, Brutal 44.6 -> 46.2, Easy 50.2),
  // its aggression and defence 30 % of the way too. speed: the menu's bar for their pace (the laps, not the engine)
  normal: { pace: [0.9235, 0.004, 0.02], corner: 0.95, pads: 0.45, boost: 'random', lane: 8, wander: 5, band: [0.04, 0.04], defend: 0, aggression: 0.45, speed: 0.5, hold: 0.07, counter: 0.18,
    kinds: { rocket: { pace: 0.92 }, heavy: { pace: 1.035 } }, ace: { kind: 'heavy', pace: -0.005, drive: { pads: 0.7, boost: 'plan', lane: 5, wander: 3, corner: 0.96 } } },
  hard: { pace: [0.895, 0.0025, 0.008], corner: 1, pads: 1, boost: 'plan', lane: 3, wander: 0, band: [0.05, 0.015], defend: 0.42, aggression: 0.67, speed: 0.78, hold: 0.06, counter: 0.32,
    kinds: { rocket: { pace: 0.965 }, heavy: { pace: 0.995 } }, ace: { kind: 'rocket', pace: 0.02, drive: { lane: 2 } } },
  brutal: { pace: [0.905, 0.0015, 0.004], corner: 1, pads: 1, boost: 'plan', lane: 2, wander: 0, band: [0.08, 0], defend: 0.7, aggression: 0.8, speed: 0.88, hold: 0.05, counter: 0.45,
    kinds: { rocket: { pace: 0.965 }, heavy: { pace: 0.995 } }, ace: { kind: 'feather', pace: 0.025, drive: {} } },
};

// The rivals' plan of the lap, made once per track. In this physics a ship has to yaw at v x (the track's curvature +
// the bend of its own line across the deck), so the line that bends least - as straight as the walls allow, the least
// squared curvature - keeps the most speed: wide in, the inside at the apex, wide out, and no apex hugged so tightly
// that the exit runs into the wall. It is threaded through every boost pad (one of a pair) and kept on the centre over
// the cuts and round the loop. Then the speed each metre of it allows (with a share of airbrake), the braking back
// from every limit, and where a lane of its own costs nothing.
function makePlan(track, lim, T) {
  // (a speed circuit's line a few metres further in off the walls: arriving there at 130 m/s across the deck, the
  // wall's escape took the hull off a line laid along its bound)
  const n = track.n, st = track.step, L = track.length, W = lim - T.lineM - 3 * ((track.speedK || 1) - 1);
  const ix = (s) => ((Math.round(s / st) % n) + n) % n;
  const cr = (x, u) => {                                 // periodic Catmull-Rom
    const N = x.length, j = Math.floor(u), t = u - j, a = x[((j - 1) % N + N) % N], b = x[(j % N + N) % N];
    const c = x[((j + 1) % N + N) % N], d = x[((j + 2) % N + N) % N];
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  };
  // on the centre 70 m either side of a cut; of a gravity flip only 25 m (the field carries a ship along the centre line,
  // and held there 70 m on it could not swing out for a bend after one)
  const cut = (s) => track.gaps.some((g) => track.inSpan(s, g[0] - 70, g[1] + 70) && !(track.flips.includes(g) && !track.inSpan(s, g[0] - 25, g[1] + 25)));
  // least squared curvature, the bounds held (projected gradient descent on the bend; x0: a coarser solution)
  const solve = (N, pads, x0, iters, blocks = []) => {
    const h = L / N, per = Math.max(1, Math.round(h / st));
    const lo = new Float64Array(N).fill(-W), hi = new Float64Array(N).fill(W), K = new Float64Array(N);
    for (let j = 0; j < N; j++) {
      const s = j * h;
      let a = 0;
      for (let k = 0; k < per; k++) a += track.kh[ix(s - h / 2 + (k + 0.5) * st)];
      K[j] = a / per;
      if (track.inLoop(s, 40)) { lo[j] = -1.5; hi[j] = 1.5; K[j] = 0; } else if (cut(s)) { lo[j] = -2.5; hi[j] = 2.5; }
    }
    for (const p of pads) {
      for (let d = -14; d <= 10; d += Math.min(4, h / 2)) {
        const j = Math.round(track.wrap(p.s + d) / h) % N;
        lo[j] = Math.max(lo[j], p.x - 2.5); hi[j] = Math.min(hi[j], p.x + 2.5);
      }
    }
    // the obstacles: passed on the side the free line takes, a hull's width and a margin clear of the edge
    for (const b of blocks) {
      for (let d = -b.len / 2 - 40 - 120 * (track.speedK - 1); d <= b.len / 2 + 25; d += Math.min(4, h / 2)) {     // (on its side early at a speed circuit's speeds)
        const j = Math.round(track.wrap(b.s + d) / h) % N, m = b.w / 2 + 9 * Math.sqrt(track.speedK);
        if (b.right) lo[j] = Math.max(lo[j], Math.min(W, b.x + m)); else hi[j] = Math.min(hi[j], Math.max(-W, b.x - m));
      }
    }
    const x = new Float64Array(N), r = new Float64Array(N), h2 = h * h;
    for (let j = 0; j < N; j++) x[j] = clamp(x0 ? cr(x0, (j * x0.length) / N) : 0, lo[j], hi[j]);
    for (let it = 0; it < iters; it++) {
      for (let j = 0; j < N; j++) r[j] = K[j] * h2 + x[(j + 1) % N] - 2 * x[j] + x[(j + N - 1) % N];
      for (let j = 0; j < N; j++) x[j] = clamp(x[j] - 0.06 * (r[(j + 1) % N] - 2 * r[j] + r[(j + N - 1) % N]), lo[j], hi[j]);
    }
    return x;
  };
  // pads: of a pair side by side, the one nearer the free line
  const free = solve(Math.round(L / 40), [], null, 5000);
  const pads = [];
  for (const p of track.pads) {
    const twin = pads.find((q) => Math.abs(track.wrap(q.s - p.s + L / 2) - L / 2) < 20);
    const xf = cr(free, (p.s / L) * free.length);
    if (!twin) pads.push(p);
    else if (Math.abs(p.x - xf) < Math.abs(twin.x - xf)) pads[pads.indexOf(twin)] = p;
  }
  // the obstacles: each passed on the side with more room, or - room enough either way - the side the line through the
  // pads is already on (the free line's side had it swing across the road just after a pad, too fast to follow)
  const viaPads = track.blocks?.length ? solve(Math.round(L / 40), pads, free, 6000) : free;
  // (where that line runs over the whole run-up, not at the block alone: just after a pad pair it is still out at the
  // pad and at the block already swinging back across)
  const runUp = 40 + 120 * (track.speedK - 1);
  const blocks = (track.blocks || []).map((b) => {
    let xf = 0;
    for (let k = 0; k <= 8; k++) xf += cr(viaPads, (track.wrap(b.s - (runUp * k) / 8) / L) * viaPads.length) / 9;
    const roomR = W - (b.x + b.w / 2), roomL = (b.x - b.w / 2) + W;
    const need = 9 * Math.sqrt(track.speedK) + 4;
    return { ...b, right: roomR > need && roomL > need ? xf >= b.x : roomR > roomL };
  });
  // (with blocks, coarse to fine: the descent smooths only a few samples' reach, so solved at 40 m first the swing round
  // a block came out a few hundred metres long however much road there was - at 1,500 m/s too quick to follow)
  let x0 = free;
  if (blocks.length) for (const h of [640, 160]) x0 = solve(Math.round(L / h), pads, x0, 6000, blocks);
  const coarse = solve(Math.round(L / 40), pads, x0, 6000, blocks);
  const fine = solve(Math.round(L / 10), pads, coarse, 5000, blocks);
  // per 2 m sample: the line, its slope, the bend the ship has to turn through (track + line), the speed limit
  const x = new Float32Array(n), slope = new Float32Array(n), c = new Float32Array(n), vlim = new Float32Array(n), ka = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = cr(fine, (i * st / L) * fine.length);
  const D = 5, w = (k) => x[(k + n) % n];
  for (let i = 0; i < n; i++) {
    let kh = 0;
    for (let k = -4; k <= 4; k++) kh += track.kh[(i + k + n) % n];
    slope[i] = (w(i + 1) - w(i - 1)) / (2 * st);
    ka[i] = kh / 9;
    c[i] = kh / 9 + (w(i + D) - 2 * x[i] + w(i - D)) / ((D * st) ** 2);
  }
  vlim.set(speedLimits(track, c, T, HANDLING.feather));
  // where a lane of its own costs nothing: a straight, no pad just ahead, clear of the cuts and the loop
  const slack = new Float32Array(n), raw = new Float32Array(n), R = Math.round(150 / st), SK = Math.round(track.speedK || 1);
  for (let i = 0; i < n; i++) {
    let cm = 0;
    // (the track's bend too: through a gentle S the line runs straight across the deck, apex to apex, and a lane held
    // off it ran into the walls)
    for (let j = -R; j <= R; j += 5) cm = Math.max(cm, Math.abs(c[(i + j + n) % n]), Math.abs(ka[(i + j + n) % n]));
    const s = i * st;
    let ok = 1 - smoothstep(0.0005, 0.0012, cm);
    if (track.inGap(s, 150) || track.inLoop(s, 150)) ok = 0;
    // (a speed circuit: back on the line as many times sooner, eased in as many times longer - at 1,500 m/s its own
    // lane 45 m off the line, given up 500 m before a block, was a third of a second to cross the road)
    for (const p of pads) { const ds = track.wrap(p.s - s + L / 2) - L / 2; if (ds > -40 && ds < 300 * SK) ok = 0; }
    for (const b of blocks) { const ds = track.wrap(b.s - s + L / 2) - L / 2; if (ds > -30 && ds < 500 * SK) ok = 0; }
    raw[i] = ok;
  }
  const E = 20 * SK;
  for (let i = 0; i < n; i++) { let a = 0; for (let j = -E; j <= E; j++) a += raw[(i + j + n) % n]; slack[i] = a / (2 * E + 1); }
  return { x, slope, c, vlim, slack, pads };
}

// the speed each metre of the line allows a ship that flies as H does (ships.js HANDLING: it turns as the Feather at
// the same share of its own top speed, then by its own turn), and the braking back from every limit
function speedLimits(track, c, T, H) {
  const n = track.n, st = track.step, vR1 = Math.sqrt(H.thrust / H.drag), vlim = new Float32Array(n);
  const vR = (m) => vR1 * speedScale(track, m, H);       // (a speed circuit: its scale at that speed - track.js)
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let j = -3; j <= 3; j++) k = Math.max(k, Math.abs(c[(i + j + n) % n]));
    let lo = 40, hi = 400 * vR1 * (track.speedK || 1);   // the fastest v with v * k <= its turn rate * A
    for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (m * k <= turnRate(m / vR(m)) * vR(m) * H.turn * T.A) lo = m; else hi = m; }
    vlim[i] = lo;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) vlim[i] = Math.min(vlim[i], Math.sqrt(vlim[(i + 1) % n] ** 2 + 2 * T.brakeD * st));
  }
  return vlim;
}

class Driver {
  // tunables (searched by simulating laps: a lone ship's lap time and wall touches, then whole races)
  static tune = { lead: 0, tauE: 0.6, tauTh: 0.18, tauPsi: 0.2, ffLag: 0.3, airOn: 1.0, airOff: 0.8, lineM: 3, A: 1.8,
    brakeD: 110, boostRoom: 2.0, boostHi: 0.35, boostLo: 0.04, boostVmax: 400, wallEdge: 2.0, horizon: 0.45, aimRate: 5,
    airCorr: 0.7, airMinOn: 0.12, airMinOff: 0.08 };

  constructor(entry, race, rnd, slot) {
    this.e = entry;
    this.race = race;
    this.rnd = rnd;
    this.slot = slot;
    this.seed = [rnd(), rnd(), rnd(), rnd()];            // its character: engine, lane, temper, luck
    this.padPick = new Map();
    this.inp = { ...HOLD };
    this.reset();
    this.setLevel(race.level);
  }

  // a new race: no pass, defence, burst or pad choice carried over
  reset() {
    Object.assign(this, { passSide: 0, passT: 0, passWho: null, defT: 0, defCool: 0, defX: null, airOn: 0, airHold: 0, boostOn: false,
      slamNow: false, counterAt: null,
      boostT: 0, burstT: 0, knockT: 0, offS: 0, odo: 0, gridX: this.e.racer.x });
    this.padPick.clear();
  }

  // a slam coming at it: by its level's chance (AI_LEVELS counter) it hits back within the window - a double attack -
  // if its own slam is ready
  mayCounter(race) {
    if (!race.canSlam(this.e) || this.e.racer.slamCool > 0 || this.rnd() >= (this.level.counter ?? 0)) return;
    this.counterAt = race.time + 0.08 + this.rnd() * 0.35;
  }

  // past the flag: a cool-down lap on its line, off the boost, at a cruise (it used to coast with the stick centred
  // into the walls, in the way of anyone still racing)
  coast(dt) {
    const inp = this.think(dt);
    inp.throttleAxis = Math.min(inp.throttleAxis, 0.45);
    inp.throttleDown = 0;
    inp.boost = 0;
    return inp;
  }

  setLevel(name) {
    const L0 = AI_LEVELS[name] || AI_LEVELS.hard, ace = this.e.ace && L0.ace, [p0, step, spread] = L0.pace, [a, b, c] = this.seed;
    const L = ace ? { ...L0, ...ace.drive } : L0;
    this.level = L;
    // engine: the front of the grid a touch quicker; by its ship; the ace's a step stronger
    const K = L0.kinds?.[this.e.kind] || {};
    this.pace = (p0 - this.slot * step + a * spread) * (K.pace || 1) * (ace ? 1 + ace.pace : 1);
    this.cornerK = K.corner || 1;
    this.lane = (b - 0.5) * 2 * L.lane;                  // where it sits where the line leaves room
    this.aggression = L.aggression * (0.8 + 0.2 * c);
  }

  // The driver, every physics step: the planned line and its speed, the traffic round it (who to pass and on which
  // side, whose slipstream to sit in, who it must give room, who to keep behind) and the boost, turned into the
  // player's inputs: steer, airbrakes, throttle, brake, boost.
  think(dt) {
    const r = this.e.racer, race = this.race, tr = race.track, plan = race.plan, n = tr.n, T = Driver.tune;
    const L = this.level, lim = race.lim, v = Math.max(20, r.vs), VL = race.vlims?.[this.e.kind] || plan.vlim;
    // one of the first three: it fights the others there - defends against them, attacks them far more readily
    const top = race.racing && this.e.rank <= 3;
    const i = ((Math.floor(r.s / tr.step) % n) + n) % n;
    const at = (m) => (i + Math.round(m / tr.step) + n) % n;
    const air = r.y > 2.6;
    const jump = air || tr.inGap(r.s + 20) || tr.inGap(r.s + v * 0.8) || tr.inGap(r.s) || tr.inGap(r.s - 40);
    const loop = tr.inLoop(r.s, 60);
    // thrown off a crest (no cut under it, just ahead or just behind): nose down, back onto the deck sooner (track.js
    // airPitch) - in the air the hull barely grips, and a track bending under it slides it across into the wall
    this.inp.pitch = air && !tr.inGap(r.s) && !tr.inGap(r.s + v * 1.2) && !tr.inGap(r.s - 60) && tr.flipAt(r.s) < 0 ? -1 : 0;
    // the line where the ship will be once the steering has answered
    const iA = at(v * (T.lead + 0.033 * (speedScale(tr, v, r.handling) - 1)));   // (a speed circuit flat out: 0.1 s ahead)
    const ws = r.s + this.seed[3] * 5000, wander = L.wander * (0.6 * Math.sin(ws / 173) + 0.4 * Math.sin(ws / 61 + this.seed[1] * 20));
    // (its lane and wander no further toward a wall than the line's own bound: where the line ran along that bound - the
    // apex of a gentle bend, where the line is straight and a lane looks free - they took the hull into the wall)
    const x0 = plan.x[iA], wb = lim - T.lineM;
    let lineX = x0 + clamp(this.lane * plan.slack[iA] + (jump || loop ? 0 : wander * (tr.blocks.length ? plan.slack[iA] : 1)), -wb - x0, wb - x0);
    // off the grid: its own column for the first few hundred metres, then onto the line (all three columns making for
    // the line at once side-swiped each other within a second of the lights)
    this.odo += r.vs * dt;
    if (this.odo < 700) lineX = this.gridX + (lineX - this.gridX) * smoothstep(150, 700, this.odo);
    let xT = lineX;
    // pads: a weaker driver lets some go by (decided once a pass)
    for (let k = 0; k < tr.pads.length; k++) {
      const p = tr.pads[k], ds = race.gap(p.s, r.s);
      if (ds < -12 || ds > 300) { this.padPick.delete(k); continue; }
      if (!plan.pads.includes(p)) continue;
      if (!this.padPick.has(k)) this.padPick.set(k, this.rnd() < L.pads ? 0 : p.x ? -Math.sign(p.x) : this.rnd() < 0.5 ? -1 : 1);
      const skip = this.padPick.get(k);
      // (toward the middle: at a wall it would still hit; never into a block on the way - at a speed circuit's
      // speeds the pull-off starts 1.4 km out)
      const off = p.x + skip * 11;
      if (skip && ds < 60 + v * 0.9 && !tr.blocks.some((b) => { const db = race.gap(b.s, r.s); return db > -20 && db < ds + 20 && Math.abs(off - b.x) < b.w / 2 + 9; })) xT = off;
    }
    // the bends just ahead: the one to turn through now (the steering lags), the side of the next real one
    let cFF = 0;
    for (let k = 0; k < 4; k++) cFF += plan.c[at((v * T.ffLag * k) / 3)];
    cFF /= 4;
    let nextC = 0;
    for (let d = 30; d < 30 + v * 2.5; d += 15) { const c = plan.c[at(d)]; if (Math.abs(c) > 0.001) { nextC = Math.sign(c); break; } }
    // the next pad on its line within ~1.8 s: a pass that pulls off the line for it gives the pad (+55 m/s) away
    let padX = null;
    for (const p of plan.pads) { const ds = race.gap(p.s, r.s); if (ds > 0 && ds < v * 1.8 && !this.padPick.get(tr.pads.indexOf(p))) { padX = p.x; break; } }
    // traffic
    let follow = Infinity, draftX = null, guard = null;
    this.passT = Math.max(0, this.passT - dt);
    this.defT = Math.max(0, this.defT - dt);
    const straight = Math.abs(plan.c[i]) < 0.0012 && Math.abs(plan.c[at(v)]) < 0.0012;
    for (const o of race.entries) {
      // (a wrecked ship being flown through - or this one - is no traffic)
      if (o === this.e || o.racer.ghost > 0 || r.ghost > 0) continue;
      const or = o.racer, ds = race.gap(or.s, r.s), dx = or.x - r.x, close = r.vs - or.vs;
      if (ds < -60 || ds > 60 + Math.max(0, close) * 2.2 || Math.abs(or.y - r.y) > 4) continue;
      // the two hulls' contact sizes (a Feather pair: 9.8 m across, 12.8 m along; the Anvil is bigger)
      const W = race.wid(this.e, o), LN = race.len(this.e, o);
      if (ds > LN - 0.8) {
        // ahead: closing on it in its path - pass, on a side picked once and held (the inside of the next bend when
        // there is room there, else the side the line is going anyway); boxed in: sit in its slipstream and wait
        const ttc = close > 0 ? (ds - LN) / close : Infinity;
        const inPath = Math.abs(or.x - xT) < W + 1.2 || Math.abs(dx) < W + 1.2;
        if (inPath && close > 1 && ttc < 1.6 && !jump) {
          if (this.passT <= 0 || this.passWho !== o) {
            const roomR = lim - 1 - or.x, roomL = or.x + lim - 1, need = W + 1.7 + 1.5 * (1 - this.aggression);
            let okR = roomR > need, okL = roomL > need;
            // a pad just ahead: only a side that still runs over it (or a ship far slower than it): else wait for it
            // in the slipstream and go after the pad, with its speed
            const lane = (sd) => or.x + sd * (W + 1.8 + 1.2 * (1 - this.aggression));
            if (padX != null && close < 15) { okR = okR && Math.abs(lane(1) - padX) < 5; okL = okL && Math.abs(lane(-1) - padX) < 5; }
            let side = 0;
            if (nextC && (nextC > 0 ? okR : okL)) side = nextC;
            else if (okR && okL) side = xT >= or.x ? 1 : -1;
            else side = okR ? 1 : okL ? -1 : 0;
            this.passSide = side; this.passWho = o; this.passT = side ? 1.6 : 0.3;
          }
          if (this.passSide) xT = or.x + this.passSide * (W + 1.8 + 1.2 * (1 - this.aggression));
        } else if (ds < 45 && close > -8 && Math.abs(dx) < 8 && this.odo > 700 && straight && !jump && !loop && this.passT <= 0) draftX = or.x;
        // never into its tail (the rammer pays): ease off, harder the sooner the noses would meet - judged by where
        // its own drift across (a pass under way) will have put it by then
        const xAt = this.passT > 0 ? r.x + clamp(r.vx * Math.min(ttc, 1.2), -15, 15) : r.x;
        if (close > 0 && ttc < 1.2 && Math.abs(or.x - xAt) < W + 0.7) follow = Math.min(follow, or.vs - 2 - (1.2 - ttc) * 14);
        else if (ds < LN + 9.2 && Math.abs(dx) < W + 0.7) follow = Math.min(follow, or.vs + (ds - LN - 3.2) * (0.6 + this.aggression));
      } else if (ds > -LN - 1.2) {
        // alongside: hold the gap across (never steer into it) - judged a moment ahead, drift and all; pinned at the
        // wall, drop back or press on
        const dxP = dx + (or.vx - r.vx) * 0.35;
        if (Math.abs(dx) < W + 2.7 || Math.abs(dxP) < W + 2.7) {
          if (dx > 0) xT = Math.min(xT, or.x - W - 2); else xT = Math.max(xT, or.x + W + 2);
          if (Math.abs(xT) > lim - 0.5 && Math.abs(dx) < W + 0.7) follow = Math.min(follow, ds > 0 ? or.vs - 6 : Infinity);
        }
      } else if ((o.player ? L.defend > 0 : top && o.rank <= 3) && ds > -45 && (or.vs > r.vs + 1 || ds > -30)) guard = o;
    }
    // the slipstream: tuck in behind (8 - 45 m, within 4.5 m across: +7 % thrust) where the line costs nothing
    if (draftX != null && this.passT <= 0) xT += (draftX - xT) * clamp(plan.slack[i] + 0.4, 0, 1);
    // defending against the player: on a straight, one move onto the side it is coming by (or its line) - made while
    // it is still a length back, never across its nose, then held
    // (then no new move for a while: no weaving)
    this.defCool = Math.max(0, (this.defCool || 0) - dt);
    if (guard && !jump && !loop && straight && this.passT <= 0) {
      const LN = race.len(this.e, guard), g = guard.racer, back = -race.gap(g.s, r.s), ttc = (back - LN) / Math.max(0.1, g.vs - r.vs);
      if (this.defT <= 0 && this.defCool <= 0 && back > LN + 3.2 && ttc > 0.8 && Math.abs(g.x - r.x) > 2) {
        this.defX = r.x + (g.x - r.x) * (top ? Math.max(L.defend, 0.6) : L.defend); this.defT = 2.0; this.defCool = 3.5;
      }
      if (this.defT > 0 && this.defX != null) xT = this.defX;
    } else if (this.defT <= 0) this.defX = null;
    xT = clamp(xT, -(lim - 0.8), lim - 0.8);
    // traffic offsets eased in (a hull jinking across reads as a twitch); the line itself is smooth already
    this.offS += (xT - lineX - this.offS) * damp(T.aimRate * (0.7 + 0.6 * this.aggression), dt);
    xT = lineX + this.offS;
    // steer, as a cascade matched to the hull: the gap to the line closes in ~tauE (a velocity angle to fly at), the
    // velocity follows the nose at the grip's rate (a heading that turns it there in ~tauTh, plus the slip the bend
    // needs), the nose follows the steering at the turn rate (in ~tauPsi, slower than the 0.12 s the stick takes to
    // answer); the bend ahead is fed forward. Gains fixed in steer units over-steered slowly and under-damped fast.
    // (its own ship's turn and grip: track.js scales them by its top speed and turn)
    const H = r.handling, vR = Math.sqrt(H.thrust / H.drag) * speedScale(tr, v, H);      // (a speed circuit scales them: track.js)
    const tRate = turnRate(v / vR) * vR * H.turn, g = gripAt(v / vR) * vR * H.turn, slope = plan.slope[iA];
    const slip = clamp((v * cFF) / g, -0.3, 0.3), th = Math.atan2(r.vx, v);
    const thD = Math.atan(slope) - clamp((r.x - xT) / (v * T.tauE), -0.3, 0.3);
    let psiDes = clamp(th + (thD - th) / (g * T.tauTh) + slip, -0.45, 0.45);
    // where its drift off the aim puts it in a moment (the line itself crosses the deck at 90 m/s through the S at the
    // start, so not the raw drift): near a wall, turn away now and airbrake on that side (walls cost speed)
    const dvx = r.vx - v * slope, xp = plan.x[at(v * T.horizon)] + this.offS + (r.x - xT) + dvx * T.horizon;
    const esc = Math.sign(dvx) === Math.sign(xp) ? smoothstep(lim - T.wallEdge - 2, lim - T.wallEdge + 1.5, Math.abs(xp)) : 0;
    if (esc > 0) psiDes = psiDes * (1 - esc) - Math.sign(xp) * 0.3 * esc;
    if (jump) psiDes = clamp(-r.vx / v - r.x * 0.004, -0.06, 0.06);          // nose dead straight over a cut
    const ff = (v * cFF) / tRate;
    let steer = ff + (psiDes - r.psi) / (tRate * T.tauPsi);
    const need = Math.max(Math.abs(ff), Math.abs(steer) - T.airCorr), sgn = Math.sign(Math.abs(ff) > 0.5 ? ff : steer);
    // airbrakes: for a bend that asks more than the hull alone turns (they add 90 % rate and 0.8 of a turn, and drag)
    // - set by the bend ahead, not by every correction (switched on and off each step they kicked the nose about),
    // held at least 0.12 s and rested 0.08 s (flicked for a step or two they twitched the hull)
    let air1 = this.airOn;
    if (this.airOn ? need < T.airOff : need > T.airOn) air1 = this.airOn ? 0 : sgn;
    else if (this.airOn && sgn !== this.airOn && need > T.airOn) air1 = sgn;
    this.airHold = Math.max(0, this.airHold - dt);
    if (this.airHold > 0) air1 = this.airOn;
    if (esc > 0.6) air1 = -Math.sign(xp);
    if (jump || loop || air) air1 = 0;
    if (air1 !== this.airOn) { this.airHold = air1 ? T.airMinOn : T.airMinOff; this.airOn = air1; }
    if (this.airOn) steer = steer / 1.9 - 0.8 * this.airOn;
    this.inp.yaw = clamp(steer, -1, 1);
    this.inp.airL = this.airOn < 0 ? 1 : 0;
    this.inp.airR = this.airOn > 0 ? 1 : 0;
    // the slam (Race attacks): alongside a hull in reach on a straight, now and then (by its aggression - the first
    // three far more readily at each other); a counter when one comes at it (mayCounter)
    if (this.counterAt != null && race.time >= this.counterAt) { this.slamNow = true; this.counterAt = null; }
    else if (race.canSlam(this.e) && !(r.slamCool > 0) && straight && !jump && !loop && race.racing && r.ghost <= 0 && this.rnd() < (top ? 5 : 1.2) * this.aggression * dt) {
      const t = race.reach(this.e);
      if (t && !(top && t.o.rank > 3 && this.rnd() < 0.7)) this.slamNow = true;
    }
    // speed: the line's limit just ahead (braking already folded in), traffic; flat out over a cut
    let vT = Infinity;
    for (let d = 0; d <= v * 0.3; d += 8) vT = Math.min(vT, VL[at(d)]);
    vT *= L.corner * (this.cornerK || 1);
    let vF = Math.min(vT, Math.max(20, follow));
    if (esc > 0.85 && Math.abs(cFF) > 0.002) vF = Math.min(vF, r.vs - 8);   // running wide in a bend: lift
    if (jump) vF = Math.max(vF, r.vs + 50);
    this.inp.throttleAxis = r.vs < vF ? 1 : clamp(1 - (r.vs - vF) * 0.15, 0, 1);
    this.inp.throttleDown = r.vs > vF + 8 ? 1 : 0;
    this.inp.drift = 0;                                  // (the drift is the player's: rivals never start one)
    // boost: where the lap ahead has room for the speed (never into a bend it would brake for), the tank never left
    // full; at once to finish a pass or to get back up to speed after a knock
    const E = r.boostEnergy;
    let room = Infinity;
    for (let d = 0; d < v * T.boostRoom; d += 16) room = Math.min(room, VL[at(d)]);
    const roomy = room > Math.min(375, v + 45) && !loop && follow > r.vs + 10;
    let boost = false;
    this.knockT = (r.slow || 0) > 3 ? 1.5 : Math.max(0, (this.knockT || 0) - dt);
    this.burstT = Math.max(0, (this.burstT || 0) - dt);
    if (L.boost === 'plan') {
      // in bursts (a flame flickering on and off reads as a fault): started with energy to spare, run down to the
      // dregs; started at once (with less) to finish a pass or after a knock
      const urgent = E > 0.15 && (this.passT > 0 || this.knockT > 0);
      if (!this.boostOn && roomy && ((E > T.boostHi && (v < T.boostVmax * this.race.track.speedK || E > 0.92)) || urgent)) { this.boostOn = true; this.burstT = 0.6; }
      else if (this.boostOn && (E < T.boostLo || (!roomy && this.burstT <= 0))) this.boostOn = false;
      boost = this.boostOn;
    } else {
      this.boostT = Math.max(0, this.boostT - dt);
      const want = 0.45 + (this.passT > 0 ? 2.0 : 0);
      if (this.boostT <= 0 && E > (this.passT > 0 ? 0.3 : 0.55) && roomy && this.rnd() < want * dt) { this.boostT = 1.2 + this.rnd() * 1.8; this.burstT = 0.6; }
      if (E < T.boostLo || (!roomy && this.burstT <= 0)) this.boostT = 0;       // a burst, then off (no flicker)
      boost = this.boostT > 0;
    }
    this.inp.boost = boost ? 1 : 0;
    return this.inp;
  }
}

export { Driver };

export class Race {
  // opts.sources: the loaded ship of each kind the rivals are cloned from ({ feather, rocket, heavy }; a kind missing
  // flies as a Feather); opts.mixed: false - Feathers in every rival slot; opts.kind: the player's ship; opts.livery:
  // the player's livery (a rival of its ship wears another); opts.name: the player's ship's name in the standings
  constructor(scene, track, player, playerRacer, opts = {}) {
    this.scene = scene;
    this.track = track;
    this.level = 'hard';
    this.entries = [];
    this.events = [];
    const rnd = mulberry32(31), src = { feather: opts.rivals || player, ...(opts.sources || {}) }, pk = opts.kind || 'feather';
    this.sources = src;                                  // (an online race's other players are cloned from these too)
    this.mp = null;                                      // an online race (multiplayer.js): its clock, the others' states
    const worn = {};
    let team = 1;
    for (let slot = 0; slot < TEAMS.length; slot++) {
      let e;
      if (slot === PLAYER_SLOT) {
        playerRacer.handling = HANDLING[pk] || HANDLING.feather;
        e = { ship: player, racer: playerRacer, team: opts.name ? { ...TEAMS[0], name: opts.name } : TEAMS[0], player: true, kind: pk };
      } else {
        const t = TEAMS[team++], want = opts.mixed === false ? 'feather' : RIVAL_SHIPS[slot] || 'feather';
        const kind = src[want] ? want : 'feather';
        // a Feather in its team's paint; a Comet or an Anvil in a livery of its own (not the one the player's wears)
        const ship = new Ship(null, { cloneOf: src[kind], team: kind === 'feather' ? t : null, lights: false, engine: t.engine });
        if (kind !== 'feather' && LIVERIES[kind]) {
          const names = LIVERIES[kind].names, pool = [...names.slice(1), names[0]].filter((n) => !(pk === kind && n === opts.livery));
          ship.kind = kind;
          ship.livery = pool[(worn[kind] = (worn[kind] ?? -1) + 1) % pool.length];
        }
        scene.add(ship.root);
        const racer = new TrackRacer(ship, track);
        racer.handling = HANDLING[kind];
        e = { ship, racer, team: t, player: false, kind };
        e.driver = new Driver(e, this, rnd, slot);
        e.engineDelay = 0.2 + rnd() * 1.0;
      }
      e.slot = e.home = slot;
      e.idx = this.entries.length;
      e.racer.onEvent = (ev) => this.onRacerEvent(e, ev);
      this.entries.push(e);
    }
    this.boxes();
    // the furthest a hull's centre gets from the middle - the widest ship's - the line, and each ship's speeds on it
    this.lim = track.W / 2 - Math.max(...this.entries.map((e) => e.ship.halfSpan)) * 0.92;
    this.replan();
    this.player = this.entries[PLAYER_SLOT];
    this.setDifficulty(this.level);
    this.reset();
  }

  // each pair's contact box (the hulls' half spans and lengths; a Feather pair: 9.8 x 12.8 m)
  boxes() {
    const E = this.entries, n = E.length;
    this.WID = new Float32Array(n * n); this.LEN = new Float32Array(n * n);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      this.WID[a * n + b] = (E[a].ship.halfSpan + E[b].ship.halfSpan) * 0.951;
      this.LEN[a * n + b] = ((E[a].ship.length || 13.34) + (E[b].ship.length || 13.34)) * 0.48;
    }
    this.touch = null;                                   // (collide's per-pair records, made again at the new size)
  }

  // the ships in the race: an online race's own - the player and the others online, no rivals - or (null) the grid of
  // rivals again. A ship left out is put away with its trails (left in the scene, they would hang there)
  useEntries(list) {
    const grid = (this.grid ||= this.entries), now = list || grid;
    for (const e of [...grid, ...this.entries]) if (!now.includes(e)) { e.ship.root.visible = false; e.ship.clearTrails(); }
    for (const e of now) e.ship.root.visible = true;
    this.entries = now;
    now.forEach((e, i) => (e.idx = i));
    this.boxes();
  }

  wid(a, b) { return this.WID[a.idx * this.entries.length + b.idx]; }
  len(a, b) { return this.LEN[a.idx * this.entries.length + b.idx]; }

  // the settings' "AI difficulty": the rivals' engines, pads, boost and racecraft (at once, mid-race too) - and which
  // of them is its ace (AI_LEVELS ace: the first of that ship on the grid; Feathers only: the front one)
  setDifficulty(level) {
    this.level = AI_LEVELS[level] ? level : 'hard';
    if (this.mp) return;                                 // (an online race: no rivals, its grid the host's)
    const A = AI_LEVELS[this.level].ace, rivals = this.entries.filter((e) => !e.player);
    const ace = A && (rivals.find((e) => e.kind === A.kind) || rivals[0]);
    for (const e of this.entries) e.ace = e === ace;
    // the ace on pole: it swaps grid slots with the one there (the grid takes it at the next reset - now, if the ships
    // are still sitting on it)
    const slots = this.entries.map((e) => e.slot);
    for (const e of this.entries) e.slot = e.home;
    if (ace) { const pole = this.entries.find((e) => e.slot === 0); [pole.slot, ace.slot] = [ace.slot, 0]; }
    for (const e of this.entries) if (e.driver) e.driver.slot = e.slot;
    if (this.state === 'grid' && this.entries.some((e, k) => e.slot !== slots[k])) this.reset();
    for (const e of this.entries) e.driver?.setLevel(this.level);
  }

  // fresh characters for the rivals (seeded): the balance checks race many grids
  reseed(seed) {
    const rnd = mulberry32(1000 + seed);
    for (const e of this.entries) if (e.driver) { e.driver.seed = [rnd(), rnd(), rnd(), rnd()]; e.driver.setLevel(this.level); }
  }

  // the plan again after a change to Driver.tune's line or limit settings (tuning, profile.js)
  replan() {
    this.plan = makePlan(this.track, this.lim, Driver.tune);
    this.vlims = {};
    for (const e of this.entries) this.vlims[e.kind] ||= e.kind === 'feather' ? this.plan.vlim : speedLimits(this.track, this.plan.c, Driver.tune, HANDLING[e.kind]);
  }

  // signed track distance a - b, wrapped to half a lap
  gap(a, b) {
    const L = this.track.length;
    let d = (a - b) % L;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  slot(k) {
    const row = Math.floor(k / 3), col = [0, -1, 1][k % 3];
    return { back: 26 + row * 30 + (col ? 7 : 0), x: col * 16 };
  }

  reset() {
    const tr = this.track, s0 = tr.start * tr.step;
    for (const e of this.entries) {
      const p = this.slot(e.slot);
      e.racer.place(s0 - p.back, e.ship.engineOn);
      e.racer.boostEnergy = 1;                      // (a drift's top-up past full doesn't carry onto the grid)
      e.racer.x = p.x;
      e.racer.locked = true;
      e.racer.pose(0);
      Object.assign(e, { progress: -p.back, lastS: e.racer.s, laps: [], lapStart: 0, finished: false, finishTime: null,
        clean: true, best: Infinity, wrecks: 0, dmgWall: 0, dmgShip: 0, underAttack: null, playerHitT: -99, airWas: 0 });
      e.racer.repair();
      e.driver?.reset();
      e.ship.clearTrails();
    }
    Object.assign(this, { state: 'grid', time: 0, count: 0, finishedAt: null, shown: false });
    this.stats = { contacts: 0, walls: 0, jolts: 0, falls: 0, wrecks: 0 };   // for the automated checks
    this.touch = null;
    this.score = { pads: 0, clean: 0, position: 0, fastest: 0 };
  }

  onRacerEvent(e, ev) {
    if (ev.type === 'pad') this.events.push({ type: 'padfx', i: ev.i, at: ev.at, player: e.player });
    if (ev.type === 'fall') { this.events.push({ type: 'fall', at: ev.at, player: e.player }); if (this.stats) this.stats.falls++; }
    if (ev.type === 'drift') e.ship.boostKick = Math.max(e.ship.boostKick || 0, 0.4 + 0.2 * ev.tier);
    if (ev.type === 'driftStart') e.ship.driftHop = 1;
    if (ev.type === 'drift' || ev.type === 'flip' || ev.type === 'driftTier' || ev.type === 'driftChain') {
      this.events.push({ type: ev.type, tier: ev.tier, at: ev.at, s: e.racer.s, player: e.player, entry: e });
      if (this.stats && ev.type === 'drift') this.stats.drifts = (this.stats.drifts || 0) + 1;
    }
    if (ev.type === 'scrape' && ev.wall) {
      e.ship.hit(new THREE.Vector3(-ev.side, 0, 0), ev.v / 18, e.ship.root.worldToLocal(ev.at.clone()));
      this.events.push({ type: 'wallfx', at: ev.at, v: ev.v, player: e.player });
    }
    if (ev.type === 'damage') {
      if (ev.why === 'wall') e.dmgWall += ev.amount; else e.dmgShip += ev.amount;
      // (thrown into a wall by the player's hit: still the player's doing - its hull stays up over it)
      if (!e.player && this.time - (e.playerHitT ?? -99) < 2) e.playerHitT = this.time;
      this.events.push({ type: 'damage', amount: ev.amount, why: ev.why, at: ev.at, player: e.player, entry: e });
    }
    if (ev.type === 'wreck') {
      e.wrecks++;
      if (this.stats) this.stats.wrecks++;
      e.ship.hit(new THREE.Vector3(0, 0, 1), 1.5, new THREE.Vector3(0, 0.5, 0));
      this.events.push({ type: 'wreck', at: ev.at, vel: ev.vel, player: e.player, entry: e });
    }
    if (!(this.state === 'racing' || this.state === 'finished') || e.finished) return;
    if (ev.type === 'scrape') { if (!e.player && ev.wall) this.stats.walls++; if (ev.v > 4) e.clean = false; }
    if (e.player && ev.type === 'pad') this.score.pads += 2;
    if (!e.player && ev.type === 'scrape' && ev.v > 5) this.events.push({ type: 'scrape', at: ev.at, v: ev.v, ai: true });
  }

  get racing() { return this.state === 'racing' || this.state === 'finished'; }

  step(dt, inp, playerActive) {
    const racing = this.racing;
    // (another player's ship online is hurt on its own screen: here its hull is what it last said)
    for (const e of this.entries) { e.racer.locked = !racing; e.racer.armed = racing && !e.finished && !e.remote && this.time >= DAMAGE.safe; }
    if (this.mp) this.mp.clock(this);                    // an online race: the lights and the race time by the room's clock
    else if (this.state === 'grid') {
      // the rivals' engines come alive with the player's; the lights start when everyone is ready
      if (this.player.ship.engineOn) {
        for (const e of this.entries) {
          if (e.player || e.ship.engineOn) continue;
          e.engineDelay -= dt;
          if (e.engineDelay <= 0) e.ship.setEngine(true);
        }
      }
      if (this.entries.every((e) => e.ship.ready)) { this.state = 'countdown'; this.count = 3; }
    } else if (this.state === 'countdown') {
      this.count -= dt;
      if (this.count <= 0) { this.state = 'racing'; this.time = 0; this.events.push({ type: 'go' }); }
    } else this.time += dt;
    for (const e of this.entries) {
      let d = 0;
      for (const o of this.entries) {
        if (o === e || o.racer.ghost > 0 || e.racer.ghost > 0) continue;
        const ds = this.gap(o.racer.s, e.racer.s);
        if (ds > 8 && ds < 45 && Math.abs(o.racer.x - e.racer.x) < 4.5 && e.racer.vs > 60) d = Math.max(d, 1 - (ds - 8) / 37);
      }
      e.racer.draft = (e.racer.draft || 0) + (d - (e.racer.draft || 0)) * Math.min(1, dt * 3);
    }
    // the order (the first three fight among themselves - Driver - so the ones behind can catch them)
    const order = racing ? this.standings() : null;
    order?.forEach((e, k) => (e.rank = k + 1));
    for (const e of this.entries) e.racer.leading = !!order && e.rank === 1;
    for (const e of this.entries) {
      if (e.player) { if (playerActive) e.racer.step(dt, inp); continue; }
      if (e.remote) { this.mp?.drive(e, dt); continue; }  // another player online: where its own screen says it is
      // a rubber band toward the player, only out of its sight (150 m+ away, full from 700 m): a rival far behind gets
      // a little more thrust, one far ahead (on the easier levels) a little less - never a visible surge near it
      const lead = this.player.progress - e.progress, far = smoothstep(150, 700, Math.abs(lead)), band = AI_LEVELS[this.level].band;
      e.racer.thrustScale = e.driver.pace * (1 + far * (lead > 0 ? band[0] : -band[1]));
      // one of the first three with open road behind it eases off (AI_LEVELS hold: up to that share of its engine, 60 -
      // 300 m clear) - the front stays a bunch that fights and slows itself down ("so those from behind can have a
      // chance of taking them")
      if (order && e.rank <= 3 && !e.finished) {
        const behind = order[e.rank], clear = behind ? e.progress - behind.progress : 0;
        e.racer.thrustScale *= 1 - (AI_LEVELS[this.level].hold || 0) * smoothstep(60, 300, clear);
      }
      e.racer.step(dt, !racing ? HOLD : e.finished ? e.driver.coast(dt) : e.driver.think(dt));
      e.racer.events.length = 0;
    }
    if (racing) { this.attacks(dt, playerActive, inp); this.unghost(); this.collide(dt, playerActive); }
    this.count_laps();
  }

  // The slam (track.js ATTACK), an ability on its own key: pressed with a hull in reach (reach: the HUD's arrow shows
  // the side) the ship snaps across at it - homing, it always lands (collide on contact, or here when the dash runs
  // out) - and is ready again slamCool s on (ships.js). Pressed within ATTACK.counter s of a slam at it: the double
  // attack (clash). The player's on Space (inp.slam); a rival's when its driver says (Driver slamNow: an attack or a
  // counter).
  attacks(dt, playerActive, inp) {
    for (const e of this.entries) {
      const r = e.racer;
      if (r.lunge) {
        const o = r.lunge.target, or = o.racer;
        r.lunge.t -= dt;
        if (or.ghost > 0 || r.ghost > 0) r.lunge = null;
        else if (r.lunge.t <= 0) this.slam(e, o);
        else {
          const dir = Math.sign(or.x - r.x) || r.lunge.dir;
          r.lunge.dir = dir;
          r.vx += dir * Math.min(Math.max(0, ATTACK.lunge - dir * r.vx), ATTACK.lungeAcc * dt);
        }
      }
      const press = e.player ? playerActive && !!inp?.slam : !!e.driver?.slamNow;
      if (e.driver) e.driver.slamNow = false;
      // (a ship without the slam - the Umbra - or a circuit without it neither throws one nor answers one)
      if (!press || !this.canSlam(e) || r.slamCool > 0 || r.ghost > 0 || e.finished || this.time < ATTACK.startLock) continue;
      const u = e.underAttack;                          // a slam at it within the window: hit back - a double attack
      if (u && !u.done && this.time - u.t <= ATTACK.counter && u.by.racer.ghost <= 0) { this.clash(u.by, e); continue; }
      const t = this.reach(e, 0, playerActive);
      if (!t) continue;
      r.slamCool = r.handling.slamCool || 10;
      r.lunge = { target: t.o, dir: t.side, t: ATTACK.lungeT };
      if (e.player) r.safe = Math.max(r.safe || 0, ATTACK.lungeT + ATTACK.selfSafe);   // (the dash and after: unhurt)
      t.o.underAttack = { by: e, t: this.time, done: false };
      t.o.driver?.mayCounter(this);
      this.events.push({ type: 'lunge', entry: e, target: t.o, dir: t.side, player: e.player });
    }
  }

  // a slam landing: the attacker stops dead where it hit; the other thrown across - the heavier the attacker against
  // it, the harder and the longer - knocked loose, off its heading, slowed and hurt. (It can still answer within the
  // window: clash.)
  slam(att, vic) {
    const A = att.racer, V = vic.racer, out = Math.sign(V.x - A.x) || A.lunge?.dir || 1;
    // a hull a slam cannot move (ships.js slamSlow: the Umbra's field takes the blow): not thrown, not knocked loose, not
    // hurt - it only loses that share of its speed; the attacker stops dead where it hit and gets no hull back for it
    if (V.handling.slamSlow) {
      V.slow = (V.slow || 0) + V.vs * V.handling.slamSlow;
      A.vx = 0; A.lunge = null;
      if (att.player) A.safe = Math.max(A.safe || 0, ATTACK.selfSafe);
      if (vic.underAttack?.by === att) vic.underAttack.done = true;
      this.stats.attacks = (this.stats.attacks || 0) + 1;
      if (att.player || vic.player) this.player.clean = false;
      const at = A.pos.clone().add(V.pos).multiplyScalar(0.5);
      vic.ship.hit(new THREE.Vector3(out, 0, 0), 0.6, vic.ship.root.worldToLocal(at.clone()));
      this.events.push({ type: 'attack', at, attacker: att, victim: vic, slam: false, absorbed: true, mass: 1,
        dir: V.pos.clone().sub(A.pos).projectOnPlane(this.track.frame(A.s).T).normalize() });
      return;
    }
    const mass = clamp((A.handling.mass || 1) / (V.handling.mass || 1), 0.4, 2.2);
    const hard = A.handling.slamThrow || 1;            // (the Anvil's: thrown harder, further)
    V.vx = out * Math.min(ATTACK.throw * mass * hard, ATTACK.cap * hard);
    V.knocked = ATTACK.knock * Math.min(1.5, mass);
    const kick = out * ATTACK.slamYaw * Math.min(1.5, mass);
    V.psi += kick; V.yawKick += kick;
    V.slow = (V.slow || 0) + V.vs * ATTACK.slamLoss * V.handling.impact;
    A.vx = 0; A.lunge = null;
    if (att.player) A.safe = Math.max(A.safe || 0, ATTACK.selfSafe);
    const u = vic.underAttack, hp = [A.health, V.health];
    this.ram(att, vic, ATTACK.slamMin, 1, mass);
    if (u && u.by === att) u.hp = hp;                   // (blocked within the window after all: clash gives it back)
    // a slam landed: hull back for the one who threw it (ATTACK.heal)
    const heal = Math.min(A.maxHealth - A.health, A.maxHealth * ATTACK.heal);
    if (heal > 0 && !(A.ghost > 0)) { A.health += heal; this.events.push({ type: 'heal', amount: heal, share: heal / A.maxHealth, entry: att, player: att.player }); }
    this.stats.attacks = (this.stats.attacks || 0) + 1;
    if (att.player || vic.player) this.player.clean = false;
    const at = A.pos.clone().add(V.pos).multiplyScalar(0.5);
    vic.ship.hit(new THREE.Vector3(out, 0, 0), 1.5, vic.ship.root.worldToLocal(at.clone()));
    this.events.push({ type: 'attack', at, attacker: att, victim: vic, slam: true, mass,
      dir: V.pos.clone().sub(A.pos).projectOnPlane(this.track.frame(A.s).T).normalize() });
  }

  // the double attack: a slam answered within the window - before it lands or after - the two meet and bounce off
  // each other; no one knocked loose, no one into the wall, no one hurt - nor by the touch that follows it
  clash(att, def) {
    const A = att.racer, D = def.racer, out = Math.sign(D.x - A.x) || 1;
    if (def.underAttack) def.underAttack.done = true;
    A.lunge = null; D.lunge = null;
    A.vx = -out * ATTACK.bounce; D.vx = out * ATTACK.bounce;
    A.knocked = 0; D.knocked = 0;
    D.slamCool = D.handling.slamCool || 10;
    // (answered after the slam landed: what it took is given back; and for a moment neither can be hurt - not by the
    // touch that follows, not by a wall the bounce carries it into)
    const u = def.underAttack;
    if (u?.hp && u.by === att) { A.health = u.hp[0]; D.health = Math.max(D.health, u.hp[1]); }     // (and the slam's heal taken back)
    A.safe = D.safe = 0.8;
    for (const [e, r] of [[att, A], [def, D]]) if (e.player) r.safe = Math.max(r.safe, ATTACK.selfSafe);
    const n = this.entries.length, ia = this.entries.indexOf(att), ib = this.entries.indexOf(def);
    if (this.hurtT) this.hurtT[Math.min(ia, ib) * n + Math.max(ia, ib)] = 0.8;
    const at = A.pos.clone().add(D.pos).multiplyScalar(0.5);
    att.ship.hit(new THREE.Vector3(-out, 0, 0), 1, att.ship.root.worldToLocal(at.clone()));
    def.ship.hit(new THREE.Vector3(out, 0, 0), 1, def.ship.root.worldToLocal(at.clone()));
    this.events.push({ type: 'clash', at, a: att, b: def, dir: D.pos.clone().sub(A.pos).projectOnPlane(this.track.frame(A.s).T).normalize() });
  }

  // whether e may slam at all: not the Umbra (ships.js slam: false), not on a circuit without it (layout slam: false)
  canSlam(e) { return e.racer.handling.slam !== false && this.track.slam !== false; }

  // the nearest hull in reach of e's slam on side dir (+1 right, -1 left, 0 either): { o, side } or null
  reach(e, dir = 0, playerActive = true) {
    const r = e.racer;
    if (r.ghost > 0 || r.y > 4 || e.finished) return null;
    let best = null, bx = Infinity;
    for (const o of this.entries) {
      if (o === e || o.racer.ghost > 0 || (o.player && !playerActive) || Math.abs(o.racer.y - r.y) > 4) continue;
      const ds = this.gap(o.racer.s, r.s), dx = o.racer.x - r.x, side = Math.sign(dx) || 1;
      if (Math.abs(ds) > this.len(e, o) * 0.9 || (dir && side !== dir)) continue;
      const air = Math.abs(dx) - this.wid(e, o), range = e.rank <= 3 && o.rank <= 3 ? ATTACK.range + 2 : ATTACK.range;
      if (air <= range && air < bx) { bx = air; best = { o, side }; }
    }
    return best;
  }

  // the HUD's arrow: a slam coming at the player it can still answer (+-2: the side it comes from), else a hull in
  // reach of its slam (+-1), 0 - only with its slam ready
  // the player's slam charge for the HUD: filling over the start's lock, then its own
  slamCharge() {
    if (!this.canSlam(this.player)) return 0;                     // (no slam: no meter filling over the start's lock either)
    return this.racing && this.time < ATTACK.startLock ? this.time / ATTACK.startLock : this.player.racer.slamCharge;
  }

  attackSide() {
    const p = this.player, r = p.racer, u = p.underAttack;
    if (!this.racing || !this.canSlam(p) || r.slamCool > 0 || r.ghost > 0 || this.time < ATTACK.startLock) return 0;
    if (u && !u.done && this.time - u.t <= ATTACK.counter) return 2 * (Math.sign(u.by.racer.x - r.x) || 1);
    return this.reach(p)?.side || 0;
  }

  // a ghost's time runs out only clear of every other hull (it would come back solid inside one)
  unghost() {
    const E = this.entries;
    for (const e of E) {
      const r = e.racer;
      if (!(r.ghost > 0 && r.ghost < 0.05)) continue;
      for (const o of E) {
        if (o === e || o.racer.ghost > 0) continue;
        if (Math.abs(this.gap(o.racer.s, r.s)) < this.len(e, o) && Math.abs(o.racer.x - r.x) < this.wid(e, o)) { r.ghost = 0.05; break; }
      }
    }
  }

  // a knock between two ships: each takes the other's ram (ships.js) - by the closing speed past a brush and by the
  // speed (none at the grid's crawl), at a lower rate than a wall's. atk: an airbrake attack (+1 a on b, -1 b on a) -
  // the one attacked takes ATTACK.dmg times its share, the attacker ATTACK.keep of its own
  ram(ea, eb, v, atk = 0, mass = 1) {
    const k = DAMAGE.ship * Math.max(0, v - DAMAGE.shipGraze) * damageSpeed(Math.max(ea.racer.vs, eb.racer.vs) / speedScale(this.track, Math.max(ea.racer.vs, eb.racer.vs), ea.racer.handling));
    if (k <= 0 || this.time < DAMAGE.safe) return;
    if (ea.player) eb.playerHitT = this.time;          // (the HUD: the hull of a rival the player has just hurt)
    if (eb.player) ea.playerHitT = this.time;
    ea.racer.hurt(k * (eb.racer.handling.ram || 1) * (atk < 0 ? ATTACK.dmg * mass : atk > 0 ? ATTACK.keep : 1), 'ship');
    eb.racer.hurt(k * (ea.racer.handling.ram || 1) * (atk > 0 ? ATTACK.dmg * mass : atk < 0 ? ATTACK.keep : 1), 'ship');
  }

  // Ship to ship. Overlaps are pushed apart over a few steps (soft: a hull jumping sideways by the whole overlap in
  // one step read as a stutter) and the closing speed is traded between the two. The jolt, the shield flash and the
  // sparks come once per contact - or again for a fresh blow - never on every step two hulls stay touching.
  collide(dt, playerActive) {
    const E = this.entries, n = E.length, SOFT = 0.35;
    if (!this.touch) { this.touch = new Float32Array(n * n); this.knock = new Float32Array(n * n); this.hurtT = new Float32Array(n * n); }
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const key = a * n + b, LEN = this.LEN[key], WID = this.WID[key];
        this.knock[key] = Math.max(0, this.knock[key] - dt);
        this.hurtT[key] = Math.max(0, this.hurtT[key] - dt);
        const A = E[a].racer, B = E[b].racer;
        const ds = this.gap(B.s, A.s), dx = B.x - A.x;
        if (((E[a].player || E[b].player) && !playerActive) || A.y > 4 || B.y > 4 ||  // one over the other in the air
          A.ghost > 0 || B.ghost > 0 ||                                             // a wreck being flown through
          Math.abs(ds) >= LEN || Math.abs(dx) >= WID) { this.touch[key] = 0; continue; }
        const limA = this.track.W / 2 - E[a].ship.halfSpan * 0.92, limB = this.track.W / 2 - E[b].ship.halfSpan * 0.92;
        const first = this.touch[key] === 0;
        this.touch[key] += dt;
        if (first) this.stats.contacts++;
        const ox = WID - Math.abs(dx), os = LEN - Math.abs(ds);
        let v = 0, side = 0, atk = 0;
        if (ox < os * 0.75) {                                // side by side: pushed apart sideways
          // at most 25 cm a step: two hulls landing on each other after a jump overlapped by metres and were shoved
          // apart in two or three lurches; the traded speed does the rest
          const sx = Math.sign(dx || 1), push = Math.min(0.25, (ox * SOFT) / 2);
          // a slam landing (the dash homing on the other): that hull holds where it hit, the other takes the push
          const atkA = A.lunge?.target === E[b], atkB = B.lunge?.target === E[a];
          atk = atkA === atkB ? 0 : atkA ? 1 : -1;
          // (a hull a slam cannot move holds its line: the attacker takes the push)
          if (atk > 0) { if (B.handling.slamSlow) A.x -= sx * push * 2; else B.x += sx * push * 2; }
          else if (atk < 0) { if (A.handling.slamSlow) B.x += sx * push * 2; else A.x -= sx * push * 2; }
          else { A.x -= sx * push; B.x += sx * push; }
          // never through a wall: the one pinned there stays, the other takes the whole separation
          if (Math.abs(A.x) > limA) { B.x += sx * (Math.abs(A.x) - limA); A.x = Math.sign(A.x) * limA; }
          if (Math.abs(B.x) > limB) { A.x -= sx * (Math.abs(B.x) - limB); B.x = Math.sign(B.x) * limB; }
          if (atk) this.slam(atk > 0 ? E[a] : E[b], atk > 0 ? E[b] : E[a]);
          else {
            const rel = B.vx - A.vx;
            if (rel * sx < 0) {
              const j = rel * 0.6;
              A.vx += j; B.vx -= j;
              v = Math.abs(rel);
              if (first || this.knock[key] <= 0) {                // a side swipe costs both a little - once a blow
                const loss = 0.05 * Math.min(1, v / 15);
                A.slow = (A.slow || 0) + A.vs * loss * A.handling.impact; B.slow = (B.slow || 0) + B.vs * loss * B.handling.impact;
              }
            }
            if (this.hurtT[key] <= 0 && v > DAMAGE.shipGraze) { this.hurtT[key] = 0.35; this.ram(E[a], E[b], v); }
          }
          side = sx;
        } else {
          // nose to tail: the rammer pays - its closing speed and a share of its own - and the one hit is knocked off
          // its line and loses a little (it used to be shoved forward: "if they hit me in the back i get a speed bump")
          const [rear, front] = ds > 0 ? [A, B] : [B, A];
          if (rear.vs > front.vs) {
            // the closing speed goes at once-ish (half of it a step: ~25 ms, so the hulls stop running into each
            // other); the penalty is charged ONCE per blow - charged every step of contact it piled up while the
            // hulls overlapped and both ships ground to a halt ("i hit a player and we both get stuck")
            const dv = rear.vs - front.vs, k = Math.min(1, dv / 15);
            rear.vs -= dv * 0.5;
            if (this.hurtT[key] <= 0 && dv > DAMAGE.shipGraze) { this.hurtT[key] = 0.35; this.ram(E[a], E[b], dv); }
            if (first || this.knock[key] <= 0) {
              rear.slow = (rear.slow || 0) + 0.04 * rear.vs * k * rear.handling.impact;
              front.slow = (front.slow || 0) + front.vs * 0.03 * k * front.handling.impact;
              const kick = (Math.random() - 0.5) * 0.16 * k;
              front.psi += kick; front.yawKick += kick;
              front.vx += (Math.random() - 0.5) * dv * 0.35;
            }
            v = dv;
          }
          const push = Math.min(0.25, (os * SOFT) / 2);
          rear.s = this.track.wrap(rear.s - push);
          front.s = this.track.wrap(front.s + push);
        }
        A.pose(0);
        B.pose(0);
        if (v <= 3 || !(first || (v > 8 && this.knock[key] <= 0))) continue;
        this.knock[key] = 0.35;
        this.stats.jolts++;
        // the hulls jolt apart, the shields light where they met
        const at = A.pos.clone().add(B.pos).multiplyScalar(0.5), k = v / 12;
        if (side) {
          E[a].ship.hit(new THREE.Vector3(-side, 0, 0), k, E[a].ship.root.worldToLocal(at.clone()));
          E[b].ship.hit(new THREE.Vector3(side, 0, 0), k, E[b].ship.root.worldToLocal(at.clone()));
        } else {
          const aRear = ds > 0;
          E[a].ship.hit(new THREE.Vector3(0, 0, aRear ? 1 : -1), k, E[a].ship.root.worldToLocal(at.clone()));
          E[b].ship.hit(new THREE.Vector3(0, 0, aRear ? -1 : 1), k, E[b].ship.root.worldToLocal(at.clone()));
        }
        if (v > 6) {                                       // a real hit: sparks (a brush is silent)
          if (E[a].player || E[b].player) {
            this.player.clean = false;
            this.events.push({ type: 'bump', at, v });
          }
          else this.events.push({ type: 'scrape', at, v, ai: true });
        }
      }
    }
  }

  count_laps() {
    const L = this.track.length;
    for (const e of this.entries) {
      const d = this.gap(e.racer.s, e.lastS);
      e.lastS = e.racer.s;
      if (!this.racing || e.finished || e.remote) continue;   // (another player's laps: its own screen's - multiplayer.js)
      e.progress += d;
      const done = Math.min(LAPS, Math.floor(Math.max(0, e.progress) / L));
      while (e.laps.length < done) {
        const t = this.time - e.lapStart;
        e.laps.push(t);
        e.best = Math.min(e.best, t);
        e.lapStart = this.time;
        if (e.player) {
          if (e.clean) this.score.clean += 5;
          this.events.push({ type: 'lap', lap: e.laps.length, time: t, clean: e.clean });
        }
        e.clean = true;
      }
      if (e.progress >= LAPS * L) {
        e.finished = true;
        e.finishTime = this.time;
        if (e.player) this.finishPlayer();
      }
    }
  }

  standings() {
    return [...this.entries].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
  }

  position(e = this.player) { return this.standings().indexOf(e) + 1; }

  finishPlayer() {
    this.state = 'finished';
    this.finishedAt = this.time;
    const pos = this.position();
    this.score.position = POINTS[pos - 1] || 0;
    const p = this.player.best;
    this.score.fastest = this.entries.every((e) => e.player || !(e.best < p)) ? 5 : 0;
    this.events.push({ type: 'finish', pos });
  }

  get total() { const s = this.score; return s.pads + s.clean + s.position + s.fastest; }

  // the table: finishers by time, the rest by a projection from their pace so far
  results() {
    const L = this.track.length;
    const rows = this.standings().map((e) => {
      let time = e.finishTime, est = false;
      if (!e.finished) {
        const avg = Math.max(30, (e.progress + 120) / Math.max(1, this.time));
        time = this.time + (LAPS * L - e.progress) / avg;
        est = true;
      }
      return { name: e.team.name, css: e.team.css, time, est, best: e.best, player: e.player, kind: e.kind, wrecks: e.wrecks };
    });
    rows.sort((a, b) => a.time - b.time);
    return rows;
  }

  hud() {
    const p = this.player;
    return { pos: this.position(), total: this.entries.length, lap: Math.min(LAPS, p.laps.length + 1), laps: LAPS,
      time: this.racing ? (p.finished ? p.finishTime : this.time) : NaN, last: p.laps.length ? p.laps[p.laps.length - 1] : Infinity,
      best: p.best, score: this.total, state: this.state, count: this.count,
      others: this.entries.filter((e) => !e.player).map((e) => ({ x: e.racer.pos.x, z: e.racer.pos.z, css: e.team.css })) };
  }

  // per frame: rivals' poses (between their last two physics steps), detail level, engines, plumes
  visuals(dt, camera, fx, scene, focalPx = 1000) {
    for (const e of this.entries) {
      const r = e.racer;
      if (camera.position.distanceToSquared(r.pos) > 220 * 220) continue;
      if (r.drift) fx.drift(e.ship, r, this.track.frame(r.s), dt, e.player);
      else if (r.skids) r.skids.on = false;
      if (!(r.grind > 0)) continue;
      const f = this.track.frame(r.s);
      fx.grind(f.P.clone().addScaledVector(f.R, r.grindSide * this.track.W / 2).addScaledVector(f.U, 1.0).addScaledVector(f.T, -2), r.vel, r.grindSide, dt, f);
    }
    for (const e of this.entries) {
      const r = e.racer, ship = e.ship;
      // (the player's ship by where it is drawn: in free flight its race entry stays parked on the track, and the
      // distance to that put the ship flown up close on its far detail level - "the meshes get downgraded")
      ship.setLod(camera.position.distanceTo(e.player ? ship.root.position : (r.rPos || r.pos)), focalPx);
      if (!e.player) {
        ship.root.position.copy(r.rPos || r.pos);
        ship.root.quaternion.copy(r.rQ || r.q);
        ship.root.updateMatrixWorld(true);
        ship.update(dt, { throttle: r.throttle, boost: r.boosting, speed: r.speed, turn: r.turn, ...r.animState() }, scene, camera);
        if (camera.position.distanceToSquared(r.pos) < 160 * 160) fx.exhaust(ship, r, dt);
      }
      // a hull under half smokes, under a quarter burns (fx.damaged): who is hurt shows
      const hp = r.health / r.maxHealth;
      if (this.racing && hp < 0.5 && !(r.ghost > 0) && camera.position.distanceToSquared(r.pos) < 300 * 300) fx.damaged(ship, r, hp, dt, e.player);
      // thrown by a slam: a streak of sparks torn off it on its way to the wall
      if (this.racing && r.knocked > 0.2 && Math.abs(r.vx) > 25 && camera.position.distanceToSquared(r.pos) < 250 * 250) fx.thrown(ship, r, dt);
    }
  }

  // everything of the rivals' that must not darken the AO pass
  noAO() {
    return this.entries.flatMap((e) => e.ship.fxObjects());
  }
}
