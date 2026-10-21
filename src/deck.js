// The track deck's look, in two parts. Its finish is generated on the GPU once at load: colour, normal and roughness
// for the 56 m x 40 m plate tile (4096 px: ~1.4 cm a texel) - broad wear and grime, mottling, the polished racing
// lanes, dents, coolant stains, the engines' soot - and a 4 m detail layer (2048 px: 2 mm: the composite's blasted
// face - it was an asphalt's pebbles in their binder). Everything is
// built from periodic noise in metres, so it tiles without a seam. (The canvas version was square specks and a brushed
// grain of straight lines: "the road had like a lot of straight lines, kinda looks off".)
// What is BUILT - the plates' seams and their fasteners, access hatches, the expansion joint every 40 m, the gutters
// along the walls, the kerbs, the paint - is worked out per pixel in metres (DECK_LAYOUT, in the deck's own shader), so
// it is sharp at any distance and fits any width ("do a road upgrade overall ... higher details, more small details
// around, better textures and more depth to them"); with Settings "Road relief" the deck is ray-marched through that
// layout's heights near the camera (parallax), so its grooves, slots and gaps have real depth.
import * as THREE from 'three';
import { bakeLater, quadJob } from './bake.js';
import { Q } from './quality.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const W = 56, L = 40;                 // the deck texture's footprint (m): TRACK_W across, 40 m along
const f1 = (x) => x.toFixed(2);
const DETAIL = 4;                     // the detail layer's tile (m)

const COMMON = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform vec2 size;                  // metres the texture covers
  uniform float texel;                // metres a texel
  float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  // value noise on a lattice repeating every per cells (p in cells), quintic
  float vnoise(vec2 p, vec2 per) {
    vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = h12(mod(i, per)), b = h12(mod(i + vec2(1.0, 0.0), per));
    float c = h12(mod(i + vec2(0.0, 1.0), per)), d = h12(mod(i + vec2(1.0, 1.0), per));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // fbm over metres: f cells a metre at the first octave, periodic over the texture
  float fbm(vec2 m, float f, int oct, float salt) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int o = 0; o < 7; o++) {
      if (o >= oct) break;
      vec2 per = max(vec2(1.0), floor(size * f + 0.5));
      s += a * vnoise(m / size * per + vec2(salt * 13.7 + float(o) * 5.31, salt * 7.3 - float(o) * 3.17), per);
      n += a; a *= 0.5; f *= 2.0;
    }
    return s / n;
  }
  // cellular: the nearest cell's distance (in cells) and its random value; periodic
  vec2 worley(vec2 m, float f, float salt) {
    vec2 per = max(vec2(1.0), floor(size * f + 0.5)), p = m / size * per;
    vec2 i = floor(p), fr = fract(p);
    float d1 = 9.0, id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)), c = mod(i + o, per) + salt;
      vec2 r = o + 0.12 + 0.76 * h22(c) - fr;
      float d = dot(r, r);
      if (d < d1) { d1 = d; id = h12(c + 7.7); }
    }
    return vec2(sqrt(d1), id);
  }
