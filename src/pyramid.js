// The Pyramid Run: a speed circuit. The grid stands on a highway in orbit over a desert planet; the road runs nearly
// straight for ten kilometres - three long jumps between its spans, boost pads to be hit, obstacles standing on the
// deck - then dives at the planet, touches down on its sand near the pole and races up the curve of the world into a
// colossal pyramid. Inside, the floor falls away: the road pitches over into the pyramid's root, a shaft that goes
// straight down into the planet, levels out in the dark kilometres under the surface, sweeps round and climbs out of
// a crater on the planet's flank, launching back into space and round to the grid. Every ship's top speed is
// layout.speedK times its usual here (track.js TrackRacer): the straights and the boosts are what count.
import * as THREE from 'three';
import { Track, TRACK_W, layout, CAVE_R, CAVE_MOUTH } from './track.js';
import { bakeLater } from './bake.js';
import { Q } from './quality.js';
import { mulberry32 } from './noise.js';
import { stars } from './space.js';
import { sunMeshes } from './celestial.js';
import { setCave } from './look.js';
import { hullMaps, hullMaterial, hullBox } from './hull.js';
import { rockMaps } from './rock.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { egyptMaterial, fallenObeliskGeometry, brokenColumnGeometry, buildRuins, buildTomb, bakedShadowsOnly, BRAZIER } from './egypt.js';

export const SUN_DIR = new THREE.Vector3(0.78, 0.46, 0.42).normalize();     // toward the sun: right, behind, up
const SUN_E = 5.2;
export const SHADOW_HALF = 10, SHADOW_NEAR = 300, SHADOW_FAR = 500;
export const MID_HALF = 45, MID_NEAR = 250, MID_FAR = 550;
export const FAR_HALF = 170, FAR_NEAR = 100, FAR_FAR = 900;
// the planet (a small desert world, so the road can reach it) and the pyramid on its pole
export const PLANET_C = new THREE.Vector3(0, -6600, -16000), PLANET_R = 6000;
export const PYR = { half: 1200, base: -850, apex: 950, wall: 30, floor: -720, gateW: 85, gateH: 120 };
const ZC = PLANET_C.z;
const surfY = (x, z) => PLANET_C.y + Math.sqrt(Math.max(0, PLANET_R ** 2 - x * x - (z - ZC) ** 2));
// the crater the road climbs out of, on the planet's flank
const EXIT = new THREE.Vector3(3306, -2874, -12634);

const P = [];
const pt = (x, y, z, bank = 0, name = null) => P.push([x, y, z, bank, name]);
// a point on the planet's surface on the meridian toward the grid (x = 0), th degrees from the pole, h m over it
const onPlanet = (th, h = 2.5) => {
  const a = THREE.MathUtils.degToRad(th);
  return [0, PLANET_C.y + (PLANET_R + h) * Math.cos(a), ZC + (PLANET_R + h) * Math.sin(a)];
};
// A jump: the deck rises over a crest (a circle of radius R in the vertical, points every 150 m along it) and the cut
// opens at its top. Off the lip the field's hold drops to a weak pull while the deck falls away under the hull faster
// than that at racing speed (v^2 / R: ~100 m/s2 at 700 m/s), so a fast ship carries over the cut and lands on the
// slope past it; under ~350 m/s it sinks into the cut. On a straight deck a cut of 400 m let it sink 3-4 m - every
// ship struck the far lip. dir: -1 heading -z, +1 heading +z
const crest = (x, z0, y0, name, dir = -1, R = 15000, half = 2500) => {
  for (let d = -half; d <= half + 1; d += 250) pt(x, y0 - (d * d) / (2 * R), z0 + dir * d, 0, d === 0 ? name : null);
};
// the orbital highway, low beside the planet - its upper half filling the sky ahead, the pyramid on top - ten
// kilometres of straight over three crests, a long jump off each
// (dead straight in plan through both jumps: a road bending even gently across a cut slid a landing ship 20-30 m
// sideways at these speeds - into the wall)
pt(-1200, -3600, 4000, 0, 'start');
crest(-1200, 1200, -3400, 'ramp1');
crest(-1200, -4200, -3430, 'ramp2');
pt(-1150, -3660, -7300); pt(-1000, -3690, -7900, 0, 'dive'); pt(-500, -3700, -9300);
// the road bends up onto the planet's flank (an arc of 1.27 km, 55 deg) and climbs the curve of the world to the
// pyramid near its pole (points every 2.5 deg: the sphere bulges between them less than the deck sits over it)
pt(0, -3657, -10374); pt(0, -3530, -10680); pt(0, -3328, -10943);
for (let th = 55; th >= 15; th -= 2.5) pt(...onPlanet(th), 0, th === 50 ? 'land' : th === 15 ? 'gate' : null);
pt(...onPlanet(12.6, 3));
pt(0, PYR.floor + 2.5, -14820);
// inside: across the hall, then over the edge into the shaft (a crest of 700 m: at twice the speed of an ordinary
// circuit the field still holds the hull to the deck over it), straight down, and out along the bottom
// the bends as exact arcs, a point every 7.5 deg (a spline through a few points bent tighter between them): the crest
// over the edge 900 m round - over a crest the field holds a hull only while the deck bends wider than ~560 m (its
// pull grows with v^2 as fast as the throw does), at 400 m the pack flew off it at 1,400 m/s - the shaft's foot too
const arc = (cy, cz, R, a0, a1, x = 0, step = 7.5, name0 = null, name1 = null) => {
  const n = Math.round(Math.abs(a1 - a0) / step);
  for (let k = 0; k <= n; k++) {
    const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * k / n);
    pt(x, cy + R * Math.cos(a), cz + R * Math.sin(a), 0, k === 0 ? name0 : k === n ? name1 : null);
  }
};
pt(0, PYR.floor + 2, -14960, 0, 'shaftIn');
arc(PYR.floor + 2 - 900, -14980, 900, 0, -90);              // over the edge: heading -z, then straight down at z -15880
pt(0, -2400, -15880); pt(0, -2700, -15880);
arc(-2700, -16780, 900, 90, 180, 0, 7.5, null, 'shaftOut');   // the foot: down, then heading -z at y -3600
// under the surface: one sweeping turn in the dark, a half turn 3 km across (1.5 km round at its middle) with its bend
// eased in and out over 600 m (a clothoid's ramp: stepped straight onto a circle and off it the hull was thrown across
// the deck at each end), then straight up to the crater. (4.8 km across, the eased turn's corners - squarer than a
// circle's - came up through the planet's sand: kept this close to its axis it runs well over a kilometre down)
{
  const Lr = 600, Lc = 4080.8, k0 = Math.PI / (Lr + Lc), S = 2 * Lr + Lc, N = 22;   // (Lc: 3 km across)
  let x = 0, z = -17000, phi = 0, s = 0;
  pt(0, -3600, -17000);
  for (let k = 1; k < N; k++) {
    for (const e = (S * k) / N; s < e - 1e-6;) {
      const h = Math.min(1, e - s), m = s + h / 2, c = k0 * Math.min(1, m / Lr, (S - m) / Lr), pm = phi + (c * h) / 2;
      x += Math.sin(pm) * h; z -= Math.cos(pm) * h; phi += c * h; s += h;
    }
    pt(x, -3600 + (20 * k) / N, z, 0);
  }
}
// the climb: steepening as it goes (deep under the sand until the last few hundred metres), out through the planet's
// flank at ~45 deg - the bore's mouth inside the crater's hole
pt(3000, -3580, -17000); pt(3010, -3570, -16300); pt(3040, -3480, -15300); pt(3110, -3290, -14300); pt(3210, -3080, -13400);
pt(EXIT.x, EXIT.y, EXIT.z, 0, 'exit');
// launched off the planet's flank, back out along it and round to the grid
pt(3200, -2700, -11400); pt(3050, -2900, -9200); pt(2700, -3250, -5000, 0, 'back'); pt(2000, -3500, -2700);
crest(1900, 1300, -3300, 'ramp4', 1);
// the hairpin back onto the grid's straight: an exact half circle 1.55 km round
pt(1900, -3500, 4300);
for (let k = 1; k <= 11; k++) { const a = Math.PI * k / 12; pt(350 + 1550 * Math.cos(a), -3510 - 80 * k / 12, 4300 + 1550 * Math.sin(a)); }
pt(-1200, -3598, 4300);

