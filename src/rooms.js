// The Multiplayer screen (menu.js): the open rooms, the racing name, Create a room; inside a room its players - their
// ships, their ping to the host, who is ready - with Start race for the host and Leave room. multiplayer.js runs it.
import { shipName } from './ships.js';
import { COLOURS } from './multiplayer.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = (i) => String(i + 1).padStart(2, '0');
// a ping's band: green under 80 ms, amber under 160, red past it
const band = (ms) => (ms == null ? '' : ms < 80 ? 'good' : ms < 160 ? 'fair' : 'poor');
const pingText = (ms) => (ms == null ? '-' : `${Math.round(ms)} ms`);

export class Rooms {
  constructor(menu, mp, circuits) {
    this.menu = menu;
    this.mp = mp;
    this.circuits = circuits;
    this.list = [];
    this.view = 'browse';              // 'browse' | 'busy' | 'room'
    this.status = '';
    this.notice = '';                  // why the last room ended (the host gone, the connection lost): kept over the list
    this.el = menu.el.querySelector('[data-s="multi"]');
    this.el.innerHTML = `<header><div class="m-kicker">Race other pilots online &middot; in testing</div><h2 class="m-h2">Multiplayer</h2></header>
      <div class="mp-body"></div><div class="m-desc"></div>`;
    this.body = this.el.querySelector('.mp-body');
    this.body.addEventListener('input', (e) => {
      if (!e.target.matches('.mp-name')) return;
      this.mp.name = e.target.value;
      if (this.needName && this.mp.myName) { this.needName = false; e.target.closest('.mp-namebox')?.classList.remove('need'); }
    });
    // (Enter in the name: done typing - back to the list's keys)
    this.body.addEventListener('keydown', (e) => { if (e.target.matches('.mp-name') && (e.key === 'Enter' || e.key === 'NumpadEnter')) { e.preventDefault(); e.target.blur(); } });
    this.body.addEventListener('change', (e) => { if (e.target.matches('.mp-name')) { e.target.value = this.mp.name; } });
    this.render();
  }

  circuit(id) { return this.circuits.find(([c]) => c === id)?.[1] || id; }

  setOpen(open) {
    clearInterval(this.poll);
    this.open = open;
    if (!open) return;
    this.view = this.mp.active ? 'room' : this.view === 'busy' ? 'busy' : 'browse';
    this.render();
    if (this.view === 'browse') this.refresh();
    // (the list kept fresh while it is looked at, the tab in view)
    this.poll = setInterval(() => { if (this.view === 'browse' && document.visibilityState === 'visible') this.refresh(true); }, 5000);
  }

  async refresh(quiet = false) {
    if (this.loading) return;
    this.loading = true;
    if (!quiet) { this.status = 'Looking for rooms'; this.render(); }
    try {
      const r = await this.mp.rooms();
      this.list = Array.isArray(r.rooms) ? r.rooms : [];
      this.status = this.list.length ? `${this.list.length} room${this.list.length > 1 ? 's' : ''} open` : 'No rooms open - create one and share its name';
      this.offline = false;
    } catch (e) { this.status = e.message; this.offline = true; }
    finally { this.loading = false; }
    if (this.view === 'browse') this.render();
  }

