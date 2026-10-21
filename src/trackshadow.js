// The track's fittings' sun shadows, baked once at load (Settings "Track fittings' shadows": Baked). Every frame the
// sun's three cascades drew the whole lap's gantries, lamp posts, emitters, pilasters, boards, gate legs, flip rings,
// tunnel ribs and towers again (each one instanced mesh over the lap: all of it in every map), and every pixel of the
// deck and walls searched them out with the soft-shadow filter ("try backing every shadow ... so we save a lot of fps").
// They never move, nor does the sun: what they shade on the track is worked out here once, finer and with a wider
// filter than a frame can afford, and the live maps keep only what moves (the ships) and the circuits' own scenery.
//
// The bake lies over the track's own surfaces in its own coordinates: across, a path over the left coping, down the
// left wall's inner face, across the deck, up the right wall and over its coping (p, metres); along, the lap (s,
// metres). That is ~60 m by several km, and the fittings shade a small part of it: it is cut into tiles of 1 x 1 m, and
// only the tiles a shadow falls on are kept - 6.25 cm a texel (12.5 on Low), in an atlas (each with a texel of its neighbours round it,
// so the filtering runs on across their edges); a table over all the tiles says where each one is, and its average
// (read instead far off, where a pixel covers many texels: nothing finer than a pixel to sparkle).
// Baked a stretch of 50 m at a time: the fittings drawn from the sun into a depth map (an orthographic box round the
// stretch) and into a coverage mask; each texel finds its point on the track; where the mask's coarse levels show no
// fitting within reach it is in the sun, else it looks for blockers within the widest penumbra and filters over the
// sun's disc (1.6 deg) by how far they are - 24 blocker probes, 48 filter taps, each a bilinear blend. Every tile's
// least light and its average then decide what is kept. A coarse copy (25 cm) stays on the CPU for the ships (shade():
// a ship under a gantry's shadow darkens - the live maps no longer have the gantry).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { gpuIdle } from './bake.js';

const SUN_ANGLE = THREE.MathUtils.degToRad(1.6);          // (the sun's disc: look.js patchShaders' sunAngleDeg)
const RUN = 24;                                            // (an instanced fitting's run in the bake's scene: instances)
const TILE = 1;                                            // a tile's metres (its texels across: TrackShadow's tex)
const LW = 4096;                                           // (a stretch's list of kept tiles: rows of this many)
const FW = 4096;                                           // (the frames' texture: rows of this many)

// The lookup in a lit material (staticSun: look.js - it scales the sun's light). x, y: across and up from the deck's
// middle (m), s: metres along the lap. Called from main() outside any branch (its footprint picks the tile's average).
export const TRACK_SUN_GLSL = /* glsl */`
uniform sampler2D tsAtlas, tsInd;
uniform vec4 tsGeo;                // a tile's metres, a texel's metres, tiles across, tiles to a column of the table
uniform vec4 tsPath;               // half the deck's width, the coping's width, the wall's height, the path's length
uniform vec3 tsLap;                // the lap's length, on (1) / off (0), tiles to a row of the atlas
float trackSun( float x, float y, float s ) {
	float W2 = tsPath.x, a = tsPath.y, b = tsPath.z, ax = abs( x ), right = step( 0.0, x ), p, ok = 1.0;
	if ( y > b - 0.08 && ax > W2 - 0.06 ) {
		// the coping's top
		float q = clamp( ax - ( W2 - 0.035 ), 0.0, a );
		p = mix( a - q, tsPath.w - a + q, right );
		ok = step( ax, W2 + a );
	} else if ( ax > W2 + 0.03 ) {
		p = 0.0; ok = 0.0;                                       // (the walls' outer faces: not in the bake)
	} else if ( ax > W2 - 0.03 ) {
		// a wall's inner face
		float q = clamp( y, 0.0, b );
		p = mix( a + b - q, tsPath.w - a - b + q, right );
	} else p = a + b + x + W2;                                  // the deck (and what stands low on it)
	if ( y < -0.05 ) ok = 0.0;                                  // (under the deck: the girders, the belly)
	float fw = max( fwidth( p ), fwidth( s ) ) / tsGeo.y;      // (texels to a pixel)
	vec2 t = vec2( clamp( p, 0.0, tsPath.w - 1e-3 ), mod( s, tsLap.x ) ) / tsGeo.x;
	ivec2 ti = ivec2( floor( t ) );
	int across = int( tsGeo.z ), rows = int( tsGeo.w ), col = ti.y / rows;
	vec4 ind = texelFetch( tsInd, ivec2( col * across + ti.x, ti.y - col * rows ), 0 );
	vec3 sb = floor( ind.rgb * 255.0 + 0.5 );
	float slot = sb.r + sb.g * 256.0 + sb.b * 65536.0, v = ind.a;
	if ( slot > 0.5 ) {
		slot -= 1.0;
		float tex = floor( tsGeo.x / tsGeo.y + 0.5 );
		vec2 o = vec2( mod( slot, tsLap.z ), floor( slot / tsLap.z ) ) * ( tex + 2.0 ) + 1.0;
		float d = textureLod( tsAtlas, ( o + fract( t ) * tex ) / vec2( textureSize( tsAtlas, 0 ) ), 0.0 ).r;
		v = mix( d, ind.a, smoothstep( 1.5, 6.0, fw ) );
	}
	return mix( 1.0, v, ok * tsLap.y );
}
`;

