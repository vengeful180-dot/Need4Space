# Need4Space

© 2026 vengeful180. All rights reserved. This is proprietary software: see [LICENSE](LICENSE).

An anti-gravity racer in space, built in the browser with [three.js](https://threejs.org/). You race the **Feather S1** or the **Comet R1** (pick one under Ship in the menu), hover-racers modelled and texture-baked in Blender, against eight AI rivals over three laps on one of four circuits (pick one under Circuit in the menu):

- **Space** (26.6 km): past a ringed gas giant, through 12 km of a colossal derelict broken in three and a graveyard of wrecks, a meteorite you fly through, jump gaps, a vertical loop, barrel rolls and a glass tunnel.
- **Forest moon** (13.8 km): floating islands over a jungle, a river arching over the track, a colossal tree, two kilometres of caverns, a giant's skull to fly through.
- **Ice planet** (14 km): a frozen sea at dusk under an aurora, a crevasse down an ice shelf, a glacier to fly through, storms and geysers.
- **Desert planet** (14.3 km): dunes at sunset, a half-buried city, a sandstorm, a sandstone gorge under natural bridges, a banked wall.

Every circuit has a gravity flip: the road ends, gravity turns over and you ride upside down on the road overhead.

**Experimental WebXR support:** race from a tracked, seated cockpit with an Xbox controller, an in-headset HUD and menus, and adjustable VR resolution. See [WebXR setup and controls](#webxr).

## Running it

The game is plain ES modules with no build step. three.js r170 is loaded from a CDN, so serve the folder and open it in a desktop browser (Chrome or Edge recommended). For a headset, follow [WebXR setup](#webxr).

```
python serve.py 8765
```

Then go to http://localhost:8765. Any other static file server works too, but `serve.py` sets the correct MIME types for `.js` and `.glb`.

Click or press a key once to start the sound and music (browsers block audio until you interact with the page).

## Controls

| Key | Action |
|---|---|
| W / S | Throttle up / down |
| A / D | Steer |
| ↑ / ↓ | In the air: nose up / down (float further or land sooner) |
| ← / → (or Z / X) | Left / right airbrake (one at a time, 3 s to charge) |
| Shift | Boost |
| E | Start or stop the engines |
| V | Change camera (chase, far chase, canopy, fly-by, orbit) |
| Esc / P | Pause menu |
| O | Settings |
| R | Restart the race |
| M | Mute |
| H | Controls card |

A standard-mapped Xbox controller works on desktop and in WebXR. Press a button after pairing it so the browser can detect it.

| Xbox control | Action |
| --- | --- |
| Left stick | Steer; VR: forward thrust / back brake; desktop: vertical axis pitches |
| Right stick | VR: pitch in the air |
| RT / LT | Throttle up / down and brake; VR: direct thrust / brake |
| A | Boost |
| LB / RB | Left / right airbrake |
| X | Slam / block; canopy when engines are off |
| Y | VR: show / hide the race HUD; desktop: start / stop engines |
| B | Change desktop camera; recenter in VR |
| Left-stick click | Recover to the track |
| Right-stick click / U key | Recenter in VR |
| Menu / View | Pause / resume |
| D-pad or left stick, A, B | Navigate menus, select, back |

## WebXR

WebXR support is experimental; compatibility and performance vary by headset and browser.

1. Open the game in a WebXR headset browser over **HTTPS**. `localhost` also works for development; an HTTP LAN address does not provide the secure context WebXR requires.
2. Pair a standard-mapped Xbox controller and press a button so the browser detects it.
3. Choose the circuit and ship before entering VR; changing either reloads the page and ends the session.
4. Choose **Enter VR** and wait for **Preparing VR** to finish. Use **Exit VR** in the headset panel or browser toolbar to return to the desktop view.

A tracked **Preparing VR** panel stays visible while the stereo shaders, eye buffers and first cockpit frame are prepared. The game waits for GPU completion before continuing; the existing scene and textures are reused.

VR uses a seated canopy view. Push the **left stick forward** for analog thrust, pull back to brake, and move it sideways to steer. Releasing forward stick / RT returns thrust to zero. **A adds boost**; it is separate from normal thrust. The **right stick** controls pitch. Look forward and press **B**, **right-stick click**, or **U** to recenter. Head movement stays independent of the ship's steering, and the cockpit follows the track through banks, loops and gravity flips. Desktop camera shake, zoom effects and cinematic cuts are bypassed in VR.

The headset panel shows speed, thrust, position, lap, hull, boost, airbrake charge and countdowns. Press **Y on the controller or keyboard** to hide / show the race HUD. Hiding it skips the panel's canvas redraws, texture uploads and stereo draws. Menus stay visible: press **Menu / View** to pause and access **Recenter** or **Exit VR** with the HUD hidden. Menus also support point and select / look and pinch. Races start the engines automatically; **E** remains the manual engine key in VR. Exiting VR or losing headset focus pauses an active race; head tracking continues while paused.

VR renders the sky and both depth slices into single-sample per-eye HDR buffers, then combines their color and restores the headset's continuous depth range. Forced 4× MSAA has been removed to reduce framebuffer storage and resolve bandwidth. The buffers are reused between eyes and released on exit. Background showroom preparation waits until VR ends. Screen-space desktop effects (AO, reflections, bloom and blur) are bypassed; desktop graphics settings are retained for returning to the browser view. Rendering and session transitions have been checked with the IWER emulator; native headset testing is ongoing.

**Settings → Graphics → VR race resolution** controls the world during play: **Balanced (80%)** is the default, shading 36% fewer world pixels; **Performance (65%)** shades about 58% fewer; **Full (100%)** keeps native world resolution. Title / pause menus and the headset HUD render at native resolution. Switching between a race and its menus reuses the eye buffers. The desktop HUD and minimap stop updating while VR is active; headset state, message timers and lap history continue updating.

During VR preparation, the track's long swept meshes get bounds for short sections. Each eye and depth slice submits only the sections intersecting its view, merging adjacent visible ranges into a draw call. This reuses the original geometry and materials; desktop rendering retains its original draw ranges.

Each eye's projection clips pixels outside its view, including behind the viewer. Objects outside the view can still contribute shadows. The game requests maximum compositor foveation with `setFoveation(1)` where the browser supports it; the main scene's private HDR buffers still use uniform resolution. This is not continuous gaze-driven scene rendering. VR race resolution is a saved browser preference, so faster hardware can use Full (100%) independently of another device's choice.

Input regression checks: `node --test tools/test_input.mjs`. Existing scoreboard checks: `python3 tools/test_scoreboard.py`.
The Playwright harness in `tools/test_xr.js` checks stereo projections, recentering, controller menus, pause, panel selection, focus loss, permission denial and session re-entry. Load the game with an IWER runtime exposed as `window.xrDevice`, then pass the harness function to your Playwright page runner.
`tools/test_xr_depth.js` is a standalone Playwright harness for the local server on port 8765. It reads actual rendered depth pixels, reproduces the original depth mismatch, and checks the corrected near/far resolve, transparency and framebuffer state.

## Features

- **WebXR (experimental):** a tracked seated cockpit, Xbox controls, in-headset menus, a toggleable HUD, and saved 65% / 80% / 100% VR race resolution choices. See [WebXR](#webxr) for setup and limitations.
- **Rivals:** AI on three difficulty levels, Normal, Hard and Brutal. They follow a racing line, plan their boost, use the boost pads, slipstream, overtake and defend.
- **Physics:** track-space hover physics with jumps, loops, gravity flips, wall knocks and ship-to-ship contact. Drifting can be switched on in Settings.
- **Picture:**
  - PCSS sun shadows in three cascades;
  - screen-space deck reflections;
  - GTAO ambient occlusion;
  - dual-filter bloom;
  - MSAA plus SMAA;
  - an AgX or ACES tone curve;
  - a two-slice depth range for precise far scenery.
- **Procedural art:** the deck, the structure's steel, the rocks (hex-tiled triplanar, with craters), the gas giant, its rings, the moon and the plasma sun are all generated on the GPU at load.
- **3D sound:** HRTF-panned positional audio with distance filtering and Doppler; echo inside the tunnel and the meteorite.
- **Settings:** every look feature has its own switch.

## Support

Need4Space is free. If you enjoy it, you can support development on Revolut: [revolut.me/alexan_vic](https://revolut.me/alexan_vic).

## Credits

- **Hit and impact sounds:** [Kenney](https://kenney.nl), the *Impact Sounds* and *Sci-fi Sounds* packs, CC0. The licence files are in `assets/sfx/`.
- **Music:** three original tracks composed in code (`src/music.js`): *Ring Runner*, *Nebula Drift* and *Hyperlane*. They are synthesised in the browser and play as a playlist.
- **Engine and world sounds:** synthesised at runtime (`src/audio.js`).
- **Engine:** [three.js](https://threejs.org/) r170 and [meshoptimizer](https://github.com/zeux/meshoptimizer), both MIT-licensed and loaded from jsDelivr.

## License

© 2026 vengeful180. All rights reserved.

Need4Space - its code, models, worlds, textures, music and sound - is proprietary. You may play it at its official
site, but you may not copy, modify, redistribute, re-host or reuse any part of it without written permission. The
full terms are in [LICENSE](LICENSE). The third-party components credited above keep their own licences.
