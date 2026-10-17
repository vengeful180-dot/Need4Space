// Post passes: a NaN guard before the bloom, and Blender's own AgX view transform as the final pass.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// One NaN pixel (a degenerate tangent, pow() of a negative) became a black square once the bloom blurred it.
// Whatever produces one, it is zeroed here before any blur sees it; extreme fireflies are capped too.
const SANITIZE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      // no isnan(): ANGLE's D3D compiler may fold it away ("value cannot be NaN"); its max() returns the
      // non-NaN operand, so the clamp alone maps NaN to 0 and Inf to the cap
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(min(max(c.rgb, vec3(0.0)), vec3(512.0)), 1.0);
    }`,
};
export function sanitizePass() {
  return new ShaderPass(SANITIZE);                       // (ShaderPass clones the uniforms)
}

// XR's compositor needs one depth range for the entire submitted image. The
// private near/far buffers keep precision; this resolve restores the session's
// native depth encoding, including distant geometry behind the near slice.
export function xrResolve() {
  return new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: { nearColor: { value: null }, farColor: { value: null }, nearDepth: { value: null }, farDepth: { value: null },
      near: { value: 0.2 }, split: { value: 500 }, far: { value: 30000 },
      nativeNear: { value: 0.2 }, nativeFar: { value: 30000 },
      sourceScale: { value: new THREE.Vector2(1, 1) }, sourceTexel: { value: new THREE.Vector2() } },
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, blending: THREE.NoBlending,
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      #include <packing>
      uniform sampler2D nearColor, farColor, nearDepth, farDepth;
      uniform float near, split, far, nativeNear, nativeFar;
      uniform vec2 sourceScale, sourceTexel;
      varying vec2 vUv;
      void main() {
        // Race resolution uses a smaller viewport in the existing buffers.
        // Clamp to texel centres so unused pixels never bleed into the edges.
        vec2 uv = clamp(vUv * sourceScale, sourceTexel * 0.5, sourceScale - sourceTexel * 0.5);
        vec4 n = texture2D(nearColor, uv), f = texture2D(farColor, uv);
        // Transparent near geometry is premultiplied by the framebuffer blend.
        vec3 color = n.rgb + f.rgb * (1.0 - clamp(n.a, 0.0, 1.0));
        gl_FragColor = vec4(min(max(color, vec3(0.0)), vec3(512.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float nd = texture2D(nearDepth, uv).r, fd = texture2D(farDepth, uv).r;
        float z = nd < 1.0 ? perspectiveDepthToViewZ(nd, near, split) : perspectiveDepthToViewZ(fd, split, far);
        gl_FragDepth = nd < 1.0 || fd < 1.0 ? viewZToPerspectiveDepth(z, nativeNear, nativeFar) : 1.0;
      }`,
  }));
}

// The look renders' view transform (AgX, "Medium High Contrast", sRGB), baked by blender/make_agx_lut_web.py into a
// 3D LUT over log2(x / 0.18). three's own AgX is the bare base curve: grey and flat next to the Cycles renders.
export async function agxPass(urls) {
  const luts = [];
  let meta = null;
  // (all four files at once - one after another they held the load ~2 s behind the ship's download)
  const files = await Promise.all(urls.map((url) => Promise.all([
    fetch(url.replace(/\.bin$/, '.json')).then((r) => r.json()), fetch(url).then((r) => r.arrayBuffer())])));
  for (const [i, url] of urls.entries()) {
    meta = files[i][0];
    const data = new Uint8Array(files[i][1]);
    const N = meta.N;
    if (data.length !== N * N * N * 4) throw new Error(`AgX LUT ${url}: ${data.length} bytes, expected ${N * N * N * 4}`);
    const lut = new THREE.Data3DTexture(data, N, N, N);
    lut.format = THREE.RGBAFormat;
    lut.type = THREE.UnsignedByteType;
    lut.minFilter = lut.magFilter = THREE.LinearFilter;
    lut.wrapS = lut.wrapT = lut.wrapR = THREE.ClampToEdgeWrapping;
    lut.unpackAlignment = 1;
    lut.needsUpdate = true;
    luts.push(lut);
  }
  const N = meta.N, lut = luts[0];
  const pass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, lut: { value: lut }, exposure: { value: 1 },
      evMin: { value: meta.ev_min }, evMax: { value: meta.ev_max }, n: { value: N } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      precision highp sampler3D;
      uniform sampler2D tDiffuse; uniform sampler3D lut; uniform float exposure, evMin, evMax, n;
      varying vec2 vUv;
      void main() {
        vec3 c = max(texture2D(tDiffuse, vUv).rgb * exposure, vec3(0.0));
        vec3 e = (log2(max(c, vec3(1e-10)) / 0.18) - evMin) / (evMax - evMin);
        vec3 d = texture(lut, clamp(e, 0.0, 1.0) * ((n - 1.0) / n) + 0.5 / n).rgb;
        vec2 vq = (vUv - 0.5) * vec2(1.0, 0.75);
        d *= 1.0 - 0.28 * smoothstep(0.2, 0.78, length(vq));      // a lens vignette, gentle
        float r = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor = vec4(d + (r - 0.5) / 255.0, 1.0);        // display-encoded already; dithered
      }`,
  });
  pass.luts = luts;
  pass.setLook = (i) => { pass.uniforms.lut.value = luts[i]; };
  return pass;
}

// Speed blur: the frame smeared toward its centre, only out at the edges, with speed and boost
export function speedBlurPass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
      void main() {
        vec2 dir = vUv - 0.5;
        float m = smoothstep(0.12, 0.65, length(dir * vec2(1.0, 0.7))) * strength;
        if (m < 2e-4) { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); return; }   // the sharp middle
        vec3 c = vec3(0.0);
        for (int i = 0; i < 12; i++) c += texture2D(tDiffuse, vUv - dir * m * (float(i) / 11.0)).rgb;
        gl_FragColor = vec4(c / 12.0, 1.0);
      }`,
  });
}

