// The Pyramid Run's ancient works: the ruins of a desert civilisation round the great pyramid - temple gateways (pylons),
// halls of papyrus columns, obelisks, mastabas, stepped pyramids, enclosure walls, seated colossi and an avenue of
// sphinxes up to the gate - half fallen, sunk in the sand, sand lying on every ledge and drifted up their feet; the
// obstacles' fallen obelisks and broken columns; and the pyramid's root under the sand (the tunnel: a hall of colossal
// columns, stone monoliths turning in the vault, sand pouring from cracks in it, a river of light along its crown).
// Lit by the sun and the sky alone (look.js sunOnly) out on the sand; down in the tunnel by the cave's own light.
import * as THREE from 'three';
import { Q } from './quality.js';
import { sunOnly } from './look.js';
import { mulberry32 } from './noise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EG_N = /* glsl */`
float egH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float egN3(vec3 x) {
  vec3 i = floor(x), u = fract(x); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(mix(egH3(i), egH3(i + vec3(1, 0, 0)), u.x), mix(egH3(i + vec3(0, 1, 0)), egH3(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(egH3(i + vec3(0, 0, 1)), egH3(i + vec3(1, 0, 1)), u.x), mix(egH3(i + vec3(0, 1, 1)), egH3(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
float egF(vec3 p) { return egN3(p) * 0.55 + egN3(p * 2.03 + 7.1) * 0.3 + egN3(p * 4.1 + 3.3) * 0.15; }`;

// The stone. Every vertex carries 'eg' (kind, random): 0 the sandstone, 1 gilding (an obelisk's cap), 2 a doorway's dark,
// 3 sand (the drifts heaped against the walls).
// Sandstone in courses (the blocks' seams, a course every ~1.4 m, a joint now and then along it), its tone varying block
// to block and piece to piece, weathered: pitted, stained, streaked dark down from the ledges; sand lying wherever a face
// looks up (up: away from the planet's centre - centre, R) and drifted up the walls from the dunes; the gilding worn.
// cave: the tunnel's (no dunes; dust instead of sand; the light its own).
// bake: 'vertex' (attribute bake: the light baked in, irradiance) or 'instance' (attribute bakeI, an obstacle's own)
export function egyptMaterial({ centre, R, cave = false, key = 'egypt', bake = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.egC = { value: centre || new THREE.Vector3() };
    sh.uniforms.egR = { value: R || 0 };
    const def = (cave ? '#define EG_CAVE\n' : '') + (Q.lite ? '#define EG_LITE\n' : '') + (bake === 'vertex' ? '#define EG_BAKE\n' : bake === 'instance' ? '#define EG_BAKEI\n' : '');
    sh.vertexShader = def + sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 eg; varying vec2 vEg; varying vec3 vRW; varying vec3 vRN; varying vec3 vBake;
#ifdef EG_BAKE
  attribute vec3 bake;
#endif
#ifdef EG_BAKEI
  attribute vec3 bakeI;
#endif`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  {
    vec4 rp = vec4(transformed, 1.0); vec3 rn = objectNormal;
    #ifdef USE_INSTANCING
      rp = instanceMatrix * rp; rn = mat3(instanceMatrix) * rn;
    #endif
    vRW = (modelMatrix * rp).xyz; vRN = normalize(mat3(modelMatrix) * rn); vEg = eg;
    vBake = vec3(0.0);
    #ifdef EG_BAKE
      vBake = bake;
    #endif
    #ifdef EG_BAKEI
      vBake = bakeI;
    #endif
  }`);
    sh.fragmentShader = def + sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec3 egC; uniform float egR;
varying vec2 vEg; varying vec3 vRW; varying vec3 vRN; varying vec3 vBake;
${EG_N}
float egSand = 0.0, egGold = 0.0;
vec3 egAmb = vec3(0.0);`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float kind = floor(vEg.x + 0.5), rnd = vEg.y;
    vec3 up = normalize(vRW - egC), rn = normalize(vRN);
    float hgt = length(vRW - egC) - egR;
    // courses: along the planet's up, a seam every 1.4 m; joints along each course, staggered
    float cy = hgt / 1.4, ci = floor(cy), cf = fract(cy);
    vec3 side = normalize(cross(up, abs(rn.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    float along = dot(vRW, normalize(cross(up, rn) + 1e-4)) / 2.3 + ci * 0.5;
    float aw = fwidth(cy) + 1e-4, jw = fwidth(along) + 1e-4;
    float seam = (1.0 - smoothstep(0.0, 0.06 + aw, cf) * smoothstep(1.0, 0.94 - aw, cf));
    float joint = 1.0 - smoothstep(0.0, 0.05 + jw, fract(along)) * smoothstep(1.0, 0.95 - jw, fract(along));
    float faceUp = dot(rn, up);
    float vert = 1.0 - smoothstep(0.55, 0.8, abs(faceUp));                         // (seams only on the walls)
    float far = smoothstep(0.15, 0.5, aw);
    float blockId = egH3(vec3(floor(along), ci, rnd * 37.0));
    float w1 = egF(vRW * 0.09), w2 = egN3(vRW * 0.7), w3 = egN3(vRW * 3.1);
    // the stone's tone: pale cream to honey, block by block and piece by piece; darker, browner where weathered
    vec3 stone = mix(vec3(0.6, 0.47, 0.31), vec3(0.78, 0.64, 0.45), clamp(0.35 * blockId + 0.45 * w1 + 0.3 * rnd, 0.0, 1.0));
    stone *= 0.82 + 0.22 * w2 + 0.08 * w3;
    // streaks down the walls from the ledges (water once, wind now), pits
    float streak = egN3(vec3(dot(vRW, side) * 0.35, hgt * 0.02, rnd * 9.0));
    stone *= 1.0 - 0.22 * smoothstep(0.55, 0.85, streak) * vert;
    stone *= 1.0 - 0.25 * smoothstep(0.72, 0.9, w3) * (1.0 - far);
    #ifndef EG_LITE
      stone *= 1.0 - 0.42 * max(seam, joint * vert) * vert * (1.0 - far);
    #endif
    vec3 c = stone;
    if (kind > 0.5 && kind < 1.5) {                                                // gilding, worn to the stone in places
      float worn = smoothstep(0.45, 0.7, egF(vRW * 0.6 + 3.0));
      egGold = 1.0 - worn;
      c = mix(vec3(1.0, 0.72, 0.3), stone, worn);
    } else if (kind > 1.5 && kind < 2.5) {
      c = vec3(0.04, 0.03, 0.025);                                                 // a doorway's dark
    }
    #ifdef EG_CAVE
      // the root's stone: older, darker, dust on the ledges
      c *= vec3(0.62, 0.55, 0.5);
      egSand = 0.45 * smoothstep(0.6, 0.9, faceUp + (w2 - 0.5) * 0.4);
      diffuseColor.rgb = mix(c, vec3(0.42, 0.33, 0.22), egSand);
    #else
      // sand: on every face that looks up, drifted up the walls from the dunes (deep against them, thinning up),
      // and the stone sand-blasted pale low down
      float lie = smoothstep(0.45, 0.78, faceUp + (w2 - 0.5) * 0.45);
      float drift = smoothstep(9.0 + 10.0 * w1, 0.0, hgt) * (0.65 + 0.35 * w2);
      egSand = max(max(lie, drift), step(2.5, kind));                             // (3: a drift heaped against it)
      c = mix(c, c * vec3(1.12, 1.06, 0.98), smoothstep(30.0, 0.0, hgt) * 0.5);
      // the light on whatever the sun misses: the sky (thick, dusty, bright) from above, the sunlit sand from below;
      // out in space only a little from the planet and the stars
      float skyK = smoothstep(4000.0, 600.0, hgt), hu = dot(rn, up);
      egAmb = mix(vec3(0.95, 0.62, 0.36) * 0.95, vec3(1.0, 0.8, 0.62) * 1.35, 0.5 + 0.5 * hu) * skyK + vec3(0.07, 0.07, 0.09) * (1.0 - skyK);
      vec3 sandC = mix(vec3(0.74, 0.47, 0.24), vec3(0.86, 0.6, 0.34), w2);        // (the dunes' own)
      diffuseColor.rgb = mix(c, sandC, egSand);
    #endif
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(0.9, 0.35, egGold), 0.97, egSand);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = egGold * 0.85;')
      .replace('#include <lights_fragment_end>', 'irradiance += egAmb;\n#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse += vBake * BRDF_Lambert( material.diffuseColor );'
        // (a live lamp's shadow on baked light: it takes away at most 80 % of what the bake put there - the bake is per
        // vertex, its lamp's per pixel: next to a fire it took more than there was, a black wedge down the column under
        // each bracket - and no shine: the bake has none)
        + (bake === 'vertex' && cave ? '\n  reflectedLight.directDiffuse = max( reflectedLight.directDiffuse, -0.8 * vBake * BRDF_Lambert( material.diffuseColor ) );\n  reflectedLight.directSpecular = max( reflectedLight.directSpecular, vec3( 0.0 ) );' : ''));
    if (bake === 'vertex' && cave) sh.fragmentShader = bakedShadowsOnly(sh.fragmentShader);
    if (!cave) sh.fragmentShader = sunOnly(sh.fragmentShader);
  };
  mat.customProgramCacheKey = () => `egypt-${key}-${cave}-${bake}-${Q.lite}`;
  return mat;
}

// A baked surface's lights: the shadow-casting point lights (the world's live lamps, set on fixtures whose light is
// baked in) take only their shadow away - their light is in the bake already. (three sorts the shadow casters first.)
// With the shadow maps off the live lamps must be dark (their light would count twice).
export function bakedShadowsOnly(fs) {
  const C = THREE.ShaderChunk.lights_fragment_begin, a = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ]';
  const i = C.indexOf(a), j = C.indexOf(': 1.0;', i);
  if (i < 0 || j < 0) throw new Error('lights chunk changed: baked shadows not applied');
  const mod = C.slice(0, i) + 'directLight.color *= -1.0 + ( ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ]' + C.slice(i + a.length, j) + ': 1.0 );' + C.slice(j + 6);
  return fs.replace('#include <lights_fragment_begin>', mod);
}

// ---------------------------------------------------------------------------------------------------- the pieces
// A builder: primitives (position + normal + eg), each placed by a matrix, merged at the end.
class Pieces {
  constructor(rnd) { this.list = []; this.rnd = rnd; this.feet = []; }
  add(g, M, kind = 0) {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (M) g.applyMatrix4(M);
    // (its feet: the points of its underside, if it stands on the ground - groundCheck)
    const pa = g.attributes.position;
    let lo = Infinity;
    for (let i = 0; i < pa.count; i++) lo = Math.min(lo, pa.getY(i));
    if (lo < 0.5) {
      const feet = [];
      for (let i = 0; i < pa.count && feet.length < 24; i++) if (pa.getY(i) < lo + 0.05) feet.push(new THREE.Vector3(pa.getX(i), pa.getY(i), pa.getZ(i)));
      this.feet.push(feet);
    }
    const n = g.attributes.position.count, e = new Float32Array(n * 2), r = this.rnd();
    for (let i = 0; i < n; i++) { e[i * 2] = kind; e[i * 2 + 1] = r; }
    g.setAttribute('eg', new THREE.BufferAttribute(e, 2));
    this.list.push(g);
    return g;
  }
  merged() { return this.list.length ? mergeGeometries(this.list) : null; }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  _m.clone().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

// a box w x h x d standing on y = 0, its top scaled by (tx, tz) (a batter: Egyptian walls lean in)
function batter(w, h, d, tx = 1, tz = 1) {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h / 2) { p.setX(i, p.getX(i) * tx); p.setZ(i, p.getZ(i) * tz); }
  g.computeVertexNormals();
  return g;
}
// a column's bell capital (a lathe), a drum
const bell = (r0, r1, h) => new THREE.LatheGeometry(
  Array.from({ length: 7 }, (_, i) => { const t = i / 6; return new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 1.8), t * h); }), 14);
const drum = (r0, r1, h, seg = 14, rings = 1) => new THREE.CylinderGeometry(r1, r0, h, seg, rings).translate(0, h / 2, 0);

// rubble: chunks of the fallen stone strewn round a point (r: the spread, s: the chunks' size)
function rubble(P, n, r, s, rnd, y = 0) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, d = r * Math.sqrt(rnd()), k = s * (0.4 + rnd());
    P.add(rnd() < 0.5 ? new THREE.BoxGeometry(k, k * 0.6, k * (0.8 + rnd())) : new THREE.TetrahedronGeometry(k * 0.7),
      at(Math.cos(a) * d, y + k * 0.15, Math.sin(a) * d, rnd() * 3, rnd() * 6, rnd() * 3));
  }
}

// a drift of sand heaped against a wall: a flattened half dome, rx by rz, h high
export function drift(P, x, z, rx, rz, h, rot = 0) {
  P.add(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), at(x, -h * 0.15, z, 0, rot, 0, rx, h, rz), 3);
}