export const PYRAMID_LAYOUT = layout(P, {
  start: [-1200, -3600, 4000],
  speedK: 2.0,
  slam: false,                                        // (no slam here: race.js canSlam)
  width: 112,                                         // (twice an ordinary circuit's road)
  loops: [['shaftIn', 'shaftOut']],                   // (the shaft's frames: carried down without twist, as a loop's)
  gaps: [['ramp1', 10, 810], ['ramp2', 10, 860], ['ramp4', 10, 810]],
  caves: [['gate', 360, 'exit', 30]],                // the pyramid's hall, its root and the tunnels: no sky, no sun
  // pads and obstacles laid so a line through the pads always has a clean way past the blocks: never a block in a
  // pad's lane soon after it, lateral moves well over a second apart (at 1,400 m/s a second is 1.4 km); the pads in
  // rows across the road - take one and the boost you carry is the race; after a jump the row is past the touchdown
  // (~1.9 km on: under the flight no one could reach them)
  pads: [['start', 600, 0], ['start', 1600, -22], ['start', 1600, 22], ['ramp1', -500, 0], ['ramp1', 2300, -24], ['ramp1', 2300, 0],
    ['ramp1', 2300, 24], ['ramp2', -500, 0], ['ramp2', 2300, -20], ['ramp2', 2300, 20], ['dive', 600, 0], ['dive', 1800, -22],
    ['dive', 1800, 22], ['land', 150, 0], ['land', 900, -20], ['land', 900, 20], ['gate', -280, 0], ['shaftOut', 400, 0],
    ['shaftOut', 2000, -16], ['shaftOut', 2000, 16], ['exit', -1200, 0], ['exit', 300, -18], ['exit', 300, 18], ['back', -1800, 0],
    ['back', 0, -24], ['back', 0, 24], ['back', 2400, 0], ['ramp4', -500, 0], ['ramp4', 2300, 0]],
  // the obstacles on the deck: [point, m from it, across, width, height, length, kind] - armoured hazard blocks and
  // long hazard walls (arrows racing along their flanks), fallen obelisks and broken columns from the ruins; a beacon
  // on each out under the sky. Laid by rule, a group every ~300-650 m wherever the road allows: clear of the jumps'
  // run-ups and landings, the pyramid, the shaft and the crater's mouth, 220 m clear of each other, never just before a
  // pad nor in its lane just after it; in a bend only on its outside, the line through it untouched
  blocks: [
    ['start', 1000, -30, 18, 9, 8], ['start', 1250, -24, 12, 20, 12, 'column'], ['start', 1250, 24, 12, 20, 12, 'column'], ['start', 1940, 0, 14, 24, 14, 'column'],
    ['start', 2700, -32, 14, 9, 8], ['start', 2700, 32, 14, 9, 8], ['ramp1', 3268, -34, 14, 9, 8], ['ramp1', 3268, 34, 14, 9, 8],
    ['ramp1', 3600, -36, 16, 9, 8], ['ramp1', 3600, 36, 16, 9, 8], ['ramp1', 3824, -30, 18, 9, 8], ['ramp1', 4078, 30, 18, 9, 8],
    ['ramp1', 4488, 40, 8, 8, 200, 'wall'], ['ramp2', 3300, -30, 18, 9, 8], ['ramp2', 3574, -28, 12, 12, 60, 'obelisk'], ['dive', 228, 0, 6, 7, 130, 'wall'],
    ['dive', 900, 30, 16, 9, 8], ['dive', 1158, -24, 12, 20, 12, 'column'], ['dive', 1158, 24, 12, 20, 12, 'column'], ['dive', 1528, -32, 16, 9, 8],
    ['dive', 3200, -30, 16, 9, 8], ['dive', 3200, 30, 16, 9, 8], ['dive', 3438, -26, 12, 20, 12, 'column'], ['dive', 3438, 26, 12, 20, 12, 'column'], ['dive', 3828, -34, 14, 9, 8],
    ['dive', 3828, 34, 14, 9, 8], ['land', 450, -34, 12, 16, 12], ['land', 450, 34, 12, 16, 12], ['land', 1500, 0, 6, 7, 130, 'wall'],
    ['land', 2142, 40, 8, 8, 175, 'wall'], ['land', 2472, -34, 14, 9, 8], ['land', 2472, 34, 14, 9, 8], ['land', 2792, 0, 6, 7, 170, 'wall'],
    ['land', 3102, 30, 18, 9, 8], ['land', 3518, -38, 10, 18, 10], ['land', 3518, 38, 10, 18, 10], ['shaftOut', 1372, -32, 16, 9, 8],
    ['shaftOut', 1642, -28, 12, 12, 60, 'obelisk'], ['shaftOut', 2972, -32, 16, 9, 8], ['shaftOut', 3232, -28, 12, 12, 60, 'obelisk'], ['shaftOut', 3622, -32, 16, 9, 8],
    ['shaftOut', 3892, -28, 12, 12, 60, 'obelisk'], ['shaftOut', 4272, -32, 16, 9, 8], ['shaftOut', 5222, -32, 16, 9, 8], ['shaftOut', 5482, -28, 12, 12, 60, 'obelisk'],
    ['shaftOut', 5872, -30, 18, 9, 8], ['shaftOut', 6112, -24, 12, 20, 12, 'column'], ['shaftOut', 6112, 24, 12, 20, 12, 'column'], ['shaftOut', 6522, -34, 14, 9, 8],
    ['shaftOut', 6522, 34, 14, 9, 8], ['shaftOut', 6772, -26, 12, 20, 12, 'column'], ['shaftOut', 6772, 26, 12, 20, 12, 'column'], ['shaftOut', 7012, -34, 14, 9, 8], ['shaftOut', 7012, 34, 14, 9, 8],
    ['shaftOut', 7252, 30, 18, 9, 8], ['shaftOut', 7556, -34, 14, 9, 8], ['shaftOut', 7556, 34, 14, 9, 8], ['shaftOut', 7792, -24, 12, 20, 12, 'column'],
    ['shaftOut', 7792, 24, 12, 20, 12, 'column'], ['shaftOut', 8222, -30, 18, 9, 8], ['shaftOut', 8452, -34, 14, 9, 8], ['shaftOut', 8452, 34, 14, 9, 8],
    ['shaftOut', 9122, 30, 18, 9, 8], ['shaftOut', 9382, 30, 18, 9, 8], ['exit', 686, 40, 8, 8, 110, 'wall'], ['exit', 1266, 0, 6, 7, 130, 'wall'],
    ['exit', 1556, 30, 18, 9, 8], ['exit', 1916, -34, 14, 9, 8], ['exit', 1916, 34, 14, 9, 8], ['exit', 2156, -24, 12, 20, 12, 'column'],
    ['exit', 2156, 24, 12, 20, 12, 'column'], ['exit', 2566, 40, 8, 8, 175, 'wall'], ['exit', 2906, -34, 14, 9, 8], ['exit', 2906, 34, 14, 9, 8],
    ['exit', 3216, 0, 6, 7, 170, 'wall'], ['exit', 3536, -30, 18, 9, 8], ['exit', 3866, -40, 8, 8, 150, 'wall'], ['exit', 4166, -34, 14, 9, 8],
    ['exit', 4166, 34, 14, 9, 8], ['exit', 4516, -34, 14, 9, 8], ['exit', 4516, 34, 14, 9, 8], ['exit', 4766, 30, 18, 9, 8],
    ['exit', 5166, -40, 8, 8, 175, 'wall'], ['exit', 5486, -24, 12, 20, 12, 'column'], ['exit', 5486, 24, 12, 20, 12, 'column'], ['exit', 6236, -34, 14, 9, 8],
    ['exit', 6236, 34, 14, 9, 8], ['exit', 6476, 30, 18, 9, 8], ['exit', 6800, -34, 14, 9, 8], ['exit', 6800, 34, 14, 9, 8], ['exit', 7046, -24, 12, 20, 12, 'column'],
    ['exit', 7046, 24, 12, 20, 12, 'column'], ['exit', 7286, -26, 12, 20, 12, 'column'], ['exit', 7286, 26, 12, 20, 12, 'column'], ['back', 366, 30, 18, 9, 8], ['back', 606, -26, 12, 20, 12, 'column'],
    ['back', 846, 26, 12, 20, 12, 'column'], ['back', 1200, -34, 16, 9, 8], ['back', 1200, 34, 16, 9, 8], ['back', 1446, -34, 14, 9, 8],
    ['back', 1446, 34, 14, 9, 8], ['back', 1866, -34, 14, 9, 8], ['back', 1866, 34, 14, 9, 8], ['back', 2766, 32, 16, 9, 8],
    ['back', 3006, 30, 18, 9, 8], ['back', 3246, 24, 12, 20, 12, 'column'], ['back', 3600, 0, 6, 7, 150, 'wall'],
    ['back', 3936, 28, 12, 12, 60, 'obelisk'], ['back', 4266, 32, 16, 9, 8], ['back', 4536, -28, 12, 12, 60, 'obelisk'], ['back', 4916, 40, 8, 8, 200, 'wall'],
    ['back', 5256, 0, 14, 24, 14, 'column'], ['back', 5566, 0, 6, 7, 130, 'wall'], ['ramp4', 2900, -32, 16, 9, 8], ['ramp4', 2900, 32, 16, 9, 8],
    ['ramp4', 3828, -32, 16, 9, 8], ['ramp4', 4098, -28, 12, 12, 60, 'obelisk'], ['ramp4', 4478, -32, 16, 9, 8], ['ramp4', 4758, -28, 12, 12, 60, 'obelisk'],
    ['ramp4', 5128, -32, 16, 9, 8], ['ramp4', 5388, -28, 12, 12, 60, 'obelisk'], ['ramp4', 5778, -32, 16, 9, 8], ['ramp4', 6048, -28, 12, 12, 60, 'obelisk'],
    ['ramp4', 6428, -32, 16, 9, 8]],
  gates: [['start', -60, 0xffb030], ['ramp1', -120, 0x30e0d0], ['ramp2', -120, 0xffb030],
    ['dive', -60, 0xff8020], ['land', -40, 0xffb030], ['ramp4', -120, 0x30e0d0]],
  // its light: gold barriers and strips, turquoise lanes, warm gantries
  theme: { field: [1.0, 0.55, 0.08], fieldFlash: [1.0, 0.9, 0.6], strip: [1.0, 0.45, 0.04], stripCore: [1.0, 0.88, 0.6],
    lane: [0.0, 0.8, 0.72], laneCore: [0.7, 1.0, 0.95], spill: [0.0, 0.5, 0.45], stud: [2.6, 1.6, 0.4], trim: [1.5, 0.6, 0.08],
    gantry: [2.8, 2.2, 1.4], lamp: [3.0, 2.4, 1.6], flip: [0.0, 0.85, 0.75], moss: false, sand: false },
});

