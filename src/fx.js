// Effects: hover wash, exhaust ions, scrape sparks, the crash explosion (fireball, smoke column, sparks, flash,
// shock ring) and speed streaks past the camera.
import * as THREE from 'three';
import { TRACK_W } from './track.js';
import { mulberry32, smoothstep } from './noise.js';

const TRACK_HALF = TRACK_W / 2;           // the walls' inner faces
// a drift's sparks, trails and glow by the charge's step: building, then blue, orange, violet (linear, over 1 to glow)
const DRIFT_COL = [new THREE.Color(1.1, 1.15, 1.3), new THREE.Color(0.35, 0.75, 2.4), new THREE.Color(2.4, 0.9, 0.18), new THREE.Color(1.9, 0.45, 2.4)];
const VAPOUR = new THREE.Color(0.85, 0.88, 0.95), CHAIN_COL = new THREE.Color(2.4, 2.0, 1.1), _c = new THREE.Color(), _v = new THREE.Vector3();

function canvas(n, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// a round glow (sparks, ions, fire)
const glowTex = () => canvas(64, (g, n) => {
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
});

// a soft, lumpy smoke puff: overlapping blobs, the edge broken up so it never reads as a disc
const puffTex = () => canvas(128, (g, n) => {
  const rnd = mulberry32(99);
  for (let i = 0; i < 26; i++) {
    // every blob stays inside the square (centre <= 0.18 n out, radius <= 0.28 n): a blob touching the edge showed
    // each puff's square outline on the road
    const a = rnd() * Math.PI * 2, d = rnd() * n * 0.18, x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d;
    const rr = n * (0.10 + rnd() * 0.18), r = g.createRadialGradient(x, y, 0, x, y, rr);
    r.addColorStop(0, `rgba(255,255,255,${0.20 + rnd() * 0.18})`);
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, n, n);
  }
});

// a damaged hull's smoke: four different billows (a 2 x 2 atlas, one per particle by its instance): lumps at three
// scales over a soft body, the rim torn into wisps - detailed enough for the lit pool to shade (its relief: the density's
// slope). Every lump stays inside its own quarter (no square outlines).
const billowTex = () => canvas(512, (g, n) => {
  const h = n / 2, rnd = mulberry32(7);
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * h, oy = Math.floor(q / 2) * h, cx = ox + h / 2, cy = oy + h / 2;
    g.save();
    g.beginPath(); g.rect(ox, oy, h, h); g.clip();
    const blob = (x, y, r, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    };
    blob(cx, cy, h * 0.3, 0.35);                                          // the body
    for (const [count, rMin, rMax, spread, a] of [[9, 0.10, 0.16, 0.17, 0.30], [22, 0.05, 0.09, 0.22, 0.26], [46, 0.02, 0.045, 0.26, 0.22]]) {
      for (let i = 0; i < count; i++) {
        const t = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * h * spread, r = h * (rMin + rnd() * (rMax - rMin));
        if (d + r > h * 0.42) continue;
        blob(cx + Math.cos(t) * d, cy + Math.sin(t) * d * (0.8 + rnd() * 0.3), r, a * (0.6 + rnd() * 0.6));
      }
    }
    g.restore();
  }
});

// Instanced camera-facing particles. Options per pool:
//  additive: HDR light (added, not blended: a spark's core can sit far above white for the bloom);
//  stretch: velocity-stretched streaks (motion blur: a capsule from where the particle was `stretch` seconds ago to
//    where it is - round dots read as a cheap effect at these speeds);
//  ramp: 1 = heat (a spark cools white-hot -> yellow -> orange -> a red ember over its life), 2 = ion (hot, then the
//    engine's own colour, dimming);
//  lit: smoke shaded by the sun (LIGHT: its direction and colour, the sky's colour for the side away from it): the
//    billow's relief from its density, the thin rims glowing when the sun is behind them, sooty dark young and greying
//    as it spreads; the map a 2 x 2 atlas (a billow per particle).
// Per particle: a plane (the deck there) to fall toward and bounce off, with a restitution.
const CAM_VEL = new THREE.Vector3();      // the camera's velocity (FX.update): the streaks are motion blur
const LIGHT = { dir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() }, sun: { value: new THREE.Color(1, 0.95, 0.88) },
  sky: { value: new THREE.Color(0.32, 0.36, 0.42) } };

