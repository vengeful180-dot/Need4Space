// Space: the backdrop (nebula, Milky Way band, stars, a ringed gas giant, the sun) rendered in its own scene and
// camera (huge distances, its own depth range), then the circuit. One hard sun, a faint warm planet-shine, starlight.
import * as THREE from 'three';
import { bakeLater } from './bake.js';
import { Q } from './quality.js';
import { mulberry32 } from './noise.js';
import { Track, TRACK_W, CAVE_R, CAVE_MOUTH, WRECK_R, WRECK_MOUTH } from './track.js';
import { Wreck } from './wreck.js';
import { setCave } from './look.js';
import { rockMaps, bakeRockShadow } from './rock.js';
import { hullMaps } from './hull.js';
import { Scenery } from './scenery.js';
import { giantMaterial, ringMaterial, sunMeshes, RING_IN, RING_OUT } from './celestial.js';
const TRACK_W_HALF = TRACK_W / 2;

export const SUN_DIR = new THREE.Vector3(0.74, 0.55, 0.38).normalize();      // toward the sun (33 deg up)
export const PLANET_DIR = new THREE.Vector3(-0.2, -0.3, -0.93).normalize();   // toward the planet: ahead, below
export const SUN_E = 5.5;                                                      // sun irradiance (three units)
// the sun's shadow in three cascades: a tight box on the player's ship (hull detail: the first single map stair-stepped
// a pipe's shadow on the hull), a box round the pack ahead (the rivals' hulls) and a wide one reaching ~300 m ahead of
// the camera ("shadow distance is also crazy low"; "increase shadow distance ... a bit": it was ~105 m)
export const SHADOW_HALF = 10, SHADOW_NEAR = 300, SHADOW_FAR = 500;    // (the ship fits in 20 m: 4.9 mm texels)
export const MID_HALF = 45, MID_NEAR = 250, MID_FAR = 550;
export const FAR_HALF = 170, FAR_NEAR = 100, FAR_FAR = 900;
const PLANET_D = 32000, PLANET_R = 14000, SUN_D = 60000;

const NOISE3 = /* glsl */`
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;

const BAND_N = new THREE.Vector3(0.3, 0.85, -0.42).normalize();     // the Milky Way's great circle

export function nebula() {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { bandN: { value: BAND_N } },
    vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 bandN; varying vec3 vDir;
      ${NOISE3}
      void main() {
        vec3 d = normalize(vDir);
        float band = exp(-pow(dot(d, bandN) / 0.2, 2.0));
        float n = fbm3(d * 2.6), m = fbm3(d * 6.0 + 5.0), k = fbm3(d * 4.5 + 2.0);
        vec3 col = mix(vec3(0.010, 0.004, 0.022), vec3(0.045, 0.012, 0.035), smoothstep(0.45, 0.8, n)) * smoothstep(0.38, 0.72, n);
        col += vec3(0.006, 0.018, 0.04) * smoothstep(0.52, 0.85, m);
        col += vec3(0.035, 0.026, 0.020) * band * (0.5 + smoothstep(0.4, 0.8, k));       // the band's star glow
        col *= 1.0 - 0.75 * band * smoothstep(0.55, 0.72, fbm3(d * 9.0 - 3.0));           // dark dust lanes
        gl_FragColor = vec4(col * 0.5, 1.0);                                              // "a bit darker"
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(90000, 64, 32), m);
}

export function stars() {
  const rnd = mulberry32(77), n = 9000;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    do v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); while (v.lengthSq() > 1 || v.lengthSq() < 1e-4);
    v.normalize();
    if (rnd() < 0.45) {                                    // crowd toward the band
      const off = v.dot(BAND_N);
      v.addScaledVector(BAND_N, -off * (0.75 + rnd() * 0.25)).normalize();
    }
    v.multiplyScalar(85000);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = rnd();                                       // temperature: red dwarfs to blue giants
    c.setRGB(...(t < 0.15 ? [1.0, 0.62, 0.42] : t < 0.4 ? [1.0, 0.86, 0.7] : t < 0.85 ? [0.95, 0.96, 1.0] : [0.7, 0.8, 1.0]));
    const b = 0.25 + 3.5 * Math.pow(rnd(), 8);            // most faint, a few bright
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    size[i] = 1.1 + 2.2 * Math.pow(rnd(), 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { pr: { value: 1 } },
    vertexShader: /* glsl */`attribute float size; varying vec3 vC; uniform float pr;
      void main() { vC = color; gl_PointSize = size * pr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`varying vec3 vC;
      void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * 0.75 * smoothstep(0.5, 0.1, r), 1.0); }`,
  });
  return new THREE.Points(g, m);
}