  // the screen drawn again (the selection kept: the menu's own), a typed name kept as it is
  render() {
    const mp = this.mp, focus = document.activeElement?.matches?.('.mp-name');
    if (mp.active && this.view !== 'room') this.view = 'room';
    if (!mp.active && this.view === 'room') this.view = 'browse';
    let html = '';
    if (this.view === 'browse') {
      // the name first (asked for before a room is made or joined), the two actions side by side, the open rooms in a
      // panel of their own: each its name, circuit and how full
      const rooms = this.list.map((r, i) => {
        const full = r.players >= r.max, racing = r.state === 'racing';
        return `<button class="m-item mp-room${racing || full ? ' off' : ''}" data-act="mp:join:${esc(r.id)}" tabindex="-1"><span class="m-num">${pad2(i)}</span>` +
          `<span class="m-name">${esc(r.name)}</span><span class="mp-where">${esc(this.circuit(r.map))}</span>` +
          `<span class="mp-count${racing || full ? ' off' : ''}">${racing ? 'Racing' : full ? 'Full' : `${r.players}/${r.max}`}</span></button>`;
      }).join('');
      html = `<label class="mp-namebox${this.needName ? ' need' : ''}"><span>Your racing name</span><input class="mp-name" type="text" maxlength="24" autocomplete="nickname" enterkeyhint="done" placeholder="Type your name" value="${esc(mp.myName)}"></label>
        <nav class="mp-acts">
          <button class="m-item mp-btn mp-go" data-act="mp:create" tabindex="-1"><span class="m-name">Create a room</span><span class="m-meta">${esc(this.circuit(mp.h.map))}</span></button>
          <button class="m-item mp-btn" data-act="mp:refresh" tabindex="-1"><span class="m-name">Refresh</span></button>
        </nav>
        <div class="mp-panel"><div class="mp-panel-h"><span>Open rooms</span><b>${this.list.length}</b></div>
          <nav class="mp-list">${rooms || `<div class="mp-empty">${this.loading && !this.list.length ? 'Looking for rooms...' : 'No rooms open yet. Create one, then tell your friends to join it.'}</div>`}</nav></div>
        ${this.notice ? `<div class="mp-status bad">${esc(this.notice)}</div>` : ''}<div class="mp-status${this.offline ? ' bad' : ''}">${esc(this.status)}</div>`;
    } else if (this.view === 'busy') {
      html = `<div class="mp-busy"><div class="mp-spin"></div><b>${esc(this.busyTitle || 'Joining')}</b><span>${esc(this.status)}</span></div>
        <nav class="mp-acts"><button class="m-item mp-btn" data-act="mp:cancel" tabindex="-1"><span class="m-name">Back</span></button></nav>`;
    } else {
      const room = mp.room || {}, rows = mp.table(), n = rows.length;
      const tr = rows.map((p) => `<tr class="${p.me ? 'me' : ''}"><td><span class="sw" style="background:${COLOURS[p.id % COLOURS.length]}"></span>${esc(p.name)}${p.me ? '<small>You</small>' : ''}</td>` +
        `<td>${esc(shipName(p.kind))}</td><td class="mp-ping ${p.host ? 'host' : band(p.ping)}">${p.host ? 'Host' : pingText(p.ping)}</td>` +
        `<td class="mp-ready ${p.ready ? 'on' : ''}">${p.ready ? 'Ready' : 'Getting ready'}</td>` +
        // (the host: Kick on each other player - pressed once it asks, again within 3 s it removes them)
        `<td class="mp-kick">${mp.host && !p.host ? `<button class="mp-x${this.armKick === p.id ? ' armed' : ''}" data-act="mp:kick:${p.id}" tabindex="-1" title="Remove from the room">${this.armKick === p.id ? 'Sure?' : 'Kick'}</button>` : ''}</td></tr>`).join('');
      const start = mp.host ? `<button class="m-item mp-btn mp-go${mp.canStart() ? '' : ' off'}" data-act="mp:start" tabindex="-1"><span class="m-name">Start race</span>` +
        `<span class="m-meta">${n < 2 ? 'Needs a second player' : mp.canStart() ? `${n} players` : 'Getting ships ready'}</span></button>` : '';
      html = `<div class="mp-head"><b>${esc(room.name || 'Room')}</b><span>${esc(this.circuit(room.map || mp.h.map))} &middot; ${n}/${room.max || 8} &middot; ${mp.host ? 'you host' : 'host: ' + esc(rows.find((p) => p.host)?.name || '-')}</span></div>
        <div class="mp-panel"><table class="mp-players"><thead><tr><th>Pilot</th><th>Ship</th><th>Ping</th><th></th><th></th></tr></thead><tbody>${tr}</tbody></table></div>
        <nav class="mp-acts">${start}
          <button class="m-item mp-btn" data-act="mp:leave" tabindex="-1"><span class="m-name">Leave room</span></button></nav>
        <div class="mp-status">${esc(mp.message || (mp.host ? 'Your room is open: friends find it in their Multiplayer list' : ''))}</div>`;
    }
    if (html !== this.html) {
      this.html = html;
      const caret = focus ? document.activeElement.selectionStart : null;
      this.body.innerHTML = html;
      if (focus) { const i = this.body.querySelector('.mp-name'); if (i) { i.focus(); i.setSelectionRange(caret, caret); } }
      if (this.menu.screen === 'multi') this.menu.refresh();
    }
  }