const POOL_ATTRS = [['iPos', 3], ['iVel', 3], ['iAlpha', 1], ['iSize', 1], ['iCol', 3], ['iRot', 1], ['iStr', 1], ['iF', 1]];
class Pool {
  constructor(scene, n, { additive = false, map, order = 3, stretch = false, ramp = 0, lit = false }) {
    this.n = n;
    const f = (k) => new Float32Array(n * k);
    Object.assign(this, { p: f(3), v: f(3), c: f(3), a: f(1), s: f(1), rot: f(1), spin: f(1), life: f(1), grow: f(1),
      drag: f(1), grav: f(1), a0: f(1), fadeIn: f(1), str: f(1), fr: f(1), pl: f(6), bounce: f(1) });
    this.age = new Float32Array(n).fill(1e9);
    this.next = 0;
    this.busy = false;                 // anything alive (or just gone) to move and upload - else the pool sleeps
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    for (const [k, arr, w] of [['iPos', this.p, 3], ['iVel', this.v, 3], ['iCol', this.c, 3], ['iAlpha', this.a, 1],
      ['iSize', this.s, 1], ['iRot', this.rot, 1], ['iStr', this.str, 1], ['iF', this.fr, 1]]) {
      g.setAttribute(k, new THREE.InstancedBufferAttribute(arr, w));
    }
    g.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      defines: { STRETCH: stretch ? 1 : 0, RAMP: ramp, ADDITIVE: additive ? 1 : 0, LIT: lit ? 1 : 0 },
      uniforms: { map: { value: map }, camVel: { value: CAM_VEL }, sunDir: LIGHT.dir, sunCol: LIGHT.sun, skyCol: LIGHT.sky },
      vertexShader: /* glsl */`
        uniform vec3 camVel, sunDir;
        attribute vec3 iPos; attribute vec3 iVel; attribute vec3 iCol; attribute float iAlpha; attribute float iSize;
        attribute float iRot; attribute float iStr; attribute float iF;
        varying vec2 vUv, vQ, vRot; varying float vA; varying vec3 vC, vL; varying float vF; varying float vK;
        void main() {
          vUv = uv; vQ = uv; vA = iAlpha; vC = iCol; vF = iF; vK = 0.0;
          #if LIT
            // a billow of the atlas per particle; the sun in view space; the particle's turn (its relief turns with it)
            float b = float(gl_InstanceID % 4);
            vUv = uv * 0.5 + vec2(mod(b, 2.0), floor(b / 2.0)) * 0.5;
            vL = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
            vRot = vec2(cos(iRot), sin(iRot));
          #endif
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float sz = max(iSize, 0.0);
          #if STRETCH
            // the streak: its motion across the view in the last iStr seconds - relative to the camera, which moves too
            // (a spark keeping pace with the ship stays short, one left behind on the deck streaks), at most 7 m
            vec3 d = normalize(mv.xyz), tr = (modelViewMatrix * vec4(iVel - camVel, 0.0)).xyz * iStr;
            tr -= d * dot(tr, d);
            tr *= min(1.0, 7.0 / max(length(tr), 1e-4));
            float len = length(tr);
            vec3 ax = len > 1e-5 ? tr / len : vec3(0.0, 1.0, 0.0);
            vec3 sd = normalize(cross(d, ax));          // (cross(ax, d) mirrored the quad: back-face culled)
            mv.xyz += sd * position.x * sz + ax * (position.y * (len + sz)) - tr * 0.5;
            vK = len / max(sz, 1e-4);
            vA *= (1.0 + 0.35 * vK) / (1.0 + vK);           // the same light spread along the streak (mostly)
          #else
            float c = cos(iRot), s = sin(iRot);
            mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * sz;
          #endif
          gl_Position = iAlpha > 0.0 ? projectionMatrix * mv : vec4(0.0, 0.0, -2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform vec3 sunCol, skyCol;
        varying vec2 vUv, vQ, vRot; varying float vA; varying vec3 vC, vL; varying float vF; varying float vK;
        vec3 heat(float f) {
          vec3 c = mix(vec3(1.0, 0.96, 0.9) * 2.2, vec3(1.0, 0.78, 0.32) * 1.6, smoothstep(0.0, 0.22, f));
          c = mix(c, vec3(1.0, 0.36, 0.06), smoothstep(0.18, 0.55, f));
          return mix(c, vec3(0.55, 0.06, 0.015), smoothstep(0.5, 1.0, f));
        }
        void main() {
          #if STRETCH
            vec2 q = vec2((vUv.x - 0.5) * 2.0, (vUv.y - 0.5) * 2.0 * (vK + 1.0));
            q.y = max(abs(q.y) - vK, 0.0);
            float r = length(q);
            float m = max(1.0 - r, 0.0);
            m = m * m * (0.6 + 2.4 * exp(-r * r * 9.0));           // a white-hot core in a soft sheath
          #elif LIT
            float m = texture2D(map, vUv).a * smoothstep(0.5, 0.4, length(vQ - 0.5));
          #else
            float m = texture2D(map, vUv).a * smoothstep(0.5, 0.36, length(vUv - 0.5));
          #endif
          vec3 col = vC;
          #if LIT
            // the billow's relief (its density's slope, turned as the particle turns) lit by the sun, wrapped round to the
            // sky's colour on the far side; the dense middle self-shadowed, the thin rims lit through with the sun behind
            const float e = 2.0 / 512.0;
            float gx = texture2D(map, vUv + vec2(e, 0.0)).a - texture2D(map, vUv - vec2(e, 0.0)).a;
            float gy = texture2D(map, vUv + vec2(0.0, e)).a - texture2D(map, vUv - vec2(0.0, e)).a;
            vec3 n = normalize(vec3(-gx * 9.0, gy * 9.0, 0.6));
            n.xy = vec2(vRot.x * n.x - vRot.y * n.y, vRot.y * n.x + vRot.x * n.y);
            float w = clamp(dot(n, vL) * 0.55 + 0.45, 0.0, 1.0);
            float thin = 1.0 - smoothstep(0.04, 0.32, m);
            float back = clamp(-vL.z, 0.0, 1.0);
            vec3 light = mix(skyCol, sunCol, w * w) * (0.75 + 0.35 * (1.0 - thin)) + sunCol * back * back * thin * 1.6;
            // sooty young, greying as it spreads
            col = vC * light * mix(0.42, 1.05, smoothstep(0.0, 0.65, vF));
          #endif
          #if RAMP == 1
            col *= heat(vF);
          #elif RAMP == 2
            col = mix(mix(vC, vec3(1.0), 0.6) * 2.0, vC * 0.6, smoothstep(0.0, 0.7, vF));
          #endif
          #if ADDITIVE
            gl_FragColor = vec4(col * m * vA, 1.0);
          #else
            gl_FragColor = vec4(col, clamp(m * vA, 0.0, 1.0));
          #endif
        }`,
    });
    this.points = new THREE.Mesh(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = order;
    scene.add(this.points);
  }

  // plane: { P, N } - the deck under the emitter: the particle falls toward it (grav along -N) and bounces off it
  emit(p, v, col, { size = 1, grow = 0, life = 1, alpha = 1, drag = 1, grav = 0, spin = 0, fadeIn = 0.15, stretch = 0,
    plane = null, bounce = 0 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.busy = true;
    this.p.set([p.x, p.y, p.z], i * 3);
    this.v.set([v.x, v.y, v.z], i * 3);
    this.c.set([col.r, col.g, col.b], i * 3);
    this.s[i] = size; this.grow[i] = grow; this.life[i] = life; this.age[i] = 0; this.a0[i] = alpha;
    this.drag[i] = drag; this.grav[i] = grav; this.rot[i] = Math.random() * 6.283; this.spin[i] = spin; this.fadeIn[i] = fadeIn;
    this.str[i] = stretch; this.fr[i] = 0;
    if (plane) this.pl.set([plane.P.x, plane.P.y, plane.P.z, plane.N.x, plane.N.y, plane.N.z], i * 6);
    else this.pl.set([0, 0, 0, 0, 0, 0], i * 6);
    this.bounce[i] = plane ? bounce : 0;
  }

  // Only what is alive moves and goes to the GPU: the range of particles alive or just gone this frame (a pool sent
  // all of itself, every attribute, every frame - 370 KB a frame over the seven pools, idle or not). A pool with
  // nothing in it is not drawn; the frame its last particle goes it still is, so the zeroed alphas reach the GPU.
  update(dt) {
    if (!this.busy) { if (this.points.visible) this.points.visible = false; return; }
    const pl = this.pl;
    let lo = this.n, hi = -1, alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) {
        if (this.a[i] !== 0) { this.a[i] = 0; if (i < lo) lo = i; if (i > hi) hi = i; }
        continue;
      }
      alive++;
      if (i < lo) lo = i;
      if (i > hi) hi = i;
      this.age[i] = Math.min(this.life[i], this.age[i] + dt);
      const f = this.age[i] / this.life[i], k = Math.exp(-this.drag[i] * dt), o = i * 3, q = i * 6;
      const nx = pl[q + 3], ny = pl[q + 4], nz = pl[q + 5], hasPlane = nx || ny || nz;
      const gx = hasPlane ? -nx : 0, gy = hasPlane ? -ny : -1, gz = hasPlane ? -nz : 0, gr = this.grav[i] * dt;
      this.v[o] = this.v[o] * k + gx * gr; this.v[o + 1] = this.v[o + 1] * k + gy * gr; this.v[o + 2] = this.v[o + 2] * k + gz * gr;
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
      if (hasPlane) {                          // under the deck: back on it, the normal speed reflected, skidding on
        const d = (this.p[o] - pl[q]) * nx + (this.p[o + 1] - pl[q + 1]) * ny + (this.p[o + 2] - pl[q + 2]) * nz;
        if (d < 0) {
          this.p[o] -= nx * d; this.p[o + 1] -= ny * d; this.p[o + 2] -= nz * d;
          const vn = this.v[o] * nx + this.v[o + 1] * ny + this.v[o + 2] * nz;
          if (vn < 0) {                        // a real impact skips (and scuffs a little speed); resting, it slides
            const e = 1 + this.bounce[i], fr = vn < -1.5 ? 0.9 : 1;
            this.v[o] = (this.v[o] - nx * vn * e) * fr; this.v[o + 1] = (this.v[o + 1] - ny * vn * e) * fr;
            this.v[o + 2] = (this.v[o + 2] - nz * vn * e) * fr;
          }
        }
      }
      this.s[i] = Math.max(0, this.s[i] + this.grow[i] * dt);
      this.rot[i] += this.spin[i] * dt;
      this.fr[i] = f;
      this.a[i] = this.a0[i] * smoothstep(0, this.fadeIn[i], f) * (1 - f) * (1 - f);
    }
    const at = this.points.geometry.attributes;
    for (const [k, w] of POOL_ATTRS) {
      const a = at[k];
      a.clearUpdateRanges();
      if (hi < lo) continue;
      a.addUpdateRange(lo * w, (hi - lo + 1) * w);
      a.needsUpdate = true;
    }
    this.busy = alive > 0;
    this.points.visible = alive > 0 || hi >= lo;
  }
}

// thin bright streaks rushing past the camera at speed (they live in camera space)
class Streaks {
  constructor(camera, n = 140) {
    this.n = n;
    this.pts = [];
    const rnd = mulberry32(5);
    for (let i = 0; i < n; i++) this.pts.push(this.spawn(rnd, -5 - rnd() * 90));
    this.rnd = rnd;
    this.pos = new Float32Array(n * 6);
    this.alpha = new Float32Array(n * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    // (water: under the sea they are motes of drifting life rushing past - short, dim, sea-green - not lines of light)
    this.water = 0;
    this.lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { water: { value: 0 } },
      vertexShader: /* glsl */`attribute float alpha; varying float vA;
        void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform float water; varying float vA; void main() { gl_FragColor = vec4(mix(vec3(0.85, 0.9, 1.0), vec3(0.3, 0.6, 0.58), water) * vA, 1.0); }`,
    }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    camera.add(this.lines);
  }