// The backdrop (planet, sun, stars: its own scene and camera, 200 km of depth) first, then the depth cleared and the
// game scene over it - no depth-precision fight between a 2 cm bolt and a 14,000 km planet. Both go into this pass's
// own multisampled target; the NaN / Inf guard resolves it into the chain. Every pass after this one runs on plain
// targets (the composer's were multisampled too: each full-screen pass wrote four samples a pixel and resolved them
// again - a millisecond of nothing).
// The scene itself is drawn in two depth slices: everything beyond `split` metres first, with its own near plane, then
// the near slice over it (depth cleared between). One 0.2 m .. 30 km range left the depth buffer ~7 m steps at 5 km,
// so at the ring station the hub's cone, the spoke roots and the docking lights fought the surfaces behind them for
// the same depth and flickered ("this still flickers, especially in the middle"); the far slice resolves ~3 mm there.
// Each pixel is still shaded once; things that span the split are drawn in both slices, each clipped to its own.
export class LayeredRenderPass extends Pass {
  constructor(sky, skyCam, scene, camera, samples = 4, split = 500) {
    super();
    Object.assign(this, { sky, skyCam, scene, camera, split });
    this.msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, resolveDepthBuffer: false });
    this.clean = new FullScreenQuad(new THREE.ShaderMaterial({ ...SANITIZE, uniforms: { tDiffuse: { value: null } } }));
    this.farCam = new THREE.PerspectiveCamera();
    this.nearCam = new THREE.PerspectiveCamera();
    for (const c of [this.farCam, this.nearCam]) { c.matrixAutoUpdate = false; c.matrixWorldAutoUpdate = false; }
  }

  // (layer 3: what is only ever far - drawn in the far slice alone; layer 4: only ever near - the near slice alone)
  slice(c, near, far, skip = 0) {
    const cam = this.camera;
    c.fov = cam.fov; c.aspect = cam.aspect; c.zoom = cam.zoom; c.near = near; c.far = far;
    c.layers.mask = cam.layers.mask & ~skip;
    c.updateProjectionMatrix();
    c.matrixWorld.copy(cam.matrixWorld);
    c.matrixWorldInverse.copy(cam.matrixWorldInverse);
    return c;
  }

  setSize(w, h) { this.msaa.setSize(w, h); }

  render(renderer, writeBuffer) {
    const ac = renderer.autoClear;
    const gl = renderer.getContext(), blit = gl.blitFramebuffer;
    let deferResolve = true;
    // r170 resolves after every render(), but only the completed scene colour is sampled.
    // Keep resolves of other targets (including transmission) and the final scene slice.
    if (this.msaa.samples) gl.blitFramebuffer = (...args) => {
      if (!deferResolve || renderer.getRenderTarget() !== this.msaa) blit.apply(gl, args);
    };
    renderer.autoClear = false;
    try {
      renderer.setRenderTarget(this.msaa);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, true);
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;               // consumed by the scene render below (the sky has no shadows)
      if (this.sky) renderer.render(this.sky, this.skyCam);
      renderer.clearDepth();
      const cam = this.camera;
      if (this.split > 0 && cam.isPerspectiveCamera && cam.far > this.split * 2) {
        renderer.render(this.scene, this.slice(this.farCam, this.split, cam.far, 1 << 4));      // (the shadow maps update here)
        renderer.clearDepth();
        deferResolve = false;
        renderer.render(this.scene, this.slice(this.nearCam, cam.near, this.split, 1 << 3));
      } else {
        deferResolve = false;
        renderer.render(this.scene, cam);
      }
    } finally {
      gl.blitFramebuffer = blit;
      renderer.autoClear = ac;
    }
    this.clean.material.uniforms.tDiffuse.value = this.msaa.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.clean.render(renderer);
  }
}