`;

const MACRO = /* glsl */`
  // ---- the plates' finish over the tile (u across the whole width, 40 m along)
  #define FAR ${f1(W)}
  float laneMask(vec2 m) {                    // the racing lanes, polished by the hulls' magnetic skids
    float l = 0.0;
    for (int k = 0; k < 4; k++) {
      float c = (k == 0 ? 0.193 : k == 1 ? 0.364 : k == 2 ? 0.636 : 0.807) * FAR;
      l = max(l, 1.0 - smoothstep(1.4, 3.2, abs(m.x - c)));
    }
    return l * (0.55 + 0.45 * fbm(m, 0.6, 3, 5.0));
  }
  // coolant and oil: a few soft blotches a metre or two across, each with a darker tide line round it
  float stain(vec2 m) {
    vec2 w = worley(m, 0.32, 11.0);
    float r = w.x / (0.28 + 0.3 * fract(w.y * 7.1)) + (fbm(m, 2.5, 3, 12.0) - 0.5) * 0.45;
    float on = smoothstep(0.8, 0.84, w.y);
    return on * ((1.0 - smoothstep(0.62, 0.9, r)) * 0.55 + smoothstep(0.72, 0.86, r) * (1.0 - smoothstep(0.86, 0.98, r)) * 0.45);
  }
  // the engines' soot along the lanes: long soft smudges, broken up (periodic over the tile: 3 and 0.25 cells a metre)
  float soot(vec2 m) {
    float n = vnoise(vec2(m.x * 3.0, m.y * 0.25), vec2(FAR * 3.0, 10.0)) * 0.6 + vnoise(vec2(m.x * 7.0, m.y * 0.5) + 3.1, vec2(FAR * 7.0, 20.0)) * 0.4;
    float near = 0.0;
    for (int k = 0; k < 4; k++) {
      float c = (k == 0 ? 0.193 : k == 1 ? 0.364 : k == 2 ? 0.636 : 0.807) * FAR;
      near = max(near, 1.0 - smoothstep(0.8, 4.0, abs(m.x - c)));
    }
    return smoothstep(0.56, 0.82, n) * near * (0.5 + 0.5 * fbm(m, 0.4, 2, 14.0));
  }
  float height(vec2 m) {                      // mm: the plates' gentle warp and a few dents
    vec2 d = worley(m, 1.6, 21.0);
    float dent = smoothstep(0.82, 0.9, d.y) * pow(max(0.0, 1.0 - d.x / (0.35 + 0.25 * fract(d.y * 9.3))), 2.0);
    return (fbm(m, 1.1, 4, 1.0) - 0.5) * 0.9 - 0.5 * dent;
  }
  vec3 albedo(vec2 m) {
    vec3 c = vec3(0.058, 0.064, 0.078);                              // graphite composite
    float w = fbm(m, 0.3, 6, 2.0);
    c *= 0.82 + 0.36 * w;                                            // wear and grime, broad and soft
    c *= 0.9 + 0.2 * fbm(m, 4.0, 4, 8.0);                            // mottling
    c *= 1.0 - 0.1 * laneMask(m);
    c *= 1.0 - 0.22 * stain(m);
    c *= 1.0 - 0.15 * soot(m);
    return c;
  }
  // packed for the material: R a fine noise (the paint's chips, the kerbs' wear), G the roughness (three reads G),
  // B a broad noise (tone)
  vec4 roughPack(vec2 m) {
    float r = 0.55 + (fbm(m, 0.8, 5, 6.0) - 0.5) * 0.16;
    r -= 0.12 * laneMask(m);
    r -= 0.14 * stain(m);                                            // (oil: glossier)
    r += 0.08 * soot(m);
    return vec4(fbm(m, 16.0, 3, 3.0), clamp(r, 0.05, 1.0), fbm(m, 1.5, 2, 4.0), 1.0);
  }
`;

const DETAILS = /* glsl */`
  // ---- the composite's face: blasted - fine shallow pits (~8 mm) in a faint mottle; no direction anywhere
  float height(vec2 m) {
    vec2 p = worley(m, 120.0, 1.0);
    float pit = pow(max(0.0, 1.0 - p.x / 0.55), 2.0) * (0.4 + 0.6 * p.y);
    return fbm(m, 60.0, 3, 3.0) * 0.12 - pit * 0.3;                // mm
  }
  vec3 albedo(vec2 m) {
    vec2 p = worley(m, 120.0, 1.0);
    return vec3(0.5 + (fbm(m, 30.0, 3, 9.0) - 0.5) * 0.14 - (1.0 - smoothstep(0.0, 0.5, p.x)) * 0.05 * p.y);
  }
  vec4 roughPack(vec2 m) { return vec4(0.5); }
