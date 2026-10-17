// Seated WebXR: the ship moves the cockpit; only tracking moves the viewer inside it.
// Keep the game's depth slices private, then submit continuous depth to XR's
// compositor. Reuse the buffers for the two eyes, retaining their projections.
import * as THREE from 'three';
import { GAMEPAD, fmt } from './hud.js';
import { xrResolve } from './post.js';
import { compileAll, gpuIdle, quadJob } from './bake.js';

const UP = new THREE.Vector3(0, 1, 0);
const SEAT = new THREE.Vector3(0, 2.25, 3.2); // camera.js canopy position, in metres
const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() || '';
const BLEND_KEYS = ['blending', 'blendSrc', 'blendDst', 'blendEquation', 'blendSrcAlpha', 'blendDstAlpha', 'blendEquationAlpha'];

function stereoCamera() {
  const camera = new THREE.ArrayCamera([new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()]);
  for (const c of [camera, ...camera.cameras]) { c.matrixAutoUpdate = false; c.matrixWorldAutoUpdate = false; }
  return camera;
}

// Changing just the depth terms preserves the asymmetric lens / IPD projection.
function depthProjection(target, source, near, far) {
  target.projectionMatrix.copy(source.projectionMatrix);
  const e = target.projectionMatrix.elements;
  e[10] = -(far + near) / (far - near);
  e[14] = -2 * far * near / (far - near);
  target.projectionMatrixInverse.copy(target.projectionMatrix).invert();
  target.near = near; target.far = far;
}

