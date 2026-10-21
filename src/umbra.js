// The Umbra V1's own effects (ship.js builds them for a model with a BlackHole marker):
//  - the contained singularity in its engine's bore: a black core with a hot rim and a halo, held by three glowing
//    containment rings tumbling round it like a gyroscope - on the boost they swing into line round the bore, spin up
//    and the core flares (in the paint's colours)
//  - matter falling into the bore: streaks spiralling in from round the mouth, faster and more of them on the boost
//  - the dark aura: smoke-dark wisps with a violet sheen boiling off the hull and the blades, trailing aft with speed,
//    a few violet embers in them (Settings "Umbra aura")
// All of it in the ship's own frame and animated on the GPU from one clock: no per-frame buffers.
import * as THREE from 'three';

const ARC_BOLTS = 3, ARC_N = 20, ARC_NB = 9;      // lightning bolts per blade's gap, points per bolt, per branch
const CHARGE_N = 18, CHARGE_S = 48;                // points along the nose's charging beam, along each of its strands

const _d = new THREE.Vector3(), _white = new THREE.Color(1, 1, 1);

// a 3-D value noise (cheap, smooth, periodic-free): the disk's streaks and the wisps' billows
const NOISE = /* glsl */`
float uH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float uN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(uH(i), uH(i + vec3(1, 0, 0)), f.x), mix(uH(i + vec3(0, 1, 0)), uH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(uH(i + vec3(0, 0, 1)), uH(i + vec3(1, 0, 1)), f.x), mix(uH(i + vec3(0, 1, 1)), uH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

// The singularity's core: a camera-facing square at the hole's centre, a sphere drawn in it. CORE: the sphere itself -
// black, opaque, writing depth (the containment rings pass behind it and in front), a thin hot rim and faint currents
// of the field flowing round its edge. Else the halo over it: the bright ring hugging the horizon, a soft glow round it
// and slow streaks of light wheeling round (additive), flaring on the boost.
function coreMaterial(core) {
  return new THREE.ShaderMaterial({
    transparent: !core, depthWrite: core,
    ...(core ? {} : { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }),
    defines: { CORE: core ? 1 : 0 },
    uniforms: { size: { value: 1 }, rc: { value: 0.19 }, time: { value: 0 }, glow: { value: 0 }, boost: { value: 0 }, flare: { value: 0 },
      col: { value: new THREE.Color(0.5, 0.2, 1.0) }, hot: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */`
      uniform float size;
      varying vec2 vQ;
      void main() {
        vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        c.xy += position.xy * size;
        vQ = position.xy * size;
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: /* glsl */`
      uniform float rc, time, glow, boost, flare; uniform vec3 col, hot;
      varying vec2 vQ;
      ${NOISE}
      void main() {
        float r = length(vQ) / rc, a = atan(vQ.y, vQ.x);
        #if CORE
          if (r > 1.0) discard;
          float z = sqrt(1.0 - r * r), edge = 1.0 - z;
          // the field's currents: bands flowing round the horizon, seen only toward its edge
          float f = uN(vec3(cos(a) * 2.5, sin(a) * 2.5, r * 4.0 - time * 0.9)) * uN(vec3(cos(a + time * 0.4) * 6.0, sin(a + time * 0.4) * 6.0, time * 0.3));
          vec3 c = col * (pow(edge, 5.0) * (1.2 + 1.6 * boost) + f * 0.35 * pow(edge, 1.5)) + hot * pow(edge, 10.0) * (0.6 + 1.2 * boost + 2.0 * flare);
          gl_FragColor = vec4(c * glow, 1.0);
        #else
          if (r < 0.985) discard;
          float d = r - 1.0;
          // the ring hugging the horizon (breathing), a soft glow round it, slow streaks of light wheeling round
          float ring = exp(-pow(d / (0.07 + 0.04 * boost), 2.0)) * (0.85 + 0.15 * sin(time * 5.0));
          float halo = exp(-d * (3.2 - 1.4 * boost)) * smoothstep(0.0, 0.08, d);
          float sw = pow(0.5 + 0.5 * sin(a * 3.0 - time * 2.2 + d * 9.0), 6.0) * exp(-d * 2.4) * smoothstep(0.0, 0.15, d);
          vec3 c = mix(col, hot, 0.35 + 0.45 * boost) * ring * (1.6 + 1.8 * boost + 6.0 * flare) + col * (halo * (0.3 + 0.6 * boost) + sw * (0.45 + 0.7 * boost));
          gl_FragColor = vec4(c * glow * smoothstep(1.0, 0.75, d / 2.6), 1.0);
        #endif
      }`,
  });
}