// Screen-space reflections on the deck: the deck alone is drawn into a depth mask (layer 5), then for every deck
// pixel a ray is marched in view space against the AO pass's depth (its normal + depth targets are reused, so the
// scene is not drawn again), the hit's colour taken from the frame, weighted by fresnel and faded at the screen's
// edges, blurred a little (a glossy deck) at half resolution and added on.
// "the reflections flicker": a ray either hit or missed and its fixed steps landed on or off a thin ship or a lamp
// from one frame to the next, and a lamp's 40x-HDR pixel came and went. Now the ray's start is jittered each frame,
// a hit near the edge of the depth's thickness fades instead of switching, bright hits are compressed, and the result
// is accumulated over frames, the history clamped to the current neighbourhood so nothing ghosts.
// "fix the reflections, kinda flicker sometimes": at race speed the camera moves ~5 m a frame and what the rays find
// changes from frame to frame (an edge, a light strip, a gate's glowing arch) - measured as the reflection's own frame-
// to-frame change, that was as large as the reflection. Now:
//  - the history is fetched where the mirror image was last frame (as far behind the deck as the hit is in front of
//    it; each pixel carries its ray's length in the alpha, the composite adds the colour only), not where the deck's
//    point was - at 5 m a frame that warp's error is 60 % instead of 92 %
//  - the history is clamped to the neighbourhood's mean +- 1.5 sigma (its min / max emptied a reflection whenever all
//    its rays missed for one frame), and dropped on a cut (the fly-by camera's next shot, a respawn, another view)
//  - bright hits are compressed harder (a light's reflection blooms less) and a last, wider blur pass spreads what is
//    left: pixels jumping visibly from one frame to the next along a wall at race speed 3883 -> 652, under a gate
//    1529 -> 467 (a satin deck's reflection is soft anyway)
export class DeckSSRPass extends Pass {
  constructor(scene, camera, gtao, layer = 5) {
    super();
    Object.assign(this, { scene, camera, gtao, layer });
    this.strength = 1.0;
    this.wide = 6;                                         // (the last blur's reach, texels of the half-size target)
    this.maskRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
    const half = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.ssrRT = half();
    this.blurRT = half();
    this.maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.ssr = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null }, tMask: { value: null },
        proj: { value: new THREE.Matrix4() }, invProj: { value: new THREE.Matrix4() }, near: { value: 0.1 }, far: { value: 1000 },
        frame: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tColor, tDepth, tNormal, tMask; uniform mat4 proj, invProj; uniform float near, far, frame;
        varying vec2 vUv;
        float viewZ(vec2 uv) { return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
        vec3 viewPos(vec2 uv, float vz) {
          vec4 p = invProj * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
          p.xyz /= p.w;
          return p.xyz * (vz / p.z);
        }
        vec2 project(vec3 q) { vec4 c = proj * vec4(q, 1.0); return c.xy / c.w * 0.5 + 0.5; }
        void main() {
          gl_FragColor = vec4(0.0);
          float d = texture2D(tDepth, vUv).x, md = texture2D(tMask, vUv).x;
          if (d >= 1.0 || md >= 1.0) return;
          float vz = perspectiveDepthToViewZ(d, near, far);
          if (abs(perspectiveDepthToViewZ(md, near, far) - vz) > 0.25) return;       // something stands on the deck here
          vec3 P = viewPos(vUv, vz), N = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0), V = normalize(P);
          vec3 R = normalize(reflect(V, N));
          float step = 0.4 + length(P) * 0.01;
          // interleaved gradient noise, a new pattern each frame: the steps' aliasing becomes noise the history averages
          float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy + frame * 5.588238, vec2(0.06711056, 0.00583715))));
          vec3 Q = P + N * 0.05 + R * step * jit, prev = Q;
          vec2 hit = vec2(-1.0);
          float t = 0.0, conf = 0.0;
          for (int i = 0; i < 56; i++) {
            prev = Q;
            Q += R * step;
            step *= 1.07;
            vec2 s = project(Q);
            if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || Q.z > -near) break;
            float sz = viewZ(s), diff = sz - Q.z;
            float thick = step * 3.0 + 0.4;
            if (diff > 0.0 && diff < thick) {
              conf = 1.0 - smoothstep(0.55, 1.0, diff / thick);    // behind a thin edge: fades, not switches
              vec3 a = prev, b = Q;                         // refine between the last two points
              for (int k = 0; k < 6; k++) {
                vec3 m = (a + b) * 0.5;
                if (viewZ(project(m)) > m.z) b = m; else a = m;
              }
              hit = project(b);
              t = float(i) / 56.0;
              break;
            }
          }
          if (hit.x < 0.0) return;
          // a satin deck, not a mirror ("the road looks too reflective now and fake"): dielectric fresnel scaled by the
          // deck's roughness and capped, fading with the reflection's length and the deck's distance from the camera
          float edge = min(min(hit.x, 1.0 - hit.x), min(hit.y, 1.0 - hit.y));
          float rayLen = distance(viewPos(hit, viewZ(hit)), P);
          // ("increase ... reflection distance a bit": the reflection's length 30 -> 55 m, the deck's distance 160 -> 260 m)
          float fade = smoothstep(0.0, 0.12, edge) * (1.0 - smoothstep(0.45, 0.95, t)) * smoothstep(0.3, -0.1, R.z)
            * exp(-rayLen / 55.0) * (1.0 - smoothstep(100.0, 260.0, -P.z));
          float F = 0.04 + 0.96 * pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 5.0);
          float w = min(F, 0.45) * 0.35 * fade * conf;
          vec3 hc = texture2D(tColor, hit).rgb;
          hc /= 1.0 + dot(hc, vec3(0.2126, 0.7152, 0.0722)) / 5.0;    // a lamp's core reflects, it doesn't sparkle (or bloom)
          gl_FragColor = vec4(hc * w, w > 0.0 ? rayLen : 0.0);         // (alpha: the ray's length, for the history)
        }`,
    }));
    this.histA = half();
    this.histB = half();
    this.prevViewProj = new THREE.Matrix4();
    this.frame = 0;
    this.valid = false;
    this.resolve = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tCur: { value: null }, tHist: { value: null }, tDepth: { value: null }, tMask: { value: null },
        invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, prevViewProj: { value: new THREE.Matrix4() },
        near: { value: 0.1 }, far: { value: 1000 }, texel: { value: new THREE.Vector2() }, blend: { value: 0.9 }, valid: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        #include <packing>
        uniform sampler2D tCur, tHist, tDepth, tMask; uniform mat4 invProj, camWorld, prevViewProj;
        uniform float near, far, blend, valid; uniform vec2 texel;
        varying vec2 vUv;
        void main() {
          vec4 cur = texture2D(tCur, vUv);
          float d = texture2D(tDepth, vUv).x, md = texture2D(tMask, vUv).x;
          float vz = perspectiveDepthToViewZ(d, near, far);
          if (d >= 1.0 || md >= 1.0 || abs(perspectiveDepthToViewZ(md, near, far) - vz) > 0.25) { gl_FragColor = vec4(0.0); return; }
          // the neighbourhood: its mean and spread, and the length of its rays that hit
          vec3 m1 = vec3(0.0), m2 = vec3(0.0);
          float len = 0.0, nl = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec4 c = texture2D(tCur, vUv + vec2(float(x), float(y)) * texel);
            m1 += c.rgb; m2 += c.rgb * c.rgb;
            if (c.a > 0.0) { len += c.a; nl += 1.0; }
          }
          m1 /= 9.0;
          vec3 sg = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
          len = nl > 0.0 ? len / nl : 0.0;
          // the mirror image: down the view ray, the hit's distance beyond the deck
          vec4 v = invProj * vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
          vec3 P = v.xyz / v.w;
          P *= vz / P.z;
          vec3 Pw = (camWorld * vec4(P, 1.0)).xyz, Vw = Pw + normalize(Pw - camWorld[3].xyz) * len;
          vec4 pc = prevViewProj * vec4(Vw, 1.0);
          vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
          if (valid < 0.5 || pc.w <= 0.0 || puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0) { gl_FragColor = cur; return; }
          vec4 h = texture2D(tHist, puv);
          h.rgb = clamp(h.rgb, m1 - 1.5 * sg, m1 + 1.5 * sg);
          gl_FragColor = vec4(mix(cur.rgb, h.rgb, blend), cur.a);
        }`,
    }));
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`uniform sampler2D tIn; uniform vec2 dir; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tIn, vUv) * 0.227;
          c += (texture2D(tIn, vUv + dir * 1.385) + texture2D(tIn, vUv - dir * 1.385)) * 0.316;
          c += (texture2D(tIn, vUv + dir * 3.231) + texture2D(tIn, vUv - dir * 3.231)) * 0.070;
          gl_FragColor = c;
        }`,
    }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tSSR: { value: null }, strength: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`uniform sampler2D tColor, tSSR; uniform float strength; varying vec2 vUv;
        void main() { vec4 c = texture2D(tColor, vUv); gl_FragColor = vec4(c.rgb + texture2D(tSSR, vUv).rgb * strength, c.a); }`,
    }));
  }

  setSize(w, h) {
    this.maskRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.ssrRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.blurRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.histA.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.histB.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.w = w >> 1; this.h = h >> 1;
    this.valid = false;                                    // the history is another size's: start over
  }

  setReflector(mesh) {
    this.reflector = mesh;
    this.maskScene = new THREE.Scene();
    this.maskScene.matrixWorldAutoUpdate = false;
    this.maskMesh = new THREE.Mesh(mesh.geometry, this.maskMat);
    this.maskMesh.matrixAutoUpdate = this.maskMesh.matrixWorldAutoUpdate = false;
    this.maskMesh.layers.set(this.layer);
    this.maskScene.add(this.maskMesh);
  }

  render(renderer, writeBuffer, readBuffer) {
    // A separate render state keeps this unlit mask from invalidating the main scene's light programs.
    const scene = this.maskScene || this.scene;
    if (this.reflector) {
      const mesh = this.reflector, mask = this.maskMesh;
      mask.geometry = mesh.geometry;
      mask.matrixWorld.copy(mesh.matrixWorld);
      mask.frustumCulled = mesh.frustumCulled;
      mask.visible = mesh.visible && mesh.material.visible && mesh.layers.isEnabled(this.layer);
      scene.fog = this.scene.fog;
    }
    const cam = this.camera, prevLayers = cam.layers.mask, prevOverride = scene.overrideMaterial;
    cam.layers.set(this.layer);
    scene.overrideMaterial = this.maskMat;
    renderer.setRenderTarget(this.maskRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    scene.overrideMaterial = prevOverride;
    cam.layers.mask = prevLayers;
    const u = this.ssr.material.uniforms;
    u.tColor.value = readBuffer.texture;
    u.tDepth.value = this.gtao.normalRenderTarget.depthTexture;
    u.tNormal.value = this.gtao.normalRenderTarget.texture;
    u.tMask.value = this.maskRT.depthTexture;
    u.proj.value.copy(cam.projectionMatrix);
    u.invProj.value.copy(cam.projectionMatrixInverse);
    u.near.value = cam.near; u.far.value = cam.far;
    u.frame.value = this.frame = (this.frame + 1) % 64;
    renderer.setRenderTarget(this.ssrRT);
    this.ssr.render(renderer);
    // temporal: last frame's result, reprojected and clamped, blended with this frame's
    const r = this.resolve.material.uniforms;
    r.tCur.value = this.ssrRT.texture; r.tHist.value = this.histA.texture;
    r.tDepth.value = u.tDepth.value; r.tMask.value = u.tMask.value;
    r.invProj.value.copy(cam.projectionMatrixInverse); r.camWorld.value.copy(cam.matrixWorld);
    r.prevViewProj.value.copy(this.prevViewProj);
    r.near.value = cam.near; r.far.value = cam.far;
    r.texel.value.set(1 / this.w, 1 / this.h);
    // a cut (the fly-by camera's next shot, a respawn, another view): last frame's history is of somewhere else
    const cp = cam.matrixWorld.elements, moved = this.lastCam ? Math.hypot(cp[12] - this.lastCam[0], cp[13] - this.lastCam[1], cp[14] - this.lastCam[2]) : 0;
    const turned = this.lastCam ? cp[8] * this.lastCam[3] + cp[9] * this.lastCam[4] + cp[10] * this.lastCam[5] : 1;
    if (moved > 30 || turned < 0.94) this.valid = false;
    this.lastCam = [cp[12], cp[13], cp[14], cp[8], cp[9], cp[10]];
    r.valid.value = this.valid ? 1 : 0;
    renderer.setRenderTarget(this.histB);
    this.resolve.render(renderer);
    [this.histA, this.histB] = [this.histB, this.histA];
    this.prevViewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.valid = true;
    const b = this.blur.material.uniforms;
    b.tIn.value = this.histA.texture; b.dir.value.set(1 / this.w, 0);
    renderer.setRenderTarget(this.blurRT); this.blur.render(renderer);
    b.tIn.value = this.blurRT.texture; b.dir.value.set(0, 1 / this.h);
    renderer.setRenderTarget(this.ssrRT); this.blur.render(renderer);
    b.tIn.value = this.ssrRT.texture; b.dir.value.set(2.5 / this.w, 0);
    renderer.setRenderTarget(this.blurRT); this.blur.render(renderer);
    b.tIn.value = this.blurRT.texture; b.dir.value.set(0, 2.5 / this.h);
    renderer.setRenderTarget(this.ssrRT); this.blur.render(renderer);
    // and a wider one: a satin deck's reflection is soft, and what a fast camera's rays pick up differently from frame
    // to frame (an edge, a lamp, a gate's arch) spreads out instead of flickering
    for (const k of this.wide ? [this.wide] : []) {
      b.tIn.value = this.ssrRT.texture; b.dir.value.set(k / this.w, 0);
      renderer.setRenderTarget(this.blurRT); this.blur.render(renderer);
      b.tIn.value = this.blurRT.texture; b.dir.value.set(0, k / this.h);
      renderer.setRenderTarget(this.ssrRT); this.blur.render(renderer);
    }
    const c = this.comp.material.uniforms;
    c.tColor.value = readBuffer.texture; c.tSSR.value = this.ssrRT.texture; c.strength.value = this.strength;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }
}

