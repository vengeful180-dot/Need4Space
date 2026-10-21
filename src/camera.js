// Camera rig: chase, far chase, canopy, cinematic fly-by and a free orbit for looking at the ship.
import * as THREE from 'three';
import { clamp, damp, smoothstep, noise2 } from './noise.js';

export const MODES = ['chase', 'far', 'canopy', 'cinematic', 'orbit'];
const NAMES = { chase: 'Chase', far: 'Far chase', canopy: 'Canopy', cinematic: 'Fly-by', orbit: 'Orbit (drag / wheel)' };

export class CameraRig {
  constructor(camera, terrain) {
    this.cam = camera;
    this.terrain = terrain;
    this.mode = 'orbit';
    this.q = new THREE.Quaternion();
    this.orbit = { yaw: 2.35, pitch: 0.2, dist: 24 };
    this.anchor = null;
    this.shake = 0;
    this.thud = 0; this.thudV = 0; this.thudSide = 1;    // a heavy knock (main.js): a dip and roll toward it
    this.t = 0;
    this.idle = 0;
    this.rollFollow = 0.6;        // 1 on the track: the camera rolls with the deck through banks and the corkscrew
    this.anchorFn = null;         // on the track: plants the fly-by camera beside the circuit ahead (not through a crest)
  }

  get name() { return NAMES[this.mode]; }