// A containment ring: a thin glowing tube (TorusGeometry: uv.x round the ring) - light pulses chasing round it, the
// clamps (bright nodes fixed on it), brightest along the tube's middle as seen (a neon line, not a flat band)
function ringMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { time: { value: 0 }, k: { value: 0 }, dir: { value: 1 }, nodes: { value: 4 },
      col: { value: new THREE.Color(0.5, 0.2, 1.0) }, hot: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN, vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float time, k, dir, nodes; uniform vec3 col, hot;
      varying vec2 vUv; varying vec3 vN, vV;
      void main() {
        float a = vUv.x;
        float chase = pow(0.5 + 0.5 * cos(6.2831853 * (a * 3.0 - dir * time)), 14.0);          // three pulses round it
        float node = smoothstep(0.035, 0.0, abs(fract(a * nodes) - 0.5) - 0.465);             // the clamps
        float mid = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);                          // (the tube's middle)
        vec3 deep = col * col / max(max(col.r, col.g), max(col.b, 0.05));                    // (the paint's colour, deepened:
        vec3 c = deep * (0.35 + 1.6 * chase) + hot * (node * 1.0 + pow(chase, 3.0) * 0.3);    //  a bright tint tone-maps pale)
        gl_FragColor = vec4(c * (0.25 + 0.75 * mid) * k, 1.0);
      }`,
  });
}

// Matter falling in: streaks spiralling from round the mouth into the hole - each its own ring radius, start angle,
// distance aft and fall time; drawn along its own motion (the last moment of its path), white-hot as it nears the hole.
// out: the brake (it has no brake lights) - the same matter thrown back out of the hole, a widening spray of sparks
// spiralling aft out of the mouth, white-hot leaving it and cooling to red
function inflowMaterial(out = false) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    defines: { OUT: out ? 1 : 0 },
    uniforms: { time: { value: 0 }, power: { value: 0 }, rate: { value: 1 }, swirl: { value: 0 }, mouth: { value: 0.4 }, freeze: { value: 0 },
      col: { value: new THREE.Color(0.5, 0.2, 1.0) }, hot: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */`
      uniform float time, power, rate, swirl, mouth, freeze;
      attribute vec4 seed;                // ring radius, start angle, distance aft, fall time
      varying vec2 vQ; varying float vA, vH;
      vec3 at(float u) {
        #if OUT
          float r = 0.08 + seed.x * 1.9 * u;                        // (fanning wide: past the drum's rim, seen from behind)
          float a = seed.y - (1.2 + swirl) * u;
          float z = 0.2 + seed.z * 1.5 * u;                          // (out of the hole, past the mouth and on aft)
        #else
          float r = seed.x * pow(1.0 - u, 1.3) + 0.04;
          float a = seed.y + (3.0 + swirl) * u * u;
          float z = seed.z * (1.0 - u) * (1.0 - u);                  // (aft is +z in the ship's frame)
        #endif
        return vec3(r * cos(a), r * sin(a), z);
      }
      void main() {
        #if OUT
          float u = fract(time * rate * 1.8 / seed.w + seed.y * 7.31);
        #else
          // (time slowed round the hole - the boost: a fall seen from outside never ends; the streaks crowd in to the
          // horizon and hang there, reddening to nothing)
          float u = 1.0 - pow(1.0 - fract(time * rate / seed.w + seed.y * 7.31), 1.0 + 3.0 * freeze);
        #endif
        #if OUT
          vec4 A = modelViewMatrix * vec4(at(u), 1.0), B = modelViewMatrix * vec4(at(max(u - 0.09, 0.0)), 1.0);   // (longer streaks)
        #else
          vec4 A = modelViewMatrix * vec4(at(u), 1.0), B = modelViewMatrix * vec4(at(max(u - 0.035, 0.0)), 1.0);
        #endif
        vec3 d = A.xyz - B.xyz;
        float len = length(d);
        vec3 ax = len > 1e-5 ? d / len : vec3(0.0, 1.0, 0.0);
        vec3 side = normalize(cross(normalize(A.xyz), ax));
        #if OUT
          float w = 0.022 + 0.022 * (1.0 - u);
        #else
          float w = 0.006 + 0.008 * (1.0 - u);
        #endif
        vec4 mv = vec4(mix(B.xyz, A.xyz, position.y + 0.5) + side * position.x * w, 1.0);
        vQ = position.xy * 2.0;
        #if OUT
          vA = power * smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.55, u);
        #else
          vA = power * smoothstep(0.0, 0.15, u) * smoothstep(0.82, 0.55, u);
        #endif
        vH = u;
        gl_Position = power > 0.0 ? projectionMatrix * mv : vec4(0.0, 0.0, -2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float freeze; uniform vec3 col, hot;
      varying vec2 vQ; varying float vA, vH;
      void main() {
        float m = (1.0 - vQ.x * vQ.x) * smoothstep(-1.0, 0.2, vQ.y);
        // (in the paint's colour, white-hot as it nears the core)
        vec3 c = mix(col, mix(col, hot, 0.6), smoothstep(0.3, 0.8, vH));
        c = mix(c, hot, 0.5 * smoothstep(0.55, 0.8, vH));
        float red = freeze * smoothstep(0.55, 1.0, vH);                      // (the light from the hanging matter redshifted)
        c = mix(c, vec3(1.0, 0.18, 0.08) * (1.0 - 0.85 * smoothstep(0.9, 1.0, vH)), red);
        #if OUT
          c = mix(vec3(1.0, 0.7, 0.45), vec3(1.0, 0.1, 0.03), smoothstep(0.02, 0.25, vH));
          gl_FragColor = vec4(c * m * vA * (3.5 + 4.0 * (1.0 - vH)), 1.0);
        #else
          gl_FragColor = vec4(c * m * vA * (1.5 + 3.5 * vH), 1.0);
        #endif
      }`,
  });
}

// Each livery's light: the field's glow and its boost, the aura's tint (lum: how much the wisps glow rather than darken
// - a dark smoke on the violet, a pale luminous mist on the pearl, a golden haze on the gold), the hull's rim light. The
// black hole's own disk and infall stay as they are: that is the engine, not the paint.
export const UMBRA_GLOW = {
  umbra: { glow: [0.5, 0.2, 1.0], boost: [0.15, 0.85, 1.0], aura: [0.42, 0.18, 1.0], lum: 0, rim: [0.42, 0.16, 1.0] },
  horizon: { glow: [0.72, 0.84, 1.0], boost: [0.45, 0.9, 1.0], aura: [0.85, 0.9, 1.0], lum: 0.55, rim: [0.75, 0.85, 1.0] },
  pharaoh: { glow: [1.0, 0.58, 0.14], boost: [1.0, 0.86, 0.45], aura: [1.0, 0.55, 0.14], lum: 0.3, rim: [1.0, 0.56, 0.16] },
  rose: { glow: [1.0, 0.16, 0.5], boost: [1.0, 0.62, 0.86], aura: [1.0, 0.2, 0.52], lum: 0.25, rim: [1.0, 0.24, 0.55] },   // (a rival's own: ships.js RIVAL_PAINT)
};

// The aura: soft dark wisps rising off points spread over the hull (area-weighted), each on its own clock - out along
// its point's normal, up and aft (more aft with speed), growing and fading, turned and billowed by noise. Dark smoke
// in front of a bright sky, a violet sheen at the edges in front of a dark one; the embers are a few bright violet
// motes among them (additive: drawn by the second material from the same buffers).
function auraMaterial(embers) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: embers ? THREE.CustomBlending : THREE.NormalBlending,
    blendSrc: THREE.OneFactor, blendDst: embers ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    premultipliedAlpha: true,
    defines: { EMBERS: embers ? 1 : 0 },
    uniforms: { time: { value: 0 }, k: { value: 0 }, aft: { value: 0 }, tint: { value: new THREE.Color(0.42, 0.18, 1.0) }, lum: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float time, k, aft;
      attribute vec3 p0; attribute vec3 n0; attribute vec2 seed;     // the point on the hull, its normal; seed, rate
      varying vec2 vUv; varying float vA, vS, vU;
      void main() {
        float u = fract(time * seed.y + seed.x * 13.7);
        vU = u; vS = seed.x;
        #if EMBERS
          if (fract(seed.x * 7.13) > 0.22) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
        #endif
        vec3 p = p0 + n0 * (0.04 + 0.55 * u) + vec3(0.0, 0.35 * u * u, 0.0) + vec3(0.0, 0.0, aft * u * u);
        p += vec3(sin(time * 1.3 + seed.x * 40.0), sin(time * 1.1 + seed.x * 23.0), cos(time * 0.9 + seed.x * 31.0)) * 0.12 * u;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        #if EMBERS
          float sz = 0.035 * (1.0 - u);
        #else
          float sz = 0.16 + 0.55 * u;
        #endif
        float a = time * (0.25 + seed.x) + seed.x * 6.28;
        mv.xy += mat2(cos(a), sin(a), -sin(a), cos(a)) * position.xy * sz;
        vUv = uv;
        vA = k * smoothstep(0.0, 0.18, u) * (1.0 - u);
        gl_Position = k > 0.0 ? projectionMatrix * mv : vec4(0.0, 0.0, -2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 tint; uniform float time, lum;
      varying vec2 vUv; varying float vA, vS, vU;
      ${NOISE}
      void main() {
        vec2 q = vUv - 0.5;
        float r = length(q) * 2.0;
        #if EMBERS
          float m = exp(-r * r * 6.0);
          gl_FragColor = vec4(tint * 3.0 * m * vA, 1.0);
        #else
          float n = uN(vec3(q * 3.5, vS * 17.0 + time * 0.5)) * 0.6 + uN(vec3(q * 8.0, vS * 5.0 - time * 0.7)) * 0.4;
          float d = smoothstep(0.62, 0.92, n + 0.55 * (1.0 - r)) * smoothstep(1.0, 0.6, r);
          float a = d * vA * 0.55;
          gl_FragColor = vec4(tint * mix(0.07, 0.6, lum) * a, a * (1.0 - 0.35 * lum));
        #endif
      }`,
  });
}