const NOISE = /* glsl */`
  float ph(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float pn(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(ph(i), ph(i + vec3(1, 0, 0)), f.x), mix(ph(i + vec3(0, 1, 0)), ph(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(ph(i + vec3(0, 0, 1)), ph(i + vec3(1, 0, 1)), f.x), mix(ph(i + vec3(0, 1, 1)), ph(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float pfbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * pn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;

// The planet: sand seas (dune ridges in long waves, their crests catching the low sun), darker rock plateaus and old
// craters, its night side faintly blue; the air a thin glow round its limb and a haze over what is far. Holes where
// the pyramid stands on it and where the road climbs out of its crater (the pyramid and the crater are their own).
function planetMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN_DIR }, camPos: { value: new THREE.Vector3() }, centre: { value: PLANET_C },
      R: { value: PLANET_R }, exitP: { value: EXIT }, pyr: { value: new THREE.Vector4(PYR.half, PYR.base, ZC, 0) } },
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vN;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, camPos, centre, exitP; uniform float R; uniform vec4 pyr;
      varying vec3 vW; varying vec3 vN;
      ${NOISE}
      void main() {
        // (the pyramid's footprint and the crater's mouth: their own meshes)
        if (abs(vW.x) < pyr.x - 4.0 && abs(vW.z - pyr.z) < pyr.x - 4.0 && vW.y > pyr.y) discard;
        if (distance(vW, exitP) < 185.0) discard;          // (the bore's mouth, 230 m across, comes up through it)
        vec3 n = normalize(vW - centre), q = n * 6.0;
        float big = pfbm(q * 1.3), mid = pfbm(q * 7.0 + 3.0), dist = distance(vW, camPos);
        // dunes: long waves across the planet, wavier where the noise bends them; their slopes lit and shadowed by
        // tilting the normal (fading out where they are too fine for the pixel)
        vec3 dq = n * 260.0;
        float w = dq.x * 0.8 + dq.z * 0.6 + pfbm(dq * 0.08) * 9.0;
        float dune = sin(w), fine = smoothstep(9000.0, 1500.0, dist);
        vec3 t1 = normalize(cross(n, vec3(0.0, 1.0, 0.001)));
        vec3 nn = normalize(n + t1 * dune * 0.35 * fine * smoothstep(0.35, 0.6, big));
        // close to: wind ripples in the sand, a few metres apart
        float rip = sin(dot(vW, vec3(0.62, 0.21, 0.38)) * 1.7 + pn(vW * 0.06) * 7.0);
        nn = normalize(nn + t1 * rip * 0.12 * smoothstep(500.0, 60.0, dist));
        float rock = smoothstep(0.58, 0.68, big + 0.25 * (mid - 0.5));
        vec3 sand = mix(vec3(0.78, 0.50, 0.26), vec3(0.92, 0.66, 0.38), mid);
        vec3 alb = mix(sand, vec3(0.42, 0.28, 0.18) * (0.8 + 0.4 * mid), rock);
        float cr = pfbm(q * 3.0 + 11.0);
        alb *= 1.0 - 0.25 * smoothstep(0.62, 0.7, cr) * (1.0 - smoothstep(0.7, 0.74, cr));
        float ndl = dot(nn, sunDir), lit = smoothstep(-0.08, 0.25, ndl) * max(ndl, 0.0) + 0.012;
        vec3 col = alb * (vec3(1.0, 0.9, 0.78) * 1.25 * lit + vec3(0.03, 0.04, 0.07) * (0.4 + 0.6 * n.y));
        // the air: a glow round the limb, haze over the far ground
        vec3 V = normalize(camPos - vW);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0), day = smoothstep(-0.25, 0.3, dot(n, sunDir));
        vec3 air = vec3(1.0, 0.62, 0.36) * day + vec3(0.03, 0.05, 0.1);
        col = mix(col, air * 0.45, rim * 0.6 * day + (1.0 - exp(-dist / 26000.0)) * 0.3 * day);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// the air's shell round the planet: a halo beyond its limb, bright on the day side
function airMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { sunDir: { value: SUN_DIR }, camPos: { value: new THREE.Vector3() }, centre: { value: PLANET_C } },
    vertexShader: /* glsl */`varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, camPos, centre; varying vec3 vW;
      void main() {
        vec3 n = normalize(vW - centre), V = normalize(vW - camPos);
        float edge = pow(clamp(1.0 - abs(dot(n, V)), 0.0, 1.0), 6.0);
        float day = smoothstep(-0.3, 0.4, dot(n, sunDir));
        gl_FragColor = vec4(vec3(1.0, 0.58, 0.3) * edge * day * 1.4, 1.0);
      }`,
  });
}

// the sky from inside the air: dusty gold toward the horizon, deeper overhead, fading out as the camera climbs out of
// it (k) - drawn over the stars in the backdrop scene; up: the planet's up under the camera
function skyAirMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide,
    uniforms: { k: { value: 0 }, up: { value: new THREE.Vector3(0, 1, 0) }, sunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */`varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float k; uniform vec3 up, sunDir; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        float h = dot(d, up), s = max(dot(d, sunDir), 0.0);
        vec3 c = mix(vec3(1.0, 0.68, 0.40), vec3(0.42, 0.30, 0.34), smoothstep(-0.05, 0.6, h));
        c += vec3(1.0, 0.8, 0.5) * pow(s, 12.0) * 0.8;
        float a = k * (0.55 + 0.45 * smoothstep(0.7, -0.1, h));
        gl_FragColor = vec4(c * 0.85, a);
      }`,
  });
}

// the pyramid's stone: great blocks in courses, joints dark, wind-worn; gold seams glowing along its edges and every
// tenth course; its inner faces darker, the seams the hall's light
function stoneMaterial(inside) {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    uniforms: { sunDir: { value: SUN_DIR }, camPos: { value: new THREE.Vector3() }, time: { value: 0 }, inside: { value: inside ? 1 : 0 } },
    vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN; varying vec4 vE;
      attribute vec4 edge;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vE = edge; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, camPos; uniform float time, inside; varying vec3 vW; varying vec3 vN; varying vec4 vE;
      ${NOISE}
      void main() {
        vec3 n = normalize(vN);
        float course = vW.y / 12.0, row = floor(course), fy = fract(course);
        float along = (abs(n.x) > abs(n.z) ? vW.z : vW.x) / 22.0 + row * 0.37, fx = fract(along);
        float joint = max(smoothstep(0.035, 0.0, fy) + smoothstep(0.965, 1.0, fy), smoothstep(0.02, 0.0, fx) + smoothstep(0.98, 1.0, fx));
        float tone = pn(vec3(floor(along), row, 3.0));
        float wear = pfbm(vW * 0.02);
        vec3 alb = mix(vec3(0.62, 0.48, 0.32), vec3(0.78, 0.62, 0.42), tone) * (0.8 + 0.3 * wear);
        alb *= 1.0 - 0.5 * clamp(joint, 0.0, 1.0);
        float dist = distance(vW, camPos);
        float ndl = max(dot(n, sunDir), 0.0);
        vec3 col = inside > 0.5 ? alb * 0.05 : alb * (vec3(1.0, 0.9, 0.78) * 1.2 * ndl + vec3(0.035, 0.035, 0.05));
        // the seams: along the face's edges (vE: its (u, v) and its half base, its slant: m to the nearest edge) and
        // every tenth course
        float sl = length(vE.zw), u = vE.x, v = vE.y;
        float de = min(v, min(abs((u + vE.z) * vE.w - v * vE.z), abs((vE.z - u) * vE.w - v * vE.z)) / sl);
        float seam = exp(-de * de / 18.0) + exp(-pow((fract(vW.y / 120.0) - 0.5) * 120.0, 2.0) / 3.0) * 0.6;
        float pulse = 0.75 + 0.25 * sin(time * 1.3 - vW.y * 0.004);
        col += vec3(1.0, 0.62, 0.15) * seam * (inside > 0.5 ? 2.5 : 1.2) * pulse;
        if (inside < 0.5) col = mix(col, vec3(0.9, 0.6, 0.38) * 0.8, (1.0 - exp(-dist / 30000.0)) * 0.3);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// The tunnels round the road from the hall down the shaft to the crater: a bore round the deck, wider in the shaft;
// dark rock streaked with veins of glowing crystal, rings of gold light every 80 m (the speed in the dark)
function boreMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */`attribute vec3 bake; varying vec3 vW; varying vec2 vUv; varying vec3 vN; varying vec3 vBake;
      void main() { vUv = uv; vBake = bake; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec3 vW; varying vec2 vUv; varying vec3 vN; varying vec3 vBake;
      ${NOISE}
      void main() {
        float rock = pfbm(vW * 0.05), vein = pfbm(vW * 0.012 + 4.0);
        // the rock: dark, rough, in the light baked into it (the fires, the river: egypt.js buildTomb), its relief
        // catching it - brighter on the bumps, darker in the hollows
        vec3 alb = vec3(0.16, 0.12, 0.09) * (0.45 + 1.1 * rock);
        float relief = 0.65 + 0.7 * pfbm(vW * 0.21);
        vec3 col = alb * (vBake * relief + vec3(0.004, 0.0035, 0.003)) * 0.3183;
        float v = smoothstep(0.02, 0.0, abs(vein - 0.5)) * smoothstep(0.5, 0.65, rock);       // (thin seams of it, not clouds)
        col += vec3(0.25, 0.8, 1.0) * v * 0.9;
        float ring = exp(-pow((fract(vUv.y / 80.0) - 0.5) * 80.0, 2.0) / 2.5);
        col += vec3(1.0, 0.6, 0.18) * ring * (1.2 + 0.4 * sin(time * 3.0 + vUv.y * 0.01));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ what floats round the road in space
// spans of the lap out in space (from, to arc length), where the field is
const SPACE_SPANS = (tr) => [[tr.at('start', -9000), tr.at('dive', 2200)], [tr.at('exit', 1200), tr.length]];

// points scattered round the road: n tries along the space spans, each off the line by near .. far (plus its size),
// clear of every part of the road (a coarse grid of the line) and of the planet and its air
function scatter(tr, n, near, far, sizeOf, seed) {
  const rnd = mulberry32(seed), cell = 400, grid = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < tr.n; i += 15) {
    const p = tr.P[i], k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  const clearOf = (p, r) => {
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell), reach = Math.ceil(r / cell);
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) for (let c = -reach; c <= reach; c++) {
      for (const q of grid.get(key(cx + a, cy + b, cz + c)) || []) if (q.distanceToSquared(p) < r * r) return false;
    }
    return true;
  };
  const spans = SPACE_SPANS(tr), lens = spans.map(([a, b]) => tr.wrap(b - a)), total = lens.reduce((x, y) => x + y, 0);
  const out = [], f = {}, d = new THREE.Vector3();
  for (let k = 0; k < n * 6 && out.length < n; k++) {
    let u = rnd() * total, si = 0;
    while (u > lens[si]) { u -= lens[si]; si++; }
    tr.frame(spans[si][0] + u, f);
    const size = sizeOf(rnd), a = rnd() * Math.PI * 2, dist = near + size + (far - near) * Math.pow(rnd(), 0.7);
    d.copy(f.R).multiplyScalar(Math.cos(a)).addScaledVector(f.U, Math.sin(a) * 0.45).addScaledVector(f.T, (rnd() - 0.5) * 0.6).normalize();
    const p = f.P.clone().addScaledVector(d, dist);
    if (p.distanceTo(PLANET_C) < PLANET_R * 1.08 + size + 300) continue;
    if (!clearOf(p, near + size)) continue;
    out.push([p, size, rnd]);
  }
  return out;
}

