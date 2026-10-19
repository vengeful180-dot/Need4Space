// GPU time per composer pass (EXT_disjoint_timer_query_webgl2), plus the scene with / without the shadow update
export async function profile(W = 2560, H = 1440, frames = 16, opts = {}) {
  const F = window.__feather, r = F.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const comp = F.composer;
  const ow = innerWidth, oh = innerHeight, pr = r.getPixelRatio();
  r.setPixelRatio(1); r.setSize(W, H, false); comp.setPixelRatio(1); comp.setSize(W, H);
  F.camera.aspect = W / H; F.camera.updateProjectionMatrix();
  const names = comp.passes.map((p, i) => (p.constructor.name || 'pass') + '#' + i);
  const pending = [];
  const time = (name, fn) => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); fn(); gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push([name, q]); };
  const origs = comp.passes.map((p) => p.render);
  comp.passes.forEach((p, i) => { const o = origs[i].bind(p); p.render = (...a) => time(names[i], () => o(...a)); });
  const sums = {}, info = { calls: 0, tris: 0 };
  const rt = new F.THREE.WebGLRenderTarget(W, H, { type: F.THREE.HalfFloatType, samples: 4 });
  let cpu = 0;
  try {
    for (let f = 0; f < frames; f++) {
      const t0 = performance.now();
      F.advance(1 / 60);
      cpu += performance.now() - t0;
      if (opts.split) {
        r.setRenderTarget(rt);
        r.shadowMap.autoUpdate = false;
        r.shadowMap.needsUpdate = true;
        time('scene+shadows', () => r.render(F.scene, F.camera));
        r.shadowMap.needsUpdate = false;
        time('scene only', () => r.render(F.scene, F.camera));
        info.calls = r.info.render.calls; info.tris = r.info.render.triangles;
        r.setRenderTarget(null);
      }
    }
    await new Promise((res) => setTimeout(res, 400));
    gl.finish();
    await new Promise((res) => setTimeout(res, 400));
    for (const [n, q] of pending) {
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
      (sums[n] ||= []).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
  } finally {
    comp.passes.forEach((p, i) => (p.render = origs[i]));
    rt.dispose();
    r.setPixelRatio(pr); r.setSize(ow, oh, false); comp.setPixelRatio(pr); comp.setSize(ow, oh);
    F.camera.aspect = ow / oh; F.camera.updateProjectionMatrix();
  }
  const out = {};
  let tot = 0;
  for (const [n, v] of Object.entries(sums)) {
    v.sort((a, b) => a - b);
    out[n] = +v[v.length >> 1].toFixed(3);
    if (n.includes('#')) tot += out[n];
  }
  out.passTotal = +tot.toFixed(2);
  out.cpuTickPlusSubmit = +(cpu / frames).toFixed(2);
  out.info = info;
  return out;
}


// repeatable scenes for profiling and checks: 'grid' (the countdown, all nine ships in view) and 'pack' (racing,
// the player's ship on an AI autopilot, `sec` seconds after the start)
export async function scenario(name, sec = 20) {
  const F = window.__feather, { Driver } = await import('./race.js');
  F.input.read = F.input.__read || F.input.read;
  F.input.__read = F.input.read;
  F.race.reset();
  F.ship.setEngine(true);
  F.advance(5);
  for (let i = 0; i < 600 && F.race.state !== 'countdown'; i++) F.advance(0.05);
  if (name === 'grid') { F.advance(1); return F.race.state; }
  const e = F.race.player, rnd = () => 0.5;
  const d = new Driver(e, F.race, rnd, e.slot);
  F.input.read = (dt) => ({ ...F.input.__read(dt), ...(F.race.racing ? d.think(dt) : {}) });
  for (let i = 0; i < 400 && F.race.state !== 'racing'; i++) F.advance(0.05);
  F.advance(sec);
  return F.race.state + ' s=' + F.racer.s.toFixed(0) + ' pos=' + F.race.position();
}

// GPU + CPU of rendering one frozen frame (no simulation), median of `frames` after `warm` warm-up renders
export async function still(frames = 30, warm = 20) {
  const F = window.__feather, r = F.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  for (let i = 0; i < warm; i++) F.render();
  const qs = [], cpu = [];
  for (let i = 0; i < frames; i++) {
    const q = gl.createQuery(), t0 = performance.now();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    F.render();
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    cpu.push(performance.now() - t0);
    qs.push(q);
  }
  await new Promise((res) => setTimeout(res, 300)); gl.finish(); await new Promise((res) => setTimeout(res, 300));
  const gpu = qs.filter((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)).map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
  qs.forEach((q) => gl.deleteQuery(q));
  const med = (a) => { a = [...a].sort((x, y) => x - y); return +a[a.length >> 1].toFixed(3); };
  return { gpu: med(gpu), cpu: med(cpu), calls: r.info.render.calls, tris: r.info.render.triangles };
}

// the grid at the lights (all nine ships in view from the chase camera): reset, engines on, stop in the countdown
export async function gridView() {
  const F = window.__feather;
  F.race.reset();
  F.ship.setEngine(true);
  F.rig.mode = 'chase';
  for (let i = 0; i < 400 && F.race.state !== 'countdown'; i++) F.advance(0.05);
  F.rig.snap(F.ctl);
  F.advance(0.3);
  return F.race.state;
}

