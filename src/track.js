// The circuit in space: an anti-grav race track (WipEout-like) floating over a gas giant - a 3-D spline with climbs,
// dives, banked hairpins, a jump crest and a corkscrew; a deck with kerbs, solid walls topped by energy barriers, lit
// gantries, boost pads, a start gantry, an asteroid field. TrackRacer rides it: magnetic hold, hover cushion, air on
// crests, walls you scrape along.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, smoothstep, mulberry32, noise2, fbm } from './noise.js';
import { bakeDeckMaps } from './deck.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { rockMaterial } from './rock.js';
import { hullMaterial, hullBox, HULL_SIDE, HULL_UNDER, HULL_GIRDER } from './hull.js';
import { wreckRoute, GRAVEYARD } from './wreckplan.js';

// "the roads are a bit bigger in redout": 44 -> 56 m, room for five Feathers (10.3 m) abreast and a line through a
// corner that is not the only one (deck.js bakes its plates for the same width)
export const TRACK_W = 56;           // between the walls (m)
const STEP = 2;                      // frame spacing (m)
const DECK = 1.8;                    // deck thickness
const WALL_H = 1.2, WALL_T = 0.7;    // solid wall
const FIELD_H = 5.0;                 // energy barrier top
const GANTRY_EVERY = 300;            // m

// The circuit, as control points: x, y, z (m) and bank (deg, + = right edge down, eased the short way round between
// points). Named points carry the features: the gaps follow the two crests (a kicker throws the ship over the cut),
// the vertical loop runs between loopIn and loopOut (its deck frame is carried round without twist - a world-up frame
// cannot turn over), the tunnel between tunIn and tunOut. "make the track longer ... add cuts in the track where ships
// will jump over with speed, add ships having to rotate like crazy in some parts, over the head".
const CTRL = [], AT = {};
const pt = (x, y, z, bank = 0, name = null) => { if (name) AT[name] = CTRL.length; CTRL.push([x, y, z, bank]); };
pt(0, 0, 700); pt(0, 0, 380, 0, 'start'); pt(0, 0, 70);
pt(0, 15, -25, 0, 'crest1');                                         // the first jump: a cut in the deck past the crest
pt(0, 0, -120); pt(0, 20, -700, 0, 'tunIn');
pt(60, 60, -1300, 12, 'tunOut'); pt(420, 120, -1760, 30); pt(900, 160, -1830, 34); pt(1320, 120, -1470, 34);
pt(1370, 40, -900, 8, 'north'); pt(1160, -80, -440, -24); pt(1220, -230, 120, 0, 'dive');
// the east loop: a left-hander onto a long straight that rolls twice round the ship (120 deg a point), then the loop
pt(1380, -238, 330, -20);
pt(1650, -240, 400, 0, 'rollIn'); pt(1820, -240, 405, 120); pt(1990, -240, 410, 240); pt(2160, -240, 415, 0);
pt(2330, -240, 420, 120); pt(2500, -240, 425, 240); pt(2670, -240, 430, 0, 'rollOut');
pt(2850, -240, 435, 0, 'preLoop');
for (let k = 0; k <= 12; k++) {                                      // R 80 m, stepping 80 m sideways over the turn
  const a = (k / 12) * Math.PI * 2, z = 440 + 40 * (1 - Math.cos(a / 2));   // (the step eased: taken evenly it kinked the way in and out)
  pt(3000 + 80 * Math.sin(a), -160 - 80 * Math.cos(a), z, 0, k === 0 ? 'loopIn' : k === 12 ? 'loopOut' : null);
}
pt(3160, -240, 525); pt(3420, -225, 620, 20); pt(3560, -210, 850, 28); pt(3600, -195, 1050, 10);
pt(3605, -195, 1150); pt(3610, -180, 1245, 0, 'crest2'); pt(3615, -195, 1340);   // the second jump
pt(3610, -190, 1700, 0, 'back');
// the derelict (wreck.js; its plan, and the way through and round it, in wreckplan.js): in through its main engine,
// through the stern piece, two jumps across where it broke, the fore piece's holds and hangar, out into the graveyard
// off its bow, back along its back, through the command tower and down off the stern
for (const [x, y, z, bank, name] of wreckRoute()) pt(x, y, z, bank, name);
pt(3600, -62, 1975, 10); pt(3330, -56, 1880, 14); pt(2930, -38, 2070, 6); pt(2510, -20, 2290, 2);
pt(2050, 60, 2150, 6, 'caveIn'); pt(1500, 160, 1950, 12, 'caveOut');      // the meteorite tunnel
pt(1010, 220, 1770, 0, 'west'); pt(520, 200, 1730, 18); pt(240, 135, 1350, 0);
pt(180, 100, 1150, 120); pt(120, 65, 960, 240); pt(60, 30, 800, 0, 'cork');     // the corkscrew home
const LOOPS = [['loopIn', 'loopOut']];
// (after point, from m, to m): the two crests' cuts, and the two where the great derelict broke
const GAPS = [['crest1', 35, 105], ['crest2', 35, 108], ['jump1', 35, 170], ['jump2', 35, 185]];
const TUNNELS = [['tunIn', 'tunOut']];
// gravity flips: up onto the derelict's hold's deck overhead and back down (wreckplan.js)
const FLIPS = [['flipA', 'flipB'], ['flipC', 'flipD']];
const CAVES = [['caveIn', -40, 'caveOut', 40]];                     // (from point, m, to point, m)
// the derelict's dark stretches (from point, m, to point, m): the stern piece from its engine's bell to its torn
// front, the middle piece, the fore piece from its torn end to the breach, the command tower's control deck (no sky
// light; the sun only where its holes let it in - wreck.js)
const WRECKS = [['wreckIn', 60, 'jump1', 20], ['jump1', 150, 'jump2', 20], ['jump2', 175, 'breach', 30], ['tower', -20, 'towerOut', 20],
  ...GRAVEYARD.filter((g) => g.how === 'through').map((g) => ['breach', g.from - 10, 'breach', g.to + 10])];
// boost pads: (point, metres after it, lateral x)
const PADS = [['start', 360, 0], ['tunIn', -160, -10], ['tunIn', -160, 10], ['north', 120, 0], ['dive', -260, 12],
  ['preLoop', 30, 0], ['back', 90, -12], ['jump1', -280, 0], ['trench', 420, -10], ['tower', -380, 0], ['west', -300, 10],
  ['west', 60, -10]];
// light gates over the deck: (point, metres after it, colour)
const GATES = [['start', -60, 0x40c8ff], ['crest1', -90, 0xffb020], ['rollIn', -40, 0xb040ff], ['preLoop', -60, 0xff3a6a],
  ['crest2', -90, 0xffb020], ['wreckIn', -270, 0xff4a1c], ['west', 120, 0x40c8ff], ['cork', -330, 0x40ff9a]];
// The structure's light colours (linear, HDR) and growth: the space circuit's blue; a map can bring its own (theme)
export const SPACE_THEME = { field: [0.15, 0.55, 1.0], fieldFlash: [0.7, 0.85, 1.0], strip: [0.03, 0.32, 1.0], stripCore: [0.75, 0.92, 1.0],
  lane: [0.04, 0.33, 1.0], laneCore: [0.75, 0.9, 1.0], spill: [0.06, 0.32, 1.0], stud: [0.7, 1.3, 2.6], trim: [0.08, 0.5, 1.3],
  gantry: [1.0, 1.8, 3.2], lamp: [2.2, 2.6, 3.4], moss: false, flip: [0.62, 0.24, 1.0] };
let TH = SPACE_THEME;
const g3 = (c) => `vec3(${c.map((x) => x.toFixed(3)).join(', ')})`;
// A circuit: its control points and named features (another map passes its own; `start` is near the grid's line,
// towers: the space map's towers on truss arms, meteor: its meteorite round the cave, wrecks: the derelict's dark
// stretches)
export const SPACE_LAYOUT = { ctrl: CTRL, at: AT, loops: LOOPS, gaps: GAPS, tunnels: TUNNELS, caves: CAVES, pads: PADS,
  gates: GATES, start: [0, 0, 430], towers: true, meteor: true, wrecks: WRECKS, flips: FLIPS };
// a layout's control points from a list of [x, y, z, bank, name?]. flips: [pointA, pointB] - a gravity flip between
// two points in a row: the bank turns over by 180 between them (B's bank = A's +- 180) while the centre line climbs
// 18-30 m to the next deck overhead (or drops to one underneath, coming back), 160-260 m on, fairly straight in plan
export function layout(points, rest) {
  const ctrl = [], at = {};
  for (const [x, y, z, bank = 0, name = null] of points) { if (name) at[name] = ctrl.length; ctrl.push([x, y, z, bank]); }
  return { ctrl, at, loops: [], gaps: [], tunnels: [], caves: [], pads: [], gates: [], flips: [], towers: false, meteor: false, ...rest };
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry(), A = a.toNonIndexed(), B = b.toNonIndexed();
  for (const k of ['position', 'normal', 'uv']) {
    const x = A.attributes[k], y = B.attributes[k], arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array); arr.set(y.array, x.array.length);
    g.setAttribute(k, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return g;
}

// Geometric specular anti-aliasing (Kaplanyan & Hoffman 2016): the normal's variation inside a pixel widens the
// highlight's lobe. The deck plates' relief and grit made highlights and reflections crawl and flicker in the distance.
const SPECULAR_AA = /* glsl */`
  {
    vec3 ndx = dFdx(normal), ndy = dFdy(normal);
    float kr = min(0.5 * (dot(ndx, ndx) + dot(ndy, ndy)), 0.18);
    material.roughness = sqrt(min(material.roughness * material.roughness + kr, 1.0));
  }`;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

function speckle(g, w, h, n, cols, size, seed = 7) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[(r() * cols.length) | 0];
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
}

function chevronTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let k = 0; k < 4; k++) {
      const y = h - (k + 0.6) * h / 4;
      g.beginPath();
      g.moveTo(w * 0.08, y + h * 0.1); g.lineTo(w * 0.5, y - h * 0.03); g.lineTo(w * 0.92, y + h * 0.1);
      g.lineTo(w * 0.92, y + h * 0.17); g.lineTo(w * 0.5, y + h * 0.04); g.lineTo(w * 0.08, y + h * 0.17);
      g.closePath(); g.fill();
    }
  }, false);
}

// the energy barrier above the walls: a hex field, scrolling, brighter where the ship is near
function fieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, shipPos: { value: new THREE.Vector3() }, hitN: { value: 0 },
      hits: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -1e6, 0, -100)) }, hitS: { value: [0, 0, 0, 0] } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform vec3 shipPos; uniform vec4 hits[4]; uniform float hitS[4]; varying vec2 vUv; varying vec3 vW;
      float hexEdge(vec2 p) {     // 0 on a cell edge
        p.x *= 1.1547; p.y += mod(floor(p.x), 2.0) * 0.5;
        vec2 f = abs(fract(p) - 0.5);
        return abs(max(f.x * 1.5 + f.y, f.y * 2.0) - 1.0);
      }
      void main() {
        float h = vUv.y;                                   // 0 at the wall top, 1 at the field top
        vec2 p = vec2(vUv.x * 0.6, h * 3.2);
        float e = hexEdge(p), aa = fwidth(e);
        float far = smoothstep(450.0, 140.0, distance(vW, cameraPosition));   // thin lines shimmer far away: fade them
        float edge = (1.0 - smoothstep(0.06, 0.06 + 1.5 * aa, e)) * far * clamp(0.1 / max(aa, 0.1), 0.0, 1.0);
        float fade = (1.0 - h) * (1.0 - h);
        float near = exp(-pow(distance(vW, shipPos) / 22.0, 2.0));
        float scan = 0.5 + 0.5 * sin(vUv.x * 0.8 - time * 6.0);
        // impacts: a bright ring racing out through the cells, a white-hot flash at the point of contact
        float ring = 0.0, flash = 0.0;
        for (int k = 0; k < 4; k++) {
          float age = time - hits[k].w, d = distance(vW, hits[k].xyz);
          if (age < 0.0 || age > 1.2) continue;
          ring += exp(-pow((d - age * 22.0) / 1.6, 2.0)) * exp(-age * 2.5) * hitS[k];
          flash += exp(-d * d / 6.0) * exp(-age * 7.0) * hitS[k];
        }
        vec3 c = ${g3(TH.field)} * (edge * (0.16 + 1.0 * near + 3.0 * ring) + 0.03 + 0.07 * scan * fade + ring * 0.6) * fade;
        c += ${g3(TH.fieldFlash)} * flash * 2.0 * (1.0 - h);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

export const CAVE_R = 40, CAVE_MOUTH = 45;            // the cave's reach round its centre line, its mouths' light fade (m)
export const WRECK_R = 46, WRECK_MOUTH = 30;          // the same for the derelict's dark stretches (round the deck only)
const _cv = new THREE.Vector3(), _cw = new THREE.Vector3();

// A light gate's leg ("make the legs a bit more detailed, they look like a simple texture": they were a bare 1.4 m
// box): an emitter pylon the arch rises out of. A chamfered plinth bolted down, an eight-sided column tapering up with
// ribs on its corners and dark panels on its faces, a cable conduit up its back, a clamp collar at the top round the
// arch's tube with a lens ring, and a light slit down the track side and the outer side - drawn in the arch's own
// material, its uv carrying on from the arch's ends so the pulses run on down into the leg. Origin at the foot,
// x out from the track, y up. arcLen: the arch's length (its uv.x runs 0..1 over it).
function gateLeg(arcLen) {
  const parts = { body: [], trim: [], light: [] };
  const flat = (g) => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); return g; };
  // the plinth, the column and the collar: one turned profile, eight-sided (flats facing the axes)
  const prof = [[0.0, 0], [1.25, 0], [1.25, 0.22], [1.12, 0.34], [0.86, 0.34], [0.86, 0.46], [0.8, 0.5], [0.68, 2.5], [0.8, 2.52],
    [0.82, 2.6], [0.82, 2.84], [0.72, 2.92], [0.52, 2.92], [0.52, 2.78], [0.0, 2.78]].map(([r, y]) => new THREE.Vector2(r / Math.cos(Math.PI / 8), y));
  parts.body.push(flat(new THREE.LatheGeometry(prof, 8, Math.PI / 8)));
  const colR = (y) => 0.8 + (0.68 - 0.8) * (y - 0.5) / 2.0;                  // (the column's apothem at y)
  // corner ribs, following the taper
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const b0 = d.clone().multiplyScalar(colR(0.6) / Math.cos(Math.PI / 8) + 0.03).setY(0.6), b1 = d.clone().multiplyScalar(colR(2.45) / Math.cos(Math.PI / 8) + 0.03).setY(2.45);
    const g = new THREE.BoxGeometry(0.1, b1.distanceTo(b0), 0.16);
    g.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), d, new THREE.Vector3(0, 1, 0)));
    const tilt = Math.atan2(b0.clone().setY(0).length() - b1.clone().setY(0).length(), b1.y - b0.y);
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-d.z, 0, d.x), tilt));
    g.translate((b0.x + b1.x) / 2, (b0.y + b1.y) / 2, (b0.z + b1.z) / 2);
    parts.body.push(flat(g));
  }
  // dark panels on the four faces, each lying on its tapered face (a panel and its frame), and bolts round the plinth
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const tilt = Math.atan2(0.12, 2.0);
    for (const [w, h, t, y, into] of [[0.62, 1.5, 0.03, 1.45, 'trim'], [0.5, 1.36, 0.035, 1.45, 'trim']]) {
      if (into === 'trim' && w < 0.6 && (k === 0 || k === 2)) continue;          // (the slit faces: no inner panel)
      const g = new THREE.BoxGeometry(t, h, w);
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-tilt));
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(-a));
      g.translate(n.x * (colR(y) + t / 2 - 0.004), y, n.z * (colR(y) + t / 2 - 0.004));
      parts[into].push(flat(g));
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + k * Math.PI / 4, r = 1.02;
    const g = new THREE.CylinderGeometry(0.055, 0.055, 0.06, 6).translate(r * Math.cos(a), 0.37, r * Math.sin(a));
    parts.trim.push(flat(g));
  }
  // the cable conduit up the back (the -z face), into a clamp box under the collar
  parts.trim.push(flat(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8).translate(0, 1.36, -(colR(1.36) + 0.12))));
  parts.trim.push(flat(new THREE.BoxGeometry(0.3, 0.22, 0.2).translate(0, 2.3, -(colR(2.3) + 0.08))));
  parts.trim.push(flat(new THREE.BoxGeometry(0.34, 0.12, 0.28).translate(0, 0.52, -(colR(0.52) + 0.1))));
  // its mount: it stands 1.8 m out past the deck's side face (x = -1.8 here), so a bearer under the plinth runs back to
  // a plate bolted flat on that face, two braces under it (without them it hung in space beside the deck)
  const EDGE = -(2.5 - WALL_T);                                               // (the deck's side face; the deck 1.8 m deep)
  parts.trim.push(flat(new THREE.BoxGeometry(1.3 - EDGE, 0.34, 2.0).translate((1.3 + EDGE) / 2, -0.37, 0)));
  parts.trim.push(flat(new THREE.BoxGeometry(0.2, 1.5, 2.3).translate(EDGE + 0.1, -0.95, 0)));
  for (const z of [-0.85, 0.85]) {
    const a0 = new THREE.Vector3(EDGE + 0.2, -1.55, z), a1 = new THREE.Vector3(1.0, -0.55, z), d = a1.clone().sub(a0);
    const g = new THREE.BoxGeometry(0.18, d.length(), 0.18);
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.atan2(d.x, d.y)));
    g.translate((a0.x + a1.x) / 2, (a0.y + a1.y) / 2, z);
    parts.trim.push(flat(g));
  }
  for (const y of [-0.5, -1.0, -1.45]) for (const z of [-0.8, 0.8]) {
    parts.body.push(flat(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 6).rotateZ(Math.PI / 2).translate(EDGE + 0.23, y, z)));
  }
  // the light: a slit on the track side (-x) and on the outer side (+x), each in a dark recess; the lens ring
  const slit = (x, sgn) => {
    const g = new THREE.PlaneGeometry(0.12, 1.75);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(sgn > 0 ? Math.PI / 2 : -Math.PI / 2));
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(sgn * -Math.atan2(0.12, 2.0)));
    g.translate(x, 1.42, 0);
    return g;
  };
  for (const sgn of [-1, 1]) {
    parts.trim.push(flat(new THREE.BoxGeometry(0.06, 1.85, 0.22).applyMatrix4(new THREE.Matrix4().makeRotationZ(sgn * -Math.atan2(0.12, 2.0))).translate(sgn * (colR(1.42) - 0.02), 1.42, 0)));
    parts.light.push(slit(sgn * (colR(1.42) + 0.014), sgn));
  }
  parts.light.push(new THREE.TorusGeometry(0.62, 0.045, 8, 32).rotateX(Math.PI / 2).translate(0, 2.93, 0));
  const merge = (gs) => mergeGeometries(gs.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); return x; }));
  // the light's uv: x carries on from the arch's end (its 0 at y = WALL_H + 0.2 above the foot), y across the slit
  const lightFor = (mirror) => {
    const g = merge(parts.light), P = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const a = (P.getY(i) - (WALL_H + 0.2)) / arcLen;
      uv.setX(i, mirror ? 1 - a : a);
    }
    return g;
  };
  return {
    body: merge(parts.body), trim: merge(parts.trim), lightL: lightFor(false), lightR: lightFor(true),
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x40464e, roughness: 0.42, metalness: 0.75 }),
    trimMat: new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.62, metalness: 0.55 }),
  };
}

