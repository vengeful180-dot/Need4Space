// Online chat in a race (multiplayer.js say / heard): the last few lines over the HUD's left side, each fading after a
// while; Enter opens a line to type (the game's keys left alone while it is open - input.js), Enter sends, Esc closes.
// The room's own chat is on the Multiplayer screen (rooms.js). Settings: "Online races: chat".
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const chatLine = (m) => (m.sys ? `<div class="nc-line sys">${esc(m.text)}</div>`
  : `<div class="nc-line${m.me ? ' me' : ''}"><b style="color:${m.css}">${esc(m.name)}</b> ${esc(m.text)}</div>`);

export class ChatBox {
  constructor(mp, settings) {
    this.mp = mp;
    this.settings = settings;
    this.el = document.createElement('div');
    this.el.id = 'netchat';
    this.el.innerHTML = '<div class="nc-log"></div><input class="nc-in" type="text" maxlength="120" autocomplete="off" enterkeyhint="send" placeholder="Enter to send, Esc to close" hidden>';
    document.getElementById('hud').append(this.el);
    this.log = this.el.querySelector('.nc-log');
    this.in = this.el.querySelector('.nc-in');
    addEventListener('keydown', (e) => {
      if ((e.code !== 'Enter' && e.code !== 'NumpadEnter') || e.repeat || e.target.matches?.('input, textarea, select')) return;
      if (!this.mp.live || !this.on || document.body.dataset.ui !== 'game') return;
      e.preventDefault();
      this.open();
    });
    this.in.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.mp.say(this.in.value); this.close(); }
      else if (e.code === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.in.addEventListener('blur', () => this.close());
  }

  get on() { return this.settings.v.netChat !== false; }

  open() {
    this.in.hidden = false;
    this.in.value = '';
    this.el.classList.add('typing');
    this.in.focus();
  }

  close() {
    if (this.in.hidden) return;
    this.in.hidden = true;
    this.el.classList.remove('typing');
    if (document.activeElement === this.in) this.in.blur();
  }

  // a line said: shown for ten seconds (all of the last five while typing)
  add(m) {
    if (!this.on || !this.mp.live) return;
    const t = document.createElement('template');
    t.innerHTML = chatLine(m);
    const line = t.content.firstChild;
    this.log.append(line);
    while (this.log.children.length > 5) this.log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 9000);
  }

  clear() { this.log.replaceChildren(); this.close(); }
}