  spawn(rnd, z) {
    const a = rnd() * Math.PI * 2, r = 6 + rnd() * 10;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, z, k: 0.5 + rnd() };
  }

  update(dt, speed, boost) {
    const on = smoothstep(110, 260, speed) * (0.45 + 0.55 * boost);
    const len = Math.min(22, speed * 0.05) * (1 - 0.8 * this.water);
    this.lines.material.uniforms.water.value = this.water;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i];
      p.z += speed * dt * p.k * 1.1;
      if (p.z > -1) this.pts[i] = this.spawn(this.rnd, -60 - this.rnd() * 40);
      const q = this.pts[i], o = i * 6;
      this.pos.set([q.x, q.y, q.z, q.x, q.y, q.z - len * q.k], o);
      const fade = smoothstep(-100, -60, q.z) * smoothstep(-1, -8, q.z);
      this.alpha[i * 2] = on * fade * 0.28 * (1 - 0.45 * this.water);
      this.alpha[i * 2 + 1] = 0;
    }
    this.lines.visible = on > 0.01;
    const at = this.lines.geometry.attributes;
    at.position.needsUpdate = at.alpha.needsUpdate = true;
  }
}

// Molten scrape marks: where a hull grinds along a wall the metal glows - white-orange, cooling through red to
// nothing in ~2 s - a streak on the wall's face for each frame of contact.
class WallMarks {
  constructor(scene, n = 160) {
    this.n = n;
    this.i = 0;
    this.t = 0;
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    g.instanceCount = n;
    this.born = new Float32Array(n).fill(-99);
    this.heat = new Float32Array(n);
    g.setAttribute('iBorn', new THREE.InstancedBufferAttribute(this.born, 1));
    g.setAttribute('iHeat', new THREE.InstancedBufferAttribute(this.heat, 1));
    this.mesh = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float iBorn; attribute float iHeat; uniform float time; varying vec2 vUv; varying float vAge; varying float vHeat;
        void main() {
          vUv = uv; vAge = time - iBorn; vHeat = iHeat;
          gl_Position = vAge < 2.2 ? projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0) : vec4(0.0, 0.0, -2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying float vAge; varying float vHeat;
        float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        void main() {
          float f = clamp(vAge / 2.2, 0.0, 1.0);
          // a gouge: hottest along its middle line, ragged along its length
          float across = abs(vUv.y - 0.5) * 2.0;
          float rag = 0.65 + 0.35 * h12(floor(vec2(vUv.x * 24.0, 0.0)) + vHeat * 17.0);
          float m = smoothstep(rag, 0.0, across) * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          vec3 c = mix(vec3(2.4, 1.9, 1.2), vec3(1.6, 0.5, 0.08), smoothstep(0.0, 0.18, f));
          c = mix(c, vec3(0.35, 0.03, 0.005), smoothstep(0.18, 0.75, f));
          gl_FragColor = vec4(c * m * vHeat * (1.0 - f) * (1.0 - f), 1.0);
        }`,
    }), n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    const M = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < n; k++) this.mesh.setMatrixAt(k, M);
    scene.add(this.mesh);
    this.M = new THREE.Matrix4();
  }

  // at: on the wall face; T: along the track; N: out of the wall into the track; len (m) of this frame's gouge
  add(at, T, N, len, heat) {
    const k = this.i++ % this.n, B = new THREE.Vector3().crossVectors(N, T);
    this.M.makeBasis(T, B, N).scale(new THREE.Vector3(Math.max(0.4, len), 0.12 + 0.18 * heat, 1)).setPosition(at);
    this.mesh.setMatrixAt(k, this.M);
    this.born[k] = this.t;
    this.heat[k] = heat;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.iBorn.needsUpdate = this.mesh.geometry.attributes.iHeat.needsUpdate = true;
  }

  update(dt) { this.t += dt; this.mesh.material.uniforms.time.value = this.t; }
}

// A drift's burn on the deck: where the skids under a drifting hull ride the field the deck glows - a ribbon behind
// each skid, white-hot at the hull, cooling through the charge's colour to nothing in ~1.8 s (faint while it builds)
const TRAIL_LIFE = 1.8;
class DeckTrails {
  constructor(scene, n = 1600) {
    this.n = n;
    this.i = 0;
    this.t = 0;
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    g.instanceCount = n;
    this.born = new Float32Array(n).fill(-99);
    this.col = new Float32Array(n * 3);
    g.setAttribute('iBorn', new THREE.InstancedBufferAttribute(this.born, 1));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 3));
    this.mesh = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float iBorn; attribute vec3 iCol; uniform float time; varying vec2 vUv; varying float vAge; varying vec3 vCol;
        void main() {
          vUv = uv; vAge = time - iBorn; vCol = iCol;
          gl_Position = vAge < ${TRAIL_LIFE.toFixed(2)} ? projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0) : vec4(0.0, 0.0, -2.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying float vAge; varying vec3 vCol;
        void main() {
          float f = clamp(vAge / ${TRAIL_LIFE.toFixed(2)}, 0.0, 1.0), across = abs(vUv.y - 0.5) * 2.0;
          float core = exp(-across * across * 22.0), body = exp(-across * across * 3.5);
          vec3 c = mix(vec3(2.6, 2.5, 2.4), vCol, smoothstep(0.0, 0.1, f));
          gl_FragColor = vec4((c * core * 1.4 + vCol * body * 0.65) * pow(1.0 - f, 1.6), 1.0);
        }`,
    }), n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    const M = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < n; k++) this.mesh.setMatrixAt(k, M);
    scene.add(this.mesh);
    this.M = new THREE.Matrix4();
    this.X = new THREE.Vector3(); this.Y = new THREE.Vector3(); this.C = new THREE.Vector3(); this.S = new THREE.Vector3();
  }

  // a stretch of ribbon from a to b on the deck (N: its up), width w (m), colour col
  add(a, b, N, w, col) {
    const k = this.i++ % this.n, X = this.X.subVectors(b, a), len = X.length();
    if (len < 0.05) return;
    X.divideScalar(len);
    this.Y.crossVectors(N, X);
    this.M.makeBasis(X, this.Y, N).scale(this.S.set(len + 0.25, w, 1)).setPosition(this.C.addVectors(a, b).multiplyScalar(0.5));
    this.mesh.setMatrixAt(k, this.M);
    this.born[k] = this.t;
    this.col[k * 3] = col.r; this.col[k * 3 + 1] = col.g; this.col[k * 3 + 2] = col.b;
    this.dirty = true;
  }

  update(dt) {
    this.t += dt;
    this.mesh.material.uniforms.time.value = this.t;
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    const a = this.mesh.geometry.attributes;
    a.iBorn.needsUpdate = a.iCol.needsUpdate = true;
  }
}

const ZERO = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), WHITE = new THREE.Color(1, 1, 1);
const SMOKE = new THREE.Color(0.42, 0.41, 0.4), FLAME_A = new THREE.Color(1.0, 0.45, 0.1), FLAME_B = new THREE.Color(1.0, 0.75, 0.35);
const SHARDS = 72, NONE = new THREE.Matrix4().makeScale(0, 0, 0), BARE = new THREE.Color(0.32, 0.33, 0.35), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