// a whole race simulated (no rendering): every ship on the AI, the player too; stats for the checks.
// opts.level: the rivals' AI difficulty; opts.player: the autopilot's level ('hard' drives like the rivals' best);
// opts.playerScale: the autopilot's engine (1 = the player's). Stutter: the largest step-to-step lurch of a rival's
// position (|p+ - 2p + p-|, m - the loop's pull alone is ~0.08 m) and how many steps lurched over 0.3 m; stuck: rival
// ship-seconds under 60 m/s once racing; flicker: rivals' boost bursts under 0.2 s + airbrake pulses under 0.1 s.
export async function simRace(maxT = 260, opts = {}) {
  const F = window.__feather, { Driver } = await import('./race.js');
  const race = F.race, dt = 1 / 120, level0 = race.level;
  if (opts.level) race.setDifficulty(opts.level);
  race.reset();
  for (const e of race.entries) { e.ship.setEngine(true); e.ship.power = 1; e.ship.spin = 1; e.ship.canopyT = 0; e.ship.canopyOpen = false; }
  const keep = race.level;
  race.level = opts.player || race.level;
  const pd = new Driver(race.player, race, () => 0.5, race.player.slot);
  race.level = keep;
  race.player.racer.thrustScale = opts.playerScale ?? 1;
  const HOLD = { throttleUp: 0, throttleDown: 0, throttleAxis: 0, boost: 0, yaw: 0, roll: 0, airL: 0, airR: 0 };
  let t = 0, nan = 0, minV = 1e9, lurch = 0, lurches = 0, stuck = 0, pads = 0, boostT = 0, step = 0, flicker = 0;
  for (const e of race.entries) e.flick = null;
  const where = [];
  const falls = [], P = race.entries.map(() => []);
  const hooks = race.entries.map((e) => { const o = e.racer.onEvent; e.racer.onEvent = (ev) => { if (ev.type === 'fall') falls.push([e.team.name, e.racer.s.toFixed(0), t.toFixed(1)]); if (ev.type === 'pad' && !e.player && race.racing) { pads++; e.padStep = step; } if (ev.type === 'scrape' && ev.wall) e.padStep = step; o(ev); }; return o; });
  while (t < maxT) {
    race.step(dt, race.racing ? pd.think(dt) : HOLD, true);
    race.entries.forEach((e, k) => {
      e.racer.animState();
      if (!Number.isFinite(e.racer.s + e.racer.x + e.racer.y)) nan++;
      if (race.racing && race.time > 5 && !e.finished) minV = Math.min(minV, e.racer.vs);
      if (e.player || !race.racing || e.finished) return;
      if (race.time > 5 && e.racer.vs < 60) stuck += dt;
      if (e.racer.boosting > 0.5) boostT += dt;
      // flicker: a boost burst under 0.2 s or an airbrake pulse under 0.1 s (flames / flaps blinking)
      const di = e.driver.inp, b = di.boost, a = di.airL ? -1 : di.airR ? 1 : 0, f = (e.flick ||= { b: 0, bT: 0, a: 0, aT: 0 });
      if (b !== f.b) { if (f.b && race.time - f.bT < 0.2) flicker++; f.b = b; f.bT = race.time; }
      if (a !== f.a) { if (f.a && race.time - f.aT < 0.1) flicker++; f.a = a; f.aT = race.time; }
      const p = P[k];
      p.push(e.racer.pos.clone());
      if (p.length > 3) p.shift();
      if (p.length === 3) {
        const d = p[2].clone().sub(p[1]).sub(p[1]).add(p[0]).length();
        // (over 5 m: a respawn after a fall; a pad's kick (a 55 m/s step) and a wall knock (the drift reversed) are
        // single-step changes by design - the player's too)
        if (d < 5 && !(step - (e.padStep ?? -9) < 3)) {
          lurch = Math.max(lurch, d);
          if (d > 0.3) { lurches++; if (where.length < 12) where.push([e.team.name, e.racer.s | 0, +d.toFixed(2), +race.time.toFixed(2)]); }
        }
      }
    });
    race.events.length = 0;
    t += dt;
    step++;
    if (race.entries.every((e) => e.finished)) break;
  }
  race.entries.forEach((e, k) => (e.racer.onEvent = hooks[k]));
  const ai = race.entries.filter((e) => !e.player), all = ai.flatMap((e) => e.laps.slice(1));
  const med = (a) => { a = [...a].sort((x, y) => x - y); return a.length ? +a[a.length >> 1].toFixed(2) : NaN; };
  const out = { t: +t.toFixed(1), state: race.state, level: race.level, stats: race.stats, nan, falls, minSpeed: +minV.toFixed(0),
    finished: race.entries.filter((e) => e.finished).length, wallsPerShipLap: +(race.stats.walls / 8 / 3).toFixed(2),
    lurch: +lurch.toFixed(3), lurches, lurchAt: where, flicker, stuck: +stuck.toFixed(2), aiPadsPerLap: +(pads / 8 / 3).toFixed(2), aiBoost: +(boostT / 8 / Math.max(1, race.time)).toFixed(3),
    aiBestLap: +Math.min(...ai.map((e) => e.best)).toFixed(2), aiMedianFlyingLap: med(all), playerPos: race.position(),
    order: race.standings().map((e) => e.team.name + (e.finishTime ? ' ' + e.finishTime.toFixed(1) : '')),
    laps: race.entries.map((e) => e.team.name + ' ' + e.laps.map((x) => x.toFixed(1)).join('/')) };
  if (opts.level) race.setDifficulty(level0);
  race.player.racer.thrustScale = 1;
  return out;
}