// A papyrus column of height H (radius ~H/11): base, shaft, bands, bell capital, abacus. broken 0..1: snapped there
// (no capital), its top chunks strewn round its foot. rings: the shaft's rows of vertices (a light baked per vertex
// needs them: a fire beside it lights a patch)
export function column(P, x, z, H, rnd, broken = 1, y = 0, rings = 1) {
  const r = H / 11;
  P.add(drum(r * 1.35, r * 1.3, H * 0.04, 16), at(x, y, z));
  const top = H * Math.max(0.12, Math.min(1, broken));
  if (broken >= 1) {
    P.add(drum(r, r * 0.9, H * 0.74, 14, rings), at(x, y + H * 0.04, z));
    for (let b = 0; b < 3; b++) P.add(drum(r * 0.95, r * 0.95, H * 0.012, 14), at(x, y + H * (0.68 + b * 0.025), z));
    P.add(bell(r * 0.9, r * 1.75, H * 0.17), at(x, y + H * 0.78, z));
    P.add(new THREE.BoxGeometry(r * 3.1, H * 0.05, r * 3.1).translate(0, H * 0.025, 0), at(x, y + H * 0.95, z));
  } else {
    // snapped: the stump, its top a jagged stack of drum pieces
    P.add(drum(r, r * (1 - 0.1 * top / H), top, 14, Math.max(1, Math.round(rings * top / (0.74 * H)))), at(x, y + H * 0.04, z));
    P.add(drum(r * 0.92, r * 0.7, r * 0.6, 7), at(x + r * 0.15, y + H * 0.04 + top, z, rnd() * 0.3, rnd() * 3, rnd() * 0.3));
    rubble(P, 3 + Math.floor(rnd() * 4), r * 4, r * 0.9, rnd, y);
    if (rnd() < 0.5) {                                                       // its upper drums lying where they fell
      const a = rnd() * 6.283;
      for (let k = 0; k < 3; k++) P.add(drum(r * 0.95, r * 0.95, H * 0.16, 14), at(x + Math.cos(a) * (r * 3 + k * H * 0.17), y + r * 0.95, z + Math.sin(a) * (r * 3 + k * H * 0.17), Math.PI / 2, 0, a + Math.PI / 2 + (rnd() - 0.5) * 0.4));
    }
  }
}