// Anamorphic streaks: only the very brightest lights (engine cores, the sun, light-strip cores) are pulled out at a
// quarter resolution and smeared sideways into thin blue lines - the lens look of a high-contrast HDR image.
export class StreakPass extends Pass {
  constructor() {
    super();
    this.strength = 0.14;
    this.threshold = 6.0;
    const q = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.a = q(); this.b = q();
    const vs = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    this.bright = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, threshold: { value: 3 } }, vertexShader: vs,
      fragmentShader: /* glsl */`uniform sampler2D tIn; uniform float threshold; varying vec2 vUv;
        void main() {
          vec3 c = min(texture2D(tIn, vUv).rgb, vec3(60.0));
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(c * max(l - threshold, 0.0) / max(l, 1e-4), 1.0);
        }`,
    }));
    this.smear = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, stepX: { value: 0 } }, vertexShader: vs,
      fragmentShader: /* glsl */`uniform sampler2D tIn; uniform float stepX; varying vec2 vUv;
        void main() {
          vec3 c = vec3(0.0); float wsum = 0.0;
          for (int i = -7; i <= 7; i++) {
            float w = exp(-float(i * i) / 18.0);
            c += texture2D(tIn, vUv + vec2(float(i) * stepX, 0.0)).rgb * w; wsum += w;
          }
          gl_FragColor = vec4(c / wsum, 1.0);
        }`,
    }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tStreak: { value: null }, strength: { value: 0.2 } }, vertexShader: vs,
      fragmentShader: /* glsl */`uniform sampler2D tColor, tStreak; uniform float strength; varying vec2 vUv;
        void main() { vec4 c = texture2D(tColor, vUv); gl_FragColor = vec4(c.rgb + texture2D(tStreak, vUv).rgb * vec3(0.45, 0.7, 1.0) * strength, c.a); }`,
    }));
  }

  setSize(w, h) { this.a.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); this.b.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); this.w = w >> 2; }

  render(renderer, writeBuffer, readBuffer) {
    this.bright.material.uniforms.tIn.value = readBuffer.texture;
    this.bright.material.uniforms.threshold.value = this.threshold;
    renderer.setRenderTarget(this.a); this.bright.render(renderer);
    let src = this.a, dst = this.b;
    for (const k of [1, 4, 12]) {                          // three smears, each wider: a long thin streak
      this.smear.material.uniforms.tIn.value = src.texture;
      this.smear.material.uniforms.stepX.value = k / this.w;
      renderer.setRenderTarget(dst); this.smear.render(renderer);
      [src, dst] = [dst, src];
    }
    const c = this.comp.material.uniforms;
    c.tColor.value = readBuffer.texture; c.tStreak.value = src.texture; c.strength.value = this.strength;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }
}