// one ship alone on the circuit (no traffic, no rubber band): the player's racer driven by the rivals' AI at `level`
// with engine `scale` - with level 'brutal' and scale 1 it is the benchmark for a flawless player (every pad, the
// boost spent where it pays, the least-curvature line). Laps from a standing start; flying laps are the 2nd on.
// opts.tune: Driver.tune overrides for this run only.
export async function timeTrial(opts = {}) {
  const F = window.__feather, race = F.race, tr = F.track, dt = 1 / 120, { Driver } = await import('./race.js');
  race.reset();
  const e = race.player, r = e.racer;
  e.ship.setEngine(true); e.ship.power = 1; e.ship.spin = 1; e.ship.canopyT = 0; e.ship.canopyOpen = false;
  const solo = Object.create(race);
  solo.entries = [e];
  solo.level = opts.level || 'brutal';
  const d = new Driver(e, solo, () => 0.5, e.slot), tune0 = { ...Driver.tune };
  const replan = opts.tune && ['lineM', 'A', 'brakeD'].some((k) => k in opts.tune);
  if (opts.tune) { Object.assign(Driver.tune, opts.tune); if (replan) race.replan(); }
  r.locked = false; r.thrustScale = opts.scale ?? 1; r.draft = 0;
  let prog = 0, lastS = r.s, t = 0, lt = 0, walls = 0, pads = 0, boostT = 0, minV = 1e9, falls = 0, err = 0, air = 0, e2 = 0, ne = 0;
  const laps = [], o = r.onEvent;
  r.onEvent = (ev) => { if (ev.type === 'scrape' && ev.wall) walls++; if (ev.type === 'pad') pads++; if (ev.type === 'fall') falls++; };
  try {
    while (laps.length < (opts.laps || 3) && t < 400) {
      const inp = d.think(dt);
      r.step(dt, inp);
      r.events.length = 0;
      r.animState();
      prog += race.gap(r.s, lastS); lastS = r.s; t += dt;
      if (r.boosting > 0.5) boostT += dt;
      if (inp.airL || inp.airR) air += dt;
      if (t > 4) { const ex = Math.abs(r.x - race.plan.x[Math.floor(r.s / tr.step) % tr.n]); minV = Math.min(minV, r.vs); err = Math.max(err, ex); e2 += ex * ex; ne++; }
      if (prog >= (laps.length + 1) * tr.length) { laps.push(+(t - lt).toFixed(2)); lt = t; }
    }
  } finally {
    r.onEvent = o;
    r.thrustScale = 1;
    Object.assign(Driver.tune, tune0);
    if (replan) race.replan();
  }
  race.reset();
  return { laps, walls, pads, falls, boost: +(boostT / t).toFixed(3), airbrake: +(air / t).toFixed(3), minV: minV | 0, maxLineErr: +err.toFixed(1), rmsLineErr: +Math.sqrt(e2 / Math.max(1, ne)).toFixed(2) };
}

// One ship's second lap alone (the rivals' AI at `level`), where it went wrong between arc lengths from and to: its
// wall knocks and falls (s, m/s), where it ran under `slow` m/s, and how high it flew (s every 20 m, m over the deck)
export async function trace(level = 'hard', from = 0, to = 1e9, slow = 240) {
  const F = window.__feather, race = F.race, tr = F.track, dt = 1 / 120, { Driver } = await import('./race.js');
  race.reset();
  const e = race.player, r = e.racer;
  e.ship.setEngine(true); e.ship.power = 1; e.ship.spin = 1; e.ship.canopyT = 0; e.ship.canopyOpen = false;
  const solo = Object.create(race);
  solo.entries = [e];
  solo.level = level;
  const d = new Driver(e, solo, () => 0.5, e.slot), o = r.onEvent, ev = [];
  r.locked = false; r.thrustScale = 1; r.draft = 0;
  let lap = 0, t = 0, prog = 0, lastS = r.s, t0 = 0;
  r.onEvent = (x) => { if (lap === 1 && (x.type === 'scrape' || x.type === 'fall')) ev.push([x.type, Math.round(r.s), Math.round(x.v || 0)]); };
  const nb = Math.ceil(tr.length / 20), vs = new Float32Array(nb), ys = new Float32Array(nb);
  try {
    while (t < 600 && prog < tr.length * 2) {
      r.step(dt, d.think(dt)); r.events.length = 0; r.animState();
      prog += race.gap(r.s, lastS); lastS = r.s; t += dt;
      if (prog > tr.length && !lap) { lap = 1; t0 = t; }
      if (lap) { const k = Math.floor(r.s / 20); vs[k] = r.vs; ys[k] = Math.max(ys[k], r.y); }
    }
  } finally { r.onEvent = o; race.reset(); }
  const pick = (a, f) => [...a].map((x, k) => [k * 20, Math.round(x)]).filter(([s, x]) => s >= from && s <= to && f(x));
  return { lap: +(t - t0).toFixed(2), ev: ev.filter(([, s]) => s >= from && s <= to), slow: pick(vs, (v) => v > 0 && v < slow), air: pick(ys, (y) => y > 6) };
}

// chase-camera frames along the lap (racing, the pack on its AI): one at each arc length of `list`, saved as
// <prefix><s>.png (the frames are shot in order: list ascending)
export async function shotsAt(prefix, list, w = 640, h = 360) {
  const F = window.__feather, out = [];
  await scenario('pack', 0);
  for (const s of list) {
    goTo(s);
    F.rig.mode = 'chase';
    F.advance(0.25);
    out.push(await F.shot(prefix + Math.round(s), w, h));
  }
  return out;
}