// A temple gateway: two battered towers (a cavetto cornice, a torus moulding at their edges) and the portal between,
// H high. One tower often broken down, its top a ragged stack, its blocks round its foot.
export function pylon(P, H, rnd) {
  const w = H * 0.46, d = H * 0.2, gap = H * 0.16;
  for (const sd of [-1, 1]) {
    const brk = rnd() < 0.55 ? 0.45 + rnd() * 0.4 : 1, h = H * brk, cx = sd * (gap / 2 + w / 2);
    P.add(batter(w, h, d, 1 - 0.24 * brk, 1 - 0.3 * brk), at(cx, 0, 0));
    if (brk >= 1) P.add(batter(w * 0.74, H * 0.06, d * 0.68, 1.12, 1.25), at(cx, H, 0));     // the cornice, flaring
    else {
      for (let k = 0; k < 4; k++) {                                            // the broken top: courses stepping back
        const kw = w * (0.7 - k * 0.14) * (0.8 + rnd() * 0.4);
        P.add(new THREE.BoxGeometry(kw, H * 0.035, d * (0.6 - k * 0.1)).translate(0, H * 0.0175, 0), at(cx + (rnd() - 0.5) * w * 0.3, h + k * H * 0.034, 0));
      }
      rubble(P, 10, w * 0.8, H * 0.03, rnd);
    }
  }
  // the portal: jambs, lintel and cornice, half the towers' height
  P.add(new THREE.BoxGeometry(gap * 0.22, H * 0.42, d * 0.7).translate(0, H * 0.21, 0), at(-gap * 0.39, 0, 0));
  P.add(new THREE.BoxGeometry(gap * 0.22, H * 0.42, d * 0.7).translate(0, H * 0.21, 0), at(gap * 0.39, 0, 0));
  if (rnd() < 0.7) P.add(batter(gap * 1.1, H * 0.07, d * 0.72, 1.06, 1.1), at(0, H * 0.42, 0));
  P.add(new THREE.BoxGeometry(gap * 0.56, H * 0.36, d * 0.5).translate(0, H * 0.18, 0), at(0, 0, d * 0.12), 2);     // the doorway
}

// A hall of columns: rows x cols of papyrus columns H high on a platform, the roof slabs long gone but for a few
// architraves over standing pairs; a third broken, some fallen
export function hall(P, rows, cols, H, rnd) {
  const sp = H * 0.32, W = (cols - 1) * sp, D = (rows - 1) * sp;
  P.add(batter(W + sp * 1.4, H * 0.05, D + sp * 1.4, 0.98, 0.98), at(0, 0, 0));
  const up = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const x = -W / 2 + j * sp, z = -D / 2 + i * sp, r = rnd(), b = r < 0.62 ? 1 : 0.15 + rnd() * 0.65;
    column(P, x, z, H, rnd, b, H * 0.05);
    up.push(b >= 1);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols - 1; j++) {
    if (up[i * cols + j] && up[i * cols + j + 1] && rnd() < 0.6)
      P.add(new THREE.BoxGeometry(sp * 1.12, H * 0.07, H * 0.12).translate(0, H * 0.035, 0), at(-W / 2 + (j + 0.5) * sp, H * 1.05, -D / 2 + i * sp));
  }
}

// An obelisk H high (a tapering shaft, the gilded pyramidion); lean: its tilt (rad)
export function obelisk(P, x, z, H, rnd, lean = 0) {
  const b = H * 0.1, la = rnd() * 6.283, M = at(x, 0, z, lean * Math.cos(la), rnd() * 6.283, lean * Math.sin(la));
  P.add(batter(b * 1.5, b * 0.35, b * 1.5, 0.9, 0.9), at(x, 0, z));
  const shaft = batter(b, H * 0.9, b, 0.66, 0.66);
  P.add(shaft, M);
  const cap = new THREE.ConeGeometry(b * 0.66 * 0.7071, H * 0.1, 4, 1).rotateY(Math.PI / 4).translate(0, H * 0.95, 0);
  P.add(cap, M, 1);
}

// A mastaba: a long flat-topped tomb, battered walls, a false door; chunks gone from its edges
export function mastaba(P, w, d, h, rnd) {
  P.add(batter(w, h, d, 0.82, 0.8), at(0, 0, 0));
  P.add(new THREE.BoxGeometry(w * 0.12, h * 0.55, d * 0.06).translate(0, h * 0.275, 0), at(0, 0, d * 0.5 - d * 0.06), 2);
  rubble(P, 6, w * 0.6, h * 0.12, rnd);
}

// A stepped pyramid of n steps on a base B, its upper steps fallen in
export function stepped(P, B, n, rnd) {
  const h = B * 0.11, keep = n - Math.floor(rnd() * 3);
  for (let i = 0; i < keep; i++) {
    const s = B * (1 - i / (n + 0.6));
    P.add(batter(s, h, s, 0.96, 0.96), at((rnd() - 0.5) * B * 0.01, i * h, (rnd() - 0.5) * B * 0.01));
  }
  rubble(P, 8, B * 0.7, h * 0.4, rnd);
  rubble(P, 5, B * 0.25, h * 0.35, rnd, keep * h);
}

// A run of enclosure wall L long, its height ragged and broken through in places
export function wall(P, L, h, rnd) {
  for (let x = -L / 2; x < L / 2;) {
    const seg = h * (1.5 + rnd() * 3), kh = rnd() < 0.18 ? 0 : h * (0.35 + rnd() * 0.65);
    if (kh > 0) P.add(batter(seg, kh, h * 0.45, 0.98, 0.8), at(x + seg / 2, 0, 0));
    else rubble(P, 4, seg * 0.5, h * 0.25, rnd);
    x += seg;
  }
}

// A seated colossus H high on its throne against a back pillar, hands flat on its knees, the striped headcloth falling
// in lappets onto its chest; its head (or an arm) gone now and then
export function colossus(P, H, rnd) {
  const u = H / 10;
  P.add(batter(u * 4.6, u * 1.2, u * 6.0, 0.97, 0.97), at(0, 0, 0));                         // the plinth
  P.add(batter(u * 4.0, u * 3.3, u * 3.8, 0.96, 0.96), at(0, u * 1.2, -u * 0.8));            // the throne
  P.add(batter(u * 1.8, u * 8.4, u * 1.2, 0.8, 0.9), at(0, u * 1.2, -u * 2.4));             // the back pillar
  for (const sd of [-1, 1]) {
    P.add(drum(u * 0.6, u * 0.5, u * 2.9, 10), at(sd * u * 0.78, u * 1.3, u * 2.0));            // shins
    P.add(batter(u * 1.2, u * 0.45, u * 1.9, 0.9, 0.95), at(sd * u * 0.78, u * 1.2, u * 2.35));  // feet
    P.add(batter(u * 1.3, u * 1.05, u * 3.4, 0.94, 1.0), at(sd * u * 0.74, u * 4.0, u * 0.95));      // the lap: thighs, flat-topped
    if (rnd() < 0.85) {
      P.add(batter(u * 0.62, u * 0.42, u * 2.4, 0.92, 1.0), at(sd * u * 1.08, u * 5.05, u * 1.2));    // forearms on the thighs
      P.add(batter(u * 0.7, u * 0.22, u * 0.9, 0.92, 0.92), at(sd * u * 1.08, u * 5.05, u * 2.45));    // hands flat on the knees
      P.add(batter(u * 0.62, u * 2.1, u * 0.75, 0.9, 0.95), at(sd * u * 1.5, u * 5.05, -u * 0.25));   // upper arms down its sides
    }
  }
  P.add(batter(u * 2.3, u * 0.9, u * 1.6, 1.08, 1.0), at(0, u * 4.9, -u * 0.5));             // the waist
  P.add(batter(u * 2.5, u * 2.6, u * 1.5, 1.22, 0.9), at(0, u * 5.8, -u * 0.55));            // the chest, broadening up
  if (rnd() < 0.75) {
    P.add(drum(u * 0.5, u * 0.48, u * 0.6, 10), at(0, u * 8.4, -u * 0.5));                     // the neck
    P.add(batter(u * 2.4, u * 1.9, u * 1.4, 0.48, 0.72), at(0, u * 7.9, -u * 0.75));          // the headcloth over the head
    for (const sd of [-1, 1]) P.add(batter(u * 0.6, u * 1.8, u * 0.35, 1.0, 1.0), at(sd * u * 0.75, u * 6.9, u * 0.1));   // its lappets
    P.add(batter(u * 1.0, u * 1.25, u * 1.05, 0.88, 0.85), at(0, u * 8.6, -u * 0.35));         // the face
    P.add(batter(u * 0.28, u * 0.75, u * 0.28, 0.8, 0.8).rotateX(Math.PI), at(0, u * 8.75, u * 0.2));   // the beard
  } else rubble(P, 6, u * 3, u * 0.7, rnd, u * 1.2);
}

