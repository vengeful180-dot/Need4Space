// Online races (net.js carries them): rooms of up to eight players, no rivals - only the players race. Each player flies
// their own ship on their own screen and sends where it is 30 times a second; the others' ships are drawn where those
// states say they are now (carried on along the track by their speed, a fresh state eased in - never a jump). The
// room's clock (the host's) sets the lights and the race time on every screen.
//
// What one player's ship does to another's (a slam, a block, a knock) is worked out on both screens, each applying it
// to its own ship: the other ship here is only where its owner says it is, so whatever is done to it here is undone by
// its next state. A slam's dash and a block are sent the moment they are pressed, so the other screens play them too.
import { Lobby, NetHost, NetGuest } from './net.js';
import { Ship } from './ship.js';
import { TrackRacer, PERKS, ATTACK } from './track.js';
import { HANDLING, LIVERIES } from './ships.js';
import { Q } from './quality.js';
import { clamp } from './noise.js';

// each player's colour (by the id the host gives them; the host's first): the minimap's dots, the standings, the room
export const COLOURS = ['#ff5a3c', '#3a8cff', '#f2b528', '#35c255', '#c45cff', '#30d0f0', '#f24c94', '#e8e8e8'];
const N = 26;                         // floats in a state
const HZ = 30;                        // states sent a second
const JOIN = 'n4s-mp-join';           // (sessionStorage: the room to join once the page has reloaded into its circuit)
const PILOT = 'need4space.pilot.v1';  // (the racing name: shared with the scoreboard)
const CID = 'n4s-mp-cid';             // (this browser's own random id: a player the host removed stays out of that room)
const TAB = 'n4s-tab';                // (sessionStorage: this tab's anonymous id for the lobby's count of games online)
// a chat line: one line, no control characters, 120 characters at most
export const cleanText = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
export const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24);

// where a ship is at the room's time `now`, by its state S: carried on along the track and across it at its speeds
// (a little way only: a state gone quiet holds where it was, 0.3 s on)
const ahead = { s: 0, x: 0, y: 0, psi: 0 };
function predict(S, now, lim, tr, out = ahead) {
  const a = clamp(now - S.t, 0, 0.3), b = Math.min(a, 0.1);
  out.s = tr.wrap(S.s + S.vs * a);
  out.x = clamp(S.x + S.vx * a, -lim, lim);
  out.y = Math.max(0, S.y + S.vy * b);
  out.psi = S.psi + S.yawRate * b;
  return out;
}