// The music, exported: each song of music.js rendered whole and saved as 16-bit WAV through the dev server
// (racer/wip/shots/music_<name>.png - the PNG name is the server's; it is a WAV), then encoded with ffmpeg to
// assets/music/<name>.ogg (Opus) and .m4a (AAC). The game streams those files instead of synthesising at runtime.
export async function exportMusic() {
  const m = await import('./music.js');
  const done = [];
  for (let si = 0; si < m.SONG_COUNT; si++) {
    const segs = [];
    for (let k = 0; k < m.SEGMENTS; k++) segs.push(await m.renderSegment(si, k));
    const sr = segs[0].sampleRate, n = segs.reduce((a, b) => a + b.length, 0);
    const buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
    let o = 44;
    for (const b of segs) {
      const L = b.getChannelData(0), R = b.getChannelData(1);
      for (let i = 0; i < b.length; i++) {
        for (const x of [L[i], R[i]]) {          // TPDF dither, then 16 bits
          const d = (Math.random() - Math.random()) / 32768;
          v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round((x + d) * 32767))), true); o += 2;
        }
      }
    }
    const name = 'music_' + m.SONG_NAMES[si].toLowerCase().replace(/[^a-z0-9]+/g, '_');
    await fetch('/shot/' + name, { method: 'POST', body: buf });
    done.push([name, +(n / sr).toFixed(1)]);
  }
  return done;
}