// the ringed gas giant: clouds and ringlets painted once on the GPU (celestial.js), lit by the sun
function planetGroup(renderer) {
  const C = PLANET_DIR.clone().multiplyScalar(PLANET_D);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.38, 0.5, -0.22));
  const ringN = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt);
  const rot = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(tilt.clone().invert()));
  const shared = { sunDir: { value: SUN_DIR }, center: { value: C }, R: { value: PLANET_R }, ringN: { value: ringN },
    rot: { value: rot }, sunE: { value: SUN_E } };
  const ringMat = ringMaterial(renderer, shared);                  // (first: the clouds read the ringlets for their shadow)
  const planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 192, 96), giantMaterial(renderer, shared));
  planet.position.copy(C);
  const ring = new THREE.Mesh(new THREE.RingGeometry(PLANET_R * RING_IN, PLANET_R * RING_OUT, 512, 1).rotateX(-Math.PI / 2), ringMat);
  ring.position.copy(C);
  ring.quaternion.copy(tilt);
  ring.renderOrder = 2;
  const g = new THREE.Group();
  g.add(planet, ring);
  return g;
}

// The colossus: a capital ship broken in two above the planet. Built and lit in Blender from where the sky's camera
// stands (racer/colossus/build.py: the game's sun, planet-shine and starlight) and drawn here as that picture on a
// plane the size of its camera's view - the sky only turns with the camera, so from here the picture is the ship.
// The picture is stored at half its light (8 bits); its own lights are a second picture, one per channel (the break's
// two groups of emergency lamps, the lit windows with the dying engine), sqrt-encoded to their peaks - drawn here
// flickering. gap: where its break is (build.py meta), for the debris tumbling in it.
export const COLOSSUS = {
  dir: new THREE.Vector3(-0.0548, 0.1443, -0.988).normalize(), dist: 13000, fovH: 56, aspect: 2, gain: 2,
  peaks: new THREE.Vector3(1.4467, 6.1497, 2.4834), lamp: new THREE.Color(0.62, 0.05, 0.022), window: new THREE.Color(0.8, 0.44, 0.18),
  depth: [10500, 15500],                                            // (its depth layer's range along the camera's axis, m)
  gap: { center: new THREE.Vector3(-927.58, 1710.56, -12737.62), axes: [[-0.86, -0.07, 0.51], [0.52, -0.13, 0.85], [0.01, 0.99, 0.14]] },
};
function colossus() {
  const C = COLOSSUS, w = 2 * C.dist * Math.tan(THREE.MathUtils.degToRad(C.fovH) / 2), h = w / C.aspect;
  const loader = new THREE.TextureLoader();
  const tex = loader.load('assets/colossus/colossus.webp');
  tex.colorSpace = THREE.SRGBColorSpace;
  const lights = loader.load('assets/colossus/colossus_lights.png');            // (data: no colour space)
  const depth = loader.load('assets/colossus/colossus_depth.png');
  depth.minFilter = depth.magFilter = THREE.NearestFilter; depth.generateMipmaps = false;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    transparent: true, depthWrite: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { map: { value: tex }, lights: { value: lights }, depthMap: { value: depth }, gain: { value: C.gain }, time: { value: 0 }, peaks: { value: C.peaks },
      lampCol: { value: C.lamp }, winCol: { value: C.window }, dist: { value: C.dist }, zRange: { value: new THREE.Vector2(...C.depth) } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW;
      void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map, lights, depthMap; uniform float gain, time, dist; uniform vec2 zRange; uniform vec3 peaks, lampCol, winCol;
      uniform mat4 projectionMatrix;                                // (three declares it for the vertex stage only)
      varying vec2 vUv; varying vec3 vW;
      // old emergency lamps on what power is left ("a very slow change, not flickering ... old, not like it was just
      // destroyed"): each group swelling and fading over half a minute or so, never quite out
      float slow(float t, float seed) {
        float a = 0.5 + 0.5 * sin(t * 6.2832 / (26.0 + seed * 16.0) + seed * 5.0);
        return 0.4 + 0.6 * a * (0.8 + 0.2 * sin(t * 0.05 + seed * 3.0));
      }
      void main() {
        vec4 t = texture2D(map, vUv);
        vec3 L = texture2D(lights, vUv).rgb;
        L = L * L * peaks;
        vec3 c = t.rgb * gain * t.a;
        c += lampCol * (L.r * slow(time, 0.17) + L.g * slow(time, 0.71));
        c += winCol * L.b * (0.88 + 0.12 * sin(time * 0.15));
        gl_FragColor = vec4(c, t.a);
        // its depth: the point along this pixel's ray at the render's distance (the plane stands at dist on the axis)
        float dz = texture2D(depthMap, vUv).r;
        if (t.a < 0.5 || dz > 0.995) gl_FragDepth = 1.0;
        else {
          vec4 cp = projectionMatrix * viewMatrix * vec4(vW * ((zRange.x + dz * (zRange.y - zRange.x)) / dist), 1.0);
          gl_FragDepth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0);
        }
      }`,
  }));
  // facing the observer, its up the camera's (the picture's up: world up taken off the view direction)
  const right = new THREE.Vector3().crossVectors(C.dir, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, C.dir);
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(right, up, C.dir.clone().negate()).setPosition(C.dir.clone().multiplyScalar(C.dist));
  m.renderOrder = 3;
  return m;
}

// Debris tumbling in the colossus's break ("add some debris moving too between the cut"): the picture's own pieces
// are frozen, so ~110 torn plates and chunks drift slowly round the gap where the render has it, each turning on its
// own axis and catching the sun as it turns, cold. Lit as the render is (the sun, the planet's shine,
// starlight). All in the shader - one draw, only the clock per frame.
function colossusDebris() {
  const C = COLOSSUS, n = 110, rnd = mulberry32(77), R = () => rnd();
  const g = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2));
  g.instanceCount = n;
  const pos = new Float32Array(n * 3), drift = new Float32Array(n * 3), axis = new Float32Array(n * 3), scale = new Float32Array(n * 3), wv = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const gs = () => (R() + R() + R() - 1.5) / 1.5;                          // (round the middle of the gap, mostly)
    pos.set([gs() * 700, gs() * 520, gs() * 480], i * 3);
    const d = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(60 + 200 * R());
    drift.set([d.x, d.y, d.z], i * 3);
    const a = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    axis.set([a.x, a.y, a.z], i * 3);
    const big = R() < 0.15, s = big ? 32 + 28 * R() : 8 + 28 * R() ** 1.6;
    scale.set(R() < 0.6 ? [s * (0.8 + 0.6 * R()), s * (0.5 + 0.5 * R()), 3 + 4 * R()] : [s * (0.5 + 0.5 * R()), s * (0.3 + 0.4 * R()), s * (0.2 + 0.3 * R())], i * 3);
    wv.set([6.2832 / (50 + 90 * R()), R(), (0.04 + 0.4 * R()) * (R() < 0.5 ? -1 : 1), R() < 0.06 ? 0.6 + 0.6 * R() : 0], i * 4);
  }
  for (const [k, arr, sz] of [['iPos', pos, 3], ['iDrift', drift, 3], ['iAxis', axis, 3], ['iScale', scale, 3], ['iW', wv, 4]]) g.setAttribute(k, new THREE.InstancedBufferAttribute(arr, sz));
  const axes = new THREE.Matrix3().set(...[0, 1, 2].flatMap((r) => C.gap.axes.map((col) => col[r])));    // (columns: the ship's x, y, z)
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, gc: { value: C.gap.center }, gaxes: { value: axes }, sunDir: { value: SUN_DIR }, planetDir: { value: PLANET_DIR } },
    vertexShader: /* glsl */`
      uniform float time; uniform vec3 gc; uniform mat3 gaxes;
      attribute vec3 iPos, iDrift, iAxis, iScale; attribute vec4 iW;     // iW: drift rate, phase, spin rate, glow
      varying vec3 vP; varying float vGlow;
      float hh(float x) { return fract(sin(x) * 43758.5453); }
      mat3 rot(vec3 a, float t) {
        float c = cos(t), s = sin(t), k = 1.0 - c;
        return mat3(c + a.x * a.x * k, a.y * a.x * k + a.z * s, a.z * a.x * k - a.y * s,
                    a.x * a.y * k - a.z * s, c + a.y * a.y * k, a.z * a.y * k + a.x * s,
                    a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, c + a.z * a.z * k);
      }
      void main() {
        mat3 Rm = rot(iAxis, iW.z * time + iW.y * 6.2832);
        vec3 off = iPos + iDrift * sin(iW.x * time + iW.y * 6.2832);
        float k = dot(position, vec3(12.9898, 78.233, 37.719)) + iW.y * 91.7;
        vec3 jag = position + (vec3(hh(k), hh(k + 1.7), hh(k + 3.1)) - 0.5) * 0.45;     // (a torn chunk, its own shape)
        vec3 wp = gc + gaxes * off + Rm * (jag * iScale);
        vP = wp; vGlow = iW.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform vec3 sunDir, planetDir; varying vec3 vP; varying float vGlow;
      void main() {
        vec3 v = normalize(-vP), n = normalize(cross(dFdx(vP), dFdy(vP)));        // (faceted)
        if (dot(n, v) < 0.0) n = -n;
        const float albedo = 0.09;
        vec3 sun = vec3(1.0, 0.96, 0.9) * 5.5, shine = vec3(1.0, 0.7, 0.48) * 0.35, amb = vec3(0.5, 0.56, 0.69) * 0.03;
        vec3 c = albedo / 3.14159 * (sun * max(dot(n, sunDir), 0.0) + shine * max(dot(n, planetDir), 0.0)) + albedo * amb;
        // bare metal: a tight glint toward the sun - the plates flash as they turn
        float ns = max(dot(n, sunDir), 0.0);
        c += sun * pow(max(dot(n, normalize(sunDir + v)), 0.0), 80.0) * ns * 0.04;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

// the sun: a globe of plasma 4.8 deg across, prominences and eruptions round it (celestial.js)
function sunGroup() {
  const g = new THREE.Group();
  const R = SUN_D * Math.tan(THREE.MathUtils.degToRad(2.4));
  const { surf, corona } = sunMeshes(R);
  surf.position.copy(SUN_DIR).multiplyScalar(SUN_D);
  corona.position.copy(surf.position);
  corona.renderOrder = 1;
  g.add(surf, corona);
  g.userData.surf = surf;
  g.userData.corona = corona;
  return g;
}

// The nebula never changes: its four six-octave noise fields are drawn once into a cube map at load, and the sky
// samples that (the fields cost ~0.4 ms of every 1440p frame). 1024 a face holds its finest dust lanes.
function bakedNebula(renderer, nebula, size = Q.tier === 'low' ? 512 : 1024) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  // (drawn from a stand-in with the live material: the nebula itself shows the cube from now on)
  const scene = new THREE.Scene(), live = nebula.clone(), cube = new THREE.CubeCamera(10, 200000, rt);
  scene.add(live);
  bakeLater([[scene, cube.children[0]]], () => {
    cube.update(renderer, scene);
    live.material.dispose();
  });
  nebula.material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { cube: { value: rt.texture } },
    vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform samplerCube cube; varying vec3 vDir;
      void main() { gl_FragColor = vec4(textureCube(cube, vDir).rgb, 1.0); }`,
  });
  nebula.renderOrder = -1;                                   // the backdrop of the backdrop: first
  return rt;
}

export class SpaceWorld {
  bakeNebula(renderer) {
    if (this.nebulaLive) return;
    this.nebulaLive = this.nebula.material;                   // kept for comparisons (__feather.world.nebulaLive)
    this.nebulaLive = this.nebula.material.clone();
    this.nebulaCube = bakedNebula(renderer, this.nebula);
  }

  constructor(scene, renderer, camera) {
    this.name = 'space';
    this.sky = new THREE.Scene();
    this.skyCam = new THREE.PerspectiveCamera(60, 1, 50, 200000);
    this.nebula = nebula();
    this.stars = stars();
    this.planet = planetGroup(renderer);
    this.sunG = sunGroup();
    this.colossus = colossus();
    this.colossusDebris = colossusDebris();
    this.sky.add(this.nebula, this.stars, this.planet, this.sunG, this.colossus, this.colossusDebris);
    this.bakeNebula(renderer);
    // environment for reflections: the same sky without the sun's disc (the sun light makes its own highlight)
    // (after the sky's own bakes: a bake too)
    bakeLater([[this.sky, this.skyCam]], () => {
      this.sunG.visible = false;
      const pm = new THREE.PMREMGenerator(renderer);
      this.env = pm.fromScene(this.sky, 0.015, 50, 200000).texture;
      pm.dispose();
      this.sunG.visible = true;
      scene.environment = this.env;
    });
    scene.environmentIntensity = 0.55;
    scene.fog = null;
    // lights: the sun (PCSS shadows round the ship), planet-shine, starlight
    const sunLight = (intensity, half, near, far, normalBias) => {
      const l = new THREE.DirectionalLight(new THREE.Color(1.0, 0.96, 0.9), intensity);
      l.castShadow = true;
      l.shadow.mapSize.set(4096, 4096);
      const c = l.shadow.camera;
      c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = near; c.far = far;
      l.shadow.bias = -0.0001;
      l.shadow.normalBias = normalBias;
      scene.add(l, l.target);
      return l;
    };
    this.sun = sunLight(SUN_E, SHADOW_HALF, SHADOW_NEAR, SHADOW_FAR, 0.005);   // added first: directional shadow 0
    this.sunMid = sunLight(0, MID_HALF, MID_NEAR, MID_FAR, 0.02);               // no light, only the mid cascade's map
    this.sunFar = sunLight(0, FAR_HALF, FAR_NEAR, FAR_FAR, 0.07);               // no light, only the far cascade's map
    const shine = new THREE.DirectionalLight(new THREE.Color(1.0, 0.7, 0.48), 0.35);
    shine.position.copy(PLANET_DIR).multiplyScalar(100);
    scene.add(shine);
    scene.add(new THREE.HemisphereLight(0x8090b0, 0x302018, 0.03));
    this.lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    this.ly = new THREE.Vector3().crossVectors(SUN_DIR, this.lx).normalize();
    // the circuit
    this.track = new Track();
    rockMaps(renderer);                                            // every rock's maps, before the first frame
    hullMaps(renderer);                                            // the structure's grime noise
    // the derelict the track threads (wreck.js): built before the track's towers and the asteroids (they keep clear)
    this.wreck = this.track.wrecks.length ? new Wreck(this.track, SUN_DIR) : null;
    // before any lit material compiles: the meteorite's dark, the derelict's (no sky light round the deck inside it;
    // the sun only through its holes)
    setCave(this.track.caveLines, CAVE_R, CAVE_MOUTH, this.wreck ? { lines: this.track.wreckLines, R: WRECK_R, mouth: WRECK_MOUTH, amb: 0.02 } : null);
    this.wreck?.patchShaders();
    this.track.meshes(scene);
    if (this.wreck) for (const m of [...this.wreck.meshes, ...this.wreck.instMeshes, ...this.wreck.debrisMeshes, ...this.wreck.fxMeshes, this.wreck.sparks.mesh]) scene.add(m);
    this.scenery = new Scenery(scene, this.sky, SUN_DIR, renderer);
    this.ready = this.scenery.ready;                                // (the station's model)
    this.noAO = [this.scenery.gate.userData.fieldMesh, ...(this.wreck ? [this.wreck.sparks.mesh, ...this.wreck.fxMeshes.filter((m) => m.material.transparent)] : [])];
    this.track.bakeDeck(renderer);
    // the meteorite's own shadow from the sun, once (crater rims, boulders - at any distance)
    if (this.track.meteor) bakeRockShadow(renderer, [this.track.meteor.mesh, ...this.track.meteor.boulders], SUN_DIR);
    this.rocks = this.track.asteroids(scene);
    // what never comes near the derelict is compiled without its sun test (wreck.js: in every other lit material - a
    // first visit compiles it a program each): the rocks, the meteorite, the far scenery
    if (this.wreck) {
      const far = [...this.rocks, ...this.track.parts.cave, this.scenery.station, this.scenery.gate, ...this.scenery.freighters];
      for (const o of far) o.traverse((m) => { for (const mt of [].concat(m.material || [])) if (mt.isMeshStandardMaterial) mt.defines = { ...mt.defines, NO_WRECK_SUN: '' }; });
    }
    // gantry lamps: three real lights hop along the gantries ahead, so the ship is lit as it flies under them
    this.lamps = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(new THREE.Color(0.75, 0.88, 1.0), 0, 70, 2);
      scene.add(l);
      return l;
    });
    // dust drifting round the camera: a box of motes that wraps with it, so near space has depth
    const dn = 1400, dpos = new Float32Array(dn * 3), rnd = mulberry32(9);
    for (let i = 0; i < dn * 3; i++) dpos[i] = (rnd() - 0.5) * 240;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { cam: { value: new THREE.Vector3() }, pr: { value: 1 } },
      vertexShader: /* glsl */`uniform vec3 cam; uniform float pr; varying float vA;
        void main() {
          vec3 p = mod(position - cam + 120.0, 240.0) - 120.0 + cam;    // wrap round the camera
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = smoothstep(120.0, 40.0, d) * smoothstep(1.0, 6.0, d);
          gl_PointSize = pr * clamp(60.0 / d, 1.0, 3.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.55, 0.6, 0.7) * vA * smoothstep(0.5, 0.0, r), 1.0); }`,
    }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);
    this.minimap = this.track;
    this.startIndex = this.track.start;
  }

  // keep a camera out of the track slab (deck, walls, fields): lift it over the barrier tops if it is inside
  clearance(p) {
    const tr = this.track, i = tr.nearestIndex(p), d = p.clone().sub(tr.P[i]);
    const x = d.dot(tr.R[i]), y = d.dot(tr.U[i]);
    if (Math.abs(x) < TRACK_W_HALF + 4 && y > -6 && y < 6.5) p.addScaledVector(tr.U[i], 6.5 - y);
  }

  surface() { return -1e9; }
  height() { return -1e9; }
  hit() { return null; }

  // the near cascade on the ship, the mid one centred 30 m ahead of the camera (~15 m behind it to ~75 m ahead), the
  // far one 140 m ahead (~30 m behind to ~310 m ahead); each box snapped to its own texels in the light's axes so
  // shadow edges do not crawl
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

  // the settings' own switches for this world
  setOptions(v) {
    this.colossus.visible = this.colossusDebris.visible = v.colossus !== false;
  }

  update(t, camera, shipPos, s, renderer) {
    this.skyCam.quaternion.copy(camera.quaternion);
    this.skyCam.fov = camera.fov;
    this.skyCam.aspect = camera.aspect;
    this.skyCam.updateProjectionMatrix();
    this.stars.material.uniforms.pr.value = renderer.getPixelRatio() * (this.renderScale || 1);
    this.dust.material.uniforms.pr.value = renderer.getPixelRatio() * (this.renderScale || 1);
    this.dust.material.uniforms.cam.value.copy(camera.position);
    this.track.update(t, shipPos, Math.max(0, t - (this.lastT ?? t)));
    this.wreck?.update(t, camera);
    this.scenery.update(t, Math.max(0, t - (this.lastT ?? t)));
    this.sunG.userData.surf.material.uniforms.time.value = t;
    this.colossus.material.uniforms.time.value = t;
    this.colossusDebris.material.uniforms.time.value = t;
    const cu = this.sunG.userData.corona.material.uniforms;
    cu.time.value = t;
    // now and then the sun throws off a plume of matter (every 25-50 s, somewhere round the limb)
    if (t > (this.nextEruption ??= 8)) { cu.eruA.value = Math.random() * Math.PI * 2; cu.eruT.value = t; this.nextEruption = t + 25 + Math.random() * 25; }
    this.lastT = t;
    // lamps on the three gantries nearest the ship (by track distance, either side); the start gantry's is red. Inside
    // the derelict (no gantries there) they are its emergency lamps nearest the ship, flickering with them
    const tr = this.track, gi = tr.gantryIdx, sIdx = Math.floor(s / tr.step);
    if (this.wreck && tr.wrecks.some(([a, b]) => tr.inSpan(s, a - 90, b + 40))) {
      this.wreck.nearLamps(shipPos, 3, 400, undefined, false).forEach(({ L }, k) => {
        const l = this.lamps[k];
        l.position.copy(L.p);
        l.color.setRGB(L.col[0], L.col[1], L.col[2]);
        l.intensity = L.I * L.f * (L.real ?? 1);
        l.distance = L.reach;
      });
      return;
    }
    gi.map((i) => ({ i, d: Math.min((i - sIdx + tr.n) % tr.n, (sIdx - i + tr.n) % tr.n) }))
      .sort((p, q) => p.d - q.d).slice(0, 3).forEach(({ i }, k) => {
        const l = this.lamps[k];
        l.position.copy(tr.P[i]).addScaledVector(tr.U[i], 12.9);
        l.color.set(i === gi[0] ? 0xff6a55 : 0xc4ddff);
        l.intensity = i === gi[0] ? 260 : 420;
        l.distance = 70;
      });
  }
}
