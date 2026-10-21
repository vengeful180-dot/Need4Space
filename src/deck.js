// The track deck's look, in two parts. Its finish is generated on the GPU once at load: colour, normal and roughness
// for the 56 m x 40 m plate tile (4096 px: ~1.4 cm a texel) - broad wear and grime, mottling, the polished racing
// lanes, dents, coolant stains, the engines' soot - and a 4 m detail layer (2048 px: 2 mm: the composite's blasted
// face - it was an asphalt's pebbles in their binder). Everything is
// built from periodic noise in metres, so it tiles without a seam. (The canvas version was square specks and a brushed
// grain of straight lines: "the road had like a lot of straight lines, kinda looks off".)
// What is BUILT - the armour panels, their gaps, recesses, vents, lights and bolts, the gutters along the walls, the
// kerbs, the paint - is worked out per pixel in metres (DECK_LAYOUT, in the deck's own shader), so
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
  // fbm over metres: f cells a metre at the first octave, periodic over the texture. An octave finer than two texels
  // goes in as its mean: baked, it could only come out as noise from texel to texel (the chips' 32 and 64 cells a metre
  // on 2.7 cm texels: the kerbs' worn flecks came out jagged, in moire bands, glittering along the road's edges)
  float fbm(vec2 m, float f, int oct, float salt) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int o = 0; o < 7; o++) {
      if (o >= oct) break;
      vec2 per = max(vec2(1.0), floor(size * f + 0.5));
      s += a * (o > 0 && f * texel > 0.5 ? 0.5 : vnoise(m / size * per + vec2(salt * 13.7 + float(o) * 5.31, salt * 7.3 - float(o) * 3.17), per));
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
    vec3 c = vec3(0.05, 0.056, 0.07);                                // dark armour steel
    float w = fbm(m, 0.3, 6, 2.0);
    c *= 0.82 + 0.36 * w;                                            // wear and grime, broad and soft
    c *= 0.9 + 0.2 * fbm(m, 4.0, 4, 8.0);                            // mottling
    c *= 1.0 - 0.1 * laneMask(m);
    c *= 1.0 - 0.12 * stain(m);
    c *= 1.0 - 0.08 * soot(m);
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
// wall (0 .. deckW) and along the lap from rdOrigin (track.js DECK_ORIGIN); f: the pixel's footprint in metres across and along (fwidth), so every edge is
// filtered over it and what is finer than a pixel fades to its share of it (no sparkle far down the track).
// ("the new road texture ... still read as asphalt, the details are way too small, there no depth in them either, too
// repetitive": the deck is built from big armour panels now, their gaps and recesses centimetres deep; then "too many
// small blue lights, when i said details thats not what i meant": no lights in it - its details are all shapes.)
//   gutter  - the outer 34 cm against each wall: a galvanised channel, its grate slotted every 4.5 cm (3 cm deep), a
//             solid cross bar every metre
//   kerb    - from there to 1.6 m: cast blocks 8 mm proud, chamfered, red / white every 4 m with a 1.2 cm gap between,
//             fine anti-slip grooves across the top, worn through in flecks (more along both edges)
//   panels  - between the kerbs, an odd number of columns ~5.9 m wide (the middle line on a panel, not a gap); rows 8 m
//             long, every other column staggered half a row, a third of the panels split in two. Gaps 20 cm wide and 14 cm
//             deep, their lips chamfered 5 cm and worn bright. A hex bolt (5 cm) near each corner. Each panel its own
//             shade and finish, and one of five kinds: armour (its centre inset 2 cm inside a 30 cm border), a vent
//             (slots across its centre, 4.5 cm deep), a raised plate (its centre 1.5 cm proud, bevelled), tread plate
//             (raised diamonds) or a round hatch (a 1.1 m lid in a 2 cm groove, eight bolts, a recessed handle)
//   paint   - the edge lines (30 cm, 1.9 m in from each wall) and the dashed middle line, chipped
// Everything is chosen by the panel's own place on the lap (no 40 m tile repeating). Heights in metres (+ up);
// rdHeight's `fine`: the bolts, the tread, the hatches' bolts, the vents' and gutters' slots and the kerbs' grooves too
// (the parallax march leaves out what is small or repeats finely - it crawled; the shading's normals have them).
export const DECK_LAYOUT = /* glsl */`
uniform float deckW;
#define RD_GUT 0.34
#define RD_KERB 1.6
vec3 rdEmit = vec3(0.0);                     // (none now: the deck has no lights of its own)
float rdRoughK = 1.0;                        // (rdSurface: the panel's finish, on the baked roughness)
float rdHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// filtered over the footprint f: inside a region (sd < 0), and within hw of a line (d >= 0)
float rdIn(float sd, float f) { return clamp(0.5 - sd / f, 0.0, 1.0); }
float rdLine(float d, float hw, float f) { return clamp((hw - d) / f + 0.5, 0.0, 1.0) * min(1.0, 2.0 * hw / f); }
float rdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float rdHex(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p); p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
// the panel a point is on: p - the point from the panel's centre (m), hs - its half size, id - its identity (column,
// row, half), kind 0..4, b - the nearest lengthwise boundary's index (0 and n: the kerbs)
struct RdPanel { vec2 p; vec2 hs; vec2 id; float kind; float b; float n; };
RdPanel rdPanel(vec2 m) {
  RdPanel P;
  float fw = deckW - 2.0 * RD_KERB, n = 2.0 * floor(fw / 11.8) + 1.0, cw = fw / n;
  float u = (clamp(m.x, RD_KERB, deckW - RD_KERB) - RD_KERB) / cw, col = min(floor(u), n - 1.0);
  // (m.y counts from the pattern's origin, rdOrigin metres along the lap - a whole number of rows: track.js DECK_ORIGIN;
  // the row's number on the lap is put back for its identity)
  float sy = m.y + mod(col, 2.0) * 4.0, rl = floor(sy / 8.0), vy = sy - rl * 8.0, row = mod(rl + rdOrigin / 8.0, 4096.0), pl = 8.0, hv = 0.0;
  if (rdHash(vec2(col, row) + 2.3) < 0.33) { hv = floor(vy / 4.0); vy -= hv * 4.0; pl = 4.0; }
  P.p = vec2((u - col) * cw - cw * 0.5, vy - pl * 0.5);
  P.hs = vec2(cw, pl) * 0.5;
  P.id = vec2(col + hv * 0.37, row);
  float k = rdHash(P.id + 7.1);
  P.kind = k < 0.48 ? 0.0 : k < 0.64 ? 1.0 : k < 0.74 ? 2.0 : k < 0.88 ? 3.0 : 4.0;
  P.b = floor(u + 0.5);
  P.n = n;
  return P;
}
// the gap's depth at de from the panel's edge (inside >= 0): the lip chamfered 45 deg over 5 cm, the wall down to 14 cm
// (20 cm across: at 5 cm the joints read as no gaps at all - "make those gapes bigger and more visible" - and at 12 cm
// "this looks like perfectly flat from a distance")
float rdGap(float de, float f) {
  float lip = 1.0 - smoothstep(0.10 - 0.5 * f, 0.15 + 0.5 * f, de);
  float wall = 1.0 - smoothstep(0.10 - 0.5 * f, 0.10 + 0.5 * f, de);
  return -(0.05 * lip + 0.09 * wall);
}
float rdHeight(vec2 m, vec2 f, bool fine) {
  float x = clamp(m.x, 0.0, deckW), xe = min(x, deckW - x), yl = mod(m.y, 40.0), fr = max(f.x, f.y), h = 0.0;
  if (xe < RD_GUT) {
    // the gutter: its grate 2 mm under the frame, slotted
    float sy = (fract(yl / 0.045) - 0.5) * 0.045, bar = abs(yl - floor(yl + 0.5));
    float slot = rdIn(length(vec2(max(abs(xe - 0.17) - 0.105, 0.0), sy)) - 0.0095, fr) * smoothstep(0.025, 0.035, bar);
    slot = mix(slot, 0.3 * (1.0 - smoothstep(0.1, 0.12, abs(xe - 0.17))), smoothstep(0.008, 0.02, f.y));
    h = -0.002 * rdIn(abs(xe - 0.17) - 0.135, f.x) - (fine ? 0.028 * slot : 0.0);
  } else if (xe < RD_KERB) {
    // the kerb: chamfered both sides and at each block's ends
    float g = abs(yl - 4.0 * floor(yl / 4.0 + 0.5));
    float k = smoothstep(RD_GUT, RD_GUT + 0.006, xe) * (1.0 - smoothstep(RD_KERB - 0.03, RD_KERB, xe)) * smoothstep(0.006, 0.014, g);
    h = 0.008 * k;
    if (fine) h -= 0.0015 * k * rdLine(abs(fract(yl / 0.08) - 0.5) * 0.08, 0.005, f.y);
  } else {
    RdPanel P = rdPanel(vec2(x, m.y));
    vec2 q = abs(P.p);
    float de = min(P.hs.x - q.x, P.hs.y - q.y), di = de - 0.3;
    h = rdGap(de, fr);
    if (P.kind == 0.0) {
      // armour: the centre inset 2 cm inside its border, chamfered
      h -= 0.02 * smoothstep(-0.5 * fr, 0.02 + 0.5 * fr, di);
    } else if (P.kind == 2.0) {
      // a raised plate: the centre 1.5 cm proud, bevelled 45 deg
      h += 0.015 * smoothstep(-0.5 * fr, 0.015 + 0.5 * fr, di);
    } else if (P.kind == 4.0) {
      // a round hatch: its lid in a 6 mm groove 2 cm deep, a recessed handle across it, eight bolts round its rim
      float r = length(P.p);
      h -= 0.02 * rdLine(abs(r - 0.55), 0.003, fr) * min(1.0, 0.012 / fr);
      h -= 0.018 * rdIn(rdBox(P.p, vec2(0.16, 0.03)) - 0.01, fr) * step(r, 0.55);
      if (fine) {
        float a = 0.7853982 * floor(atan(P.p.y, P.p.x) / 0.7853982 + 0.5);
        h += 0.005 * rdIn(rdHex(P.p - 0.47 * vec2(cos(a), sin(a)), 0.02), fr) * (1.0 - smoothstep(0.01, 0.03, fr));
      }
    } else if (P.kind == 1.0 && fine) {
      // the vent: louvres across its centre every 12 cm - a smooth profile (hard-edged slots flipped the normal inside a
      // pixel and glinted: "still flickers like crazy"), gone to its average before the louvres are under ~8 pixels
      // apart; in the shading only (marched through, a pattern that fine broke up and crawled)
      float lv = (0.5 - 0.5 * cos(6.2831853 * P.p.y / 0.12)) * (1.0 - smoothstep(0.008, 0.016, f.y)) * rdIn(-(de - 0.35), fr);
      h -= 0.02 * lv;
    } else if (fine && de > 0.06) {
      // tread plate: raised diamonds 2 mm high, 5 cm apart
      vec2 t = vec2(P.p.x + P.p.y, P.p.x - P.p.y) / 0.05;
      vec2 c = abs(fract(t) - 0.5);
      h += 0.002 * (1.0 - smoothstep(0.08, 0.14, min(c.x, c.y))) * (1.0 - smoothstep(0.004, 0.012, fr));
    }
    // a hex bolt near each corner, its head 6 mm proud
    if (fine) h += 0.006 * rdIn(rdHex(q - (P.hs - 0.24), 0.025), fr) * (1.0 - smoothstep(0.01, 0.03, fr));
  }
  return h;
}
// the built parts' finish over the panels' (the baked map): rgb + a premultiplied (a: how much is its own - steel,
// paint, a gap's dark, a light), rm its roughness / metalness likewise; tone: the panel's own shade (under the rest);
// rdRoughK its finish; rdEmit the lights. chip, broad: the baked noises (roughPack R, B)
void rdOver(inout vec4 c, inout vec2 r, vec3 col, vec2 rm, float a) { c = c * (1.0 - a) + vec4(col, 1.0) * a; r = r * (1.0 - a) + rm * a; }
vec4 rdSurface(vec2 m, vec2 f, float chip, float broad, out vec2 rm, out float tone) {
  float x = clamp(m.x, 0.0, deckW), xe = min(x, deckW - x), yl = mod(m.y, 40.0), fr = max(f.x, f.y);
  const vec3 STEEL = vec3(0.2, 0.205, 0.215), GALV = vec3(0.12, 0.125, 0.13), DARK = vec3(0.008, 0.008, 0.009);
  const vec3 PAINT = vec3(0.62, 0.62, 0.6), WORN = vec3(0.07, 0.075, 0.08);
  vec4 c = vec4(0.0);
  rm = vec2(0.0);
  tone = 1.0;
  rdRoughK = 1.0;
  rdEmit = vec3(0.0);
  if (xe < RD_GUT) {
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
    RdPanel P = rdPanel(vec2(x, m.y));
    vec2 q = abs(P.p);
    float de = min(P.hs.x - q.x, P.hs.y - q.y), di = de - 0.3, h1 = rdHash(P.id + 3.1), h2 = rdHash(P.id + 12.7);
    // the panel: its own shade and finish (one in eight a darker replacement)
    tone = mix(0.8, 1.2, h1) * (rdHash(P.id + 6.4) < 0.12 ? 0.7 : 1.0);
    // (a satin finish: glossier plates blew out under the headlights; the low sun's sheen is the coating's - track.js)
    rdRoughK = mix(0.85, 1.15, h2);
    // its gap: the chamfered lip worn bright, the wall and the floor dark. Filtered over the footprint across the
    // nearest edge (along the track for the joints across it: those go under a pixel first), and gone to the plain
    // panel once the gap is under about half a pixel - thinner, the joints hopped between pixel rows as the camera
    // crept along ("the road ahead at the distance ... looks like a wave")
    float fe = P.hs.x - q.x < P.hs.y - q.y ? f.x : f.y, jf = 1.0 - smoothstep(0.2, 0.45, fe);
    // (the bright lips fade out once they are under about a pixel - thinner, they glinted; the dark gap stays longer)
    float lip = rdIn(de - 0.15, fe) * (1.0 - rdIn(de - 0.10, fe)) * jf * (1.0 - smoothstep(0.03, 0.08, fe)), gap = rdIn(de - 0.10, fe) * jf;
    rdOver(c, rm, STEEL * (1.5 + 0.4 * chip), vec2(0.42, 0.85), lip * 0.95);
    rdOver(c, rm, DARK, vec2(0.6, 0.3), gap);
    if (P.kind == 0.0 || P.kind == 2.0) {
      // the inset's (or the raised plate's) bevel catching the light; the centre a shade apart
      float bw = P.kind == 0.0 ? 0.02 : 0.015, ch = rdIn(-di, fr) * (1.0 - rdIn(-(di - bw), fr)) * (1.0 - smoothstep(0.03, 0.08, fr));
      rdOver(c, rm, STEEL * (1.1 + 0.3 * chip), vec2(0.45, 0.8), ch * 0.8);
      tone *= mix(1.0, P.kind == 0.0 ? 0.82 : 1.12, rdIn(-(di - bw), fr));
    } else if (P.kind == 4.0) {
      // the hatch: its groove and handle dark, its lid a shade apart, bolts bare steel
      float r = length(P.p), a = 0.7853982 * floor(atan(P.p.y, P.p.x) / 0.7853982 + 0.5);
      tone *= mix(1.0, 0.9, rdIn(r - 0.55, fr));
      rdOver(c, rm, DARK, vec2(0.9, 0.0), max(rdLine(abs(r - 0.55), 0.003, fr) * min(1.0, 0.012 / fr),
        rdIn(rdBox(P.p, vec2(0.16, 0.03)) - 0.01, fr) * step(r, 0.55)));
      rdOver(c, rm, STEEL * (1.2 + 0.4 * chip), vec2(0.42, 0.85),
        rdIn(rdHex(P.p - 0.47 * vec2(cos(a), sin(a)), 0.02), fr) * (1.0 - smoothstep(0.01, 0.03, fr)));
    } else if (P.kind == 1.0) {
      // (the louvres' shade the same smooth profile, matte; their average further off)
      float inV = rdIn(-(de - 0.35), fr), lv = 0.5 - 0.5 * cos(6.2831853 * P.p.y / 0.12);
      lv = mix(lv, 0.5, smoothstep(0.008, 0.016, f.y));
      rdOver(c, rm, STEEL * 0.7, vec2(0.6, 0.6), inV * 0.6);     // (the grille's frame dull steel)
      rdOver(c, rm, DARK, vec2(0.95, 0.0), inV * (0.25 + 0.6 * lv));
    } else {
      // tread plate: brighter, its diamonds catching the light
      vec2 t = vec2(P.p.x + P.p.y, P.p.x - P.p.y) / 0.05, cc = abs(fract(t) - 0.5);
      float dia = (1.0 - smoothstep(0.08, 0.14, min(cc.x, cc.y))) * (1.0 - smoothstep(0.004, 0.012, fr));
      tone *= 1.25;
      rdRoughK *= 0.92;
      rdOver(c, rm, STEEL * 1.4, vec2(0.42, 0.8), dia * 0.5);
    }
    // the corner bolts: bare steel
    float bolt = rdIn(rdHex(q - (P.hs - 0.24), 0.025), fr) * (1.0 - smoothstep(0.01, 0.03, fr));
    rdOver(c, rm, STEEL * (1.2 + 0.4 * chip), vec2(0.42, 0.85), bolt);
    // the paint: the edge lines and the dashed middle line, chipped
    float pnt = max(rdLine(abs(xe - 1.9), 0.15, f.x), rdLine(abs(x - deckW * 0.5), 0.15, f.x) * rdIn(abs(mod(m.y, 20.0) - 5.0) - 5.0, f.y));
    pnt *= 1.0 - smoothstep(0.64, 0.7, chip) * (0.4 + 0.6 * broad);
    rdOver(c, rm, PAINT * (0.9 + 0.1 * broad), vec2(0.4, 0.0), pnt * (1.0 - gap));
  }
  return c;
}
`;