export class Multiplayer {
  // h: { race, scene, renderer, map, me() -> { kind, livery }, loadKind(kind) -> Promise<Ship>, prepare() -> Promise,
  //      begin(), end(why), change() }
  constructor(h) {
    this.h = h;
    this.race = h.race;
    this.lobby = new Lobby();
    this.state = 'off';               // 'off' | 'room' | 'race'
    this.net = null;
    this.players = new Map();         // id -> { id, name, kind, livery, ready, ping, host }
    this.entries = new Map();         // id -> the race entry of another player
    this.building = new Map();        // id -> its ship being made
    this.pool = [];                   // ships made for players who have left: kept for the next with that ship and paint
    this.buf = new Float32Array(N);
    this.seq = 0;
    this.raceN = 0;
    this.goAt = null;
    this.message = '';
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(PILOT)); } catch { /* storage blocked */ }
    this.myName = cleanName(stored?.name);
    try { this.cid = localStorage.getItem(CID) || (localStorage.setItem(CID, crypto.randomUUID()), localStorage.getItem(CID)); } catch { /* storage blocked */ }
    this.cid ||= crypto.randomUUID();
    this.cids = new Map();            // (the host: each player's browser id - never sent on to the others)
    this.banned = new Set();
    this.chat = [];                   // the room's chat, the last 60 lines: { id, name, css, text, sys, me }
  }

  get active() { return this.state !== 'off'; }
  get live() { return this.state === 'race'; }
  get role() { return this.net?.role || null; }
  get host() { return this.role === 'host'; }
  now() { return this.net ? this.net.now() : performance.now() / 1000; }

  get name() { return this.myName || 'Pilot'; }
  set name(v) {
    this.myName = cleanName(v);
    try { const p = JSON.parse(localStorage.getItem(PILOT)) || {}; p.name = this.myName; localStorage.setItem(PILOT, JSON.stringify(p)); } catch { /* storage blocked */ }
  }

  change() { this.h.change?.(); }

  // ---------------------------------------------------------------- who is online (the title's Multiplayer item)
  // Every 30 s while the page is open (Settings: Players online - h.countOn): this tab's heartbeat to the lobby, an
  // anonymous random id kept for the tab (a reload into a room's circuit is still the same game - and a different id
  // from the browser's own, CID), answered with the games online, the rooms open and the players in them. A lobby
  // without it yet (404): the rooms' own list - rooms and players, no online count. this.count: { online (null: not
  // known), rooms, players }, null while off or not heard yet; h.counted() after each.
  // this tab's anonymous id for the lobby (the count, the global chat's gap between lines): made once, kept for the tab
  get tabId() {
    if (this.tab) return this.tab;
    try { this.tab = sessionStorage.getItem(TAB); } catch { /* storage blocked */ }
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(this.tab || '')) {
      this.tab = 'tab-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      try { sessionStorage.setItem(TAB, this.tab); } catch { /* storage blocked */ }
    }
    return this.tab;
  }

  watchCount() {
    if (this.countT) return;
    const tick = async () => {
      if (this.h.countOn?.() === false) { if (this.count) { this.count = null; this.h.counted?.(); } return; }
      try {
        let c = null;
        if (this.presence !== false) {
          try { c = await this.lobby.presence(this.tabId); this.presence = true; } catch (e) { if (e.status === 404) this.presence = false; else throw e; }
        }
        if (!c) { const r = await this.lobby.rooms(); c = { online: null, rooms: r.rooms.length, players: r.rooms.reduce((n, x) => n + (x.players | 0), 0) }; }
        this.count = { online: Number.isFinite(c.online) ? c.online : null, rooms: c.rooms | 0, players: c.players | 0 };
        this.h.counted?.();
      } catch { /* (offline, the lobby away: the last count kept) */ }
    };
    this.countT = setInterval(tick, 30000);
    tick();
  }
  // the Multiplayer screen's own list (rooms.js, every 5 s while it shows): the count's rooms kept as fresh
  noteRooms(rooms) {
    if (!this.count || !Array.isArray(rooms)) return;
    Object.assign(this.count, { rooms: rooms.length, players: rooms.reduce((n, x) => n + (x.players | 0), 0) });
    this.h.counted?.();
  }

  // ---------------------------------------------------------------- the room
  rooms() { return this.lobby.rooms(); }

  async create() {
    if (this.active) return;
    const me = this.h.me();
    this.net = new NetHost(this.lobby, {
      join: (id, hello) => this.joined(id, hello),
      allow: (hello) => (this.banned.has(String(hello.cid)) ? 'The host removed you from this room.' : null),
      leave: (id) => this.left(id),
      msg: (id, m) => this.hostMsg(id, m),
      state: (id, buf) => this.recvState(buf, id),
      lost: (why) => this.leave(why),
    });
    try {
      const id = await this.net.open({ name: `${this.name}'s room`, map: this.h.map, max: 8, host: this.name });
      this.room = { id, name: `${this.name}'s room`, map: this.h.map, max: 8 };
    } catch (e) { this.net = null; throw e; }
    this.myId = 0;
    this.players.clear();
    this.cids.clear();
    this.chat = [];
    this.banned = new Set();
    this.players.set(0, { id: 0, name: this.name, kind: me.kind, livery: me.livery, ready: true, ping: 0, host: true });
    this.state = 'room';
    this.message = 'Waiting for players';
    this.pingT = setInterval(() => this.sharePlayers(), 2000);
    this.change();
  }

  // a room on another circuit: the page reloads into that circuit, then joins (pending())
  async join(room, status) {
    if (this.active) return null;
    if (room.map !== this.h.map) {
      try { sessionStorage.setItem(JOIN, JSON.stringify({ room, at: Date.now() })); } catch { /* storage blocked */ }
      return 'reload';
    }
    const me = this.h.me();
    this.net = new NetGuest(this.lobby, {
      msg: (m) => this.guestMsg(m),
      state: (buf) => this.recvState(buf),
      lost: (why) => this.leave(why),
    });
    try {
      const w = await this.net.join(room, { name: this.name, kind: me.kind, livery: me.livery, cid: this.cid }, status);
      this.myId = w.id;
      this.chat = [];
      this.room = { ...room, ...(w.room || {}) };
      this.state = 'room';
      this.message = 'In the room';
      this.roster(w.players || []);
    } catch (e) { this.net?.close(); this.net = null; throw e; }
    this.change();
    return 'joined';
  }

  // the room the page reloaded to join (fresh: under three minutes old; once)
  pending() {
    let p = null;
    try { p = JSON.parse(sessionStorage.getItem(JOIN)); sessionStorage.removeItem(JOIN); } catch { /* storage blocked */ }
    return p && p.room?.map === this.h.map && Date.now() - p.at < 180000 ? p.room : null;
  }

  // out of the room (and the race): the rivals' grid back, the other players' ships put away
  leave(why = '') {
    if (!this.active && !this.net) return;
    const wasLive = this.live;
    clearInterval(this.pingT);
    this.net?.close();
    this.net = null;
    this.state = 'off';
    this.goAt = null;
    for (const id of [...this.entries.keys()]) this.drop(id);
    this.players.clear();
    this.building.clear();
    this.chat = [];
    this.h.chatClear?.();
    const race = this.race, P = race.player;
    race.mp = null;
    race.useEntries(null);
    if (this.own) { P.team = this.own.team; delete P.id; P.racer.perks = this.own.perks; this.own = null; }
    race.setDifficulty(race.level);
    this.message = why;
    this.h.end(why, wasLive);
    this.change();
  }

  // ---------------------------------------------------------------- host side
  joined(id, hello) {
    const kind = HANDLING[hello.kind] ? hello.kind : 'feather', L = LIVERIES[kind];
    const livery = L && L.names.includes(hello.livery) ? hello.livery : L?.names[0];
    this.players.set(id, { id, name: cleanName(hello.name) || `Pilot ${id + 1}`, kind, livery, ready: false, ping: null, host: false });
    this.cids.set(id, String(hello.cid || ''));
    this.note(`${this.players.get(id).name} joined`);
    this.net.send(id, { t: 'welcome', id, room: this.room, players: this.list() });
    this.sharePlayers();
    this.build();
  }

  left(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    this.cids.delete(id);
    this.drop(id);
    if (p) this.note(p.kicked ? `${p.name} was removed from the room` : `${p.name} left`);
    this.sharePlayers();
    this.check();
  }

  list() { return [...this.players.values()].map(({ kicked, chatAt, ...p }) => p); }

  // the host removes a player: told why, the connection closed, and that browser kept out of the room while it lasts
  kick(id) {
    const p = this.players.get(id);
    if (!this.host || !p || p.host || p.kicked) return false;
    p.kicked = true;
    const cid = this.cids.get(id);
    if (cid) this.banned.add(cid);
    this.net.send(id, { t: 'bye', why: 'The host removed you from the room.' });
    setTimeout(() => this.net?.kick(id), 300);         // (the message out first)
    this.note(`${p.name} was removed from the room`);
    this.change();
    return true;
  }

  // the players and their pings, to everyone (every 2 s, and on any change)
  sharePlayers() {
    if (!this.host || !this.net) return;
    for (const [id, p] of this.players) if (id) p.ping = this.net.rtt(id);
    this.net.broadcast({ t: 'players', list: this.list(), state: this.state });
    this.change();
  }

  hostMsg(id, m) {
    const p = this.players.get(id);
    if (!p) return;
    if (m.t === 'ready') { p.ready = !!m.ready; this.sharePlayers(); return; }
    if (m.t === 'chat') {                              // (passed on to the others, a flood dropped)
      const text = cleanText(m.text), now = performance.now();
      if (!text || now - (p.chatAt || 0) < 400) return;
      p.chatAt = now;
      this.net.broadcast({ t: 'chat', by: id, text }, id);
      this.heard(id, text);
      return;
    }
    if (m.t === 'ev' || m.t === 'fin') {
      const out = { ...m, by: id };                 // (who sent it: the host says, not the sender)
      this.net.broadcast(out, id);
      this.apply(out);
    }
  }

  // Start (the host): every player's ships made, two players at least; the grid shuffled; the lights in 6 s
  canStart() {
    return this.host && this.state === 'room' && this.players.size >= 2 && [...this.players.values()].every((p) => p.ready);
  }

  start() {
    if (!this.canStart()) return false;
    const ids = [...this.players.keys()];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const m = { t: 'start', n: this.raceN + 1, goAt: this.now() + 6, slots: Object.fromEntries(ids.map((id, k) => [id, k])) };
    this.net.broadcast(m);
    this.net.setState('racing');
    this.begin(m);
    return true;
  }

  // ---------------------------------------------------------------- guest side
  guestMsg(m) {
    if (m.t === 'players') { this.roster(m.list || []); if (this.state === 'room' && m.state === 'racing') this.message = 'A race is on - you join the next one'; return; }
    if (m.t === 'start') { if (this.state === 'room') this.begin(m); return; }
    if (m.t === 'chat') { const text = cleanText(m.text); if (text && Number.isInteger(m.by) && m.by !== this.myId) this.heard(m.by, text); return; }
    if (m.t === 'ev' || m.t === 'fin') this.apply(m);
  }

  // the room's players as the host has them: a ship for each one new, put away for each one gone
  roster(list) {
    const seen = new Set();
    for (const q of list) {
      if (!Number.isInteger(q.id)) continue;
      seen.add(q.id);
      const kind = HANDLING[q.kind] ? q.kind : 'feather', was = this.players.get(q.id);
      if (was && (was.kind !== kind || was.livery !== q.livery)) this.drop(q.id);
      if (!was && this.players.size && q.id !== this.myId) this.note(`${cleanName(q.name)} joined`);
      this.players.set(q.id, { id: q.id, name: cleanName(q.name) || `Pilot ${q.id + 1}`, kind, livery: q.livery, ready: !!q.ready, ping: q.ping ?? null, host: !!q.host });
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) { this.note(`${this.players.get(id).name} left`); this.players.delete(id); this.drop(id); }
    this.build();
    this.change();
  }

  note(text) { this.message = text; this.noteAt = performance.now(); this.heard(-1, text, true); }

  // ---------------------------------------------------------------- chat
  // a line from the player: out to the room (the host passes it on), shown here at once; one every 0.6 s at most
  say(text) {
    text = cleanText(text);
    const now = performance.now();
    if (!text || !this.net || !this.active || now - (this.saidAt || 0) < 600) return false;
    this.saidAt = now;
    if (this.host) this.net.broadcast({ t: 'chat', by: 0, text }); else this.net.send({ t: 'chat', text });
    this.heard(this.myId, text);
    return true;
  }

  // a line said in the room (sys: a join, a leave - no name)
  heard(id, text, sys = false) {
    const p = this.players.get(id);
    const m = { id, name: sys ? '' : p?.name || `Pilot ${id + 1}`, css: COLOURS[Math.max(0, id) % COLOURS.length], text, sys, me: id === this.myId && !sys };
    this.chat.push(m);
    if (this.chat.length > 60) this.chat.shift();
    this.h.chat?.(m);
  }

  // ---------------------------------------------------------------- the other players' ships
  // made for every player in the room not made yet (their ship loaded first if this page has none of that kind), then
  // the shaders warmed as at loading (no compile in the race); ready once done - the host can start when all are
  build() {
    const jobs = [];
    for (const [id, p] of this.players) {
      if (id === this.myId || this.entries.has(id) || this.building.has(id)) continue;
      const job = this.makeEntry(p).then((e) => {
        this.building.delete(id);
        if (this.players.get(id) === p && this.active) this.entries.set(id, e);
        else this.stow(e.ship);
      }, () => this.building.delete(id));
      this.building.set(id, job);
      jobs.push(job);
    }
    if (!jobs.length) { this.check(); return; }
    this.setReady(false);
    Promise.allSettled(jobs).then(() => (this.building.size ? null : this.h.prepare())).then(() => this.check());
  }

  check() { if (!this.building.size) this.setReady([...this.players.keys()].every((id) => id === this.myId || this.entries.has(id))); }

  setReady(ready) {
    const me = this.players.get(this.myId);
    if (me) me.ready = ready;
    if (this.ready === ready) return;
    this.ready = ready;
    if (this.host) this.sharePlayers(); else this.net?.send({ t: 'ready', ready });
    this.change();
  }

  async makeEntry(p) {
    const race = this.race, src = race.sources[p.kind] || await this.h.loadKind(p.kind);
    let ship = this.pool.find((s) => s.kind === p.kind && s.livery === p.livery);
    if (ship) this.pool.splice(this.pool.indexOf(ship), 1);
    else {
      ship = new Ship(null, { cloneOf: src, lights: false });
      ship.kind = p.kind;
      const L = LIVERIES[p.kind];
      if (L) ship.livery = L.names.includes(p.livery) ? p.livery : L.names[0];
      // (made after the start: the lite shaders' clearcoat as the settings have it now)
      ship.root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.userData.clearcoat != null) m.clearcoat = Q.lite ? 0 : m.userData.clearcoat; });
      ship.ensureTrails(this.h.scene);
      await ship.preloadLivery(this.h.renderer);
      this.h.made?.(ship);
    }
    this.h.scene.add(ship.root);
    ship.root.visible = false;                            // (shown once it is on a grid: Race.useEntries)
    const racer = new TrackRacer(ship, race.track);
    racer.handling = HANDLING[p.kind] || HANDLING.feather;
    if (ship.umbra && this.h.wave) ship.onWave = (at, k) => this.h.wave(at, racer.vel, k);
    const e = { ship, racer, team: { name: p.name, css: COLOURS[p.id % COLOURS.length], engine: ship.engineColor.toArray() }, player: false, remote: true,
      kind: p.kind, id: p.id, slot: p.id, home: p.id, net: { last: null, prev: null, err: { s: 0, x: 0, y: 0, psi: 0 }, fresh: false } };
    racer.onEvent = (ev) => race.onRacerEvent(e, ev);
    return e;
  }

  // a ship put away (its player gone): out of the scene with its trails, kept for reuse
  stow(ship) {
    ship.setEngine(false);
    ship.clearTrails();
    ship.root.removeFromParent();
    this.pool.push(ship);
  }

  drop(id) {
    const e = this.entries.get(id);
    if (!e) return;
    this.entries.delete(id);
    if (this.race.entries.includes(e)) this.race.useEntries(this.race.entries.filter((o) => o !== e));
    this.stow(e.ship);
  }

  // ---------------------------------------------------------------- the race
  // the host's start: the grid as it says, the player's own entry named and coloured, the lights at goAt
  begin(m) {
    const race = this.race, P = race.player;
    this.raceN = m.n;
    this.goAt = m.goAt;
    this.finSent = false;
    if (!this.own) this.own = { team: P.team, perks: P.racer.perks };
    P.id = this.myId;
    P.team = { ...this.own.team, name: this.name, css: COLOURS[this.myId % COLOURS.length] };
    P.racer.perks = PERKS.normal;                        // (the same help for everyone: Normal's)
    const list = [P];
    for (const [id, slot] of Object.entries(m.slots || {})) {
      const e = +id === this.myId ? P : this.entries.get(+id);
      if (!e) continue;
      e.slot = slot;
      if (e !== P) { list.push(e); Object.assign(e.net, { last: null, prev: null, fresh: false }); Object.assign(e.net.err, { s: 0, x: 0, y: 0, psi: 0 }); }
    }
    race.mp = this;
    race.useEntries(list);
    if (this.h.world?.wakeShips) this.h.world.wakeShips.length = list.length;   // (the ice's and desert's wakes, by entry)
    this.state = 'race';
    this.sendAt = 0;
    this.h.begin();                                       // (the menu away, race.reset onto the grid, the engines on)
    this.change();
  }

  // Race.step: the lights and the race time by the room's clock - and the clock the others' ships are drawn by (stepT)
  clock(race, dt = 0) {
    this.stepClock(dt);
    if (this.goAt == null) return;
    const now = this.now();
    if (race.state === 'grid' && now >= this.goAt - 3) { race.state = 'countdown'; race.count = 3; }
    if (race.state === 'countdown') {
      race.count = this.goAt - now;
      if (race.count <= 0) { race.state = 'racing'; race.time = now - this.goAt; race.events.push({ type: 'go' }); }
    } else if (race.racing) race.time = Math.max(race.time, now - this.goAt);
  }

  // The room's time at each physics step, for the others' ships (drive). The steps of a frame run back to back at the
  // frame's moment: read off the room's clock, two steps in one frame put a ship in one place, and a frame with none
  // (past 120 fps) left it where it was - the others' ships stuttered (at any ping) while the player's own, stepped on
  // its own clock, ran smooth. So a clock of the steps: on by each step, eased toward the room's - its nudges from the
  // pings (4 ms at a time: 3 m at 3000 km/h) spread over about a second; taken at once if the two part by 0.25 s
  stepClock(dt) {
    const room = this.now();
    if (this.stepT == null || !(Math.abs(room - this.stepT) < 0.25)) this.stepT = room;
    else this.stepT += dt + (room - this.stepT) * Math.min(1, dt * 1.5);
    return this.stepT;
  }

  // Race.step, another player's ship: at its last state carried on to this step's moment; a fresh state's correction
  // eased out over ~0.1 s (a big one - a respawn, a wreck reset - taken at once)
  drive(e, dt) {
    const n = e.net, S = n.last, r = e.racer, tr = this.race.track;
    if (!S) return;                                      // (nothing heard yet: it waits in its grid slot)
    const now = this.stepT ?? this.now(), lim = tr.W / 2 - e.ship.halfSpan * 0.92, at = predict(S, now, lim, tr, n.at ||= {}), E = n.err;
    if (n.fresh) {
      n.fresh = false;
      if (n.prev) {
        const was = predict(n.prev, now, lim, tr, n.was ||= {});
        E.s += this.race.gap(was.s, at.s); E.x += was.x - at.x; E.y += was.y - at.y; E.psi += was.psi - at.psi;
        // (taken at once past 40 m - more at speed: on a speed circuit a few ms of the clocks' error is tens of metres)
        if (Math.abs(E.s) > 40 + 0.12 * Math.abs(S.vs) || Math.abs(E.x) > 20 || S.ghost > n.prev.ghost + 0.5) E.s = E.x = E.y = E.psi = 0;
      }
    }
    const k = Math.exp(-dt / 0.1);
    E.s *= k; E.x *= k; E.y *= k; E.psi *= k;
    r.s = tr.wrap(at.s + E.s); r.x = clamp(at.x + E.x, -lim, lim); r.y = Math.max(0, at.y + E.y); r.psi = at.psi + E.psi;
    const vs0 = r.vs;
    r.vs = S.vs; r.vx = S.vx; r.vy = S.vy; r.yawRate = S.yawRate;
    r.throttle = S.thr; r.boosting = S.boost; r.steerS = S.steer; r.airIn = S.air; r.brakeS = S.brake;
    r.health = S.hp; r.ghost = S.ghost; r.knocked = S.knocked; r.slip = S.slip;
    r.driftS = Math.abs(S.drift); r.drift = r.driftSide = Math.sign(S.drift);
    r.grind = S.grind ? 0.12 : 0; r.grindSide = S.grind;
    if (dt > 0) r.accS += ((r.vs - vs0) / dt - r.accS) * Math.min(1, dt * 6);
    r.latS = r.vs * r.yawRate;
    r.pose(dt);
    r.turn = clamp(Math.abs(r.steerS) * 0.8 + Math.abs((r.f.kh || 0) * r.vs) * 0.6, 0, 1.5);
    if (!e.finished) e.progress = S.progress + this.race.gap(r.s, S.s);
    if (S.engine !== e.ship.engineOn) e.ship.setEngine(S.engine);
  }

  // a state from the room: another player's ship (from the host: anyone's; the host checks the sender's id)
  recvState(buf, from = null) {
    if (this.state !== 'race' || !(buf instanceof ArrayBuffer) || buf.byteLength !== N * 4) return;
    const f = new Float32Array(buf);
    if (f[0] !== 1 || f[25] !== this.raceN || (from != null && f[1] !== from)) return;
    const e = this.entries.get(f[1]);
    if (!e || !this.race.entries.includes(e)) return;
    const n = e.net;
    if (n.last && f[3] <= n.last.t) return;               // (late: older than the one in hand)
    n.prev = n.last;
    n.last = { t: f[3], s: f[4], x: f[5], y: f[6], psi: f[7], vs: f[8], vx: f[9], vy: f[10], yawRate: f[11], thr: f[12], boost: f[13],
      steer: f[14], air: f[15], brake: f[16], hp: f[17], ghost: f[18], knocked: f[19], drift: f[20], slip: f[21], grind: f[22],
      progress: f[23], engine: !!(f[24] & 1) };
    n.fresh = true;
  }

  // the player's own ship, as the others need it
  pack() {
    const P = this.race.player, r = P.racer, b = this.buf;
    b[0] = 1; b[1] = this.myId; b[2] = ++this.seq % 16777216; b[3] = this.now();
    b[4] = r.s; b[5] = r.x; b[6] = r.y; b[7] = r.psi; b[8] = r.vs; b[9] = r.vx; b[10] = r.vy; b[11] = r.yawRate || 0;
    b[12] = r.throttle; b[13] = r.boosting; b[14] = r.steerS || 0; b[15] = r.airIn || 0; b[16] = r.brakeS || 0; b[17] = r.health;
    b[18] = r.ghost || 0; b[19] = r.knocked || 0; b[20] = (r.driftS || 0) * (r.drift || r.driftSide || 0); b[21] = r.slip || 0;
    b[22] = r.grind > 0 ? r.grindSide || 0 : 0; b[23] = P.progress; b[24] = (P.ship.engineOn ? 1 : 0) | (P.finished ? 2 : 0); b[25] = this.raceN;
    return b.buffer;
  }

  // what the player's ship did that the others' screens must play: sent to the host (who passes it on), or by the host
  // to all
  emit(m) {
    m = { t: 'ev', n: this.raceN, ...m };
    if (this.host) this.net.broadcast({ ...m, by: 0 }); else this.net.send(m);
  }

  // another player's move, or their finish
  apply(m) {
    if (this.state !== 'race' || m.n !== this.raceN) return;
    const race = this.race, A = this.entries.get(m.by);
    if (!A || !race.entries.includes(A)) return;
    if (m.t === 'fin') {
      A.finished = true;
      A.finishTime = +m.time;
      A.laps = Array.isArray(m.laps) ? m.laps.map(Number) : [];
      A.best = Number.isFinite(+m.best) ? +m.best : Infinity;
      A.progress = Math.max(A.progress, +m.progress || 0);
      this.h.finished?.();
      return;
    }
    const who = (id) => (id === this.myId ? race.player : this.entries.get(id));
    if (m.k === 'lunge') {
      // its dash here too (it lands here by itself, on contact or when the dash runs out - Race.attacks / collide), less
      // the time the word took to come; at the player: blockable, as a rival's
      const T = who(m.target);
      if (!T || T === A) return;
      const lag = ((this.players.get(m.by)?.ping || 0) + (this.players.get(this.myId)?.ping || 0)) / 2000;
      A.racer.lunge = { target: T, dir: Math.sign(m.dir) || 1, t: Math.max(0.05, ATTACK.lungeT - lag) };
      A.racer.slamCool = A.racer.handling.slamCool || 10;
      T.underAttack = { by: A, t: race.time, done: false };
    } else if (m.k === 'hit') {
      // its slam landed on its own screen: here too, now (if its dash here has not landed already)
      const T = who(m.target);
      if (T && A.racer.lunge?.target === T) race.slam(A, T);
    } else if (m.k === 'clash') {
      const att = who(m.a);
      if (att && att !== A) race.clash(att, A);
    } else if (m.k === 'wreck') {
      A.wrecks = (A.wrecks || 0) + 1;
      const v = (a) => (Array.isArray(a) && a.length === 3 ? A.racer.pos.clone().set(+a[0], +a[1], +a[2]) : A.racer.pos.clone());
      race.events.push({ type: 'wreck', at: v(m.at), vel: v(m.vel), player: false, entry: A, net: true });
    } else if (m.k === 'pad') {
      const pad = race.track.pads[m.i | 0];
      if (pad) race.events.push({ type: 'padfx', i: m.i | 0, at: pad.at, player: false, net: true });
    } else if (m.k === 'hyper') {
      race.events.push({ type: 'hyper', player: false, entry: A, net: true });
      A.ship.boostKick = 1;
    }
  }

  // each frame (main.js, after the physics and before the race's events are played): the player's moves and finish
  // sent, its state 30 times a second
  update() {
    if (this.state !== 'race' || !this.net) return;
    const race = this.race, P = race.player;
    for (const ev of race.events) {
      if (ev.net) continue;
      if (ev.type === 'lunge' && ev.entry === P && ev.target?.id != null) this.emit({ k: 'lunge', target: ev.target.id, dir: ev.dir });
      else if (ev.type === 'attack' && ev.attacker === P && ev.victim?.id != null) this.emit({ k: 'hit', target: ev.victim.id });
      else if (ev.type === 'clash' && ev.b === P && ev.a?.id != null) this.emit({ k: 'clash', a: ev.a.id });
      else if (ev.type === 'wreck' && ev.entry === P) this.emit({ k: 'wreck', at: ev.at.toArray(), vel: (ev.vel || P.racer.vel).toArray() });
      else if (ev.type === 'padfx' && ev.player) this.emit({ k: 'pad', i: ev.i });
      else if (ev.type === 'hyper' && ev.player) this.emit({ k: 'hyper' });
    }
    if (P.finished && !this.finSent) {
      this.finSent = true;
      const m = { t: 'fin', n: this.raceN, time: P.finishTime, laps: P.laps, best: P.best, progress: P.progress };
      if (this.host) this.net.broadcast({ ...m, by: 0 }); else this.net.send(m);
    }
    const t = performance.now();
    if (t >= this.sendAt) {
      this.sendAt = Math.max(this.sendAt + 1000 / HZ, t - 1000 / HZ);
      this.net.fast(this.pack().slice(0));
    }
  }

  // back in the room after a race (the results' Back to the room): no lights pending, the others' ships at rest
  toRoom() {
    if (this.state !== 'race') return;
    this.h.chatClear?.();
    this.state = 'room';
    this.goAt = null;
    for (const e of this.entries.values()) { e.net.last = e.net.prev = null; e.ship.setEngine(false); }
    if (this.host) { this.net.setState('open'); this.sharePlayers(); }
    this.message = '';
    this.change();
  }

  // the standings with each player's ping to the host (the HUD's list, the room's table)
  table() {
    const race = this.race, order = this.live ? race.standings() : null;
    const rows = [...this.players.values()].map((p) => {
      const e = p.id === this.myId ? race.player : this.entries.get(p.id);
      return { id: p.id, name: p.name, kind: p.kind, livery: p.livery, css: COLOURS[p.id % COLOURS.length], host: p.host, me: p.id === this.myId,
        ready: p.ready, ping: p.host ? null : p.id === this.myId && !this.host ? this.net?.rttMs ?? p.ping : p.ping,
        pos: order && e ? order.indexOf(e) + 1 : 0, finished: !!e?.finished };
    });
    return order ? rows.sort((a, b) => (a.pos || 99) - (b.pos || 99)) : rows.sort((a, b) => a.id - b.id);
  }
}