// Bloom, the dual-filter way (Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare"): a chain of
// half-size levels made with a 13-tap downsample - the first one thresholded (soft knee) and Karis-averaged, so a single
// hot pixel (a sun glint, a lamp's core) cannot dominate its block - then a 9-tap tent upsample back up, each level
// added to the one above it, weighted by `radius` per level (low: a tight glow). UnrealBloom's half-size taps on a
// 2-pixel glint drew squares.
export class BloomPass extends Pass {
  constructor({ threshold = 2.6, knee = 1.0, strength = 0.12, radius = 0.6, levels = 6 } = {}) {
    super();
    Object.assign(this, { threshold, knee, strength, radius, levels });
    this.mips = [];
    for (let i = 0; i < levels; i++) {
      this.mips.push(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
    const vs = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    this.down = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, texel: { value: new THREE.Vector2() }, prefilter: { value: 0 },
        threshold: { value: threshold }, knee: { value: knee } },
      vertexShader: vs,
      fragmentShader: /* glsl */`
        uniform sampler2D tIn; uniform vec2 texel; uniform float prefilter, threshold, knee; varying vec2 vUv;
        vec3 S(vec2 o) { return min(texture2D(tIn, vUv + o * texel).rgb, vec3(1000.0)); }
        float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d) {       // a box of four, each weighted down by its brightness
          vec4 w = 1.0 / (1.0 + vec4(luma(a), luma(b), luma(c), luma(d)));
          return (a * w.x + b * w.y + c * w.z + d * w.w) / (w.x + w.y + w.z + w.w);
        }
        vec3 bright(vec3 c) {                               // the threshold with a soft knee
          float br = max(c.r, max(c.g, c.b));
          float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee);
          rq = rq * rq / (4.0 * knee + 1e-4);
          return c * max(rq, br - threshold) / max(br, 1e-4);
        }
        void main() {
          vec3 a = S(vec2(-2.0, 2.0)), b = S(vec2(0.0, 2.0)), c = S(vec2(2.0, 2.0));
          vec3 d = S(vec2(-2.0, 0.0)), e = S(vec2(0.0, 0.0)), f = S(vec2(2.0, 0.0));
          vec3 g = S(vec2(-2.0, -2.0)), h = S(vec2(0.0, -2.0)), i = S(vec2(2.0, -2.0));
          vec3 j = S(vec2(-1.0, 1.0)), k = S(vec2(1.0, 1.0)), l = S(vec2(-1.0, -1.0)), m = S(vec2(1.0, -1.0));
          vec3 o;
          if (prefilter > 0.5) {
            o = karis(j, k, l, m) * 0.5 + karis(a, b, d, e) * 0.125 + karis(b, c, e, f) * 0.125
              + karis(d, e, g, h) * 0.125 + karis(e, f, h, i) * 0.125;
            o = bright(o);
          } else {
            o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
          }
          gl_FragColor = vec4(o, 1.0);
        }`,
    }));
    this.up = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } },
      vertexShader: vs, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
      fragmentShader: /* glsl */`
        uniform sampler2D tIn; uniform vec2 texel; uniform float weight; varying vec2 vUv;
        void main() {
          vec4 d = texel.xyxy * vec4(1.0, 1.0, -1.0, 0.0);
          vec3 s = texture2D(tIn, vUv - d.xy).rgb + texture2D(tIn, vUv - d.wy).rgb * 2.0 + texture2D(tIn, vUv - d.zy).rgb
            + texture2D(tIn, vUv + d.zw).rgb * 2.0 + texture2D(tIn, vUv).rgb * 4.0 + texture2D(tIn, vUv + d.xw).rgb * 2.0
            + texture2D(tIn, vUv + d.zy).rgb + texture2D(tIn, vUv + d.wy).rgb * 2.0 + texture2D(tIn, vUv + d.xy).rgb;
          gl_FragColor = vec4(s * (weight / 16.0), 1.0);
        }`,
    }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tBloom: { value: null }, strength: { value: strength } },
      vertexShader: vs,
      fragmentShader: /* glsl */`uniform sampler2D tColor, tBloom; uniform float strength; varying vec2 vUv;
        void main() { vec4 c = texture2D(tColor, vUv); gl_FragColor = vec4(c.rgb + texture2D(tBloom, vUv).rgb * strength, c.a); }`,
    }));
    this.size = [1, 1];
  }

  setSize(w, h) {
    this.size = [w, h];
    let x = w, y = h;
    for (const m of this.mips) { x = Math.max(1, x >> 1); y = Math.max(1, y >> 1); m.setSize(x, y); }
  }

  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear, d = this.down.material.uniforms, u = this.up.material.uniforms;
    let src = readBuffer.texture, sw = this.size[0], sh = this.size[1];
    d.threshold.value = this.threshold; d.knee.value = this.knee;
    for (let i = 0; i < this.levels; i++) {
      d.tIn.value = src; d.texel.value.set(1 / sw, 1 / sh); d.prefilter.value = i === 0 ? 1 : 0;
      renderer.setRenderTarget(this.mips[i]);
      this.down.render(renderer);
      src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
    }
    renderer.autoClear = false;                       // each level adds onto the one above it
    for (let i = this.levels - 2; i >= 0; i--) {
      const lo = this.mips[i + 1];
      u.tIn.value = lo.texture; u.texel.value.set(1 / lo.width, 1 / lo.height); u.weight.value = this.radius;
      renderer.setRenderTarget(this.mips[i]);
      this.up.render(renderer);
    }
    renderer.autoClear = ac;
    const c = this.comp.material.uniforms;
    c.tColor.value = readBuffer.texture; c.tBloom.value = this.mips[0].texture; c.strength.value = this.strength;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }
}

