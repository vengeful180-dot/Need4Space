// The track's light fittings, built like real ones (track.js: studs, lampPosts): a road stud - a cast body on a
// bolted base plate, a lens set into each of its sloped ends - and a lamp post - a base plate with gussets, a tapered
// post with a service door, a curved arm, a lamp head with cooling fins over it and its diffuser recessed in its
// underside, a grid of LED cells glowing through it. ("better light sockes and more detailed": a stud was a glowing
// box, a lamp a box post with a box lens.)
// Each fitting is one geometry: flat faces with their own normals (each turned to face out from the solid), a `part`
// per vertex (which finish: the material picks its colour, roughness and metalness by it) and a `glow` (the lit lens).
// Small fixings - the bolts in the base plates, the post's door, the LED cells - are drawn per pixel in the fitting's
// own coordinates (vFit), sharp at any distance and no vertices spent on them.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const v2 = (p) => new THREE.Vector2(p[0], p[1]);

class Builder {
  constructor() { this.pos = []; this.nrm = []; this.part = []; this.glow = []; this.idx = []; }
  // a flat convex polygon, turned to face `out`
  face(vs, out, part, glow = 0) {
    let n = V(0, 0, 0).subVectors(vs[1], vs[0]).cross(V(0, 0, 0).subVectors(vs[2], vs[0]));
    if (n.dot(out) < 0) { vs = vs.slice().reverse(); n.negate(); }
    n.normalize();
    const o = this.pos.length / 3;
    for (const v of vs) { this.pos.push(v.x, v.y, v.z); this.nrm.push(n.x, n.y, n.z); this.part.push(part); this.glow.push(glow); }
    for (let k = 1; k + 1 < vs.length; k++) this.idx.push(o, o + k, o + k + 1);
  }
  // a 2-D profile (pts in the plane of ax, ay; may be concave) swept straight along az from z0 to z1: a face on each of
  // its edges (glowEdges: those that glow - parts[i] picks each edge's finish, else `part`), the ends capped
  prism(pts, ax, ay, az, z0, z1, part, { parts = null, glowEdges = [], caps = true } = {}) {
    const at = (p, z) => V(0, 0, 0).addScaledVector(ax, p[0]).addScaledVector(ay, p[1]).addScaledVector(az, z);
    const ccw = !THREE.ShapeUtils.isClockWise(pts.map(v2)), m = pts.length;
    for (let i = 0; i < m; i++) {
      const a = pts[i], b = pts[(i + 1) % m], dx = b[0] - a[0], dy = b[1] - a[1];
      const o2 = ccw ? [dy, -dx] : [-dy, dx];                   // (the edge's outward side, in the profile's plane)
      const out = V(0, 0, 0).addScaledVector(ax, o2[0]).addScaledVector(ay, o2[1]);
      this.face([at(a, z0), at(b, z0), at(b, z1), at(a, z1)], out, parts ? parts[i] : part, glowEdges.includes(i) ? 1 : 0);
    }
    if (!caps) return;
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(pts.map(v2), [])) {
      this.face([pts[i], pts[j], pts[k]].map((p) => at(p, z0)), az.clone().negate(), part);
      this.face([pts[i], pts[j], pts[k]].map((p) => at(p, z1)), az, part);
    }
  }
  // a smooth ring of n sides about the y axis, radius r0 at y0 to r1 at y1 (sides only)
  tube(r0, y0, r1, y1, n, part) {
    const o = this.pos.length / 3, slope = (r0 - r1) / (y1 - y0), nl = Math.hypot(1, slope);
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const [r, y] of [[r0, y0], [r1, y1]]) {
        this.pos.push(c * r, y, s * r); this.nrm.push(c / nl, slope / nl, s / nl); this.part.push(part); this.glow.push(0);
      }
    }
    for (let k = 0; k < n; k++) { const a = o + k * 2; this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  // a flat ring at height y facing up, from radius r0 to r1
  annulus(r0, r1, y, n, part) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      this.face([V(Math.cos(a) * r0, y, Math.sin(a) * r0), V(Math.cos(a) * r1, y, Math.sin(a) * r1),
        V(Math.cos(b) * r1, y, Math.sin(b) * r1), V(Math.cos(b) * r0, y, Math.sin(b) * r0)], V(0, 1, 0), part);
    }
  }
  // a smooth round tube along a polyline (radius r, n sides), its frame carried along without twist
  pipe(path, r, n, part) {
    let side = V(0, 0, 1);
    const o = this.pos.length / 3;
    for (let i = 0; i < path.length; i++) {
      const t = V(0, 0, 0).subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize();
      const b = V(0, 0, 0).crossVectors(t, side).normalize(), s = V(0, 0, 0).crossVectors(b, t).normalize();
      side = s;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2, d = V(0, 0, 0).addScaledVector(s, Math.cos(a)).addScaledVector(b, Math.sin(a));
        const p = path[i].clone().addScaledVector(d, r);
        this.pos.push(p.x, p.y, p.z); this.nrm.push(d.x, d.y, d.z); this.part.push(part); this.glow.push(0);
      }
    }
    for (let i = 0; i + 1 < path.length; i++) for (let k = 0; k < n; k++) {
      const a = o + i * (n + 1) + k, b = a + n + 1;
      this.idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('part', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---- the road stud (x across the track, y up, z backward: +z faces the ships coming): a base plate 34 x 50 cm, 5 mm
// thick, on the deck; the body 26 x 40 cm at its foot, 22 x 32 cm on top, 4.5 cm high, its ends sloped at 45 deg; in
// each slope a lens window 19 cm wide, 4 mm deep
export const STUD = { plate: 0, body: 1, pocket: 2, lens: 3 };
export function studGeometry() {
  const B = new Builder(), P = STUD, X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const px = 0.17, pz = 0.25, ph = 0.005;
  B.prism([[-pz, 0], [pz, 0], [pz, ph], [-pz, ph]], Z, Y, X, -px, px, P.plate);
  const bx = 0.13, bz = 0.2, tx = 0.11, tz = 0.16, h = 0.05, y0 = ph;
  B.face([V(-tx, h, tz), V(tx, h, tz), V(tx, h, -tz), V(-tx, h, -tz)], Y, P.body);
  for (const s of [-1, 1]) B.face([V(s * bx, y0, -bz), V(s * bx, y0, bz), V(s * tx, h, tz), V(s * tx, h, -tz)], V(s, 0.1, 0), P.body);
  for (const e of [-1, 1]) {
    // the slope at the e end: u across it (-1..1), t up it (0 at its foot); its window over u -wx..wx, t 0.18..0.82
    const at = (u, t) => V(u * bx, y0, e * bz).lerp(V(u * tx, h, e * tz), t), wx = 0.72;
    const out = V(0, 0, 0).crossVectors(X, V(0, h - y0, e * (tz - bz))).multiplyScalar(e).normalize();
    const w = [[-wx, 0.18], [wx, 0.18], [wx, 0.82], [-wx, 0.82]].map(([u, t]) => at(u, t));
    const wi = w.map((p) => p.clone().addScaledVector(out, -0.004)), mid = wi[0].clone().add(wi[2]).multiplyScalar(0.5);
    B.face([at(-1, 0), at(1, 0), at(wx, 0.18), at(-wx, 0.18)], out, P.body);
    B.face([at(-wx, 0.82), at(wx, 0.82), at(1, 1), at(-1, 1)], out, P.body);
    B.face([at(-1, 0), at(-wx, 0.18), at(-wx, 0.82), at(-1, 1)], out, P.body);
    B.face([at(wx, 0.18), at(1, 0), at(1, 1), at(wx, 0.82)], out, P.body);
    // the pocket's walls (polished, facing into it) and the lens at its floor
    for (let k = 0; k < 4; k++) {
      const a = w[k], b = w[(k + 1) % 4], c = V(0, 0, 0).addVectors(a, b).multiplyScalar(0.5).addScaledVector(out, -0.002);
      B.face([a, b, wi[(k + 1) % 4], wi[k]], V(0, 0, 0).subVectors(mid, c), P.pocket);
    }
    B.face(wi, out, P.lens, 1);
  }
  return B.geometry();
}

// ---- the lamp post (x: -x reaches out over the track; y up from the wall's top; z along the track)
export const LAMP = { plate: 0, post: 1, arm: 2, head: 3, fin: 4, reflector: 5, lens: 6 };
export function lampGeometry() {
  const B = new Builder(), P = LAMP, X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  // the base plate (44 x 44 cm, 3 cm), four gussets welded between it and the post
  B.prism([[-0.22, 0], [0.22, 0], [0.22, 0.03], [-0.22, 0.03]], X, Y, Z, -0.22, 0.22, P.plate);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, out = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
    B.prism([[0.09, 0.03], [0.2, 0.03], [0.09, 0.2]], out, Y, side, -0.008, 0.008, P.plate);
  }
  // the post, tapered; a collar at its top, capped round the arm that rises out of it
  B.tube(0.11, 0.03, 0.075, 3.9, 16, P.post);
  B.tube(0.095, 3.86, 0.095, 4.0, 16, P.arm);
  B.annulus(0.04, 0.095, 4.0, 16, P.arm);
  // the arm: up out of the collar and over toward the track in a curve, on to the head rising a little, into its end
  const path = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI / 2; path.push(V(-0.55 * (1 - Math.cos(a)), 3.95 + 0.48 * Math.sin(a), 0)); }
  path.push(V(-1.0, 4.455, 0), V(-1.3, 4.455, 0));
  B.pipe(path, 0.045, 12, P.arm);
  // the head: a chamfered housing 1 m long, open below, its diffuser 2 cm up inside the rim, reflector walls round it
  // (profile across it in z-y, swept along -x: edge 2 the diffuser, 1 and 3 the reflector walls)
  const yb = 4.38;
  const prof = [[-0.16, 0], [-0.13, 0], [-0.12, 0.02], [0.12, 0.02], [0.13, 0], [0.16, 0], [0.16, 0.08], [0.12, 0.13],
    [-0.12, 0.13], [-0.16, 0.08]].map(([z, y]) => [z, y + yb]);
  const parts = prof.map((_, i) => (i === 2 ? P.lens : i === 1 || i === 3 ? P.reflector : P.head));
  B.prism(prof, Z, Y, X, -1.95, -0.95, P.head, { parts, glowEdges: [2] });
  // the cooling fins along its top: 6 mm thick, 3 cm tall, every 12 cm
  for (let k = 0; k < 8; k++) {
    const x = -1.03 - k * 0.12;
    B.prism([[-0.12, yb + 0.13], [0.12, yb + 0.13], [0.11, yb + 0.16], [-0.11, yb + 0.16]], Z, Y, X, x - 0.003, x + 0.003, P.fin);
  }
  return B.geometry();
}