export class XRControls {
  constructor({ renderer, scene, camera, world, input, menu, hud, audio, settings, canEnter, onEnd }) {
    Object.assign(this, { renderer, scene, camera, world, input, menu, hud, audio, settings, canEnter, onEnd });
    this.pending = false;
    this.preparing = false;
    this.hudVisible = true;
    this.needsCenter = true;
    this.cockpit = new THREE.Group();
    this.origin = new THREE.Group();
    this.view = new THREE.PerspectiveCamera(60, 1, camera.near, camera.far);
    this.cockpit.add(this.origin); this.origin.add(this.view); scene.add(this.cockpit);
    this.skyView = stereoCamera(); this.farView = stereoCamera(); this.nearView = stereoCamera();
    this.loadingView = stereoCamera();
    this.resolve = xrResolve();
    this.bufferSize = new THREE.Vector2();
    this.renderSize = new THREE.Vector2();
    this.renderScale = 1;
    this.drawRanges = new WeakMap();
    this.rangeSphere = new THREE.Sphere(); this.rangeMatrix = new THREE.Matrix4();
    const xr = this;
    this.culledDraw = function (camera, scene, geometry, material, object, group) {
      return xr.drawTrackRange(this, camera, scene, geometry, material, object, group);
    };
    this.clearColor = new THREE.Color();
    this.viewport = new THREE.Vector4();
    this.scissor = new THREE.Vector4();
    this.additive = [];
    this.blendStates = new WeakMap();
    this.coverageVisitor = o => {
      if (Array.isArray(o.material)) { for (const m of o.material) this.coverMaterial(m); }
      else if (o.material) this.coverMaterial(o.material);
    };
    this.position = new THREE.Vector3(); this.orientation = new THREE.Quaternion();
    this.forward = new THREE.Vector3(); this.ray = new THREE.Raycaster(); this.rayMatrix = new THREE.Matrix4();
    this.panelCanvas = document.createElement('canvas');
    this.panelCanvas.width = 1024; this.panelCanvas.height = 640;
    this.ctx = this.panelCanvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.panelCanvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9375),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, toneMapped: false }));
    this.panel.renderOrder = 10000;
    this.panel.visible = false;
    this.view.add(this.panel);
    this.loadingScene = new THREE.Scene();
    this.loadingScene.background = new THREE.Color(0x050c16);
    this.loadingPanel = new THREE.Mesh(this.panel.geometry, this.panel.material);
    this.loadingPanel.matrixAutoUpdate = false;
    this.loadingScene.add(this.loadingPanel);
    this.hits = [];
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local'); // seated, with no floor / standing-height dependency
    renderer.xr.setFoveation(1); // compositor request only; our private HDR scene buffers have uniform pixel density
    renderer.xr.addEventListener('sessionend', () => this.ended());

    this.toolbar = document.createElement('div');
    this.toolbar.id = 'xr-controls';
    this.toolbar.innerHTML = '<button type="button" disabled>Checking VR…</button><span role="status" aria-live="polite"></span>';
    document.body.append(this.toolbar);
    this.button = this.toolbar.querySelector('button');
    this.status = this.toolbar.querySelector('span');
    this.button.addEventListener('click', () => this.enter());
    addEventListener('keydown', (event) => {
      if (this.active && event.code === 'Escape' && !event.repeat) this.menu.pause();
    });
    navigator.xr?.addEventListener('devicechange', () => this.checkSupport());
    this.checkSupport();
  }

  get active() { return this.renderer.xr.isPresenting; }

  async checkSupport() {
    if (this.active || this.pending) return;
    let supported = false;
    try { supported = !!(isSecureContext && await navigator.xr?.isSessionSupported('immersive-vr')); }
    catch { /* a denied permissions policy is also unavailable */ }
    if (this.active || this.pending) return;
    this.button.disabled = !supported;
    this.button.textContent = supported ? 'Enter VR' : 'VR unavailable';
    this.status.textContent = supported ? 'Seated cockpit · Xbox controller' :
      !isSecureContext ? 'VR needs HTTPS or localhost.' : 'Use a WebXR headset browser to enter VR.';
  }

  // No await before requestSession: Safari requires the button's user activation.
  async enter() {
    if (this.pending) return;
    if (this.active) { await this.exit(); return; }
    if (!this.canEnter()) { this.status.textContent = 'Graphics are preparing. Try Enter VR again in a moment.'; return; }
    this.pending = true; this.button.disabled = true;
    let session;
    try {
      const request = navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      this.audio.start();
      session = await request;
      session.addEventListener('visibilitychange', () => {
        if (session.visibilityState !== 'visible') this.menu.pause();
      });
      session.addEventListener('select', (event) => this.select(event));
      this.preparing = true; this.preparePhase = 'compile'; this.prepareTask = null;
      this.loadingFrames = 0;
      this.prepareProgress = 0; this.prepareMessage = 'Preparing cockpit graphics…';
      this.prepareStarted = performance.now(); this.panelTime = 0;
      await this.renderer.xr.setSession(session);
      this.renderer.xr.getReferenceSpace().addEventListener('reset', () => this.recenter());
      this.input.unlock(); this.input.keys.clear(); this.input.pressed.clear();
      this.input.xr = true;
      this.needsCenter = true;
      this.panel.visible = true;
      this.toolbar.classList.add('presenting');
      this.button.textContent = 'Exit VR'; this.status.textContent = this.prepareMessage;
      document.body.classList.add('in-xr');
    } catch (error) {
      this.preparing = false;
      if (session) await session.end().catch(() => {});
      this.status.textContent = `Could not enter VR: ${error.message || error}. Try Enter VR again.`;
      this.button.textContent = 'Enter VR';
    } finally {
      this.pending = false; this.button.disabled = false;
    }
  }

  async exit() {
    try { await this.renderer.xr.getSession()?.end(); }
    catch (error) { this.status.textContent = `Could not exit VR: ${error.message || error}`; }
  }

  ended() {
    this.preparing = false; this.prepareTask = null; this.preparePhase = null;
    this.input.xr = false;
    this.panel.visible = false;
    this.farBuffer?.dispose(); this.nearBuffer?.dispose();
    this.farBuffer = this.nearBuffer = null; this.bufferSize.set(0, 0); this.renderSize.set(0, 0);
    this.menu.pause();
    this.input.keys.clear(); this.input.pressed.clear(); this.input.stick.x = this.input.stick.y = 0;
    this.toolbar.classList.remove('presenting'); document.body.classList.remove('in-xr');
    this.button.textContent = 'Enter VR'; this.button.disabled = false;
    this.onEnd();
  }

  recenter() { this.needsCenter = true; }

  toggleHUD() { this.hudVisible = !this.hudVisible; this.panelTime = 0; }

  currentSession(session) { return this.active && this.renderer.xr.getSession() === session; }

  preparationFailed(error, session) {
    if (!this.currentSession(session)) return;
    this.preparePhase = 'error'; this.panelTime = 0;
    this.prepareMessage = 'Could not prepare VR graphics. Exit VR and try again.';
    this.status.textContent = `${this.prepareMessage} ${error.message || error}`;
    console.error('XR preparation failed', error);
  }

  async prepareGraphics(session) {
    await this.prepareTrackRanges(session);
    if (!this.currentSession(session)) return;
    const r = this.renderer, target = r.getRenderTarget(), enabled = r.xr.enabled;
    const eyes = r.xr.getCamera().cameras;
    let compiled;
    // Queue the actual HDR scene and native-output variants. Restore framebuffer
    // state before yielding: tracked loading frames keep drawing during compile.
    try {
      r.xr.enabled = false;
      this.buffers(Math.max(...eyes.map(e => e.viewport.z)), Math.max(...eyes.map(e => e.viewport.w)));
      r.initRenderTarget(this.nearBuffer); r.initRenderTarget(this.farBuffer);
      r.setRenderTarget(this.nearBuffer);
      const jobs = [[this.scene, this.slice(this.nearView, this.camera.near, 500, 1 << 3)],
        [this.scene, this.slice(this.farView, 500, this.camera.far, 1 << 4)]];
      if (this.world.sky) jobs.push([this.world.sky, this.slice(this.skyView, 50, 200000, 0, true)]);
      const sceneBuilt = compileAll(r, jobs, (k, n) => {
        if (!this.currentSession(session)) return;
        this.prepareProgress = n ? k / n : 1;
        this.prepareMessage = `Preparing cockpit graphics  ${k} / ${n}`;
        this.status.textContent = this.prepareMessage;
      });
      r.setRenderTarget(target);
      compiled = Promise.all([sceneBuilt, compileAll(r, [quadJob(this.resolve)])]);
    } finally {
      r.setRenderTarget(target); r.xr.enabled = enabled;
    }
    await compiled;
    if (!this.currentSession(session)) return;
    this.preparePhase = 'draw'; this.prepareProgress = 1;
    this.prepareMessage = 'Preparing the first cockpit view…'; this.panelTime = 0;
  }

  async finishPreparation(session) {
    if (!this.currentSession(session)) return;
    if (!await gpuIdle(this.renderer)) throw new Error('GPU setup did not complete.');
    if (!this.currentSession(session)) return;
    this.preparationStats = { ms: Math.round(performance.now() - this.prepareStarted),
      programs: this.renderer.info.programs.length, textures: this.renderer.info.memory.textures };
    console.info('XR preparation complete', this.preparationStats);
    this.preparing = false; this.preparePhase = null; this.panelTime = 0;
    this.status.textContent = 'Y: HUD · B / right-stick click / U: recenter';
  }

  buildTrackRanges(geometry) {
    if (this.drawRanges.has(geometry)) return;
    const index = geometry.index, position = geometry.attributes.position;
    if (!index || !position) return;
    const ranges = [], box = new THREE.Box3(), point = new THREE.Vector3();
    // Sweep indices run along the circuit. Consecutive triangle blocks give
    // tight bounds while retaining the original vertex/index buffers and detail.
    const block = geometry.userData.xrChunkIndices || 3072;
    for (let start = 0; start < index.count; start += block) {
      const end = Math.min(start + block, index.count);
      box.makeEmpty();
      for (let i = start; i < end; i++) box.expandByPoint(point.fromBufferAttribute(position, index.getX(i)));
      ranges.push({ start, end, sphere: box.getBoundingSphere(new THREE.Sphere()) });
    }
    this.drawRanges.set(geometry, ranges);
  }

  async prepareTrackRanges(session) {
    const geometries = new Set();
    this.scene.traverse(o => { if (o.geometry?.userData.xrChunkIndices) geometries.add(o.geometry); });
    for (const geometry of geometries) {
      if (!this.currentSession(session)) return;
      if (this.drawRanges.has(geometry)) continue;
      this.prepareMessage = 'Preparing the circuit…'; this.panelTime = 0;
      this.buildTrackRanges(geometry);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  drawTrackRange(renderer, camera, scene, geometry, material, object, group) {
    const ranges = this.drawRanges.get(geometry), frustum = camera.userData.xrFrustum;
    const draw = this.directDraw;
    if (!ranges || !frustum || object.isInstancedMesh) return draw.call(renderer, camera, scene, geometry, material, object, group);
    const first = geometry.drawRange.start, count = geometry.drawRange.count, last = first + count;
    let start = -1, end = 0;
    const flush = () => {
      if (start < 0) return;
      geometry.setDrawRange(start, end - start);
      draw.call(renderer, camera, scene, geometry, material, object, group);
      start = -1;
    };
    try {
      for (const range of ranges) {
        const a = Math.max(first, range.start), b = Math.min(last, range.end);
        if (a >= b) continue;
        if (!frustum.intersectsSphere(this.rangeSphere.copy(range.sphere).applyMatrix4(object.matrixWorld))) { flush(); continue; }
        if (start < 0) start = a;
        end = b;
      }
      flush();
    } finally { geometry.setDrawRange(first, count); }
  }

  renderLoading() {
    this.drawPanel(); this.renderPanel(true);
  }

  renderPanel(clear = false) {
    const r = this.renderer, enabled = r.xr.enabled, autoClear = r.autoClear;
    const background = this.loadingScene.background;
    this.view.updateMatrixWorld(true);
    this.loadingPanel.matrix.copy(this.panel.matrixWorld);
    const state = r.xr.getSession()?.renderState;
    try {
      r.xr.enabled = false; r.autoClear = clear;
      if (!clear) this.loadingScene.background = null;
      r.render(this.loadingScene, this.slice(this.loadingView,
        state?.depthNear ?? this.camera.near, state?.depthFar ?? this.camera.far));
    } finally { this.loadingScene.background = background; r.xr.enabled = enabled; r.autoClear = autoClear; }
  }

  update(flight, frame) {
    const pose = frame?.getViewerPose(this.renderer.xr.getReferenceSpace());
    if (!pose) return;
    const { position: p, orientation: q } = pose.transform;
    if (this.needsCenter) {
      this.orientation.set(q.x, q.y, q.z, q.w);
      this.forward.set(0, 0, -1).applyQuaternion(this.orientation);
      const yaw = Math.atan2(-this.forward.x, -this.forward.z);
      this.origin.quaternion.setFromAxisAngle(UP, -yaw);
      this.origin.position.set(-p.x, -p.y, -p.z).applyQuaternion(this.origin.quaternion);
      this.needsCenter = false;
    }
    this.cockpit.quaternion.copy(flight.camQ || flight.q);
    this.cockpit.position.copy(SEAT).applyQuaternion(this.cockpit.quaternion).add(flight.pos);
    this.cockpit.updateMatrixWorld(true);
    this.view.layers.mask = this.camera.layers.mask;
    this.renderer.xr.updateCamera(this.view);
    // Existing world culling, lighting and audio consume a camera in world space.
    const tracked = this.renderer.xr.getCamera();
    this.camera.position.setFromMatrixPosition(tracked.matrixWorld);
    this.camera.quaternion.setFromRotationMatrix(tracked.matrixWorld);
    this.camera.projectionMatrix.copy(tracked.projectionMatrix);
    this.camera.projectionMatrixInverse.copy(tracked.projectionMatrixInverse);
    this.camera.updateMatrixWorld(true);
  }

  slice(target, near, far, skip = 0, sky = false, index = null) {
    const tracked = this.renderer.xr.getCamera();
    const sources = index === null ? tracked.cameras : [tracked.cameras[index]];
    const base = index === null ? tracked : sources[0];
    // The runtime can expose one or two views. Never invent a second eye.
    while (target.cameras.length < sources.length) {
      const c = new THREE.PerspectiveCamera(); c.matrixAutoUpdate = c.matrixWorldAutoUpdate = false;
      target.cameras.push(c);
    }
    target.cameras.length = sources.length;
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i], eye = target.cameras[i];
      depthProjection(eye, source, near, far);
      eye.matrixWorld.copy(source.matrixWorld);
      if (sky) eye.matrixWorld.setPosition(0, 0, 0);
      eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
      if (index !== null) {
        (eye.userData.xrFrustum ||= new THREE.Frustum()).setFromProjectionMatrix(
          this.rangeMatrix.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse));
      }
      (eye.viewport ||= new THREE.Vector4()).copy(source.viewport);
      if (index !== null) eye.viewport.set(0, 0, this.renderSize.x || this.bufferSize.x, this.renderSize.y || this.bufferSize.y);
      eye.layers.mask = sky ? 1 : this.camera.layers.mask & ~skip;
    }
    depthProjection(target, base, near, far);
    target.matrixWorld.copy(base.matrixWorld);
    if (sky) target.matrixWorld.setPosition(0, 0, 0);
    target.matrixWorldInverse.copy(target.matrixWorld).invert();
    target.layers.mask = sky ? 1 : this.camera.layers.mask & ~skip;
    return target;
  }

  buffers(width, height) {
    if (this.bufferSize.x === width && this.bufferSize.y === height) return;
    this.farBuffer?.dispose(); this.nearBuffer?.dispose();
    const make = () => new THREE.WebGLRenderTarget(width, height, {
      // Forced 4x MSAA on both HDR/depth slices costs four extra full-eye
      // resolves per frame. Keep single-sample buffers and precise depth in VR.
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType),
      resolveDepthBuffer: true,
    });
    this.farBuffer = make(); this.nearBuffer = make();
    this.bufferSize.set(width, height);
    const u = this.resolve.material.uniforms;
    u.farColor.value = this.farBuffer.texture; u.nearColor.value = this.nearBuffer.texture;
    u.farDepth.value = this.farBuffer.depthTexture; u.nearDepth.value = this.nearBuffer.depthTexture;
    u.sourceTexel.value.set(1 / width, 1 / height);
  }

  additiveCoverage(root) {
    // A glow adds light, not coverage. Keeping its alpha unchanged prevents
    // near sparks from dimming the far scene when the slices are combined.
    root?.traverse(this.coverageVisitor);
  }

  coverMaterial(m) {
    if (m.blending !== THREE.AdditiveBlending) return;
    let entry = this.blendStates.get(m);
    if (!entry) { entry = [m, {}]; this.blendStates.set(m, entry); }
    for (const key of BLEND_KEYS) entry[1][key] = m[key];
    this.additive.push(entry);
    m.blending = THREE.CustomBlending;
    m.blendSrc = m.premultipliedAlpha ? THREE.OneFactor : THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation;
    m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; m.blendEquationAlpha = THREE.AddEquation;
  }

  raceScale() {
    if (this.preparing || this.menu.open || this.menu.busy) return 1;
    const scale = this.settings?.v.xrScale;
    return [0.65, 0.8, 1].includes(scale) ? scale : this.settings ? 0.8 : 1;
  }

  render() {
    if (this.preparing) {
      const session = this.renderer.xr.getSession();
      let drawn = false;
      if (this.preparePhase === 'draw') {
        // Warm the real stereo path inside an XR frame, then cover it before
        // submission. The headset only receives the tracked loading scene.
        this.preparePhase = 'gpu'; this.prepareMessage = 'Finishing cockpit setup…'; this.panelTime = 0;
        try { this.renderWorld(); drawn = true; }
        catch (error) { this.preparationFailed(error, session); }
      }
      this.renderLoading();
      if (drawn) this.finishPreparation(session).catch(error => this.preparationFailed(error, session));
      // Submit a loading frame before queuing any expensive shader work.
      else if (this.loadingFrames > 0 && !this.prepareTask && !this.needsCenter && this.preparePhase === 'compile') {
        this.prepareTask = this.prepareGraphics(session).catch(error => this.preparationFailed(error, session));
      }
      this.loadingFrames++;
      return;
    }
    this.renderWorld();
  }

  renderWorld() {
    const r = this.renderer;
    if (!r.xr.getCamera().cameras.length) return;
    this.drawPanel();
    const showPanel = this.panel.visible;
    this.view.updateMatrixWorld(true);
    this.scene.updateMatrixWorld();
    const autoClear = r.autoClear, shadows = r.shadowMap.autoUpdate;
    const nativeTarget = r.getRenderTarget(), clearAlpha = r.getClearAlpha(), scissorTest = r.getScissorTest();
    this.directDraw = r.renderBufferDirect; r.renderBufferDirect = this.culledDraw;
    r.getClearColor(this.clearColor); r.getViewport(this.viewport); r.getScissor(this.scissor);
    const sea = this.world.ocean?.U?.seReflOn, reflection = sea?.value;
    // Explicit cameras keep their native eye projections. Only the final resolve
    // writes the XR framebuffer, using the session's one continuous depth range.
    r.xr.enabled = false; r.autoClear = false; r.shadowMap.autoUpdate = false;
    r.setScissorTest(false);
    if (sea) sea.value = 0; // the sea's analytic sky remains; its mono planar mirror cannot be used in stereo
    try {
      this.additiveCoverage(this.scene); this.additiveCoverage(this.world.sky);
      r.clear(true, true, true);
      const eyes = r.xr.getCamera().cameras;
      const u = this.resolve.material.uniforms;
      u.near.value = this.camera.near; u.far.value = this.camera.far;
      const state = r.xr.getSession()?.renderState;
      u.nativeNear.value = state?.depthNear ?? this.camera.near;
      u.nativeFar.value = state?.depthFar ?? this.camera.far;
      this.buffers(Math.max(...eyes.map(e => e.viewport.z)), Math.max(...eyes.map(e => e.viewport.w)));
      this.renderScale = this.raceScale();
      this.renderSize.set(Math.max(1, Math.floor(this.bufferSize.x * this.renderScale)), Math.max(1, Math.floor(this.bufferSize.y * this.renderScale)));
      u.sourceScale.value.copy(this.renderSize).divide(this.bufferSize);
      // Keep allocation stable across race / pause transitions. Only shade and
      // clear the active area; the resolve samples that region into each eye.
      for (const target of [this.farBuffer, this.nearBuffer]) {
        target.viewport.set(0, 0, this.renderSize.x, this.renderSize.y);
        target.scissor.copy(target.viewport); target.scissorTest = true;
      }
      this.panel.visible = false;
      for (let i = 0; i < eyes.length; i++) {
        const v = eyes[i].viewport;
        r.setRenderTarget(this.farBuffer); r.setClearColor(0x000000, 1); r.clear(true, true, true);
        if (this.world.sky) r.render(this.world.sky, this.slice(this.skyView, 50, 200000, 0, true, i));
        r.clearDepth();
        r.shadowMap.needsUpdate = i === 0;
        r.render(this.scene, this.slice(this.farView, 500, this.camera.far, 1 << 4, false, i));
        r.setRenderTarget(this.nearBuffer); r.setClearColor(0x000000, 0); r.clear(true, true, true);
        r.render(this.scene, this.slice(this.nearView, this.camera.near, 500, 1 << 3, false, i));
        r.setRenderTarget(nativeTarget); r.setViewport(v); r.setScissorTest(false);
        this.resolve.render(r);
      }
      // Instruments and menus stay at native resolution above the scaled world.
      if (showPanel) this.renderPanel();
    } finally {
      r.renderBufferDirect = this.directDraw;
      for (const [material, saved] of this.additive) Object.assign(material, saved);
      this.additive.length = 0;
      this.panel.visible = showPanel;
      r.setRenderTarget(nativeTarget); r.setViewport(this.viewport); r.setScissor(this.scissor); r.setScissorTest(scissorTest);
      r.setClearColor(this.clearColor, clearAlpha);
      r.xr.enabled = true; r.autoClear = autoClear; r.shadowMap.autoUpdate = shadows;
      if (sea) sea.value = reflection;
    }
  }

  drawPanel() {
    const menu = this.menu, open = this.preparing || menu.open || menu.busy;
    const visible = !!(this.hudVisible || open), changed = this.panel.visible !== visible || this.panelOpen !== open || this.panelPreparing !== this.preparing;
    this.panel.visible = visible;
    // Hidden instruments incur no canvas redraw, texture upload or eye draw.
    // Pause / title menus remain available regardless of the HUD preference.
    if (!visible) { this.hits = []; return; }
    // 10 Hz is enough for legible instruments; head tracking remains at headset rate.
    const now = performance.now();
    if (!changed && now - (this.panelTime || 0) < 100) return;
    this.panelTime = now;
    this.panelOpen = open;
    this.panelPreparing = this.preparing;
    const g = this.ctx, state = this.hud.state || {};
    this.panel.position.set(0, open ? 0 : -0.42, open ? -1.6 : -1.35);
    this.panel.scale.setScalar(open ? 1 : 0.68);
    g.clearRect(0, 0, 1024, 640);
    g.fillStyle = 'rgba(5,12,22,0.94)'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#5cd7ff'; g.lineWidth = 3; g.strokeRect(2, 2, 1020, 636);
    g.fillStyle = '#eef8ff'; g.font = 'bold 32px system-ui';
    this.hits = [];
    const label = (s, y, color = '#eef8ff', size = 26) => {
      g.fillStyle = color; g.font = `${size}px system-ui`; g.fillText(s, 32, y, 960);
    };
    if (this.preparing) {
      label('Preparing VR', 100, '#5cd7ff', 48);
      label(this.prepareMessage, 220, '#eef8ff', 30);
      if (this.preparePhase !== 'error') {
        const step = this.preparePhase === 'compile' ? 1 : this.preparePhase === 'draw' ? 2 : 3;
        label(`Step ${step} of 3`, 300);
        g.fillStyle = '#173347'; g.fillRect(32, 350, 960, 16);
        g.fillStyle = '#5cd7ff'; g.fillRect(32, 350, 960 * ((step - 1 + (step === 1 ? this.prepareProgress : 0)) / 3), 16);
        label('The game will continue when the cockpit is ready.', 440);
      }
    } else if (open) {
      const section = menu.el.querySelector(`.m-screen[data-s="${menu.screen}"]`);
      label(text(section?.querySelector('h2')) || (menu.busy ? 'Loading…' : 'Need4Space'), 48, '#5cd7ff', 32);
      const items = menu.items(), selected = menu.sel[menu.screen] || 0;
      const first = Math.max(0, Math.min(selected - 3, items.length - 6));
      if (items.length) items.slice(first, first + 6).forEach((item, offset) => {
        const i = first + offset, y = 90 + offset * 48;
        if (i === selected) { g.fillStyle = '#153b50'; g.fillRect(20, y - 29, 984, 44); }
        const name = item.querySelector('.m-name');
        const title = name ? [text(name), text(item.querySelector('.m-meta'))].filter(Boolean).join(' · ') : text(item);
        label((i === selected ? '› ' : '  ') + title, y, i === selected ? '#5cd7ff' : '#eef8ff');
        this.hits.push({ x: 20, y: y - 29, w: 984, h: 44, run: () => { menu.sel[menu.screen] = i; menu.refresh(); menu.ok(); } });
      });
      else if (menu.screen === 'settings') {
        const row = menu.h.settings.el.querySelector('.srow.focus');
        label(text(row?.querySelector('span')?.firstChild), 150, '#5cd7ff', 34);
        label(text(row?.querySelector('button.on')), 210, '#eef8ff', 34);
        const help = text(row?.querySelector('.s-help'));
        if (help) this.wrap(help, 270, 36);
        label('Up / Down: option     Left / Right: change', help ? 360 : 290);
      } else if (menu.screen === 'diff') {
        const slot = section?.querySelectorAll('.d-slot')[menu.diffI];
        label(text(slot) || 'Choose difficulty with Left / Right', 150, '#5cd7ff', 30);
        label('Left / Right: difficulty     A / Select: confirm', 260);
      } else if (menu.screen === 'controls') {
        this.wrap(GAMEPAD, 110, 46);
      } else {
        this.wrap(text(section), 100, 42);
      }
      this.panelButton('↑', 32, 432, 100, () => menu.nav(-1));
      this.panelButton('↓', 144, 432, 100, () => menu.nav(1));
      this.panelButton('←', 256, 432, 100, () => menu.nav(-2));
      this.panelButton('→', 368, 432, 100, () => menu.nav(2));
      this.panelButton('Select', 480, 432, 220, () => menu.ok());
      this.panelButton('Back', 712, 432, 280, () => menu.back());
    } else {
      label(`${Math.round((state.speed || 0) * 3.6)} km/h`, 72, '#5cd7ff', 56);
      const race = state.race;
      label(race ? `Position ${race.pos} / ${race.total}     Lap ${race.lap} / ${race.laps}` : 'Free flight', 130);
      label(`${state.state || 'Ready'}     Thrust ${Math.round((state.throttle || 0) * 100)}%`, 183, '#5cd7ff');
      label(`Hull ${Math.round((state.health ?? 1) * 100)}%     Boost ${Math.round((state.boostEnergy || 0) * 100)}%`, 236);
      label(`Time ${fmt(race?.time ?? state.lapTime)}     Airbrake ${Math.round((state.airCharge ?? 1) * 100)}%`, 286);
      if (state.atkHint) label(`${state.atkHint < 0 ? '←' : '→'}  X: slam / block`, 336, '#ffbd61', 32);
      if (race?.state === 'countdown') label(String(Math.max(1, Math.ceil(race.count))), 405, '#ffbd61', 48);
      else label(this.hud.msgT > 0 ? text(document.getElementById('msg')) : 'Left stick / RT thrust · A boost · Y HUD', 405);
      this.panelButton('Pause', 32, 432, 300, () => menu.pause());
    }
    if (!this.preparing) this.panelButton('Recenter', 32, 544, 460, () => this.recenter());
    this.panelButton('Exit VR', 512, 544, 480, () => this.exit());
    this.texture.needsUpdate = true;
  }

  wrap(value, y, lineHeight) {
    const g = this.ctx; g.fillStyle = '#eef8ff'; g.font = '26px system-ui';
    let line = '';
    for (const word of value.split(/\s+/)) {
      if (g.measureText(line + word).width > 950) {
        g.fillText(line, 32, y); y += lineHeight; line = '';
        if (y > 390) return;
      }
      line += word + ' ';
    }
    if (y <= 390) g.fillText(line, 32, y);
  }

  panelButton(label, x, y, w, run) {
    const g = this.ctx;
    g.fillStyle = '#173347'; g.fillRect(x, y, w, 64);
    g.fillStyle = '#eaf7ff'; g.font = '28px system-ui'; g.fillText(label, x + 18, y + 42, w - 36);
    this.hits.push({ x, y, w, h: 64, run });
  }

  select(event) {
    if (!this.active || !this.panel.visible || this.menu.busy) return;
    const pose = event.frame.getPose(event.inputSource.targetRaySpace, this.renderer.xr.getReferenceSpace());
    if (!pose) return;
    this.rayMatrix.fromArray(pose.transform.matrix).premultiply(this.origin.matrixWorld);
    this.ray.ray.origin.setFromMatrixPosition(this.rayMatrix);
    this.ray.ray.direction.set(0, 0, -1).transformDirection(this.rayMatrix);
    const hit = this.ray.intersectObject(this.panel, false)[0];
    if (!hit) return;
    const x = hit.uv.x * 1024, y = (1 - hit.uv.y) * 640;
    const button = this.hits.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (button) { this.audio.start(); button.run(); this.panelTime = 0; }
  }
}