// The field across each blade's gap: two crossed sheets from the pod's emitter to the blade's shoe (local y: 0 at the
// pad .. 1 at the shoe; x along the pad's length, the second sheet across its height) - bands of light running out to
// the shoe and flickering, faded at both faces and at the pad's ends
function fieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { time: { value: 0 }, k: { value: 0 }, col: { value: new THREE.Color(0.42, 0.2, 1.0) } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float time, k; uniform vec3 col; varying vec2 vUv;
      ${NOISE}
      void main() {
        float y = vUv.y, x = vUv.x;
        float n = uN(vec3(x * 9.0, y * 3.0 - time * 3.0, time * 1.7));
        float bands = 0.5 + 0.5 * sin((y - time * 1.6) * 34.0 + n * 5.0);
        float f = smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.85, y) * smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x);
        float flick = 0.75 + 0.25 * sin(time * 37.0 + x * 13.0);
        gl_FragColor = vec4(col * f * (0.25 + 0.9 * bands * n) * flick * k, 1.0);
      }`,
  });
}

// Lightning across each blade's gap: ribbons turned to face the camera (position: the bolt's point; tang: its way on;
// side -1..1 across it; wid its half width; bright its strike's), a thin white-hot core in a glow of the field's colour
// - additive, bright enough for the bloom to halo it
function arcMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    uniforms: { col: { value: new THREE.Color(0.5, 0.2, 1.0) }, k: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 tang; attribute float side, wid, bright;
      varying float vSide, vBright;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 tv = (modelViewMatrix * vec4(tang, 0.0)).xyz;
        vec3 across = normalize(cross(normalize(tv + vec3(1e-5)), normalize(-mv.xyz)));
        mv.xyz += across * side * wid;
        vSide = side; vBright = bright;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 col; uniform float k; varying float vSide, vBright;
      void main() {
        float d = abs(vSide);
        float core = exp(-d * d * 60.0), glow = exp(-d * d * 5.0) * (1.0 - d);
        vec3 c = mix(col, vec3(1.0), 0.85 * core) * (3.2 * core + 0.9 * glow);
        gl_FragColor = vec4(c * vBright * k, 1.0);
      }`,
  });
}