// a lit material of the track's swept surfaces (their 'trk' attribute: x across, y up, s along, w 2 - track.js sweep,
// hullSweep) reads the bake; meshes sharing it without the attribute (w 1, its default) do not
export function trackSunPatch(mat, U) {
  const before = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    before.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 trk;\nvarying vec4 vTrk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvTrk = trk;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vTrk;\n' + TRACK_SUN_GLSL)
      .replace('#include <lights_fragment_begin>', '\tstaticSun = mix( 1.0, trackSun( vTrk.x, vTrk.y, vTrk.z ), step( 1.5, vTrk.w ) );\n#include <lights_fragment_begin>');
  };
  mat.customProgramCacheKey = () => key.call(mat) + '-tracksun';
  return mat;
}

// the materials' uniforms (Track.tsU), empty and off until baked
export const trackSunUniforms = (halfW, length) => ({ tsAtlas: { value: null }, tsInd: { value: null },
  tsGeo: { value: new THREE.Vector4(TILE, TILE / 16, 1, 1) }, tsPath: { value: new THREE.Vector4(halfW, 1, 1, 1) },
  tsLap: { value: new THREE.Vector3(length, 0, 1) } });

const vert = /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const P_CELLS = (P, G) => Math.ceil(P / G);

export class TrackShadow {
  // track: Track (its tsU: the materials' uniforms, filled in here); sunDir: toward the sun (world); wall: { h: the
  // wall's height to the coping's top, t: its thickness }; atlas: [w, h] (texels); tex: texels across a tile (16:
  // 6.25 cm; 8 on Low, a quarter of the work); taps: blocker probes, filter taps
  constructor(track, sunDir, wall, { atlas = [4096, 8192], maxTex = 8192, tex = 16, taps = [24, 48] } = {}) {
    this.track = track;
    this.tex = tex; this.pad = tex + 2; this.taps = taps;
    this.sun = sunDir.clone().normalize();
    const W2 = track.W / 2, a = wall.t + 0.085, b = wall.h, P = 2 * a + 2 * b + track.W;
    this.path = { W2, a, b, P };
    this.Pt = Math.ceil(P / TILE);
    this.St = Math.ceil(track.length / TILE);
    this.rows = Math.min(maxTex, this.St);                 // (the table: tiles along a column, columns side by side)
    this.cols = Math.ceil(this.St / this.rows);
    this.perRow = Math.floor(atlas[0] / this.pad);
    this.slots = this.perRow * Math.floor(atlas[1] / this.pad);
    this.atlas = new THREE.WebGLRenderTarget(atlas[0], atlas[1], { format: THREE.RedFormat, type: THREE.UnsignedByteType,
      depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    // (the table: rgb a tile's slot in the atlas + 1 - 0: none, a its average; all in the sun to start)
    this.indData = new Uint8Array(this.Pt * this.cols * this.rows * 4);
    for (let i = 3; i < this.indData.length; i += 4) this.indData[i] = 255;
    this.ind = new THREE.DataTexture(this.indData, this.Pt * this.cols, this.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    const U = (this.uniforms = track.tsU);
    U.tsAtlas.value = this.atlas.texture;
    U.tsInd.value = this.ind;
    U.tsGeo.value.set(TILE, TILE / tex, this.Pt, this.rows);
    U.tsPath.value.set(W2, a, b, P);
    U.tsLap.value.set(track.length, 0, this.perRow);
    this.used = 0;
    this.over = 0;                                          // (shaded tiles past the atlas's room: their average only)
    this.baked = false;
  }

  // casters: the static meshes whose shadows are baked (their castShadow is the caller's to turn off afterwards)
  async bake(renderer, scene, casters, progress) {
    // (stretches of 50 m; 100 on a lap over 20 km - each stretch waits once for the GPU: the Pyramid Run's 56 km)
    const tr = this.track, STRETCH = tr.length > 20000 ? 100 : 50;
    const n = tr.n, S = 2048, TEX = this.tex, PAD = this.pad, ds = TILE / TEX, rowsT = STRETCH / TILE, Pt = this.Pt;
    const [NB, NF] = this.taps;
    const segW = Pt * TEX + 2, segH = rowsT * TEX + 2;
    // the track's frames: position, right, up - one row each
    // (folded into rows of FW: a 56 km lap has 28,000 frames, past any texture's width)
    const fr = Math.ceil(n / FW), fd = new Float32Array(FW * fr * 3 * 4);
    for (let i = 0; i < n; i++) for (const [r, v] of [[0, tr.P[i]], [1, tr.R[i]], [2, tr.U[i]]]) fd.set([v.x, v.y, v.z, 1], ((r * fr + Math.floor(i / FW)) * FW + (i % FW)) * 4);
    const frames = new THREE.DataTexture(fd, FW, fr * 3, THREE.RGBAFormat, THREE.FloatType);
    frames.needsUpdate = true;
    const cast = new THREE.WebGLRenderTarget(S, S, { depthTexture: new THREE.DepthTexture(S, S, THREE.FloatType),
      minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true });
    const seg = new THREE.WebGLRenderTarget(segW, segH, { format: THREE.RedFormat, depthBuffer: false });

    // the ships' copy: 25 cm cells - coarser on a long, wide lap (a few MB at most)
    let G = 0.25;
    while ((P_CELLS(this.path.P, G) * tr.length) / G > 16e6 && G < 1) G *= 2;
    const CPU_G = G, cw = Math.ceil((Pt * TILE) / CPU_G / 4), ch = rowsT * (TILE / CPU_G);
    const rbW = Math.max(Pt, cw), rb = new THREE.WebGLRenderTarget(rbW, rowsT + ch, { depthBuffer: false });
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const geo = new THREE.Vector4(ds, segW, segH, 0), path = this.uniforms.tsPath.value;
    const resolve = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { frames: { value: frames }, nF: { value: n }, fRows: { value: fr }, stepM: { value: tr.step }, depthMap: { value: cast.depthTexture },
        cover: { value: cast.texture }, coverLod: { value: 6 }, sunVP: { value: new THREE.Matrix4() }, sunDir: { value: this.sun },
        range: { value: 5999 }, box: { value: new THREE.Vector2() }, s0: { value: 0 }, geo: { value: geo }, path: { value: path },
        tanSun: { value: Math.tan(SUN_ANGLE) } },
      vertexShader: vert,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D frames, depthMap, cover; uniform float nF, fRows, stepM, range, tanSun, s0, coverLod; uniform mat4 sunVP;
        uniform vec3 sunDir; uniform vec2 box; uniform vec4 geo, path;
        vec3 frameAt(int row, float s) {
          float fi = s / stepM, f = fract(fi);
          int i0 = int(mod(floor(fi), nF)), i1 = int(mod(floor(fi) + 1.0, nF));
          int r0 = row * int(fRows);
          return mix(texelFetch(frames, ivec2(i0 % ${FW}, r0 + i0 / ${FW}), 0).xyz, texelFetch(frames, ivec2(i1 % ${FW}, r0 + i1 / ${FW}), 0).xyz, f);
        }
        float depthAt(ivec2 t) { return texelFetch(depthMap, clamp(t, ivec2(0), ivec2(${S - 1})), 0).x; }
        // lit or not, blended over the four texels round uv (a blocker's outline is not a staircase of texels)
        float litAt(vec2 uv, float z) {
          vec2 c = uv * ${S}.0 - 0.5, f = fract(c);
          ivec2 b = ivec2(floor(c));
          float a = step(z, depthAt(b)), bx = step(z, depthAt(b + ivec2(1, 0))), by = step(z, depthAt(b + ivec2(0, 1))), bxy = step(z, depthAt(b + ivec2(1, 1)));
          return mix(mix(a, bx, f.x), mix(by, bxy, f.x), f.y);
        }
        vec2 spiral(int i, float n) { float r = sqrt((float(i) + 0.5) / n), a = float(i) * 2.39996323; return r * vec2(cos(a), sin(a)); }
        void main() {
          // the texel's place: across the path (a texel's border round the stretch), along the lap
          vec2 px = floor(gl_FragCoord.xy) - 1.0;
          float p = clamp((px.x + 0.5) * geo.x, 0.0, path.w), s = s0 + (px.y + 0.5) * geo.x;
          float W2 = path.x, a = path.y, b = path.z, P = path.w, x, y; vec2 nn;
          if (p < a) { x = -(W2 - 0.035) - (a - p); y = b; nn = vec2(0.0, 1.0); }
          else if (p < a + b) { x = -W2; y = b - (p - a); nn = vec2(1.0, 0.0); }
          else if (p < P - a - b) { x = p - a - b - W2; y = 0.0; nn = vec2(0.0, 1.0); }
          else if (p < P - a) { x = W2; y = p - (P - a - b); nn = vec2(-1.0, 0.0); }
          else { x = (W2 - 0.035) + (p - (P - a)); y = b; nn = vec2(0.0, 1.0); }
          vec3 O = frameAt(0, s), R = normalize(frameAt(1, s)), U = normalize(frameAt(2, s));
          vec3 N = normalize(R * nn.x + U * nn.y);
          gl_FragColor = vec4(1.0);
          if (dot(N, sunDir) <= 0.0) return;                    // (turned from the sun: unlit anyway)
          vec3 wp = O + R * x + U * y + N * 0.03 + sunDir * 0.02;
          vec4 c = sunVP * vec4(wp, 1.0);
          vec3 sc = c.xyz / c.w * 0.5 + 0.5;
          if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0) return;
          // no fitting within reach on the mask's coarse level (a texel there ~2 m): in the sun
          vec2 ct = vec2(exp2(coverLod) / ${S}.0);
          float near = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) near += textureLod(cover, sc.xy + vec2(float(i), float(j)) * ct, coverLod).r;
          if (near <= 0.0) return;
          // blockers: within 1.5 m (the widest penumbra the fittings throw: a gantry's beam ~14 m up)
          vec2 rs = 1.5 / box;
          float zs = 0.0, nb = 0.0;
          for (int i = 0; i < ${NB}; i++) {
            float d = depthAt(ivec2((sc.xy + spiral(i, ${NB}.0) * rs) * ${S}.0));
            if (d < sc.z) { zs += d; nb += 1.0; }
          }
          if (nb < 0.5) return;
          // the penumbra: blocker-to-receiver distance x the sun's width, filtered over at least 2.5 texels
          float dist = (sc.z - zs / nb) * range, pen = max(dist * tanSun * 0.5, 2.5 * box.x / ${S}.0);
          vec2 r = vec2(pen) / box;
          float lit = 0.0;
          for (int i = 0; i < ${NF}; i++) lit += litAt(sc.xy + spiral(i, ${NF}.0) * r, sc.z);
          gl_FragColor = vec4(lit / ${NF}.0);
        }`,
    }));
    // each tile's least light and average (its texels)
    const tileStats = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { seg: { value: seg.texture } },
      vertexShader: vert,
      fragmentShader: /* glsl */`
        uniform sampler2D seg;
        void main() {
          ivec2 o = ivec2(floor(gl_FragCoord.xy)) * ${TEX} + 1;
          float lo = 1.0, sum = 0.0;
          for (int j = 0; j < ${TEX}; j++) for (int i = 0; i < ${TEX}; i++) { float v = texelFetch(seg, o + ivec2(i, j), 0).r; lo = min(lo, v); sum += v; }
          gl_FragColor = vec4(lo, sum / ${TEX * TEX}.0, 0.0, 1.0);
        }`,
    }));
    // the ships' copy: a cell's average (25 cm), four cells across to a texel
    const cpuQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { seg: { value: seg.texture } },
      vertexShader: vert,
      fragmentShader: /* glsl */`
        uniform sampler2D seg;
        const int K = ${Math.round(CPU_G / ds)};
        float cell(int cx, int cy) {
          float sum = 0.0;
          for (int j = 0; j < K; j++) for (int i = 0; i < K; i++) sum += texelFetch(seg, ivec2(cx * K + i, cy * K + j) + 1, 0).r;
          return sum / float(K * K);
        }
        void main() {
          ivec2 c = ivec2(floor(gl_FragCoord.xy)) - ivec2(0, ${rowsT});
          gl_FragColor = vec4(cell(c.x * 4, c.y), cell(c.x * 4 + 1, c.y), cell(c.x * 4 + 2, c.y), cell(c.x * 4 + 3, c.y));
        }`,
    }));
    // a stretch's kept tiles into their slots of the atlas (each with its border), in one draw: their slots run on from
    // k0, list says which tile each one is
    const lh = Math.ceil((Pt * rowsT) / LW), listData = new Uint8Array(LW * lh * 4), list = new THREE.DataTexture(listData, LW, lh, THREE.RGBAFormat, THREE.UnsignedByteType);
    const copy = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { seg: { value: seg.texture }, list: { value: list }, k0: { value: 0 }, m: { value: 0 }, perRow: { value: this.perRow } },
      vertexShader: vert,
      fragmentShader: /* glsl */`
        uniform sampler2D seg, list; uniform float k0, m, perRow;
        void main() {
          vec2 a = floor(gl_FragCoord.xy), cell = floor(a / ${PAD}.0), at = a - cell * ${PAD}.0;
          float j = cell.y * perRow + cell.x - k0;
          if (cell.x >= perRow || j < 0.0 || j >= m) discard;
          vec2 t = floor(texelFetch(list, ivec2(int(j) % ${LW}, int(j) / ${LW}), 0).rg * 255.0 + 0.5);
          gl_FragColor = vec4(texelFetch(seg, ivec2(t * ${TEX}.0 + at), 0).r);
        }`,
    }));
    const ox = new THREE.Vector3(), oy = new THREE.Vector3(), up = Math.abs(this.sun.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    ox.crossVectors(up, this.sun).normalize(); oy.crossVectors(this.sun, ox);
    // the fittings in a scene of their own, an instanced one cut into short runs along the lap (its instances are laid
    // in the lap's order): a stretch draws what stands near it, not the whole lap's (its box culls the rest)
    const bake = new THREE.Scene(), runs = [];
    bake.matrixWorldAutoUpdate = false;
    for (const m of casters) {
      m.updateWorldMatrix(true, false);
      if (m.isInstancedMesh) {
        for (let k0 = 0; k0 < m.count; k0 += RUN) {
          const k1 = Math.min(m.count, k0 + RUN), r = new THREE.InstancedMesh(m.geometry, white, k1 - k0);
          r.instanceMatrix.array.set(m.instanceMatrix.array.subarray(k0 * 16, k1 * 16));
          r.matrixAutoUpdate = false; r.matrix.copy(m.matrixWorld); r.matrixWorld.copy(m.matrixWorld);
          r.computeBoundingSphere();
          bake.add(r); runs.push(r);
        }
      } else {
        const r = new THREE.Mesh(m.geometry, white);
        r.matrixAutoUpdate = false; r.matrix.copy(m.matrixWorld); r.matrixWorld.copy(m.matrixWorld);
        bake.add(r);
      }
    }
    const keep = { shadows: renderer.shadowMap.enabled, target: renderer.getRenderTarget(), auto: renderer.autoClear,
      clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    renderer.shadowMap.enabled = false;
    renderer.autoClear = false;
    const rbuf = new Uint8Array(rbW * (rowsT + ch) * 4);
    const Sc = Math.ceil(tr.length / CPU_G), Pc = cw * 4;
    this.cpu = { buf: new Uint8Array(Pc * Sc).fill(255), Pc, Sc, G: CPU_G };
    const q = new THREE.Vector3(), c = new THREE.Vector3(), f = {};
    const total = Math.ceil(tr.length / STRETCH);
    try {
      // the atlas starts in the sun
      renderer.setRenderTarget(this.atlas); renderer.setClearColor(0xffffff, 1); renderer.clear(true, false, false);
      for (let k = 0; k < total; k++) {
        const s0 = k * STRETCH, s1 = Math.min(tr.length, s0 + STRETCH);
        // the stretch's box seen from the sun: round its deck and walls, wide enough for the filter
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        tr.frame((s0 + s1) / 2, f);
        c.copy(f.P);
        for (let s = s0 - 1; s <= s1 + 1; s += (s1 - s0 + 2) / 16) {
          tr.frame(s, f);
          for (const sx of [-1, 1]) for (const yy of [0, this.path.b + 0.1]) {
            q.copy(f.P).addScaledVector(f.R, sx * (this.path.W2 + this.path.a)).addScaledVector(f.U, yy).sub(c);
            const u = q.dot(ox), v = q.dot(oy);
            x0 = Math.min(x0, u); x1 = Math.max(x1, u); z0 = Math.min(z0, v); z1 = Math.max(z1, v);
          }
        }
        const m = 2.5;
        cam.position.copy(c).addScaledVector(this.sun, 3000);
        cam.up.copy(oy);
        cam.lookAt(c);
        Object.assign(cam, { left: x0 - m, right: x1 + m, top: z1 + m, bottom: z0 - m });
        cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        // the fittings from the sun: their depth, and where they are (the mask)
        renderer.setRenderTarget(cast);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(bake, cam);
        // the stretch's texels
        const u = resolve.material.uniforms, bw = x1 - x0 + 2 * m, bh = z1 - z0 + 2 * m;
        u.sunVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        u.box.value.set(bw, bh);
        u.s0.value = s0;
        u.coverLod.value = Math.max(0, Math.ceil(Math.log2(1.5 / (bw / S))));
        renderer.setRenderTarget(seg);
        resolve.render(renderer);
        // which tiles a shadow falls on, and the ships' copy of the stretch: read back together
        rb.viewport.set(0, 0, Pt, rowsT);
        renderer.setRenderTarget(rb);
        tileStats.render(renderer);
        rb.viewport.set(0, rowsT, cw, ch);
        renderer.setRenderTarget(rb);
        cpuQuad.render(renderer);
        renderer.readRenderTargetPixels(rb, 0, 0, rbW, rowsT + ch, rbuf);
        const k0 = this.used;
        let kept = 0;
        for (let ty = 0; ty < rowsT; ty++) {
          const st = s0 / TILE + ty;
          if (st >= this.St) break;
          const col = Math.floor(st / this.rows), iy = st - col * this.rows;
          for (let tx = 0; tx < Pt; tx++) {
            const r = (ty * rbW + tx) * 4, lo = rbuf[r], mean = rbuf[r + 1], o = (iy * this.Pt * this.cols + col * this.Pt + tx) * 4;
            if (lo >= 251) continue;                              // (in the sun throughout)
            this.indData[o + 3] = mean;
            // a shadow's own tile kept in full; the edge of a penumbra only (under 6 % at its darkest), or past the
            // atlas's room: its average
            if (lo >= 240 || this.used >= this.slots) { if (lo < 240) this.over++; continue; }
            const slot = ++this.used;                             // (stored + 1: 0 is none)
            this.indData[o] = slot & 255; this.indData[o + 1] = (slot >> 8) & 255; this.indData[o + 2] = slot >> 16;
            listData[kept * 4] = tx; listData[kept * 4 + 1] = ty; kept++;
          }
        }
        if (kept) {
          list.needsUpdate = true;
          const cu = copy.material.uniforms, r0 = Math.floor(k0 / this.perRow), r1 = Math.floor((k0 + kept - 1) / this.perRow);
          cu.k0.value = k0; cu.m.value = kept;
          this.atlas.viewport.set(0, r0 * PAD, this.atlas.width, (r1 - r0 + 1) * PAD);
          renderer.setRenderTarget(this.atlas);
          copy.render(renderer);
          this.atlas.viewport.set(0, 0, this.atlas.width, this.atlas.height);
        }
        const c0 = Math.round(s0 / CPU_G);
        for (let y = 0; y < ch && c0 + y < Sc; y++) this.cpu.buf.set(rbuf.subarray((rowsT + y) * rbW * 4, (rowsT + y) * rbW * 4 + cw * 4), (c0 + y) * Pc);
        if (k % 4 === 3) { await gpuIdle(renderer); progress?.(k + 1, total); }
      }
      this.ind.needsUpdate = true;
      await gpuIdle(renderer);
    } finally {
      for (const r of runs) r.dispose();
      renderer.shadowMap.enabled = keep.shadows;
      renderer.autoClear = keep.auto;
      renderer.setClearColor(keep.clear, keep.alpha);
      renderer.setRenderTarget(keep.target);
      for (const t of [cast, seg, rb]) t.dispose();
      list.dispose();
      for (const x of [resolve, tileStats, cpuQuad, copy]) x.dispose();
      frames.dispose(); white.dispose();
    }
    this.baked = true;
  }

  // the bake's light at a point of the deck (s along, x across, metres) - a ship's place, moved down along the sun's
  // rays from h over the deck to where its shadow would fall
  shade(s, x, h = 0, f = this._f || (this._f = {})) {
    if (!this.cpu) return 1;
    const { buf, Pc, Sc, G } = this.cpu, tr = this.track;
    if (h > 0) {
      tr.frame(s, f);
      const up = this.sun.dot(f.U);
      if (up > 0.05) { s -= (this.sun.dot(f.T) * h) / up; x -= (this.sun.dot(f.R) * h) / up; }
    }
    const p = this.path.a + this.path.b + Math.max(-this.path.W2, Math.min(this.path.W2, x)) + this.path.W2;
    const gp = p / G - 0.5, gs = ((((s % tr.length) + tr.length) % tr.length) / G) - 0.5;
    const p0 = Math.max(0, Math.min(Pc - 2, Math.floor(gp))), fp = Math.max(0, Math.min(1, gp - p0));
    const s0 = ((Math.floor(gs) % Sc) + Sc) % Sc, s1 = (s0 + 1) % Sc, fs = gs - Math.floor(gs);
    const v = (pi, si) => buf[si * Pc + pi] / 255;
    return (v(p0, s0) * (1 - fp) + v(p0 + 1, s0) * fp) * (1 - fs) + (v(p0, s1) * (1 - fp) + v(p0 + 1, s1) * fp) * fs;
  }

  dispose() { this.atlas.dispose(); this.ind.dispose(); }
}