export class Track {
  constructor(L = SPACE_LAYOUT) {
    this.L = L;
    const { ctrl: CTRL, at: AT, loops: LOOPS, gaps: GAPS, tunnels: TUNNELS, caves: CAVES, pads: PADS, gates: GATES } = L;
    const pts = CTRL.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    // an arc-length table fine enough for 2 m samples (three's default is 200 divisions: ~70 m on this lap, and the
    // samples' spacing and direction wandered - harmless on the deck, but 25 m up a jump the deck's up vector levers
    // that into a ship lurching 1.6-3.7 m a step: "the enemy ships still bug out in jumps")
    this.curve.arcLengthDivisions = 20000;
    this.length = this.curve.getLength();
    const n = (this.n = Math.round(this.length / STEP));
    this.step = this.length / n;
    const sp = this.curve.getSpacedPoints(n);
    sp.length = n;                                   // (closed: the last spaced point repeats the first)
    // round the centreline off over ~6 m: the sharp crests were kinks that a ship 20 m up a jump turned into lurches
    for (let pass = 0; pass < 3; pass++) {
      const q = sp.map((v) => v.clone());
      for (let i = 0; i < n; i++) sp[i].copy(q[(i + n - 1) % n]).add(q[i]).add(q[i]).add(q[(i + 1) % n]).multiplyScalar(0.25);
    }
    this.P = []; this.T = []; this.U = []; this.R = [];
    for (let i = 0; i < n; i++) {
      this.P.push(sp[i].clone());
      this.T.push(sp[(i + 1) % n].clone().sub(sp[(i + n - 1) % n]).normalize());
    }
    // bank: per control point, eased between them the short way round
    const kIdx = CTRL.map(([x, y, z]) => {
      let best = 1e18, bi = 0;
      for (let i = 0; i < n; i++) { const d = this.P[i].distanceToSquared(new THREE.Vector3(x, y, z)); if (d < best) { best = d; bi = i; } }
      return bi;
    });
    const bank = new Float32Array(n);
    for (let j = 0; j < CTRL.length; j++) {
      const a = kIdx[j], b = kIdx[(j + 1) % CTRL.length], len = (b - a + n) % n;
      const b0 = CTRL[j][3], d = ((CTRL[(j + 1) % CTRL.length][3] - b0 + 540) % 360) - 180;
      for (let k = 0; k < len; k++) bank[(a + k) % n] = b0 + d * (0.5 - 0.5 * Math.cos(Math.PI * k / len));
    }
    const Y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const T = this.T[i], u0 = Y.clone().addScaledVector(T, -T.dot(Y)).normalize(), r0 = new THREE.Vector3().crossVectors(T, u0);
      const b = THREE.MathUtils.degToRad(bank[i]), c = Math.cos(b), s = Math.sin(b);
      this.U.push(u0.clone().multiplyScalar(c).addScaledVector(r0, s));
      this.R.push(r0.clone().multiplyScalar(c).addScaledVector(u0, -s));
    }
    // inside a loop the deck's up is carried along without twist (rotation-minimising frame, double reflection) from
    // the frame at its entry; what it misses the exit frame by is spread evenly back through the loop
    this.at = (name, off = 0) => this.wrap(kIdx[AT[name]] * this.step + off);
    this.loops = LOOPS.map(([a, b]) => [kIdx[AT[a]], kIdx[AT[b]]]);
    for (const [i0, i1] of this.loops) {
      const len = (i1 - i0 + n) % n, Us = [this.U[i0].clone()];
      for (let k = 0; k < len; k++) {
        const ia = (i0 + k) % n, ib = (ia + 1) % n, v1 = this.P[ib].clone().sub(this.P[ia]), c1 = v1.dot(v1);
        const r = Us[k], rL = r.clone().addScaledVector(v1, -2 / c1 * v1.dot(r));
        const tL = this.T[ia].clone().addScaledVector(v1, -2 / c1 * v1.dot(this.T[ia]));
        const v2 = this.T[ib].clone().sub(tL), c2 = v2.dot(v2);
        Us.push(c2 > 1e-12 ? rL.addScaledVector(v2, -2 / c2 * v2.dot(rL)) : rL);
      }
      const ie = i1 % n, Te = this.T[ie], ue = Us[len].clone().addScaledVector(Te, -Te.dot(Us[len])).normalize();
      const miss = Math.atan2(new THREE.Vector3().crossVectors(ue, this.U[ie]).dot(Te), ue.dot(this.U[ie]));
      for (let k = 1; k < len; k++) {
        const i = (i0 + k) % n, T = this.T[i];
        const u = Us[k].addScaledVector(T, -T.dot(Us[k])).normalize().applyAxisAngle(T, miss * k / len);
        this.U[i].copy(u);
        this.R[i].crossVectors(T, u);
      }
    }
    // the cuts in the deck: from / to arc length, a per-segment mask the meshes skip, and the lips
    this.gaps = GAPS.map(([a, f, t]) => [this.at(a, f), this.at(a, t)]);
    // "add a new mechanic, like gravity rotates and the ship does a 180": the gravity flips. The deck stops, the bank
    // turns over by half a turn and the next deck is overhead - the field carries the ships across onto its underside
    // (TrackRacer). To the meshes, the lips and the rivals' plan a flip is a cut; it is listed apart for the physics
    // and the field that shows it
    this.flips = (L.flips || []).map(([a, b]) => [this.at(a), this.at(b)]);
    this.gaps.push(...this.flips);
    this.solid = new Uint8Array(n).fill(1);
    for (const [s0, s1] of this.gaps) {
      for (let i = 0; i < n; i++) { const s = (i + 0.5) * this.step; if (this.inSpan(s, s0, s1)) this.solid[i] = 0; }
    }
    this.tunnels = TUNNELS.map(([a, b]) => [this.at(a), this.at(b)]);
    this.caves = CAVES.map(([a, fa, b, fb]) => [this.at(a, fa), this.at(b, fb)]);
    // covered stretches (the forest's tunnels of vines): no gantry, lamp post, board or gate inside one
    this.canopies = (L.canopies || []).map(([a, fa, b, fb]) => [this.at(a, fa), this.at(b, fb)]);
    // and the stretches something else covers (the forest's skull): nothing of the track's own over the deck there
    this.covers = (L.covers || []).map(([a, fa, b, fb]) => [this.at(a, fa), this.at(b, fb)]);
    // the cave's centre line (a polyline the shaders test every pixel against: inside it, no sun and no sky light): at
    // least `min` segments, at most `every` m long; off / total: where it starts along its whole stretch, and that
    // stretch's length (the light fades in over the stretch's own mouths only)
    const centreLine = ([s0, s1], off = 0, total = null, min = 15, every = 50) => {
      const len = this.wrap(s1 - s0), pts = [], m = Math.max(min, Math.ceil(len / every));
      for (let k = 0; k <= m; k++) {                     // (the raw samples: frame() needs the curvature, not made yet)
        const i = Math.round(this.wrap(s0 + (len * k) / m) / this.step) % n;
        pts.push(this.P[i].clone().addScaledVector(this.U[i], 5));
      }
      return { pts, len, off, total: total ?? len };
    };
    this.caveLines = this.caves.map((c) => centreLine(c));
    // the derelict's dark stretches: no sky light round the deck there (look.js shade lines), and the ships' lights on;
    // they count as caves for what stands on the track (no gantries, lamps or towers) and for the echo
    this.meteorCaves = this.caves;
    this.wrecks = (L.wrecks || []).map(([a, fa, b, fb]) => [this.at(a, fa), this.at(b, fb)]);
    // (in lines of 600 m at most, a point every ~100 m - its bends are wide: each is tested only near itself, and every
    // shader of every material carries them all)
    this.wreckLines = this.wrecks.flatMap(([s0, s1]) => {
      const len = this.wrap(s1 - s0), m = Math.ceil(len / 600);
      return Array.from({ length: m }, (_, k) => centreLine([s0 + (len * k) / m, s0 + (len * (k + 1)) / m], (len * k) / m, len, 3, 100));
    });
    this.caves = [...this.caves, ...this.wrecks];
    this.keepOut = [];                                   // spheres the asteroids and towers stay out of ({ c, r })
    // curvature in the deck's own frame: kv > 0 where it dips (presses the ship down), kh > 0 turning right
    this.kv = new Float32Array(n); this.kh = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dT = this.T[(i + 1) % n].clone().sub(this.T[(i + n - 1) % n]).divideScalar(2 * this.step);
      this.kv[i] = dT.dot(this.U[i]);
      this.kh[i] = dT.dot(this.R[i]);
    }
    // across a flip the field carries the ship along the centre line: no bend for it to answer (the roll folds the
    // climb into a turn)
    for (let i = 0; i < n; i++) if (this.inFlip(i * this.step, 4)) { this.kv[i] = 0; this.kh[i] = 0; }
    // minimap / HUD arrays (x, z)
    this.px = new Float32Array(n); this.pz = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.px[i] = this.P[i].x; this.pz[i] = this.P[i].z; }
    this.start = this.nearestIndex(new THREE.Vector3(...L.start));
    this.pads = PADS.map(([a, off, x]) => ({ s: this.at(a, off), x }));
    this.gates = GATES.map(([a, off, col]) => ({ s: this.at(a, off), col }));
  }

  // s within [s0, s1] on the lap (wrapping)
  inSpan(s, s0, s1) { const d = this.wrap(s - s0); return d <= this.wrap(s1 - s0); }

  // a cut in the deck at s (pad: metres of margin either side)
  inGap(s, pad = 0) {
    for (const [s0, s1] of this.gaps) if (this.inSpan(s, s0 - pad, s1 + pad)) return true;
    return false;
  }

  inFlip(s, pad = 0) {
    for (const [s0, s1] of this.flips) if (this.inSpan(s, s0 - pad, s1 + pad)) return true;
    return false;
  }

  // how far through a gravity flip s is (0 .. 1), or -1 outside one
  flipAt(s) {
    for (const [s0, s1] of this.flips) if (this.inSpan(s, s0, s1)) return this.wrap(s - s0) / this.wrap(s1 - s0);
    return -1;
  }

  inLoop(s, pad = 0) {
    for (const [i0, i1] of this.loops) if (this.inSpan(s, i0 * this.step - pad, i1 * this.step + pad)) return true;
    return false;
  }

  inCave(s, pad = 0) {
    for (const [s0, s1] of this.caves) if (this.inSpan(s, s0 - pad, s1 + pad)) return true;
    return false;
  }

  // how much daylight reaches p (1 out in the open .. 0 deep in the cave or the derelict) - the same test the shaders
  // make
  caveLight(p, R = CAVE_R, mouth = CAVE_MOUTH) {
    let k = 1;
    const line = ({ pts, len, off, total }, R, mouth) => {
      let dmin = 1e9, t = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], ab = _cv.subVectors(pts[i + 1], a), h = clamp(_cw.subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
        const d = _cw.subVectors(p, a).addScaledVector(ab, -h).length();
        if (d < dmin) { dmin = d; t = (i + h) / (pts.length - 1); }
      }
      const along = off + t * len, inside = 1 - smoothstep(R - 4, R + 2, dmin), ends = smoothstep(0, mouth, Math.min(along, total - along));
      k = Math.min(k, 1 - inside * ends);
    };
    for (const l of this.caveLines) line(l, R, mouth);
    for (const l of this.wreckLines) line(l, WRECK_R, WRECK_MOUTH);
    return k;
  }

  inCanopy(s, pad = 0) {
    for (const [s0, s1] of this.canopies) if (this.inSpan(s, s0 - pad, s1 + pad)) return true;
    for (const [s0, s1] of this.covers) if (this.inSpan(s, s0 - pad, s1 + pad)) return true;
    return false;
  }

  inTunnel(s, pad = 0) {
    for (const [s0, s1] of this.tunnels) if (this.inSpan(s, s0 - pad, s1 + pad)) return true;
    return false;
  }

  // the deck's colour, relief and finish, generated on the GPU (deck.js)
  bakeDeck(renderer) {
    const m = bakeDeckMaps(renderer), mat = this.deckMat;
    mat.map = m.map; mat.normalMap = m.normal; mat.roughnessMap = m.rough;
    this.deckDetail.map.value = m.detailAlbedo;
    this.deckDetail.normal.value = m.detailNormal;
    mat.needsUpdate = true;
  }

  // the deck's mean colour (linear), as its material makes it: the plates' map averaged over its whole tile, times the
  // detail layer's mean gain and the circuit's own tint (the desert's sand-washed concrete) - for the light it throws
  // up onto the ships (ship.js setDeckLight). Measured once on the GPU (64 x 64 samples at a coarse mip).
  deckAlbedo(renderer) {
    const map = this.deckMat.map, det = this.deckDetail.map.value, out = new THREE.Color(0.25, 0.25, 0.25);
    if (!map) return out;
    const rt = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const q = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { map: { value: map }, det: { value: det } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`uniform sampler2D map, det;
        void main() {
          vec3 s = vec3(0.0); float d = 0.0;
          for (int y = 0; y < 64; y++) for (int x = 0; x < 64; x++) {
            vec2 uv = (vec2(x, y) + 0.5) / 64.0;
            s += textureLod(map, uv, 4.0).rgb;
            ${det ? 'd += textureLod(det, uv, 4.0).r;' : 'd += 0.5;'}
          }
          gl_FragColor = vec4(s / 4096.0, (0.72 + 0.56 * d / 4096.0) / 1.5);
        }` }));
    const px = new Uint8Array(4), prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); q.render(renderer); renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px); renderer.setRenderTarget(prev);
    q.material.dispose(); q.dispose(); rt.dispose();
    const g = px[3] / 255 * 1.5;
    out.setRGB(px[0] / 255 * g, px[1] / 255 * g, px[2] / 255 * g);
    if (TH.sand) out.multiply(new THREE.Color(2.3, 1.9, 1.4));         // (as the deck's shader tints it)
    return out;
  }

  // the fastest a ship can take each metre: the yaw rate it can turn at over the curvature there, then a braking
  // pass backwards round the lap (twice, so the line before the start sees the first corner)
  speedProfile(brake = 40, vMax = 390, airbrake = 1.35) {
    const n = this.n, v = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let k = 0;
      for (let j = -6; j <= 6; j++) k = Math.max(k, Math.abs(this.kh[(i + j + n) % n]));
      let lo = 10, hi = vMax;                              // the fastest v with v * k <= turnRate(v) * airbrake
      for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; if (m * k <= turnRate(m) * airbrake) lo = m; else hi = m; }
      v[i] = lo;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % n] ** 2 + 2 * brake * this.step));
    }
    return v;
  }

  // a racing line (lateral offset per metre): wide before a corner, the inside at its apex, wide again after
  racingLine(margin = 9) {
    const n = this.n, W = TRACK_W / 2 - margin;
    const smooth = (a, win) => {
      const out = new Float32Array(n);
      let acc = 0;
      for (let j = -win; j <= win; j++) acc += a[(j + n) % n];
      for (let i = 0; i < n; i++) {
        out[i] = acc / (2 * win + 1);
        acc += a[(i + win + 1) % n] - a[(i - win + n) % n];
      }
      return out;
    };
    const k = smooth(this.kh, 15), L = Math.round(110 / this.step), line = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const around = (k[(i + L) % n] + k[(i - L + n) % n]) / 2;
      line[i] = clamp((k[i] - 0.9 * around) * 1500, -1, 1) * W;
    }
    return smooth(line, 20);
  }

  nearestIndex(p) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < this.n; i++) { const d = this.P[i].distanceToSquared(p); if (d < best) { best = d; bi = i; } }
    return bi;
  }

  wrap(s) { return ((s % this.length) + this.length) % this.length; }

  // the frame at arc length s, interpolated: { P, T, U, R, kv, kh }
  frame(s, out = {}) {
    const f = this.wrap(s) / this.step, i = Math.floor(f) % this.n, j = (i + 1) % this.n, t = f - Math.floor(f);
    out.P = (out.P || new THREE.Vector3()).lerpVectors(this.P[i], this.P[j], t);
    out.T = (out.T || new THREE.Vector3()).lerpVectors(this.T[i], this.T[j], t).normalize();
    out.U = (out.U || new THREE.Vector3()).lerpVectors(this.U[i], this.U[j], t);
    out.U.addScaledVector(out.T, -out.T.dot(out.U)).normalize();
    out.R = (out.R || new THREE.Vector3()).crossVectors(out.T, out.U);
    out.kv = this.kv[i] + (this.kv[j] - this.kv[i]) * t;
    out.kh = this.kh[i] + (this.kh[j] - this.kh[i]) * t;
    return out;
  }

  // a ribbon of cross-section points swept along the track: section = [[x, y, u], ...], normals per segment side
  sweep(section, vScale, closeLoop = true) {
    const pos = [], nrm = [], uv = [], idx = [], n = this.n, m = section.length;
    for (let i = 0; i <= n; i++) {
      const k = i % n, P = this.P[k], U = this.U[k], R = this.R[k];
      for (let c = 0; c < m; c++) {
        const [x, y, u, nx, ny] = section[c];
        pos.push(P.x + R.x * x + U.x * y, P.y + R.y * x + U.y * y, P.z + R.z * x + U.z * y);
        nrm.push(R.x * nx + U.x * ny, R.y * nx + U.y * ny, R.z * nx + U.z * ny);
        uv.push(u, (i * this.step) / vScale);
      }
    }
    for (let i = 0; i < n; i++) {
      if (!this.solid[i]) continue;                    // a cut in the deck: nothing there
      for (let c = 0; c < m - 1; c++) {
        if (section[c][5] === 'cut') continue;          // a hard edge between two faces of the section
        const a = i * m + c, b = a + 1, d = a + m, e = d + 1;
        idx.push(a, b, d, b, e, d);                    // counter-clockwise seen from the face's normal side
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.userData.xrChunkIndices = Math.max(1, Math.floor(160 / this.step)) * 6 * section.slice(0, -1).filter(p => p[5] !== 'cut').length;
    return g;
  }

  // the structure's faces swept along the track, each with its own coordinates for the hull material (hull.js):
  // faces = [{ a: [x, y], b: [x, y], n: [nx, ny], kind }], a -> b counter-clockwise seen from the normal's side;
  // mirror: the same faces drawn on the left (swapped ends keep them facing out)
  hullSweep(faces, mirror = false) {
    if (mirror) faces = faces.map((f) => ({ ...f, a: f.b, b: f.a }));
    const F = faces.length, n = this.n, pos = [], nrm = [], huv = [], hf = [], ht = [], idx = [];
    const fw = faces.map((f) => Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]));
    for (let i = 0; i <= n; i++) {
      const k = i % n, P = this.P[k], U = this.U[k], R = this.R[k];
      faces.forEach((f, c) => {
        const W = fw[c], tx = (f.b[0] - f.a[0]) / W, ty = (f.b[1] - f.a[1]) / W;
        for (const [q, u] of [[f.a, 0], [f.b, W]]) {
          pos.push(P.x + R.x * q[0] + U.x * q[1], P.y + R.y * q[0] + U.y * q[1], P.z + R.z * q[0] + U.z * q[1]);
          nrm.push(R.x * f.n[0] + U.x * f.n[1], R.y * f.n[0] + U.y * f.n[1], R.z * f.n[0] + U.z * f.n[1]);
          huv.push(u, i * this.step);
          hf.push(W, f.kind);
          ht.push(R.x * tx + U.x * ty, R.y * tx + U.y * ty, R.z * tx + U.z * ty);
        }
      });
    }
    for (let i = 0; i < n; i++) {
      if (!this.solid[i]) continue;                    // a cut in the deck: nothing there
      for (let c = 0; c < F; c++) {
        const a = (i * F + c) * 2, b = a + 1, d = a + 2 * F, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('hullUV', new THREE.Float32BufferAttribute(huv, 2));
    g.setAttribute('hullF', new THREE.Float32BufferAttribute(hf, 2));
    g.setAttribute('hullT', new THREE.Float32BufferAttribute(ht, 3));
    g.setIndex(idx);
    g.userData.xrChunkIndices = Math.max(1, Math.floor(160 / this.step)) * 6 * F;
    return g;
  }

  meshes(scene) {
    TH = this.L.theme || SPACE_THEME;                // (the materials below are made with this circuit's colours)
    const W = TRACK_W / 2;
    const out = {};
    // a section drawn right-to-left faces the other way: mirror sections are reversed (their 'cut' flags move with
    // the segment they mark), so both walls face the deck
    const rev = (sec) => {
      const m = sec.length, r = sec.map((p) => p.slice(0, 5)).reverse();
      sec.forEach((p, k) => { if (p[5] === 'cut') r[m - 2 - k][5] = 'cut'; });
      return r;
    };
    // deck top (u across), and the underside + sides (a hard edge at each corner: duplicate points per face)
    const top = this.sweep([[-W, 0, 0, 0, 1], [W, 0, 1, 0, 1]], 40);
    // the maps are made on the GPU (bakeDeck, deck.js) once the renderer exists
    const detail = (this.deckDetail = { map: { value: null }, normal: { value: null } });
    const deckMat = new THREE.MeshStandardMaterial({ normalScale: new THREE.Vector2(0.8, 0.8), roughness: 1.0, metalness: 0.08 });
    deckMat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = detail.map;
      sh.uniforms.detailNormal = detail.normal;
      sh.uniforms.detailRep = { value: new THREE.Vector2(TRACK_W / 4, 40 / 4) };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform sampler2D detailNormal;\nuniform vec2 detailRep;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 0.72 + 0.56 * texture2D(detailMap, vMapUv * detailRep).r;')
        .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale;\n  mapN.xy += (texture2D(detailNormal, vNormalMapUv * detailRep).xy * 2.0 - 1.0) * 0.45;')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + SPECULAR_AA);
    };
    if (TH.moss || TH.seaMoss) {
      // moss creeping in from both walls - in places a hand's width, in places metres - broken up, in the seams (a sea
      // map's: weed, and only where the deck is under the sea). The sea map's deck in the rain: puddles (deckRain,
      // deckTime - its world sets them), dark and smooth as glass, the drops ringing them near the camera
      const puddle = (this.deckRainU = { deckRain: { value: 0 }, deckTime: { value: 0 } });
      const before = deckMat.onBeforeCompile;
      deckMat.onBeforeCompile = (sh) => {
        before(sh);
        Object.assign(sh.uniforms, puddle);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
float deckMoss = 0.0, deckSeaWet = 0.0, deckPuddle = 0.0; vec2 deckPP = vec2(0.0);
uniform float deckRain, deckTime;
float pdH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float pdN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pdH(i), pdH(i + vec2(1, 0)), f.x), mix(pdH(i + vec2(0, 1)), pdH(i + vec2(1, 1)), f.x), f.y); }
// the drops' rings in a puddle: one drop in each cell of two grids at a time, its ring inside its cell; the slope
vec2 deckRipple(vec2 p, float t) {
  vec2 g = vec2(0.0);
  for (int L = 0; L < 2; L++) {
    float cs = L == 0 ? 0.42 : 0.61;
    vec2 q = p / cs + float(L) * 3.7, i = mod(floor(q), 289.0), f = fract(q);
    vec2 h = fract(sin(vec2(dot(i, vec2(127.1, 311.7)), dot(i, vec2(269.5, 183.3)))) * 43758.5453);
    float ph = fract(t * (1.3 + 0.7 * h.y) + h.x * 7.0);
    vec2 dv = f - (0.3 + 0.4 * h);
    float d = length(dv), w = (d - ph * 0.3) / 0.05;
    g += dv / max(d, 1e-4) * (-w * exp(-w * w)) * (1.0 - ph) * (1.0 - ph) * 0.8;
  }
  return g;
}`)
          .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float x = abs(vMapUv.x - 0.5) * ${TRACK_W.toFixed(1)}, along = vMapUv.y * 40.0, edge = ${(TRACK_W / 2).toFixed(1)} - x;
    float n1 = texture2D(detailMap, vec2(along / 23.0, x / 9.0)).r, n2 = texture2D(detailMap, vec2(along / 3.7, x / 2.9) + 0.31).r;
    float reach = 0.5 + 2.4 * smoothstep(0.4, 0.75, texture2D(detailMap, vec2(along / 97.0, 0.17)).r);
    float base = 1.0 - smoothstep(reach * 0.35, reach, edge);
    deckMoss = smoothstep(0.42, 0.62, base * 0.85 + n1 * 0.45 + n2 * 0.25 - 0.35);
    ${TH.seaMoss ? `#ifdef USE_FOG
    deckMoss *= smoothstep(-4.0, -14.0, vFogWorld.y);
    // (over the sea the deck dark and wet with the spray: a darker, cinematic night - the lamps' pools, the headlights
    // and the glints off it stand out)
    deckSeaWet = smoothstep(-1.0, 2.0, vFogWorld.y);
    diffuseColor.rgb *= 1.0 - 0.42 * deckSeaWet;
    // the puddles: where the deck dips a little, lying in long patches (none under the weed, none under the sea)
    {
      float xs = (vMapUv.x - 0.5) * ${TRACK_W.toFixed(1)}, al = mod(along, 400.0);
      // (smooth patches a few metres across, more of them in stretches; their edges soft over a hand's width)
      float n = pdN(vec2(al / 4.5, xs / 2.6)) * 0.62 + pdN(vec2(al / 1.7, xs / 1.2) + 5.3) * 0.18 + pdN(vec2(al / 31.0, 0.7)) * 0.2;
      deckPuddle = smoothstep(0.6, 0.64, n) * deckSeaWet * deckRain;
      deckPP = vec2(xs, al);
      diffuseColor.rgb *= 1.0 - 0.6 * deckPuddle;
    }
    #endif` : ''}
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.035, 0.06, 0.015), vec3(0.08, 0.11, 0.025), n2), deckMoss);
  }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.95, deckMoss) * (1.0 - 0.3 * deckSeaWet);\n  roughnessFactor = mix(roughnessFactor, 0.035, deckPuddle);')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor *= 1.0 - deckPuddle;')
          // (a puddle's face: flat - the deck's own grain gone under it - and ringed by the drops near the camera)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (deckPuddle > 0.001) {
    vec3 nP = nonPerturbedNormal;
    #if defined( USE_NORMALMAP_TANGENTSPACE ) && defined( USE_FOG )
    vec2 rr = deckRipple(deckPP, deckTime) * (1.0 - smoothstep(14.0, 40.0, distance(vFogWorld, cameraPosition)));
    nP = normalize(tbn * vec3(rr, 1.0));
    #endif
    normal = normalize(mix(normal, nP, deckPuddle));
  }`);
      };
    }
    if (TH.frost) {
      // rime creeping in from both walls, and tongues of snow blown across the deck here and there
      const before = deckMat.onBeforeCompile;
      deckMat.onBeforeCompile = (sh) => {
        before(sh);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
float deckFrost = 0.0;
float frH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float frN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(frH(i), frH(i + vec2(1, 0)), f.x), mix(frH(i + vec2(0, 1)), frH(i + vec2(1, 1)), f.x), f.y); }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // (v split into whole 400 m and the rest: along the lap it runs to ~10 km and the noise wants small numbers)
    float x = abs(vMapUv.x - 0.5) * ${TRACK_W.toFixed(1)}, along = mod(vMapUv.y * 40.0, 400.0), edge = ${(TRACK_W / 2).toFixed(1)} - x;
    float side = step(0.5, vMapUv.x) * 17.0;
    float n1 = frN(vec2(along / 9.0, x / 3.0) + side), n2 = frN(vec2(along / 1.3, x / 1.1) + side + 3.7);
    float reach = 1.2 + 5.5 * smoothstep(0.25, 0.8, frN(vec2(along / 37.0, 1.3) + side));
    float base = 1.0 - smoothstep(reach * 0.35, reach, edge + (n1 - 0.5) * 1.6);
    float tongue = smoothstep(0.56, 0.76, frN(vec2((along + x * 1.25) / 5.5, x / 19.0) + 7.1))
      * smoothstep(0.35, 0.6, frN(vec2(along / 90.0, 2.9)));
    deckFrost = clamp(smoothstep(0.35, 0.6, base * 0.9 + (n2 - 0.5) * 0.3) + tongue * (0.55 + 0.45 * n2), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.24, 0.32, 0.43), vec3(0.48, 0.58, 0.72), n2), deckFrost * 0.7);
  }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.85, deckFrost);')
          // (a low sun's glint off the deck held to a glow: racing into the sunset it greyed the whole road)
          .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(0.6));');
      };
    }
    if (TH.sand) {
      // the plates a warm sand-washed concrete; sand blown in against both walls (a hand's width to metres deep) and
      // tongues of it combed across the deck by the wind
      const before = deckMat.onBeforeCompile;
      deckMat.onBeforeCompile = (sh) => {
        before(sh);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
float deckSand = 0.0;
float snH(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float snN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(snH(i), snH(i + vec2(1, 0)), f.x), mix(snH(i + vec2(0, 1)), snH(i + vec2(1, 1)), f.x), f.y); }`)
          .replace('#include <map_fragment>', `#include <map_fragment>
  {
    // (v split into whole 400 m and the rest: along the lap it runs to ~14 km and the noise wants small numbers)
    float x = abs(vMapUv.x - 0.5) * ${TRACK_W.toFixed(1)}, along = mod(vMapUv.y * 40.0, 400.0), edge = ${(TRACK_W / 2).toFixed(1)} - x;
    float side = step(0.5, vMapUv.x) * 17.0;
    float n1 = snN(vec2(along / 7.0, x / 2.5) + side), n2 = snN(vec2(along / 1.1, x / 0.9) + side + 3.7);
    float reach = 1.4 + 6.5 * smoothstep(0.25, 0.8, snN(vec2(along / 41.0, 1.3) + side));
    float base = 1.0 - smoothstep(reach * 0.3, reach, edge + (n1 - 0.5) * 1.5);
    float tongue = smoothstep(0.58, 0.8, snN(vec2((along + x * 0.9) / 6.5, x / 23.0) + 7.1))
      * smoothstep(0.3, 0.6, snN(vec2(along / 110.0, 2.9)));
    deckSand = clamp(smoothstep(0.35, 0.6, base * 0.9 + (n2 - 0.5) * 0.3) + tongue * (0.35 + 0.5 * n2), 0.0, 1.0);
    diffuseColor.rgb *= vec3(2.3, 1.9, 1.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.4, 0.22, 0.1), vec3(0.54, 0.33, 0.16), n2), deckSand * 0.85);
  }`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.92, deckSand);')
          .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1.0 - 0.8 * deckSand);')
          // (a low sun's glint off the deck held to a glow: racing into the sunset it greyed the whole road)
          .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(0.8));');
      };
    }
    deckMat.customProgramCacheKey = () => (TH.seaMoss ? 'feather-deck-seamoss' : TH.moss ? 'feather-deck-moss' : TH.frost ? 'feather-deck-frost' : TH.sand ? 'feather-deck-sand' : 'feather-deck');
    this.deckMat = deckMat;
    out.deck = new THREE.Mesh(top, deckMat);
    const E = W + WALL_T;
    const under = this.hullSweep([
      { a: [E, 0], b: [E, -DECK], n: [1, 0], kind: HULL_SIDE },
      { a: [E, -DECK], b: [-E, -DECK], n: [0, -1], kind: HULL_UNDER },
      { a: [-E, -DECK], b: [-E, 0], n: [-1, 0], kind: HULL_SIDE },
    ]);
    // painted steel plates, computed per pixel (hull.js)
    const metal = hullMaterial(TH.moss ? { moss: true, key: 'hull-moss' } : {});
    out.under = new THREE.Mesh(under, metal);
    // walls: inner face, top, outer face, both sides
    const wall = (s) => this.hullSweep([
      { a: [s * W, 0], b: [s * W, WALL_H], n: [-s, 0], kind: HULL_SIDE },
      { a: [s * W, WALL_H], b: [s * E, WALL_H], n: [0, 1], kind: HULL_SIDE },
      { a: [s * E, WALL_H], b: [s * E, 0], n: [s, 0], kind: HULL_SIDE },
    ], s < 0);
    out.walls = [new THREE.Mesh(wall(-1), metal), new THREE.Mesh(wall(1), metal)];
    // a glowing strip along the top of each wall's inner face. 2 cm off the face: past ~250 m the depth buffer (near
    // 0.2, far 30 km) no longer told them apart and the strip flickered in and out along the far walls ("the light line
    // flicker in and out of existance in some places") - drawn a few depth steps toward the camera, at any distance
    const stripMat = new THREE.ShaderMaterial({
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`varying vec2 vUv;
        void main() {
          float u = abs(vUv.x - 0.5) * 2.0, aa = fwidth(u) * 1.5;
          float core = 1.0 - smoothstep(0.22 - aa, 0.22 + aa, u), body = exp(-u * u * 2.5);
          gl_FragColor = vec4(${g3(TH.strip)} * body * 1.6 + ${g3(TH.stripCore)} * core * 5.0, 1.0);
        }`,
    });
    const strip = (s) => {
      const sec = [[s * (W - 0.02), WALL_H - 0.28, 0, -s, 0], [s * (W - 0.02), WALL_H - 0.1, 1, -s, 0]];
      return this.sweep(s > 0 ? sec : rev(sec), 10);
    };
    out.strips = [new THREE.Mesh(strip(-1), stripMat), new THREE.Mesh(strip(1), stripMat)];
    // energy barriers
    this.fieldMat = fieldMaterial();
    const field = (s) => this.sweep([[s * (W + WALL_T * 0.5), WALL_H, 0, -s, 0], [s * (W + WALL_T * 0.5), FIELD_H, 1, -s, 0]], 1);
    out.fields = [new THREE.Mesh(field(-1), this.fieldMat), new THREE.Mesh(field(1), this.fieldMat)];
    for (const f of out.fields) {
      // u along the track for the hex pattern: swap the sweep's (u, v) so x runs along the track
      const uv = f.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) { const a = uv.getX(i), b = uv.getY(i); uv.setXY(i, b, a); }
      f.renderOrder = 2;
      f.frustumCulled = false;
    }
    out.gantries = this.gantries();
    out.lanes = this.laneLights();
    out.studs = this.studs();
    out.girders = this.girders(metal);
    out.startLine = this.startLine();
    out.chevrons = this.chevrons();
    out.lamps = this.lampPosts();
    out.trims = this.edgeTrims();
    out.pads = this.padMeshes();
    out.lips = this.gapLips(metal);
    out.flips = this.flipFields(metal);
    out.tunnel = this.tunnel();
    out.gates = this.lightGates();
    out.towers = this.L.towers ? this.towers(metal) : [];
    out.cave = this.L.meteor ? this.cave() : [];
    // the deck and walls receive but never cast: at a grazing sun, PCSS's blocker search found a plane's own
    // neighbouring texels and shaded the whole deck black. The ship and the gantries are the casters.
    for (const m of [out.deck, out.under, ...out.walls]) { m.castShadow = false; m.receiveShadow = true; }
    for (const m of [out.deck, out.under, ...out.walls, ...out.strips, ...out.fields, ...out.gantries, ...out.pads,
      ...out.lanes, out.studs, ...out.girders, out.startLine, ...out.chevrons, ...out.lamps, ...out.trims,
      ...out.lips, ...out.flips, ...out.tunnel, ...out.gates, ...out.towers, ...out.cave]) scene.add(m);
    this.parts = out;
    return out;
  }

  // a ribbon like sweep() but only over [s0, s1] (open ends)
  sweepSpan(section, vScale, s0, s1) {
    const i0 = Math.floor(this.wrap(s0) / this.step), len = Math.ceil(this.wrap(s1 - s0) / this.step), m = section.length;
    const pos = [], nrm = [], uv = [], idx = [];
    for (let k = 0; k <= len; k++) {
      const i = (i0 + k) % this.n, P = this.P[i], U = this.U[i], R = this.R[i];
      for (const [x, y, u, nx, ny] of section) {
        pos.push(P.x + R.x * x + U.x * y, P.y + R.y * x + U.y * y, P.z + R.z * x + U.z * y);
        nrm.push(R.x * nx + U.x * ny, R.y * nx + U.y * ny, R.z * nx + U.z * ny);
        uv.push(u, (k * this.step) / vScale);
      }
    }
    for (let k = 0; k < len; k++) {
      for (let c = 0; c < m - 1; c++) { const a = k * m + c, b = a + 1, d = a + m, e = d + 1; idx.push(a, b, d, b, e, d); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // The cuts' edges: the deck ends in a closed face (no hollow box), hazard stripes on the last and first 6 m, a row
  // of amber lights along each lip, and a beacon post on each wall at both lips, blinking (Track.update)
  gapLips(metal) {
    const E = TRACK_W / 2 + WALL_T, W = TRACK_W / 2, out = [], M = new THREE.Matrix4(), f = {};
    const stripes = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8b018';
      for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
    });
    stripes.wrapS = THREE.RepeatWrapping; stripes.repeat.set(7, 1);
    const capG = hullBox(2 * E, DECK + WALL_H, 0.5).translate(0, (WALL_H - DECK) / 2, 0);
    const bandG = new THREE.PlaneGeometry(2 * W - 0.4, 6).rotateX(-Math.PI / 2);
    const lightG = new THREE.BoxGeometry(0.5, 0.12, 0.25);
    const postG = hullBox(0.4, 9, 0.4).translate(0, 4.5 + WALL_H, 0);
    const beaconG = new THREE.BoxGeometry(0.9, 0.5, 0.9).translate(0, 9.3 + WALL_H, 0);
    const ends = this.gaps.flatMap((g) => [{ s: g[0], dir: 1, flip: this.flips.includes(g) }, { s: g[1], dir: -1, flip: this.flips.includes(g) }]);
    const jumps = ends.filter((e) => !e.flip).length;
    const caps = new THREE.InstancedMesh(capG, metal, ends.length);
    const bands = new THREE.InstancedMesh(bandG, new THREE.MeshStandardMaterial({ map: stripes, emissiveMap: stripes,
      emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), jumps);
    const lights = new THREE.InstancedMesh(lightG, new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 1.8, 0.25) }), jumps * 15);
    const posts = new THREE.InstancedMesh(postG, metal, jumps * 2);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.3) });
    const beacons = new THREE.InstancedMesh(beaconG, this.beaconMat, jumps * 2);
    let li = 0, pi = 0, bi = 0;
    ends.forEach(({ s, dir, flip }, k) => {
      this.frame(s, f);
      const B = f.T.clone().multiplyScalar(-dir);                              // the cap faces into the cut
      M.makeBasis(f.R.clone().multiplyScalar(dir), f.U, B).setPosition(f.P.clone().addScaledVector(f.T, -dir * 0.25));
      caps.setMatrixAt(k, M);
      if (flip) return;
      M.makeBasis(f.R, f.U, f.T.clone().negate()).setPosition(f.P.clone().addScaledVector(f.T, -dir * 3).addScaledVector(f.U, 0.03));
      bands.setMatrixAt(bi++, M);
      for (let j = 0; j < 15; j++) {
        M.makeBasis(f.R, f.U, f.T.clone().negate()).setPosition(f.P.clone().addScaledVector(f.R, -W + 1.5 + j * (2 * W - 3) / 14)
          .addScaledVector(f.U, 0.06).addScaledVector(f.T, -dir * 0.5));
        lights.setMatrixAt(li++, M);
      }
      for (const sd of [-1, 1]) {
        M.makeBasis(f.R, f.U, f.T.clone().negate()).setPosition(f.P.clone().addScaledVector(f.R, sd * (W + WALL_T / 2)).addScaledVector(f.T, -dir * 1.5));
        posts.setMatrixAt(pi, M); beacons.setMatrixAt(pi++, M);
      }
    });
    caps.receiveShadow = posts.castShadow = true;
    return [caps, bands, lights, posts, beacons];
  }

  // The gravity flips: where the deck stops, a ring of the hull's metal round the way on, held off the wall ends by two
  // struts, its inner face lit; between the rings a tube of light the ships fly through - its stripes fixed to the
  // deck's sides, so they twist through the half turn with it, waves running along it the way the ships go, brightest
  // where it is seen edge on (looking down it, it is all but clear)
  flipFields(metal) {
    const out = [], f = {}, R = TRACK_W / 2 + 9, Y0 = 3, E = TRACK_W / 2 + WALL_T;
    this.flipMats = [];
    if (!this.flips.length) return out;
    const col = new THREE.Color(...(TH.flip || SPACE_THEME.flip));
    const sec = [];
    for (let k = 0; k <= 64; k++) { const t = (k / 64) * Math.PI * 2; sec.push([R * Math.sin(t), Y0 + R * Math.cos(t), k / 64, -Math.sin(t), -Math.cos(t)]); }
    const ringG = new THREE.TorusGeometry(R, 1.1, 10, 96), bandG = new THREE.TorusGeometry(R - 0.95, 0.32, 6, 96);
    const strutG = hullBox(1.0, 1.0, 1.0);
    const bandMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, col: { value: col } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float time; uniform vec3 col; varying vec2 vUv;
        void main() {
          float run = pow(0.5 + 0.5 * sin(vUv.x * 6.2832 * 12.0 - time * 5.0), 4.0);
          gl_FragColor = vec4(col * (1.6 + 3.0 * run) + vec3(1.0) * run * 0.6, 1.0);
        }`,
    });
    this.flipMats.push(bandMat);
    for (const [s0, s1] of this.flips) {
      const len = this.wrap(s1 - s0) + 80;
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        uniforms: { time: { value: 0 }, col: { value: col }, len: { value: len } },
        vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main() {
            vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */`uniform float time; uniform vec3 col; uniform float len; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main() {
            float m = vUv.y * len;                                     // metres along
            float ends = smoothstep(0.0, 34.0, m) * smoothstep(len, len - 34.0, m);
            float u = vUv.x * 12.0, aa = fwidth(u) * 1.2;
            float stripe = 1.0 - smoothstep(0.03, 0.03 + aa + 0.03, abs(fract(u) - 0.5));
            float wave = pow(0.5 + 0.5 * sin(m * 0.16 - time * 9.0), 10.0);
            float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
            float far = clamp(0.25 / max(fwidth(u), 0.25), 0.0, 1.0);   // the stripes thin to nothing far off (no shimmer)
            float a = (stripe * (0.2 + 1.1 * wave) * far + 0.03 + 0.2 * wave) * (0.12 + 0.75 * edge) * ends;
            gl_FragColor = vec4(col * a, 1.0);
          }`,
      });
      this.flipMats.push(mat);
      const tube = new THREE.Mesh(this.sweepSpan(sec, len, s0 - 40, s1 + 40), mat);
      tube.renderOrder = 3;
      tube.frustumCulled = false;
      out.push(tube);
      for (const [s, dir] of [[s0, 1], [s1, -1]]) {
        this.frame(s, f);
        const basis = new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate());
        const at = f.P.clone().addScaledVector(f.U, Y0).addScaledVector(f.T, dir * 2);
        for (const [g, m] of [[ringG, metal], [bandG, bandMat]]) {
          const o = new THREE.Mesh(g, m);
          o.matrixAutoUpdate = false;
          o.matrix.copy(basis).setPosition(at);
          o.castShadow = m === metal;
          out.push(o);
        }
        for (const sd of [-1, 1]) {                            // the struts: off each wall's end, out to the ring
          const a = f.P.clone().addScaledVector(f.R, sd * (E - 0.3)).addScaledVector(f.U, 0.6).addScaledVector(f.T, dir * 2);
          const b = at.clone().addScaledVector(f.R, sd * (R - 0.6));
          const st = new THREE.Mesh(strutG, metal), mid = a.clone().add(b).multiplyScalar(0.5), d = b.clone().sub(a);
          const x = d.clone().normalize(), z = f.T.clone(), y = new THREE.Vector3().crossVectors(z, x).normalize();
          st.matrixAutoUpdate = false;
          st.matrix.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)).scale(new THREE.Vector3(d.length() + 1.2, 1.4, 1.6)).setPosition(mid);
          st.castShadow = true;
          out.push(st);
        }
      }
    }
    return out;
  }

  // The tunnel: a glass tube over the climb - steel ribs every 16 m standing on the walls, a light band on each rib's
  // inner face, two light strips along the roof, and the glass between them (faint, brighter at a grazing look, a
  // light wave running along it). Glass, so the sun still reaches the deck and its shadows stay true.
  tunnel() {
    const out = [], A = TRACK_W / 2 + WALL_T + 0.2, H = 19, base = WALL_H;
    for (const [s0, s1] of this.tunnels) {
      const arc = [];
      for (let k = 0; k <= 28; k++) {
        const t = Math.PI * (1 - k / 28), x = A * Math.cos(t), y = base + H * Math.sin(t);
        const nx = -Math.cos(t) / A, ny = -Math.sin(t) / H, l = Math.hypot(nx, ny);
        arc.push([x, y, k / 28, nx / l, ny / l]);
      }
      const glass = new THREE.Mesh(this.sweepSpan(arc, 30, s0, s1), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        uniforms: { time: { value: 0 } },
        vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */`uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main() {
            float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);
            float wave = exp(-pow(fract(vUv.y * 0.02 - time * 0.35) - 0.5, 2.0) * 120.0);
            float grid = 1.0 - smoothstep(0.0, 0.02, min(abs(fract(vUv.x * 14.0) - 0.5), abs(fract(vUv.y * 0.5) - 0.5)) - 0.47);
            gl_FragColor = vec4(vec3(0.25, 0.6, 1.0) * (0.012 + fr * 0.12 + wave * 0.05 + grid * 0.03), 1.0);
          }`,
      }));
      glass.renderOrder = 2;
      glass.frustumCulled = false;
      this.tunnelMat = glass.material;
      // ribs: a box section swept round the arch (local frame: x across, y up, z along the track)
      const ribG = (w, d, inset, emissive) => {
        const pos = [], idx = [];
        const ring = (k) => { const t = Math.PI * (1 - k / 28); return [Math.cos(t), Math.sin(t)]; };
        for (let k = 0; k <= 28; k++) {
          const [c, sn] = ring(k), x = A * c, y = base + H * sn;
          let nx = -c / A, ny = -sn / H; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
          for (const [o, z] of [[inset, -d], [inset, d], [inset + w, d], [inset + w, -d]]) pos.push(x - nx * o, y - ny * o, z);
        }
        for (let k = 0; k < 28; k++) for (let q = 0; q < 4; q++) {
          const a = k * 4 + q, b = k * 4 + ((q + 1) % 4), c2 = a + 4, e = b + 4;
          if (emissive && q !== 0) continue;
          idx.push(a, c2, b, b, c2, e);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      };
      const every = Math.round(16 / this.step), i0 = Math.floor(s0 / this.step), cnt = Math.floor(this.wrap(s1 - s0) / 16) + 1;
      const ribs = new THREE.InstancedMesh(ribG(0.9, 0.35, -0.9, false), new THREE.MeshStandardMaterial({ color: 0x4d545e, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide }), cnt);
      const bands = new THREE.InstancedMesh(ribG(0.05, 0.12, -0.95, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 3.2), side: THREE.DoubleSide }), cnt);
      const M = new THREE.Matrix4();
      for (let k = 0; k < cnt; k++) { this.basisAt((i0 + k * every) % this.n, M); ribs.setMatrixAt(k, M); bands.setMatrixAt(k, M); }
      ribs.castShadow = true;
      const roof = (x) => this.sweepSpan([[x - 0.25, base + H * Math.sqrt(Math.max(0, 1 - (x / A) ** 2)) - 0.5, 0, 0, -1],
        [x + 0.25, base + H * Math.sqrt(Math.max(0, 1 - (x / A) ** 2)) - 0.5, 1, 0, -1]], 10, s0, s1);
      const strips = [-4, 4].map((x) => new THREE.Mesh(roof(x), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.0, 3.6), side: THREE.DoubleSide })));
      out.push(glass, ribs, bands, ...strips);
    }
    return out;
  }

  // The meteorite tunnel: the track bores through a mass of rock - a rough oval bore round the deck (wider at the
  // mouths), its walls lumpy and fractured, and great boulders packed round it outside. No light of its own: the
  // shaders cut the sun and the sky inside it (look.js setCave), so only the ships light it.
  cave() {
    const out = [], rnd = mulberry32(55);
    const rockMat = rockMaterial({ big: 45, small: 7, side: THREE.DoubleSide, key: 'cave', shadow: true });
    const shellMat = rockMaterial({ big: 60, small: 9, key: 'meteor', ao: true, shadow: true });
    const boulderMat = rockMaterial({ big: 60, small: 9, key: 'boulder', shadow: true });
    // vertex colours are tints round 1 (the rock's albedo is the material's): no blotches
    const c = new THREE.Color(), tint = (t) => c.setRGB(t * 1.015, t, t * 0.975);
    for (const [s0, s1] of this.meteorCaves) {
      // the bore
      const len = this.wrap(s1 - s0), nk = Math.ceil(len / 3), nj = 64, pos = [], col = [], idx = [], f = {};
      for (let k = 0; k <= nk; k++) {
        const s = s0 + (k / nk) * len, d = (k / nk) * len, flare = smoothstep(35, 0, Math.min(d, len - d));
        this.frame(s, f);
        for (let j = 0; j < nj; j++) {
          const a = (j / nj) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const n1 = fbm(ca * 1.6 + s * 0.012, sa * 1.6 - s * 0.009, 4), n2 = noise2(a * 9 + s * 0.13, s * 0.05 - a * 3);
          const r = 33 + 12 * (n1 - 0.5) + 3 * (n2 - 0.5) + flare * 10;
          const x = ca * r * 1.12, y = 5 + sa * r * 0.82;
          pos.push(f.P.x + f.R.x * x + f.U.x * y, f.P.y + f.R.y * x + f.U.y * y, f.P.z + f.R.z * x + f.U.z * y);
          tint(0.94 + (n2 - 0.5) * 0.1 + (n1 - 0.5) * 0.14);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let k = 0; k < nk; k++) for (let j = 0; j < nj; j++) {
        const a = k * nj + j, b = k * nj + ((j + 1) % nj), d = a + nj, e = b + nj;
        idx.push(a, d, b, b, d, e);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      // the faces must look into the bore (toward its centre line)
      this.frame(s0 + len / 2, f);
      const centre = f.P.clone().addScaledVector(f.U, 5), i0 = Math.floor(nk / 2) * nj;
      const vp = new THREE.Vector3().fromBufferAttribute(g.attributes.position, i0), vn = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, i0);
      if (vn.dot(centre.clone().sub(vp)) < 0) {
        for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; }
        g.setIndex(idx); g.computeVertexNormals();
      }
      out.push(new THREE.Mesh(g, rockMat));
      // The meteorite: ONE craggy body round the bore. Its surface runs in rows from the bore's entrance ring (the very
      // same vertices - no seam to see through, no rock inside the bore) out into a crater, over the crater's rim,
      // round the body, and back down the exit crater onto the bore's exit ring. (The first version packed boulders
      // round the bore, scaled and lumped far past their clearance: "the meteorite is literally in the road".)
      const ring = (k) => Array.from({ length: nj }, (_, j) => new THREE.Vector3().fromBufferAttribute(g.attributes.position, k * nj + j));
      const r0 = ring(0), r1 = ring(nk);
      const A0 = r0.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(nj);
      const B0 = r1.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(nj);
      const O = A0.clone().add(B0).multiplyScalar(0.5), Z = B0.clone().sub(A0), half = Z.length() / 2;
      Z.normalize();
      this.frame(s0 + len / 2, f);
      const Y = f.U.clone().addScaledVector(Z, -f.U.dot(Z)).normalize(), X = new THREE.Vector3().crossVectors(Z, Y);
      const SUB = 6, nc = nj * SUB;                    // six columns of rock to each column of the bore (~4.3 m)
      // the bore's end rings, resampled to the finer columns (points on the ring's own edges: still watertight)
      const fine = (rr) => Array.from({ length: nc }, (_, c) => rr[Math.floor(c / SUB)].clone().lerp(rr[(Math.floor(c / SUB) + 1) % nj], (c % SUB) / SUB));
      const f0 = fine(r0), f1 = fine(r1);
      const Rb = 260, rimR = 125, rimOut = 30;
      const sinR = rimR / Rb, thR = Math.asin(sinR), Rz = (half + rimOut) / Math.cos(thR);
      // craters of every size (16 big, 44 smaller): a bowl ~0.18 of the diameter deep (the big ones with a flat
      // floor), a sharp raised rim, a skirt of ejecta; each darkens the ambient light in its bowl
      const crDir = () => new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.8, (rnd() * 2 - 1) * 0.6).normalize();
      const craters = [...Array.from({ length: 16 }, () => ({ d: crDir(), r: 0.12 + rnd() * 0.22 })),
        ...Array.from({ length: 44 }, () => ({ d: crDir(), r: 0.045 + Math.pow(rnd(), 1.5) * 0.08 }))]
        .map((q) => ({ ...q, k: 0.36 * q.r * (0.7 + rnd() * 0.5), cosOut: Math.cos(q.r * 2.2) }));
      const dirL = new THREE.Vector3();
      let occl = 1;
      const relief = (dx, dy, dz) => {                 // the body's radius factor in a (local) direction
        dirL.set(dx, dy, dz).normalize();
        let h = 1 + 0.2 * (fbm(dirL.x * 1.6 + 3.1, dirL.y * 1.6 + dirL.z * 1.1, 5) - 0.5)
          + 0.08 * (1 - Math.abs(2 * fbm(dirL.z * 3.2 - 1.7, dirL.x * 3.2 + dirL.y * 2.0, 4) - 1))
          + 0.012 * (fbm(dirL.x * 9 - 2, dirL.y * 9 + dirL.z * 7, 3) - 0.5);
        occl = 1;
        for (const q of craters) {
          const cs = dirL.dot(q.d);
          if (cs < q.cosOut) continue;
          const u = Math.acos(Math.min(1, cs)) / q.r;
          if (u < 1) {
            h += q.k * ((q.r > 0.1 ? Math.max(u * u, 0.3) : u * u) - 1);
            occl *= 1 - 0.42 * (1 - u * u);
          }
          h += q.k * (0.3 * Math.exp(-(((u - 1) / 0.15) ** 2)) + (u > 1 ? 0.07 * Math.exp(-(u - 1) * 3) : 0));
        }
        return h;
      };
      let lastAO = 1;
      const aoRows = [];
      const body = (th, phi) => {
        const lx = Math.cos(phi) * Math.sin(th) * Rb * 1.15, ly = Math.sin(phi) * Math.sin(th) * Rb * 0.9, lz = -Rz * Math.cos(th);
        const h = relief(lx / (Rb * 1.15), ly / (Rb * 0.9), lz / Rz);
        lastAO = occl;
        return O.clone().addScaledVector(X, lx * h).addScaledVector(Y, ly * h).addScaledVector(Z, lz * (0.92 + 0.08 * h));
      };
      const rows = [];
      const crater = (ringPts, sign, rimTh) => {      // ring -> rim, as rows (the rim row itself is the body's)
        const out2 = [];
        const CR = 14;
        for (let i = 0; i < CR; i++) {
          const t = i / CR, tr2 = Math.pow(t, 0.8), tz = Math.sin(t * Math.PI / 2);
          out2.push(ringPts.map((v, c) => {
            const rim = body(rimTh, (c / nc) * Math.PI * 2);
            const a = v.clone().sub(O), b = rim.clone().sub(O);
            const ax = a.dot(X), ay = a.dot(Y), az = a.dot(Z), bx = b.dot(X), by = b.dot(Y), bz = b.dot(Z);
            const x = ax + (bx - ax) * tr2, y = ay + (by - ay) * tr2, z = az + (bz - az) * tz;
            const jag = i === 0 ? 0 : (noise2(c * 0.21 + sign * 7, i * 0.7) - 0.5) * 6 * Math.sin(t * Math.PI);
            const radial = new THREE.Vector3(x, y, 0).normalize();
            return O.clone().addScaledVector(X, x + radial.x * jag).addScaledVector(Y, y + radial.y * jag).addScaledVector(Z, z);
          }));
        }
        return out2;
      };
      const mouthAO = (i) => new Array(nc).fill(0.3 + 0.7 * Math.pow(i / 14, 0.8));
      rows.push(...crater(f0, -1, thR));
      for (let i = 0; i < 14; i++) aoRows.push(mouthAO(i));
      const BR = 160;
      for (let i = 0; i <= BR; i++) {
        const th = thR + (Math.PI - 2 * thR) * (i / BR), ar = [];
        rows.push(Array.from({ length: nc }, (_, c) => { const v = body(th, (c / nc) * Math.PI * 2); ar.push(lastAO); return v; }));
        aoRows.push(ar);
      }
      rows.push(...crater(f1, 1, Math.PI - thR).reverse());
      for (let i = 13; i >= 0; i--) aoRows.push(mouthAO(i));
      const mp = [], mc = [], mi = [];
      for (const row of rows) for (const v of row) {
        mp.push(v.x, v.y, v.z);
        tint(0.92 + 0.16 * fbm(v.x * 0.006 + 3, v.z * 0.006 + v.y * 0.004, 4));
        mc.push(c.r, c.g, c.b);
      }
      const ao = new Float32Array(aoRows.flat());
      for (let i = 0; i < rows.length - 1; i++) for (let cc = 0; cc < nc; cc++) {
        const a = i * nc + cc, b = i * nc + ((cc + 1) % nc), d = a + nc, e = b + nc;
        mi.push(a, b, d, b, e, d);
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
      mg.setAttribute('color', new THREE.Float32BufferAttribute(mc, 3));
      mg.setIndex(mi);
      mg.computeVertexNormals();
      // outward: a vertex on the body's equator must face away from its middle
      const ie = (14 + Math.floor(BR / 2)) * nc, ve = new THREE.Vector3().fromBufferAttribute(mg.attributes.position, ie), ne = new THREE.Vector3().fromBufferAttribute(mg.attributes.normal, ie);
      if (ne.dot(ve.clone().sub(O)) < 0) {
        for (let q = 0; q < mi.length; q += 3) { const t = mi[q + 1]; mi[q + 1] = mi[q + 2]; mi[q + 2] = t; }
        mg.setIndex(mi); mg.computeVertexNormals();
      }
      const meteor = new THREE.Mesh(mg, shellMat);
      meteor.name = 'meteorite';
      out.push(meteor);
      // boulders on its body: each sunk into the surface where it lies (resting, never floating), none on the crater
      // walls round the mouths. Angular (split faces), sizes by a power law (many small, a few big), most of them
      // in clusters; their feet darken the shell's ambient light, each its own shade
      const bg = (k, detail) => {
        let sg = new THREE.IcosahedronGeometry(1, detail);
        sg.deleteAttribute('normal'); sg.deleteAttribute('uv');
        sg = mergeVertices(sg);
        const pp = sg.attributes.position, v = new THREE.Vector3(), cc = new Float32Array(pp.count * 3);
        const cuts = Array.from({ length: 4 + Math.floor(rnd() * 3) }, () => ({ n: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(), c: 0.45 + rnd() * 0.35 }));
        for (let i = 0; i < pp.count; i++) {
          v.fromBufferAttribute(pp, i).normalize();
          let h = 1 + 0.24 * (fbm(v.x * 1.7 + k * 3.3, v.y * 1.7 + v.z, 4) - 0.5) + 0.05 * (fbm(v.x * 5 - k, v.z * 5 + v.y * 3, 3) - 0.5);
          for (const cp of cuts) { const dd = v.dot(cp.n); if (dd > cp.c) h = Math.min(h, h * (cp.c / dd)); }
          v.multiplyScalar(h);
          pp.setXYZ(i, v.x, v.y, v.z);
          tint(0.93 + 0.14 * fbm(v.x * 3 + k, v.z * 3, 3));
          cc.set([c.r, c.g, c.b], i * 3);
        }
        sg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
        sg.computeVertexNormals();
        return sg;
      };
      const bshapes = [bg(0, 3), bg(1, 3), bg(2, 3), bg(3, 2), bg(4, 2), bg(5, 2)], bmats = bshapes.map(() => []), btone = bshapes.map(() => []);
      const BM = new THREE.Matrix4(), BQ = new THREE.Quaternion(), BE = new THREE.Euler(), BS = new THREE.Vector3();
      const mpos = mg.attributes.position, mnrm = mg.attributes.normal, bv = new THREE.Vector3(), bn = new THREE.Vector3(), wv = new THREE.Vector3();
      const rowLo = 14 + 5, rowHi = 14 + BR - 5, gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.4;
      const clusters = Array.from({ length: 16 }, () => ({ row: rowLo + 4 + Math.floor(rnd() * (rowHi - rowLo - 8)), col: Math.floor(rnd() * nc), spread: 3 + rnd() * 8 }));
      this.boulderSpots = [];
      for (let placed = 0; placed < 300; placed++) {
        let row, col;
        if (rnd() < 0.72) {
          const cl = clusters[Math.floor(rnd() * clusters.length)];
          row = Math.round(cl.row + gauss() * cl.spread); col = (Math.round(cl.col + gauss() * cl.spread * 1.4) % nc + nc) % nc;
        } else { row = rowLo + Math.floor(rnd() * (rowHi - rowLo)); col = Math.floor(rnd() * nc); }
        row = Math.min(rowHi, Math.max(rowLo, row));
        const vi = row * nc + col;
        bv.fromBufferAttribute(mpos, vi); bn.fromBufferAttribute(mnrm, vi).normalize();
        const size = 1.6 + 20 * Math.pow(rnd(), 3.2);
        BE.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3);
        BS.set(size * (0.8 + rnd() * 0.5), size * (0.55 + rnd() * 0.4), size * (0.8 + rnd() * 0.5));
        const kind = size > 6 ? Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 3);
        bmats[kind].push(BM.compose(bv.clone().addScaledVector(bn, size * 0.3), BQ.setFromEuler(BE), BS).clone());
        btone[kind].push(0.8 + rnd() * 0.45);
        this.boulderSpots.push({ row, col, size });
        // the foot's shadow in the ambient light, on the shell vertices round it
        const reach = Math.ceil((1.9 * size) / 4) + 1;
        for (let r = row - reach; r <= row + reach; r++) for (let q = col - reach; q <= col + reach; q++) {
          const vj = r * nc + ((q % nc) + nc) % nc;
          if (r < 0 || vj >= ao.length) continue;
          const dd = wv.fromBufferAttribute(mpos, vj).distanceTo(bv);
          ao[vj] *= 0.5 + 0.5 * smoothstep(0.45 * size, 1.9 * size, dd);
        }
      }
      mg.setAttribute('rockAO', new THREE.BufferAttribute(ao, 1));
      bshapes.forEach((sg, k) => {
        if (!bmats[k].length) return;
        const im = new THREE.InstancedMesh(sg, boulderMat, bmats[k].length);
        bmats[k].forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, c.setRGB(btone[k][i], btone[k][i], btone[k][i])); });
        im.name = 'meteorite-boulders';
        out.push(im);
      });
      this.meteor = { O, X, Y, Z, half, mesh: meteor, bore: out.find((o) => o.material === rockMat && o.isMesh && !o.isInstancedMesh), boulders: out.filter((o) => o.name === 'meteorite-boulders'), nc, BR };
    }
    for (const m of out) { m.castShadow = false; m.receiveShadow = true; }
    return out;
  }

  // light gates: an arch of light over the deck from wall to wall at the start, before both jumps, the rolls, the
  // loop and the corkscrew - pulses running up both legs, a white-hot core, each in its own colour
  lightGates() {
    const R = TRACK_W / 2 + 2.5, out = [], f = {};
    const ring = new THREE.TorusGeometry(R, 0.45, 12, 72, Math.PI);
    const leg = gateLeg(Math.PI * R);
    this.gateMats = [];
    for (const g of this.gates) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, col: { value: new THREE.Color(g.col) } },
        vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`uniform float time; uniform vec3 col; varying vec2 vUv;
          void main() {
            float a = vUv.x, ring = abs(vUv.y - 0.5) * 2.0;
            float pulse = pow(0.5 + 0.5 * sin((min(a, 1.0 - a)) * 40.0 - time * 8.0), 6.0);
            float core = exp(-ring * ring * 6.0);
            gl_FragColor = vec4(col * (1.2 + 2.5 * pulse) * (0.4 + core) + vec3(1.0) * core * core * 2.0, 1.0);
          }`,
      });
      this.gateMats.push(mat);
      this.frame(g.s, f);
      const arch = new THREE.Mesh(ring, mat);
      arch.matrixAutoUpdate = false;
      arch.matrix.makeBasis(f.R, f.U, f.T.clone().negate()).setPosition(f.P.clone().addScaledVector(f.U, WALL_H));
      out.push(arch);
      for (const sd of [-1, 1]) {
        // the pylon (its x out from the track: turned round on the left), the slits and the lens in the arch's own light
        const M = new THREE.Matrix4().makeBasis(f.R.clone().multiplyScalar(sd), f.U, f.T.clone().negate().multiplyScalar(sd))
          .setPosition(f.P.clone().addScaledVector(f.R, sd * R).addScaledVector(f.U, -0.2));
        for (const [g, m_] of [[leg.body, leg.bodyMat], [leg.trim, leg.trimMat], [sd < 0 ? leg.lightL : leg.lightR, mat]]) {
          const m = new THREE.Mesh(g, m_);
          m.matrixAutoUpdate = false;
          m.matrix.copy(M);
          m.castShadow = m_ !== mat;
          out.push(m);
        }
      }
    }
    return out;
  }

  // Towers along the circuit, each bolted to the track: a truss arm out from under the deck's girders to a tall
  // column that runs well above and below the deck, ringed by platforms, its windows lit, a beacon on top
  towers(metal) {
    const rnd = mulberry32(404), out = [], M = new THREE.Matrix4();
    const list = [];
    for (let s = 300; s < this.length - 200; s += 760 + rnd() * 380) {
      if (this.inGap(s, 60) || this.inLoop(s, 120) || this.inTunnel(s, 40) || this.inCave(s, 250)) continue;
      const t = { i: Math.floor(s / this.step), side: rnd() < 0.5 ? -1 : 1, off: 62 + rnd() * 30, h: 70 + rnd() * 90 };
      const at = this.P[t.i].clone().addScaledVector(this.R[t.i], t.side * t.off);
      if (this.keepOut.some((k) => k.c.distanceTo(at) < k.r + t.h)) continue;     // (clear of the derelict)
      list.push(t);
    }
    const box = (w, h, d, x, y, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
    const merge = (gs) => { const g = new THREE.BufferGeometry(), n = gs.reduce((a, x) => a + x.attributes.position.count, 0);
      const pp = new Float32Array(n * 3), nr = new Float32Array(n * 3); let o = 0;
      for (const x of gs) { pp.set(x.attributes.position.array, o * 3); nr.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; }
      g.setAttribute('position', new THREE.BufferAttribute(pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); return g; };
    // one unit tower (x out from the track, y up the deck's up), scaled per instance in height only via two parts
    const col = merge([box(9, 1, 9, 0, 0.5), box(6, 1, 6, 0, 0.5)]);
    const towerParts = [], glowParts = [];
    for (const t of list) {
      const h = t.h, lo = -h * 0.45, X = t.off;
      const g = [box(8, h, 8, X, lo + h / 2), box(12, 2.4, 12, X, lo + h * 0.3), box(14, 2.4, 14, X, lo + h * 0.72),
        box(10, 4, 10, X, lo + h + 2), box(0.6, 18, 0.6, X, lo + h + 13),
        // the arm: two chords from under the deck girders out to the column, with posts between
        box(X - TRACK_W / 2, 1.2, 1.2, (X + TRACK_W / 2) / 2, -DECK - 3.2, -3), box(X - TRACK_W / 2, 1.2, 1.2, (X + TRACK_W / 2) / 2, -DECK - 3.2, 3),
        box(X - TRACK_W / 2, 1.2, 1.2, (X + TRACK_W / 2) / 2, -DECK - 9, 0)];
      for (let k = 0; k <= 6; k++) { const x = TRACK_W / 2 + (X - TRACK_W / 2) * k / 6; g.push(box(0.5, 6.4, 0.5, x, -DECK - 6.1, 0)); }
      const glow = [box(0.25, h * 0.86, 0.5, X - 4.05, lo + h * 0.5, -2), box(0.25, h * 0.86, 0.5, X - 4.05, lo + h * 0.5, 2),
        box(12.2, 0.3, 12.2, X, lo + h * 0.3 + 1.0), box(14.2, 0.3, 14.2, X, lo + h * 0.72 + 1.0), box(1.4, 1.4, 1.4, X, lo + h + 22)];
      // (on the left turned round, not mirrored: a mirrored box is wound inside out - lit from inside, and black
      // under the AO, which sees only its far faces)
      const Mi = this.basisAt(t.i, new THREE.Matrix4());
      if (t.side < 0) Mi.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      for (const x of g) towerParts.push(x.applyMatrix4(Mi));
      for (const x of glow) glowParts.push(x.applyMatrix4(Mi));
    }
    const tm = new THREE.Mesh(merge(towerParts), new THREE.MeshStandardMaterial({ color: 0x555c66, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }));
    const gm = new THREE.Mesh(merge(glowParts), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.6, 3.0), side: THREE.DoubleSide }));
    tm.castShadow = true; tm.receiveShadow = true;
    this.towerList = list;
    return [tm, gm];
  }

  // lane lights, built like fixtures: a dark metal housing set in the deck, a capsule lens (saturated blue edge,
  // white-hot HDR core, anti-aliased ends) every 8 m, a soft pool of their light on the deck round them, and a pulse
  // chasing forward (speed reads off it)
  laneLights() {
    const SEG = /* glsl */`
      float capsule(float x, float s) {                    // distance (m) to the light's capsule in its 8 m period
        float seg = fract(s / 8.0) * 8.0;
        return length(vec2(x, seg - clamp(seg, 0.7, 3.3)));
      }`;
    this.laneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      uniforms: { time: { value: 0 }, prefilter: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float time, prefilter; varying vec2 vUv;
        ${SEG}
        void main() {
          // (fwidth(d) leaps where the period wraps - d jumps 4 m there - and lit a flickering dashed bar across the
          // housing 0.7 m before each light; elsewhere it never exceeds the coordinates' own fwidth)
          float x = (vUv.x - 0.5) * 0.36, d = capsule(x, vUv.y), aa = min(fwidth(d), fwidth(x) + fwidth(vUv.y)) * 1.3 + 1e-4;
          float lens = 1.0 - smoothstep(0.055 - aa, 0.055 + aa, d);
          float core = 1.0 - smoothstep(0.016 - aa, 0.016 + aa, d);
          float halo = exp(-d * d / 0.004) * 0.5;
          // far down the track the 8 m pattern is finer than the pixels and sparkled: it fades to its average (each
          // capsule lights ~34 % of its period), across-track profile kept
          float far = smoothstep(0.8, 3.0, fwidth(vUv.y)) * prefilter, ax = abs(x), aax = fwidth(x) * 1.3 + 1e-4;
          lens = mix(lens, (1.0 - smoothstep(0.055 - aax, 0.055 + aax, ax)) * 0.34, far);
          core = mix(core, (1.0 - smoothstep(0.016 - aax, 0.016 + aax, ax)) * 0.33, far);
          halo = mix(halo, exp(-ax * ax / 0.004) * 0.5 * 0.35, far);
          float chase = 0.8 + 0.7 * pow(0.5 + 0.5 * sin(vUv.y * 0.06 - time * 4.0), 10.0);
          vec3 c = ${g3(TH.lane)} * (lens * 2.4 + halo) + ${g3(TH.laneCore)} * core * 7.0;
          gl_FragColor = vec4(c * chase, 1.0);
        }`,
    });
    this.spillMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float time; varying vec2 vUv;
        ${SEG}
        void main() {
          float x = (vUv.x - 0.5) * 4.0, d = capsule(x, vUv.y);
          float chase = 0.8 + 0.7 * pow(0.5 + 0.5 * sin(vUv.y * 0.06 - time * 4.0), 10.0);
          float spill = mix(exp(-d * d / 0.35), exp(-x * x / 0.35) * 0.46, smoothstep(0.8, 3.0, fwidth(vUv.y)));
          gl_FragColor = vec4(${g3(TH.spill)} * spill * 0.16 * chase, 1.0);
        }`,
    });
    const housing = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.3, metalness: 0.7,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const out = [];
    for (const x of [-11, 11]) {
      const h = new THREE.Mesh(this.sweep([[x - 0.15, 0.012, 0, 0, 1], [x + 0.15, 0.012, 1, 0, 1]], 1), housing);
      h.receiveShadow = true;
      const spill = new THREE.Mesh(this.sweep([[x - 2, 0.014, 0, 0, 1], [x + 2, 0.014, 1, 0, 1]], 1), this.spillMat);
      const lens = new THREE.Mesh(this.sweep([[x - 0.18, 0.018, 0, 0, 1], [x + 0.18, 0.018, 1, 0, 1]], 1), this.laneMat);
      spill.renderOrder = 1; lens.renderOrder = 2;
      for (const m of [h, spill, lens]) { m.frustumCulled = false; out.push(m); }
    }
    this.laneHousing = out.filter((m) => m.material === housing);
    return out;
  }

  // small LED studs inside both kerbs every 6 m
  studs() {
    const every = Math.round(6 / this.step), n = Math.floor(this.n / every) * 2;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.05, 0.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...TH.stud) }), n);
    const M = new THREE.Matrix4(), W = TRACK_W / 2 - 2.4;
    let k = 0;
    for (let i = 0; i + every <= this.n; i += every) {
      if (this.inGap(i * this.step, 2)) continue;
      for (const side of [-1, 1]) {
        M.makeBasis(this.R[i], this.U[i], this.T[i].clone().negate())
          .setPosition(this.P[i].clone().addScaledVector(this.R[i], side * W).addScaledVector(this.U[i], 0.03));
        im.setMatrixAt(k++, M);
      }
    }
    im.count = k;
    return im;
  }

  // what holds the deck up: two box girders along its belly and a cross-rib every 24 m
  girders(metal) {
    const D = DECK, g = (x) => this.hullSweep([
      { a: [x - 1, -D], b: [x - 1, -D - 2.4], n: [-1, 0], kind: HULL_SIDE },
      { a: [x - 1, -D - 2.4], b: [x + 1, -D - 2.4], n: [0, -1], kind: HULL_GIRDER },
      { a: [x + 1, -D - 2.4], b: [x + 1, -D], n: [1, 0], kind: HULL_SIDE },
    ], true);                // (listed the deck's other way round: drawn as they were, the girders were inside out)
    const beams = [new THREE.Mesh(g(-12), metal), new THREE.Mesh(g(12), metal)];
    const every = Math.round(24 / this.step), n = Math.floor(this.n / every);
    const ribs = new THREE.InstancedMesh(hullBox(TRACK_W + 1, 0.9, 1.0).translate(0, -D - 0.45, 0), metal, n);
    const M = new THREE.Matrix4();
    let nr = 0;
    for (let k = 0; k < n; k++) if (!this.inGap(k * every * this.step, 1)) ribs.setMatrixAt(nr++, this.basisAt(k * every, M));
    ribs.count = nr;
    for (const m of [...beams, ribs]) { m.receiveShadow = true; }
    return [...beams, ribs];
  }

  basisAt(i, M, scale = 1) {
    const R = this.R[i], U = this.U[i], B = this.T[i].clone().negate();
    M.makeBasis(R, U, B).scale(new THREE.Vector3(scale, scale, scale)).setPosition(this.P[i]);
    return M;
  }

  // Gantries every 300 m, built to stand on the track (the first ones floated beside it - "levitating not being
  // connected to anything"): each pillar on a base plate bolted to the wall top, its foot clamped down the outside
  // of the wall and the deck's side, tapered, with a light strip on its inner face; a truss beam (two chords, posts,
  // diagonals) across the top carrying a light bar. The first one (the start) is lit red.
  gantries() {
    const X = TRACK_W / 2 + WALL_T / 2, E = TRACK_W / 2 + WALL_T, TOP = 15.3, BOT = 13.6;
    const box = (w, h, d, x, y, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const strut = (a, b, w) => {
      const dir = b.clone().sub(a), len = dir.length(), g = new THREE.BoxGeometry(w, len, w);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    };
    const frame = [], glow = [];
    for (const sd of [-1, 1]) {
      frame.push(box(1.5, 0.25, 3.2, sd * X, WALL_H + 0.125));                         // base plate on the wall top
      frame.push(box(0.5, DECK + WALL_H + 0.2, 2.6, sd * (E + 0.25), (WALL_H - DECK) / 2)); // clamp down the outside
      frame.push(box(1.3, 6.2, 1.7, sd * X, WALL_H + 0.25 + 3.1));                      // pillar, lower
      frame.push(box(1.0, 6.4, 1.35, sd * X, WALL_H + 0.25 + 6.2 + 3.2));               // pillar, upper
      frame.push(box(1.7, 0.5, 2.0, sd * X, BOT - 0.25));                               // the beam's seat
      glow.push(box(0.1, 9.5, 0.28, sd * (X - 0.66), WALL_H + 5.5));                    // light strip, inner face
    }
    const span = 2 * X, bays = 10;
    frame.push(box(span + 1.0, 0.6, 1.2, 0, TOP));                                      // top chord
    frame.push(box(span + 1.0, 0.6, 1.2, 0, BOT));                                      // bottom chord
    for (let k = 0; k <= bays; k++) {
      const x0 = -X + (span * k) / bays;
      frame.push(box(0.32, TOP - BOT, 0.9, x0, (TOP + BOT) / 2));                       // posts
      if (k < bays) {
        const x1 = -X + (span * (k + 1)) / bays, up = k % 2 === 0;
        frame.push(strut(new THREE.Vector3(x0, up ? BOT : TOP, 0), new THREE.Vector3(x1, up ? TOP : BOT, 0), 0.24));
      }
    }
    glow.push(box(span - 3, 0.12, 0.45, 0, BOT - 0.36));                                // light bar under the beam
    const merge = (gs) => { const g = new THREE.BufferGeometry(); const all = gs.map((x) => x.toNonIndexed());
      const n = all.reduce((a, x) => a + x.attributes.position.count, 0), pp = new Float32Array(n * 3), nr = new Float32Array(n * 3);
      let o = 0; for (const x of all) { pp.set(x.attributes.position.array, o * 3); nr.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; }
      g.setAttribute('position', new THREE.BufferAttribute(pp, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); return g; };
    const every = Math.round(GANTRY_EVERY / this.step);
    this.gantryIdx = [];
    for (let i = this.start; i < this.start + this.n; i += every) {
      const s = (i % this.n) * this.step;
      if (i === this.start || !(this.inGap(s, 30) || this.inLoop(s, 40) || this.inTunnel(s, 20) || this.inCave(s, 30) || this.inCanopy(s, 25))) this.gantryIdx.push(i % this.n);
    }
    const fm = new THREE.InstancedMesh(merge(frame), new THREE.MeshStandardMaterial({ color: 0x5a616b, roughness: 0.5, metalness: 0.65 }), this.gantryIdx.length);
    const gm = new THREE.InstancedMesh(merge(glow), new THREE.MeshBasicMaterial({ color: new THREE.Color(...TH.gantry) }), this.gantryIdx.length);
    const M = new THREE.Matrix4();
    this.gantryIdx.forEach((i, k) => {
      this.basisAt(i, M);
      fm.setMatrixAt(k, M);
      gm.setMatrixAt(k, M);
      gm.setColorAt(k, k === 0 ? new THREE.Color(2.6, 0.25, 0.2) : new THREE.Color(1, 1, 1));
    });
    fm.castShadow = true;
    fm.receiveShadow = true;
    return [fm, gm];
  }

  // the start / finish line: a band of checks across the deck
  startLine() {
    const tex = canvasTex(512, 32, (g, w, h) => {
      for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#e8e6e0' : '#16171a'; g.fillRect(i * 16, j * 16, 16, 16); }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W - 4.4, 2.75).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const i = this.start, M = new THREE.Matrix4().makeBasis(this.R[i], this.U[i], this.T[i].clone().negate()).setPosition(this.P[i].clone().addScaledVector(this.U[i], 0.02));
    m.matrixAutoUpdate = false;
    m.matrix.copy(M);
    m.receiveShadow = true;
    return m;
  }

  // chevron boards on the outside wall of every tight corner, facing the traffic, pointing the way
  chevrons() {
    const tex = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = '#c4202a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2f0ea';
      for (let k = 0; k < 3; k++) {
        const x = 40 + k * 72;
        g.beginPath(); g.moveTo(x, 12); g.lineTo(x + 34, h / 2); g.lineTo(x, h - 12); g.lineTo(x + 18, h - 12); g.lineTo(x + 52, h / 2); g.lineTo(x + 18, 12); g.closePath(); g.fill();
      }
      g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const board = new THREE.PlaneGeometry(4.2, 1.6);
    const post = new THREE.BoxGeometry(0.16, 1.4, 0.16).translate(0, -1.2, -0.1);
    const list = [];
    let last = -1e9;
    for (let i = 0; i < this.n; i++) {
      const k = this.kh[i];
      if (Math.abs(k) < 0.0045 || i - last < Math.round(32 / this.step) || this.inGap(i * this.step, 10) || this.inCanopy(i * this.step, 8)) continue;
      last = i;
      list.push({ i, side: -Math.sign(k) });                // the outside of the turn
    }
    const bm = new THREE.InstancedMesh(board, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff,
      emissiveIntensity: 0.45, roughness: 0.6, side: THREE.DoubleSide }), list.length);
    const pm = new THREE.InstancedMesh(post, new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.5, metalness: 0.6 }), list.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    list.forEach(({ i, side }, k) => {
      const R = this.R[i], U = this.U[i], T = this.T[i];
      // face the oncoming ships (normal = -T), turned a little toward the track; mirrored for left-hand turns
      const n = T.clone().negate().addScaledVector(R, -side * 0.35).normalize(), x = new THREE.Vector3().crossVectors(U, n).normalize();
      M.makeBasis(x, U, n);
      Q.setFromRotationMatrix(M);
      P.copy(this.P[i]).addScaledVector(R, side * (TRACK_W / 2 + WALL_T / 2)).addScaledVector(U, WALL_H + 2.1);
      S.set(side > 0 ? 1 : -1, 1, 1);
      bm.setMatrixAt(k, M.compose(P, Q, S));
      pm.setMatrixAt(k, M.compose(P, Q, new THREE.Vector3(1, 1, 1)));
    });
    bm.castShadow = pm.castShadow = true;
    return [bm, pm];
  }

  // lamp posts on the walls every 60 m (alternating sides), each a post, an arm over the track and a lit lens
  lampPosts() {
    const every = Math.round(60 / this.step), n = Math.floor(this.n / every);
    const X = TRACK_W / 2 + WALL_T / 2;
    const postG = new THREE.BoxGeometry(0.22, 4.2, 0.22).translate(0, 2.1, 0);
    const armG = new THREE.BoxGeometry(1.8, 0.18, 0.3).translate(-0.8, 4.15, 0);
    const lensG = new THREE.BoxGeometry(0.9, 0.06, 0.24).translate(-1.15, 4.04, 0);
    const merge = (a, b) => { const g = mergeTwo(a, b); g.deleteAttribute('uv'); return g; };
    const mm = new THREE.InstancedMesh(merge(postG, armG), new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.5, metalness: 0.6 }), n);
    const lm = new THREE.InstancedMesh(lensG, new THREE.MeshBasicMaterial({ color: new THREE.Color(...TH.lamp) }), n);
    const M = new THREE.Matrix4(), turn = new THREE.Matrix4().makeRotationY(Math.PI);
    let used = 0;
    for (let k = 0; k < n; k++) {
      const i = k * every, side = k % 2 ? 1 : -1;
      if (this.inGap(i * this.step, 6) || this.inLoop(i * this.step, 10) || this.inTunnel(i * this.step, 5) || this.inCave(i * this.step, 20) || this.inCanopy(i * this.step, 8)) continue;
      this.basisAt(i, M);
      M.setPosition(this.P[i].clone().addScaledVector(this.R[i], side * X).addScaledVector(this.U[i], WALL_H));
      if (side < 0) M.multiply(turn);                   // (turned round, not mirrored: see the towers)
      mm.setMatrixAt(used, M);
      lm.setMatrixAt(used++, M);
    }
    mm.count = lm.count = used;
    mm.castShadow = true;
    return [mm, lm];
  }

  // a lit trim along the deck's outer sides (it reads the track's line from other parts of the circuit)
  edgeTrims() {
    const E = TRACK_W / 2 + WALL_T + 0.01;
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...TH.trim) });
    return [-1, 1].map((sd) => {
      const sec = [[sd * E, -0.55, 0, sd, 0], [sd * E, -0.38, 1, sd, 0]];
      return new THREE.Mesh(this.sweep(sd > 0 ? sec.slice().reverse() : sec, 10), mat);
    });
  }

  // boost pads: chevrons scrolling forward and pulsing, a bright frame, light pillars rising from both edges; a pad
  // flares when a ship takes it (flash per instance, decays in Track.update)
  padMeshes() {
    const tex = chevronTexture();
    const n = this.pads.length;
    this.padFlashA = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.padMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { map: { value: tex }, time: { value: 0 } },
      vertexShader: /* glsl */`attribute float flash; varying float vF; varying vec2 vUv;
        void main() { vUv = uv; vF = flash; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform float time; varying float vF; varying vec2 vUv;
        void main() {
          float m = texture2D(map, vec2(vUv.x, fract(vUv.y - time * 1.3))).a;
          float d = max(abs(vUv.x - 0.5) * 2.0, abs(vUv.y - 0.5) * 2.0);
          float rim = smoothstep(0.86, 0.95, d) * (1.0 - smoothstep(0.97, 1.0, d));
          float pulse = 0.7 + 0.3 * sin(time * 7.0 - vUv.y * 10.0);
          vec3 c = vec3(1.0, 0.42, 0.05) * (m * pulse * (0.9 + 2.5 * vF) + rim * 0.9 + 0.06 + vF * 0.5);
          gl_FragColor = vec4(c * 1.4, 1.0);
        }`,
    });
    const geo = new THREE.PlaneGeometry(8, 16).rotateX(-Math.PI / 2);
    geo.setAttribute('flash', this.padFlashA);
    const im = new THREE.InstancedMesh(geo, this.padMat, n);
    // light pillars: thin vertical sheets along both long edges, fading upward
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */`attribute float flash; varying float vF; varying vec2 vUv;
        void main() { vUv = uv; vF = flash; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float time; varying float vF; varying vec2 vUv;
        void main() {
          float up = pow(1.0 - vUv.y, 2.2), ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float rise = 0.75 + 0.25 * sin(vUv.y * 14.0 - time * 9.0);
          gl_FragColor = vec4(vec3(1.0, 0.5, 0.1) * up * ends * rise * (0.25 + 1.6 * vF), 1.0);
        }`,
    });
    const beam = (x) => new THREE.PlaneGeometry(16, 3.2).rotateY(Math.PI / 2).translate(x, 1.6, 0);
    const bgeo = mergeTwo(beam(-4), beam(4));
    bgeo.setAttribute('flash', this.padFlashA);
    const bm = new THREE.InstancedMesh(bgeo, this.beamMat, n);
    const M = new THREE.Matrix4(), f = {};
    this.pads.forEach((p, k) => {
      this.frame(p.s, f);
      p.at = f.P.clone().addScaledVector(f.R, p.x).addScaledVector(f.U, 0.04);
      p.basis = new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate());
      M.copy(p.basis).setPosition(p.at);
      im.setMatrixAt(k, M);
      bm.setMatrixAt(k, M);
    });
    im.renderOrder = 1;
    bm.renderOrder = 2;
    im.frustumCulled = bm.frustumCulled = false;
    return [im, bm];
  }

  padFlash(i) { this.padFlashA.array[i] = 1; }

  // an energy ripple through the barrier from where a ship hit it (four at a time)
  fieldHit(at, strength) {
    const u = this.fieldMat.uniforms, k = u.hitN.value++ % 4;
    u.hits.value[k].set(at.x, at.y, at.z, u.time.value);
    u.hitS.value[k] = Math.min(1.5, strength);
  }

  // Asteroids: six rock shapes - lumpy, ridged, cratered (bowls with raised rims), squashed and stretched - with
  // colour that darkens in the hollows; the surface gets fine procedural relief and grain in the shader (3-D noise in
  // the rock's own space, so it sticks to it), as bump through the surface gradient. Many small, a few huge.
  asteroids(scene) {
    const rnd = mulberry32(2024);
    const shape = (detail, k) => {
      let g = new THREE.IcosahedronGeometry(1, detail);
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      g = mergeVertices(g);
      const p = g.attributes.position, v = new THREE.Vector3(), r2 = mulberry32(77 + k * 13);
      const craters = Array.from({ length: 6 + Math.floor(r2() * 8) }, () => ({
        c: new THREE.Vector3(r2() * 2 - 1, r2() * 2 - 1, r2() * 2 - 1).normalize(), r: 0.12 + r2() * 0.38, d: 0.05 + r2() * 0.1 }));
      const stretch = new THREE.Vector3(1 + r2() * 0.6, 0.65 + r2() * 0.4, 0.8 + r2() * 0.45);
      const cuts = Array.from({ length: 2 + Math.floor(r2() * 3) }, () => ({ n: new THREE.Vector3(r2() * 2 - 1, r2() * 2 - 1, r2() * 2 - 1).normalize(), c: 0.55 + r2() * 0.3 }));
      const depth = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).normalize();
        let h = 1 + 0.34 * (fbm(v.x * 1.2 + k * 7.1, v.y * 1.2 + v.z * 0.9 - k * 3.3, 4) - 0.5);
        const rg = 1 - Math.abs(2 * fbm(v.x * 3.2 + 11 + k, v.z * 3.2 - v.y * 2.4, 3) - 1);
        h += 0.09 * rg * rg;
        let cr = 0;
        for (const c of craters) {
          const x = v.angleTo(c.c) / c.r;
          if (x < 1) cr -= c.d * (1 - x * x);
          else if (x < 1.4) cr += c.d * 0.35 * Math.sin(((x - 1) / 0.4) * Math.PI);
        }
        h += cr;
        // ridges, and the flat faces left where pieces split off
        const rg2 = 1 - Math.abs(2 * fbm(v.y * 5.5 - k * 2, v.x * 5.5 + v.z * 3.1, 3) - 1);
        h += 0.06 * rg2 * rg2 * rg2;
        for (const cp of cuts) { const dd = v.dot(cp.n); if (dd > cp.c) h = Math.min(h, h * (cp.c / dd) + (dd - cp.c) * 0.05); }
        depth[i] = cr;
        v.multiplyScalar(h).multiply(stretch);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      const col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n1 = fbm(v.x * 2.2 + k, v.z * 2.2 + v.y, 4), n2 = noise2(v.x * 7 - k, v.y * 7 + v.z * 3);
        const t = 0.9 + 0.14 * n1 + 0.06 * (n2 - 0.5) - Math.min(0.12, -depth[i] * 1.2);
        c.setRGB(t * (1 + 0.04 * smoothstep(0.55, 0.75, n1)), t, t * (1 - 0.05 * smoothstep(0.55, 0.75, n1)));
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    };
    const geos = [shape(4, 0), shape(4, 1), shape(3, 2), shape(3, 3), shape(3, 4), shape(3, 5)];
    const mat = rockMaterial({ big: 38, small: 6, key: 'asteroid' });
    const coarse = this.P.filter((_, i) => i % 10 === 0);
    const box = new THREE.Box3().setFromPoints(this.P).expandByScalar(1600);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), X = new THREE.Vector3();
    const lists = geos.map(() => []), tones = geos.map(() => []);
    for (let k = 0; k < 9000 && lists.flat().length < 360; k++) {
      X.set(box.min.x + rnd() * (box.max.x - box.min.x), box.min.y + rnd() * (box.max.y - box.min.y) * 0.8, box.min.z + rnd() * (box.max.z - box.min.z));
      const size = 3 + 95 * Math.pow(rnd(), 4.5);
      let dmin = 1e9;
      for (const p of coarse) { const d = p.distanceTo(X); if (d < dmin) dmin = d; }
      if (dmin < size * 1.5 + 160 || dmin > 1800) continue;
      if (this.keepOut.some((k) => k.c.distanceTo(X) < k.r + size * 1.5 + 60)) continue;
      E.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3);
      M.compose(X, Q.setFromEuler(E), S.set(size, size, size));
      const kind = size > 30 ? (rnd() < 0.5 ? 0 : 1) : 2 + Math.floor(rnd() * 4);
      lists[kind].push(M.clone());
      tones[kind].push(0.7 + rnd() * 0.6);
    }
    return lists.map((l, k) => {
      const im = new THREE.InstancedMesh(geos[k], mat, Math.max(1, l.length));
      const tc = new THREE.Color();
      l.forEach((m, i) => { im.setMatrixAt(i, m); const t = tones[k][i]; im.setColorAt(i, tc.setRGB(t * 1.02, t, t * 0.97)); });
      im.count = l.length;
      im.receiveShadow = true;
      scene.add(im);
      return im;
    });
  }

  update(t, shipPos, dt = 0) {
    this.fieldMat.uniforms.time.value = t;
    if (this.tunnelMat) this.tunnelMat.uniforms.time.value = t;
    for (const m of this.gateMats || []) m.uniforms.time.value = t;
    for (const m of this.flipMats || []) m.uniforms.time.value = t;
    if (this.beaconMat) this.beaconMat.color.setRGB(5, 2.2, 0.3).multiplyScalar(0.15 + 0.85 * (Math.sin(t * 6) > 0 ? 1 : 0));
    this.fieldMat.uniforms.shipPos.value.copy(shipPos);
    this.padMat.uniforms.time.value = t;
    this.laneMat.uniforms.time.value = t;
    this.spillMat.uniforms.time.value = t;
    this.beamMat.uniforms.time.value = t;
    // (the pads' flashes fading: sent to the GPU only while one is lit, and the frame it goes out)
    const fl = this.padFlashA.array;
    let lit = false;
    for (let i = 0; i < fl.length; i++) if (fl[i] > 0) { fl[i] = Math.max(0, fl[i] - dt * 1.6); lit = true; }
    if (lit) this.padFlashA.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the racer: track-space anti-grav physics
// "increase the max speed by a lot": full throttle ~250 m/s (900 km/h), boost ~340 m/s (1,220 km/h), pads to 380 m/s
const THRUST = 82, BOOST = 67, DRAG_Q = 0.0012, DRAG_L = 0.03;
const HOLD = 32, HOLD_V2 = 0.0018;  // the track's magnetic pull toward the deck (m/s2), stronger with speed so only a
                                    // real crest (the jump) throws the ship off at 900 km/h
const HOVER = 1.35;            // clearance of the lowest point (1.1: a hard lean put the low engine in the road)
const AIRBRAKE = 0.9;
const HOLD_GAP = 24;            // over a cut in the deck: no cushion, no floor - only a weak pull (m/s2)
const PAD_KICK = 55, PAD_MAX = 380;
// "make turns harder at higher speeds": the yaw rate the ship can steer halves from walking pace to top speed,
// and the hull slides more (grip 4 -> 2.4); airbrakes still add 90 %
export const turnRate = (v) => 1.6 * (1 - 0.5 * smoothstep(60, 320, v));
export const gripAt = (v) => 4.0 * (1 - 0.4 * smoothstep(100, 320, v));
// "add some kind of drifting at the corners, with brake and accelerate, so ships can take corners a bit easier
// sometimes, with skill". Started by touching the brake (held, or let go of under 0.4 s ago) with the stick thrown
// hard over, on the deck from ~200 km/h. "drifting should start slowly, not punch you into a direction ... you should
// be able to go left right ... and get out of it after trying to control the ship": a drift is the hull losing grip -
// over ~0.45 s it fades to 55 % and the nose swings 30 % livelier, either way, as the stick says. The way it goes
// lags the nose: the tail steps out. Steered into the slide it holds its angle; centred or against it the hull grips
// again and straightens (flicked the other way while still sliding, the slide swaps sides). Its speed drags with
// the angle and the brake only feathers; it charges the more angle it holds. Caught - the slide back within ~8 deg
// for a moment - the grip comes back and the charge kicks the ship on (three steps: the sparks and
// trails under it show which; lost to a wall knock). (A rival says when it drifts: inp.drift.)
// "make double tap drift, like drifting once and if i drift again fast enough i get a bigger drift": a chain. A drift
// started within 0.9 s of catching one that kicked - or the brake tapped again mid-drift, the stick still over - is a
// step bigger (up to three): it slides deeper (7 % less grip a step) and livelier, starts with a share of charge,
// charges a quarter faster and kicks 30 % harder a step.
// "make successful drifting give a bit of boost energy, so it can go over the limit and after it stops drifting to
// start going back to normal limit slowly unless it's used": a drift that kicks also tops the boost energy up (by its
// step, more down a chain), past full to 1.5 at most; over full it bleeds back to full at 0.05 a second once the
// drifting is over, unless the boost spends it first.
export const DRIFT = { v: 55, tap: 0.4, rate: 1.3, grip: 0.55, keep: 0.8, drag: 0.12, brake: 0.1, onset: 2.2, caught: 0.14,
  settle: 0.15, tiers: [0.5, 1.1, 1.8], kick: [12, 22, 32], chainWindow: 0.9, chainMax: 3, energy: [0.1, 0.18, 0.28] };
export const ENERGY_MAX = 1.5, ENERGY_BLEED = 0.05;
// The player's help by the difficulty ("on normal drifts to gain easier and faster boost ... walls 30 % less harsh ...
// 20 % faster boost gain on drift and 10 % boost gain overall; on hard only the drift's 10 % and 20 % less harsh; on
// brutal no bonuses"): wall - the share of a wall knock's and a grind's speed loss paid; drift - the drift's charge
// and energy top-up; recharge - the boost energy's own recharge. Rivals get none.
// Easy ("the walls less harsh by 80 %"): Normal's drift and recharge help and a fifth of a knock's cost.
export const PERKS = { easy: { wall: 0.2, drift: 1.2, recharge: 1.1 }, normal: { wall: 0.7, drift: 1.2, recharge: 1.1 },
  hard: { wall: 0.8, drift: 1.1, recharge: 1 },
  brutal: { wall: 1, drift: 1, recharge: 1 } };
// The hulls' damage ("hitting the edge of the tracks at low speed should not damage the ships, and hitting above a
// limit and when faster do more damage based on speed"; "the damage from ship to ship hits would be lower than from
// hitting the edges"). A wall knock: wall per m/s it hit by past a graze (at most cap: one knock never takes much
// more than a third of a Feather's hull), times the speed share - none under v0 m/s (~290 km/h), 1 at v1 (900 km/h),
// up to 1.4. Another ship's knock (race.js collide): ship per m/s of the closing
// speed past shipGraze, times the same speed share and the hitter's ram (ships.js). At 0 the hull is reset where it
// is, stopped dead ("completely stopping its acceleration and speed and going from 0"), and for ghost seconds it can
// be flown through - no contact with the other ships, no damage, no boost - the pack goes by it.
// safe: no hull takes damage in the race's first s ("make sure ships dont take damage first 10 seconds"). wall a third
// of what it was ("make the damage taken from hitting the edge of the track 3 times lower overall on all ships")
export const DAMAGE = { wall: 1 / 3, graze: 6, cap: 24, ship: 0.15, shipGraze: 5, v0: 80, v1: 250, ghost: 3, safe: 10 };
export const damageSpeed = (v) => clamp((Math.abs(v) - DAMAGE.v0) / (DAMAGE.v1 - DAMAGE.v0), 0, 1.4);
// The slam - an ability on its own key (race.js attacks: the player's Space; "like an ability, so when in range it
// should activate and always hit the target"). Pressed with a hull alongside in reach (overlapping along, at most
// range m of air across) the ship snaps across at it - lunge m/s at once (lungeAcc), homing, and it lands within lungeT
// s whatever ("my ship should go and knock really hard the other ship, like fast and powerful ... remain on the hit
// position and the enemy should fly into the wall"). The blow stops the attacker dead where it hit and throws the other
// throw m/s across x the masses (at most cap), loose for knock s (its grip at loose of itself) and off its heading
// (slamYaw rad), slowed (slamLoss of its speed), hurt dmg x a knock of slamMin m/s; the attacker takes keep of its own
// share. A hull thrown into a wall takes wallCap m/s of that knock at most, x wallK. Pressed back within counter s of a
// slam at it - before it lands or after - it is a double attack: the two bounce bounce m/s apart, no one flies into the
// wall and neither hull is hurt ("when blocking an attack none of the ships take damage").
// startLock: no slams in the race's first s ("make slam not possible first 10 seconds of the race"). selfSafe: the
// player's own slam - no damage from the press until this many s after it lands ("when slaming into a ship i cant
// control mine, which it takes me to an edge and i take dmg, maybe make me immune to dmg while in that and after")
// heal: a slam that lands gives the one who threw it this share of its hull back ("when doing a succesful slam to
// gain hp back"); a block takes it away again
export const ATTACK = { startLock: 10, selfSafe: 2, heal: 0.2, range: 7, lunge: 60, lungeAcc: 2000, lungeT: 0.3, throw: 62, cap: 95, knock: 0.9, loose: 0.12,
  slamYaw: 0.2, slamLoss: 0.11, slamMin: 22, dmg: 4, keep: 0.3, wallCap: 28, wallK: 1.0, counter: 0.5, bounce: 14 };
const FLIP_LIFT = 3.5;          // how far the field lifts a ship off the deck it leaves, halfway through a flip (m)
const PITCH_AIR = 14;           // nose down / up in the air: m/s2 more / less pull back to the deck

const _H = new THREE.Vector3(), _R = new THREE.Vector3(), _B = new THREE.Vector3(), _F = new THREE.Vector3();
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _DV = new THREE.Vector3();

export class TrackRacer {
  constructor(ship, track) {
    this.ship = ship;
    this.track = track;
    this.pos = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.f = {};
    this.throttle = 0; this.boostEnergy = 1; this.boosting = 0; this.assist = true;
    this.crashed = 0; this.events = []; this.turn = 0; this.scrape = 0; this.steerS = 0; this.padT = 0;
    this.yawRate = 0; this.airIn = 0;
    this.accS = 0; this.latS = 0; this.landImp = 0;    // for the ship's animation (Ship.animate)
    this.thrustScale = 1;              // rivals' engines (and a little rubber band)
    this.locked = false;               // on the grid: engines and throttle live, the ship held in its slot
    this.camQ = new THREE.Quaternion(); // the track frame + heading, without the lean: what the chase camera follows
    this.qAir = new THREE.Quaternion(); // the attitude in the air (pose)
    this.airT = 0;                      // 0 on the deck .. 1 well clear of it
    this.yawKick = 0;                   // heading turned in one step (a wall glance): the animation eases it in
    this.perks = PERKS.brutal;          // the player's help by the difficulty (main.js); none for the rivals
    this.handling = { thrust: 1, boost: 1, drag: 1, turn: 1, impact: 1, health: 100, ram: 1 };   // how this ship flies (ships.js HANDLING)
    this.health = 100;                  // the hull (hurt; Race.reset fills it)
    this.ghost = 0;                     // s left of being flown through after a wreck
    this.armed = false;                 // damage counts (Race: racing, not past the flag)
    this.drift = 0;                     // drifting: the side (+1 right), 0 not
    this.driftCharge = 0; this.driftKick = 0; this.driftS = 0; this.slip = 0;
    this.pitchIn = 0;
    this.place(track.start * track.step, false);
  }

  // the drift's step so far: 0 none, 1 - 3
  get driftTier() { const c = this.driftCharge, T = DRIFT.tiers; return c >= T[2] ? 3 : c >= T[1] ? 2 : c >= T[0] ? 1 : 0; }

  startDrift(side) {
    this.drift = this.driftSide = side; this.driftCharge = 0; this.driftAge = 0; this.driftCalm = 0;
    this.chain = this.chainT > 0 ? Math.min(DRIFT.chainMax, (this.chain || 0) + 1) : 0;
    this.chainT = 0;
    this.emit({ type: 'driftStart', side });
    if (this.chain) this.chainUp();
  }

  // a step up the chain: a head start on the charge
  chainUp() {
    this.driftCharge += 0.3;
    this.emit({ type: 'driftChain', tier: this.chain, at: this.pos.clone() });
  }

  // the drift ends: let go on the deck, its charge kicks the ship on (paid over ~0.2 s)
  endDrift(go) {
    const tier = this.driftTier;
    if (go && tier) {
      const k = 1 + 0.3 * (this.chain || 0);
      this.driftKick += DRIFT.kick[tier - 1] * k;
      this.boostEnergy = Math.min(ENERGY_MAX, this.boostEnergy + DRIFT.energy[tier - 1] * k * this.perks.drift);
      this.emit({ type: 'drift', tier, at: this.pos.clone() });
    }
    this.chainT = go && tier ? DRIFT.chainWindow : 0;       // the window to chain the next one
    if (!this.chainT) this.chain = 0;
    this.drift = 0;
    this.driftCharge = 0;
  }

  place(s, hover) {
    // (wrapped: a grid slot behind a start near the lap's 0 would be s < 0)
    this.s = this.track.wrap(s); this.x = 0; this.y = hover ? HOVER : 0.002; this.vy = 0; this.vs = 0; this.vx = 0; this.psi = 0; this.slow = 0;
    this.throttle = 0; this.steerS = 0; this.yawRate = 0; this.boosting = 0;
    this.drift = 0; this.driftCharge = 0; this.driftKick = 0; this.driftK = 0; this.chain = 0; this.chainT = 0;
    this.pose(0);
  }

  emit(ev) { this.events.push(ev); this.onEvent?.(ev); }

  get maxHealth() { return this.handling.health || 100; }

  // a full hull, no ghosting, the slam ready (a new race)
  repair() { this.health = this.maxHealth; this.ghost = 0; this.safe = 0; this.slamCool = 0; this.lunge = null; this.knocked = 0; }

  // the slam's charge: 0 just used .. 1 ready (the HUD)
  get slamCharge() { return 1 - (this.slamCool || 0) / (this.handling.slamCool || 10); }

  // damage to the hull (the player's eased by the difficulty, as a wall's speed cost is); at 0, a wreck
  hurt(amount, why, at) {
    if (!(amount > 0.05) || !this.armed || !TrackRacer.damage || this.ghost > 0 || this.safe > 0) return 0;
    amount *= this.perks.wall;
    this.health -= amount;
    this.emit({ type: 'damage', amount, why, at: at || this.pos.clone() });
    if (this.health <= 0) this.wreck();
    return amount;
  }

  // the hull gone: reset where it is - square to the track, stopped dead, the throttle closed and the boost cut, the
  // hull full again - and flown through by the other ships for DAMAGE.ghost seconds
  wreck() {
    const at = this.pos.clone(), vel = this.vel.clone();        // (the speed it had: its debris flies on with it)
    if (this.drift) this.endDrift(false);
    this.vs = 0; this.vx = 0; this.psi = 0; this.yawRate = 0; this.slow = 0; this.driftKick = 0;
    this.throttle = 0; this.boosting = 0; this.lunge = null;
    this.health = this.maxHealth;
    this.ghost = DAMAGE.ghost;
    this.emit({ type: 'wreck', at, vel });
  }

  static drifting = true;              // settings: "Drift (brake + throttle in a corner)"
  static airPitch = true;              // settings: "Pitch in the air (nose down to land sooner)"
  static damage = true;                // settings: "Ship damage"

  // a point's height over the deck at its own place along the track (world, m). The hull sits square to the deck
  // under its middle, but a long, wide hull reaches metres fore and aft: where the deck twists into a roll its tail
  // corners were already over deck turned up under them - the Anvil's sank 1.2 m into the road on the space circuit's
  // twist. Off the deck (beyond its edges, over a cut): none under it.
  deckHeight(w) {
    const f = (this.dk ||= {});
    let s = this.s + _DV.subVectors(w, this.pos).dot(this.f.T);         // (along the frame under the middle, then
    this.track.frame(s, f);                                               // one step onto the point's own)
    s += _DV.subVectors(w, f.P).dot(f.T);
    this.track.frame(s, f);
    _DV.subVectors(w, f.P);
    return Math.abs(_DV.dot(f.R)) > TRACK_W / 2 || this.track.inGap(s) ? Infinity : _DV.dot(f.U);
  }

  // what the animation layer reads each frame (the landing impulse is consumed)
  animState() {
    const land = this.landImp, yawKick = this.yawKick;
    this.landImp = 0;
    this.yawKick = 0;
    return { steer: this.steerS, lat: this.latS, accel: this.accS, vy: this.vy, airbrake: this.airIn, land, air: this.airT,
      brake: this.brakeS || 0, yawKick, height: this.y, drift: this.driftS * (this.drift || this.driftSide || 0), slip: this.slip,
      deckHeight: (this.deckFn ||= (w) => this.deckHeight(w)), ghost: this.ghost };
  }

  get speed() { return Math.hypot(this.vs, this.vx, this.vy * 0.2); }
  get forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.q); }
  get up() { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.q); }
  get agl() { return this.y; }
  get pitch() { return 0; }

  step(dt, inp) {
    const ship = this.ship, power = ship.power, tr = this.track, f = tr.frame(this.s, this.f);
    if (this.ghost > 0) this.ghost = Math.max(0, this.ghost - dt);
    if (this.safe > 0) this.safe = Math.max(0, this.safe - dt);      // (just blocked a slam: no damage - race.js clash)
    // "make the break more powerful": S cuts the throttle and brakes at once (it used to wind the throttle lever down
    // for 1.4 s before any braking); W spools back up in under a second
    const braking = ship.ready && inp.throttleDown > 0.5;
    const air = this.y > HOVER + 1.2, flipU = tr.flipAt(this.s);
    const steer = clamp(inp.yaw + inp.roll, -1, 1), brakeL = inp.airL > 0.5 ? 1 : 0, brakeR = inp.airR > 0.5 ? 1 : 0;
    if (this.slamCool > 0) this.slamCool = Math.max(0, this.slamCool - dt);    // (the slam charging - race.js)
    if (this.knocked > 0) this.knocked = Math.max(0, this.knocked - dt);    // (knocked loose by an attack: grip comes back)
    // the drift: the brake touched and the stick thrown over, on the deck at speed; held while the slide lasts and a
    // pedal is down, ended by catching it (or a rival saying so)
    const pressing = inp.throttleAxis != null ? inp.throttleAxis > 0.5 : inp.throttleUp > 0.5;
    this.brakeAgo = braking ? 0 : (this.brakeAgo ?? 9) + dt;
    const tapped = braking && !this.brakeWas;
    this.brakeWas = braking;
    if (!this.drift && this.chainT > 0 && (this.chainT -= dt) <= 0) this.chain = 0;
    const onDeck = !air && !tr.inGap(this.s) && !tr.inLoop(this.s);
    const ok = TrackRacer.drifting && ship.ready && onDeck && Math.abs(this.vs) > DRIFT.v * (this.drift ? 0.6 : 1);
    if (inp.drift != null) {
      if (!this.drift && ok && inp.drift) this.startDrift(inp.drift);
      else if (this.drift && (!ok || !inp.drift)) this.endDrift(ok);
    } else if (!this.drift) {
      if (ok && (braking || this.brakeAgo < DRIFT.tap) && Math.abs(steer) > 0.55) this.startDrift(Math.sign(steer));
    } else {
      this.driftAge += dt;
      if (tapped && Math.abs(steer) > 0.55 && this.driftAge > 0.25 && this.chain < DRIFT.chainMax) { this.chain++; this.chainUp(); }
      this.driftCalm = this.driftAge > 0.6 && Math.abs(this.slip) < DRIFT.caught ? this.driftCalm + dt : 0;
      if (!ok) this.endDrift(false);
      else if (this.driftCalm > DRIFT.settle || !(pressing || braking)) this.endDrift(true);
    }
    // how far into the drift the hull is: the grip fading over ~0.45 s, back over ~0.25 s
    this.driftK = clamp((this.driftK || 0) + (this.drift ? DRIFT.onset : -4) * dt, 0, 1);
    if (ship.ready) this.throttle = inp.throttleAxis != null ? inp.throttleAxis
      : clamp(this.throttle + (inp.throttleUp * 1.3 - (this.drift ? 0 : inp.throttleDown) * 3.0) * dt, 0, 1);
    else if (!ship.engineOn) this.throttle = Math.max(0, this.throttle - dt);
    this.brakeS = (this.brakeS || 0) + ((braking ? 1 : 0) - (this.brakeS || 0)) * damp(9, dt);
    this.driftS += ((this.drift ? 1 : 0) - this.driftS) * damp(5, dt);
    const wantBoost = inp.boost && this.boostEnergy > 0.02 && ship.ready && !(this.ghost > 0);   // (no boost while a wreck)
    this.boosting += ((wantBoost ? 1 : 0) - this.boosting) * damp(6, dt);
    // the boost spends the energy; under full it recharges, over full (a drift's top-up) it bleeds back once the
    // drifting is over
    const E = this.boostEnergy;
    this.boostEnergy = wantBoost ? Math.max(0, E - 0.2 * dt) : E < 1 ? Math.min(1, E + 0.08 * this.perks.recharge * dt)
      : this.drift || this.chainT > 0 ? E : Math.max(1, E - ENERGY_BLEED * dt);
    // steering (A/D, arrows, mouse, stick), airbrakes (Z / X, bumpers): a sharper turn, more drag; drifting, a
    // livelier nose
    this.steerS += (steer + (brakeR - brakeL) * 0.8 - this.steerS) * damp(8, dt);
    const grip = air ? 0.25 : 1, dk = this.driftK, H = this.handling, vR = Math.sqrt(H.thrust / H.drag);
    const ch = this.chain || 0, rateK = (brakeL || brakeR ? 1 + AIRBRAKE : 1) * (1 + (DRIFT.rate + 0.1 * ch - 1) * dk);
    // (a faster ship turns as the other does at the same share of its top speed - its yaw rate scaled with its speed,
    // so it holds the same lines - and then by its own turn)
    this.yawRate = this.steerS * turnRate(Math.abs(this.vs) / vR) * vR * H.turn * rateK * grip * power;
    this.psi += this.yawRate * dt;
    if (this.assist && Math.abs(steer) < 0.1 && !air && !this.drift) this.psi -= this.psi * 1.1 * dt;   // eases back along the track
    this.airIn = brakeR - brakeL;
    // the track turns under the ship: its heading and velocity rotate against the turn
    const turn = f.kh * this.vs * dt;
    this.psi = clamp(this.psi - turn, -1.3, 1.3);
    const tierWas = this.driftTier;
    const c = Math.cos(turn), sn = Math.sin(turn), vs = this.vs * c + this.vx * sn, vx = -this.vs * sn + this.vx * c;
    this.vs = vs; this.vx = vx;
    // a knock's speed loss (walls, other ships) is paid over ~0.1 s, not in one step: taken in one 8 ms step a 37 m/s
    // loss showed as the ship jerking backwards ("they stutter when hit")
    this.slow = Math.min(this.slow || 0, 0.35 * Math.abs(this.vs));     // never more than a third of the speed owed
    if (this.slow > 0) {
      const d = Math.min(this.slow, 420 * dt);
      this.vs -= Math.sign(this.vs) * Math.min(Math.abs(this.vs), d);
      this.slow -= d;
    }
    // thrust along the heading, drag, brake, airbrakes
    const hs = Math.cos(this.psi), hx = Math.sin(this.psi);
    // slipstream: tucked in behind another ship (Race sets draft 0..1) the air is easier: up to 7 % more thrust
    const thrust = (this.throttle * THRUST * H.thrust + this.boosting * BOOST * H.boost) * power * this.thrustScale * (1 + 0.07 * (this.draft || 0));
    const sp = Math.hypot(this.vs, this.vx);
    const drag = DRAG_L + DRAG_Q * H.drag * sp + (brakeL + brakeR) * 0.25;
    this.vs += (hs * thrust - this.vs * drag) * dt;
    this.vx += (hx * thrust - this.vx * drag) * dt;
    // the brake: ~6 g plus a share of the speed (15 g at top speed), never into reverse (drifting: a feather of it)
    const bk = this.brakeS * (60 + 0.3 * Math.abs(this.vs)) * dt * power * (1 - (1 - (pressing ? DRIFT.brake : 0.5)) * dk);
    this.vs -= Math.sign(this.vs) * Math.min(Math.abs(this.vs), bk);
    // grip: slip across the heading bleeds away (into the heading while on the deck). Drifting, less of it and less of
    // the slide's speed turned forward - a slide never gains speed, it drags with its angle
    const along = this.vs * hs + this.vx * hx, across = -this.vs * hx + this.vx * hs;
    const push = this.drift ? clamp(steer * this.drift, 0, 1) : 0;    // steered into the slide (else it grips again)
    const loose = this.knocked > 0 ? 1 - (1 - ATTACK.loose) * Math.min(1, this.knocked / (ATTACK.knock * 0.5)) : 1;
    let kept = across * Math.exp(-(air ? 0.4 : gripAt(sp / vR) * vR * H.turn * loose * (1 - (1 - DRIFT.grip + 0.07 * ch) * dk * (0.35 + 0.65 * push))) * dt);
    let al2 = along + (air ? 0 : Math.abs(across - kept) * (0.5 + (DRIFT.keep - 0.5) * dk) * Math.sign(along || 1));
    if (dk > 0) {
      const was = Math.hypot(along, across), now = Math.hypot(al2, kept);
      const k = Math.min(1, was / Math.max(1e-6, now)) * Math.exp(-DRIFT.drag * dk * Math.abs(kept) / Math.max(1, now) * dt);
      al2 *= k; kept *= k;
    }
    this.vs = al2 * hs - kept * hx; this.vx = al2 * hx + kept * hs;
    this.slip = Math.atan2(kept, Math.max(1, Math.abs(al2)));          // the way it goes off the nose (rad)
    if (this.drift) {
      if (Math.abs(this.slip) > 0.03) this.drift = this.driftSide = -Math.sign(this.slip);   // the side the tail is out
      this.driftCharge += dt * smoothstep(0.12, 0.4, Math.abs(this.slip)) * dk * (1 + 0.25 * ch) * this.perks.drift;
      if (this.driftTier > tierWas) this.emit({ type: 'driftTier', tier: this.driftTier, at: this.pos.clone() });
    }
    // a drift's kick, paid over ~0.2 s along the way it goes
    if (this.driftKick > 0) {
      const d = Math.min(this.driftKick, 180 * dt), v = Math.max(1, Math.hypot(this.vs, this.vx));
      this.vs = Math.min(PAD_MAX * vR, this.vs + this.vs / v * d); this.vx += this.vx / v * d;
      this.driftKick -= d;
    }
    // boost pads
    this.padT = Math.max(0, this.padT - dt);
    for (const p of tr.pads) {
      const ds = ((this.s - p.s) % tr.length + tr.length * 1.5) % tr.length - tr.length / 2;
      if (Math.abs(ds) < 8 && Math.abs(this.x - p.x) < 6 && this.padT <= 0 && !air) {
        this.vs = Math.min(PAD_MAX * vR, this.vs + PAD_KICK);
        this.padT = 0.6;
        this.emit({ type: 'pad', i: tr.pads.indexOf(p), at: p.at });
      }
    }
    // along / across (held in the grid slot until the lights go out)
    if (this.locked) { this.vs = 0; this.vx = 0; this.psi = 0; this.yawRate = 0; }
    this.s = tr.wrap(this.s + this.vs * dt);
    this.x += this.vx * dt;
    // walls
    const lim = TRACK_W / 2 - ship.halfSpan * 0.92;
    this.scrape = Math.max(0, this.scrape - dt * 3);
    this.grind = Math.max(0, (this.grind || 0) - dt);
    this.wallCool = Math.max(0, (this.wallCool || 0) - dt);
    if (Math.abs(this.x) > lim) {
      const side = Math.sign(this.x);
      this.grind = 0.12;                   // touching the wall: sparks keep coming while it lasts
      this.grindSide = side;
      this.x = side * lim;
      // grinding along it drags: ~20 % of the speed for each second of contact (proportional - it never stops a ship)
      this.vs *= Math.exp(-0.22 * this.perks.wall * H.impact * dt);
      // the nose glances off: a heading into the wall is turned back along it
      if (this.psi * side > 0) {
        const p0 = this.psi;
        this.psi = -this.psi * 0.25;
        this.yawRate *= 0.3;
        this.yawKick += this.psi - p0;
      }
      if (this.vx * side > 0) {
        const hit = Math.abs(this.vx);
        this.vx = -this.vx * 0.3;
        // friction: the speed lost along the wall is a share of the blow. It was a share of the SPEED on every
        // 120 Hz step of contact (up to 30 %), so a ship pressed to a wall stopped dead - "touching the wall gets
        // me stuck sometimes"
        // "make the wall hits more punishing": a knock costs a share of the blow and, for a real blow, a share of
        // the speed too (a 20 m/s knock at 900 km/h: ~13 %); a graze costs little
        this.slow = (this.slow || 0) + (0.45 * hit + 0.13 * Math.abs(this.vs) * smoothstep(3, 24, hit)) * this.perks.wall * H.impact;
        if (hit > 4) this.driftCharge = 0;
        // one event per knock, not one per step of grinding (each fired the jolt, shield, shake and thud again)
        if (hit > 1.5 && this.wallCool <= 0) {
          this.wallCool = 0.25;
          this.scrape = Math.min(1, hit / 20);
          const at = f.P.clone().addScaledVector(f.R, side * TRACK_W / 2).addScaledVector(f.U, 1.2);
          this.emit({ type: 'scrape', at, v: hit, side, wall: true });
          // (thrown into it by an attack: the full blow - "push them harder in the wall")
          const thrown = this.knocked > 0;
          this.hurt(DAMAGE.wall * clamp(hit - DAMAGE.graze, 0, thrown ? ATTACK.wallCap : DAMAGE.cap) * damageSpeed(this.vs) * (thrown ? ATTACK.wallK : 1), 'wall', at);
        }
      }
    }
    // height: hold + hover cushion; the deck falling away over a crest (kv < 0) throws the ship up. Over a cut there
    // is no deck: no cushion, no floor, a weak pull - the ship flies its arc (the -kv v^2 term is the frame turning,
    // not a force: it stays)
    const gap = tr.inGap(this.s);
    const hold = gap ? HOLD_GAP : HOLD + HOLD_V2 * this.vs * this.vs;
    let ay = -hold - f.kv * this.vs * this.vs;
    // Redout's pitch: in the air the nose down pulls the hull back to the deck sooner (it lands its line and keeps its
    // speed), the nose up stretches the flight
    this.pitchIn += ((TrackRacer.airPitch && air && flipU < 0 ? clamp(inp.pitch || 0, -1, 1) : 0) - this.pitchIn) * damp(6, dt);
    ay += this.pitchIn * PITCH_AIR * power;
    if (!gap && power > 0 && this.y < HOVER + 2.5) {
      const w = 1 - smoothstep(HOVER + 0.6, HOVER + 2.5, this.y);
      ay += (90 * (HOVER * power + hold / 90 - this.y) - 12 * this.vy) * w;
      // the cushion stiffens through a dip: at 1,000 km/h the deck rising into the hull outran the spring and the
      // ship slammed the floor in every hollow
      if (f.kv > 0) ay += f.kv * this.vs * this.vs * w * power;
    }
    // coming down off a jump the cushion reaches up for the hull and catches the fall over the last metres (the
    // fastest descent it can still stop from at each height): it met the deck at 80 m/s, struck the floor and
    // bounced - a jolt and sparks on every landing
    if (!gap && power > 0 && this.vy < 0) {
      const d = this.y - HOVER;
      if (d > 0 && d < 16) {
        const vMax = -Math.sqrt(2 * 260 * d) - 5;
        if (this.vy < vMax) ay += (vMax - this.vy) * 30 * power;
      }
    }
    // a gravity flip: the field carries the hull across - no floor, no fall; it floats a few metres off the deck it
    // left and settles onto the next one's underside as the half roll completes
    if (flipU >= 0) {
      const yT = HOVER + FLIP_LIFT * Math.sin(Math.PI * flipU);
      ay = 40 * (yT - this.y) - 12 * this.vy;
      if (!this.flipping) { this.flipping = true; this.emit({ type: 'flip', at: this.pos.clone() }); }
    } else this.flipping = false;
    const wasAir = this.y > HOVER + 0.8, vy0 = this.vy;
    this.vy += ay * dt;
    this.y += this.vy * dt;
    if (wasAir && this.y <= HOVER + 0.8 && vy0 < -2) this.landImp += -vy0;      // touchdown: the animation dips
    // too low in a cut, or reaching its far lip under the deck: a fall (back on the deck past the cut, slowed)
    if (flipU < 0 && ((gap && this.y < -14) || (this.wasGap && !gap && this.y < -0.8))) { this.wasGap = false; this.fall(); return; }
    this.wasGap = gap && flipU < 0;
    if (!gap && this.y < 0) {
      if (this.vy < -7 && this.wallCool <= 0) { this.emit({ type: 'scrape', at: this.pos.clone(), v: -this.vy }); this.scrape = 1; this.wallCool = 0.25; }
      this.y = 0;
      this.vy = Math.max(0, this.vy);
      if (power < 0.5) { this.vs *= Math.exp(-2 * dt); this.vx *= Math.exp(-2 * dt); }
    }
    this.turn = clamp(Math.abs(this.steerS) * 0.8 + Math.abs(f.kh * this.vs) * 0.6, 0, 1.5);
    const vs1 = this.vs;
    this.accS += ((vs1 - (this.vsPrev ?? vs1)) / dt - this.accS) * damp(6, dt);
    this.vsPrev = vs1;
    this.latS += (this.vs * this.yawRate - this.latS) * damp(6, dt);
    this.pose(dt);
  }

  // fell into a cut (or hit its far lip): back on the deck 30 m past it, at a crawl; the race goes on
  fall() {
    const tr = this.track, g = tr.gaps.find(([s0, s1]) => tr.inSpan(this.s, s0 - 10, s1 + 40)) || [this.s, this.s];
    const at = this.pos.clone();
    this.place(g[1] + 30, true);
    this.vs = 80;
    this.throttle = 1;
    this.emit({ type: 'fall', at });
  }

  // world pose from track coordinates (all lean, pitch and float is the ship's animation layer, Ship.animate)
  pose(dt) {
    const f = this.track.frame(this.s, this.f), ship = this.ship, cp = Math.cos(this.psi), sp = Math.sin(this.psi);
    const H = _H.copy(f.T).multiplyScalar(cp).addScaledVector(f.R, sp);
    this.pos.copy(f.P).addScaledVector(f.R, this.x).addScaledVector(f.U, this.y + ship.bottom);
    this.q.setFromRotationMatrix(_M.makeBasis(_R.crossVectors(H, f.U), f.U, _B.copy(H).negate()));
    this.vel.copy(f.T).multiplyScalar(this.vs).addScaledVector(f.R, this.vx).addScaledVector(f.U, this.vy);
    // in the air the hull flies where it points: its attitude eases toward the flight path (pitched up by the climb
    // off a crest, down by the fall) instead of turning with the deck below - it tipped nose-down while still
    // climbing off the jump and nose-up while falling. Over the last metres down it settles back onto the deck.
    this.airT = smoothstep(HOVER + 0.4, HOVER + 7, this.y);
    // how fast the deck frame turns under the ship (rad/s: loops, rolls, crests) - the chase camera follows tighter
    if (dt > 0) { this.camRate = (this.camRate || 0) + ((this.qLast ? this.qLast.angleTo(this.q) / dt : 0) - (this.camRate || 0)) * damp(10, dt); (this.qLast ||= new THREE.Quaternion()).copy(this.q); }
    if (this.airT > 0) {
      const along = this.vs * cp + this.vx * sp;
      if (dt > 0 && along > 5) {
        const fw = _F.copy(H).multiplyScalar(along).addScaledVector(f.U, this.vy + this.pitchIn * along * 0.2).normalize();
        const r = _R.crossVectors(fw, f.U).normalize(), u = _B.crossVectors(r, fw);
        _Q.setFromRotationMatrix(_M.makeBasis(r, u, fw.negate()));
        this.qAir.slerp(_Q, damp(7, dt));
      }
      this.q.slerp(this.qAir, this.airT);
    } else this.qAir.copy(this.q);
    this.camQ.copy(this.q);
    // drifting, the chase camera looks along the way the ship is going more than along its nose: the slide shows
    if (this.driftS > 0.01) {
      const pv = Math.atan2(this.vx, Math.max(1, this.vs)), pc = this.psi + (pv - this.psi) * 0.8;
      const Hc = _H.copy(f.T).multiplyScalar(Math.cos(pc)).addScaledVector(f.R, Math.sin(pc));
      _Q.setFromRotationMatrix(_M.makeBasis(_R.crossVectors(Hc, f.U), f.U, _B.copy(Hc).negate()));
      this.camQ.slerp(_Q, this.driftS * (1 - this.airT));
    }
  }
}