`;

const FRAG = /* glsl */`
  void main() {
    vec2 m = vUv * size;
    #if BAKE_MODE == 0
      gl_FragColor = vec4(albedo(m), 1.0);
    #elif BAKE_MODE == 1
      // the normal from the height's slope (mm over metres): one texel either way
      float e = texel;
      float dx = (height(m + vec2(e, 0.0)) - height(m - vec2(e, 0.0))) * 0.001 / (2.0 * e);
      float dy = (height(m + vec2(0.0, e)) - height(m - vec2(0.0, e))) * 0.001 / (2.0 * e);
      vec3 n = normalize(vec3(-dx, -dy, 1.0));
      gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
    #else
      gl_FragColor = roughPack(m);
    #endif
  }
`;

function bake(renderer, body, metres, res, mode, srgb) {
  const rt = new THREE.WebGLRenderTarget(res, res, {
    depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
  });
  rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({
    defines: { BAKE_MODE: mode },
    uniforms: { size: { value: new THREE.Vector2(...metres) }, texel: { value: metres[0] / res } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: COMMON + body + FRAG,
  }));
  bakeLater([quadJob(quad)], () => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    quad.render(renderer);                     // (the mip chain is built as the target is left)
    renderer.setRenderTarget(prev);
    quad.material.dispose();
    quad.dispose();
  });
  return rt.texture;
}

// (a phone: half each way - the five maps were ~230 MB with their mips)
export function bakeDeckMaps(renderer, res = Q.tier === 'low' ? 2048 : 4096, detailRes = Q.tier === 'low' ? 1024 : 2048) {
  return {
    map: bake(renderer, MACRO, [W, L], res, 0, true),
    normal: bake(renderer, MACRO, [W, L], res, 1, false),
    rough: bake(renderer, MACRO, [W, L], res >> 1, 2, false),
    detailAlbedo: bake(renderer, DETAILS, [DETAIL, DETAIL], detailRes, 0, false),
    detailNormal: bake(renderer, DETAILS, [DETAIL, DETAIL], detailRes, 1, false),
  };
}

// The deck's built layout, per pixel (the deck material's fragment shader: track.js). m: metres across from the left
// wall (0 .. deckW) and along the lap; f: the pixel's footprint in metres across and along (fwidth), so every edge is
// filtered over it and what is finer than a pixel fades to its share of it (no sparkle far down the track).
// ("change the asphalt into something cooler and more sci fi": the deck is armour plate now, not a road surface.)
//   gutter  - the outer 34 cm against each wall: a galvanised channel, its grate slotted every 4.5 cm (3 cm deep), a
//             solid cross bar every metre
//   kerb    - from there to 1.6 m: cast blocks 8 mm proud, chamfered, red / white every 4 m with a 1.2 cm gap between,
//             fine anti-slip grooves across the top, worn through in flecks (more along both edges)
//   paint   - the edge lines (30 cm, 1.9 m in from each wall) and the dashed centre line, chipped
//   plates  - 14 m x 5 m of dark graphite composite, each its own shade and finish (satin or matte; one in ten a
//             darker replacement), its face in hexagonal armour cells 25 cm across (a fine groove round each, each cell
//             a shade apart); seams 9 mm wide and 1.2 cm deep with chamfered lips worn bright in places, dark sealant in
//             them; along the seams that run with the track (not the centre's) a light inlay 6 mm wide in the
//             circuit's colour, a brighter node where a seam crosses it; countersunk hex-socket screws 9 cm either side of every seam every
//             50 cm; in some plates an access hatch (a gap round it, an inset lid, two recessed lifting slots, a screw
//             in each corner) or a round inspection cover (six screws, a lifting socket) - never under the lane lights,
//             the centre line or the kerb's studs
//   joint   - every 40 m, across the whole deck: an expansion joint - two steel edge beams (bolted every 30 cm) and
//             interlocking steel fingers over a 4 cm deep gap
// Heights in metres (+ up); rdHeight's `fine`: the screws, the cells and the kerbs' grooves too (the parallax march
// leaves them out; the shading's normals have them).
export const DECK_LAYOUT = /* glsl */`
uniform float deckW;
uniform vec3 deckGlow;
#define RD_GUT 0.34
#define RD_KERB 1.6
#define RD_PW 14.0
#define RD_PL 5.0
#define RD_BAY 40.0
vec3 rdEmit = vec3(0.0);                     // (rdSurface: the inlays' light)
float rdRoughK = 1.0;                        // (rdSurface: the plate's finish, on the baked roughness)
float rdHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// filtered over the footprint f: inside a region (sd < 0), and within hw of a line (d >= 0)
float rdIn(float sd, float f) { return clamp(0.5 - sd / f, 0.0, 1.0); }
float rdLine(float d, float hw, float f) { return clamp((hw - d) / f + 0.5, 0.0, 1.0) * min(1.0, 2.0 * hw / f); }
float rdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float rdRBox(vec2 p, vec2 b, float r) { return rdBox(p, b - r) - r; }
float rdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p); p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
// a seam's depth at d from its centre: 9 mm wide, 1.2 cm deep, its lips chamfered (3 mm over 4.5 mm each side)
float rdGroove(float d, float f) {
  float core = 1.0 - smoothstep(0.0045 - 0.5 * f, 0.0045 + 0.5 * f + 0.001, d);
  float lip = 1.0 - smoothstep(0.0045, 0.011 + 0.5 * f, d);
  return (0.009 * core + 0.003 * lip) * min(1.0, 0.016 / f);
}
// a countersunk hex-socket screw (q from its centre): the head flush, a fine ring round it, the socket 5 mm deep;
// gone where the head is finer than ~a pixel
float rdScrew(vec2 q, float f) {
  float k = 1.0 - smoothstep(0.004, 0.008, f);
  return -k * (0.0006 * rdLine(abs(length(q) - 0.012), 0.0007, f) + 0.005 * rdIn(rdHex(q, 0.0042), f));
}
// the armour cells: hexagons 25 cm across the flats (p in metres, along taken within the 40 m bay - the joint covers
// where the pattern starts again); x: the distance to the cell's edge (m), yz: the cell (for its shade)
vec3 rdCell(vec2 p) {
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 u = p / 0.25, a = mod(u, r) - r * 0.5, b = mod(u - r * 0.5, r) - r * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b, q = abs(g);
  return vec3((0.5 - max(q.x, dot(q, vec2(0.5, 0.8660254)))) * 0.25, u - g);
}
// the plate's fixture: a rectangular hatch (hs: its half size), a round inspection cover (hs.x < 0: minus its radius)
// or none (hs = 0); c its centre
void rdHatch(vec2 m, out vec2 c, out vec2 hs) {
  vec2 pc = vec2(floor(m.x / RD_PW), floor(m.y / RD_PL)), pk = mod(pc, vec2(97.0));
  hs = vec2(0.0);
  c = vec2(pc.x * RD_PW + 1.6 + rdHash(pk + 5.7) * (RD_PW - 3.2), pc.y * RD_PL + 1.1 + rdHash(pk + 9.1) * (RD_PL - 2.2));
  float mid = deckW * 0.5, kind = rdHash(pk + 17.3);
  bool room = min(c.x, deckW - c.x) > RD_KERB + 1.9 && abs(c.x - mid) > 1.5 && abs(abs(c.x - mid) - 11.0) > 1.3;
  if (room && kind < 0.4) hs = rdHash(pk + 3.1) < 0.5 ? vec2(0.55, 0.35) : vec2(0.35, 0.55);
  else if (room && kind < 0.7) hs = vec2(-0.26);
}
// the fixture's outline (signed distance, m) at p from its centre
float rdFixture(vec2 p, vec2 hs) { return hs.x > 0.0 ? rdRBox(p, hs, 0.07) : length(p) + hs.x; }
float rdHeight(vec2 m, vec2 f, bool fine) {
  float x = clamp(m.x, 0.0, deckW), xe = min(x, deckW - x), yl = mod(m.y, RD_BAY), dj = yl < 20.0 ? yl : yl - RD_BAY;
  float fr = max(f.x, f.y), h = 0.0;
  if (abs(dj) < 0.2) {
    // the expansion joint: fingers over the gap (fading to its share of the band where they are finer than the pixel)
    float ad = abs(dj);
    vec2 q = vec2((fract(x / 0.1) - 0.5) * 0.1, dj);
    float sf = min(rdBox(q - vec2(-0.025, -0.006), vec2(0.017, 0.054)), rdBox(q - vec2(0.025, 0.006), vec2(0.017, 0.054)));
    float band = rdIn(ad - 0.06, f.y);
    float gap = mix((1.0 - rdIn(sf, fr)) * band, 0.3 * band, smoothstep(0.006, 0.02, f.x));
    h = -0.04 * gap - 0.004 * rdLine(abs(ad - 0.18), 0.002, f.y);
    if (fine && ad > 0.07) h += rdScrew(vec2((fract(x / 0.3) - 0.5) * 0.3, ad - 0.12), fr);
  } else if (xe < RD_GUT) {
    // the gutter: its grate 2 mm under the frame, slotted
    float sy = (fract(yl / 0.045) - 0.5) * 0.045, bar = abs(yl - floor(yl + 0.5));
    float slot = rdIn(length(vec2(max(abs(xe - 0.17) - 0.105, 0.0), sy)) - 0.0095, fr) * smoothstep(0.025, 0.035, bar);
    slot = mix(slot, 0.3 * (1.0 - smoothstep(0.1, 0.12, abs(xe - 0.17))), smoothstep(0.008, 0.02, f.y));
    h = -0.002 * rdIn(abs(xe - 0.17) - 0.135, f.x) - 0.028 * slot;
  } else if (xe < RD_KERB) {
    // the kerb: chamfered both sides and at each block's ends
    float g = abs(yl - 4.0 * floor(yl / 4.0 + 0.5));
    float k = smoothstep(RD_GUT, RD_GUT + 0.006, xe) * (1.0 - smoothstep(RD_KERB - 0.03, RD_KERB, xe)) * smoothstep(0.006, 0.014, g);
    h = 0.008 * k;
    if (fine) h -= 0.0015 * k * rdLine(abs(fract(yl / 0.08) - 0.5) * 0.08, 0.005, f.y);
  } else {
    // the plates: seams (none along the kerb's edge), a fixture, the cells and the screws
    float xs = RD_PW * floor(x / RD_PW + 0.5), sdx = (xs > 1.0 && xs < deckW - 1.0) ? abs(x - xs) : 9.0;
    float iy = floor(yl / RD_PL + 0.5), sdy = (iy > 0.5 && iy < 7.5) ? abs(yl - RD_PL * iy) : 9.0;
    h = -max(rdGroove(sdx, f.x), rdGroove(sdy, f.y));
    vec2 c, hs;
    rdHatch(m, c, hs);
    vec2 p = m - c;
    float lid = 0.0;
    if (hs.x != 0.0 && length(p) < 0.75) {
      float sd = rdFixture(p, hs);
      lid = rdIn(sd, fr);
      h -= 0.0015 * rdIn(sd + 0.004, fr) + 0.0135 * rdLine(abs(sd), 0.003, fr) * min(1.0, 0.008 / fr);
      if (hs.x > 0.0) {
        vec2 q = hs.x > hs.y ? p : p.yx;
        h -= 0.016 * rdIn(rdRBox(vec2(abs(q.x) - (max(hs.x, hs.y) - 0.13), q.y), vec2(0.06, 0.017), 0.017), fr);
        if (fine) h += rdScrew(abs(p) - (hs - 0.055), fr);
      } else {
        float a = 1.0471976 * floor(atan(p.y, p.x) / 1.0471976 + 0.5);
        h -= 0.008 * rdIn(rdHex(p, 0.014), fr);
        if (fine) h += rdScrew(p - (-hs.x - 0.05) * vec2(cos(a), sin(a)), fr);
      }
    }
    if (fine) {
      vec2 q1 = vec2(abs(x - xs) - 0.09, (fract(yl / 0.5) - 0.5) * 0.5), q2 = vec2((fract(x / 0.5) - 0.5) * 0.5, abs(yl - RD_PL * iy) - 0.09);
      vec2 q = sdx < 0.2 ? q1 : vec2(9.0);
      if (sdy < 0.2 && dot(q2, q2) < dot(q, q)) q = q2;
      if (q.x < 1.0) h += rdScrew(q, fr);
      h -= 0.001 * rdLine(rdCell(vec2(x, yl)).x, 0.0015, fr) * (1.0 - lid);
    }
  }
  return h;
}
// the built parts' finish over the plates' (the baked map): rgb + a premultiplied (a: how much is its own - steel,
// paint, rubber, a gap's dark), rm its roughness / metalness likewise; tone: the plate's own shade (on the plate's
// face, under the rest); rdRoughK its finish; rdEmit the inlays' light. chip, broad: the baked noises (roughPack R, B)
void rdOver(inout vec4 c, inout vec2 r, vec3 col, vec2 rm, float a) { c = c * (1.0 - a) + vec4(col, 1.0) * a; r = r * (1.0 - a) + rm * a; }
vec4 rdSurface(vec2 m, vec2 f, float chip, float broad, out vec2 rm, out float tone) {
  float x = clamp(m.x, 0.0, deckW), xe = min(x, deckW - x), yl = mod(m.y, RD_BAY), dj = yl < 20.0 ? yl : yl - RD_BAY;
  float fr = max(f.x, f.y);
  const vec3 STEEL = vec3(0.2, 0.205, 0.215), GALV = vec3(0.12, 0.125, 0.13), DARK = vec3(0.01, 0.01, 0.011);
  const vec3 PAINT = vec3(0.62, 0.62, 0.6), SEAL = vec3(0.022, 0.022, 0.024), WORN = vec3(0.07, 0.075, 0.08);
  vec4 c = vec4(0.0);
  rm = vec2(0.0);
  tone = 1.0;
  rdRoughK = 1.0;
  rdEmit = vec3(0.0);
  if (abs(dj) < 0.2) {
    float ad = abs(dj);
    vec2 q = vec2((fract(x / 0.1) - 0.5) * 0.1, dj);
    float sf = min(rdBox(q - vec2(-0.025, -0.006), vec2(0.017, 0.054)), rdBox(q - vec2(0.025, 0.006), vec2(0.017, 0.054)));
    float band = rdIn(ad - 0.06, f.y), gap = mix((1.0 - rdIn(sf, fr)) * band, 0.3 * band, smoothstep(0.006, 0.02, f.x));
    rdOver(c, rm, STEEL * (0.8 + 0.35 * broad) * (0.85 + 0.3 * chip), vec2(0.3, 0.9), rdIn(ad - 0.18, f.y));
    rdOver(c, rm, DARK, vec2(1.0, 0.0), max(gap, rdLine(abs(ad - 0.18), 0.002, f.y)));
    vec2 sq = vec2((fract(x / 0.3) - 0.5) * 0.3, ad - 0.12);
    rdOver(c, rm, DARK, vec2(1.0, 0.0), rdIn(rdHex(sq, 0.0042), fr) * (1.0 - smoothstep(0.004, 0.008, fr)) * step(0.07, ad));
  } else if (xe < RD_GUT) {
    float sy = (fract(yl / 0.045) - 0.5) * 0.045, bar = abs(yl - floor(yl + 0.5));
    float slot = rdIn(length(vec2(max(abs(xe - 0.17) - 0.105, 0.0), sy)) - 0.0095, fr) * smoothstep(0.025, 0.035, bar);
    slot = mix(slot, 0.3 * (1.0 - smoothstep(0.1, 0.12, abs(xe - 0.17))), smoothstep(0.008, 0.02, f.y));
    rdOver(c, rm, GALV * (0.75 + 0.4 * broad) * (0.8 + 0.25 * chip), vec2(0.55, 0.7), 1.0);
    rdOver(c, rm, DARK, vec2(1.0, 0.0), slot);
  } else if (xe < RD_KERB) {
    float g = abs(yl - 4.0 * floor(yl / 4.0 + 0.5));
    vec3 kc = mod(floor(yl / 4.0), 2.0) > 0.5 ? vec3(0.6, 0.6, 0.57) : vec3(0.40, 0.022, 0.027);
    float edge = 1.0 - smoothstep(0.0, 0.3, min(xe - RD_GUT, RD_KERB - xe));
    float wear = smoothstep(0.64 - 0.16 * edge, 0.71 - 0.16 * edge, chip) * 0.8;
    float groove = rdLine(abs(fract(yl / 0.08) - 0.5) * 0.08, 0.005, f.y);
    rdOver(c, rm, kc * (0.88 + 0.12 * broad) * (1.0 - 0.3 * groove), vec2(0.5, 0.0), 1.0);
    rdOver(c, rm, WORN, vec2(0.45, 0.6), max(wear, 1.0 - smoothstep(0.006, 0.014, g)));
  } else {
    // the plates: each its own shade and finish (one in ten a darker replacement), grime and bright wear along the
    // seams, the sealant in them
    vec2 pc = vec2(floor(x / RD_PW), floor(m.y / RD_PL)), pk = mod(pc, vec2(97.0));
    tone = mix(0.86, 1.14, rdHash(pk + 3.1)) * (rdHash(pk + 6.4) < 0.1 ? 0.72 : 1.0);
    rdRoughK = rdHash(pk + 12.7) < 0.5 ? 0.7 : 1.12;
    float xs = RD_PW * floor(x / RD_PW + 0.5), sdx = (xs > 1.0 && xs < deckW - 1.0) ? abs(x - xs) : 9.0;
    float iy = floor(yl / RD_PL + 0.5), sdy = (iy > 0.5 && iy < 7.5) ? abs(yl - RD_PL * iy) : 9.0, sd0 = min(sdx, sdy);
    tone *= mix(0.6, 1.0, smoothstep(0.006, 0.08, sd0));
    // a fixture: its lid a shade off the plate (no cells on it)
    vec2 hc, hs;
    rdHatch(m, hc, hs);
    vec2 p = m - hc;
    float lid = 0.0, sd = 9.0;
    if (hs.x != 0.0 && length(p) < 0.75) { sd = rdFixture(p, hs); lid = rdIn(sd, fr); tone *= mix(1.0, 0.8 + 0.1 * rdHash(pk + 8.8), lid); }
    // the armour cells: a fine dark groove round each, each a shade and a finish apart (fading to the plate's as they
    // come under a few pixels)
    vec3 cl = rdCell(vec2(x, yl));
    float cv = rdHash(mod(cl.yz, 512.0) + 1.7), kc = (1.0 - smoothstep(0.03, 0.08, fr)) * (1.0 - lid);
    tone *= 1.0 + (cv - 0.5) * 0.2 * kc;
    rdRoughK *= 1.0 + (cv - 0.5) * 0.16 * kc;
    rdOver(c, rm, SEAL * 2.5, vec2(0.75, 0.2), rdLine(cl.x, 0.0015, fr) * 0.75 * (1.0 - lid));
    rdOver(c, rm, STEEL * 1.4, vec2(0.32, 0.85), smoothstep(0.6, 0.68, chip) * (1.0 - smoothstep(0.008, 0.03, sd0)) * 0.7);
    rdOver(c, rm, SEAL, vec2(0.9, 0.0), max(rdLine(sdx, 0.0055, f.x), rdLine(sdy, 0.0055, f.y)));
    // the light inlays: a thin line along the lengthwise seams (not the centre's), a brighter node where seams cross
    if (sdx < 0.1 && abs(xs - deckW * 0.5) > 1.0) {
      float line = rdLine(sdx, 0.003, f.x), node = rdIn(max(sdx, sdy) - 0.025, fr);
      rdEmit = deckGlow * (line * 4.0 + node * 6.0);
      rdOver(c, rm, DARK, vec2(0.1, 0.0), max(line, node));
    }
    // the paint: the edge lines and the dashed centre line, chipped
    float pnt = max(rdLine(abs(xe - 1.9), 0.15, f.x), rdLine(abs(x - deckW * 0.5), 0.15, f.x) * rdIn(abs(mod(m.y, 20.0) - 5.0) - 5.0, f.y));
    pnt *= 1.0 - smoothstep(0.64, 0.7, chip) * (0.4 + 0.6 * broad);
    rdOver(c, rm, PAINT * (0.9 + 0.1 * broad), vec2(0.4, 0.0), pnt);
    float k = 1.0 - smoothstep(0.004, 0.008, fr);
    if (hs.x != 0.0 && length(p) < 0.75) {
      // its gap, its slots or socket dark; its screws
      if (hs.x > 0.0) {
        vec2 q = hs.x > hs.y ? p : p.yx, cq = abs(p) - (hs - 0.055);
        rdOver(c, rm, DARK, vec2(0.95, 0.0), max(rdLine(abs(sd), 0.003, fr) * min(1.0, 0.008 / fr),
          rdIn(rdRBox(vec2(abs(q.x) - (max(hs.x, hs.y) - 0.13), q.y), vec2(0.06, 0.017), 0.017), fr)));
        rdOver(c, rm, STEEL * (0.8 + 0.4 * chip), vec2(0.38, 0.85), rdIn(length(cq) - 0.012, fr) * k);
        rdOver(c, rm, DARK, vec2(1.0, 0.0), rdIn(rdHex(cq, 0.0042), fr) * k);
      } else {
        float a = 1.0471976 * floor(atan(p.y, p.x) / 1.0471976 + 0.5);
        vec2 cq = p - (-hs.x - 0.05) * vec2(cos(a), sin(a));
        rdOver(c, rm, DARK, vec2(0.95, 0.0), max(rdLine(abs(sd), 0.003, fr) * min(1.0, 0.008 / fr), rdIn(rdHex(p, 0.014), fr)));
        rdOver(c, rm, STEEL * (0.8 + 0.4 * chip), vec2(0.38, 0.85), rdIn(length(cq) - 0.012, fr) * k);
        rdOver(c, rm, DARK, vec2(1.0, 0.0), rdIn(rdHex(cq, 0.0042), fr) * k);
      }
    }
    // the screws along the seams: bare steel heads, dark sockets
    vec2 q1 = vec2(abs(x - xs) - 0.09, (fract(yl / 0.5) - 0.5) * 0.5), q2 = vec2((fract(x / 0.5) - 0.5) * 0.5, abs(yl - RD_PL * iy) - 0.09);
    vec2 q = sdx < 0.2 ? q1 : vec2(9.0);
    if (sdy < 0.2 && dot(q2, q2) < dot(q, q)) q = q2;
    if (q.x < 1.0) {
      rdOver(c, rm, STEEL * (0.8 + 0.4 * chip), vec2(0.38, 0.85), rdIn(length(q) - 0.012, fr) * k);
      rdOver(c, rm, DARK, vec2(1.0, 0.0), rdIn(rdHex(q, 0.0042), fr) * k);
    }
  }
  return c;
}
`;