// A sphinx on its plinth, couchant, facing +z: the body of a lion (the back rounded, the haunches), paws out before it,
// the headcloth framing the face
export function sphinx(P, L, rnd) {
  const u = L / 8;
  P.add(batter(u * 3.0, u * 0.9, u * 8.8, 0.97, 0.98), at(0, 0, 0));
  P.add(drum(u * 1.05, u * 1.0, u * 4.8, 12).rotateX(Math.PI / 2), at(0, u * 1.9, -u * 3.4));          // the back
  P.add(batter(u * 2.2, u * 1.1, u * 4.8, 0.95, 0.95), at(0, u * 0.9, -u * 1.0));                         // the belly
  for (const sd of [-1, 1]) {
    P.add(new THREE.SphereGeometry(u * 0.95, 10, 6), at(sd * u * 0.55, u * 1.7, -u * 3.2, 0, 0, 0, 0.75, 0.9, 1.1));   // haunches
    P.add(batter(u * 0.6, u * 0.45, u * 2.6, 0.9, 0.95), at(sd * u * 0.62, u * 0.9, u * 2.4));             // paws
  }
  P.add(batter(u * 1.9, u * 1.9, u * 1.6, 0.85, 0.8), at(0, u * 1.2, u * 1.5));                             // the chest
  if (rnd() < 0.85) {
    P.add(batter(u * 2.0, u * 1.6, u * 1.3, 0.5, 0.75), at(0, u * 2.7, u * 1.45));                          // the headcloth
    P.add(batter(u * 0.95, u * 1.15, u * 0.9, 0.88, 0.85), at(0, u * 3.05, u * 1.75));                      // the face
  }
}

// ------------------------------------------------------------------------------------------- the obstacles' stone
// unit shapes, scaled by the obstacle's box (w across, h up, len along; standing on y = 0, along local z)
export function fallenObeliskGeometry() {
  const P = new Pieces(mulberry32(11));
  // lying along z, 1 long, 1 across and high at its foot: the shaft (tapering to 0.66), cracked across two thirds of the
  // way along - the end piece knocked a little askew - and the gilded cap at +z
  P.add(batter(1, 0.58, 1, 0.78, 0.78).rotateX(Math.PI / 2).translate(0, 0.5, -0.5), null);
  const M = at(0.03, 0, 0, 0, 0.1, 0);
  P.add(batter(0.78, 0.32, 0.78, 0.846, 0.846).rotateX(Math.PI / 2).translate(0, 0.39, 0.1), M);
  P.add(new THREE.ConeGeometry(0.33 * Math.SQRT2, 0.08, 4, 1).rotateY(Math.PI / 4).rotateX(Math.PI / 2).translate(0, 0.39, 0.46), M, 1);
  return P.merged();
}
export function brokenColumnGeometry() {
  const P = new Pieces(mulberry32(12));
  // 1 across, 1 high: the stump of a papyrus column on its base, snapped, two drums fallen against it
  P.add(drum(0.5, 0.48, 0.05, 16), null);
  P.add(drum(0.4, 0.37, 0.88, 16), at(0, 0.05, 0));
  P.add(drum(0.36, 0.3, 0.1, 8), at(0.04, 0.92, 0, 0.25, 0.4, 0.2));
  return P.merged();
}

export { Pieces, at, batter, rubble };