export class FX {
  constructor(scene, camera) {
    const glow = glowTex(), puff = puffTex();
    this.scene = scene;
    this.dust = new Pool(scene, 900, { map: puff });
    this.smoke = new Pool(scene, 500, { map: puff });
    this.hurt = new Pool(scene, 900, { map: billowTex(), lit: true });     // a damaged hull's smoke (damaged)
    this.fire = new Pool(scene, 400, { additive: true, map: puff, order: 4 });
    this.sparks = new Pool(scene, 2200, { additive: true, map: glow, order: 5, stretch: true, ramp: 1 });
    this.ions = new Pool(scene, 1600, { additive: true, map: glow, order: 5, stretch: true, ramp: 2 });
    this.glints = new Pool(scene, 64, { additive: true, map: glow, order: 6 });
    this.spray = new Pool(scene, 900, { map: glow, order: 4, stretch: true });         // water: drops on arcs, not lights
    this.marks = new WallMarks(scene);
    this.trails = new DeckTrails(scene);
    this.track = null;                        // set by main: sparks fall to its deck and bounce
    this.streaks = new Streaks(camera);
    this.acc = 0;
    this.ionAcc = 0;
    this.flash = new THREE.PointLight(0xff9a4a, 0, 120, 2);
    scene.add(this.flash);
    this.flashT = 0;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      color: 0xffc890, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.ring.visible = false;
    scene.add(this.ring);
    this.ringT = 1;
    // deck shockwaves for boost pads and hits: a small pool of rings lying on the track's surface
    this.waves = [0, 1, 2, 3, 4, 5].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 3;
      m.userData = { t: 1, size: 10, life: 0.5, col: new THREE.Color() };
      scene.add(m);
      return m;
    });
    this.waveN = 0;
    this.kick = 0;
    this.flashVel = new THREE.Vector3();      // (the flash travels with what lit it: a slam between two ships at speed)
    // shockwaves (post.js ShockPass): rings of refraction, not drawn shapes
    this.shocks = [];
    // debris (debris()): small torn plates of hull, lit like any metal, tumbling off a blow or a blast, bouncing along
    // the deck and shrinking away. Always in the scene, the spent ones at scale 0: no program is built mid-race.
    const shard = new THREE.TetrahedronGeometry(0.5, 0);
    shard.scale(1, 0.3, 1.7);
    this.shards = new THREE.InstancedMesh(shard, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.38 }), SHARDS);
    this.shards.frustumCulled = false;
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < SHARDS; i++) { this.shards.setMatrixAt(i, NONE); this.shards.setColorAt(i, WHITE); }
    scene.add(this.shards);
    this.sh = Array.from({ length: SHARDS }, () => ({ age: 1, life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(),
      ax: new THREE.Vector3(1, 0, 0), spin: 0, size: 1, s: 0, f: {} }));
    this.shardN = 0;
  }

  // a shockwave from at (travelling with vel): size m across at its widest, its bend k (frame heights), over life s
  shock(at, vel, size, k, life, disp = 0.35, lift = 0.18) {
    if (this.shocks.length >= 6) this.shocks.shift();
    this.shocks.push({ at: at.clone(), vel: (vel || ZERO).clone(), t: 0, life, size, k, disp, lift });
  }

  // n plates of hull torn off at at - flung along dir and every way, carrying vel; cols: their paint (and bare metal);
  // s: where on the track (they bounce along its deck)
  debris(at, vel, dir, n, cols, s = null) {
    for (let k = 0; k < n; k++) {
      const i = this.shardN++ % SHARDS, d = this.sh[i];
      d.p.copy(at).add(_v.randomDirection().multiplyScalar(0.8 * Math.random()));
      d.v.copy(dir).multiplyScalar(8 + Math.random() * 30).add(_v.randomDirection().multiplyScalar(6 + Math.random() * 14))
        .addScaledVector(UP, 3 + Math.random() * 9).add(vel);
      d.q.random(); d.ax.randomDirection();
      Object.assign(d, { spin: 5 + Math.random() * 16, size: 0.35 + Math.random() * 0.75, age: 0, life: 1.1 + Math.random() * 1.3, s });
      this.shards.setColorAt(i, Math.random() < 0.3 ? BARE : cols[Math.floor(Math.random() * cols.length)]);
    }
    this.shards.instanceColor.needsUpdate = true;
  }

  // a ring racing out over the deck at `at`, lying in the plane of `basis` (a matrix with the deck's axes); vel: it
  // travels with something moving (an attack between two ships at 900 km/h)
  wave(at, basis, colour, size = 12, life = 0.5, vel = null) {
    const m = this.waves[this.waveN++ % this.waves.length];
    m.position.copy(at);
    m.quaternion.setFromRotationMatrix(basis);
    Object.assign(m.userData, { t: 0, size, life });
    m.userData.col.copy(colour);
    (m.userData.vel ||= new THREE.Vector3()).copy(vel || ZERO);
    m.visible = true;
  }

  // A slam landing (race.js 'attack'; slam false: a block's or a wall's smaller burst). Built as a blow is filmed, not
  // drawn ("stop using paint effects"): the air itself bent by the shock (ShockPass - refraction, no rings), real light
  // from the blow on both hulls and the deck (the flash point light, travelling with them), a white-hot core gone in a
  // blink, a ring of sparks across the shove and a cone of them driven into the one hit, plates of its hull torn off
  // and tumbling, embers falling, a breath of smoke. All of it carried along with the two (vel). colour: the
  // attacker's engine; cols: the paint of the one hit; s: where on the track.
  attack(at, vel, dir, colour, slam, cols = null, s = null) {
    const K = slam ? 1 : 0.55, Y = dir.clone().normalize();
    const X = new THREE.Vector3().crossVectors(Y, Math.abs(Y.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y), V = new THREE.Vector3(), P = new THREE.Vector3();
    const hot = colour.clone().multiplyScalar(2.6), tint = colour.clone().lerp(WHITE, 0.45);
    this.shock(at, vel, 7 + 9 * K, 0.006 + 0.016 * K, 0.42);
    if (slam) this.shock(at.clone().addScaledVector(Y, 2), vel, 26, 0.008, 0.85, 0.3, 0.08);
    this.flash.position.copy(at);
    this.flashVel.copy(vel);
    this.flash.color.copy(colour).lerp(WHITE, 0.6);
    this.flashT = Math.max(this.flashT, 0.45 + 0.4 * K);
    // the core: white-hot, small, gone in a blink (seen in slow motion it must not hang over the blow)
    this.glints.emit(at, vel.clone(), new THREE.Color(1, 0.95, 0.9), { size: 3 + 3 * K, grow: 16, life: 0.1, alpha: 3, drag: 0, fadeIn: 0.005 });
    this.glints.emit(at, vel.clone(), hot, { size: 3, grow: 12, life: 0.2, alpha: 0.9, drag: 0, fadeIn: 0.005 });
    for (let i = 0, n = Math.round(180 * K); i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 22 + Math.random() * 44;
      V.copy(X).multiplyScalar(Math.cos(a) * sp).addScaledVector(Z, Math.sin(a) * sp).addScaledVector(Y, Math.random() * 12).add(vel);
      this.sparks.emit(at, V, Math.random() < 0.5 ? tint : WHITE, { size: 0.05 + Math.random() * 0.06, life: 0.25 + Math.random() * 0.4,
        alpha: 2.2, drag: 0.4, grav: 6, fadeIn: 0.005, stretch: 0.025 });
    }
    if (!slam) return;
    for (let i = 0; i < 160; i++) {          // the cone: driven into the one hit
      V.copy(Y).multiplyScalar(40 + Math.random() * 60).addScaledVector(X, (Math.random() - 0.5) * 30).addScaledVector(Z, (Math.random() - 0.5) * 30).add(vel);
      this.sparks.emit(at, V, Math.random() < 0.4 ? tint : FLAME_B, { size: 0.05 + Math.random() * 0.07, life: 0.3 + Math.random() * 0.45,
        alpha: 2.2, drag: 0.5, grav: 7, fadeIn: 0.005, stretch: 0.03 });
    }
    const hit = at.clone().addScaledVector(Y, 1.5);
    this.debris(hit, vel, Y, 16, cols || [WHITE], s);
    for (let i = 0; i < 18; i++) {           // embers: hot bits falling away
      V.copy(Y).multiplyScalar(10 + Math.random() * 20).addScaledVector(X, (Math.random() - 0.5) * 20).addScaledVector(Z, (Math.random() - 0.5) * 20)
        .addScaledVector(UP, Math.random() * 8).add(vel);
      this.sparks.emit(hit, V, FLAME_A, { size: 0.12 + Math.random() * 0.1, life: 0.6 + Math.random() * 0.8, alpha: 2.2, drag: 0.3, grav: 14,
        fadeIn: 0.01, stretch: 0.01 });
    }
    for (let i = 0; i < 10; i++) {           // a breath of smoke off the blow
      V.set(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(6).addScaledVector(vel, 0.97);
      P.copy(at).addScaledVector(Y, (Math.random() - 0.3) * 3);
      this.smoke.emit(P, V, SMOKE, { size: 1.2, grow: 4, life: 0.45 + Math.random() * 0.35, alpha: 0.18, drag: 0.6, grav: -1, spin: (Math.random() - 0.5) * 2, fadeIn: 0.03 });
    }
  }

  // A hull thrown by a slam (race.js visuals while it is knocked across fast): sparks torn off it all the way to the
  // wall - a streak across the track
  thrown(ship, r, dt) {
    const R = ship.root, hs = (ship.halfSpan || 5) * 0.6, L = (ship.length || 13) * 0.4;
    const P = (this._tp ||= new THREE.Vector3()), V = (this._tv ||= new THREE.Vector3());
    ship.thrAcc = (ship.thrAcc || 0) + dt * 220 * Math.min(1, r.knocked / 0.5);
    for (; ship.thrAcc >= 1; ship.thrAcc -= 1) {
      P.set((Math.random() - 0.5) * 2 * hs, 0.3 + Math.random() * 0.7, (Math.random() - 0.3) * L).applyQuaternion(R.quaternion).add(R.position);
      V.set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).multiplyScalar(12).addScaledVector(r.vel, 0.88);
      this.sparks.emit(P, V, Math.random() < 0.55 ? FLAME_B : WHITE, { size: 0.06 + Math.random() * 0.07, life: 0.25 + Math.random() * 0.35,
        alpha: 2.2, drag: 0.5, grav: 7, fadeIn: 0.01, stretch: 0.025 });
    }
  }

  // A damaged hull (race.js visuals: under half its hull): smoke pouring out of breaches in it - one under half, two
  // under a third, three under a fifth, each in its own place on that ship (seeded: it does not wander) - a thin
  // plume streaming back from each, lit by the sun (the hurt pool), sooty where it leaves the hull, greying as it
  // spreads; under a quarter flames lick out of the breaches, light the smoke from below and throw embers. Kept thin
  // and short ("the smoke when ship is damaged is too powerful, it blocks the visibility"): it is gone in under a
  // second, the player's own (mine) thinner still - it streams back past the chase camera. Rate per breach, per ship.
  damaged(ship, r, hp, dt, mine = false) {
    const k = Math.min(1, (0.5 - hp) / 0.5), R = ship.root, hs = (ship.halfSpan || 5) * 0.5, L = ship.length || 13;
    const P = (this._dp ||= new THREE.Vector3()), V = (this._dv ||= new THREE.Vector3()), U = (this._du ||= new THREE.Vector3());
    if (!ship.breaches) {
      const rnd = mulberry32(((ship.root.id || 1) * 2654435761) >>> 0);
      ship.breaches = [0, 1, 2].map((b) => ({ x: (rnd() - 0.5) * 2 * hs * (b ? 1 : 0.4), y: 0.45 + rnd() * 0.6,
        z: L * (0.05 + rnd() * 0.32), acc: rnd() }));
    }
    const open = hp < 0.2 ? 3 : hp < 0.33 ? 2 : 1, burning = hp < 0.25;
    U.set(0, 1, 0).applyQuaternion(R.quaternion);
    for (let b = 0; b < open; b++) {
      const br = ship.breaches[b];
      br.acc += dt * (16 + 18 * k) * (mine ? 0.55 : 1);
      for (; br.acc >= 1; br.acc -= 1) {
        P.set(br.x + (Math.random() - 0.5) * 0.3, br.y, br.z + (Math.random() - 0.5) * 0.4).applyQuaternion(R.quaternion).add(R.position);
        // out of the breach (up off the hull, a little to the side), carried on with the ship and falling back
        V.copy(U).multiplyScalar(1.5 + Math.random() * 2.5).add(_v.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(2.2))
          .addScaledVector(r.vel, 0.86 + Math.random() * 0.06);
        const soot = 0.34 + Math.random() * 0.12;
        this.hurt.emit(P, V, _c.setRGB(soot, soot * 0.98, soot * 0.95), { size: (0.7 + 0.5 * k) * (mine ? 0.8 : 1),
          grow: (2.6 + 2.4 * k) * (mine ? 0.75 : 1), life: 0.55 + Math.random() * 0.4,
          alpha: (0.26 + 0.2 * k) * (mine ? 0.45 : 1), drag: 0.55, grav: -1.4, spin: (Math.random() - 0.5) * 1.2, fadeIn: 0.05 });
        if (burning) {
          if (Math.random() < 0.6) this.fire.emit(P, V, Math.random() < 0.5 ? FLAME_A : FLAME_B, { size: 0.8 + Math.random() * 0.9,
            grow: 2.4, life: 0.18 + Math.random() * 0.16, alpha: 1.6 * (mine ? 0.6 : 1), drag: 0.4, fadeIn: 0.02 });
          if (Math.random() < 0.25) {
            V.addScaledVector(U, 3 + Math.random() * 7).add(_v.set((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9));
            this.sparks.emit(P, V, FLAME_B, { size: 0.045, life: 0.35 + Math.random() * 0.35, alpha: 2, drag: 0.35, grav: 11, fadeIn: 0.01, stretch: 0.02 });
          }
        }
      }
    }
  }

  // a boost pad fires: a deck shockwave, a fountain of hot motes, and (for the player) a kick for the camera / streaks
  padBurst(at, basis, player) {
    this.wave(at, basis, new THREE.Color(2.2, 0.9, 0.15), 16, 0.55);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(basis));
    const fwd = new THREE.Vector3(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(basis));
    const c1 = new THREE.Color(1.0, 0.55, 0.12), c2 = new THREE.Color(1.0, 0.85, 0.5), P = new THREE.Vector3(), V = new THREE.Vector3();
    for (let i = 0; i < 70; i++) {
      P.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0.2, (Math.random() - 0.5) * 16).applyMatrix4(new THREE.Matrix4().extractRotation(basis)));
      V.copy(up).multiplyScalar(4 + Math.random() * 12).addScaledVector(fwd, (Math.random() - 0.3) * 20);
      this.sparks.emit(P, V, Math.random() < 0.6 ? c1 : c2, { size: 0.07 + Math.random() * 0.06, life: 0.4 + Math.random() * 0.6,
        alpha: 1.6, drag: 1.2, grav: 4, fadeIn: 0.02, stretch: 0.045 });
    }
    if (player) this.kick = 1;
  }

  // a hull grinding along a wall, every frame of contact: a stream of sparks thrown back and out of the contact,
  // falling to the deck and skipping along it, cooling as they go; the wall's face glows where it is gouged.
  // f: the track frame at the contact (P on the centre line, T along, U up, R right); side: the wall (+1 right)
  grind(at, vel, side, dt, f = null) {
    const white = new THREE.Color(1, 1, 1), V = new THREE.Vector3();
    const plane = f ? { P: f.P, N: f.U } : null, out = f ? f.R.clone().multiplyScalar(-side) : new THREE.Vector3();
    const sp = vel.length(), n = Math.min(24, Math.ceil(dt * (260 + sp * 1.6)));
    for (let i = 0; i < n; i++) {
      // torn off at nearly the hull's speed: they trail 5-20 m behind the contact (thrown back harder they were past
      // the chase camera in a blink)
      V.copy(vel).multiplyScalar(0.8 + Math.random() * 0.15).addScaledVector(out, 3 + Math.random() * 9);
      if (f) V.addScaledVector(f.U, 1 + Math.random() * 7);
      V.add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4));
      this.sparks.emit(at, V, white, { size: 0.05 + Math.random() * 0.07, life: 0.3 + Math.random() * 0.45, alpha: 2.0,
        drag: 0.25, grav: 22, fadeIn: 0.01, stretch: 0.025, plane, bounce: 0.35 });
    }
    if (f) {                                              // the gouge on the wall's face, this frame's length of it
      const face = f.P.clone().addScaledVector(f.R, side * (TRACK_HALF - 0.02)).addScaledVector(f.U, 0.75 + Math.random() * 0.15);
      this.marks.add(face, f.T, out, sp * dt + 0.25, 0.7 + Math.random() * 0.3);
    }
  }

  get pools() { return [this.dust, this.smoke, this.hurt, this.fire, this.sparks, this.ions, this.glints, this.spray]; }

  // the light the damage smoke is shaded by: the circuit's sun (direction to it, its colour) and its sky
  setLight(dir, sun, sky) { LIGHT.dir.value.copy(dir).normalize(); LIGHT.sun.value.copy(sun); LIGHT.sky.value.copy(sky); }

  // a drift, every frame of it: the two skids under the hull burn ribbons into the deck (the outer one wider and
  // hotter), the outer throws a fan of sparks and a wisp of vapour, and the field crackles between hull and deck -
  // all white while the charge builds, then blue, orange, violet as it reaches each step. The player's hull lights
  // the deck under it in the same colour (glow).
  drift(ship, r, f, dt, player = false) {
    const tier = r.driftTier, col = DRIFT_COL[tier], side = -(r.drift || 0), V = new THREE.Vector3(), P = new THREE.Vector3();
    const ch = 1 + 0.35 * (r.chain || 0);              // a chained drift: wider, hotter, more of everything
    const plane = { P: f.P, N: f.U }, M = ship.root.matrixWorld, sk = (r.skids ||= { on: false, p: [new THREE.Vector3(), new THREE.Vector3()] });
    // the ribbons: each skid's point dropped onto the deck, joined to where it was last frame
    for (let k = 0; k < 2; k++) {
      const sd = k === 0 ? side : -side;
      P.set(sd * ship.halfSpan * 0.42, -ship.bottom, 2.2).applyMatrix4(M);
      P.addScaledVector(f.U, 0.04 - P.clone().sub(f.P).dot(f.U));
      const last = sk.p[k];
      if (sk.on && last.distanceToSquared(P) < 3600) this.trails.add(last, P, f.U, (k === 0 ? 0.8 : 0.5) * ch, _c.copy(col).multiplyScalar((k === 0 ? 1 : 0.6) * (tier ? 1 : 0.35) * ch));
      last.copy(P);
    }
    sk.on = true;
    // sparks off the outer skid, thrown back and out, skipping along the deck
    const n = Math.min(40, Math.ceil(dt * (300 + 180 * tier) * ch));
    for (let i = 0; i < n; i++) {
      P.set(side * ship.halfSpan * (0.3 + Math.random() * 0.25), -ship.bottom + 0.1, 1.5 + Math.random() * 3).applyMatrix4(M);
      V.copy(r.vel).multiplyScalar(0.8 + Math.random() * 0.12).addScaledVector(f.R, side * (3 + Math.random() * 9)).addScaledVector(f.U, 1 + Math.random() * 4);
      this.sparks.emit(P, V, col, { size: 0.09 + Math.random() * 0.09 + 0.035 * tier, life: 0.25 + Math.random() * 0.4, alpha: 2.4,
        drag: 0.4, grav: 18, fadeIn: 0.01, stretch: 0.035, plane, bounce: 0.35 });
    }
    // vapour torn off the outer skid, left hanging in the wake
    this.vapAcc = (this.vapAcc || 0) + dt * (player ? 70 : 30);
    for (; this.vapAcc >= 1; this.vapAcc--) {
      P.set(side * ship.halfSpan * 0.45, -ship.bottom + 0.3, 3).applyMatrix4(M);
      V.copy(r.vel).multiplyScalar(0.6 + Math.random() * 0.2).addScaledVector(f.R, side * (2 + Math.random() * 4)).addScaledVector(f.U, 1 + Math.random() * 2);
      this.smoke.emit(P, V, _c.copy(col).lerp(VAPOUR, 0.65).multiplyScalar(0.55), { size: 0.8 + Math.random(), grow: 5, life: 0.45 + Math.random() * 0.4,
        alpha: 0.22, drag: 3, grav: 0, spin: (Math.random() - 0.5) * 2, fadeIn: 0.05 });
    }
    // the field crackling: short bright strokes from the hull's underside down to the deck
    if (tier > 0 || player) {
      for (let i = 0; i < (player ? 2 : 1); i++) {
        if (Math.random() > 0.7) continue;
        P.set((Math.random() - 0.5) * ship.halfSpan * 1.2, -ship.bottom + 0.6, (Math.random() - 0.3) * 6).applyMatrix4(M);
        V.copy(r.vel).addScaledVector(f.U, -(60 + Math.random() * 40)).addScaledVector(f.R, (Math.random() - 0.5) * 30);
        this.sparks.emit(P, V, col, { size: 0.05 + 0.02 * tier, life: 0.025 + Math.random() * 0.02, alpha: 3, drag: 0, grav: 0, fadeIn: 0, stretch: 0.02 });
      }
    }
    if (player) this.glow = { at: P.set(0, -ship.bottom + 0.4, 0.5).applyMatrix4(M), tier, k: Math.min(1, r.driftS * 1.5) };
  }

  // a drift chained (a step bigger): a white-gold burst off both skids, a ring on the deck growing with the chain
  driftChain(ship, r, f, chain) {
    const V = new THREE.Vector3(), P = new THREE.Vector3();
    for (let i = 0; i < 50 + 30 * chain; i++) {
      P.set((Math.random() < 0.5 ? -1 : 1) * ship.halfSpan * 0.42, -ship.bottom + 0.2, 2).applyMatrix4(ship.root.matrixWorld);
      V.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 18).add(_v.copy(r.vel).multiplyScalar(0.85));
      this.sparks.emit(P, V, CHAIN_COL, { size: 0.1 + Math.random() * 0.12, life: 0.3 + Math.random() * 0.4, alpha: 2.8, drag: 1.2, grav: 10, fadeIn: 0.01,
        stretch: 0.03, plane: { P: f.P, N: f.U }, bounce: 0.3 });
    }
    this.wave(_v.copy(ship.root.position).addScaledVector(f.U, -ship.bottom + 0.1), new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate()),
      CHAIN_COL, 7 + 3 * chain, 0.35);
  }

  // the drift's charge reaching a step: a burst of its colour off both skids and a small ring on the deck
  driftTier(ship, r, f, tier) {
    const c = DRIFT_COL[tier], V = new THREE.Vector3(), P = new THREE.Vector3();
    for (let i = 0; i < 70; i++) {
      P.set((Math.random() < 0.5 ? -1 : 1) * ship.halfSpan * 0.42, -ship.bottom + 0.2, 2).applyMatrix4(ship.root.matrixWorld);
      V.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 16).add(_v.copy(r.vel).multiplyScalar(0.85));
      this.sparks.emit(P, V, c, { size: 0.1 + Math.random() * 0.1, life: 0.3 + Math.random() * 0.4, alpha: 2.6, drag: 1.2, grav: 10, fadeIn: 0.01,
        stretch: 0.03, plane: { P: f.P, N: f.U }, bounce: 0.3 });
    }
    this.wave(_v.copy(ship.root.position).addScaledVector(f.U, -ship.bottom + 0.1), new THREE.Matrix4().makeBasis(f.R, f.U, f.T.clone().negate()),
      _c.copy(c).multiplyScalar(0.8), 5 + 2 * tier, 0.3);
  }

  // a drift let go with its charge: a ring of the step's colour off the hull, and (the player) a kick for the camera
  driftKick(at, basis, tier, player) {
    const c = DRIFT_COL[tier];
    this.wave(at, basis, new THREE.Color(c.r * 1.4, c.g * 1.4, c.b * 1.4), 8 + 3 * tier, 0.4);
    if (player) this.kick = Math.max(this.kick, 0.4 + 0.2 * tier);
  }

  // a ship through a curtain of falling water (at, its velocity v): the water bursts off its nose and over it - a
  // cloud of white spray left hanging in its wake, and drops flung out on arcs, falling
  splash(at, v) {
    const V = new THREE.Vector3(), P = new THREE.Vector3(), white = new THREE.Color(1.1, 1.15, 1.2), drop = new THREE.Color(0.95, 1.0, 1.06);
    for (let i = 0; i < 46; i++) {
      V.set(Math.random() - 0.5, Math.random() * 0.8 - 0.25, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 12).addScaledVector(v, 0.2 + 0.25 * Math.random());
      P.copy(at).addScaledVector(V, 0.06);
      this.smoke.emit(P, V, white, { size: 1.5 + Math.random() * 3, grow: 5 + Math.random() * 4, life: 0.7 + Math.random() * 1.1, alpha: 0.42,
        drag: 2.2, grav: 2.5, spin: (Math.random() - 0.5) * 1.5, fadeIn: 0.03 });
    }
    for (let i = 0; i < 260; i++) {
      V.set(Math.random() - 0.5, Math.random() * 0.9 - 0.1, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 26).addScaledVector(v, 0.35 + 0.4 * Math.random());
      P.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(5).add(at);
      this.spray.emit(P, V, drop, { size: 0.05 + Math.random() * 0.08, life: 0.5 + Math.random() * 0.9, alpha: 0.75,
        drag: 0.6, grav: 9.8, fadeIn: 0.02, stretch: 0.035 });
    }
  }

  // the deck under a point (for sparks to land on): the track frame there
  deckAt(p) {
    if (!this.track) return null;
    const i = this.track.nearestIndex(p);
    return { P: this.track.P[i], N: this.track.U[i], T: this.track.T[i], R: this.track.R[i] };
  }

  setScale() { /* billboards are sized in metres: nothing to do */ }

  // hover wash: the downdraft rolls dust out from under the hull; more the lower and the harder the ship works,
  // lit like the ground it comes off (sunlit tone, a little darker underneath)
  hover(flight, terrain, onRoad, dt) {
    const ship = flight.ship, agl = flight.agl;
    if (ship.power < 0.2 || agl > 10) return;
    const k = (1 - agl / 10) * ship.power * (0.5 + flight.throttle + flight.boosting) * (1 - 0.7 * Math.min(1, flight.speed / 100));
    this.acc += dt * 55 * k;
    const col = onRoad ? new THREE.Color(0.40, 0.38, 0.35) : new THREE.Color(0.42, 0.38, 0.27);
    const P = new THREE.Vector3(), V = new THREE.Vector3();
    while (this.acc > 1) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 5.5;
      P.set(flight.pos.x + Math.cos(a) * r, 0, flight.pos.z + Math.sin(a) * r);
      P.y = terrain.surface(P.x, P.z) + 0.25;
      const out = 5 + Math.random() * 9;
      V.set(Math.cos(a) * out + flight.vel.x * 0.35, 0.4 + Math.random() * 1.2, Math.sin(a) * out + flight.vel.z * 0.35);
      this.dust.emit(P, V, col, { size: 1.2 + Math.random() * 1.2, grow: 2.2, life: 1.4 + Math.random() * 1.2, alpha: 0.32,
        drag: 1.5, grav: -0.15, spin: (Math.random() - 0.5) * 1.2, fadeIn: 0.2 });
    }
  }

  // a light sprinkle of motes out of the nozzles on boost and a pad's kick only - drifting a few metres back from the
  // ship, slowly (a constant fast stream "is too much and too fast")
  exhaust(ship, flight, dt) {
    const k = ship.spin * Math.max(0, Math.min(1, flight.boosting + 0.7 * (ship.boostKick || 0)) - 0.15);
    if (k <= 0) return;
    ship.ionAcc = (ship.ionAcc || 0) + dt * 45 * k;
    const M = ship.root.matrixWorld, back = new THREE.Vector3(0, 0, 1).transformDirection(M);
    const eng = ship.engineColor || new THREE.Color(0.1, 0.42, 1.0);
    const c1 = eng.clone().lerp(new THREE.Color(1, 1, 1), 0.35), c2 = eng.clone().lerp(new THREE.Color(1, 1, 1), 0.8);
    while (ship.ionAcc > 1) {
      ship.ionAcc -= 1;
      const pl = ship.plumes[(Math.random() * ship.plumes.length) | 0];
      const r = pl.r * Math.sqrt(Math.random()) * 0.8, a = Math.random() * 6.283;
      const p = pl.outer.position.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.3)).applyMatrix4(M);
      const v = back.clone().multiplyScalar(5 + Math.random() * 7).add(flight.vel)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.5));
      this.ions.emit(p, v, Math.random() < 0.6 ? c1 : c2, { size: pl.r * (0.035 + Math.random() * 0.04), grow: -0.02,
        life: 0.3 + Math.random() * 0.25, alpha: 0.9, drag: 0.03, fadeIn: 0.05, stretch: 0.004 });
    }
  }

  // a knock (a wall, another ship): a burst of sparks on the deck, a white flash, a puff of smoke
  scrape(at, v, strength = 1) {
    const white = new THREE.Color(1, 1, 1), V = new THREE.Vector3(), d = this.deckAt(at);
    const plane = d ? { P: d.P, N: d.N } : null, up = d ? d.N : new THREE.Vector3(0, 1, 0);
    const n = Math.round(30 + 40 * Math.min(1, strength));
    for (let i = 0; i < n; i++) {
      V.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 18)
        .addScaledVector(up, 3 + Math.random() * 6).addScaledVector(v, 0.85);
      this.sparks.emit(at, V, white, { size: 0.05 + Math.random() * 0.06, life: 0.4 + Math.random() * 0.6, alpha: 1.8,
        drag: 0.3, grav: 20, fadeIn: 0.01, stretch: 0.03, plane, bounce: 0.4 });
    }
    this.glints.emit(at, v.clone().multiplyScalar(0.95), new THREE.Color(1.0, 0.85, 0.65), { size: 2.2 + 2.5 * Math.min(1, strength),
      grow: 9, life: 0.16, alpha: 3.0, drag: 4, fadeIn: 0.01 });
    const grey = new THREE.Color(0.32, 0.31, 0.3);
    for (let i = 0; i < 6; i++) {
      V.set(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(4).addScaledVector(v, 0.5);
      this.smoke.emit(at, V, grey, { size: 0.8 + Math.random(), grow: 2.5, life: 0.8 + Math.random() * 0.6, alpha: 0.18,
        drag: 2.5, grav: -0.3, spin: (Math.random() - 0.5) * 1.5, fadeIn: 0.1 });
    }
  }

  explode(at, v) {
    const V = new THREE.Vector3(), P = new THREE.Vector3();
    const fireA = new THREE.Color(1.0, 0.55, 0.18), fireB = new THREE.Color(1.0, 0.82, 0.45);
    for (let i = 0; i < 60; i++) {           // fireball: hot puffs that expand and burn out in under a second
      V.set(Math.random() - 0.5, Math.random() * 0.7, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 16).addScaledVector(v, 0.3);
      P.copy(at).addScaledVector(V, 0.08);
      this.fire.emit(P, V, Math.random() < 0.5 ? fireA : fireB, { size: 2 + Math.random() * 2.5, grow: 6, life: 0.45 + Math.random() * 0.6,
        alpha: 0.5, drag: 2.2, grav: -2, spin: (Math.random() - 0.5) * 2, fadeIn: 0.04 });
    }
    const grey = new THREE.Color(0.11, 0.10, 0.10), grey2 = new THREE.Color(0.22, 0.21, 0.20);
    for (let i = 0; i < 120; i++) {          // smoke: rises and spreads for seconds after the fire is out
      V.set(Math.random() - 0.5, 0.4 + Math.random() * 0.6, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 7);
      P.copy(at).addScaledVector(V, 0.3);
      this.smoke.emit(P, V, Math.random() < 0.5 ? grey : grey2, { size: 3 + Math.random() * 4, grow: 3.5, life: 3 + Math.random() * 4,
        alpha: 0.7, drag: 0.8, grav: -1.4, spin: (Math.random() - 0.5) * 0.6, fadeIn: 0.12 });
    }
    const hot = new THREE.Color(1.0, 0.6, 0.22), white = new THREE.Color(1.0, 0.92, 0.75);
    for (let i = 0; i < 260; i++) {          // sparks and debris glints on ballistic arcs
      V.set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(10 + Math.random() * 38).addScaledVector(v, 0.3);
      this.sparks.emit(at, V, Math.random() < 0.6 ? hot : white, { size: 0.06 + Math.random() * 0.07, life: 0.6 + Math.random() * 1.6,
        alpha: 1.6, drag: 0.35, grav: 9.8, fadeIn: 0.01, stretch: 0.03 });
    }
    this.flash.position.copy(at).add(new THREE.Vector3(0, 2, 0));
    this.flashVel.set(0, 0, 0);
    this.flash.color.set(0xff9a4a);
    this.flashT = 1;
    this.ring.position.copy(at);
    this.ring.visible = true;
    this.ringT = 0;
  }

  // A hull destroyed in a race (main.js 'wreck'): it blows up where it stops. A white-hot core and the light of it, a
  // fireball rolling out, two shockwaves bending the air (ShockPass), plates of its hull flung out (debris), burning
  // debris and sparks flung on - the faster it was going the further - and a smoke cloud left hanging. near (m to the camera): the
  // fire and the smoke thinned up close (a fireball over the lens fills the screen).
  blast(at, vel, basis, colour, near = 100, cols = null, s = null) {
    const V = new THREE.Vector3(), P = new THREE.Vector3(), up = new THREE.Vector3().setFromMatrixColumn(basis, 1);
    const k = Math.min(1, Math.max(0.3, (near - 6) / 30)), on = vel.clone().multiplyScalar(0.35);
    const hotA = new THREE.Color(1.0, 0.86, 0.55), hotB = new THREE.Color(1.0, 0.5, 0.14), white = new THREE.Color(1, 0.95, 0.85);
    this.glints.emit(at, ZERO, white, { size: 5, grow: 26, life: 0.2, alpha: 2.2 * k, drag: 0, fadeIn: 0.01 });
    this.glints.emit(at, ZERO, hotB, { size: 9, grow: 22, life: 0.45, alpha: 1.3 * k, drag: 0, fadeIn: 0.01 });
    this.shock(at, ZERO, 44, 0.03, 0.75, 0.7, 0.3);
    this.shock(at, ZERO, 80, 0.012, 1.3, 0.3, 0.06);
    this.debris(at, on, up, 30, cols || [BARE], s);
    for (let i = 0; i < 90; i++) {           // the fireball: hot puffs thrown out, swelling and burning out in a second
      V.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 20).addScaledVector(up, 3);
      P.copy(at).addScaledVector(V, 0.05);
      this.fire.emit(P, V.addScaledVector(on, 0.3), Math.random() < 0.3 ? hotA : hotB, { size: 2.5 + Math.random() * 3, grow: 8,
        life: 0.5 + Math.random() * 0.7, alpha: 0.6 * k, drag: 2.6, grav: -3, spin: (Math.random() - 0.5) * 2, fadeIn: 0.03 });
    }
    const dark = new THREE.Color(0.08, 0.075, 0.07), grey = new THREE.Color(0.2, 0.19, 0.18);
    for (let i = 0; i < 70; i++) {           // the smoke: a dark cloud left hanging, rising and spreading for seconds
      V.set(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 8).addScaledVector(up, 2);
      P.copy(at).addScaledVector(V, 0.4);
      this.smoke.emit(P, V, Math.random() < 0.6 ? dark : grey, { size: 4 + Math.random() * 4, grow: 4, life: 2.5 + Math.random() * 3,
        alpha: 0.65 * k, drag: 0.9, grav: -1.6, spin: (Math.random() - 0.5) * 0.6, fadeIn: 0.25 });
    }
    for (let i = 0, n = Math.round(220 * k); i < n; i++) {     // sparks on ballistic arcs, half of them carried on with the speed it had
      V.set(Math.random() - 0.5, Math.random() * 0.8 - 0.1, Math.random() - 0.5).normalize().multiplyScalar(14 + Math.random() * 50);
      if (i % 2) V.add(on);
      this.sparks.emit(at, V, Math.random() < 0.6 ? hotB : white, { size: 0.07 + Math.random() * 0.08, life: 0.6 + Math.random() * 1.6,
        alpha: 2, drag: 0.35, grav: 9.8, fadeIn: 0.01, stretch: 0.022 });
    }
    for (let i = 0; i < 26; i++) {           // burning debris: bigger, slower embers falling for a couple of seconds
      V.set(Math.random() - 0.5, 0.2 + Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 22).add(on);
      this.sparks.emit(at, V, hotA, { size: 0.25 + Math.random() * 0.2, life: 1.4 + Math.random() * 1.4, alpha: 2.4, drag: 0.25, grav: 9.8,
        fadeIn: 0.01, stretch: 0.012 });
    }
    this.flash.position.copy(at).addScaledVector(up, 2);
    this.flashVel.set(0, 0, 0);
    this.flash.color.set(0xffa050);
    this.flashT = 0.75;
  }

  // the plates in flight: falling, tumbling, bouncing on the deck under them (the track's frame, followed along by
  // how far each has gone), shrinking away at the end
  updateDebris(dt) {
    let any = false;
    const tr = this.track;
    for (let i = 0; i < SHARDS; i++) {
      const d = this.sh[i];
      if (d.age >= d.life) continue;
      any = true;
      d.age += dt;
      if (d.age >= d.life) { this.shards.setMatrixAt(i, NONE); continue; }
      d.v.y -= 16 * dt;
      d.v.multiplyScalar(Math.exp(-0.35 * dt));
      d.p.addScaledVector(d.v, dt);
      if (tr && d.s != null) {
        const f = tr.frame(d.s, d.f);
        d.s += d.v.dot(f.T) * dt;
        const h = _v.copy(d.p).sub(f.P).dot(f.U);
        if (h < 0.12 && Math.abs(_v.dot(f.R)) < TRACK_HALF + 2) {
          d.p.addScaledVector(f.U, 0.12 - h);
          const vn = d.v.dot(f.U);
          if (vn < 0) { d.v.addScaledVector(f.U, -1.45 * vn).multiplyScalar(0.72); d.spin *= 0.7; }
        }
      }
      d.q.multiply(_q.setFromAxisAngle(d.ax, d.spin * dt));
      const k = d.size * Math.min(1, (d.life - d.age) / 0.35);
      this.shards.setMatrixAt(i, _m.compose(d.p, d.q, _s.set(k, k, k)));
    }
    if (any) this.shards.instanceMatrix.needsUpdate = true;
    this.shards.visible = any;              // (none in flight: not drawn - in the scene, AO and all - at all)
  }

  update(dt, camera, flight) {
    if (this.camLast && dt > 0) CAM_VEL.lerp(camera.position.clone().sub(this.camLast).divideScalar(dt), 0.5);
    (this.camLast ||= new THREE.Vector3()).copy(camera.position);
    if (CAM_VEL.lengthSq() > 1e6) CAM_VEL.set(0, 0, 0);       // a cut: no blur
    for (const p of this.pools) p.update(dt);
    this.marks.update(dt);
    this.trails.update(dt);
    this.kick = Math.max(0, this.kick - dt * 1.2);
    this.streaks.update(dt, flight.speed, Math.min(1, flight.boosting + this.kick));
    for (const m of this.waves) {
      const u = m.userData;
      if (!m.visible) continue;
      u.t += dt / u.life;
      if (u.vel) m.position.addScaledVector(u.vel, dt);
      const r = 1 + u.size * Math.sqrt(u.t);
      m.scale.set(r, 1, r);
      m.material.color.copy(u.col).multiplyScalar(Math.max(0, 1 - u.t));
      m.visible = u.t < 1;
    }
    this.flashT = Math.max(0, this.flashT - dt * 1.6);
    this.flash.intensity = 5000 * this.flashT * this.flashT;
    if (this.flashT > 0) this.flash.position.addScaledVector(this.flashVel, dt);
    for (const s of this.shocks) { s.t += dt / s.life; s.at.addScaledVector(s.vel, dt); }
    if (this.shocks.length && this.shocks[0].t >= 1) this.shocks = this.shocks.filter((s) => s.t < 1);
    this.updateDebris(dt);
    this.glowT = (this.glowT || 0) + dt;
    if (this.glow && this.flashT < 0.02) {
      const g = this.glow;
      this.flash.position.copy(g.at);
      this.flash.color.copy(DRIFT_COL[g.tier]).multiplyScalar(1 / 2.4);
      this.flash.intensity = (260 + 160 * g.tier) * g.k * (0.8 + 0.2 * Math.sin(this.glowT * 47) * Math.sin(this.glowT * 31));
    }
    this.glow = null;
    if (this.ring.visible) {
      this.ringT += dt / 0.7;
      const s = 2 + 38 * Math.sqrt(this.ringT);
      this.ring.scale.set(s, 1, s);
      this.ring.material.opacity = Math.max(0, 1 - this.ringT) * 0.8;
      this.ring.visible = this.ringT < 1;
    }
  }
}
