// The title's global chat (the lobby's chat: net.js Lobby chat / say): everyone on the title in one place - the last
// lines of the last hour, the new ones fetched every 4 s while the title shows it (Settings: Global chat). The lobby
// filters the lines (links, emails and phone numbers refused, swearing starred out, one line every 3 s from a game);
// a name clicked mutes whoever said it (kept in this browser, with an Undo). The pilot's name is the Multiplayer one -
// asked for here, in the same box, when there is none yet.
import { COLOURS } from './multiplayer.js';

const MUTED = 'need4space.gchat.muted';  // (localStorage: the senders muted - their lines' hashed `from`)
const POLL = 4000;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colour = (from) => COLOURS[(parseInt(String(from).slice(0, 6), 16) || 0) % COLOURS.length];

export class GlobalChat {
  constructor(menu, mp) {
    this.menu = menu;
    this.mp = mp;
    this.lines = [];                  // { n, t, from, name, text }, oldest first
    this.last = 0;                    // the newest line's number heard
    this.mine = new Set();            // the senders that were this tab (its `from`, as the lobby answered)
    this.notes = [];                  // the box's own lines: { text, undo }
    this.open = false;
    try { this.muted = new Set(JSON.parse(localStorage.getItem(MUTED)) || []); } catch { this.muted = new Set(); }
  }

  get on() { return this.menu.h.settings?.v.globalChat !== false; }

  // the title's markup for it (menu.js build): a heading, the lines, the box to type in
  static markup() {
    return '<aside class="m-gchat"><div class="g-head"><span class="g-tag">Global chat</span></div><div class="g-log"></div>' +
      '<form class="g-form" action="#"><input class="g-in" type="text" maxlength="120" autocomplete="off" enterkeyhint="send"></form></aside>';
  }

  // its elements, each time the menu is built
  attach(root) {
    this.el = root.querySelector('.m-gchat');
    if (!this.el) return;
    this.log = this.el.querySelector('.g-log');
    this.in = this.el.querySelector('.g-in');
    // (a form: the menu holds every key while it is open - a submit still comes, a phone's Send key too)
    this.el.querySelector('.g-form').addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
    this.log.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mute]'), u = e.target.closest('[data-undo]');
      if (m) this.mute(m.dataset.mute, m.textContent);
      else if (u) this.unmute(u.dataset.undo);
    });
    this.el.classList.toggle('off', !this.on);
    this.hint();
    this.render(true);
  }

  hint() { if (this.in) this.in.placeholder = this.mp.myName ? 'Chat' : 'Your pilot name'; }

  // shown (the title's main screen) or not: fetched every 4 s while shown and the page is in view
  setOpen(open) {
    this.el?.classList.toggle('off', !this.on);
    open = !!open && this.on && !!this.el;
    if (open === this.open) return;
    this.open = open;
    clearInterval(this.t);
    this.t = null;
    if (!open) return;
    this.hint();
    this.poll();
    this.t = setInterval(() => { if (document.visibilityState === 'visible') this.poll(); }, POLL);
  }

  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await this.mp.lobby.chat(this.last);
      if ((r.last | 0) < this.last) { this.lines = []; this.last = 0; }    // (the lobby started afresh: its lines anew)
      const have = new Set(this.lines.map((m) => m.n));
      for (const m of r.messages || []) if (m && Number.isFinite(m.n) && !have.has(m.n)) this.lines.push(m);
      this.lines.sort((a, b) => a.n - b.n);
      this.lines = this.lines.slice(-60);
      this.last = Math.max(this.last, r.last | 0);
      this.render();
    } catch { /* (offline, the lobby away: tried again on the next) */ } finally { this.busy = false; }
  }

  async send() {
    const text = this.in.value.trim();
    if (!text) return;
    if (!this.mp.myName) {                                  // (no pilot name yet: this was it)
      this.mp.name = text;
      this.in.value = '';
      this.hint();
      return;
    }
    this.in.value = '';
    try {
      const { message: m } = await this.mp.lobby.say({ id: this.mp.tabId, name: this.mp.name, text });
      this.mine.add(m.from);
      if (!this.lines.some((x) => x.n === m.n)) this.lines.push(m);
      this.render(true);
    } catch (e) {
      if (!this.in.value) this.in.value = text;             // (refused: the line kept to change)
      this.note(e.message || 'Could not send.');
    }
  }

  // a line of the box's own (a refusal, a mute): shown under the lines a while
  note(text, undo = null, ms = 5000) {
    const n = { text, undo };
    this.notes.push(n);
    this.render(true);
    setTimeout(() => { this.notes = this.notes.filter((x) => x !== n); this.render(); }, ms);
  }

  mute(from, name) {
    if (!from || this.mine.has(from)) return;
    this.muted.add(from);
    this.save();
    this.note(`${name} muted`, from, 8000);
  }

  unmute(from) {
    this.muted.delete(from);
    this.save();
    this.notes = this.notes.filter((x) => x.undo !== from);
    this.render();
  }

  save() { try { localStorage.setItem(MUTED, JSON.stringify([...this.muted].slice(-200))); } catch { /* storage blocked */ } }

  // the lines (the muted left out), kept scrolled to the newest unless scrolled back to read
  render(toEnd = false) {
    if (!this.log) return;
    const end = toEnd || this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 8;
    this.log.innerHTML = this.lines.filter((m) => !this.muted.has(m.from)).map((m) => this.mine.has(m.from)
      ? `<div class="g-line me"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`
      : `<div class="g-line"><button class="g-who" data-mute="${esc(m.from)}" title="Mute" style="color:${colour(m.from)}">${esc(m.name)}</button> ${esc(m.text)}</div>`).join('') +
      this.notes.map((n) => `<div class="g-line sys">${esc(n.text)}${n.undo ? ` <button class="g-undo" data-undo="${esc(n.undo)}">Undo</button>` : ''}</div>`).join('');
    if (end) this.log.scrollTop = this.log.scrollHeight;
  }
}