  next() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.anchor = null;
  }

  snap(flight) { this.q.copy(flight.camQ || flight.q); this.anchor = null; }

  // the fly-by's next shot: any kind but the last one
  newShot(pos, fwd, up, speed) {
    const kinds = ['fly', 'drone', 'orbit', 'front'].filter((x) => x !== this.shot?.kind);
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const S = { kind, t: 0, len: 4.5 + Math.random() * 3, side: Math.random() < 0.5 ? -1 : 1, h: Math.random(), a0: Math.random() * 6.28, past: 0 };
    if (kind === 'fly') {
      const lead = clamp(speed * 3, 40, 450);                          // the ship arrives in ~2-3 s
      const side = new THREE.Vector3().crossVectors(fwd, up).normalize();
      if (side.lengthSq() < 0.1) side.set(1, 0, 0);
      S.at = this.anchorFn ? this.anchorFn(lead) : pos.clone().addScaledVector(fwd, lead)
        .addScaledVector(side, S.side * (28 + speed * 0.12)).addScaledVector(up, 3 + Math.random() * 8);
      S.len = 9;
    }
    this.shot = S;
    this.anchor = S.at || pos.clone();
  }

  update(dt, flight, inp, boost) {
    this.t += dt;
    const cam = this.cam, pos = flight.pos, speed = flight.speed;
    const fwd = flight.forward, up = flight.up;
    // on the track the chase camera follows the deck and the heading, not the ship's lean
    // (through a loop or a roll the deck turns at 3+ rad/s: a 5/s follow lagged 35 deg and swung the camera under
    // the deck)
    this.q.slerp(flight.camQ || flight.q, damp(this.mode === 'canopy' ? 30 : 5 + 7 * Math.min(4, flight.camRate || 0), dt));
    const cq = this.q;
    let fov = 60;
    const lookAt = new THREE.Vector3();
    const camUp = new THREE.Vector3(0, 1, 0);
    if (this.mode === 'chase' || this.mode === 'far') {
      const far = this.mode === 'far';
      // in a hard corner the camera swings a little to the outside (latS: the racer's lateral acceleration)
      this.swing = (this.swing || 0) + (clamp(-(flight.latS || 0) * 0.025, -1.6, 1.6) - (this.swing || 0)) * damp(3, dt);
      // camera inertia: it lags back as the ship accelerates and closes in as it brakes
      this.lag = (this.lag || 0) + (clamp((flight.accS || 0) / 50, -1, 1) - (this.lag || 0)) * damp(3, dt);
      const off = new THREE.Vector3(this.swing, (far ? 6.5 : 3.6) + Math.min(0, this.lag) * -0.4,
        (far ? 30 : 17) + Math.min(speed, 340) * 0.018 + boost * 2.5 + this.lag * 1.8 + 7 * (this.hyper || 0)).applyQuaternion(cq);   // (hyper: the hyper boost falls back 7 m - main.js)
      cam.position.copy(pos).add(off);
      lookAt.copy(pos).add(new THREE.Vector3(0, far ? 1.0 : 1.6, -30).applyQuaternion(cq));
      camUp.lerp(new THREE.Vector3(0, 1, 0).applyQuaternion(cq), this.rollFollow).normalize();
      fov = 60 + 18 * smoothstep(40, 340, speed) + 6 * boost + 10 * (this.kick || 0) - 13 * (this.punch || 0) - 5 * (flight.brakeS || 0) * (1 - (flight.driftS || 0))
        + 4 * (flight.driftS || 0);
    } else if (this.mode === 'canopy') {
      cam.position.copy(pos).add(new THREE.Vector3(0, 2.25, 3.2).applyQuaternion(cq));
      lookAt.copy(cam.position).add(new THREE.Vector3(0, -0.07, -1).applyQuaternion(cq));
      camUp.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(cq));
      fov = 68 + 10 * smoothstep(30, 200, speed);
    } else if (this.mode === 'cinematic') {
      // A TV director: a shot every 4.5-7.5 s, never the same kind twice running - a telephoto fly-by planted beside
      // the circuit ahead, a drone following above, a slow orbit, a camera flying ahead looking back. (The fly-by
      // used to be re-planted as soon as the ship was 60 m past it: at race speed a new, identical shot every ~1.3 s -
      // "switches cadres continuously, way too fast".) anchor = null (snap, a mode change) starts a new shot.
      if (!this.anchor || !this.shot) this.newShot(pos, fwd, up, speed);
      const S = this.shot;
      S.t += dt;
      if (S.kind === 'fly') {
        const rel = pos.clone().sub(S.at);
        if (rel.dot(fwd) > 0) S.past += dt;
        if (S.past > 2.2 || rel.length() > 1200) S.t = S.len;            // gone by (or took another way)
      }
      if (S.t >= S.len) { this.newShot(pos, fwd, up, speed); }
      const T = this.shot, k = T.t;
      if (T.kind === 'fly') {
        T.at.y = Math.max(T.at.y, this.terrain.surface(T.at.x, T.at.z) + 2);
        cam.position.copy(T.at);
        lookAt.copy(pos);
        fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(10 / cam.position.distanceTo(pos))), 6, 60);
      } else {
        let off;
        if (T.kind === 'drone') off = new THREE.Vector3(T.side * (12 + 5 * Math.sin(k * 0.35)), 8 + 4 * T.h, 30 - k * 1.5);
        else if (T.kind === 'orbit') { const a = T.a0 + T.side * k * 0.38; off = new THREE.Vector3(Math.sin(a) * 24, 7.5 + 4 * T.h, Math.cos(a) * 24); }
        else off = new THREE.Vector3(T.side * (3 + 3 * T.h), 7 + 2 * T.h, -26 - k * 0.8);   // ahead, looking back
        cam.position.copy(pos).add(off.applyQuaternion(cq));
        lookAt.copy(pos).addScaledVector(fwd, T.kind === 'drone' ? 12 : 0);
        fov = T.kind === 'orbit' ? 48 : 52;
      }
      camUp.copy(this.rollFollow > 0.9 ? up : new THREE.Vector3(0, 1, 0));
    } else {
      // orbit: drag to turn, wheel to zoom; drifts round slowly when left alone and the ship is parked
      const o = this.orbit;
      if (inp.drag.dx || inp.drag.dy || inp.drag.wheel) this.idle = 0; else this.idle += dt;
      o.yaw -= inp.drag.dx * 0.005;
      o.pitch = clamp(o.pitch + inp.drag.dy * 0.004, -0.15, 1.35);
      o.dist = clamp(o.dist * Math.pow(1.12, inp.drag.wheel), 9, 90);
      if (this.idle > 4 && speed < 1) o.yaw += dt * 0.08;
      const head = Math.atan2(-fwd.x, -fwd.z);
      const a = head + o.yaw;
      cam.position.set(pos.x + Math.sin(a) * Math.cos(o.pitch) * o.dist, pos.y + Math.sin(o.pitch) * o.dist + 0.5,
        pos.z + Math.cos(a) * Math.cos(o.pitch) * o.dist);
      lookAt.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
      camUp.copy(this.rollFollow > 0.9 ? up : new THREE.Vector3(0, 1, 0));
      fov = 45;
    }
    // the slam camera (main.js: a slam the player is in, in slow motion - slamW its share): up and out to the side away
    // from the other hull, looking down across the two - the dash, the blow, the other thrown into the wall. (Thrown
    // yourself: higher and further back, clear of the wall you are flying at.)
    const w = this.slamW || 0;
    if (w > 0 && this.slamAt && (this.mode === 'chase' || this.mode === 'far')) {
      const side = this.slamSide || 1, mine = this.slamMine;
      const P = pos.clone().add(new THREE.Vector3(-side * (mine ? 6 : 3), mine ? 7.5 : 9, mine ? 17 : 19).applyQuaternion(cq));
      cam.position.lerp(P, w);
      lookAt.lerp(pos.clone().lerp(this.slamAt, 0.5).add(new THREE.Vector3(0, 0, -4).applyQuaternion(cq)), w);
      fov += (56 - fov) * w;
    }
    // never under the ground, never inside the track; on the circuit never under the deck behind the ship
    if (this.deckFn && (this.mode === 'chase' || this.mode === 'far')) this.deckFn(cam.position);
    const g = this.terrain.surface(cam.position.x, cam.position.z) + 0.6;
    if (cam.position.y < g) cam.position.y = g;
    if (this.terrain.clearance && (this.mode === 'cinematic' || this.mode === 'orbit')) this.terrain.clearance(cam.position);
    // shake: impacts, boost, scraping - smooth noise, never a strobe
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.punch = Math.max(0, (this.punch || 0) - dt * 3);    // an attack landing: a zoom punch (main.js)
    const amp = this.shake * 0.35 + boost * 0.04 * smoothstep(80, 200, speed) + flight.scrape * 0.12;
    // a heavy knock: a slow damped swing - the camera dips and leans toward the wall, then settles
    this.thudV += (-26 * this.thud - 2 * 0.45 * Math.sqrt(26) * this.thudV) * dt;
    this.thud += this.thudV * dt;
    if (Math.abs(this.thud) > 1e-4 && this.mode !== 'orbit') {
      const r = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      cam.position.addScaledVector(camUp, -0.35 * this.thud).addScaledVector(r, this.thudSide * 0.25 * this.thud);
      camUp.applyAxisAngle(new THREE.Vector3().subVectors(lookAt, cam.position).normalize(), -this.thudSide * 0.045 * this.thud);
    }
    if (amp > 0 && this.mode !== 'orbit') {
      const t = this.t * 9;
      cam.position.x += (noise2(t, 1.3) - 0.5) * amp;
      cam.position.y += (noise2(t, 7.9) - 0.5) * amp;
      cam.position.z += (noise2(t, 4.1) - 0.5) * amp;
    }
    cam.up.copy(camUp);
    cam.lookAt(lookAt);
    cam.fov += (fov - cam.fov) * damp(4, dt);
    cam.updateProjectionMatrix();
  }
}