// What the loading screen waits on (?bootprof; await window.__bootDone, then read window.__boot): per loading step
// (its status text) the wall time, the GPU time of every draw and upload (timer queries: gl.finish does not wait for
// the GPU in Chrome), the time spent waiting on the driver's shader compiles (three checks each link right away), and
// every single GPU job over 4 ms - on an integrated GPU ~15-100x slower: one of those past ~2 s and Windows resets the
// driver (the page's WebGL context is lost).
export function bootProfile() {
  const P = WebGL2RenderingContext.prototype, rec = { steps: {}, jobs: [], compile: 0, programs: 0 };
  const box = document.getElementById('loading'), text = document.getElementById('loadtext');
  const now = () => performance.now(), t00 = now();
  const label = () => (text.textContent || '?').replace(/\s+[\d.]+ \/ [\d.]+( MB)?$/, '');
  const S = (k) => (rec.steps[k] ||= { from: +(now() - t00).toFixed(0), wall: 0, gpu: 0, jobs: 0, compile: 0, cpu: 0 });
  let done = false, cur = S(label()), curT = now(), ext = null;
  const shaderName = new WeakMap(), progName = new WeakMap(), queries = [];
  const wrap = (fn, f) => { const o = P[fn]; if (o) P[fn] = function (...a) { return done ? o.apply(this, a) : f.call(this, o, a, fn); }; };
  const gpu = function (o, a, fn) {
    ext ||= this.getExtension('EXT_disjoint_timer_query_webgl2');
    const q = this.createQuery(), p = this.getParameter(this.CURRENT_PROGRAM), vp = this.getParameter(this.VIEWPORT);
    this.beginQuery(ext.TIME_ELAPSED_EXT, q);
    const t0 = now(), r = o.apply(this, a);
    cur.cpu += now() - t0;
    this.endQuery(ext.TIME_ELAPSED_EXT);
    queries.push([q, cur, label(), fn.startsWith('draw') ? (p && progName.get(p)) || '?' : fn, vp[2] + 'x' + vp[3], this]);
    return r;
  };
  for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements',
    'texImage2D', 'texSubImage2D', 'texImage3D', 'texStorage2D', 'generateMipmap', 'blitFramebuffer', 'copyTexSubImage2D']) wrap(fn, gpu);
  // (&cold: every shader made unique, so neither Chrome's shader cache nor ANGLE's helps - a first visit's compile)
  const cold = new URLSearchParams(location.search).has('cold') ? `\n// ${Math.random()}\n` : '';
  wrap('shaderSource', function (o, a) { shaderName.set(a[0], (/#define SHADER_NAME (\S+)/.exec(a[1]) || [])[1]); return o.call(this, a[0], a[1] + cold); });
  wrap('attachShader', function (o, a) { const n = shaderName.get(a[1]); if (n) progName.set(a[0], n); return o.apply(this, a); });
  wrap('linkProgram', function (o, a) { rec.programs++; return o.apply(this, a); });
  for (const fn of ['getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog']) {
    wrap(fn, function (o, a) { const t0 = now(), r = o.apply(this, a), dt = now() - t0; cur.compile += dt; rec.compile += dt; return r; });
  }
  const next = () => { cur.wall += now() - curT; curT = now(); cur = S(label()); };
  window.__bootDone = new Promise((resolve) => {
    const obs = new MutationObserver(async () => {
      next();
      if (!box.classList.contains('done') && !box.classList.contains('error')) return;
      done = true; obs.disconnect();
      rec.total = +(now() - t00).toFixed(0);
      // the timer results arrive a few frames later
      for (let k = 0; k < 200 && queries.length; k++) {
        await new Promise((r) => setTimeout(r, 20));
        for (let i = queries.length - 1; i >= 0; i--) {
          const [q, st, lb, what, vp, gl] = queries[i];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
          const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
          st.gpu += ms; st.jobs++;
          if (ms > 4) rec.jobs.push([lb, +ms.toFixed(1), what, vp]);
          gl.deleteQuery(q);
          queries.splice(i, 1);
        }
      }
      rec.lost = queries.length;
      for (const s of Object.values(rec.steps)) for (const k of ['wall', 'gpu', 'compile', 'cpu']) s[k] = +s[k].toFixed(0);
      rec.compile = +rec.compile.toFixed(0);
      rec.jobs.sort((x, y) => y[1] - x[1]);
      resolve(rec);
    });
    obs.observe(text, { childList: true, characterData: true, subtree: true });
    obs.observe(box, { attributes: true });
  });
  window.__boot = rec;
}

// A lap's GPU frame times at a given output size (the render scale as set): the player's ship on the AI autopilot,
// a frame every 1/60 s, each frame's GPU time by timer query - the worst stretches of the circuit (s in m) and the
// programs compiled during it (should be 0). Run with ?bootprof off; await, it takes a while.
export async function lapGPU(W = 1920, H = 1080, sec = 50) {
  const F = window.__feather, r = F.renderer, comp = F.composer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  await scenario('pack', 0);
  const scale = F.settings.v.scale, ow = innerWidth, oh = innerHeight, pr = r.getPixelRatio();
  r.setPixelRatio(1); r.setSize(W, H, false); comp.setPixelRatio(scale); comp.setSize(W, H);
  F.camera.aspect = W / H; F.camera.updateProjectionMatrix();
  const prog0 = r.info.programs.length, rows = [], pend = [];
  for (let i = 0; i < sec * 60; i++) {
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    F.advance(1 / 60);
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    pend.push([q, F.racer.s]);
    if (i % 20 === 19) {
      await new Promise((res) => setTimeout(res, 0));
      for (let k = pend.length - 1; k >= 0; k--) {
        const [qq, s] = pend[k];
        if (!gl.getQueryParameter(qq, gl.QUERY_RESULT_AVAILABLE)) continue;
        rows.push([s, gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6]); gl.deleteQuery(qq); pend.splice(k, 1);
      }
    }
  }
  r.setPixelRatio(pr); r.setSize(ow, oh, false); comp.setPixelRatio(pr * scale); comp.setSize(ow, oh);
  F.camera.aspect = ow / oh; F.camera.updateProjectionMatrix();
  const ms = rows.map((x) => x[1]).sort((a, b) => a - b), q = (p) => +ms[Math.floor(p * (ms.length - 1))].toFixed(3);
  // the worst 200 m stretches
  const bins = new Map();
  for (const [s, t] of rows) { const b = Math.floor(s / 200) * 200; const e = bins.get(b) || [0, 0]; e[0] += t; e[1]++; bins.set(b, e); }
  const worst = [...bins].map(([b, [t, n]]) => [b, +(t / n).toFixed(3)]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { frames: rows.length, med: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1), worst, compiled: r.info.programs.length - prog0 };
}

// lapGPU's spikes taken apart: each frame's GPU time per composer pass, and for the frames over 2x the median, what
// was going on (where on the lap, the pass that grew, the particles alive, the wave rings showing)
export async function lapSpikes(W = 1920, H = 1080, sec = 40) {
  const F = window.__feather, r = F.renderer, comp = F.composer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  await scenario('pack', 0);
  const scale = F.settings.v.scale, ow = innerWidth, oh = innerHeight, pr = r.getPixelRatio();
  r.setPixelRatio(1); r.setSize(W, H, false); comp.setPixelRatio(scale); comp.setSize(W, H);
  F.camera.aspect = W / H; F.camera.updateProjectionMatrix();
  const names = comp.passes.map((p, i) => (p.constructor.name || 'pass') + '#' + i);
  let cur = null;
  const origs = comp.passes.map((p) => p.render);
  comp.passes.forEach((p, i) => { const o = origs[i].bind(p); p.render = (...a) => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); o(...a); gl.endQuery(ext.TIME_ELAPSED_EXT); cur.q.push([names[i], q]); }; });
  const frames = [], pend = [];
  const alive = () => F.fx.pools.reduce((n, p) => { let k = 0; for (let i = 0; i < p.n; i++) if (p.age[i] < p.life[i]) k++; return n + k; }, 0);
  try {
    for (let i = 0; i < sec * 60; i++) {
      cur = { q: [], s: F.racer.s, alive: 0, waves: 0 };
      F.advance(1 / 60);
      cur.alive = alive(); cur.waves = F.fx.waves.filter((m) => m.visible).length + (F.fx.ring.visible ? 1 : 0);
      pend.push(cur);
      if (i % 20 === 19) await new Promise((res) => setTimeout(res, 0));
    }
    await new Promise((res) => setTimeout(res, 300));
    for (const f of pend) {
      f.t = {}; f.tot = 0;
      for (const [n, q] of f.q) { const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; f.t[n] = (f.t[n] || 0) + ms; f.tot += ms; gl.deleteQuery(q); }
      frames.push(f);
    }
  } finally {
    comp.passes.forEach((p, i) => (p.render = origs[i]));
    r.setPixelRatio(pr); r.setSize(ow, oh, false); comp.setPixelRatio(pr * scale); comp.setSize(ow, oh);
    F.camera.aspect = ow / oh; F.camera.updateProjectionMatrix();
  }
  const tots = frames.map((f) => f.tot).sort((a, b) => a - b), med = tots[tots.length >> 1];
  const passMed = {};
  for (const n of names) { const v = frames.map((f) => f.t[n] || 0).sort((a, b) => a - b); passMed[n] = +v[v.length >> 1].toFixed(3); }
  const spikes = frames.map((f, i) => [i, f]).filter(([, f]) => f.tot > 2 * med).map(([i, f]) => {
    const grew = Object.entries(f.t).map(([n, t]) => [n, t - passMed[n]]).sort((a, b) => b[1] - a[1])[0];
    return [i, Math.round(f.s), +f.tot.toFixed(2), grew[0], +grew[1].toFixed(2), f.alive, f.waves];
  });
  return { med: +med.toFixed(3), passMed, nSpikes: spikes.length, spikes: spikes.slice(0, 40) };
}

// ---- A/B costs of groups of objects and passes, on a frozen frame (GPU timer queries, each pair interleaved; queued
// in one go and collected after one wait - the hidden pane throttles timers to seconds)
// abQueue('name', s): flies the player to arc length s (race running), queues the pairs; abCollect(): medians (ms)
export function goTo(s) {
  const F = window.__feather, tr = F.track;
  for (let i = 0; i < 4000; i++) { const d = ((s - F.racer.s) % tr.length + tr.length) % tr.length; if (d < 6 || d > tr.length - 30) break; F.advance(Math.min(0.25, d / 400)); }
}
export function forestGroups() {
  const F = window.__feather, W = F.world, g = {};
  if (W.flora) { g.flora = W.flora.meshes.filter((m) => m !== W.flora.vineMesh); g.vines = [W.flora.vineMesh]; }
  g.islands = []; g.roof = []; g.ribs = []; g.tree = [];
  F.scene.traverse((o) => {
    if (o.isMesh && W.islandMat && o.material === W.islandMat) g.islands.push(o);
    if (W.canopy && o.geometry === W.canopy.leaves) g.roof.push(o);
    if (o.material?.customProgramCacheKey?.() === 'forest-rib') g.ribs.push(o);
    if (/great-tree/.test(o.name)) g.tree.push(o);
  });
  if (W.abyss) g.abyss = [W.abyss.mesh];
  if (W.waters) g.water = [...W.waters.falls.map((f) => f.mesh), W.waters.mist];
  if (W.creatures) g.creatures = [W.creatures.rays, W.creatures.birds, W.creatures.whaleMesh];
  g.track = Object.values(F.track.parts).flat().filter(Boolean);
  g.ships = F.race ? F.race.entries.map((e) => e.ship.root) : [F.ship.root];
  return g;
}
const AB = { plan: [] };
export function abQueue(loc, s, { W = 1920, H = 1080, reps = 3, groups = forestGroups } = {}) {
  const F = window.__feather, r = F.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), comp = F.composer;
  goTo(s); F.advance(1 / 60);
  const ow = innerWidth, oh = innerHeight, pr = r.getPixelRatio();
  r.setPixelRatio(1); r.setSize(W, H, false); comp.setPixelRatio(1); comp.setSize(W, H); F.camera.aspect = W / H; F.camera.updateProjectionMatrix();
  const q = () => { const k = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, k); F.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); return k; };
  for (let i = 0; i < 2; i++) F.render();
  for (const [k, list] of Object.entries(groups())) for (let i = 0; i < reps; i++) {
    const a = q(), vis = list.map((o) => o.visible);
    list.forEach((o) => (o.visible = false));
    const b = q();
    list.forEach((o, j) => (o.visible = vis[j]));
    AB.plan.push([loc, k, a, b]);
  }
  for (const k of ['gtao', 'ssr', 'bloom', 'streaks']) for (let i = 0; i < reps; i++) {
    const P = F[k], was = P.enabled, a = q(); P.enabled = false; const b = q(); P.enabled = was; AB.plan.push([loc, k, a, b]);
  }
  r.setPixelRatio(pr); r.setSize(ow, oh, false); comp.setPixelRatio(pr); comp.setSize(ow, oh); F.camera.aspect = ow / oh; F.camera.updateProjectionMatrix();
  gl.flush();
  return AB.plan.length;
}
export function abCollect() {
  const gl = window.__feather.renderer.getContext(), res = {}, med = (a) => { a = [...a].sort((x, y) => x - y); return +a[a.length >> 1].toFixed(2); };
  let pending = 0;
  for (const [loc, k, a, b] of AB.plan) {
    if (!gl.getQueryParameter(a, gl.QUERY_RESULT_AVAILABLE) || !gl.getQueryParameter(b, gl.QUERY_RESULT_AVAILABLE)) { pending++; continue; }
    const A = gl.getQueryParameter(a, gl.QUERY_RESULT) / 1e6, B = gl.getQueryParameter(b, gl.QUERY_RESULT) / 1e6;
    ((res[loc] ||= {})[k] ||= { d: [], base: [] }).d.push(A - B); res[loc][k].base.push(A);
  }
  const out = {};
  for (const [loc, gs] of Object.entries(res)) {
    out[loc] = {}; const bases = [];
    for (const [k, v] of Object.entries(gs)) { out[loc][k] = med(v.d); bases.push(...v.base); }
    out[loc].frame = med(bases);
  }
  if (!pending) { for (const [, , a, b] of AB.plan) { gl.deleteQuery(a); gl.deleteQuery(b); } AB.plan = []; }
  return { pending, out };
}

