// Playwright browser_run_code harness. Load the game, install IWER as
// window.xrDevice, then run this function with that Playwright page.
// IWER and the controller below are test fixtures, never production dependencies.
(async function testXR(page) {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = [];
  await page.waitForFunction(() => window.__feather?.xr && window.xrDevice);
  await page.evaluate(async () => {
    if (__feather.xr.active) await __feather.xr.exit();
    __feather.menu.h.quit();
    __feather.menu.showTitle();
    await __feather.xr.checkSupport();
    window.testPad = { index: 1, id: 'Xbox Wireless Controller', mapping: 'standard', connected: true,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
    window.testPads = [{ index: 0, id: 'Quest', mapping: 'xr-standard', connected: true,
      axes: [0, 0, 0, 0], buttons: [{ value: 1, pressed: true }] }, testPad];
    window.originalGamepads = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => testPads });
    const xr = __feather.xr;
    window.originalPrepareGraphics = xr.prepareGraphics;
    window.originalFinishPreparation = xr.finishPreparation;
    window.originalRenderLoading = xr.renderLoading;
    window.loadingFrames = 0;
    window.originalXRScale = __feather.settings.v.xrScale;
    __feather.settings.set('xrScale', 0.8);
    window.desktopMapDraws = 0;
    const ctx = __feather.menu.h.hud.mctx;
    window.originalMapDraw = ctx.clearRect;
    ctx.clearRect = function (...args) { desktopMapDraws++; return originalMapDraw.apply(this, args); };
    xr.hudVisible = false;
    xr.renderLoading = function () { loadingFrames++; return originalRenderLoading.call(this); };
    xr.prepareGraphics = async function (session) {
      await new Promise(resolve => { window.releasePrepare = resolve; });
      return originalPrepareGraphics.call(this, session);
    };
    xr.finishPreparation = async function (session) {
      await new Promise(resolve => { window.releaseFinish = resolve; });
      return originalFinishPreparation.call(this, session);
    };
  });
  const button = async (index, value) => {
    await page.evaluate(([i, v]) => { testPad.buttons[i].value = v; testPad.buttons[i].pressed = v > 0.5; }, [index, value]);
  };
  try {
    await page.waitForFunction(() => __feather.xr.canEnter());
    await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
    await page.waitForFunction(() => __feather.xr.active && !!window.releasePrepare && loadingFrames >= 2);
    await page.evaluate(() => { desktopMapDraws = 0; }); // ignore desktop frames before the session entered
    check(await page.evaluate(() => __feather.xr.preparing && __feather.xr.panel.visible && !__feather.xr.hudVisible
      && __feather.xr.hits.length === 1 && __feather.xr.preparePhase === 'compile'), 'Preparation panel was hidden or showed game controls');
    const preparing = await page.evaluate(() => ({ shipTime: __feather.ship.t, raceTime: __feather.race.time,
      frames: loadingFrames, head: __feather.camera.position.toArray() }));
    await button(0, 1);
    await page.evaluate(() => { xrDevice.position.x += 0.2; });
    await page.waitForFunction(p => loadingFrames > p.frames + 3
      && __feather.camera.position.distanceTo(new __feather.THREE.Vector3(...p.head)) > 0.15, preparing);
    check(await page.evaluate(p => __feather.ship.t === p.shipTime && __feather.race.time === p.raceTime
      && __feather.menu.screen === 'main', preparing), 'Preparation advanced simulation or accepted menu actions');
    results.push('tracked preparation panel remains visible with HUD off; simulation and menu actions wait');
    await page.evaluate(() => releasePrepare());
    await page.waitForFunction(() => !!window.releaseFinish);
    check(await page.evaluate(() => __feather.xr.preparing && __feather.xr.preparePhase === 'gpu'
      && __feather.xr.farBuffer && __feather.xr.nearBuffer), 'Game opened before GPU setup completed');
    results.push('stereo shaders and buffers warm behind loading panel before GPU completion');
    await page.evaluate(() => releaseFinish());
    await page.waitForFunction(() => __feather.xr.active && !__feather.xr.preparing && !__feather.xr.needsCenter);
    check(await page.evaluate(() => __feather.menu.screen === 'main' && __feather.xr.preparationStats.ms >= 0), 'Held button started a race as preparation finished');
    await button(0, 0); await page.waitForFunction(() => !__feather.menu.pad.a);
    await page.evaluate(() => {
      const xr = __feather.xr;
      xr.prepareGraphics = originalPrepareGraphics; xr.finishPreparation = originalFinishPreparation;
      xr.renderLoading = originalRenderLoading; xr.hudVisible = true;
    });
    check(await page.evaluate(() => __feather.renderer.xr.getCamera().cameras.length === 2), 'Expected two tracked eyes');
    check(await page.evaluate(() => __feather.input.xr), 'VR stick layout was not activated');
    results.push('two-eye session entry');

    const before = await page.evaluate(() => __feather.camera.position.toArray());
    await page.evaluate(() => { xrDevice.position.x += 0.3; });
    await page.waitForFunction(p => __feather.camera.position.distanceTo(new __feather.THREE.Vector3(...p)) > 0.25, before);
    await page.evaluate(() => __feather.xr.recenter());
    await page.waitForFunction(() => !__feather.xr.needsCenter);
    check(await page.evaluate(() => __feather.camera.position.distanceTo(__feather.xr.cockpit.position) < 0.08), 'Recenter did not return to the seat');
    results.push('head translation and seated recenter');

    check(await page.evaluate(() => {
      const xr = __feather.xr, source = __feather.renderer.xr.getCamera().cameras[0];
      const saved = source.projectionMatrix.elements[8]; source.projectionMatrix.elements[8] = 0.17;
      try { return xr.slice(xr.nearView, 0.2, 500).cameras[0].projectionMatrix.elements[8] === 0.17; }
      finally { source.projectionMatrix.elements[8] = saved; }
    }), 'Depth slicing lost the asymmetric eye projection');
    results.push('asymmetric eye projections preserved');

    await button(0, 1); await page.waitForFunction(() => __feather.menu.screen === 'diff');
    await button(0, 0); await page.waitForFunction(() => !__feather.menu.pad.a);
    await button(0, 1); await page.waitForFunction(() => !__feather.menu.open);
    await button(0, 0); await button(7, 1);
    await page.waitForFunction(() => __feather.race.state === 'racing', null, { timeout: 30000 });
    await page.waitForFunction(() => __feather.ctl.speed > 5);
    await page.waitForFunction(() => __feather.xr.renderScale === 0.8);
    check(await page.evaluate(() => desktopMapDraws === 0 && getComputedStyle(document.getElementById('hud')).display === 'none'
      && __feather.menu.h.hud.state.speed > 5), 'VR still updates the desktop minimap or lost headset state');
    results.push('desktop HUD and minimap stay idle while headset state updates');
    results.push('Xbox menu selection, race start and throttle with an XR controller present');

    await button(7, 0);
    await page.evaluate(() => { testPad.axes[1] = -0.56; });
    await page.waitForFunction(() => Math.abs(__feather.ctl.throttle - 0.5) < 0.01);
    await page.evaluate(() => { testPad.axes[1] = 0; });
    await page.waitForFunction(() => __feather.ctl.throttle < 0.01);
    await button(7, 1);
    results.push('left-stick analog thrust and release reach the race controller');

    await button(3, 1);
    await page.waitForFunction(() => !__feather.xr.hudVisible && !__feather.xr.panel.visible);
    const hidden = await page.evaluate(() => {
      window.panelDraws = 0; window.originalPanelDraw = __feather.xr.panel.onBeforeRender;
      window.originalNativePanelDraw = __feather.xr.loadingPanel.onBeforeRender;
      __feather.xr.panel.onBeforeRender = () => panelDraws++;
      __feather.xr.loadingPanel.onBeforeRender = () => panelDraws++;
      window.raceBuffer = __feather.xr.nearBuffer;
      return { texture: __feather.xr.texture.version, time: __feather.race.time };
    });
    await page.waitForFunction(t => __feather.race.time > t + 0.3, hidden.time);
    check(await page.evaluate(v => !__feather.xr.hudVisible && !__feather.xr.panel.visible && panelDraws === 0
      && __feather.xr.texture.version === v && __feather.ship.engineOn, hidden.texture),
    'Hidden HUD still draws/uploads, held Y repeats, or Y stopped engines');
    check(await page.evaluate(() => {
      __feather.xr.select({ frame: { getPose: () => { throw new Error('Hidden HUD was selectable'); } } });
      return __feather.xr.hits.length === 0;
    }), 'Hidden HUD retained clickable controls');
    await button(3, 0);
    results.push('Y hides HUD without draws, uploads, repeat toggles or engine changes');

    await button(9, 1); await page.waitForFunction(() => __feather.menu.paused);
    await page.waitForFunction(() => __feather.xr.panel.visible);
    await page.waitForFunction(() => __feather.xr.renderScale === 1);
    check(await page.evaluate(() => __feather.xr.nearBuffer === raceBuffer), 'Pause reallocated eye buffers');
    await page.evaluate(() => __feather.settings.set('xrScale', 0.65));
    await button(9, 0); await page.waitForFunction(() => !__feather.menu.pad.view);
    const paused = await page.evaluate(() => ({ time: __feather.race.time, s: __feather.racer.s, head: __feather.camera.position.toArray() }));
    await page.evaluate(() => { xrDevice.position.x += 0.2; });
    await page.waitForFunction(p => __feather.camera.position.distanceTo(new __feather.THREE.Vector3(...p)) > 0.15, paused.head);
    const held = await page.evaluate(() => ({ time: __feather.race.time, s: __feather.racer.s }));
    check(paused.time === held.time && paused.s === held.s, 'Pause advanced or restarted the race');
    check(await page.evaluate(() => !__feather.xr.hudVisible && __feather.xr.panel.visible), 'Hidden HUD made pause menu inaccessible');
    results.push('Menu pauses simulation while head tracking continues');

    // The same panel ray path handles tracked-controller select and Safari pinch.
    check(await page.evaluate(() => {
      const xr = __feather.xr, T = __feather.THREE;
      xr.panelTime = 0; xr.drawPanel(); __feather.scene.updateMatrixWorld(true);
      const hit = xr.hits.find(h => h.w === 460); // Recenter button
      const local = new T.Vector3((hit.x + hit.w / 2) / 1024 - 0.5, 0.5 - (hit.y + hit.h / 2) / 640, 0);
      local.x *= 1.5; local.y *= 0.9375; local.applyMatrix4(xr.panel.matrixWorld);
      const origin = xr.view.getWorldPosition(new T.Vector3());
      const ray = new T.Matrix4().lookAt(origin, local, new T.Vector3(0, 1, 0)).setPosition(origin);
      ray.premultiply(xr.origin.matrixWorld.clone().invert());
      xr.select({ inputSource: { targetRaySpace: {} }, frame: { getPose: () => ({ transform: { matrix: ray.elements } }) } });
      return xr.needsCenter;
    }), 'Panel select ray missed the recenter button');
    results.push('panel ray selection');

    await button(1, 1); await page.waitForFunction(() => !__feather.menu.open);
    await button(1, 0); await page.waitForFunction(() => !__feather.menu.pad.b);
    await page.waitForFunction(() => !__feather.xr.panel.visible);
    await page.waitForFunction(() => __feather.xr.renderScale === 0.65);
    check(await page.evaluate(() => __feather.xr.nearBuffer === raceBuffer && !__feather.xr.preparing), 'Race resolution change reallocated or restarted XR preparation');
    await page.evaluate(() => __feather.settings.set('xrScale', 0.8));
    results.push('VR race resolution changes without allocation; pause menus stay at native resolution');
    await page.keyboard.press('y');
    await page.waitForFunction(() => __feather.xr.hudVisible && __feather.xr.panel.visible);
    await page.evaluate(() => { __feather.xr.panel.onBeforeRender = originalPanelDraw; __feather.xr.loadingPanel.onBeforeRender = originalNativePanelDraw; });
    results.push('pause menu overrides hidden HUD; resume retains preference; keyboard Y restores instruments');
    await page.evaluate(() => xrDevice.updateVisibilityState('visible-blurred'));
    await page.waitForFunction(() => __feather.menu.paused);
    await page.evaluate(() => xrDevice.updateVisibilityState('visible'));
    results.push('headset focus loss pauses');

    await page.evaluate(() => __feather.xr.exit());
    await page.waitForFunction(() => !__feather.xr.active);
    await page.waitForFunction(() => desktopMapDraws > 0);
    check(await page.evaluate(() => __feather.menu.paused && !__feather.input.xr && !__feather.xr.farBuffer && !__feather.xr.nearBuffer
      && !document.body.classList.contains('in-xr') && __feather.camera.aspect === innerWidth / innerHeight), 'Desktop state was not restored');
    results.push('exit restores desktop rendering and keeps race paused');

    await page.waitForFunction(() => __feather.xr.canEnter());

    await page.evaluate(() => {
      window.originalRequestSession = navigator.xr.requestSession;
      navigator.xr.requestSession = async () => { throw new DOMException('Test permission denial', 'NotAllowedError'); };
    });
    await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
    await page.waitForFunction(() => !__feather.xr.pending);
    check(await page.evaluate(() => !__feather.xr.active && !__feather.xr.button.disabled && __feather.xr.status.textContent.includes('Test permission denial')), 'Permission denial left VR entry stuck');
    await page.evaluate(() => { navigator.xr.requestSession = originalRequestSession; });
    results.push('permission denial leaves entry retryable');

    await page.evaluate(() => {
      delete window.releaseCancelledPrepare;
      __feather.xr.prepareGraphics = async function (session) {
        await new Promise(resolve => { window.releaseCancelledPrepare = resolve; });
        return originalPrepareGraphics.call(this, session);
      };
    });
    await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
    await page.waitForFunction(() => !!window.releaseCancelledPrepare && __feather.xr.preparing);
    await page.evaluate(async () => {
      await __feather.xr.exit();
      releaseCancelledPrepare();
      __feather.xr.prepareGraphics = originalPrepareGraphics;
    });
    await page.waitForFunction(() => !__feather.xr.active && !__feather.xr.preparing);
    check(await page.evaluate(() => !__feather.xr.nearBuffer && !__feather.xr.farBuffer), 'Cancelled preparation recreated disposed eye buffers');
    results.push('exit during preparation cancels completion and leaves eye buffers released');

    await page.waitForFunction(() => __feather.xr.canEnter());
    await page.evaluate(() => { __feather.xr.prepareGraphics = async () => { throw new Error('Test XR preparation failure'); }; });
    await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
    await page.waitForFunction(() => __feather.xr.preparePhase === 'error');
    check(await page.evaluate(() => __feather.xr.preparing && __feather.xr.panel.visible
      && __feather.xr.status.textContent.includes('Test XR preparation failure')), 'Failed preparation exposed the game or left no error feedback');
    await page.evaluate(async () => { await __feather.xr.exit(); __feather.xr.prepareGraphics = originalPrepareGraphics; });
    results.push('preparation failure stays behind a visible error panel and can be exited');

    await page.waitForFunction(() => __feather.xr.canEnter());
    await page.getByRole('button', { name: 'Enter VR', exact: true }).click();
    await page.waitForFunction(() => __feather.xr.active && !__feather.xr.preparing && !__feather.xr.needsCenter);
    results.push('session re-entry');
    return { passed: results.length, checks: results };
  } catch (error) {
    const state = await page.evaluate(() => ({ active: __feather.xr.active, menu: __feather.menu.screen,
      race: __feather.race.state, speed: __feather.ctl.speed, pending: __feather.xr.pending,
      canEnter: __feather.xr.canEnter(), status: __feather.xr.status.textContent }));
    throw new Error(`${error.message}; completed: ${results.join(', ')}; state: ${JSON.stringify(state)}`);
  } finally {
    await page.evaluate(async () => {
      if (window.originalRequestSession) navigator.xr.requestSession = originalRequestSession;
      if (window.originalPanelDraw) __feather.xr.panel.onBeforeRender = originalPanelDraw;
      if (window.originalNativePanelDraw) __feather.xr.loadingPanel.onBeforeRender = originalNativePanelDraw;
      if (window.originalPrepareGraphics) __feather.xr.prepareGraphics = originalPrepareGraphics;
      if (window.originalFinishPreparation) __feather.xr.finishPreparation = originalFinishPreparation;
      if (window.originalRenderLoading) __feather.xr.renderLoading = originalRenderLoading;
      window.releasePrepare?.(); window.releaseFinish?.(); window.releaseCancelledPrepare?.();
      testPads = []; if (__feather.xr.active) await __feather.xr.exit();
      if (window.originalMapDraw) __feather.menu.h.hud.mctx.clearRect = originalMapDraw;
      if (window.originalXRScale !== undefined) __feather.settings.set('xrScale', originalXRScale);
      if (originalGamepads) Object.defineProperty(navigator, 'getGamepads', originalGamepads);
      else delete navigator.getGamepads;
    });
  }
})