// ---- a field emitter on the wall's coping (x across the track, out from it +x; y up; z along the track): a base plate,
// a chamfered post 16 x 12 cm up past the field's top, an emitter strip down each face the field leaves from (+-z), a
// capped head with a glowing node - the energy barrier stands between them
export const PYLON = { body: 0, emit: 1, node: 2 };
export function pylonGeometry(h) {
  const B = new Builder(), P = PYLON, X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  B.prism([[-0.2, 0], [0.2, 0], [0.2, 0.03], [-0.2, 0.03]], Z, Y, X, -0.15, 0.15, P.body);
  B.prism([[-0.08, -0.04], [-0.04, -0.06], [0.04, -0.06], [0.08, -0.04], [0.08, 0.04], [0.04, 0.06], [-0.04, 0.06], [-0.08, 0.04]],
    Z, X, Y, 0.03, h, P.body);
  for (const sz of [-1, 1]) B.face([V(-0.03, 0.15, sz * 0.081), V(0.03, 0.15, sz * 0.081), V(0.03, h - 0.15, sz * 0.081), V(-0.03, h - 0.15, sz * 0.081)], V(0, 0, sz), P.emit, 1);
  B.prism([[-0.1, h], [0.1, h], [0.06, h + 0.12], [-0.06, h + 0.12]], Z, Y, X, -0.08, 0.08, P.body);
  B.prism([[-0.03, h + 0.12], [0.03, h + 0.12], [0.03, h + 0.18], [-0.03, h + 0.18]], Z, Y, X, -0.03, 0.03, P.node, { glowEdges: [0, 1, 2, 3] });
  return B.geometry();
}