// Steadier: whole blocks of frames per configuration (the GPU's clock settles in each), configurations alternated
// twice; configs: [[name, apply(), undo()]]. blockQueue at the current view (race or a set camera), blockCollect().
const BL = { plan: [] };
export function blockQueue(configs, { W = 1920, H = 1080, frames = 24, warm = 12, rounds = 2 } = {}) {
  const F = window.__feather, r = F.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'), comp = F.composer;
  const ow = innerWidth, oh = innerHeight, pr = r.getPixelRatio();
  r.setPixelRatio(1); r.setSize(W, H, false); comp.setPixelRatio(1); comp.setSize(W, H); F.camera.aspect = W / H; F.camera.updateProjectionMatrix();
  for (let k = 0; k < rounds; k++) for (const [name, on, off] of configs) {
    on?.();
    for (let i = 0; i < warm; i++) F.render();
    for (let i = 0; i < frames; i++) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); F.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); BL.plan.push([name, q]); }
    off?.();
  }
  r.setPixelRatio(pr); r.setSize(ow, oh, false); comp.setPixelRatio(pr); comp.setSize(ow, oh); F.camera.aspect = ow / oh; F.camera.updateProjectionMatrix();
  gl.flush();
}
// (q: the quantile reported - the median; with other pages sharing the GPU, a low one is steadier: 0.2)
export function blockCollect(q = 0.5) {
  const gl = window.__feather.renderer.getContext(), res = {};
  let pending = 0;
  for (const [n, k] of BL.plan) { if (!gl.getQueryParameter(k, gl.QUERY_RESULT_AVAILABLE)) { pending++; continue; } (res[n] ||= []).push(gl.getQueryParameter(k, gl.QUERY_RESULT) / 1e6); }
  const out = {};
  for (const [n, v] of Object.entries(res)) { v.sort((a, b) => a - b); out[n] = +v[Math.floor((v.length - 1) * q)].toFixed(2); }
  if (!pending) { for (const [, q] of BL.plan) gl.deleteQuery(q); BL.plan = []; }
  return { pending, out };
}