// A broken ship in the hull's panelled armour (hull.js): its keel cut into sections drifting apart, each a little turned,
// exposed ribs at the break, a bridge tower, engine blocks at the stern; a handful of dying emergency lights flickering
// (one of the debris pass's instanced lamps each). Built at the origin along -z, length L.
function wreckGeometry(L, rnd, lamps) {
  const parts = [], W = L * 0.12, H = L * 0.09;
  const put = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); parts.push(g);
  };
  const cuts = 2 + Math.floor(rnd() * 2), seg = L / cuts;
  for (let c = 0; c < cuts; c++) {
    const z0 = -c * seg - c * L * 0.06, tilt = (rnd() - 0.5) * 0.25, roll = (rnd() - 0.5) * 0.4, drop = (rnd() - 0.5) * H * 0.6;
    const g = hullBox(W, H, seg * 0.9);
    put(g, (rnd() - 0.5) * W * 0.3, drop, z0 - seg / 2, tilt, (rnd() - 0.5) * 0.2, roll);
    // the break: ribs standing out of the torn end
    for (let r = 0; r < 5; r++) {
      const rg = hullBox(W * (0.9 - r * 0.08), H * 0.08, H * 0.06);
      put(rg, (rnd() - 0.5) * W * 0.2, drop + (rnd() - 0.5) * H * 0.7, z0 - seg * 0.9 - r * H * 0.12, tilt, 0, roll + (rnd() - 0.5) * 0.5);
    }
    // a dorsal spine and side sponsons
    put(hullBox(W * 0.3, H * 0.4, seg * 0.6), 0, drop + H * 0.65, z0 - seg / 2, tilt, 0, roll);
    if (rnd() < 0.7) put(hullBox(W * 0.35, H * 0.5, seg * 0.5), W * 0.62, drop - H * 0.1, z0 - seg * 0.45, tilt, 0, roll);
    for (let q = 0; q < 3; q++) lamps.push(new THREE.Vector3((rnd() - 0.5) * W, drop + H * (0.3 + rnd() * 0.3), z0 - rnd() * seg));
  }
  // the bridge tower amidships, the engine blocks at the stern (z > 0)
  put(hullBox(W * 0.4, H * 1.1, L * 0.08), 0, H * 0.9, -L * 0.2);
  for (const sx of [-1, 0, 1]) put(hullBox(W * 0.3, H * 0.35, L * 0.12), sx * W * 0.32, (sx === 0 ? 0.25 : -0.15) * H, L * 0.04);
  return mergeGeometries(parts);
}

// The relics: what was here before the pyramid's makers left - rings of stone, obelisks, broken shards of pyramids -
// in the pyramid's stone with its gold seams
function relicGeometry(kind, s, rnd) {
  if (kind === 0) {                                           // a ring, broken open
    const g = new THREE.TorusGeometry(s, s * 0.07, 10, 64, Math.PI * (1.45 + rnd() * 0.45));
    return g;
  }
  if (kind === 1) return new THREE.BoxGeometry(s * 0.14, s, s * 0.14).translate(0, s * 0.5, 0);   // an obelisk
  const g = new THREE.TetrahedronGeometry(s, 0);              // a pyramid's broken shard
  return g;
}