// The fittings' material: a lit metal whose finish is picked per part, with its fixings drawn per pixel, and the
// lenses' glow (glow: the circuit's light colour, HDR - the bloom takes it). kind: 'stud' | 'lamp' | 'pylon' | 'vent'; time: { value }
export function fittingMaterial(kind, glow, time = { value: 0 }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.6 });
  const G = glow.map((x) => x.toFixed(3)).join(', ');
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.ftTime = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float part;\nattribute float glow;\nvarying float vPart;\nvarying float vGlow;\nvarying vec3 vFit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = part; vGlow = glow; vFit = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying float vPart;
varying float vGlow;
varying vec3 vFit;
float ftIn(float sd) { float f = max(fwidth(sd), 1e-5); return clamp(0.5 - sd / f, 0.0, 1.0); }
float ftHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p); p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
vec3 ftCol; float ftRough, ftMetal, ftEmit;
uniform float ftTime;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    int pt = int(vPart + 0.5);
    ftEmit = 0.0;
    ${kind === 'vent' ? `
    // the vent: dark steel, the plenum behind the slats black
    if (pt == 0) { ftCol = vec3(0.07, 0.075, 0.082); ftRough = 0.45; ftMetal = 0.75; } else { ftCol = vec3(0.006); ftRough = 0.9; ftMetal = 0.0; }` : kind === 'pylon' ? `
    // the field emitter: dark anodised, its strips glowing with pulses climbing them, the node at its head brighter
    if (pt == 0) { ftCol = vec3(0.06, 0.065, 0.07); ftRough = 0.35; ftMetal = 0.8; }
    else {
      ftCol = vec3(0.02); ftRough = 0.2; ftMetal = 0.0;
      float climb = pow(0.5 + 0.5 * sin(vFit.y * 3.0 - ftTime * 5.0), 6.0);
      ftEmit = pt == 1 ? (1.2 + 2.5 * climb) * vGlow : 6.0 * vGlow;
    }` : kind === 'stud' ? `
    // the stud: a dark galvanised base plate with a hex bolt in each corner, the body cast aluminium, the pocket
    // polished, the lens three LEDs behind a clear cover
    if (pt == 0) {
      ftCol = vec3(0.10, 0.105, 0.11); ftRough = 0.6; ftMetal = 0.7;
      float bolt = ftIn(ftHex(abs(vFit.xz) - vec2(0.15, 0.225), 0.011)) * step(0.004, vFit.y);
      ftCol = mix(ftCol, vec3(0.32, 0.33, 0.34), bolt); ftRough = mix(ftRough, 0.35, bolt);
    } else if (pt == 1) { ftCol = vec3(0.42, 0.43, 0.45); ftRough = 0.45; ftMetal = 0.85; }
    else if (pt == 2) { ftCol = vec3(0.8, 0.8, 0.82); ftRough = 0.15; ftMetal = 1.0; }
    else {
      ftCol = vec3(0.02); ftRough = 0.1; ftMetal = 0.0;
      float led = 0.0;
      for (int k = -1; k <= 1; k++) led = max(led, exp(-pow((vFit.x - float(k) * 0.05) / 0.018, 2.0)));
      ftEmit = (0.8 + 1.8 * led) * vGlow;
    }` : `
    // the lamp: base and post painted dark (a service door in the post, facing away from the track), the arm and the
    // head anodised, the fins bare aluminium, the reflector polished; the diffuser a 2 x 8 grid of LED cells, hot
    // cores in dark rims
    if (pt == 0 || pt == 1) {
      ftCol = vec3(0.16, 0.17, 0.18); ftRough = 0.55; ftMetal = 0.5;
      if (pt == 0) {
        float bolt = ftIn(ftHex(abs(vFit.xz) - vec2(0.17), 0.016)) * step(0.029, vFit.y);
        ftCol = mix(ftCol, vec3(0.34, 0.35, 0.36), bolt); ftRough = mix(ftRough, 0.35, bolt);
      } else {
        vec2 d = vec2(atan(vFit.z, vFit.x) * length(vFit.xz), vFit.y - 0.75);
        float gap = abs(max(abs(d.x) - 0.07, abs(d.y) - 0.25)) - 0.003, lock = length(d - vec2(0.0, 0.12)) - 0.01;
        ftCol *= 1.0 - 0.8 * max(ftIn(gap), ftIn(lock));
      }
    } else if (pt == 2 || pt == 3) { ftCol = vec3(0.07, 0.075, 0.08); ftRough = 0.35; ftMetal = 0.8; }
    else if (pt == 4) { ftCol = vec3(0.45, 0.46, 0.48); ftRough = 0.4; ftMetal = 0.9; }
    else if (pt == 5) { ftCol = vec3(0.85, 0.85, 0.86); ftRough = 0.12; ftMetal = 1.0; }
    else {
      ftCol = vec3(0.03); ftRough = 0.2; ftMetal = 0.0;
      vec2 c = vec2((fract((vFit.x + 0.95) / 0.125) - 0.5) * 0.125, (fract((vFit.z + 0.12) / 0.12) - 0.5) * 0.12);
      ftEmit = (0.55 + 2.6 * exp(-dot(c, c) / (0.022 * 0.022))) * vGlow;
    }`}
    diffuseColor.rgb = ftCol;
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = ftRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = ftMetal;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(${G}) * ftEmit;`);
  };
  mat.customProgramCacheKey = () => 'fitting-' + kind + '-' + G;
  return mat;
}

// ---- the boost pad (x across the track, y up from the deck, z backward: the ships run toward -z), 8 x 16 m inside:
// a steel frame set on the deck (a chamfered rim 3 cm proud, 24 cm wide, its long inner walls a light strip) round a
// bed of dark glass 8 mm up, a light rail 55 cm high along each long edge (arrows racing forward on its slope), a matrix of LED cells under it lit in chevrons pointing the way to go ("make the boost
// pads better looking too": they were a flat glowing decal with sheets of light standing on their edges)
export const PAD = { frame: 0, strip: 1, bed: 2, rail: 3 };
export function padGeometry() {
  const B = new Builder(), P = PAD, Y = V(0, 1, 0), A = 4, L = 8;
  // the frame: its profile (o out from the inner edge, y) swept round the rectangle, mitred at the corners
  const prof = [[0, 0.008], [0, 0.02], [0.025, 0.03], [0.16, 0.03], [0.24, -0.001]];
  const sides = [[V(1, 0, 0), (o) => [V(A + o, 0, -L - o), V(A + o, 0, L + o)], true], [V(-1, 0, 0), (o) => [V(-A - o, 0, L + o), V(-A - o, 0, -L - o)], true],
    [V(0, 0, 1), (o) => [V(A + o, 0, L + o), V(-A - o, 0, L + o)], false], [V(0, 0, -1), (o) => [V(-A - o, 0, -L - o), V(A + o, 0, -L - o)], false]];
  for (const [d, ends, long] of sides) {
    for (let i = 0; i + 1 < prof.length; i++) {
      const [o0, y0] = prof[i], [o1, y1] = prof[i + 1];
      const [a0, b0] = ends(o0), [a1, b1] = ends(o1);
      const out = d.clone().multiplyScalar(-(y1 - y0)).addScaledVector(Y, o1 - o0);     // (the profile edge's side)
      const strip = i === 0 && long;
      B.face([a0.clone().setY(y0), b0.clone().setY(y0), b1.clone().setY(y1), a1.clone().setY(y1)], out, strip ? P.strip : P.frame, strip ? 1 : 0);
    }
  }
  B.face([V(-A, 0.008, L), V(A, 0.008, L), V(A, 0.008, -L), V(-A, 0.008, -L)], Y, P.bed, 1);
  // the light rails: a wedge 55 cm high along each long edge (under the ships' 1.35 m), its slope lit with arrows
  for (const sx of [-1, 1]) {
    const prof = [[sx * A, 0.008], [sx * A, 0.55], [sx * (A - 0.15), 0.55], [sx * (A - 0.6), 0.008]];
    const parts = [P.frame, P.frame, P.rail, P.frame];
    B.prism(prof, V(1, 0, 0), Y, V(0, 0, 1), -L + 0.4, L - 0.4, P.frame, { parts, glowEdges: [2] });   // (prism turns each face out)
  }
  return B.geometry();
}

// its material: the frame dark anodised steel (a screw every metre along the rim's top), the strip and the LEDs in
// colour (HDR - the bloom takes them); the bed dark glass, mirror-smooth. The LEDs: 12 cm cells, each a rounded
// 8 cm square, lit where the cell's centre falls in a chevron (60 cm deep, every 2 m, arms swept back) - a light running
// through the chevrons the way to go, all of them flaring when a ship takes the pad (instance attribute flash); finer
// than the pixels far off, the matrix fades to its average. time: { value } (track.js update)
export function padMaterial(time, colour = [1.0, 0.42, 0.05]) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const C = colour.map((x) => x.toFixed(3)).join(', ');
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.padTime = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float part;\nattribute float flash;\nvarying float vPart;\nvarying float vFlash;\nvarying vec3 vFit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = part; vFlash = flash; vFit = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float padTime;
varying float vPart;
varying float vFlash;
varying vec3 vFit;
float pdIn(float sd, float f) { return clamp(0.5 - sd / max(f, 1e-5), 0.0, 1.0); }
vec3 pdCol; float pdRough, pdMetal; vec3 pdEmit;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    int pt = int(vPart + 0.5);
    vec3 C = vec3(${C});
    pdEmit = vec3(0.0);
    if (pt == 0) {
      // (the frame: a screw every metre along the middle of the rim's top)
      pdCol = vec3(0.055, 0.058, 0.064); pdRough = 0.35; pdMetal = 0.8;
      vec2 a = abs(vFit.xz);
      float along = a.x > 4.0 && a.y < 8.0 ? vFit.z : vFit.x, off = a.x > 4.0 && a.y < 8.0 ? a.x - 4.09 : a.y - 8.09;   // (a: |x|, |z|)
      vec2 q = vec2((fract(along) - 0.5), off);
      float f = fwidth(along), head = pdIn(length(q) - 0.011, f) * step(0.028, vFit.y) * (1.0 - smoothstep(0.004, 0.01, f));
      pdCol = mix(pdCol, vec3(0.3, 0.31, 0.32), head);
    } else if (pt == 1) {
      pdCol = vec3(0.02); pdRough = 0.2; pdMetal = 0.0;
      pdEmit = C * (2.2 + 4.0 * vFlash);
    } else if (pt == 3) {
      // (the rails: arrows running forward along their slopes - 1.2 m apart, racing at 16 m/s)
      pdCol = vec3(0.02); pdRough = 0.15; pdMetal = 0.0;
      float s = clamp(vFit.y / 0.55, 0.0, 1.0), t = -vFit.z - 0.7 * abs(s - 0.5) - padTime * 16.0;
      float f = fwidth(t), arrow = smoothstep(0.0, f * 1.5, fract(t / 1.2) * 1.2) * (1.0 - smoothstep(0.42 - f * 1.5, 0.42, fract(t / 1.2) * 1.2));
      arrow = mix(arrow, 0.35, smoothstep(0.1, 0.3, f));
      pdEmit = C * (0.9 + 5.5 * arrow + 5.0 * vFlash);
    } else {
      pdCol = vec3(0.012, 0.012, 0.014); pdRough = 0.05; pdMetal = 0.0;
      vec2 p = vec2(vFit.x, -vFit.z), cell = (floor(p / 0.12) + 0.5) * 0.12, d = abs(p - cell) - 0.03;
      float led = pdIn(length(max(d, 0.0)) - 0.01, fwidth(p.x) * 1.2);
      // (the cell's chevron: r runs along the chevrons, the arms swept back 0.45 m a metre out)
      float r = cell.y + 0.45 * abs(cell.x) + 8.0, row = floor(r / 2.0), q = r - row * 2.0;
      float on = step(q, 0.6) * step(abs(cell.x), 3.7) * step(abs(cell.y), 7.7);
      float run = pow(1.0 - fract(row / 8.0 - padTime * 1.6), 2.5);
      led = mix(led, 0.44, smoothstep(0.03, 0.08, fwidth(p.x)));
      pdEmit = C * led * on * (2.0 + 3.0 * run + 5.0 * vFlash) + C * 0.004;
    }
    diffuseColor.rgb = pdCol;
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = pdRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = pdMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += pdEmit;');
  };
  mat.customProgramCacheKey = () => 'fitting-pad-' + C;
  return mat;
}

// ---- a pilaster down the track's outer side (x out from the face, y up from the deck's top, z along): 50 cm wide at
// the face, 40 cm at its front, 30 cm proud, from 25 cm under the deck's underside up to the coping - the structure's
// depth ("the outside of the road still looks without depth, only like a paint over"); bands and pipes run into it
export function pilasterGeometry(top) {
  const B = new Builder();
  B.prism([[-0.25, 0], [0.25, 0], [0.2, 0.3], [-0.2, 0.3]], V(0, 0, 1), V(1, 0, 0), V(0, 1, 0), -2.05, top, 0);
  // its foot tapered back under the deck
  B.prism([[-0.2, 0], [0.2, 0], [0.2, 0.3], [-0.2, 0.1]], V(0, 0, 1), V(1, 0, 0), V(0, 1, 0), -2.2, -2.05, 0, { caps: true });
  return B.geometry();
}

// ---- a louvred vent box on the wall's outer face (x out, y up, z along; centred): 2.6 m x 42 cm, a frame 8 cm deep
// round six slats tilted down 35 deg, a dark plenum behind them
export function ventGeometry() {
  const B = new Builder(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1), L = 1.3, H = 0.21, D = 0.08, t = 0.035;
  B.face([V(0.004, -H, -L), V(0.004, -H, L), V(0.004, H, L), V(0.004, H, -L)], X, 1);   // (the plenum's back)
  B.prism([[-L, H - t], [L, H - t], [L, H], [-L, H]], Z, Y, X, 0, D, 0);
  B.prism([[-L, -H], [L, -H], [L, -H + t], [-L, -H + t]], Z, Y, X, 0, D, 0);
  B.prism([[-L, -H + t], [-L + t, -H + t], [-L + t, H - t], [-L, H - t]], Z, Y, X, 0, D, 0);
  B.prism([[L - t, -H + t], [L, -H + t], [L, H - t], [L - t, H - t]], Z, Y, X, 0, D, 0);
  for (let k = 0; k < 6; k++) {
    const y = -H + t + (k + 0.5) * ((2 * H - 2 * t) / 6), c = Math.cos(0.61), s = Math.sin(0.61), w = 0.05, th = 0.006;
    const prof = [[-w * c, y + w * s], [w * c, y - w * s], [w * c + th * s, y - w * s + th * c], [-w * c + th * s, y + w * s + th * c]]
      .map(([x0, y0]) => [x0 + D * 0.5, y0]);
    B.prism(prof, X, Y, Z, -L + t, L - t, 0);
  }
  return B.geometry();
}