// ------------------------------------------------------------------------------------------------- the city
// The ruins on the sand: placed along the road from where it comes down onto the planet to the pyramid's gate - small
// works near it (walls, stumps of columns, statues, little obelisks), temples and tombs further out, huge gateways,
// halls and stepped pyramids far off - and round the pyramid's foot; an avenue of sphinxes up to the gate, a pair of
// seated colossi either side of the road, obelisks at the gate. Each sunk in the sand and a little askew, merged into
// chunks by place (the far ones culled), the ones near the road casting shadows.
// o: { centre, R (the planet), sA, sB (the road on the sand), gate (its s), keepOut(p): true where nothing may stand }
export function buildRuins(tr, o) {
  const { centre: C, R } = o, rnd = mulberry32(2718), lite = Q.lite ? 0.5 : 1;
  const placed = [], chunks = new Map(), f = {};
  const up = new THREE.Vector3(), fw = new THREE.Vector3(), rt = new THREE.Vector3(), P0 = new THREE.Vector3(), M = new THREE.Matrix4();
  const trackPts = [];
  for (let s = o.sA - 3000; s < o.sB + 1500; s += 40) { tr.frame(tr.wrap(s), f); trackPts.push(f.P.clone()); }
  const clearOfRoad = (p, r) => trackPts.every((q) => q.distanceToSquared(p) > r * r);
  // the frame on the sand at the road's s, lat across it: its foot on the surface (sunk by sink), up the planet's up
  const spot = (s, lat, rot, sink) => {
    tr.frame(tr.wrap(s), f);
    P0.copy(f.P).addScaledVector(f.R, lat);
    up.subVectors(P0, C).normalize();
    P0.copy(C).addScaledVector(up, R - sink);
    fw.copy(f.T).addScaledVector(up, -f.T.dot(up)).normalize();
    rt.crossVectors(up, fw).normalize();
    if (rot === 'road') {                                            // facing the road across it
      const d = new THREE.Vector3().subVectors(f.P, P0);
      rot = Math.atan2(d.dot(rt), d.dot(fw));
    }
    const q = new THREE.Quaternion().setFromAxisAngle(up, rot);
    const x = rt.clone().applyQuaternion(q), z = fw.clone().applyQuaternion(q);
    // a little askew: leaning, as the sand under it gave
    const tilt = new THREE.Quaternion().setFromAxisAngle(x, (rnd() - 0.5) * 0.06).multiply(new THREE.Quaternion().setFromAxisAngle(z, (rnd() - 0.5) * 0.06));
    return M.clone().makeBasis(x.applyQuaternion(tilt), up.clone().applyQuaternion(tilt), z.applyQuaternion(tilt)).setPosition(P0);
  };
  const feet = [];
  const put = (g, Mw, near, r, P = null) => {
    if (!g) return;
    // settled into the sand: a big work's foot on a small planet (its curve under a flat base, a lean across 300 m) left
    // an edge in the air - the whole work sunk until none of its feet stands over the sand (groundCheck)
    if (P && P.feet.length) {
      const pos = new THREE.Vector3().setFromMatrixPosition(Mw), down = pos.clone().sub(C).normalize(), q = new THREE.Vector3();
      let worst = -Infinity;
      for (const fs of P.feet) for (const v of fs) worst = Math.max(worst, q.copy(v).applyMatrix4(Mw).distanceTo(C) - R);
      if (worst > -0.15) Mw = Mw.clone().setPosition(pos.addScaledVector(down, -(worst + 0.25)));
      for (const fs of P.feet) feet.push(fs.map((v) => v.clone().applyMatrix4(Mw)));
    }
    g.applyMatrix4(Mw);
    const p = new THREE.Vector3().setFromMatrixPosition(Mw);
    const key = `${Math.round(p.x / 1500)},${Math.round(p.y / 1500)},${Math.round(p.z / 1500)},${near ? 1 : 0}`;
    if (!chunks.has(key)) chunks.set(key, { near, list: [] });
    chunks.get(key).list.push(g);
    placed.push([p, r]);
  };
  const free = (p, r) => !o.keepOut(p, r) && placed.every(([q, qr]) => q.distanceTo(p) > r + qr) && clearOfRoad(p, r + 64);
  // one work of a kind at a size; r: its footprint's radius
  const kinds = {
    wall: (P, sz) => { wall(P, sz, sz * 0.12, rnd); return sz * 0.55; },
    stumps: (P, sz) => { const n = 2 + Math.floor(rnd() * 5); for (let i = 0; i < n; i++) column(P, (rnd() - 0.5) * sz * 1.6, (rnd() - 0.5) * sz * 1.6, sz * (0.8 + rnd() * 0.5), rnd, rnd() < 0.3 ? 1 : 0.15 + rnd() * 0.5); return sz * 1.2; },
    obelisk: (P, sz) => { obelisk(P, 0, 0, sz, rnd, rnd() < 0.3 ? 0.05 + rnd() * 0.25 : 0); return sz * 0.15; },
    colossus: (P, sz) => { colossus(P, sz, rnd); return sz * 0.35; },
    mastaba: (P, sz) => { mastaba(P, sz, sz * (0.5 + rnd() * 0.3), sz * 0.22, rnd); return sz * 0.6; },
    hall: (P, sz) => { const rows = 2 + Math.floor(rnd() * 3), cols = 3 + Math.floor(rnd() * 4 * lite + 1); hall(P, rows, cols, sz, rnd); return sz * 0.32 * Math.max(rows, cols) * 0.6 + sz * 0.3; },
    pylon: (P, sz) => { pylon(P, sz, rnd); rubble(P, 8, sz * 0.6, sz * 0.04, rnd); return sz * 0.6; },
    stepped: (P, sz) => { stepped(P, sz, 5 + Math.floor(rnd() * 3), rnd); return sz * 0.7; },
  };
  const tryPlace = (kind, sz, s, lat, near) => {
    for (let k = 0; k < 6; k++) {
      const ss = s + (rnd() - 0.5) * 200 * k, ll = lat * (1 + (rnd() - 0.5) * 0.2 * k);
      const P = new Pieces(rnd), r = kinds[kind](P, sz);
      const Mw = spot(ss, ll, (rnd() - 0.5) * 0.6 + (rnd() < 0.5 ? 0 : Math.PI), sz * 0.015 + 1);
      const p = new THREE.Vector3().setFromMatrixPosition(Mw);
      if (free(p, r)) {
        // sand drifted against it: a few heaps round its foot
        for (let d = 0; d < 2 + Math.floor(rnd() * 3); d++) {
          const a = rnd() * 6.283, rr = r * (0.25 + rnd() * 0.35);
          drift(P, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, rr, rr * (0.6 + rnd() * 0.6), sz * (0.05 + rnd() * 0.07), rnd() * 6.283);
        }
        put(P.merged(), Mw, near, r, P); return true;
      }
    }
    return false;
  };
  const span = o.sB - o.sA;
  // near the road
  for (let i = 0; i < 120 * lite; i++) {
    const s = o.sA + rnd() * span, side = rnd() < 0.5 ? -1 : 1, kind = ['wall', 'stumps', 'obelisk', 'colossus', 'mastaba', 'stumps'][Math.floor(rnd() * 6)];
    const sz = { wall: 60 + rnd() * 80, stumps: 18 + rnd() * 14, obelisk: 22 + rnd() * 26, colossus: 22 + rnd() * 18, mastaba: 36 + rnd() * 40 }[kind];
    tryPlace(kind, sz, s, side * (110 + rnd() * 320), true);
  }
  // further out
  for (let i = 0; i < 60 * lite; i++) {
    const s = o.sA + rnd() * span, side = rnd() < 0.5 ? -1 : 1, kind = ['hall', 'pylon', 'obelisk', 'mastaba', 'stepped', 'colossus'][Math.floor(rnd() * 6)];
    const sz = { hall: 30 + rnd() * 22, pylon: 70 + rnd() * 60, obelisk: 55 + rnd() * 45, mastaba: 70 + rnd() * 60, stepped: 100 + rnd() * 80, colossus: 50 + rnd() * 35 }[kind];
    tryPlace(kind, sz, s, side * (420 + rnd() * 520), i < 24);
  }
  // far off: the giants
  // (the planet is small: from the road its horizon is ~350 m off - only what towers over it is seen beyond)
  for (let i = 0; i < 30 * lite; i++) {
    const s = o.sA - 600 + rnd() * (span + 1200), side = rnd() < 0.5 ? -1 : 1, kind = ['pylon', 'stepped', 'hall', 'obelisk', 'colossus'][Math.floor(rnd() * 5)];
    const sz = { pylon: 180 + rnd() * 120, stepped: 250 + rnd() * 170, hall: 80 + rnd() * 30, obelisk: 150 + rnd() * 80, colossus: 120 + rnd() * 80 }[kind];
    tryPlace(kind, sz, s, side * (700 + rnd() * 900), false);
  }
  // the avenue of sphinxes up to the gate, facing across the road; the colossi either side; the gate's obelisks
  for (let s = o.gate - 1300; s < o.gate - 180; s += 46) for (const sd of [-1, 1]) {
    const P = new Pieces(rnd);
    sphinx(P, 24, rnd);
    const Mw = spot(s, sd * 82, 'road', 0.8);
    put(P.merged(), Mw, true, 14, P);
  }
  for (const sd of [-1, 1]) {
    const P = new Pieces(rnd);
    colossus(P, 130, rnd);
    put(P.merged(), spot(o.gate - 720, sd * 170, Math.PI, 3), true, 60, P);       // (facing down the road, at the arrivals)
    const Q2 = new Pieces(rnd);
    obelisk(Q2, 0, 0, 95, rnd);
    put(Q2.merged(), spot(o.gate - 260, sd * 120, 0, 2), true, 12, Q2);
  }
  // the meshes, chunk by chunk
  const mat = egyptMaterial({ centre: C, R, key: 'ruins' }), meshes = [];
  for (const { near, list } of chunks.values()) {
    const g = mergeGeometries(list);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = near; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    meshes.push(m);
  }
  let tris = 0; for (const m of meshes) tris += m.geometry.attributes.position.count / 3;
  console.info(`pyramid run: ${placed.length} ruins, ${meshes.length} chunks, ${Math.round(tris / 1000)}k tris`);
  return { meshes, mat, feet };
}