// The render scale's last step: the frame is drawn at a fraction of the screen's pixels and brought up to it here -
// Catmull-Rom (in five bilinear taps) and a contrast-adaptive sharpen held inside its neighbours' range (no halos).
// (Before, a lower scale just made the canvas smaller and the browser stretched it: soft.) Above 1, a box down.
export class ResamplePass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.sharpen = 0.35;
    this.down = false;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() }, sharpen: { value: 0 }, down: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 texel; uniform float sharpen, down; varying vec2 vUv;
        vec3 catmullRom(vec2 uv) {
          vec2 sp = uv / texel, tc = floor(sp - 0.5) + 0.5, f = sp - tc;
          vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
          vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
          vec2 w12 = w1 + w2, t0 = (tc - 1.0) * texel, t3 = (tc + 2.0) * texel, t12 = (tc + w2 / w12) * texel;
          vec3 c = texture2D(tDiffuse, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y) + texture2D(tDiffuse, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
            + texture2D(tDiffuse, t12).rgb * (w12.x * w12.y) + texture2D(tDiffuse, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
            + texture2D(tDiffuse, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
          return c / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
        }
        void main() {
          if (down > 0.5) {
            vec2 q = 0.25 * fwidth(vUv);                           // quarter of an output pixel
            gl_FragColor = vec4((texture2D(tDiffuse, vUv + vec2(-q.x, -q.y)).rgb + texture2D(tDiffuse, vUv + vec2(q.x, -q.y)).rgb
              + texture2D(tDiffuse, vUv + vec2(-q.x, q.y)).rgb + texture2D(tDiffuse, vUv + vec2(q.x, q.y)).rgb) * 0.25, 1.0);
            return;
          }
          vec3 c = catmullRom(vUv);
          vec3 a = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb, b = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
          vec3 d = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb, e = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
          vec3 mn = min(min(a, b), min(d, e)), mx = max(max(a, b), max(d, e));
          c = clamp(c + (c - (a + b + d + e) * 0.25) * sharpen, min(mn, c), max(mx, c));
          gl_FragColor = vec4(max(c, 0.0), 1.0);
        }`,
    }));
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.quad.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.texel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    u.sharpen.value = this.sharpen;
    u.down.value = this.down ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// A map's own grade, on the scene's light before the view transform: contrast round mid grey (on the luminance: the
// hues kept) and saturation. Under a bright sky everything is lit from all round and reads flat and pale next to
// space's black - this gives it back its punch.
export class GradePass extends Pass {
  constructor() {
    super();
    this.contrast = 1;
    this.saturation = 1;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, contrast: { value: 1 }, saturation: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`uniform sampler2D tDiffuse; uniform float contrast, saturation; varying vec2 vUv;
        void main() {
          vec4 t = texture2D(tDiffuse, vUv);
          vec3 c = max(t.rgb, vec3(0.0));
          float Y = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-6), Yn = 0.18 * pow(Y / 0.18, contrast);
          c *= Yn / Y;
          gl_FragColor = vec4(max(mix(vec3(Yn), c, saturation), vec3(0.0)), t.a);
        }`,
    }));
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.quad.material.uniforms;
    u.tDiffuse.value = readBuffer.texture; u.contrast.value = this.contrast; u.saturation.value = this.saturation;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// Light shafts (the forest moon's air): the bright sky round the sun, streaked toward it - so wherever an island, a
// tree or a roof of vines stands in front of the sun, the light comes through its gaps in shafts. A quarter-size mask
// (bright and near the sun), two radial blurs toward the sun's place on screen (24 taps each, the second finer: ~600
// samples in all), added back warm. Off when the sun is behind the camera.
export class ShaftPass extends Pass {
  constructor() {
    super();
    this.strength = 0.5;
    this.sunUV = new THREE.Vector2(0.5, 0.5);
    this.facing = 0;
    const q = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.a = q(); this.b = q();
    const vs = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
    // ("those lines are still there, from reflections": a glint on the ice, a spark or an engine core - a few pixels -
    // went through the mask whole and the blur drew it out into a thin line toward the sun. The mask now takes the
    // average over each 4 x 4 pixels it stands for, so only broad light - sky through a gap, the sun's glare - casts.)
    this.mask = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, sun: { value: this.sunUV }, aspect: { value: 1 }, texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) } },
      vertexShader: vs,
      fragmentShader: /* glsl */`uniform sampler2D tIn; uniform vec2 sun, texel; uniform float aspect; varying vec2 vUv;
        void main() {
          vec3 c = vec3(0.0);
          for (int k = 0; k < 4; k++) {           // four bilinear taps: the 4 x 4 block's mean
            vec2 o = vec2(k == 0 || k == 2 ? -1.0 : 1.0, k < 2 ? -1.0 : 1.0) * texel;
            c += min(texture2D(tIn, vUv + o).rgb, vec3(12.0));
          }
          c *= 0.25;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec2 d = (vUv - sun) * vec2(aspect, 1.0);
          // (only round the sun itself: the crystals' lit edges and the glare off the ice further out drew lines too)
          float near = exp(-dot(d, d) * 9.0);
          gl_FragColor = vec4(c * smoothstep(0.9, 2.6, l) * near, 1.0);
        }`,
    }));
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, sun: { value: this.sunUV }, len: { value: 1 } }, vertexShader: vs,
      fragmentShader: /* glsl */`uniform sampler2D tIn; uniform vec2 sun; uniform float len; varying vec2 vUv;
        void main() {
          // (each pixel's samples start a random fraction of a step along: what banding is left dissolves into the ray)
          float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          vec2 st = (sun - vUv) * len / 24.0, uv = vUv + st * j;
          vec3 c = vec3(0.0); float w = 1.0, wsum = 0.0;
          for (int i = 0; i < 24; i++) { c += texture2D(tIn, uv).rgb * w; wsum += w; uv += st; w *= 0.95; }
          gl_FragColor = vec4(c / wsum, 1.0);
        }`,
    }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tShaft: { value: null }, strength: { value: 0.5 } }, vertexShader: vs,
      fragmentShader: /* glsl */`uniform sampler2D tColor, tShaft; uniform float strength; varying vec2 vUv;
        void main() { vec4 c = texture2D(tColor, vUv); gl_FragColor = vec4(c.rgb + texture2D(tShaft, vUv).rgb * vec3(1.0, 0.9, 0.72) * strength, c.a); }`,
    }));
  }

  setSize(w, h) {
    for (const t of [this.a, this.b]) t.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.aspect = w / Math.max(1, h);
    this.mask.material.uniforms.texel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
  }

  render(renderer, writeBuffer, readBuffer) {
    const m = this.mask.material.uniforms;
    m.tIn.value = readBuffer.texture; m.aspect.value = this.aspect || 1;
    renderer.setRenderTarget(this.a); this.mask.render(renderer);
    const b = this.blur.material.uniforms;
    b.tIn.value = this.a.texture; b.len.value = 0.9;
    renderer.setRenderTarget(this.b); this.blur.render(renderer);
    b.tIn.value = this.b.texture; b.len.value = 0.9 / 24;
    renderer.setRenderTarget(this.a); this.blur.render(renderer);
    const c = this.comp.material.uniforms;
    c.tColor.value = readBuffer.texture; c.tShaft.value = this.a.texture; c.strength.value = this.strength * this.facing;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.comp.render(renderer);
  }
}

// Water on the lens, after flying through a waterfall. First the sheet: the whole glass under a running film of water
// (the picture behind it bent and blurred, a churn of white the instant it hits), draining down the screen, a bead of
// water along its top edge. Behind it, what stays: drops of every size - never round, each a little fish-eye showing
// the world upside down, out of focus (the lens is focused far away), dark at its steep rim, a glint of the sky on top
// and the light it gathers along its bottom - a mist of droplets between them, and the big ones blown outward over
// the glass by the air (the faster the camera, the faster they run), slowing as they shed water in a trail of
// droplets. They dry off over ~3.5 s, the smallest first. On the finished picture (after the colour transform).
export class LensWaterPass extends Pass {
  constructor() {
    super();
    this.wet = 0;          // 1 the moment the camera goes through, falling back to 0
    this.age = 9;          // since the hit (s)
    this.travel = 0;       // how far the air has pushed the drops (the camera's speed, integrated)
    this.seed = 0;
    this.enabled = false;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) }, wet: { value: 0 },
        age: { value: 9 }, travel: { value: 0 }, seed: { value: 0 }, aspect: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 texel; uniform float wet, age, travel, seed, aspect; varying vec2 vUv;
        float h1(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        vec3 h3(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
        float vn(vec2 p) {
          vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
          return mix(mix(h1(i), h1(i + vec2(1, 0)), u.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) { return 0.5 * vn(p) + 0.3 * vn(p * 2.1 + 7.1) + 0.2 * vn(p * 4.3 - 3.7); }
        // a drop's cap at d from its middle (screen heights): an uneven round (its radius wobbles round it), drawn out
        // by st along ax when it runs (the tail longer than the head); kept if it stands taller than what is there
        // (D: x its height 0..1, yz where in it -1..1 - its slope, w its radius)
        void cap(inout vec4 D, vec2 d, float R, vec3 r, float st, vec2 ax) {
          if (R <= 1e-4) return;
          vec2 pr = vec2(-ax.y, ax.x), l = vec2(dot(d, ax), dot(d, pr));
          l.x /= 1.0 + st * (l.x < 0.0 ? 1.8 : 0.4);
          float a = atan(l.y, l.x);
          float Ra = R * (1.0 + 0.11 * sin(2.0 * a + r.x * 6.283) + 0.07 * sin(3.0 * a + r.y * 6.283) + 0.035 * sin(5.0 * a + r.z * 6.283));
          vec2 n = l / Ra;
          float h = 1.0 - dot(n, n);
          if (h > D.x) D = vec4(h, n.x * ax + n.y * pr, R);
        }
        // the drops that stay put: a few cells in each, each its own size; the small dry first
        void still(inout vec4 D, vec2 q, float cells, float salt, float dens) {
          vec2 p = q * cells;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 c = floor(p) + vec2(float(x), float(y));
            vec3 r = h3(c + salt + seed);
            if (r.z > dens) continue;
            float big = r.x * r.x, th = 0.8 * (1.0 - big) * (0.55 + 0.45 * r.y);
            float R = (0.09 + 0.3 * big) * smoothstep(th, th + 0.15, wet);
            vec2 ctr = c + 0.3 + 0.4 * h3(c * 1.31 + salt).xy;
            cap(D, (p - ctr) / cells, R / cells, h3(c * 2.7 + salt), 0.0, vec2(1.0, 0.0));
          }
        }
        // the runners: big drops the air pushes outward from the middle of the glass, slowing as they shed their water
        // in a line of droplets behind them (trail: how much of that line is here)
        void runners(inout vec4 D, inout float trail, vec2 q) {
          const float N = 24.0, TAU = 6.2831853;
          float k0 = floor(atan(q.y, q.x) / TAU * N);
          for (int k = -1; k <= 1; k++) {
            float kk = mod(k0 + float(k), N);
            vec3 r = h3(vec2(kk, 3.3) + seed), r2 = h3(vec2(kk, 9.1) + seed);
            if (r2.z > 0.62) continue;
            float a = (kk + 0.2 + 0.6 * r.x) / N * TAU;
            vec2 ax = vec2(cos(a), sin(a));
            float r0 = 0.12 + 0.4 * r.y, m = 0.12 + 0.4 * r.z;
            float s = m * (1.0 - exp(-travel * 1.3)), v = m * 1.3 * exp(-travel * 1.3);
            float R = (0.012 + 0.018 * r2.x) * smoothstep(0.0, 0.3, wet);
            cap(D, q - ax * (r0 + s), R, r2, min(v * 4.0, 1.6), ax);
            vec2 dq = q - ax * r0;
            float al = dot(dq, ax), ac = abs(dot(dq, vec2(-ax.y, ax.x)));
            if (al > 0.0 && al < s && ac < R * 0.7) trail = max(trail, (1.0 - ac / (R * 0.7)) * (0.35 + 0.65 * al / max(s, 1e-4)) * smoothstep(0.0, 0.4, wet));
          }
        }
        // the finest droplets (thick along a runner's trail)
        void mist(inout vec4 D, vec2 q, float trail) {
          vec2 p = q * 72.0, c = floor(p);
          vec3 r = h3(c + 5.5 + seed);
          if (r.z > 0.12 * smoothstep(0.25, 0.75, wet) + 0.75 * trail) return;
          cap(D, (p - c - 0.35 - 0.3 * r.xy) / 72.0, (0.16 + 0.16 * r.x) / 72.0, r.yzx, 0.0, vec2(1.0, 0.0));
        }
        // the picture behind the glass at uv, out of focus by r pixels (7 taps)
        vec3 behind(vec2 uv, float r) {
          vec3 c = texture2D(tDiffuse, uv).rgb;
          if (r < 0.35) return c;
          vec2 s = texel * r;
          c += texture2D(tDiffuse, uv + s * vec2(1.0, 0.0)).rgb + texture2D(tDiffuse, uv + s * vec2(-0.5, 0.866)).rgb
             + texture2D(tDiffuse, uv + s * vec2(-0.5, -0.866)).rgb + texture2D(tDiffuse, uv + s * vec2(0.25, 0.433)).rgb
             + texture2D(tDiffuse, uv + s * vec2(0.25, -0.433)).rgb + texture2D(tDiffuse, uv + s * vec2(-0.5, 0.0)).rgb;
          return c / 7.0;
        }
        void main() {
          vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
          vec4 D = vec4(0.0); float trail = 0.0;
          float out_ = smoothstep(0.06, 0.42, length(q));             // fewer over the middle of the picture
          still(D, q, 6.5, 1.3, 0.13 + 0.2 * out_);
          still(D, q, 14.0, 7.7, 0.12 + 0.2 * out_);
          runners(D, trail, q);
          mist(D, q, trail);
          // the sheet: a running film, its top edge draining down the glass (a bead of water along it)
          float film = 0.0; vec2 fn = vec2(0.0);
          if (age < 0.8) {
            float front = 1.12 - age * 1.75 + 0.06 * (vn(vec2(q.x * 7.0, age * 4.0)) - 0.5);
            film = smoothstep(0.0, 0.025, front - vUv.y);
            vec2 f = vec2(q.x * 6.0, q.y * 2.6 + age * 7.0);
            float h0 = fbm(f), e = 0.03;
            fn = vec2(fbm(f + vec2(e, 0.0)) - h0, fbm(f + vec2(0.0, e)) - h0) / e;
            float bead = exp(-pow((vUv.y - front) / 0.012, 2.0));
            fn = fn * film * 0.012 + vec2(0.0, (vUv.y - front) / 0.012 * bead * 0.01);
            film = max(film, bead * 0.8);
          }
          float h = D.x, inD = smoothstep(0.0, 0.14, h), e = length(D.yz);
          // a drop is a little fish-eye: the world from round it, upside down, out of focus
          vec2 off = -D.yz * D.w * 2.8 * inD + fn;
          vec3 col = behind(vUv + off / vec2(aspect, 1.0), 2.4 * inD + 7.0 * film);
          col *= 1.0 - 0.5 * inD * smoothstep(0.62, 1.0, e) * smoothstep(0.002, 0.014, D.w);  // its steep rim: dark (faint on the finest)
          vec3 N = normalize(vec3(D.yz * 1.2, 1.0));
          col += inD * 0.6 * pow(max(dot(N, normalize(vec3(-0.35, 0.75, 0.55))), 0.0), 60.0);           // the sky's glint on it
          col += inD * 0.1 * smoothstep(0.45, 0.88, e) * smoothstep(0.0, 0.7, -D.z) * (1.0 - smoothstep(0.9, 1.0, e)); // the light it gathers
          // the film: a cool wash, its ripples catching the light; the instant it hits, a churn of white
          vec3 Nf = normalize(vec3(fn * 60.0, 1.0));
          col = mix(col, col * vec3(0.93, 0.97, 1.0) + 0.03 + 0.25 * pow(max(dot(Nf, normalize(vec3(-0.3, 0.8, 0.5))), 0.0), 24.0), film);
          if (age < 0.2) {
            float foam = smoothstep(0.42, 0.78, fbm(vec2(q.x * 3.5, q.y * 1.6 + age * 16.0)));
            col = mix(col, vec3(0.88, 0.92, 0.95), (foam * 0.75 + 0.2) * (1.0 - smoothstep(0.03, 0.2, age)));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
  }

  setSize(w, h) { const u = this.quad.material.uniforms; u.aspect.value = w / Math.max(1, h); u.texel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h)); }

  // the camera through a curtain of water
  hit() { this.wet = 1; this.age = 0; this.travel = 0; this.seed = 1 + Math.floor(Math.random() * 97); }

  // speed: the camera's (m/s) - the air on the glass
  update(dt, speed = 0) {
    this.age += dt;
    this.wet = Math.max(0, this.wet - dt / 3.5);
    this.travel += dt * Math.min(1.6, Math.max(0.15, speed / 110));
    this.enabled = this.allowed !== false && this.wet > 0.001;
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.quad.material.uniforms;
    u.tDiffuse.value = readBuffer.texture; u.wet.value = this.wet; u.age.value = this.age; u.travel.value = this.travel; u.seed.value = this.seed;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// The engines' heat: the air behind every nozzle bends what is seen through it, rippling back with the gas - harder
// with more thrust and on boost. Each source is a cone in the world from its nozzle along its flame and on past it,
// widening; a pixel's ray is bent as much as it passes close to a cone's axis, less towards the cone's far end, and the
// bend is capped by how big the cone looks (a far rival's exhaust shimmers a pixel, not ten). Up to 16 sources, the
// nearest (ship.js heatSources).
const HEAT_NOISE = /* glsl */`
float hH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hH(i), hH(i + vec3(1, 0, 0)), f.x), mix(hH(i + vec3(0, 1, 0)), hH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hH(i + vec3(0, 0, 1)), hH(i + vec3(1, 0, 1)), f.x), mix(hH(i + vec3(0, 1, 1)), hH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
export class EngineHeatPass extends Pass {
  constructor(max = 16) {
    super();
    this.needsSwap = true;
    this.camera = null;
    this.max = max;
    this.list = [];
    this.amount = 8;                                   // the bend at its strongest, in pixels at 1080p (each way: half)
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, n: { value: 0 }, amount: { value: this.amount }, focal: { value: 1 },
        hA: { value: Array.from({ length: max }, () => new THREE.Vector4()) }, hB: { value: Array.from({ length: max }, () => new THREE.Vector4()) },
        camPos: { value: new THREE.Vector3() }, invProj: { value: new THREE.Matrix4() }, camRot: { value: new THREE.Matrix4() }, px: { value: new THREE.Vector2(1, 1) } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float time, amount, focal; uniform int n; uniform vec4 hA[${max}], hB[${max}];
        uniform vec3 camPos; uniform mat4 invProj, camRot; uniform vec2 px; varying vec2 vUv;
        ${HEAT_NOISE}
        void main() {
          vec2 uv = vUv;
          if (n > 0) {
            vec4 v = invProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
            vec3 d = normalize((camRot * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
            vec2 off = vec2(0.0);
            for (int i = 0; i < ${max}; i++) {
              if (i >= n) break;
              // the cone: from the nozzle A along the flame (to hB.xyz) and a little past it; ra its radius at the nozzle
              vec3 A = hA[i].xyz, U = hB[i].xyz - A;
              float ra = hA[i].w, k = hB[i].w, Lf = length(U), L = Lf + 2.0 * ra;
              vec3 ud = U / max(Lf, 1e-3), w0 = camPos - A;
              float b = dot(d, ud), dd = dot(d, w0), e = dot(ud, w0);
              float t = clamp((e - b * dd) / max(1.0 - b * b, 1e-4), 0.0, L);     // (where the ray passes closest)
              float s = dot(A + ud * t - camPos, d);
              if (s <= 0.0) continue;
              vec3 P = camPos + d * s;
              float r = ra * (1.3 + 1.7 * t / L), dist = length(P - A - ud * t);
              if (dist >= r) continue;
              float f = smoothstep(0.0, 1.0, 1.0 - dist / r);
              float w = k * f * (1.0 - t / L) * smoothstep(2.0, 6.0, s) * min(1.0, ra * focal / s / 20.0);
              w *= 1.0 - 0.6 * smoothstep(0.75, 0.97, abs(b));        // (down the exhaust from behind: the nozzle stays readable)
              vec3 q = (P - A - ud * time * 5.0) / (ra * 0.7) + vec3(0.0, 0.0, time * 1.6);    // (rippling back with the gas)
              off += vec2(hN(q) - 0.5, hN(q * 1.7 + 11.0) - 0.5) * w;
            }
            uv += clamp(off, -0.6, 0.6) * px * amount * (1.0 / px.y) / 1080.0;   // (several plumes over each other: no more than one's worth)
          }
          gl_FragColor = texture2D(tDiffuse, uv);
        }`,
    }));
  }

  // the sources this frame: each ship's (ship.heatSources), the nearest first
  gather(camera, ships) {
    const list = this.list, cp = camera.getWorldPosition(this._cp || (this._cp = new THREE.Vector3()));
    list.length = 0;
    for (const s of ships) s.heatSources((a, b, r, k) => {
      const d = a.distanceTo(cp);
      if (d < 400) list.push([d, a.x, a.y, a.z, r, b.x, b.y, b.z, k]);
    });
    list.sort((x, y) => x[0] - y[0]);
    const u = this.quad.material.uniforms, n = Math.min(list.length, this.max);
    for (let i = 0; i < n; i++) { const e = list[i]; u.hA.value[i].set(e[1], e[2], e[3], e[4]); u.hB.value[i].set(e[5], e[6], e[7], e[8]); }
    u.n.value = n;
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.quad.material.uniforms, cam = this.camera;
    u.tDiffuse.value = readBuffer.texture;
    u.time.value = performance.now() / 1000;
    u.amount.value = this.amount;
    if (cam) {
      u.invProj.value.copy(cam.projectionMatrixInverse);
      u.camRot.value.extractRotation(cam.matrixWorld);
      u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
      u.focal.value = readBuffer.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    }
    u.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// Shockwaves (fx.js shock): rings of refraction racing out from a slam's blow or a blast - the picture behind pushed
// outward just ahead of the ring and drawn back in just behind it (a pressure front, as air bends light), the colours
// split a little across it (dispersion) and the band faintly brighter. set() projects each from the world every frame:
// its centre on the frame (uv), its radius and the band's half-width (in frame heights), the bend (frame heights), the
// dispersion and the brightening. Not drawn at all with none running (main.js turns it on); allowed: the setting.
export class ShockPass extends Pass {
  constructor(max = 4) {
    super();
    this.needsSwap = true;
    this.max = max;
    this.n = 0;
    this.allowed = true;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, n: { value: 0 }, aspect: { value: 1 },
        S: { value: Array.from({ length: max }, () => new THREE.Vector4()) }, K: { value: Array.from({ length: max }, () => new THREE.Vector4()) } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform int n; uniform float aspect; uniform vec4 S[${max}], K[${max}]; varying vec2 vUv;
        void main() {
          vec2 off = vec2(0.0);
          float disp = 0.0, lift = 0.0;
          for (int i = 0; i < ${max}; i++) {
            if (i >= n) break;
            vec2 d = vUv - S[i].xy;
            d.x *= aspect;
            float r = length(d), x = (r - S[i].z) / S[i].w;
            if (abs(x) >= 1.0 || r < 1e-4) continue;
            float e = 1.0 - abs(x);
            off += vec2(d.x / aspect, d.y) / r * sin(x * 3.14159) * e * K[i].x;
            disp = max(disp, K[i].y * e * e);
            lift += K[i].z * e * e * e;
          }
          vec2 uv = vUv - off;
          vec4 c = texture2D(tDiffuse, uv);
          if (disp > 0.0) {
            c.r = texture2D(tDiffuse, uv - off * disp).r;
            c.b = texture2D(tDiffuse, uv + off * disp).b;
          }
          gl_FragColor = vec4(c.rgb * (1.0 + lift), c.a);
        }`,
    }));
  }

  // this frame's shocks (fx.shocks: { at, t 0..1, size m, k, disp, lift }) as the camera sees them
  set(list, camera) {
    const u = this.quad.material.uniforms, P = (this._p ||= new THREE.Vector3()), V = (this._v ||= new THREE.Vector3());
    let n = 0;
    if (this.allowed && list.length) {
      camera.updateMatrixWorld();
      const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      for (const s of list) {
        if (n >= this.max) break;
        const z = -V.copy(s.at).applyMatrix4(camera.matrixWorldInverse).z;
        if (z < 1.5) continue;
        P.copy(s.at).project(camera);
        const grow = 1 - Math.pow(1 - s.t, 2.4), R = s.size * grow / (z * th) * 0.5;        // (frame heights)
        if (Math.abs(P.x) > 1 + 2 * R * 2 || Math.abs(P.y) > 1 + 2 * R * 2) continue;
        const k = s.k * Math.pow(1 - s.t, 1.4) * Math.min(1, R * 12) * Math.min(1, s.t * 12);
        u.S.value[n].set((P.x + 1) / 2, (P.y + 1) / 2, R, Math.max(0.008, R * 0.3));
        u.K.value[n].set(k, s.disp, s.lift * (1 - s.t), 0);
        n++;
      }
    }
    u.aspect.value = camera.aspect;
    u.n.value = this.n = n;
  }

  render(renderer, writeBuffer, readBuffer) {
    this.quad.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