// The Milky Way as it looks from space, behind the planet: the band (a great circle tilted through the sky, its core's
// bulge rising beside the planet), warm-white at the core and blue-white along the arms, dark dust lanes splitting it
// (the Rift), knots of pink nebulae and star clouds along it, a faint glow round it. Painted once into a cube map.
const GAL_N = new THREE.Vector3(0.28, 0.93, 0.24).normalize();          // the band's pole
const GAL_CORE = new THREE.Vector3(0.45, 0.12, -0.88).normalize();      // its core: behind the planet, a little right
function galaxy(renderer) {
  const live = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { N: { value: GAL_N }, C: { value: GAL_CORE } },
    vertexShader: /* glsl */`varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 N, C; varying vec3 vD;
      ${NOISE}
      float sh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      // a field of point stars: each cell of a fine grid on the sky holds one at a random spot, lit if its die beats
      // the density there
      float starsAt(vec3 d, float scale, float density) {
        vec3 q = d * scale, c = floor(q), f = fract(q);
        float h = sh(c);
        if (h > density) return 0.0;
        vec3 at = vec3(sh(c + 1.3), sh(c + 2.7), sh(c + 4.1));
        float r = length(f - at);
        return smoothstep(0.32, 0.0, r) * (0.4 + 1.6 * pow(sh(c + 7.7), 6.0));
      }
      void main() {
        vec3 d = normalize(vD);
        float lat = dot(d, N);
        vec3 inPlane = normalize(d - N * lat);
        float lon = acos(clamp(dot(inPlane, C), -1.0, 1.0));
        float coreK = exp(-lon * lon / 0.25);
        float w = 0.055 + 0.06 * coreK;
        float band = exp(-lat * lat / (w * w)), wide = exp(-lat * lat / (w * w * 5.0));
        float bulge = exp(-(lon * lon / 0.02 + lat * lat / 0.0065));
        // the unresolved glow: grainy star clouds, brighter toward the core
        float cl = pfbm(d * 11.0) * 0.55 + pfbm(d * 29.0 + 3.0) * 0.3 + pfbm(d * 75.0 + 9.0) * 0.15;
        float glow = band * smoothstep(0.3, 0.8, cl) * (0.35 + 1.2 * coreK) + wide * 0.05 * (0.5 + cl);
        vec3 tint = mix(vec3(0.62, 0.72, 1.0), vec3(1.0, 0.83, 0.58), smoothstep(0.0, 0.8, coreK));
        vec3 col = tint * glow + vec3(1.0, 0.87, 0.64) * bulge * 3.0;
        // the dust: a ragged dark rift down the middle, thinner lanes branching out of it
        float rift = exp(-pow((lat + 0.015 * sin(lon * 6.0 + 1.0)) / (0.012 + 0.03 * coreK), 2.0));
        float dust = smoothstep(0.35, 0.65, pfbm(d * 17.0 + 5.0));
        col *= 1.0 - 0.95 * rift * dust;
        col *= 1.0 - 0.65 * band * smoothstep(0.55, 0.78, pfbm(d * 38.0 - 7.0));
        // nebulae strung along it: pink hydrogen, a few teal knots
        col += vec3(1.0, 0.28, 0.42) * band * smoothstep(0.74, 0.9, pfbm(d * 21.0 + 13.0)) * 0.45;
        col += vec3(0.2, 0.75, 0.8) * band * smoothstep(0.8, 0.93, pfbm(d * 16.0 - 21.0)) * 0.3;
        // its stars: crowded in the band, sparse off it
        col += vec3(1.0, 0.95, 0.88) * starsAt(d, 420.0, 0.02 + 0.5 * band + 0.3 * bulge) * (0.5 + band);
        col += vec3(0.85, 0.9, 1.0) * starsAt(d, 1100.0, 0.05 + 0.6 * band) * 0.5 * band;
        gl_FragColor = vec4(col * 0.32, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(90000, 64, 32), live);
  const rt = new THREE.WebGLCubeRenderTarget(Q.tier === 'low' ? 1024 : 2048, { type: THREE.HalfFloatType, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const scene = new THREE.Scene(), stand = mesh.clone(), cube = new THREE.CubeCamera(10, 200000, rt);
  scene.add(stand);
  bakeLater([[scene, cube.children[0]]], () => { cube.update(renderer, scene); live.dispose(); });
  mesh.material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { cube: { value: rt.texture } },
    vertexShader: /* glsl */`varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform samplerCube cube; varying vec3 vD; void main() { gl_FragColor = vec4(textureCube(cube, vD).rgb, 1.0); }`,
  });
  mesh.renderOrder = -1;
  return mesh;
}

export class PyramidWorld {
  constructor(scene, renderer, camera) {
    this.name = 'pyramid';
    this.sky = new THREE.Scene();
    this.skyCam = new THREE.PerspectiveCamera(60, 1, 50, 200000);
    this.galaxy = galaxy(renderer);
    this.stars = stars();
    const R = 60000 * Math.tan(THREE.MathUtils.degToRad(2.0));
    const { surf, corona } = sunMeshes(R);
    surf.position.copy(SUN_DIR).multiplyScalar(60000);
    corona.position.copy(surf.position);
    corona.renderOrder = 1;
    this.sunSurf = surf; this.corona = corona;
    this.skyAir = new THREE.Mesh(new THREE.SphereGeometry(80000, 48, 24), skyAirMaterial());
    this.skyAir.renderOrder = 2;
    this.sky.add(this.galaxy, this.stars, surf, corona, this.skyAir);
    bakeLater([[this.sky, this.skyCam]], () => {
      surf.visible = corona.visible = false;
      const pm = new THREE.PMREMGenerator(renderer);
      this.env = pm.fromScene(this.sky, 0.015, 50, 200000).texture;
      pm.dispose();
      surf.visible = corona.visible = true;
      scene.environment = this.env;
    });
    scene.environmentIntensity = 0.6;
    scene.fog = null;
    const sunLight = (intensity, half, near, far, normalBias) => {
      const l = new THREE.DirectionalLight(new THREE.Color(1.0, 0.94, 0.86), intensity);
      l.castShadow = true;
      l.shadow.mapSize.set(4096, 4096);
      const c = l.shadow.camera;
      c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = near; c.far = far;
      l.shadow.bias = -0.0001;
      l.shadow.normalBias = normalBias;
      scene.add(l, l.target);
      return l;
    };
    this.sun = sunLight(SUN_E, SHADOW_HALF, SHADOW_NEAR, SHADOW_FAR, 0.005);
    this.sunMid = sunLight(0, MID_HALF, MID_NEAR, MID_FAR, 0.02);
    this.sunFar = sunLight(0, FAR_HALF, FAR_NEAR, FAR_FAR, 0.07);
    // the planet's warm light from below when the road is near it
    this.shine = new THREE.DirectionalLight(new THREE.Color(1.0, 0.68, 0.42), 0.2);
    scene.add(this.shine, this.shine.target);
    scene.add(new THREE.HemisphereLight(0x8090b0, 0x403020, 0.03));
    this.lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    this.ly = new THREE.Vector3().crossVectors(SUN_DIR, this.lx).normalize();
    // the circuit
    this.track = new Track(PYRAMID_LAYOUT);
    hullMaps(renderer);
    rockMaps(renderer);                                            // (the asteroids' maps, before the first frame)
    // (inside, the bore's rings light the deck a warm dim gold: unlit, the road in the dark read as black shapes rising
    // out of the floor wherever it bent or climbed against the glowing walls)
    // (the cave's reach the bore's whole width, 140 m round the road: its columns stand 86 m out)
    setCave(this.track.caveLines, CAVE_R + 100, CAVE_MOUTH, null, null, [0.32, 0.24, 0.17]);   // (a faint bounce: the light is the lamps')
    this.track.meshes(scene);
    this.track.bakeDeck(renderer);
    // the planet, its air
    const det = { high: 64, mid: 48, low: 32 }[Q.tier] ?? 48;
    this.planetMat = planetMaterial();
    this.planet = new THREE.Mesh(new THREE.IcosahedronGeometry(PLANET_R, det), this.planetMat);
    this.planet.position.copy(PLANET_C);
    this.planet.frustumCulled = false;
    this.airMat = airMaterial();
    this.air = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.06, 96, 48), this.airMat);
    this.air.position.copy(PLANET_C);
    this.air.renderOrder = 3;
    scene.add(this.planet, this.air);
    // the pyramid, its hall, the tunnels, the crater
    this.stoneOut = stoneMaterial(false);
    this.stoneIn = stoneMaterial(true);
    this.pyramid = this.buildPyramid();
    scene.add(...this.pyramid);
    this.boreMat = boreMaterial();
    this.bore = this.buildBore();
    scene.add(this.bore);
    this.crater = this.buildCrater();
    scene.add(this.crater);
    // the ruins on the sand along the road, round the pyramid's foot, up to its gate (egypt.js; Settings pyrRuins)
    {
      const tr = this.track, g0 = tr.at('dive', 0), g1 = tr.at('gate', 0), f0 = {};
      let sA = g1;
      for (let s = g0; s < g1; s += 50) { tr.frame(s, f0); if (f0.P.distanceTo(PLANET_C) - PLANET_R < 40) { sA = s; break; } }
      const H = PYR.half + 160;
      this.ruins = buildRuins(tr, { centre: PLANET_C, R: PLANET_R, sA, sB: tr.at('gate', -320), gate: g1,
        keepOut: (p, r) => (Math.abs(p.x) < H + r && Math.abs(p.z - ZC) < H + r && p.y > PYR.base - 600) || p.distanceTo(EXIT) < 600 + r });
      for (const m of this.ruins.meshes) scene.add(m);
    }
    // the pyramid's root: the bore dressed - columns, monoliths, sand falls, the river of light (egypt.js; Settings pyrTomb)
    // (the bore's oval: 115 m out at the deck, its floor 41 m under it and its roof 61 m over it 86 m out, 87 m over the road)
    this.tomb = buildTomb(this.track, { s0: this.track.at('shaftOut', 250), s1: this.track.at('exit', -320), wall: 86, floor: -41,
      roof: 61, crown: 87, centre: PLANET_C, R: PLANET_R, width: this.track.W });
    for (const m of this.tomb.meshes) scene.add(m);
    // the root's light baked: the bore's rock per vertex; the deck through a map across it and along it (its live
    // lamps there only taking their shadow away); the stone obstacles down there, each its own
    this.tomb.bakeGeometry(this.bore.geometry);
    {
      const D = this.tomb.deck, deckMat = this.track.deckMat, before = deckMat.onBeforeCompile;
      deckMat.onBeforeCompile = (sh, r) => {
        before(sh, r);
        sh.uniforms.deckBake = { value: D.map };
        sh.uniforms.deckBakeS = { value: new THREE.Vector2(D.s0, D.len) };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBkUv;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vBkUv = uv;');
        sh.fragmentShader = bakedShadowsOnly(sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D deckBake; uniform vec2 deckBakeS; varying vec2 vBkUv;')
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float bs = (vBkUv.y * 40.0 - deckBakeS.x) / deckBakeS.y;
    if (bs > 0.0 && bs < 1.0) reflectedLight.indirectDiffuse += texture2D(deckBake, vec2(vBkUv.x, bs)).rgb * BRDF_Lambert(material.diffuseColor); }`));
      };
      const key = deckMat.customProgramCacheKey;
      deckMat.customProgramCacheKey = () => key() + '-baked';
    }
    // the root's live lamps (the world's lamps: main.js lights the ships' undersides by them too): two, on the braziers
    // nearest the camera, as bright as the fires baked in - lighting the ships, and on the baked surfaces only casting
    // the shadows (the columns', the ships'); dark out of the root, their shadow maps not redrawn
    this.lamps = [];
    for (let k = 0; k < 2; k++) {
      const l = new THREE.PointLight(BRAZIER.color, 0, BRAZIER.range, 2);
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
      l.shadow.camera.near = 2; l.shadow.camera.far = BRAZIER.range;
      l.shadow.bias = -0.004; l.shadow.normalBias = 0.6;
      l.shadow.autoUpdate = false;
      scene.add(l);
      this.lamps.push(l);
    }
    // the beam from the pyramid's apex up into space
    this.beam = this.buildBeam();
    scene.add(this.beam);
    // the obstacles
    this.blocks = this.buildBlocks();
    scene.add(...this.blocks);
    // the stone obstacles down in the root: each in the light baked there (bakeI)
    for (const mesh of [this.blocks[2], this.blocks[3]]) {
      const out = new Float32Array(Math.max(1, mesh.count) * 3), M = new THREE.Matrix4(), q = new THREE.Vector3(), up = new THREE.Vector3(), tmp = [0, 0, 0];
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, M); q.setFromMatrixPosition(M); up.setFromMatrixColumn(M, 1).normalize();
        this.tomb.irradiance(q.addScaledVector(up, 6), null, tmp);
        out.set(tmp, i * 3);
      }
      mesh.geometry.setAttribute('bakeI', new THREE.InstancedBufferAttribute(out, 3));
    }
    this.buildSpace(scene);
    this.noAO = [this.air, this.beam, this.blocks[1], this.lampMesh, this.tomb.glow[1], this.tomb.glow[2], this.tomb.glow[3]];
    // dust drifting round the camera
    const dn = 1400, dpos = new Float32Array(dn * 3), rnd = mulberry32(9);
    for (let i = 0; i < dn * 3; i++) dpos[i] = (rnd() - 0.5) * 240;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { cam: { value: new THREE.Vector3() }, pr: { value: 1 }, tint: { value: new THREE.Color(0.55, 0.6, 0.7) } },
      vertexShader: /* glsl */`uniform vec3 cam; uniform float pr; varying float vA;
        void main() {
          vec3 p = mod(position - cam + 120.0, 240.0) - 120.0 + cam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = smoothstep(120.0, 40.0, d) * smoothstep(1.0, 6.0, d);
          gl_PointSize = pr * clamp(60.0 / d, 1.0, 3.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`uniform vec3 tint; varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(tint * vA * smoothstep(0.5, 0.0, r), 1.0); }`,
    }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);
    this.minimap = this.track;
    this.startIndex = this.track.start;
  }

  // The pyramid: four faces from the base square to the apex, a shell PYR.wall thick (outer faces lit by the sun,
  // inner faces the hall's), the gate cut through the face the road comes up to; the hall's floor with the shaft's
  // mouth open in it and the well under it. Each vertex carries its distance to the nearest edge of its face (the
  // glowing seams).
  buildPyramid() {
    const { half: H, base: B, apex: A, wall: Wt, floor: FL, gateW, gateH } = PYR;
    const apex = new THREE.Vector3(0, A, ZC);
    const corners = [[-H, -H], [H, -H], [H, H], [-H, H]].map(([x, z]) => new THREE.Vector3(x, B, ZC + z));
    const blank = () => ({ pos: [], nrm: [], edge: [], idx: [] });
    const outer = blank(), inner = blank(), reveal = blank();
    const slant = Math.hypot(H, A - B), vAt = (y) => (y - B) * slant / (A - B);
    const gate = [[-gateW, vAt(FL - 6)], [gateW, vAt(FL - 6)], [gateW, vAt(FL + gateH)], [-gateW, vAt(FL + gateH)]];
    // one face (base a -> b and the apex) into d: its (u, v) frame from the base's middle (u along the base, v up the
    // slant); inn: the inner face (moved in by the wall, looking into the hall)
    const face = (a, b, hole, d, inn) => {
      const o = a.clone().lerp(b, 0.5), U = b.clone().sub(a).normalize(), V = apex.clone().sub(o).normalize();
      const N = new THREE.Vector3().crossVectors(U, V).normalize();
      const out = N.dot(o.clone().sub(new THREE.Vector3(0, o.y, ZC))) > 0;     // (the shape's own facing: outward?)
      if (!out) N.negate();
      const k = inn ? 1 - (Wt / slant) * 1.6 : 1, half = (a.distanceTo(b) / 2) * k, top = slant * k;
      const shape = new THREE.Shape([new THREE.Vector2(-half, 0), new THREE.Vector2(half, 0), new THREE.Vector2(0, top)]);
      if (hole) shape.holes.push(new THREE.Path(hole.map(([u, v]) => new THREE.Vector2(u, v))));
      const g = new THREE.ShapeGeometry(shape, 1), p = g.attributes.position, base = d.pos.length / 3;
      const facing = inn ? N.clone().negate() : N, flip = out === inn;          // (wound to face `facing`)
      const shift = inn ? N.clone().multiplyScalar(-Wt) : new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i), w = o.clone().addScaledVector(U, u).addScaledVector(V, v).add(shift);
        d.pos.push(w.x, w.y, w.z);
        d.nrm.push(facing.x, facing.y, facing.z);
        d.edge.push(u, v, half, top);
      }
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        if (!flip) d.idx.push(base + ix[i], base + ix[i + 1], base + ix[i + 2]);
        else d.idx.push(base + ix[i], base + ix[i + 2], base + ix[i + 1]);
      }
      g.dispose();
      return { o, U, V, N };
    };
    let fz = null;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], hole = i === 2 ? gate : null;   // (2: the +z face)
      const fr = face(a, b, hole, outer, false);
      face(a, b, hole, inner, true);
      if (i === 2) fz = fr;
    }
    // the gate's reveal: its four sides through the wall's thickness, facing into the opening
    const gp = gate.map(([u, v]) => fz.o.clone().addScaledVector(fz.U, u).addScaledVector(fz.V, v));
    const gc = gp.reduce((q, x) => q.add(x), new THREE.Vector3()).multiplyScalar(0.25);
    for (let i = 0; i < 4; i++) {
      const a = gp[i], b = gp[(i + 1) % 4], a2 = a.clone().addScaledVector(fz.N, -Wt), b2 = b.clone().addScaledVector(fz.N, -Wt);
      const nrm = gc.clone().sub(a.clone().lerp(b, 0.5)).projectOnPlane(fz.N).normalize();
      const base = reveal.pos.length / 3;
      for (const q of [a, b, b2, a2]) { reveal.pos.push(q.x, q.y, q.z); reveal.nrm.push(nrm.x, nrm.y, nrm.z); reveal.edge.push(0, 1000, 1e5, 1e5); }
      const t = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(a2, a));
      if (t.dot(nrm) > 0) reveal.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else reveal.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // the hall's floor: the base square inside the walls at the floor's height, the shaft's mouth open in it (from
    // just short of where the road pitches over to past the shaft's far wall; shape y is -z after the turn)
    const fh = H - Wt - (FL - B) * (H / (A - B)) - 4, M0 = -(-14975 - ZC), M1 = -(-16120 - ZC), WX = 190;
    const fs = new THREE.Shape([new THREE.Vector2(-fh, -fh), new THREE.Vector2(fh, -fh), new THREE.Vector2(fh, fh), new THREE.Vector2(-fh, fh)]);
    fs.holes.push(new THREE.Path([new THREE.Vector2(-WX, M0), new THREE.Vector2(WX, M0), new THREE.Vector2(WX, M1), new THREE.Vector2(-WX, M1)]));
    const fg = new THREE.ShapeGeometry(fs, 1);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, FL - 1.9, ZC);
    fg.setAttribute('edge', new THREE.Float32BufferAttribute(new Float32Array(fg.attributes.position.count * 4).map((_, i) => [0, 1000, 1e5, 1e5][i % 4]), 4));
    // the well under the mouth: four walls down to where the bore takes over, looking in
    const well = blank(), y0 = FL - 1.9, y1 = -1700, z0 = -16120, z1 = -14975;
    const quad = (pts, n) => {
      const base = well.pos.length / 3;
      for (const q of pts) { well.pos.push(q[0], q[1], q[2]); well.nrm.push(n[0], n[1], n[2]); well.edge.push(0, 1000, 1e5, 1e5); }
      const e1 = new THREE.Vector3(...pts[1]).sub(new THREE.Vector3(...pts[0])), e2 = new THREE.Vector3(...pts[2]).sub(new THREE.Vector3(...pts[0]));
      if (e1.cross(e2).dot(new THREE.Vector3(...n)) > 0) well.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else well.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };
    quad([[-WX, y0, z0], [WX, y0, z0], [WX, y1, z0], [-WX, y1, z0]], [0, 0, 1]);
    quad([[-WX, y0, z1], [WX, y0, z1], [WX, y1, z1], [-WX, y1, z1]], [0, 0, -1]);
    quad([[-WX, y0, z0], [-WX, y0, z1], [-WX, y1, z1], [-WX, y1, z0]], [1, 0, 0]);
    quad([[WX, y0, z0], [WX, y0, z1], [WX, y1, z1], [WX, y1, z0]], [-1, 0, 0]);
    const mk = (d, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nrm, 3));
      g.setAttribute('edge', new THREE.Float32BufferAttribute(d.edge, 4));
      g.setIndex(d.idx);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      return m;
    };
    this.floorMat = stoneMaterial(true);
    const floor = new THREE.Mesh(fg, this.floorMat);
    floor.frustumCulled = false;
    return [mk(outer, this.stoneOut), mk(inner, this.stoneIn), mk(reveal, this.stoneIn), mk(well, this.stoneIn), floor];
  }

  // The bore round the road from the hall's floor to the crater: an oval round the deck (in the shaft as wide as the
  // shaft), its faces looking in
  buildBore() {
    const tr = this.track, s0 = tr.at('shaftIn', 700), s1 = tr.at('exit', 90), len = tr.wrap(s1 - s0);   // (its floor under the sand to the hole's edge)
    const nk = Math.ceil(len / 4), nj = 48, pos = [], uv = [], idx = [], f = {};
    const shaft0 = tr.at('shaftIn', 500), shaft1 = tr.at('shaftOut', -200);
    for (let k = 0; k <= nk; k++) {
      const s = s0 + (k / nk) * len;
      tr.frame(s, f);
      const inShaft = tr.inSpan(s, shaft0, shaft1) ? 1 : 0;
      const d0 = tr.wrap(s - shaft0), d1 = tr.wrap(shaft1 - s);
      const w = inShaft ? Math.min(1, d0 / 300, d1 / 200) : 0;
      for (let j = 0; j < nj; j++) {
        const a = (j / nj) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const r = 96 + 50 * w;
        const x = ca * r * 1.2, y = 10 + sa * r * 0.8 + 60 * w * 0.5;
        pos.push(f.P.x + f.R.x * x + f.U.x * y, f.P.y + f.R.y * x + f.U.y * y, f.P.z + f.R.z * x + f.U.z * y);
        uv.push(j / nj, k * 4);
      }
    }
    for (let k = 0; k < nk; k++) for (let j = 0; j < nj; j++) {
      const a = k * nj + j, b = k * nj + ((j + 1) % nj), d = a + nj, e = b + nj;
      idx.push(a, b, d, b, e, d);                     // (faces toward the centre line)
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // the faces must look into the bore
    tr.frame(s0 + len / 2, f);
    const vp = new THREE.Vector3().fromBufferAttribute(g.attributes.position, Math.floor(nk / 2) * nj);
    const vn = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, Math.floor(nk / 2) * nj);
    if (vn.dot(f.P.clone().addScaledVector(f.U, 10).sub(vp)) < 0) {
      for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; }
      g.setIndex(idx); g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, this.boreMat);
    m.frustumCulled = false;
    return m;
  }

  // the crater's rim round the bore's mouth on the planet's flank: a ring of rock thrown up
  buildCrater() {
    const n = EXIT.clone().sub(PLANET_C).normalize();
    const t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 0, 1)).normalize(), t2 = new THREE.Vector3().crossVectors(n, t1);
    const pos = [], idx = [], nj = 64, prof = [[178, -10], [186, 6], [212, 16], [258, 8], [322, -2], [385, -12]];
    for (let j = 0; j < nj; j++) {
      const a = (j / nj) * Math.PI * 2, d = t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
      for (const [r, h] of prof) {
        const p = EXIT.clone().addScaledVector(d, r).sub(PLANET_C).normalize().multiplyScalar(PLANET_R + h + (r < 80 ? 0 : 0)).add(PLANET_C);
        pos.push(p.x, p.y, p.z);
      }
    }
    const m = prof.length;
    for (let j = 0; j < nj; j++) for (let k = 0; k < m - 1; k++) {
      const a = j * m + k, b = ((j + 1) % nj) * m + k;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const c = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 3), p0 = new THREE.Vector3().fromBufferAttribute(g.attributes.position, 3);
    if (c.dot(p0.clone().sub(PLANET_C)) < 0) { for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.95 }));
    mesh.frustumCulled = false;
    return mesh;
  }

  // the light rising from the apex: a tall soft beam (additive, faces turned to the camera about its axis)
  buildBeam() {
    const g = new THREE.CylinderGeometry(18, 60, 9000, 24, 1, true);
    g.translate(0, 4500, 0);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          float core = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
          float fade = pow(1.0 - vUv.y, 1.6);
          float flow = 0.7 + 0.3 * sin(vUv.y * 80.0 - time * 6.0);
          gl_FragColor = vec4(vec3(1.0, 0.72, 0.3) * core * fade * flow * 1.6, 1.0);
        }`,
    }));
    m.position.set(0, PYR.apex - 10, ZC);
    m.frustumCulled = false;
    m.renderOrder = 3;
    return m;
  }

  // The obstacles, made to be read at 1,400 m/s: an armoured block (dark gunmetal, lit by the sun) with glowing amber
  // chevrons across the faces that meet the traffic and glowing edges all round (they show in the tunnels' dark too),
  // and over each a beacon - a tall pulsing column of light, never thinner on screen than a few pixels, so it is seen
  // kilometres off, long before the block itself
  buildBlocks() {
    const tr = this.track, n = Math.max(1, tr.blocks.length), f = {}, M = new THREE.Matrix4(), S = new THREE.Matrix4();
    this.blockMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sunDir: { value: SUN_DIR } },
      vertexShader: /* glsl */`
        varying vec3 vL, vSize, vN, vW;
        void main() {
          vL = position;
          vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float time; uniform vec3 sunDir;
        varying vec3 vL, vSize, vN, vW;
        void main() {
          vec3 m = vec3(vL.x * vSize.x, vL.y * vSize.y, vL.z * vSize.z);             // metres in the block
          vec3 ad = abs(normalize(vN));
          // m to the nearest edge of the face this fragment is on
          float ex = (0.5 - abs(vL.x)) * vSize.x, ey = min(vL.y, 1.0 - vL.y) * vSize.y, ez = (0.5 - abs(vL.z)) * vSize.z;
          float de = ad.x > 0.5 ? min(ey, ez) : ad.y > 0.5 ? min(ex, ez) : min(ex, ey);
          float pulse = 0.7 + 0.3 * sin(time * 6.0 + vW.x * 0.01 + vW.z * 0.013);
          vec3 base = vec3(0.07, 0.07, 0.08) * (0.25 + 1.6 * max(dot(normalize(vN), sunDir), 0.0));
          // panels: a seam every 2 m up the sides
          base *= 0.85 + 0.15 * step(0.08, fract(m.y / 2.0));
          vec3 col = base;
          // the chevrons on the faces along the track (local z): amber and black, pointing the way past
          if (ad.z > 0.5) {
            float c = fract((abs(m.x) * 0.8 - m.y) / 2.4);
            float band = smoothstep(0.15, 0.25, vL.y) * smoothstep(0.85, 0.75, vL.y);
            col = mix(col, vec3(2.6, 1.15, 0.12) * pulse, step(0.5, c) * band);
          } else if (ad.x > 0.5 && vSize.z > 24.0) {
            // a long wall's flanks: arrows along them, running the way the road goes (local -z), racing on
            float c = fract((m.z + abs(m.y - vSize.y * 0.5) * 0.9 + time * 40.0) / 3.2);
            float band = smoothstep(0.18, 0.28, vL.y) * smoothstep(0.82, 0.72, vL.y);
            col = mix(col, vec3(2.6, 1.15, 0.12) * pulse, step(0.55, c) * band);
          }
          col += vec3(3.0, 1.4, 0.25) * exp(-de * de / 0.05) * (0.8 + 0.4 * pulse);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    // the hazard blocks and walls (this shader), the fallen obelisks and broken columns (the ruins' stone, egypt.js)
    const kinds = { chev: [], obelisk: [], column: [] };
    tr.blocks.forEach((b, i) => (kinds[b.kind === 'obelisk' || b.kind === 'column' ? b.kind : 'chev'].push(i)));
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.blockMat, Math.max(1, kinds.chev.length));
    this.stoneObsMat = egyptMaterial({ centre: PLANET_C, R: PLANET_R, key: 'obstacle', bake: 'instance' });     // (bakeI: the root's light, set once it is built)
    const obel = new THREE.InstancedMesh(fallenObeliskGeometry(), this.stoneObsMat, Math.max(1, kinds.obelisk.length));
    const colm = new THREE.InstancedMesh(brokenColumnGeometry(), this.stoneObsMat, Math.max(1, kinds.column.length));
    const slot = new Map();
    for (const [k, mesh] of [['chev', body], ['obelisk', obel], ['column', colm]]) kinds[k].forEach((i, j) => slot.set(i, [mesh, j]));
    // the beacons: a quad turned to the camera about the block's up, its width kept to a few pixels at any distance
    this.beaconMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      uniforms: { time: { value: 0 }, px: { value: 0.003 } },
      vertexShader: /* glsl */`
        uniform float px; varying vec2 vUv; varying float vK;
        void main() {
          // (none under a roof - the hall, the tunnel: there a mast to the sky rose out of the deck into the vault -
          // the instance there is scaled to nothing)
          if (length(instanceMatrix[1].xyz) < 0.5) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
          vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 up = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0.0, 1.0, 0.0));
          vec3 toCam = cameraPosition - base, side = normalize(cross(up, toCam));
          float d = length(toCam), w = max(3.0, d * px), h = 46.0 + d * 0.012;
          vec3 p = base + side * position.x * w + up * (position.y + 0.5) * h;
          vUv = uv;
          vK = instanceMatrix[3].x * 0.011 + instanceMatrix[3].z * 0.017;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float time; varying vec2 vUv; varying float vK;
        void main() {
          float x = (vUv.x - 0.5) * 2.0, y = vUv.y;
          float core = exp(-x * x * 9.0), fade = pow(1.0 - y, 1.5);
          float blink = 0.55 + 0.45 * sin(time * 5.0 + vK);
          vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.3), core * core);
          gl_FragColor = vec4(c * core * fade * blink * 2.2, 1.0);
        }`,
    });
    const beacon = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.beaconMat, n);
    tr.blocks.forEach((b, i) => {
      tr.frame(b.s, f);
      M.makeBasis(f.R, f.U, f.T.clone().negate());
      M.setPosition(f.P.clone().addScaledVector(f.R, b.x).addScaledVector(f.U, -0.1));
      const B = M.clone();
      S.makeScale(b.w, b.h, b.kind === 'column' ? b.w : b.len);
      const [mesh, j] = slot.get(i);
      mesh.setMatrixAt(j, M.multiply(S));
      B.setPosition(f.P.clone().addScaledVector(f.R, b.x).addScaledVector(f.U, b.h));
      if (tr.inCave(b.s, 150)) B.scale(new THREE.Vector3(0, 0, 0));
      beacon.setMatrixAt(i, B);
    });
    beacon.count = tr.blocks.length;
    body.count = kinds.chev.length; obel.count = kinds.obelisk.length; colm.count = kinds.column.length;
    for (const m of [body, obel, colm]) { m.castShadow = m.receiveShadow = true; m.frustumCulled = false; }
    beacon.frustumCulled = false;
    beacon.renderOrder = 3;
    return [body, beacon, obel, colm];
  }

  // the asteroid field (track.js's rocks, scattered here: thousands, from boulders to hills), the broken ships with
  // their debris and dying lamps, the relics
  buildSpace(scene) {
    const tr = this.track;
    // (near the road small ones, beside it more than over it; the hills of rock far out - a road through a field, not a wall)
    const rocks = [...scatter(tr, Q.tier === 'low' ? 700 : 1400, 260, 2400, (r) => 2 + 70 * Math.pow(r(), 6), 51),
      ...scatter(tr, Q.tier === 'low' ? 60 : 120, 1800, 5000, (r) => 120 + 360 * r(), 52)];
    this.rocks = tr.asteroids(scene, { place: rocks.map(([pp, sz]) => [pp, sz]) });
    // the wrecks
    const hullMat = hullMaterial({ color: [0.1, 0.105, 0.115], key: 'wreck' });
    const lamps = [], plates = [], M = new THREE.Matrix4(), Qn = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
    this.wrecks = [];
    const big = scatter(tr, 9, 600, 2600, (r) => 280 + 600 * r(), 77), small = scatter(tr, 26, 260, 1600, (r) => 26 + 40 * r(), 91);
    for (const [pp, L, rnd] of [...big, ...small]) {
      const lamp0 = lamps.length, own = [];
      const g = wreckGeometry(L, rnd, own);
      const m = new THREE.Mesh(g, hullMat);
      m.position.copy(pp);
      m.rotation.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3);
      m.updateMatrixWorld(true);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      scene.add(m);
      this.wrecks.push(m);
      for (const q of own) lamps.push(q.applyMatrix4(m.matrixWorld));
      // debris round it: torn plates tumbling off (static: they drift too slowly to see at racing speed)
      for (let k = 0; k < Math.round(L / 12); k++) {
        const off = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(L * 1.4);
        const sz = L * (0.01 + 0.05 * rnd());
        plates.push(M.compose(pp.clone().add(off), Qn.setFromEuler(E.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3)), S.set(sz, sz * 0.12, sz * 0.7)).clone());
      }
      void lamp0;
    }
    const plateMesh = new THREE.InstancedMesh(hullBox(1, 1, 1), hullMat, Math.max(1, plates.length));
    plates.forEach((m, i) => plateMesh.setMatrixAt(i, m));
    plateMesh.count = plates.length;
    scene.add(plateMesh);
    // the dying lamps: small hot points, flickering each on its own
    this.lampMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */`varying float vK; void main() { vK = instanceMatrix[3].x * 0.37 + instanceMatrix[3].y * 0.11;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float time; varying float vK;
        void main() { float f = step(0.35, fract(sin(floor(time * 9.0 + vK) * 12.9898 + vK) * 43758.5)); float warm = fract(vK * 3.1);
          gl_FragColor = vec4(mix(vec3(4.0, 0.35, 0.1), vec3(3.5, 2.2, 0.8), step(0.6, warm)) * (0.15 + 0.85 * f), 1.0); }`,
    });
    this.lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.lampMat, Math.max(1, lamps.length));
    lamps.forEach((q, i) => this.lampMesh.setMatrixAt(i, M.compose(q, Qn.identity(), S.set(2.2, 2.2, 2.2))));
    this.lampMesh.count = lamps.length;
    scene.add(this.lampMesh);
    // the relics, in the pyramid's stone
    const relicParts = [];
    const rl = scatter(tr, 46, 500, 2800, (r) => 60 + 300 * r(), 133);
    rl.forEach(([pp, sz, rnd], i) => {
      const g0 = relicGeometry(i % 3, sz, rnd), g = g0.index ? g0.toNonIndexed() : g0;
      g.deleteAttribute('uv');
      g.rotateX(rnd() * 6.3); g.rotateY(rnd() * 6.3); g.rotateZ(rnd() * 6.3);
      g.translate(pp.x, pp.y, pp.z);
      relicParts.push(g);
    });
    if (relicParts.length) {
      const rg = mergeGeometries(relicParts);
      rg.computeVertexNormals();
      const n = rg.attributes.position.count, e = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) e.set([0, 1000, 1e5, 1e5], i * 4);
      rg.setAttribute('edge', new THREE.BufferAttribute(e, 4));
      this.relics = new THREE.Mesh(rg, this.stoneOut);
      this.relics.frustumCulled = false;
      scene.add(this.relics);
    }
    console.info(`pyramid run: ${rocks.length} rocks, ${this.wrecks.length} wrecks (${plates.length} plates, ${lamps.length} lamps), ${relicParts.length} relics`);
  }

  clearance(p) {
    const tr = this.track, i = tr.nearestIndex(p), d = p.clone().sub(tr.P[i]);
    const x = d.dot(tr.R[i]), y = d.dot(tr.U[i]);
    if (Math.abs(x) < tr.W / 2 + 4 && y > -6 && y < 6.5) p.addScaledVector(tr.U[i], 6.5 - y);
  }

  surface() { return -1e9; }
  height() { return -1e9; }
  hit() { return null; }

  follow(p, camera) {
    const place = (light, half, centre) => {
      const texel = (2 * half) / light.shadow.mapSize.x, c = light.shadow.camera;
      const a = Math.round(centre.dot(this.lx) / texel) * texel, b = Math.round(centre.dot(this.ly) / texel) * texel;
      const q = this.lx.clone().multiplyScalar(a).addScaledVector(this.ly, b).addScaledVector(SUN_DIR, centre.dot(SUN_DIR));
      light.target.position.copy(q);
      light.position.copy(q).addScaledVector(SUN_DIR, (c.near + c.far) / 2);
    };
    place(this.sun, SHADOW_HALF, p);
    const fwd = camera ? new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion) : null;
    place(this.sunMid, MID_HALF, camera ? camera.position.clone().addScaledVector(fwd, 30) : p);
    place(this.sunFar, FAR_HALF, camera ? camera.position.clone().addScaledVector(fwd, 140) : p);
  }

  // the root's live lamps: on the two braziers nearest the camera's s (ahead counts nearer than behind), fading out
  // before they are handed on. Dark out of the root, or with the shadow maps off (their light would count twice on the
  // baked surfaces).
  lampsUpdate(t, s, renderer) {
    const tr = this.track, L = this.lamps, B = this.tomb?.braziers || [];
    const on = this.tomb && this.tomb.meshes[0].visible && tr.inCave(s, 300) && !tr.inLoop(s, 0) && renderer?.shadowMap.enabled !== false;
    if (!on) { for (const l of L) { l.intensity = 0; l.shadow.autoUpdate = false; } return; }
    B.map((b) => { const d = tr.wrap(b.s - s + tr.length / 2) - tr.length / 2; return [d >= 0 ? d : -2.2 * d, b]; })
      .sort((a, b) => a[0] - b[0]).slice(0, L.length).forEach(([w, b], k) => {
        const l = L[k];
        l.position.copy(b.P);
        l.intensity = BRAZIER.intensity * (1 - THREE.MathUtils.smoothstep(w, 160, 300));
        l.shadow.autoUpdate = true;
      });
  }

  // the settings' switches for this world's own works (main.js, on every change)
  setOptions(v) {
    for (const m of this.ruins?.meshes || []) m.visible = v.pyrRuins !== false;
    for (const m of this.tomb?.meshes || []) m.visible = v.pyrTomb !== false;
  }

  update(t, camera, shipPos, s, renderer) {
    this.skyCam.quaternion.copy(camera.quaternion);
    this.skyCam.fov = camera.fov;
    this.skyCam.aspect = camera.aspect;
    this.skyCam.updateProjectionMatrix();
    const pr = renderer.getPixelRatio() * (this.renderScale || 1);
    this.stars.material.uniforms.pr.value = pr;
    this.dust.material.uniforms.pr.value = pr;
    this.dust.material.uniforms.cam.value.copy(camera.position);
    this.track.update(t, shipPos, Math.max(0, t - (this.lastT ?? t)));
    this.lastT = t;
    this.sunSurf.material.uniforms.time.value = t;
    this.corona.material.uniforms.time.value = t;
    const cp = camera.position;
    this.planetMat.uniforms.camPos.value.copy(cp);
    this.airMat.uniforms.camPos.value.copy(cp);
    for (const m of [this.stoneOut, this.stoneIn, this.floorMat]) { m.uniforms.camPos.value.copy(cp); m.uniforms.time.value = t; }
    this.boreMat.uniforms.time.value = t;
    this.beam.material.uniforms.time.value = t;
    this.blockMat.uniforms.time.value = t;
    this.beaconMat.uniforms.time.value = t;
    this.tomb?.update(t);
    this.lampsUpdate(t, s, renderer);
    this.lampMat.uniforms.time.value = t;
    // into the air: the sky turns from space to dusty gold as the camera comes down to the planet - under it too (the
    // tunnels' mouths open into the air: the gate and the crater show its sky, not space), the dust round the camera
    // warmer (not in the tunnels: the cave's own dark); the planet's light from below
    const up = cp.clone().sub(PLANET_C), alt = up.length() - PLANET_R;
    up.normalize();
    const caveK = this.track.inCave(s, 40) ? 1 : 0;
    const air = 1 - THREE.MathUtils.smoothstep(alt, 300, 3200), k = air * (1 - caveK);
    this.skyAir.material.uniforms.k.value = air;
    this.skyAir.material.uniforms.up.value.copy(up);
    this.dust.material.uniforms.tint.value.setRGB(0.55 + 0.4 * k, 0.6 + 0.1 * k, 0.7 - 0.3 * k);
    this.shine.position.copy(cp).addScaledVector(up, -100);
    this.shine.target.position.copy(cp);
    this.shine.intensity = 0.25 * (1 - THREE.MathUtils.smoothstep(alt, 2000, 12000));
  }
}
