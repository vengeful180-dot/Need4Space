// Run with: node --test tools/test_input.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Input, standardGamepad, deadzone } from '../src/input.js';

let pads = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {} };
const makeInput = () => new Input({ addEventListener() {} });
const pad = (index = 0, id = 'Xbox Wireless Controller', mapping = 'standard') => ({
  index, id, connected: true, mapping, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
});
const press = (p, i, value = 1) => { p.buttons[i] = { value, pressed: value > 0.5 }; };

test('selects a standard Xbox controller, ignoring XR and disconnected devices', () => {
  const xbox = pad(2), xr = pad(0, 'Quest', 'xr-standard'), disconnected = pad(1);
  disconnected.connected = false;
  assert.equal(standardGamepad([xr, null, disconnected, xbox]), xbox);
  assert.equal(standardGamepad([xr, disconnected]), null);
});

test('deadzone removes drift and retains the full analog range', () => {
  assert.equal(deadzone(0.12), 0); assert.equal(deadzone(-0.08), 0);
  assert.equal(deadzone(1), 1); assert.equal(deadzone(-1), -1);
  assert.ok(Math.abs(deadzone(0.56) - 0.5) < 1e-9);
});

test('Xbox sticks and triggers preserve analog controls', () => {
  const p = pad(); pads = [p]; p.axes = [0.56, -1, -0.56, 0];
  press(p, 7, 0.73); press(p, 6, 0.24);
  const state = makeInput().read(1 / 60);
  assert.ok(Math.abs(state.roll - 0.5) < 1e-9);
  assert.equal(state.pitch, -1); assert.ok(Math.abs(state.yaw + 0.5) < 1e-9);
  assert.equal(state.throttleUp, 0.73); assert.equal(state.throttleDown, 0.24);
});

test('Menu and View never restart the race', () => {
  const p = pad(); pads = [p]; press(p, 8); press(p, 9);
  assert.equal(makeInput().read(1 / 60).reset, false);
});

test('VR left stick gives direct analog thrust and steering; right stick pitches', () => {
  const p = pad(); pads = [p]; const input = makeInput(); input.xr = true;
  p.axes = [0.56, -0.56, 0, 1];
  const state = input.read(1 / 60);
  assert.ok(Math.abs(state.throttleAxis - 0.5) < 1e-9);
  assert.ok(Math.abs(state.roll - 0.5) < 1e-9);
  assert.equal(state.pitch, 1);
  p.axes = [0, 0, 0, 0];
  assert.equal(input.read(1 / 60).throttleAxis, 0);
  p.axes[1] = 1;
  assert.equal(input.read(1 / 60).throttleDown, 1);
});

test('VR triggers and keyboard remain available alongside stick thrust', () => {
  const p = pad(); pads = [p]; const input = makeInput(); input.xr = true;
  press(p, 7, 0.8); press(p, 6, 0.4);
  let state = input.read(1 / 60);
  assert.equal(state.throttleAxis, 0.8); assert.equal(state.throttleDown, 0.4);
  input.keys.add('KeyW'); state = input.read(1 / 60);
  assert.equal(state.throttleAxis, null); assert.equal(state.throttleUp, 1);
});

test('VR Y toggles the HUD once per press without changing engines; A is separate boost', () => {
  const p = pad(); pads = [p]; const input = makeInput(); input.xr = true;
  press(p, 3); press(p, 0);
  let state = input.read(1 / 60);
  assert.equal(state.hudToggle, true); assert.equal(state.engine, false);
  assert.equal(state.boost, true); assert.equal(state.throttleAxis, 0);
  assert.equal(input.read(1 / 60).hudToggle, false);
  press(p, 3, 0); press(p, 0, 0); input.read(1 / 60);
  press(p, 3); p.axes[1] = -0.56; state = input.read(1 / 60);
  assert.equal(state.hudToggle, true); assert.equal(state.boost, false);
  assert.ok(Math.abs(state.throttleAxis - 0.5) < 1e-9);
});

test('keyboard Y toggles the VR HUD while E remains the engine key', () => {
  pads = []; const input = makeInput(); input.xr = true;
  input.pressed.add('KeyY'); input.pressed.add('KeyE');
  const state = input.read(1 / 60);
  assert.equal(state.hudToggle, true); assert.equal(state.engine, true);
  assert.equal(input.read(1 / 60).hudToggle, false);
  input.xr = false; input.pressed.add('KeyY');
  assert.equal(input.read(1 / 60).hudToggle, false);
});

test('X slams once per press; Y starts engines; A boosts; B changes view', () => {
  const p = pad(); pads = [p]; const input = makeInput();
  for (const i of [0, 1, 2, 3]) press(p, i);
  const first = input.read(1 / 60), held = input.read(1 / 60);
  assert.equal(first.boost, true); assert.equal(first.camera, true);
  assert.equal(first.engine, true); assert.equal(first.slam, true);
  assert.equal(held.boost, true); assert.equal(held.camera, false);
  assert.equal(held.engine, false); assert.equal(held.slam, false);
  press(p, 2, 0); input.read(1 / 60); press(p, 2);
  assert.equal(input.read(1 / 60).slam, true);
});

test('stick clicks recover and recenter without slamming', () => {
  const p = pad(); pads = [p]; press(p, 10); press(p, 11);
  const state = makeInput().read(1 / 60);
  assert.equal(state.respawn, true); assert.equal(state.recenter, true); assert.equal(state.slam, false);
});

test('disconnect releases controls and reconnect restores button edges', () => {
  const p = pad(); pads = [p]; const input = makeInput(); press(p, 3); press(p, 7);
  assert.equal(input.read(1 / 60).engine, true);
  pads = []; const disconnected = input.read(1 / 60);
  assert.equal(disconnected.engine, false); assert.equal(disconnected.throttleUp, 0);
  pads = [p]; assert.equal(input.read(1 / 60).engine, true);
});

test('switching controllers resets one-shot button history', () => {
  const a = pad(), b = pad(1, 'Xbox Elite'); const input = makeInput();
  press(a, 3); press(b, 3); pads = [a]; input.read(1 / 60);
  pads = [b]; assert.equal(input.read(1 / 60).engine, true);
});

test('bumpers fire an airbrake once until released and recharged', () => {
  const p = pad(); pads = [p]; const input = makeInput(); press(p, 4);
  assert.equal(input.read(0).airL, 1);
  assert.equal(input.read(1.01).airL, 0);
  assert.equal(input.read(4).airL, 0);
  press(p, 4, 0); input.read(0); press(p, 4);
  assert.equal(input.read(0).airL, 1);
});

test('keyboard controls remain available without a controller', () => {
  pads = []; const input = makeInput(); input.keys.add('KeyW'); input.keys.add('KeyD'); input.pressed.add('KeyU');
  const state = input.read(1 / 60);
  assert.equal(state.throttleUp, 1); assert.equal(state.yaw, 1); assert.equal(state.recenter, true);
  assert.equal(input.read(1 / 60).recenter, false);
});
