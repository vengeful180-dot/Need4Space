// Online races, the connections: a lobby on a small web service lists the rooms and passes each player's handshake to
// the room's host; then the players' browsers talk to each other directly (WebRTC data channels). One player hosts:
// the others connect to that player's browser, which passes everyone's state on to the rest. The service never
// carries the race itself.
//
// The lobby (multiplayer-config.json `endpoint`, or ?lobby=local for serve.py's own): JSON over HTTPS, the POST bodies
// sent as text/plain (no CORS preflight - the service reads JSON whatever the type).
//   GET  rooms?v=1                       -> { rooms: [{ id, name, map, host, players, max, state, version }] }
//   POST rooms        { name, map, max, host, version }                -> { id, token }   (token: the host's secret)
//   POST rooms/ID/host  { token, players, state, answers: [{ joinId, sdp }] } -> { joins: [{ joinId, name, sdp }] }
//   POST rooms/ID/close { token }                                      -> { ok }
//   POST rooms/ID/join  { name, sdp, version }                         -> { joinId, token }
//   GET  rooms/ID/join/JOINID?token=T                                  -> { state: 'waiting' | 'answered' | 'gone', sdp }
// A room is listed while its host calls rooms/ID/host (every 2 s open, every 8 s racing; gone 30 s after the last);
// an offer waits 60 s for its answer.

export const NET_VERSION = 1;
// (public STUN servers: each browser asks them its own address as the internet sees it - nothing else goes to them)
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the handshake is sent whole, its candidates gathered first (no trickle: one message each way through the lobby)
function gathered(pc, ms = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((done) => {
    const t = setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); done(); } });
  });
}

export class Lobby {
  async endpoint() {
    if (this.base) return this.base;
    if (new URLSearchParams(location.search).get('lobby') === 'local') return (this.base = new URL('api/lobby/', document.baseURI).href);
    const r = await fetch(new URL('../multiplayer-config.json', import.meta.url), { cache: 'no-store' }).catch(() => null);
    const c = r?.ok ? await r.json().catch(() => null) : null;
    if (!c?.endpoint) throw Error('Multiplayer is not available right now.');
    const u = new URL(c.endpoint, document.baseURI).href;
    return (this.base = u.endsWith('/') ? u : u + '/');
  }

  async call(path, body = null, quiet = false) {
    const url = new URL(path, await this.endpoint());
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: ctl.signal,
        ...(body ? { headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) } : {}) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = Error(data.error || 'The lobby did not answer.'); e.status = r.status; throw e; }
      return data;
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) throw Error(quiet ? 'offline' : 'Could not reach the lobby. Check the connection and try again.');
      throw e;
    } finally { clearTimeout(t); }
  }

  rooms() { return this.call(`rooms?v=${NET_VERSION}`); }
  create(info) { return this.call('rooms', { ...info, version: NET_VERSION }); }
  host(id, body) { return this.call(`rooms/${encodeURIComponent(id)}/host`, body, true); }
  join(id, body) { return this.call(`rooms/${encodeURIComponent(id)}/join`, { ...body, version: NET_VERSION }); }
  answer(id, joinId, token) { return this.call(`rooms/${encodeURIComponent(id)}/join/${encodeURIComponent(joinId)}?token=${encodeURIComponent(token)}`, null, true); }
  // (also as the page goes: a beacon still gets out while it unloads)
  close(id, token, unloading = false) {
    if (!this.base) return;
    const url = new URL(`rooms/${encodeURIComponent(id)}/close`, this.base).href, body = JSON.stringify({ token });
    if (unloading && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })); return; }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {});
  }
}

// one player's connection: a reliable channel for messages (ctl) and a fast one for the ships' states and the pings
// (st: unordered, never resent - a late state is a stale one)
class Link {
  constructor(pc) {
    this.pc = pc;
    this.ctl = this.st = null;
    this.seen = performance.now();
    pc.addEventListener('connectionstatechange', () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this.close();
      // (a moment's loss can come back by itself; gone for good after 8 s)
      clearTimeout(this.lost);
      if (s === 'disconnected') this.lost = setTimeout(() => this.close(), 8000);
    });
  }

  attach(ch) {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'ctl') this.ctl = ch; else this.st = ch;
    ch.onmessage = (e) => {
      this.seen = performance.now();
      if (typeof e.data !== 'string') { this.onState?.(e.data); return; }
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && typeof m.t === 'string') this.onMsg?.(m, ch === this.st);
    };
    ch.onopen = () => { if (this.open) this.onOpen?.(); };
    ch.onclose = () => this.close();
  }

  get open() { return this.ctl?.readyState === 'open' && this.st?.readyState === 'open'; }
  send(m) { if (this.ctl?.readyState === 'open') try { this.ctl.send(JSON.stringify(m)); } catch { /* closing */ } }
  // (a backed-up channel drops the state rather than queue it: the next one is newer)
  fast(data) { if (this.st?.readyState === 'open' && this.st.bufferedAmount < 65536) try { this.st.send(data); } catch { /* closing */ } }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.lost);
    try { this.pc.close(); } catch { /* already */ }
    this.onClose?.();
  }
}

