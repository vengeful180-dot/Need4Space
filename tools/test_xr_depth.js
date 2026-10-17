// Playwright browser_run_code harness; requires the local server on port 8765.
// Uses actual WebGL draws and reads depth pixels, without loading the race assets.
(async function testXRDepth(page) {
  const base = 'http://127.0.0.1:8765';
  const html = await (await page.request.get(base + '/')).text();
  const imports = html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
  await page.route(base + '/__xr-depth-test', route => route.fulfill({ contentType: 'text/html',
    body: `<!doctype html><title>XR depth checks</title>${imports}<canvas id="view"></canvas>` }));
  await page.goto(base + '/__xr-depth-test');
  return await page.evaluate(async () => {
    const T = await import('three');
    const { XRControls } = await import('/src/xr.js');
    const { FullScreenQuad } = await import('three/addons/postprocessing/Pass.js');
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const results = [], renderer = new T.WebGLRenderer({ canvas: document.querySelector('#view') });
    const gl = renderer.getContext(), blit = gl.blitFramebuffer;
    let blits = 0;
    gl.blitFramebuffer = function (...args) { blits++; return blit.apply(this, args); };
    renderer.setSize(256, 128);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 1, 0.2, 30000);
    scene.matrixWorldAutoUpdate = false;
    const eyes = [-0.032, 0.032].map((x, i) => {
      const c = camera.clone(); c.position.x = x; c.updateMatrixWorld();
      c.viewport = new T.Vector4(i * 128, 0, 128, 128); return c;
    });
    const tracked = new T.ArrayCamera(eyes);
    tracked.projectionMatrix.copy(camera.projectionMatrix); tracked.updateMatrixWorld();
    // Only the runtime poses are fixtures; rasterization and depth resolve are real.
    const originalCamera = renderer.xr.getCamera, originalSession = renderer.xr.getSession;
    renderer.xr.getCamera = () => tracked;
    const xr = new XRControls({ renderer, scene, camera, world: {}, input: {}, menu: {}, hud: {}, audio: {},
      canEnter: () => true, onEnd: () => {} });
    xr.drawPanel = () => {};
    const near = new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshBasicMaterial({ color: 0xff0000 }));
    near.position.z = -100;
    const far = new T.Mesh(new T.PlaneGeometry(1000, 1000), new T.MeshBasicMaterial({ color: 0x00ff00 }));
    far.position.z = -600;
    scene.add(near, far);
    const target = new T.WebGLRenderTarget(256, 128, { depthTexture: new T.DepthTexture(256, 128, T.FloatType) });
    const sample = new T.WebGLRenderTarget(256, 128, { type: T.FloatType, depthBuffer: false });
    const quad = new FullScreenQuad(new T.ShaderMaterial({ uniforms: { depth: { value: target.depthTexture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: 'varying vec2 vUv; uniform sampler2D depth; void main() { float d = texture2D(depth, vUv).r; gl_FragColor = vec4(d,d,d,1.); }',
      depthTest: false, depthWrite: false }));
    const render = () => { scene.updateMatrixWorld(true); renderer.setRenderTarget(target); xr.render(); };
    const color = (x) => { const p = new Uint8Array(4); renderer.readRenderTargetPixels(target, x, 64, 1, 1, p); return [...p]; };
    const distances = (n = 0.2, f = 30000, pixels = [64, 10, 192, 138], y = 64) => {
      renderer.xr.enabled = false; renderer.setRenderTarget(sample); quad.render(renderer);
      const values = pixels.map(x => {
        const p = new Float32Array(4); renderer.readRenderTargetPixels(sample, x, y, 1, 1, p);
        return n * f / (f - (f - n) * p[0]);
      });
      renderer.xr.enabled = true; return values;
    };
    const close = (actual, expected) => Math.abs(actual - expected) < 0.25;
    try {
      render();
      check(color(64)[0] === 255 && color(192)[0] === 255 && color(10)[1] === 255 && color(138)[1] === 255,
        'Near / far colors or eye viewports overlap');
      results.push('independent near/far colors in both eye viewports');
      const corrected = distances();
      check(corrected.every((d, i) => close(d, i % 2 ? 600 : 100)), `Wrong native depth: ${corrected}`);
      results.push('100 m and 600 m surfaces submit matching native depths');

      // Reproduce the old defect to ensure this test detects it: near depth was
      // interpreted as ~124 m, and clearing near depth erased the 600 m surface.
      renderer.xr.enabled = false; renderer.autoClear = false; renderer.setRenderTarget(target);
      renderer.clear(true, true, true);
      renderer.render(scene, xr.slice(xr.farView, 500, 30000, 1 << 4)); renderer.clearDepth();
      renderer.render(scene, xr.slice(xr.nearView, 0.2, 500, 1 << 3));
      const previous = distances();
      check(previous[0] > 120 && previous[1] > 29000, 'Regression fixture did not expose the old depth defect');
      results.push('regression fixture rejects the original XR depth output');

      for (const z of [495, 499, 501, 505]) {
        near.position.z = -z; render();
        check(close(distances()[0], z), `Depth jumps at the slice boundary: ${z}`);
      }
      results.push('continuous depth when geometry crosses the 500 m split');

      near.visible = false;
      const glass = new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshBasicMaterial({ color: 0x0000ff,
        transparent: true, opacity: 0.5, depthWrite: false }));
      glass.position.z = -50; scene.add(glass); render();
      const blend = color(64);
      check(blend[0] < 2 && Math.abs(blend[1] - 128) < 2 && Math.abs(blend[2] - 128) < 2,
        `Transparent near geometry lost the far slice: ${blend}`);
      check(close(distances()[0], 600), 'Transparent glass overwrote opaque world depth');
      glass.material.blending = T.AdditiveBlending; render();
      const glow = color(64);
      check(glow[0] < 2 && glow[1] === 255 && Math.abs(glow[2] - 128) < 2,
        `Additive glow incorrectly occludes the far scene: ${glow}`);
      check(glass.material.blending === T.AdditiveBlending, 'XR did not restore the additive material');
      glass.visible = false;
      results.push('transparent surfaces and additive glows retain far color and opaque depth');

      near.visible = true; near.position.z = -100;
      renderer.xr.getSession = () => ({ renderState: { depthNear: 0.1, depthFar: 1000 } }); render();
      check(close(distances(0.1, 1000)[0], 100), 'Resolve ignored the runtime depth range during session startup');
      renderer.xr.getSession = originalSession;
      results.push('runtime depth range is respected while render-state changes take effect');

      renderer.setRenderTarget(target); renderer.setViewport(7, 9, 240, 110); renderer.setScissor(3, 5, 230, 100);
      renderer.setScissorTest(true); renderer.setClearColor(0x123456, 0.7);
      xr.render();
      check(renderer.getRenderTarget() === target && renderer.getViewport(new T.Vector4()).equals(new T.Vector4(7, 9, 240, 110))
        && renderer.getScissor(new T.Vector4()).equals(new T.Vector4(3, 5, 230, 100)) && renderer.getScissorTest()
        && Math.abs(renderer.getClearAlpha() - 0.7) < 1e-6 && renderer.getClearColor(new T.Color()).getHex() === 0x123456,
      'XR render leaked framebuffer or clear state');
      check(blits === 0 && xr.nearBuffer.depthTexture.type === T.FloatType, 'XR added multisample resolves or lost high precision private depth');
      results.push('framebuffer state restored; high precision depth without multisample resolves');

      const nearBuffer = xr.nearBuffer, farBuffer = xr.farBuffer;
      xr.settings = { v: { xrScale: 0.65 } };
      for (const scale of [0.65, 0.8, 1]) {
        xr.settings.v.xrScale = scale; render();
        check(color(64)[0] === 255 && color(192)[0] === 255 && color(10)[1] === 255 && color(138)[1] === 255
          && distances().every((d, i) => close(d, i % 2 ? 600 : 100)), `Scaled stereo color or depth is wrong at ${scale}`);
        check(xr.nearBuffer === nearBuffer && xr.farBuffer === farBuffer, 'Resolution change reallocated eye buffers');
      }
      xr.settings.v.xrScale = 0.65; xr.menu.open = true; render();
      check(xr.renderScale === 1 && xr.nearBuffer === nearBuffer, 'Menu failed to restore full resolution without allocation');
      xr.menu.open = false;
      results.push('65/80/100% race resolution retains stereo color and native depth; menus restore full resolution without allocation');

      const tiles = Array.from({ length: 12 }, (_, i) => new T.PlaneGeometry(8, 8, 24, 24).translate((i - 6) * 80, 0, -100));
      const geometry = mergeGeometries(tiles); tiles.forEach(g => g.dispose());
      geometry.userData.xrChunkIndices = 768;
      const ribbon = new T.Mesh(geometry, new T.MeshBasicMaterial({ color: 0xff00ff }));
      scene.add(ribbon); near.visible = far.visible = false;
      xr.settings.v.xrScale = 1;
      const resetInfo = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset(); render();
      const beforeRanges = new Uint8Array(256 * 128 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 256, 128, beforeRanges);
      const trianglesBefore = renderer.info.render.triangles;
      xr.buildTrackRanges(geometry);
      renderer.info.reset(); render();
      const afterRanges = new Uint8Array(beforeRanges.length);
      renderer.readRenderTargetPixels(target, 0, 0, 256, 128, afterRanges);
      check(afterRanges.every((v, i) => v === beforeRanges[i]) && renderer.info.render.triangles < trianglesBefore / 2
        && geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity,
      'Track culling changed visible pixels, failed to reduce triangles, or leaked its draw range');
      renderer.info.autoReset = resetInfo;
      scene.remove(ribbon); geometry.dispose(); ribbon.material.dispose();
      near.visible = far.visible = true; xr.settings.v.xrScale = 0.65;
      results.push('track range culling keeps identical stereo pixels while skipping off-screen triangles and restoring draw ranges');

      xr.drawPanel = XRControls.prototype.drawPanel;
      xr.hud.state = { speed: 100 }; xr.panelTime = 0;
      render();
      check(xr.renderScale === 0.65 && distances(0.2, 30000, [64, 192], 32).every(d => close(d, 1.35))
        && color(64)[0] === 255 && color(192)[0] === 255, 'Native HUD lost correct depth or cleared the scaled world');
      results.push('native-resolution HUD overlays the scaled world with matching depth in both eyes');

      // A warm-up world frame is overwritten before XR submission. The final
      // loading panel must clear its color and depth in both eye viewports.
      renderer.setRenderTarget(target); renderer.setViewport(0, 0, 256, 128); renderer.setScissorTest(false);
      xr.drawPanel = XRControls.prototype.drawPanel;
      xr.preparing = true; xr.preparePhase = 'compile'; xr.prepareProgress = 0;
      xr.prepareMessage = 'Preparing cockpit graphics…'; xr.panelTime = 0;
      xr.renderLoading();
      const loadingDepths = distances(0.2, 30000, [64, 4, 192, 132]);
      check(loadingDepths.every((d, i) => i % 2 ? d > 29000 : close(d, 1.6)),
        `Loading scene retained world depth or lost stereo alignment: ${loadingDepths}`);
      check(color(4)[1] < 30 && color(132)[1] < 30 && xr.panel.visible && xr.hits.length === 1,
        'Loading scene left world color or game controls visible');
      results.push('tracked loading panel clears the world color and depth in both eyes');
      check(renderer.getContext().getError() === 0, 'WebGL error during depth resolve');
      results.push('no WebGL errors');
      return { passed: results.length, checks: results, correctedDepths: corrected, originalDepths: previous, multisampleBlits: blits };
    } finally {
      renderer.xr.getCamera = originalCamera; renderer.xr.getSession = originalSession;
      gl.blitFramebuffer = blit;
      xr.farBuffer?.dispose(); xr.nearBuffer?.dispose(); xr.resolve.dispose();
      target.dispose(); sample.dispose(); quad.dispose();
      scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); renderer.dispose();
    }
  });
})