  items() { return [...this.body.querySelectorAll('.m-item')]; }

  describe(a) {
    if (a === 'mp:create') return `A room on the ${this.circuit(this.mp.h.map)} circuit: up to eight pilots, no rivals`;
    if (a === 'mp:refresh') return 'Look for open rooms again';
    if (a === 'mp:start') return this.mp.canStart() ? 'Everyone onto the grid: the lights in a few seconds' : 'Starts once a second pilot is in and every ship is ready';
    if (a === 'mp:leave') return this.mp.host ? 'Close the room for everyone' : 'Back to the room list';
    if (a === 'mp:cancel') return 'Back to the room list';
    if (a.startsWith('mp:join:')) {
      const r = this.list.find((x) => x.id === a.slice(8));
      if (!r) return '';
      if (r.state === 'racing') return 'Racing now - join once the race is over';
      if (r.players >= r.max) return 'This room is full';
      return r.map !== this.mp.h.map ? `Join - the game loads the ${this.circuit(r.map)} circuit first` : `Join ${r.host || 'the host'} on the ${this.circuit(r.map)} circuit`;
    }
    return '';
  }

  // a racing name before a room is made or joined: without one, the field lit and focused (on a phone its keyboard opens)
  named() {
    if (this.mp.myName) return true;
    this.needName = true;
    this.status = 'Type your racing name first';
    this.offline = true;
    this.render();
    const i = this.body.querySelector('.mp-name');
    i?.focus();
    i?.scrollIntoView({ block: 'center' });
    return false;
  }

  async act(a) {
    const mp = this.mp, ui = (n) => window.__feather?.audio?.ui?.(n);
    if (a === 'mp:refresh') { ui('move'); this.refresh(); return; }
    if (a === 'mp:cancel') { ui('back'); this.view = 'browse'; this.status = ''; this.render(); this.refresh(true); return; }
    if (a === 'mp:leave') { ui('back'); mp.leave(); this.view = 'browse'; this.render(); this.refresh(true); return; }
    if (a === 'mp:start') { if (mp.start()) ui('select'); else ui('back'); return; }
    if (a.startsWith('mp:kick:')) {
      const id = +a.slice(8);
      clearTimeout(this.armT);
      if (this.armKick === id) { this.armKick = null; if (mp.kick(id)) ui('back'); }
      else { this.armKick = id; ui('move'); this.armT = setTimeout(() => { this.armKick = null; this.render(); }, 3000); }
      this.render();
      return;
    }
    if (a === 'mp:create') {
      if (this.view !== 'browse') return;
      if (!this.named()) { ui('back'); return; }
      ui('select');
      this.notice = '';
      this.view = 'busy'; this.busyTitle = 'Opening a room'; this.status = 'Asking the lobby'; this.render();
      try { await mp.create(); this.view = 'room'; }
      catch (e) { this.view = 'browse'; this.status = e.message; this.offline = true; }
      this.render();
      return;
    }
    if (a.startsWith('mp:join:')) {
      const r = this.list.find((x) => x.id === a.slice(8));
      if (!r || this.view !== 'browse') return;
      if (r.state === 'racing' || r.players >= r.max || !this.named()) { ui('back'); return; }
      ui('select');
      await this.joinRoom(r);
    }
  }

  // joining: through the lobby to the host (each step said); a room on another circuit reloads into it first
  async joinRoom(r) {
    this.notice = '';
    this.view = 'busy'; this.busyTitle = `Joining ${r.name}`; this.status = 'Asking the lobby'; this.render();
    try {
      const how = await this.mp.join(r, (s) => { this.status = s; this.render(); });
      if (how === 'reload') {
        this.status = `Loading the ${this.circuit(r.map)} circuit`; this.render();
        this.menu.reloadInto(r.map);
        return;
      }
      this.view = 'room';
    } catch (e) { this.view = 'browse'; this.status = e.message; this.offline = false; this.refresh(true); }
    this.render();
  }
}