// ------------------------------------------------------------------------------------------------- the root
// a brazier's fire as a light (baked into the root; the world's live lamps on the nearest the same)
export const BRAZIER = { color: new THREE.Color(1.0, 0.56, 0.24), intensity: 5200, range: 240 };
// The pyramid's root under the sand, along the bore from the shaft's foot to the crater: colossal papyrus columns down
// both walls holding the vault (wall: their distance out from the road's centre; floor, roof: the bore's there, m from
// the deck), stone monoliths turning slowly up in the vault with lines of light cut in them, thin falls of sand pouring
// from cracks in the vault past the road's edges, a river of light along the vault's crown flowing the way the race
// goes. o: { s0, s1, wall, floor, roof, crown (the vault's top over the road), centre, R }
export function buildTomb(tr, o) {
  const rnd = mulberry32(31415), f = {}, len = tr.wrap(o.s1 - o.s0), lite = Q.lite ? 0.5 : 1;
  const basis = (s, x, y) => {
    tr.frame(tr.wrap(s), f);
    return new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate()).setPosition(f.P.clone().addScaledVector(f.R, x).addScaledVector(f.U, y));
  };
  const meshes = [], mats = [];
  // the columns, chunked by 1.5 km
  const stone = egyptMaterial({ centre: o.centre, R: o.R, cave: true, key: 'tomb', bake: 'vertex' });
  const H = o.roof - o.floor, step = 90 / lite, plinths = [];
  for (let c0 = 0; c0 < len; c0 += 1500) {
    const list = [];
    for (let d = c0; d < Math.min(len, c0 + 1500); d += step) for (const sd of [-1, 1]) {
      const P = new Pieces(rnd), br = rnd() < 0.12 ? 0.3 + rnd() * 0.4 : 1;
      column(P, 0, 0, H, rnd, br, 0, 24);                                   // (its shaft a row of vertices every 3 m: the bake)
      P.add(batter(H * 0.32, H * 0.3, H * 0.32, 0.9, 0.9), at(0, -H * 0.3, 0));                  // its plinth, down into the bore's floor
      const g = P.merged();
      g.applyMatrix4(basis(o.s0 + d + (sd > 0 ? step / 2 : 0), sd * o.wall, o.floor));
      list.push(g);
      // (top: the column's height over the deck, a snapped one's stump - a brazier's bracket only on one standing over it)
      plinths.push({ s: tr.wrap(o.s0 + d + (sd > 0 ? step / 2 : 0)), x: sd * o.wall, bottom: o.floor - H * 0.3, half: H * 0.16,
        top: o.floor + (br >= 1 ? H : H * (0.04 + Math.max(0.12, br))) });
    }
    const g = mergeGeometries(list);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, stone);
    m.castShadow = m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    meshes.push(m);
  }
  // the braziers: on every third column of each side (the columns' own places: the chunks restart their spacing, so a
  // count of steps from the start drifted off them), a bracket off its inner face 8 m over the deck a metre into the
  // stone, a gilded bowl, its fire; a snapped column too short for one passes it to the next. Their places go to the
  // world (its lamps light the nearest)
  const braziers = [], bowls = [], colR = H / 11, BAR = 8.0;
  for (const sd of [-1, 1]) {
    let wait = sd > 0 ? 2 : 0;
    for (const c of plinths) {
      if (Math.sign(c.x) !== sd) continue;
      if (wait > 0) { wait--; continue; }
      if (c.top < BAR + 3) continue;
      wait = 2;
      const s = c.s, x = sd * (o.wall - colR - 4.2);
      const P = new Pieces(rnd);
      P.add(new THREE.BoxGeometry(6.2, 0.9, 1.4), at(sd * 2.7, BAR, 0));                                   // the bracket
      P.add(new THREE.BoxGeometry(0.8, 4.0, 0.9), at(sd * 4.4, BAR - 1.6, 0, 0, 0, sd * 0.5));             // its strut
      P.add(new THREE.CylinderGeometry(2.4, 1.1, 1.6, 12, 1).translate(0, 0.8, 0), at(0, BAR + 0.4, 0), 1); // the bowl
      P.add(new THREE.CylinderGeometry(2.1, 2.1, 0.3, 12, 1), at(0, BAR + 1.9, 0), 2);                     // the coals
      const g = P.merged();
      g.applyMatrix4(basis(s, x, 0));
      bowls.push(g);
      tr.frame(s, f);
      braziers.push({ s, sd, y: BAR, P: f.P.clone().addScaledVector(f.R, x).addScaledVector(f.U, 13), U: f.U.clone(),
        reach: Math.abs(x) + 5.8, strut: Math.abs(x) + 4.4 + 2.0 * Math.sin(0.5), col: colR });
    }
  }
  braziers.sort((a, b) => a.s - b.s);
  if (bowls.length) {
    const g = mergeGeometries(bowls);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, stone);
    m.castShadow = m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    meshes.push(m);
  }
  const fireMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vSeed;
      void main() { vUv = uv; vSeed = fract(instanceMatrix[3].x * 0.071 + instanceMatrix[3].z * 0.037);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying float vSeed;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float x = vUv.x - 0.5, y = vUv.y;
        // tongues of flame licking up, narrowing and breaking up as they rise
        float n = n2(vec2(x * 5.0 + vSeed * 9.0, y * 3.0 - time * 3.4)) * 0.6 + n2(vec2(x * 11.0, y * 7.0 - time * 6.0)) * 0.4;
        float w = (0.42 - 0.34 * y) * (0.7 + 0.6 * n);
        float body = smoothstep(w, w * 0.2, abs(x)) * smoothstep(1.0, 0.25, y + (n - 0.5) * 0.5) * smoothstep(0.0, 0.08, y);
        vec3 c = mix(vec3(1.0, 0.82, 0.45), vec3(1.0, 0.28, 0.04), smoothstep(0.1, 0.75, y + n * 0.25));
        gl_FragColor = vec4(c * body * 2.6, 1.0);
      }`,
  });
  const fire = new THREE.InstancedMesh(mergeGeometries([new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(Math.PI / 2)]), fireMat, Math.max(1, braziers.length));
  braziers.forEach((b, i) => {
    tr.frame(b.s, f);
    const M = new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate()).setPosition(b.P.clone().addScaledVector(b.U, -3.0));
    fire.setMatrixAt(i, M.multiply(new THREE.Matrix4().makeScale(4.2, 7.5, 4.2)));
  });
  fire.count = braziers.length; fire.frustumCulled = false; fire.renderOrder = 2;
  meshes.push(fire); mats.push(fireMat);
  // the monoliths: slabs hung in the vault, each turning on its own (the turn and a slow bob in the vertex shader)
  const monoMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float time;
      attribute vec3 bakeI;
      varying vec3 vL, vN, vSz, vBk; varying float vSeed;
      void main() {
        vBk = bakeI;
        vec3 T = instanceMatrix[3].xyz;
        float seed = fract(sin(dot(T, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float a = time * (0.12 + 0.22 * seed) * (seed > 0.5 ? 1.0 : -1.0) + seed * 6.283;
        mat3 Ry = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
        vec3 p = Ry * position;
        p.y += sin(time * 0.5 + seed * 20.0) * 0.06;
        vL = position; vSz = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (Ry * normal));
        vSeed = seed;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float time;
      varying vec3 vL, vN, vSz, vBk; varying float vSeed;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 m = vL * vSz;                                     // metres on the slab
        vec3 n = normalize(vN);
        // dark old stone, in the light baked where it hangs (the fires below, the river above)
        vec3 c = vec3(0.2, 0.17, 0.14) * (0.6 + 0.4 * h2(floor(m.xy * 0.5) + vSeed * 9.0)) * (vBk * 0.3183 + 0.004) * (0.6 + 0.4 * abs(n.y));
        // the lines cut in it: a lattice of channels on its broad faces, segments of it lit, the light running up it
        vec2 q = (abs(vL.z) > 0.49 ? m.xy : m.zy) / 2.2;
        vec2 id = floor(q), fq = fract(q);
        float onX = step(0.93, fq.x) * step(0.5, h2(id + 3.1 + vSeed)), onY = step(0.93, fq.y) * step(0.5, h2(id + 7.7 + vSeed));
        float line = max(onX, onY) * (1.0 - step(0.49, abs(vL.y)));
        float run = 0.5 + 0.5 * sin(m.y * 0.35 - time * 3.0 + vSeed * 30.0);
        vec3 glow = mix(vec3(0.25, 0.85, 1.0), vec3(1.0, 0.7, 0.3), step(0.7, vSeed)) * line * (0.4 + 1.8 * run * run);
        // its edges catch the light
        float edge = max(step(vSz.x * 0.5 - 0.25, abs(m.x)), step(vSz.y * 0.5 - 0.25, abs(m.y)));
        gl_FragColor = vec4(c + glow * 2.2 + vec3(0.5, 0.35, 0.2) * edge * 0.25, 1.0);
      }`,
  });
  const nMono = Math.floor(len / 160 * lite), mono = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), monoMat, Math.max(1, nMono));
  for (let i = 0; i < nMono; i++) {
    const d = (i + 0.5) * (len / nMono) + (rnd() - 0.5) * 60, w = 6 + rnd() * 6, hh = 26 + rnd() * 18;
    const M = basis(o.s0 + d, (rnd() - 0.5) * 70, o.crown * (0.5 + rnd() * 0.12));
    M.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, rnd() * 6.283, (rnd() - 0.5) * 0.4)));
    M.multiply(new THREE.Matrix4().makeScale(w, hh, 2.5 + rnd() * 2));
    mono.setMatrixAt(i, M);
  }
  mono.count = nMono; mono.frustumCulled = false;
  meshes.push(mono); mats.push(monoMat);
  // the sand falls: two crossed sheets each, from the roof to the floor beside the road; dust boiling where they land
  const fallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 bakeI;
      varying vec2 vUv; varying float vSeed; varying vec3 vBk;
      void main() { vUv = uv; vBk = bakeI; vSeed = fract(instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.007);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying float vSeed; varying vec3 vBk;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float x = vUv.x - 0.5, y = vUv.y;                      // y: 1 at the crack, 0 at the floor (lit by the light baked there)
        // streams of grains rushing down, the fall widening and thinning as it drops
        float w = 0.16 + 0.32 * (1.0 - y);
        float body = smoothstep(w, w * 0.25, abs(x));
        float streaks = n2(vec2(x * 40.0 + vSeed * 50.0, y * 6.0 + time * 9.0)) * 0.6 + n2(vec2(x * 90.0, y * 14.0 + time * 14.0)) * 0.4;
        float a = body * (0.45 + 0.85 * streaks) * smoothstep(1.0, 0.94, y);
        // the dust where it lands
        a += smoothstep(0.22, 0.0, y) * smoothstep(0.5, 0.0, abs(x)) * (0.55 + 0.4 * n2(vec2(x * 8.0 - time, y * 9.0 - time * 2.0)));
        vec3 c = vec3(0.9, 0.62, 0.34) * (0.55 + 0.45 * streaks) * (vBk * 0.3183 * 1.6 + 0.01);
        gl_FragColor = vec4(c * min(a, 1.0), min(a, 1.0) * 0.9);
      }`,
  });
  const nFall = Math.floor(len / 260 * lite), sheet = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const cross = mergeGeometries([sheet.clone(), sheet.clone().rotateY(Math.PI / 2)]);
  const falls = new THREE.InstancedMesh(cross, fallMat, Math.max(1, nFall));
  for (let i = 0; i < nFall; i++) {
    const d = (i + rnd()) * (len / nFall), sd = rnd() < 0.5 ? -1 : 1, x = sd * (66 + rnd() * 10);
    const M = basis(o.s0 + d, x, o.floor - 8).multiply(new THREE.Matrix4().makeScale(20 + rnd() * 14, o.roof - o.floor + 20, 20 + rnd() * 14));
    falls.setMatrixAt(i, M);
  }
  falls.count = nFall; falls.frustumCulled = false; falls.renderOrder = 2;
  meshes.push(falls); mats.push(fallMat);
  // the river of light along the crown: a strip under the vault's top, flowing the way the race goes
  const riverMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float x = vUv.x - 0.5, s = vUv.y;                     // s: metres along
        float flow = n2(vec2(x * 6.0, s * 0.02 - time * 1.6)) * 0.6 + n2(vec2(x * 14.0 + 3.0, s * 0.06 - time * 3.2)) * 0.4;
        float core = exp(-x * x * 18.0), edge = exp(-x * x * 4.0);
        float pulse = pow(0.5 + 0.5 * sin(s * 0.012 - time * 5.0), 8.0);              // bright pulses racing along
        vec3 c = mix(vec3(0.2, 0.75, 1.0), vec3(1.0, 0.75, 0.35), smoothstep(0.55, 0.85, flow));
        gl_FragColor = vec4(c * (edge * 0.25 + core * (0.6 + 1.4 * flow) + core * pulse * 3.0), 1.0);
      }`,
  });
  {
    const n = Math.ceil(len / 8), pos = [], uv = [], idx = [];
    for (let k = 0; k <= n; k++) {
      const d = (k / n) * len;
      tr.frame(tr.wrap(o.s0 + d), f);
      for (const x of [-14, 14]) {
        const p = f.P.clone().addScaledVector(f.R, x).addScaledVector(f.U, o.crown - 3);
        pos.push(p.x, p.y, p.z); uv.push(x < 0 ? 0 : 1, d);
      }
    }
    for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const river = new THREE.Mesh(g, riverMat);
    river.frustumCulled = false; river.renderOrder = 2;
    meshes.push(river); mats.push(riverMat);
  }
  // ---- the light, baked: every brazier's fire (BRAZIER: its colour and intensity, the world's live lamps the same)
  // and the river of light (points every 60 m along the crown, each its share of the line's light); per vertex the
  // irradiance on the surface's own facing (inverse square, three's reach window) and a little of it bounced from
  // everything round (no facing); looked up through a grid of 250 m cells
  const lights = [], cell = 250, grid = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  // (a fire a bowl 4.8 m across, not a point: its light on the stone a few metres off softened as from a 3 m ball)
  for (const b of braziers) lights.push({ p: b.P, c: BRAZIER.color.clone().multiplyScalar(BRAZIER.intensity), r: BRAZIER.range, soft: 9 });
  for (let d = -120; d < len + 120; d += 60) {
    tr.frame(tr.wrap(o.s0 + d), f);
    lights.push({ p: f.P.clone().addScaledVector(f.U, o.crown - 3), c: new THREE.Color(0.62, 0.72, 0.9).multiplyScalar(2800), r: 300 });
  }
  for (const l of lights) {
    const k = key(Math.floor(l.p.x / cell), Math.floor(l.p.y / cell), Math.floor(l.p.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(l);
  }
  const dv = new THREE.Vector3();
  const irradiance = (p, n, out) => {
    out[0] = out[1] = out[2] = 0;
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell), cz = Math.floor(p.z / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const list = grid.get(key(cx + a, cy + b, cz + c));
      if (list) for (const l of list) {
        dv.subVectors(l.p, p);
        const r2 = Math.max(dv.lengthSq(), 1), q = r2 / (l.r * l.r);
        if (q >= 1) continue;
        const win = (1 - q * q) ** 2, ndl = n ? Math.max(0, dv.dot(n) / Math.sqrt(r2)) : 0.5;
        const e = (ndl + 0.12) / (r2 + (l.soft || 0)) * win;
        out[0] += l.c.r * e; out[1] += l.c.g * e; out[2] += l.c.b * e;
      }
    }
    return out;
  };
  const tmp = [0, 0, 0], vp = new THREE.Vector3(), vn = new THREE.Vector3();
  const bakeGeometry = (g, M = null) => {
    const P = g.attributes.position, N = g.attributes.normal, out = new Float32Array(P.count * 3), nm = M ? new THREE.Matrix3().getNormalMatrix(M) : null;
    for (let i = 0; i < P.count; i++) {
      vp.fromBufferAttribute(P, i); vn.fromBufferAttribute(N, i);
      if (M) { vp.applyMatrix4(M); vn.applyMatrix3(nm).normalize(); }
      irradiance(vp, vn, tmp);
      out[i * 3] = tmp[0]; out[i * 3 + 1] = tmp[1]; out[i * 3 + 2] = tmp[2];
    }
    g.setAttribute('bake', new THREE.BufferAttribute(out, 3));
  };
  const bakeInstances = (mesh, name = 'bakeI') => {
    const out = new Float32Array(mesh.count * 3), M = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, M); vp.setFromMatrixPosition(M);
      irradiance(vp, null, tmp);
      out.set(tmp, i * 3);
    }
    mesh.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(out, 3));
  };
  for (const m of meshes) if (m.material === stone) bakeGeometry(m.geometry);
  bakeInstances(mono); bakeInstances(falls);
  // the deck's: a map across the road (32) by along it (every 4 m) over the root, with a margin
  const W = o.width / 2, bs0 = o.s0 - 300, blen = len + 600, rows = Math.ceil(blen / 4), cols = 32;
  const data = new Uint16Array(rows * cols * 4), up = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    tr.frame(tr.wrap(bs0 + (r / (rows - 1)) * blen), f);
    up.copy(f.U);
    for (let c = 0; c < cols; c++) {
      vp.copy(f.P).addScaledVector(f.R, -W + (c / (cols - 1)) * 2 * W).addScaledVector(f.U, 0.1);
      irradiance(vp, up, tmp);
      const o4 = (r * cols + c) * 4;
      data[o4] = THREE.DataUtils.toHalfFloat(tmp[0]); data[o4 + 1] = THREE.DataUtils.toHalfFloat(tmp[1]);
      data[o4 + 2] = THREE.DataUtils.toHalfFloat(tmp[2]); data[o4 + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const deckMap = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat, THREE.HalfFloatType);
  deckMap.magFilter = deckMap.minFilter = THREE.LinearFilter;
  deckMap.wrapS = deckMap.wrapT = THREE.ClampToEdgeWrapping;
  deckMap.needsUpdate = true;

  let tris = 0; for (const m of meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * (m.count || 1);
  console.info(`pyramid run: the root - ${meshes.length} meshes, ${nMono} monoliths, ${nFall} falls, ${lights.length} lights baked, ${Math.round(tris / 1000)}k tris`);
  return { meshes, braziers, plinths, H, wall: o.wall, floor: o.floor, irradiance, bakeGeometry, deck: { map: deckMap, s0: bs0, len: blen },
    glow: [mono, falls, meshes[meshes.length - 1], fire], update: (t) => { for (const m of mats) m.uniforms.time.value = t; } };
}

// ---------------------------------------------------------------------------------------------- the ground check
// Nothing that stands may float: every piece of the ruins that stands on the ground (its feet: buildRuins) within tol
// of the sand or under it (the planet: centre, R); every column's plinth down to the bore's floor or into it (the
// bore's oval in the road's frame: 1.2 r across, 0.8 r up from 10 m over the deck, r 96 - pyramid.js buildBore); every
// brazier's bracket into a column - one standing at its place on its side, tall enough, the bracket and its strut into
// its face. Proves first that it can fail: a work lifted 2 m, a plinth lifted 30 m, a bracket cut short, a bracket 30 m
// along from its column and a bracket on a snapped column must each be found. Returns { selfTest, floating: [...], checked }.
export function groundCheck(tr, ruins, tomb, { centre, R, tol = 0.3 } = {}) {
  const f = {}, out = [], floorY = (x) => { const r = 96, a = x / (1.2 * r); return Math.abs(a) >= 1 ? -Infinity : 10 - 0.8 * r * Math.sqrt(1 - a * a); };
  const runRuins = (list, lift = 0) => {
    const bad = [];
    list.forEach((fs, i) => {
      let worst = -Infinity, at = null;
      for (const q of fs) { const h = q.distanceTo(centre) - R + lift; if (h > worst) { worst = h; at = q; } }
      if (worst > tol) bad.push({ what: 'ruin piece', i, height: +worst.toFixed(2), at: at.toArray().map(Math.round) });
    });
    return bad;
  };
  const runPlinths = (list, lift = 0) => {
    const bad = [];
    for (const p of list) for (const dx of [-p.half, p.half]) {
      const x = p.x + dx, fy = floorY(x);
      if (fy > -Infinity && p.bottom + lift > fy + tol) { bad.push({ what: 'plinth', s: Math.round(p.s), x: Math.round(x), gap: +(p.bottom + lift - fy).toFixed(2) }); break; }
    }
    return bad;
  };
  const L = tr.length, cols = tomb.plinths;
  const runBrackets = (list, short = 0, shift = 0, snap = null) => {
    const bad = [];
    for (const b of list) {
      // its column: the nearest on its side, within a fifth of its radius along the road (the bracket 1.4 m across)
      let c = null, best = Infinity;
      for (const q of cols) {
        if (Math.sign(q.x) !== b.sd) continue;
        let ds = Math.abs(q.s - (b.s + shift)) % L; ds = Math.min(ds, L - ds);
        if (ds < best) { best = ds; c = q; }
      }
      if (!c || best > b.col * 0.2) { bad.push({ what: 'bracket', s: Math.round(b.s), off: +best.toFixed(1) }); continue; }
      const top = c === snap ? tomb.floor + tomb.H * 0.34 : c.top;
      if (top < b.y + 3) { bad.push({ what: 'bracket', s: Math.round(b.s), over: +(b.y + 3 - top).toFixed(1) }); continue; }
      // the column's face at the bracket's and the strut's heights (the shaft tapers a tenth over three quarters of its
      // height; its 14 sides leave the middle of a side cos(pi/14) of the way out), 0.3 m into it at least
      const face = (y) => tomb.wall - 0.3 - b.col * Math.cos(Math.PI / 14) * (1 - 0.1 * Math.min(1, (y - tomb.floor) / (0.74 * tomb.H)));
      if (b.reach - short < face(b.y)) bad.push({ what: 'bracket', s: Math.round(b.s), gap: +(face(b.y) - b.reach + short).toFixed(2) });
      else if (b.strut < face(b.y - 3.4)) bad.push({ what: 'strut', s: Math.round(b.s), gap: +(face(b.y - 3.4) - b.strut).toFixed(2) });
    }
    return bad;
  };
  // the self-test: each check must find its deliberate break
  const t1 = runRuins(ruins.feet.slice(0, 1), 2).length === 1;
  const t2 = runPlinths(tomb.plinths.slice(0, 1), 30).length === 1;
  const b0 = tomb.braziers.slice(0, 1), c0 = runBrackets(b0).length === 0;
  const t3 = c0 && runBrackets(b0, 2).length === 1 && runBrackets(b0, 0, 30).length === 1;
  let near = null;
  if (b0.length) for (const q of cols) if (Math.sign(q.x) === b0[0].sd && Math.abs(q.s - b0[0].s) < 1) near = q;
  const t4 = c0 && !!near && runBrackets(b0, 0, 0, near).length === 1;
  const selfTest = t1 && t2 && t3 && t4 ? 'ok' : `failed (ruins ${t1}, plinths ${t2}, brackets ${t3}, snapped ${t4})`;
  out.push(...runRuins(ruins.feet), ...runPlinths(tomb.plinths), ...runBrackets(tomb.braziers));
  void f;
  return { selfTest, floating: out, checked: { ruinPieces: ruins.feet.length, plinths: tomb.plinths.length, brackets: tomb.braziers.length } };
}