// ribbons for arcMaterial: polylines of the given point counts, two vertices a point (side -1, 1), drawn as strips
function ribbonMesh(counts, mat) {
  const nPts = counts.reduce((a, b) => a + b, 0), geo = new THREE.BufferGeometry();
  const side = new Float32Array(nPts * 2), idx = [];
  for (let i = 0; i < nPts; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
  let o = 0;
  for (const n of counts) {
    for (let i = 0; i < n - 1; i++) { const a = (o + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    o += n;
  }
  for (const [k, n] of [['position', 3], ['tang', 3], ['wid', 1], ['bright', 1]]) {
    geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(nPts * 2 * n), n).setUsage(THREE.DynamicDrawUsage));
  }
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4;
  return mesh;
}

// Dark matter out of the hole: on the boost, jets of it streaming aft out of the mouth - dark billows (smoke-black with
// a violet sheen, drawn over what is behind) spiralling round the axis and opening out, violet sparks whirling through
// them (additive, the second material over the same buffers); at ignition a ring of it thrown out round the mouth
// (burst 0..1 its progress, burstK how much). seed: radius, angle, jet length, rate.
function darkMatterMaterial(sparks) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: sparks ? THREE.CustomBlending : THREE.NormalBlending,
    blendSrc: THREE.OneFactor, blendDst: sparks ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    defines: { SPARKS: sparks ? 1 : 0 },
    uniforms: { time: { value: 0 }, k: { value: 0 }, burst: { value: 1 }, burstK: { value: 0 }, mouth: { value: 0.4 },
      col: { value: new THREE.Color(0.5, 0.25, 1.0) }, dil: { value: 0 }, lum: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float time, k, burst, burstK, mouth, dil;
      attribute vec4 seed;
      varying vec2 vUv; varying float vA, vU, vS;
      void main() {
        float pick = fract(seed.y * 7.13);
        #if SPARKS
          if (pick > 0.32) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
        #else
          if (pick <= 0.32) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
        #endif
        float u = fract(time * seed.w + seed.y * 3.7);
        float a = seed.y * 6.2832 + u * (3.0 + 2.5 * seed.x) + time * 2.6;
        float r = 0.22 + 0.35 * seed.x + u * u * (1.0 + 2.4 * seed.x);
        vec3 p = vec3(cos(a) * r, sin(a) * r, mouth + pow(u, 1.0 + 1.6 * dil) * seed.z);   // (dil: crawling near the mouth)
        float alpha = k * smoothstep(0.0, 0.12, u) * (1.0 - u);
        if (burstK > 0.0) {            // the ignition's ring, out round the mouth and a little aft
          float rr = 0.5 + burst * (5.0 + 5.0 * seed.x);
          vec3 q = vec3(cos(seed.y * 6.2832) * rr, sin(seed.y * 6.2832) * rr, mouth + burst * (1.0 + 2.0 * seed.x));
          p = mix(p, q, burstK);
          alpha = max(alpha * (1.0 - burstK), burstK * (1.0 - burst));
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        #if SPARKS
          float sz = 0.05 + 0.05 * (1.0 - u);
        #else
          float sz = 0.35 + 1.9 * u + 1.5 * burstK * burst;
        #endif
        float rot = seed.y * 9.0 + time * (seed.x - 0.5);
        mv.xy += mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * position.xy * sz;
        vUv = uv; vA = alpha; vU = u; vS = seed.x;
        gl_Position = alpha > 0.002 ? projectionMatrix * mv : vec4(0.0, 0.0, -2.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float time, lum; uniform vec3 col;
      varying vec2 vUv; varying float vA, vU, vS;
      ${NOISE}
      void main() {
        vec2 q = vUv - 0.5;
        float r = length(q) * 2.0;
        #if SPARKS
          gl_FragColor = vec4(mix(col, vec3(1.0), 0.35) * 3.5 * exp(-r * r * 5.0) * vA, 1.0);
        #else
          float n = uN(vec3(q * 3.6, vS * 11.0 - time * 0.9)) * 0.6 + uN(vec3(q * 8.0, vS * 3.0 + time * 1.3)) * 0.4;
          float d = smoothstep(0.6, 0.9, n + 0.55 * (1.0 - r)) * smoothstep(1.0, 0.55, r);
          float a = d * vA * 0.7;
          gl_FragColor = vec4(col * (mix(0.06, 0.5, lum) + 0.25 * smoothstep(0.3, 0.8, r) * d) * a, a * (1.0 - 0.3 * lum));
        #endif
      }`,
  });
}

// points spread over the meshes' surfaces by area (in the frame of `root`), with their normals
function surfacePoints(meshes, root, n) {
  const tris = [], inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let total = 0;
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, I = g.index, M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const nt = I ? I.count / 3 : P.count / 3;
    const step = Math.max(1, Math.floor(nt / 6000));          // (a few thousand triangles say where the surface is)
    for (let t = 0; t < nt; t += step) {
      const i0 = I ? I.getX(t * 3) : t * 3, i1 = I ? I.getX(t * 3 + 1) : t * 3 + 1, i2 = I ? I.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(P, i0).applyMatrix4(M); b.fromBufferAttribute(P, i1).applyMatrix4(M); c.fromBufferAttribute(P, i2).applyMatrix4(M);
      const nn = e1.subVectors(b, a).cross(e2.subVectors(c, a)), area = nn.length() / 2;
      if (area < 1e-6) continue;
      total += area * step;
      tris.push([a.clone(), b.clone(), c.clone(), nn.clone().normalize(), total]);
    }
  }
  const out = [];
  let rnd = 7;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < n && tris.length; k++) {
    const x = r() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid][4] < x) lo = mid + 1; else hi = mid; }
    const [A, B, C, N] = tris[lo];
    let u = r(), v = r();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out.push([A.clone().addScaledVector(e1.subVectors(B, A), u).addScaledVector(e2.subVectors(C, A), v), N]);
  }
  return out;
}

export class Umbra {
  // ship: the Ship; node: the BlackHole marker (extras.blackhole: rs, disk [in, out] in metres, mouth - how far the
  // mouth is aft of the hole); hull: the meshes the aura rises from; opts.steps: the ray-march's steps (fewer on a
  // weak GPU)
  constructor(ship, node, hull, opts = {}) {
    const B = typeof node.userData.blackhole === 'string' ? JSON.parse(node.userData.blackhole) : node.userData.blackhole;
    this.B = B;
    this.ship = ship;
    this.group = new THREE.Group();
    ship.visual.updateMatrixWorld(true);
    node.updateMatrixWorld(true);
    this.group.position.copy(ship.visual.worldToLocal(node.getWorldPosition(new THREE.Vector3())));
    ship.visual.add(this.group);
    // the singularity: its core (black, its rim), the halo over it, and the three containment rings round it - their
    // radii inside the bore (0.70 m) whichever way they turn
    this.rc = B.rs * 1.9;
    this.coreMat = coreMaterial(true);
    this.haloMat = coreMaterial(false);
    const quad = new THREE.PlaneGeometry(2, 2);
    this.hole = new THREE.Mesh(quad, this.coreMat);
    this.halo = new THREE.Mesh(quad, this.haloMat);
    this.hole.frustumCulled = this.halo.frustumCulled = false;
    this.halo.renderOrder = 3;
    this.group.add(this.hole, this.halo);
    // each ring: its radius, its tumble (the axis its plane turns about, the tilt it starts at, how fast), its pulses'
    // way round, its clamps
    const R1 = B.disk[1] * 0.9;
    this.rings = [[R1 * 0.56, [0, 1, 0], 0.5, 0.9, 1, 3], [R1 * 0.78, [1, 0, 0], 1.1, -0.7, -1, 4], [R1, [0.7, 0.7, 0], 0.3, 0.55, 1, 6]].map(([R, ax, tilt, w, dir, nodes]) => {
      const m = ringMaterial();
      m.uniforms.dir.value = dir;
      m.uniforms.nodes.value = nodes;
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012 + 0.008 * R, 8, 160), m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      return { mesh, axis: new THREE.Vector3(...ax).normalize(), tilt, w, dir, a: tilt * 3.0, roll: 0 };
    });
    this.align = 0;
    // matter falling in
    const N = 120, q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index;
    g.setAttribute('position', q.attributes.position);
    g.setAttribute('uv', q.attributes.uv);
    const S = new Float32Array(N * 4);
    let rnd = 3;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) S.set([0.45 + 0.75 * r(), r() * Math.PI * 2, (B.mouth || 0.4) + 0.2 + 0.9 * r(), 0.6 + 0.6 * r()], i * 4);
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(S, 4));
    g.instanceCount = N;
    this.inMat = inflowMaterial();
    this.inMat.uniforms.mouth.value = B.mouth || 0.4;
    this.inflow = new THREE.Mesh(g, this.inMat);
    this.inflow.frustumCulled = false;
    this.inflow.renderOrder = 3;
    this.group.add(this.inflow);
    // the brake's spray: the same streaks, thrown back out (inflowMaterial out)
    this.outMat = inflowMaterial(true);
    this.outMat.uniforms.mouth.value = B.mouth || 0.4;
    this.outflow = new THREE.Mesh(g, this.outMat);
    this.outflow.frustumCulled = false;
    this.outflow.renderOrder = 3;
    this.group.add(this.outflow);
    this.brk = 0;
    // the aura
    const pts = surfacePoints(hull, ship.visual, opts.wisps || 520), M = pts.length;
    const ag = new THREE.InstancedBufferGeometry(), aq = new THREE.PlaneGeometry(1, 1);
    ag.index = aq.index;
    ag.setAttribute('position', aq.attributes.position);
    ag.setAttribute('uv', aq.attributes.uv);
    const P0 = new Float32Array(M * 3), N0 = new Float32Array(M * 3), SD = new Float32Array(M * 2);
    pts.forEach(([p, n], i) => { P0.set([p.x, p.y, p.z], i * 3); N0.set([n.x, n.y, n.z], i * 3); SD.set([r(), 0.35 + 0.45 * r()], i * 2); });
    ag.setAttribute('p0', new THREE.InstancedBufferAttribute(P0, 3));
    ag.setAttribute('n0', new THREE.InstancedBufferAttribute(N0, 3));
    ag.setAttribute('seed', new THREE.InstancedBufferAttribute(SD, 2));
    ag.instanceCount = M;
    this.auraMat = auraMaterial(false);
    this.emberMat = auraMaterial(true);
    this.aura = new THREE.Mesh(ag, this.auraMat);
    this.embers = new THREE.Mesh(ag, this.emberMat);
    for (const m of [this.aura, this.embers]) { m.frustumCulled = false; m.renderOrder = 3; ship.visual.add(m); }
    // the ship's engine light (its plume's) moved into the mouth and warmed to the disk's light: the bore's walls, the
    // mouth and the deck behind lit by the hole's disk
    const lamp = ship.exhaustLights?.[0];
    if (lamp) {
      lamp.position.copy(this.group.position).add(new THREE.Vector3(0, 0, (B.mouth || 0.4) * 0.6));
      lamp.color.setRGB(1.0, 0.56, 0.45);
      lamp.distance = 14;
    }
    // the fields holding the blades
    this.fieldMat = fieldMaterial();
    this.fields = (ship.floaters || []).map((f) => {
      const g = new THREE.Group(), gap = f.gap || 0.3;
      const along = new THREE.Vector3(0, 0, -1).addScaledVector(f.n, f.n.z).normalize();   // (the pad's length: fore and aft)
      const across = new THREE.Vector3().crossVectors(along, f.n).normalize();
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, f.n, across));
      for (const [w, rot] of [[1.8, 0], [0.16, Math.PI / 2]]) {
        const pg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
        const m = new THREE.Mesh(pg, this.fieldMat);
        m.scale.set(w, 1, 1);
        m.rotation.y = rot;
        m.frustumCulled = false;
        m.renderOrder = 3;
        g.add(m);
      }
      ship.visual.add(g);                         // (the model is in the visual frame; never in the model: copies clone it)
      return { f, g, gap };
    });
    // the lightning across each gap (in the field's frame: x along the pad, y 0 at the pad .. 1 at the shoe - scaled to
    // the gap with the sheets - z across): bolts of ARC_N points struck from the pad to the shoe, each with a branch
    this.arcMat = arcMaterial();
    const arcSet = (g, n, o) => {
      const mesh = ribbonMesh(Array.from({ length: n }, () => [ARC_N, ARC_NB]).flat(), this.arcMat);
      g.add(mesh);
      return { mesh, bolts: Array.from({ length: n }, () => ({ life: 0, x0: 0, x1: 0, z0: 0, z1: 0, b: 0, seed: 0, jit: 0 })), ...o };
    };
    this.arcs = this.fields.map(({ g }) => arcSet(g, ARC_BOLTS, { spread: 0.78, drift: 0.35, amp: 0.09, branch: 0.36 }));
    // the charging beam between the two glowing slits on the nose's prongs' inner faces (ship-local, measured off the
    // model's glow parts: their inner edges at x -0.225 and 0.225, y -0.78, from z -6.46 to -5.63): a beam straight
    // across at their middle, two strands of light winding round it, its heart swelling - charging up and releasing
    this.nose = new THREE.Group();                // (shown and hidden with the hull)
    ship.visual.add(this.nose);
    this.chargeCore = ribbonMesh([CHARGE_N], this.arcMat);
    this.chargeSpiral = ribbonMesh([CHARGE_S, CHARGE_S], this.arcMat);
    this.chargeHeart = ribbonMesh([3], this.arcMat);
    this.nose.add(this.chargeCore, this.chargeSpiral, this.chargeHeart);
    this.chargeT = 0; this.chargeRot = 0;
    this.arcRnd = Math.random;
    // the dark matter
    const ND = 220, dg = new THREE.InstancedBufferGeometry(), dq = new THREE.PlaneGeometry(1, 1);
    dg.index = dq.index;
    dg.setAttribute('position', dq.attributes.position);
    dg.setAttribute('uv', dq.attributes.uv);
    const DS = new Float32Array(ND * 4);
    for (let i = 0; i < ND; i++) DS.set([r(), r(), 6 + 14 * r(), 0.9 + 0.9 * r()], i * 4);
    dg.setAttribute('seed', new THREE.InstancedBufferAttribute(DS, 4));
    dg.instanceCount = ND;
    this.dmMat = darkMatterMaterial(false);
    this.dmSparkMat = darkMatterMaterial(true);
    this.darkMatter = [this.dmMat, this.dmSparkMat].map((m) => {
      m.uniforms.mouth.value = B.mouth || 0.4;
      const mesh = new THREE.Mesh(dg, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      return mesh;
    });
    // the field's colours: violet, electric cyan on the boost - the blades' own glows (veins, rails, bands, cores), the
    // sheets across the gaps and the atlas's field parts (the pods' emitters, the drum's slots)
    this.violet = new THREE.Color(0.5, 0.2, 1.0);
    this.cyan = new THREE.Color(0.15, 0.85, 1.0);
    this.fieldCol = new THREE.Color();
    const white = new THREE.Color(1, 1, 1);
    this.glowParts = (ship.partE || []).filter((q) => q.kind === 'glow').map((q) => {
      const core = Math.min(q.e.r, q.e.g, q.e.b) > 0.35;
      return { q, core, own: q.e.clone(), lum: Math.max(q.e.r, q.e.g, q.e.b), base: q.e.clone(), boosted: this.cyan.clone().lerp(white, core ? 0.6 : 0) };
    });
    this.rimCol = new THREE.Color(0.42, 0.16, 1.0);
    this.formK = 0;
    this.dil = 0;                                 // how far time is slowed round the engine (the boost) 0..1
    this.tl = 0;                                  // the engine's own clock, running slow with it
    this.ta = 0;                                  // the aura's: slowed less (at a fifth its wisps read as stopped)
    this.flash = 0;
    this.burst = 1;
    this.lit = false;
    this.t = 0;
    this.spinA = 0;
    this.glow = 0;
  }

  // power: the reactor 0..1; thr, boost 0..1; speed m/s; aura, time: the settings
  // hy: the hyper boost (ship.js HYPER) - the singularity overdriven: the rings spinning hard and breathing, the core
  // and the disk burning brighter, the dark matter's jets doubled
  update(dt, power, thr, boost, speed, aura = true, time = true, brake = 0, arcs = true, hy = 0) {
    this.t += dt;
    this.hy = hy;
    // the brake (the brake lights' signal, 0 with the setting off): the infall turned round - in at once, out over a
    // quarter second
    this.brk += (brake - this.brk) * (1 - Math.exp(-dt / (brake > this.brk ? 0.06 : 0.25)));
    // the boost bends time round the hole: near it the engine's own clock runs at a fifth of the world's - the disk
    // turning slowly, the infall hanging at the horizon, the wisps and motes drifting as in slow motion (and the
    // picture of the world round it held back - post.js EngineHeatPass, from timeSource)
    const dT = aura && time ? power * THREE.MathUtils.smoothstep(boost, 0.1, 0.8) : 0;
    this.dil += (dT - this.dil) * (1 - Math.exp(-dt / (dT > this.dil ? 0.35 : 0.8)));
    const gamma = 1 - 0.8 * this.dil, dtl = dt * gamma;
    this.tl += dtl;
    this.ta += dt * (0.6 - 0.18 * this.dil);       // (the wisps and embers: 0.6 of the world's pace, ~0.4 on the boost)
    const B = this.B;
    // the start: the hole forms - from a point to its full size as the reactor comes up - and at ignition the disk
    // lights in a flash, a ring of dark matter thrown out round the mouth and a ripple of bent space (onWave)
    const form = THREE.MathUtils.smoothstep(power, 0.05, 0.85);
    this.formK += (form - this.formK) * (1 - Math.exp(-dt / 0.15));
    const fk = Math.max(this.formK, 0.002);
    const C = this.coreMat.uniforms, H = this.haloMat.uniforms;
    C.rc.value = H.rc.value = this.rc * fk;
    C.size.value = this.rc * 1.05 * fk;
    H.size.value = this.rc * 3.8 * fk;
    if (!this.lit && power > 0.3) {
      this.lit = true; this.flash = 1; this.burst = 0;
      this.ship.onWave?.(this.group.getWorldPosition(_d), 1);
    } else if (power < 0.05) this.lit = false;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.burst = Math.min(1, this.burst + dt / 0.9);
    // the singularity: dim parked, brighter with the throttle, flaring on the boost
    this.glow += ((0.08 + power * (0.75 + 0.35 * thr + 0.9 * boost + 0.9 * hy)) - this.glow) * (1 - Math.exp(-dt / 0.25));
    const lightK = this.glow + 4.0 * this.flash * this.flash;
    // the dark matter: jets on the boost, the ring at ignition
    for (const m of [this.dmMat, this.dmSparkMat]) {
      const D = m.uniforms;
      D.time.value = this.t;
      D.k.value = aura ? power * boost * (1 + hy) : 0;
      D.burst.value = this.burst;
      D.burstK.value = aura && this.burst < 1 ? 1 : 0;
      D.dil.value = this.dil;
    }
    // the field's colour: violet, cyan on the boost
    const fb = THREE.MathUtils.smoothstep(boost, 0.1, 0.8);
    this.fieldCol.copy(this.violet).lerp(this.cyan, fb);
    this.fieldMat.uniforms.col.value.copy(this.fieldCol).multiplyScalar(0.85);
    this.dmSparkMat.uniforms.col.value.copy(this.fieldCol);
    const M = this.ship.mats;
    if (M.EngineGlow) M.EngineGlow.emissive.copy(this.fieldCol);
    if (M.EngineCore) M.EngineCore.emissive.copy(this.fieldCol).lerp(_white, 0.6);
    for (const g of this.glowParts) g.q.e.copy(g.base).lerp(g.boosted, fb);
    this.updateRings(dt, power, thr, boost, fb, fk, lightK);
    const I = this.inMat.uniforms;
    // (its rate summed into a phase: time x a rate that changes jumped every streak along its fall)
    this.inPh = (this.inPh || 0) + dtl * (0.8 + 0.6 * thr + 1.6 * boost);
    I.time.value = this.inPh;
    I.freeze.value = this.dil;
    I.power.value = power * (0.35 + 0.4 * thr + 0.9 * boost) * (1 - this.brk);
    const O = this.outMat.uniforms;
    O.time.value = this.t;
    O.power.value = power * this.brk * 1.3;
    O.swirl.value = 1.0;
    I.rate.value = 1;
    I.swirl.value = 2.0 * boost;
    this.fieldMat.uniforms.time.value = this.t * 0.45;   // (its bands and flicker at under half the pace: they ran too fast)
    this.fieldMat.uniforms.k.value = 0.35 + 0.65 * power + 0.6 * boost + 0.5 * hy;
    for (const { f, g, gap } of this.fields) {      // (from the pad to the shoe wherever the blade has floated to)
      const off = _d.subVectors(f.node.position, f.base).dot(f.n);
      g.position.copy(f.base).addScaledVector(f.n, -gap);
      g.scale.y = Math.max(0.05, gap + off);
    }
    this.updateArcs(dt, arcs ? power : 0, thr, boost);
    // the livery's glowing pinstripes (the hull's emissive map): a low glow parked, breathing with the engine's beat
    // running, bright on the boost
    const hull = this.ship.mats.RacerBaked;
    if (hull && hull.emissiveMap) {
      const beat = 0.5 + 0.5 * Math.sin(this.tl * (1.6 + 2.0 * thr + 5.0 * boost));
      hull.emissiveIntensity = 0.35 + power * (0.7 + 0.35 * beat + 0.4 * thr) + 2.2 * boost * power;
    }
    if (this.ship.umbraU) {
      this.ship.umbraU.rim.value.copy(this.rimCol).multiplyScalar(aura ? 0.05 + power * (0.1 + 0.08 * thr) + 0.5 * boost * power : 0);
    }
    for (const m of [this.auraMat, this.emberMat]) {
      const A = m.uniforms;
      A.time.value = this.ta;
      A.k.value = aura ? 0.35 + 0.65 * power + 0.4 * boost : 0;
      A.aft.value = 0.4 + Math.min(speed, 120) * 0.035 + 1.5 * boost;
    }
  }

  // the lightning: each bolt struck for a tenth to a third of a second, then again somewhere else along the pad - more
  // of them, brighter and longer with the throttle and the boost; its kinks thrown anew every ~1/16 s (the crackle), each
  // with a branch forking off part way and dying out
  updateArcs(dt, power, thr, boost) {
    const R = this.arcRnd, live = power > 0.05;
    this.arcMat.uniforms.col.value.copy(this.fieldCol);
    this.arcMat.uniforms.k.value = power * (0.55 + 0.45 * thr + 0.9 * boost);
    const rate = 0.25 + 0.5 * thr + 0.9 * boost;   // the share of the bolts alight at a time
    for (const { mesh, bolts, spread, drift, amp: amp0, branch, zr = 0.05, flare: fl = 1.4, w: ws = 1, br: bs = 1 } of this.arcs) {
      mesh.visible = live;
      if (!live) continue;
      const G = mesh.geometry, P = G.attributes.position.array, T = G.attributes.tang.array;
      const W = G.attributes.wid.array, Bv = G.attributes.bright.array;
      const sy = Math.max(0.05, mesh.parent.scale.y);   // (the gap's length: y is drawn in it)
      let o = 0;
      for (const b of bolts) {
        b.life -= dt; b.jit -= dt;
        if (b.life <= 0) {                           // a new strike - or a dark spell, by the rate
          const on = R() < rate;
          b.life = on ? 0.1 + 0.25 * R() + 0.15 * boost * R() : 0.06 + 0.18 * R();
          b.b = on ? 0.55 + 0.6 * R() + (R() < 0.12 ? 0.8 : 0) : 0;
          b.x0 = (R() * 2 - 1) * spread; b.x1 = Math.max(-spread - 0.07, Math.min(spread + 0.07, b.x0 + (R() * 2 - 1) * drift));
          b.z0 = (R() * 2 - 1) * zr; b.z1 = (R() * 2 - 1) * zr;
          b.jit = 0;
        }
        if (b.jit <= 0) { b.seed = R() * 1000; b.jit = 1 / 16; }
        const fade = Math.min(1, b.life / 0.06) * b.b;
        // the main bolt: from the pad's point to the shoe's, kinked across x and z (most at the middle)
        const amp = amp0 * (1 + 0.55 * boost), h = (i, k) => { const s = Math.sin((b.seed + i * 12.9898 + k * 78.233) * 43758.5453); return (s - Math.floor(s)) * 2 - 1; };
        const pts = [];
        for (let i = 0; i < ARC_N; i++) {
          const t = i / (ARC_N - 1), env = Math.sin(Math.PI * t) ** 0.7;
          const big = (k) => h(Math.floor(i / 3), k) * amp, fine = (k) => h(i, k + 10) * amp * 0.35;
          pts.push([b.x0 + (b.x1 - b.x0) * t + (big(1) + fine(1)) * env, t, b.z0 + (b.z1 - b.z0) * t + (big(2) + fine(2)) * 0.6 * env]);
        }
        // the branch: off the main bolt part way, out sideways and down the gap a little, thinning to nothing
        const at = 2 + Math.floor((ARC_N - 5) * ((h(7, 3) + 1) / 2)), dir = h(8, 4) < 0 ? -1 : 1, bp = [];
        for (let i = 0; i < ARC_NB; i++) {
          const t = i / (ARC_NB - 1), base = pts[at];
          bp.push([base[0] + dir * t * branch + h(i, 5) * branch * 0.17 * t, base[1] + t * 0.24 * (h(9, 6) + 1.2), base[2] + h(i, 7) * branch * 0.17 * t]);
        }
        for (const [list, w0, br] of [[pts, 0.055, 1], [bp, 0.035, 0.65]]) {
          for (let i = 0; i < list.length; i++) {
            const p = list[i], q = list[Math.min(list.length - 1, i + 1)], r0 = list[Math.max(0, i - 1)];
            const tx = q[0] - r0[0], ty = (q[1] - r0[1]) * sy, tz = q[2] - r0[2];
            const u = i / (list.length - 1), flare = list === bp ? 0 : fl * (Math.exp(-u * u * 120) + Math.exp(-(1 - u) * (1 - u) * 120));
            const end = list === bp ? 1 - u : 1 + flare;
            for (let s = 0; s < 2; s++) {
              const v = (o + i) * 2 + s;
              P[v * 3] = p[0]; P[v * 3 + 1] = p[1]; P[v * 3 + 2] = p[2];
              T[v * 3] = tx; T[v * 3 + 1] = ty / sy; T[v * 3 + 2] = tz;
              W[v] = ws * w0 * (0.6 + 0.4 * end) * (1 + 0.4 * boost);
              Bv[v] = bs * fade * br * Math.min(1 + 0.85 * fl, end) * (0.8 + 0.4 * (h(3, 9) + 1) / 2);
            }
          }
          o += list.length;
        }
      }
      for (const k of ['position', 'tang', 'wid', 'bright']) G.attributes[k].needsUpdate = true;
    }
    this.updateCharge(dt, power, thr, boost);
  }

  // the charging beam: a cycle of charge (1.8 s cruising, 1.1 s on the boost) - the strands winding in tighter and
  // turning faster, the beam and its heart swelling and brightening - then the release: a flash, and again. On the
  // world's clock (the nose is far from the bent time round the engine)
  updateCharge(dt, power, thr, boost) {
    const live = power > 0.05;
    for (const m of [this.chargeCore, this.chargeSpiral, this.chargeHeart]) m.visible = live;
    if (!live) return;
    this.chargeT += dt / (1.8 - 0.7 * boost);
    const c = this.chargeT % 1, ch = c * c * (3 - 2 * c), flash = Math.exp(-c / 0.05) + 0.35 * Math.exp(-c / 0.25);
    this.chargeRot += dt * Math.PI * 2 * (0.5 + 0.9 * ch) * (1 + 0.6 * boost);
    // (from inside one slit to inside the other - their glow lies 0.225 to 0.31 out on the faces: ended at the edges
    // it left a gap; the hull hides what is inside it)
    const t = this.t, X0 = -0.31, X1 = 0.31, Y = -0.782, Z = -6.048;
    const put = (mesh, list) => {                   // list: [x, y, z, tx, ty, tz, half width, brightness] a point
      const G = mesh.geometry, P = G.attributes.position.array, T = G.attributes.tang.array, W = G.attributes.wid.array, B = G.attributes.bright.array;
      list.forEach((q, i) => {
        for (let k = 0; k < 2; k++) {
          const v = i * 2 + k;
          P[v * 3] = q[0]; P[v * 3 + 1] = q[1]; P[v * 3 + 2] = q[2];
          T[v * 3] = q[3]; T[v * 3 + 1] = q[4]; T[v * 3 + 2] = q[5];
          W[v] = q[6]; B[v] = q[7];
        }
      });
      for (const k of ['position', 'tang', 'wid', 'bright']) G.attributes[k].needsUpdate = true;
    };
    // the beam: straight across, its light running along it, hotter where it meets the slits
    const core = [];
    for (let i = 0; i < CHARGE_N; i++) {
      const u = i / (CHARGE_N - 1), run = 0.65 + 0.35 * Math.sin(u * 14 - t * 5.0), end = Math.exp(-u * u * 80) + Math.exp(-(1 - u) * (1 - u) * 80);
      core.push([X0 + (X1 - X0) * u, Y, Z, 1, 0, 0, (0.014 + 0.02 * ch + 0.035 * flash) * (1 + 0.8 * end), (0.45 + 0.75 * ch + 2.2 * flash) * run * (1 + 1.2 * end)]);
    }
    put(this.chargeCore, core);
    // the strands: two helices round it, half a turn apart, pinched in to the beam at the slits, tightening with the
    // charge; pulses of light running round them
    const sp = [], r = 0.052 - 0.028 * ch, turns = 3.0;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < CHARGE_S; i++) {
        const u = i / (CHARGE_S - 1), env = Math.sqrt(Math.sin(Math.PI * u)), a = u * turns * Math.PI * 2 + this.chargeRot + k * Math.PI;
        const x = X0 + (X1 - X0) * u, y = Y + r * env * Math.cos(a), z = Z + r * env * Math.sin(a);
        // its way on: along the beam and round it
        const da = turns * Math.PI * 2 * (X1 - X0) / (X1 - X0);
        const tx = X1 - X0, ty = -r * env * Math.sin(a) * da, tz = r * env * Math.cos(a) * da;
        sp.push([x, y, z, tx, ty, tz, 0.0055 + 0.004 * ch + 0.006 * flash, (0.3 + 0.7 * ch + 1.4 * flash) * (0.55 + 0.45 * Math.sin(u * 18 - t * 4.0 + k * 3.1)) * env]);
      }
    }
    put(this.chargeSpiral, sp);
    // the heart: a short bright swell at the beam's middle
    const hw = 0.02 + 0.03 * ch + 0.07 * flash, hb = 0.6 + 1.1 * ch + 3.0 * flash;
    put(this.chargeHeart, [[-0.03, Y, Z, 1, 0, 0, hw * 0.6, hb * 0.5], [0, Y, Z, 1, 0, 0, hw, hb], [0.03, Y, Z, 1, 0, 0, hw * 0.6, hb * 0.5]]);
  }

  // the livery's light (UMBRA_GLOW): the field, its boost, the aura and the embers, the dark matter, the rim, the glowing
  // parts (each keeping its own brightness; the cores whiter), the pinstripes (ship.js: the baked violet map read as
  // their brightness, in this colour), the engine light
  setLivery(name) {
    const P = UMBRA_GLOW[name] || UMBRA_GLOW.umbra, white = new THREE.Color(1, 1, 1);
    this.violet.setRGB(...P.glow);
    this.cyan.setRGB(...P.boost);
    for (const m of [this.auraMat, this.emberMat]) { m.uniforms.tint.value.setRGB(...P.aura); m.uniforms.lum.value = P.lum; }
    this.dmMat.uniforms.col.value.setRGB(...P.aura);
    this.dmMat.uniforms.lum.value = P.lum;
    this.rimCol.setRGB(...P.rim);
    const own = name === 'umbra' || !UMBRA_GLOW[name];
    for (const g of this.glowParts) {
      g.base.copy(own ? g.own : this.violet.clone().multiplyScalar(g.lum).lerp(white, g.core ? 0.45 * g.lum : 0));
      g.boosted.copy(this.cyan).lerp(white, g.core ? 0.6 : 0);
    }
    if (this.ship.umbraU) this.ship.umbraU.glow.value.set(P.glow[0], P.glow[1], P.glow[2], own ? 0 : 1);
    for (const l of this.ship.exhaustLights || []) l.color.setRGB(...P.glow).lerp(white, 0.3);
    // the engine's own colour where the hull's lights take it: the drum's light rings and coil windings, the spine's
    // chase lights, the avionics, the trails (each
    // back to exactly what it was on the Umbra's own paint)
    const S = this.ship, c = new THREE.Color(...P.glow), hot = c.clone().lerp(white, 0.8);
    S.engineColor.copy(c);
    for (const U of [...(S.ringUs || []), ...(S.partU ? [S.partU] : [])]) { U.ringEng.value.copy(c); U.ringHot.value.copy(hot); }
    for (const q of S.pulses || []) if (q.mat) { q.mat.emissive.copy(c); if (q.stage < 0) q.mat.emissive.lerp(white, 0.6); }   // (the chase lights, the coils)
    for (const q of S.partE || []) if (q.kind === 'avi') {
      q.own ||= q.e.clone();
      q.e.copy(own ? q.own : c.clone().multiplyScalar(Math.max(q.own.r, q.own.g, q.own.b)).lerp(white, 0.3));
    }
    for (const t of [...(S.engineTrails || []), S.exhaust].filter(Boolean)) {
      const u = (t.mat || t.material || t.mesh?.material)?.uniforms;
      if (u?.colour) { u.colour.value.copy(c); u.hot?.value.copy(c).lerp(white, 0.75); u.tail?.value.copy(c).multiplyScalar(0.6); }
    }
  }

  // The containment rings: each tumbling about its own axis (a gyroscope, faster with the throttle), its pulses chasing
  // round it; on the boost all three swing into line round the bore - concentric, facing aft - and spin up, the
  // core's rim and halo flaring. They grow with the core as the reactor comes up
  updateRings(dt, power, thr, boost, fb, fk, lightK) {
    const C = this.coreMat.uniforms, H = this.haloMat.uniforms, hot = this.hotCol ||= new THREE.Color();
    hot.copy(this.fieldCol).lerp(_white, 0.75);
    this.align += (fb - this.align) * (1 - Math.exp(-dt / (fb > this.align ? 0.25 : 0.6)));
    const al = this.align * this.align * (3 - 2 * this.align);
    this.ringT = (this.ringT || 0) + dt * (0.6 + power * (0.6 + 0.9 * thr + 2.6 * boost));
    for (const U of [C, H]) {
      U.time.value = this.t;
      U.glow.value = lightK;
      U.boost.value += (boost - U.boost.value) * (1 - Math.exp(-dt / 0.2));
      U.flare.value = this.flash;
      U.col.value.copy(this.fieldCol);
      U.hot.value.copy(hot);
    }
    const qt = this.qt ||= new THREE.Quaternion(), qa = this.qa ||= new THREE.Quaternion(), zx = this.zx ||= new THREE.Vector3(0, 0, 1);
    for (const g of this.rings) {
      g.a += dt * g.w * (0.35 + power * (0.7 + 0.9 * thr)) * (1 - 0.6 * al);
      g.roll += dt * g.dir * (0.5 + power * (0.8 + 3.5 * boost)) * (1 + 2 * (this.hy || 0));
      // tumbling: the ring's plane tipped about its axis; lined up: square to the bore, turning round it
      qt.setFromAxisAngle(g.axis, g.a);
      qa.setFromAxisAngle(zx, g.roll);
      g.mesh.quaternion.copy(qt).multiply(qa).slerp(qa, al);
      g.mesh.scale.setScalar(Math.max(0.002, fk * (1 + 0.12 * al) * (1 + (this.hy || 0) * (0.14 + 0.05 * Math.sin(this.t * 9 + g.dir)))));
      const U = g.mesh.material.uniforms;
      U.time.value = this.ringT;
      U.k.value = lightK * (0.5 + 0.45 * al);
      U.col.value.copy(this.fieldCol);
      U.hot.value.copy(hot);
    }
    const I = this.inMat.uniforms;
    I.col.value.copy(this.fieldCol); I.hot.value.copy(hot);
  }

  // the whole of it in or out with the hull (a wreck flown through blinks)
  show(v) {
    this.group.visible = this.aura.visible = this.embers.visible = v;      // (the dark matter rides in the group)
    for (const q of this.fields) q.g.visible = v;
    if (this.nose) this.nose.visible = v;
  }

  // where time runs slow, for the post pass (post.js EngineHeatPass): the centre just aft of the mouth, its reach (m)
  // and how slow; reported whenever it can be (k 0 too: the pass keeps its record of the frames going)
  timeSource(cb) { cb(this.group.localToWorld(_d.set(0, 0, 1.2)), 3.5, this.dil * 0.7); }

  objects() { return [this.hole, this.halo, ...this.rings.map((g) => g.mesh), this.inflow, this.outflow, this.aura, this.embers, ...this.darkMatter, ...this.fields.flatMap((q) => q.g.children), ...(this.nose ? this.nose.children : [])]; }
}