// The host: the room on the lobby, the players' connections, everyone's states passed on to the others.
// on: { join(id, hello), leave(id), msg(id, m), state(id, buf) } - ids 1 .. 7 (the host is 0)
export class NetHost {
  constructor(lobby, on) {
    this.lobby = lobby;
    this.on = on;
    this.peers = new Map();            // id -> { link, hello, rtt }
    this.pending = new Set();          // connections still being made
    this.answers = [];
    this.epoch = performance.now();
    this.state = 'open';
    this.info = null;
  }

  get role() { return 'host'; }
  now() { return (performance.now() - this.epoch) / 1000; }   // the room's clock (s): the host's own

  async open(info) {
    this.info = info;
    const r = await this.lobby.create(info);
    this.id = r.id; this.token = r.token;
    this.closed = false;
    this.loop();
    this.unload = () => this.lobby.close(this.id, this.token, true);
    addEventListener('pagehide', this.unload);
    return r.id;
  }

  // the lobby, every 2 s (8 s racing): still here, how full, the answers made since - and any new players' offers
  async loop() {
    while (!this.closed) {
      const answers = this.answers.splice(0);
      try {
        const r = await this.lobby.host(this.id, { token: this.token, players: this.peers.size + 1, state: this.state, answers });
        this.offline = false;
        for (const j of r.joins || []) this.accept(j);
      } catch (e) {
        this.answers.unshift(...answers);
        this.offline = true;
        if (e.status === 404 && !this.closed) { this.on.lost?.('The lobby closed the room.'); return; }
      }
      if (this.closed) return;
      await new Promise((r) => { this.wake = r; setTimeout(r, this.state === 'open' ? 2000 : 8000); });
    }
  }

  // a player's offer: answered, and given 20 s to open
  async accept(j) {
    if (this.pending.size + this.peers.size >= (this.info.max || 8) - 1) return;
    const pc = new RTCPeerConnection({ iceServers: ICE }), link = new Link(pc);
    this.pending.add(link);
    pc.ondatachannel = (e) => link.attach(e.channel);
    const fail = setTimeout(() => { if (!link.id) link.close(); }, 20000);
    link.onClose = () => {
      clearTimeout(fail);
      this.pending.delete(link);
      if (link.id && this.peers.get(link.id)?.link === link) { this.peers.delete(link.id); this.on.leave(link.id); }
    };
    link.onMsg = (m, fast) => this.recv(link, m, fast);
    link.onState = (buf) => {
      if (!link.id) return;
      // (passed straight on: the others hear it as soon as the host does)
      for (const [id, p] of this.peers) if (id !== link.id) p.link.fast(buf);
      this.on.state(link.id, buf);
    };
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: String(j.sdp) });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      this.answers.push({ joinId: j.joinId, sdp: pc.localDescription.sdp });
      this.wake?.();                   // (posted at once, not at the next poll)
    } catch { link.close(); }
  }

  recv(link, m, fast) {
    if (m.t === 'ping') { link.fast(JSON.stringify({ t: 'pong', g: m.g, h: performance.now() - this.epoch })); if (link.id && Number.isFinite(m.rtt)) this.peers.get(link.id).rtt = m.rtt; return; }
    if (fast) return;
    if (m.t === 'hello') {
      if (link.id) return;
      if (m.v !== NET_VERSION) { link.send({ t: 'bye', why: 'This room runs another version of the game. Reload the page.' }); setTimeout(() => link.close(), 500); return; }
      if (this.state !== 'open' || this.peers.size >= (this.info.max || 8) - 1) { link.send({ t: 'bye', why: this.state !== 'open' ? 'That room is racing - try again after the race.' : 'That room is full.' }); setTimeout(() => link.close(), 500); return; }
      let id = 1;
      while (this.peers.has(id)) id++;
      link.id = id;
      this.pending.delete(link);
      this.peers.set(id, { link, hello: m, rtt: null });
      this.on.join(id, m);
      return;
    }
    if (link.id) this.on.msg(link.id, m);
  }

  send(id, m) { this.peers.get(id)?.link.send(m); }
  // a message to every player (but `except`)
  broadcast(m, except = -1) { for (const [id, p] of this.peers) if (id !== except) p.link.send(m); }
  // the host's own state to every player
  fast(buf) { for (const p of this.peers.values()) p.link.fast(buf); }
  rtt(id) { return this.peers.get(id)?.rtt ?? null; }
  kick(id) { this.peers.get(id)?.link.close(); }

  setState(s) { this.state = s; this.wake?.(); }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.wake?.();
    removeEventListener('pagehide', this.unload);
    this.broadcast({ t: 'bye', why: 'The host closed the room.' });
    if (this.id) this.lobby.close(this.id, this.token);
    const links = [...this.peers.values()].map((p) => p.link).concat([...this.pending]);
    this.peers.clear(); this.pending.clear();
    setTimeout(() => links.forEach((l) => { l.onClose = null; l.close(); }), 300);
  }
}