// Lights that float: every lit lens of the derelict (lamp lenses, marker lights, lit windows, glowing bands) must rest
// on something solid - one of its vertices within `near` m of other geometry - and on something drawn as far as the
// lens is (a lens in 'main' on a 'detail' strut floats from 500 m on: within `far` m); every lamp's housing (or its
// hanger's foot) must touch what holds it (`touch` m), its own parts left out. Before trusting it, breaks on purpose
// (a lens in empty space, lamps lifted 1 m off their mounts) that it must report, or selfTest says FAILED.
// Space only (the derelict).   P.floaters()  ->  { lenses, housings, selfTest, floating, farOnly, loose }
export function floaters({ near = 0.3, far = 2.0, touch = 0.2 } = {}) {
  const F = window.__feather, W = F.world.wreck, THREE = F.THREE;
  if (!W) return { error: 'no derelict on this map' };
  const K_LAMP = 6, RANGE = { detail: 500, main: 1800, relief: 2600, shell: 1e9, cast: 1e9 };
  const pts = [], groups = [];
  // the lenses: K_LAMP vertices joined by their triangles and shared corners, one piece each (any shape: boxes, bands)
  for (const m of W.meshes) {
    const [hull, , layer] = m.name.replace('wreck-', '').split('|'), P = m.geometry.attributes.position.array, A = m.geometry.attributes.wA.array;
    const I = m.geometry.index.array, up = new Map(), at = new Map();
    const root = (i) => { while (up.get(i) !== i) { up.set(i, up.get(up.get(i))); i = up.get(i); } return i; };
    const join = (i, j) => { const a = root(i), b = root(j); if (a !== b) up.set(a, b); };
    for (let t = 0; t < I.length; t += 3) {
      if (A[I[t] * 4] !== K_LAMP) continue;
      for (const i of [I[t], I[t + 1], I[t + 2]]) if (!up.has(i)) {
        up.set(i, i);
        const k = `${P[i * 3].toFixed(3)},${P[i * 3 + 1].toFixed(3)},${P[i * 3 + 2].toFixed(3)}`;
        if (at.has(k)) join(i, at.get(k)); else { at.set(k, i); pts.push({ c: new THREE.Vector3().fromArray(P, i * 3), i }); }
      }
      join(I[t], I[t + 1]); join(I[t], I[t + 2]);
    }
    const byRoot = new Map();
    for (const p of pts) if (p.i !== undefined && !p.g) {
      const r = root(p.i);
      if (!byRoot.has(r)) groups.push(byRoot.set(r, { kind: 'lens', range: RANGE[layer], hull, c: new THREE.Vector3(), n: 0, d: 1e9, dFar: 1e9 }).get(r));
      const g = byRoot.get(r); p.g = g; g.c.add(p.c); g.n++;
    }
  }
  // the housings: points down the middle from the centre to the back face (one of them on the mount's surface if it is
  // set into it); a lamp on a hanger: its foot. lift: moved that far off what holds it (the breaks)
  const lampGroup = (L, lift = 0) => {
    const back = L.at.clone().addScaledVector(L.dir, -0.45 * L.s), up = L.foot ? back.clone().sub(L.foot).normalize() : L.dir;
    const g = { kind: 'housing', lamp: L, d: 1e9, own: new Map(L.own.map(([k, a, b]) => ['wreck-' + k, [a, b]])) };
    const cs = L.foot ? [L.foot.clone()] : [0, 0.25, 0.5, 0.75, 1].map((f) => L.at.clone().addScaledVector(L.dir, -f * 0.45 * L.s));
    for (const c of cs) pts.push({ c: c.addScaledVector(up, lift), g });
    return g;
  };
  const lamps = W.lamps.filter((L) => L.at && L.own);
  for (const L of lamps) groups.push(lampGroup(L));
  // the breaks on purpose
  const box = new THREE.Box3(); for (const m of W.meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
  const brkLens = { kind: 'lens', range: 1800, hull: 'break', c: new THREE.Vector3(), n: 1, d: 1e9, dFar: 1e9 };
  pts.push({ c: new THREE.Vector3(box.min.x, box.max.y + 3000, box.min.z), g: brkLens });
  const lifted = lamps.filter((_, k) => k % 29 === 0).map((L) => [L, lampGroup(L, 0.45 * L.s + 1.0)]);
  // a grid of the points (8 m); each triangle against the points near it
  const G = 8, R = Math.max(far, near, touch) + 0.5, grid = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  pts.forEach((p, i) => { const k = key(Math.floor(p.c.x / G), Math.floor(p.c.y / G), Math.floor(p.c.z / G)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  const tri = new THREE.Triangle(), q = new THREE.Vector3(), cand = [];
  const test = (a, b, c, isLens, range, mesh, i0) => {
    const x0 = Math.min(a.x, b.x, c.x) - R, x1 = Math.max(a.x, b.x, c.x) + R, y0 = Math.min(a.y, b.y, c.y) - R, y1 = Math.max(a.y, b.y, c.y) + R, z0 = Math.min(a.z, b.z, c.z) - R, z1 = Math.max(a.z, b.z, c.z) + R;
    const gx0 = Math.floor(x0 / G), gx1 = Math.floor(x1 / G), gy0 = Math.floor(y0 / G), gy1 = Math.floor(y1 / G), gz0 = Math.floor(z0 / G), gz1 = Math.floor(z1 / G);
    cand.length = 0;
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) * (gz1 - gz0 + 1) > 400) { pts.forEach((p, i) => { if (p.c.x > x0 && p.c.x < x1 && p.c.y > y0 && p.c.y < y1 && p.c.z > z0 && p.c.z < z1) cand.push(i); }); }
    else for (let x = gx0; x <= gx1; x++) for (let y = gy0; y <= gy1; y++) for (let z = gz0; z <= gz1; z++) { const l = grid.get(key(x, y, z)); if (l) cand.push(...l); }
    if (!cand.length) return;
    tri.set(a, b, c);
    for (const i of cand) {
      const p = pts[i], g = p.g;
      if (g.kind === 'lens') { if (isLens || (g.d <= near && g.dFar <= far)) continue; }
      else { const o = mesh && g.own.get(mesh); if (o && i0 >= o[0] && i0 < o[1]) continue; }
      tri.closestPointToPoint(p.c, q); const d = q.distanceTo(p.c);
      if (d < g.d) g.d = d;
      if (g.kind === 'lens' && range >= g.range && d < g.dFar) g.dFar = d;
    }
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), M = new THREE.Matrix4(), s = new THREE.Sphere();
  for (const m of W.meshes) {
    const range = RANGE[m.name.split('|')[2]], g = m.geometry, P = g.attributes.position.array, A = g.attributes.wA.array, I = g.index?.array, nt = I ? I.length / 3 : P.length / 9;
    for (let t = 0; t < nt; t++) {
      const i0 = I ? I[t * 3] : t * 3, i1 = I ? I[t * 3 + 1] : t * 3 + 1, i2 = I ? I[t * 3 + 2] : t * 3 + 2;
      test(a.fromArray(P, i0 * 3), b.fromArray(P, i1 * 3), c.fromArray(P, i2 * 3), A[i0 * 4] === K_LAMP, range, m.name, i0);
    }
  }
  for (const m of W.instMeshes) {
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const range = m.userData.range ?? 0, P = g.attributes.position.array, I = g.index?.array, nt = I ? I.length / 3 : P.length / 9;
    for (let k = 0; k < m.count; k++) {
      m.getMatrixAt(k, M); s.copy(g.boundingSphere).applyMatrix4(M); s.radius += R;
      if (!pts.some((p) => s.containsPoint(p.c))) continue;
      for (let t = 0; t < nt; t++) {
        const i0 = I ? I[t * 3] : t * 3, i1 = I ? I[t * 3 + 1] : t * 3 + 1, i2 = I ? I[t * 3 + 2] : t * 3 + 2;
        test(a.fromArray(P, i0 * 3).applyMatrix4(M), b.fromArray(P, i1 * 3).applyMatrix4(M), c.fromArray(P, i2 * 3).applyMatrix4(M), false, range, null, 0);
      }
    }
  }
  const fmt = (x) => (x >= 1e8 ? 'none' : +x.toFixed(2));
  const where = (g) => { const c = g.c.clone().divideScalar(g.n), H = W.hulls.find((h) => h.name === g.hull); return { at: c.toArray().map(Math.round), hull: g.hull, local: H ? H.toLocal(c.clone()).toArray().map((x) => +x.toFixed(1)) : null }; };
  const held = lifted.filter(([L]) => groups.find((g) => g.lamp === L).d <= touch);
  const selfTest = brkLens.d > near && held.length > 0 && held.every(([, g]) => g.d > touch) ? 'ok' : 'FAILED: a break on purpose was not reported';
  const lens = groups.filter((g) => g.kind === 'lens'), hs = groups.filter((g) => g.kind === 'housing');
  return {
    lenses: lens.length, housings: hs.length, selfTest,
    floating: lens.filter((g) => g.d > near).map((g) => ({ ...where(g), gap: fmt(g.d) })),
    farOnly: lens.filter((g) => g.d <= near && g.dFar > far).map((g) => ({ ...where(g), gapFar: fmt(g.dFar) })),
    loose: hs.filter((g) => g.d > touch).map((g) => ({ lamp: g.lamp.i, at: g.lamp.at.toArray().map(Math.round), size: g.lamp.s, layer: g.lamp.layer, hanger: !!g.lamp.foot, gap: fmt(g.d) })),
  };
}

// The Pyramid Run's ground check (egypt.js groundCheck): nothing that stands floats - the ruins' pieces on the sand, the
// root's column plinths on the bore's floor, the braziers' brackets in their columns; proven first on deliberate breaks
export async function pyramidFloaters() {
  const F = window.__feather, W = F.world, { groundCheck } = await import('./egypt.js');
  if (!W.ruins || !W.tomb) return { error: 'not the Pyramid Run' };
  return groundCheck(F.track, W.ruins, W.tomb, { centre: W.planet.position.clone(), R: W.planet.geometry.parameters.radius });
}