// A player in someone's room: the connection to the host, the room's clock (the host's, by the pings).
// on: { msg(m), state(buf), lost(why) }
export class NetGuest {
  constructor(lobby, on) {
    this.lobby = lobby;
    this.on = on;
    this.offset = 0;                   // the room's clock minus this page's (ms), from the pings
    this.samples = [];
    this.rttMs = null;
  }

  get role() { return 'guest'; }
  now() { return (performance.now() + this.offset) / 1000; }

  // the offer through the lobby, the answer back, the channels open, hello -> welcome
  async join(room, hello, status = () => {}) {
    const pc = new RTCPeerConnection({ iceServers: ICE }), link = (this.link = new Link(pc));
    link.attach(pc.createDataChannel('ctl', { ordered: true }));
    link.attach(pc.createDataChannel('st', { ordered: false, maxRetransmits: 0 }));
    const why = (t) => { const e = Error(t); e.net = true; return e; };
    try {
      status('Finding a way to the host');
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      const j = await this.lobby.join(room.id, { name: hello.name, sdp: pc.localDescription.sdp });
      status('Waiting for the host');
      let sdp = null;
      for (const t0 = performance.now(); !sdp && performance.now() - t0 < 25000;) {
        await sleep(700);
        const a = await this.lobby.answer(room.id, j.joinId, j.token).catch(() => null);
        if (a?.state === 'gone') throw why('The room has closed.');
        sdp = a?.sdp || null;
      }
      if (!sdp) throw why('The host did not answer. The room may have closed.');
      await pc.setRemoteDescription({ type: 'answer', sdp });
      status('Connecting to the host');
      const opened = await new Promise((done) => {
        if (link.open) { done(true); return; }
        const t = setTimeout(() => done(false), 15000);
        link.onOpen = () => { clearTimeout(t); done(true); };
        link.onClose = () => { clearTimeout(t); done(false); };
      });
      if (!opened) throw why('Could not connect to the host. Some networks (phone data, work or school Wi-Fi) block direct connections between players.');
      const welcome = await new Promise((done, fail) => {
        const t = setTimeout(() => fail(why('The host did not let us in.')), 8000);
        link.onMsg = (m) => {
          if (m.t === 'welcome') { clearTimeout(t); done(m); }
          else if (m.t === 'bye') { clearTimeout(t); fail(why(m.why || 'The host turned us away.')); }
        };
        link.onClose = () => { clearTimeout(t); fail(why('The connection to the host closed.')); };
        link.send({ t: 'hello', v: NET_VERSION, ...hello });
      });
      this.id = welcome.id;
      link.onMsg = (m, fast) => this.recv(m, fast);
      link.onState = (buf) => this.on.state(buf);
      link.onClose = () => { if (!this.closed) { this.closed = true; clearInterval(this.pinger); this.on.lost(this.bye || 'The connection to the host was lost.'); } };
      this.pinger = setInterval(() => this.ping(), 1000);
      this.ping();
      return welcome;
    } catch (e) {
      link.onClose = null;
      link.close();
      throw e.net || e.status ? e : why(e.message || 'Could not join the room.');
    }
  }

  ping() { this.link.fast(JSON.stringify({ t: 'ping', g: performance.now(), rtt: this.rttMs })); }

  recv(m, fast) {
    if (m.t === 'pong') {
      // the round trip, and the host's clock then: the sample with the shortest trip of the last ten is the truest;
      // the offset eases toward it (a jump would jerk every ship)
      const now = performance.now(), rtt = now - m.g;
      if (!(rtt >= 0 && rtt < 5000)) return;
      this.rttMs = this.rttMs == null ? rtt : this.rttMs + (rtt - this.rttMs) * 0.3;
      this.samples.push({ rtt, off: m.h + rtt / 2 - now });
      if (this.samples.length > 10) this.samples.shift();
      const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      if (!this.synced) { this.offset = best.off; this.synced = true; }
      else this.offset += Math.max(-4, Math.min(4, best.off - this.offset));
      return;
    }
    if (fast) return;
    if (m.t === 'bye') { this.bye = m.why; return; }
    this.on.msg(m);
  }

  send(m) { this.link?.send(m); }
  fast(buf) { this.link?.fast(buf); }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    if (this.link) { this.link.onClose = null; this.link.close(); }
  }
}
