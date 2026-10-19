import { LAPS } from './race.js';

const MAPS = [['space', 'Space'], ['forest', 'Forest'], ['ice', 'Ice'], ['desert', 'Desert'], ['ocean', 'Ocean'], ['pyramid', 'Pyramid']];
const LEVELS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['brutal', 'Brutal']];
const PROFILE = 'need4space.pilot.v1', PENDING = 'need4space.pending-time.v1', SAVED = 'need4space.saved-runs.v1';
const load = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };
const time = (ms) => {
  if (!Number.isFinite(ms)) return '—';
  const sec = Math.floor(ms / 1000), milli = String(ms % 1000).padStart(3, '0');
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}.${milli}`;
};
const cleanName = (name) => name.trim().replace(/\s+/g, ' ').slice(0, 24);

export class Scoreboard {
  constructor(menu) {
    this.menu = menu;
    this.h = menu.h;
    const stored = load(PROFILE);
    this.profile = typeof stored?.name === 'string' ? { name: cleanName(stored.name) } : { name: '' };
    save(PROFILE, this.profile);
    this.pending = load(PENDING);
    if (!this.pending || !MAPS.some(([id]) => id === this.pending.map) || !LEVELS.some(([id]) => id === this.pending.difficulty)
      || !Number.isInteger(this.pending.totalMs) || !Array.isArray(this.pending.lapsMs) || this.pending.lapsMs.length !== LAPS) this.pending = null;
    if (this.pending && !this.pending.runId) { this.pending.runId = crypto.randomUUID(); save(PENDING, this.pending); }
    const receipts = load(SAVED);
    this.savedRuns = new Map(receipts && typeof receipts === 'object' && !Array.isArray(receipts) ? Object.entries(receipts) : []);
    if (this.pending && this.savedRuns.has(this.pending.runId)) { this.pending = null; save(PENDING, null); }
    this.map = MAPS.some(([id]) => id === this.h.map) ? this.h.map : MAPS[0][0];     // (a circuit with no board yet: the first one's)
    this.level = this.h.settings.v.ai;
    this.cache = new Map();
    this.refreshRequest = 0;
    this.el = menu.el.querySelector('[data-s="scoreboard"]');
    this.el.innerHTML = `<div class="sb-heading"><div><div class="m-kicker">Top 10</div><h2 class="m-h2">Global scoreboard</h2></div>
      <span class="sb-connection">Connecting</span></div>
      <div class="sb-body"><div class="sb-toolbar"><div class="sb-filters">
        <div class="sb-group"><span class="sb-group-h">Circuit</span><div class="sb-tabs sb-maps" aria-label="Circuit" style="--n:${MAPS.length}">${MAPS.map(([id, label]) => `<button type="button" data-sb-map="${id}">${label}</button>`).join('')}</div></div>
        <div class="sb-group"><span class="sb-group-h">Difficulty</span><div class="sb-tabs sb-levels" aria-label="Difficulty" style="--n:${LEVELS.length}">${LEVELS.map(([id, label]) => `<button type="button" data-sb-level="${id}" style="--sb-level:var(--c-${id})">${label}</button>`).join('')}</div></div>
      </div><button type="button" class="sb-btn sb-refresh">↻ <span>Refresh</span></button></div>
      <div class="sb-rule">3 laps · fastest race wins</div>
      <div class="sb-summary"><span class="sb-board-title"></span><span class="sb-updated" aria-live="polite"></span></div>
      <div class="sb-table-wrap"><table class="sb-table"><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Race time</th><th scope="col">Best lap</th><th scope="col">Points</th></tr></thead><tbody></tbody></table>
        <div class="sb-empty" hidden><span>No times yet</span><p>Finish a race to set the first time.</p></div></div>
      <div class="sb-personal"><span>Your best</span><b>—</b><span class="sb-personal-rank"></span></div>
      <div class="sb-pending"></div></div>`;
    this.el.addEventListener('click', (e) => {
      const map = e.target.closest('[data-sb-map]'), level = e.target.closest('[data-sb-level]');
      if (map) this.choose(map.dataset.sbMap, this.level);
      else if (level) this.choose(this.map, level.dataset.sbLevel);
      else if (e.target.closest('.sb-refresh')) this.refresh();
    });
    addEventListener('need4space:race-reset', e => this.beginRun(e.detail));
    this.beginRun(this.h.race?.level || this.level);
    this.mark();
  }

  beginRun(level) { this.runLevel = level; this.changed = false; this.runId = crypto.randomUUID(); this.result = null; }
  difficultyChanged(level) {
    const race = this.h.race;
    if (race?.racing && !race.player.finished && level !== this.runLevel) this.changed = true;
    if (!race?.racing) this.runLevel = level;
  }

  setName(name) {
    this.profile.name = cleanName(name);
    save(PROFILE, this.profile);
    for (const input of this.menu.el.querySelectorAll('.sb-name')) if (input !== document.activeElement) input.value = this.profile.name;
    const row = document.querySelector('#results .r-table tr.me td:nth-child(2)');
    if (row) {
      for (const n of [...row.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.textContent = this.profile.name || this.h.race.player.team.name;
    }
  }

  async endpoint() {
    if (!this.config) this.config = fetch(new URL('../scoreboard-config.json', import.meta.url), { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw Error('Scoreboard is unavailable.'); const c = await r.json(); if (!c.endpoint) throw Error('Scoreboard is unavailable.'); return new URL(c.endpoint, document.baseURI).href; })
      .catch(e => { this.config = null; throw e; });
    return this.config;
  }

  async request(params, score) {
    const url = new URL(await this.endpoint());
    if (!score) for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, { method: score ? 'POST' : 'GET', cache: 'no-store', signal: controller.signal,
        ...(score ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(score) } : {}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || 'Scores are unavailable. Please try again.');
      if (!Array.isArray(data.entries)) throw Error('Scores are unavailable. Please try again.');
      return data;
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) throw Error('Could not connect. Your race time is kept here; try again.');
      throw e;
    } finally { clearTimeout(timeout); }
  }

  setOpen(open) {
    clearInterval(this.poll);
    this.open = open;
    if (!open) { this.refreshRequest++; this.refreshing = null; return; }
    if (this.menu.ctx === 'results' && this.result) { this.map = this.result.map; this.level = this.result.difficulty; }
    this.mark();
    this.renderPending();
    // just saved: the board came back with the save - show it at once, no second request
    if (!(this.fresh && this.fresh.key === this.map + ':' + this.level && performance.now() - this.fresh.t < 10000)) this.refresh();
    this.poll = setInterval(() => { if (document.visibilityState === 'visible') this.refresh(true); }, 15000);
  }

  choose(map, level) { this.map = map; this.level = level; this.mark(); this.refresh(); }

  // Enter / A on a save form from the menu: save under the name typed (or remembered), or go to the name field.
  // False when there is nothing to save on this screen.
  saveFromMenu() {
    const scope = this.menu.screen === 'results' ? document.getElementById('results') : this.el;
    const form = [...scope.querySelectorAll('.sb-submit-form')].find((f) => !f.querySelector('.sb-save').disabled);
    if (!form) return false;
    const input = form.querySelector('.sb-name');
    if (cleanName(input.value)) form.requestSubmit(); else input.focus();
    return true;
  }
  nav(dir) {
    const values = Math.abs(dir) === 1 ? MAPS : LEVELS, key = Math.abs(dir) === 1 ? 'map' : 'level';
    const i = values.findIndex(([id]) => id === this[key]);
    this[key] = values[(i + Math.sign(dir) + values.length) % values.length][0];
    this.mark(); this.refresh();
  }
  mark() {
    for (const button of this.el.querySelectorAll('[data-sb-map], [data-sb-level]')) {
      const on = button.dataset.sbMap ? button.dataset.sbMap === this.map : button.dataset.sbLevel === this.level;
      button.classList.toggle('on', on); button.setAttribute('aria-pressed', on);
    }
    this.el.style.setProperty('--sb-on', `var(--c-${this.level})`);   // (the chosen circuit lit in the chosen difficulty's colour)
    this.el.querySelector('.sb-board-title').textContent = `${MAPS.find(([id]) => id === this.map)[1]} / ${LEVELS.find(([id]) => id === this.level)[1]}`;
    this.render(this.cache.get(this.map + ':' + this.level) || { entries: [], personal: null });
  }

  async refresh(quiet = false) {
    const map = this.map, level = this.level, key = map + ':' + level;
    if (this.refreshing === key) return;
    const request = ++this.refreshRequest;
    this.refreshing = key;
    const button = this.el.querySelector('.sb-refresh'); button.disabled = true;
    if (!quiet) this.el.querySelector('.sb-updated').textContent = 'Refreshing…';
    try {
      const data = await this.request({ map, difficulty: level, name: this.profile.name });
      if (request !== this.refreshRequest) return;
      this.cache.set(key, data);
      if (this.map === map && this.level === level) {
        this.render(data);
        this.el.querySelector('.sb-connection').textContent = data.storage === 'local' ? 'Local preview' : 'Global';
        this.el.querySelector('.sb-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    } catch (e) {
      if (request === this.refreshRequest && this.map === map && this.level === level) {
        this.el.querySelector('.sb-connection').textContent = 'Offline';
        this.el.querySelector('.sb-updated').textContent = e.message;
      }
    } finally { if (request === this.refreshRequest) { this.refreshing = null; button.disabled = false; } }
  }

  render(data) {
    const body = this.el.querySelector('tbody'); body.replaceChildren();
    data.entries.slice(0, 10).forEach((entry, i) => {
      const row = document.createElement('tr');
      if (entry.name === data.personal?.entry.name) row.className = 'me';
      for (const value of [String(i + 1).padStart(2, '0'), entry.name, time(entry.totalMs), time(entry.bestLapMs), String(entry.points)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      if (entry.name === data.personal?.entry.name) { const tag = document.createElement('small'); tag.textContent = 'You'; row.children[1].append(tag); }
      body.append(row);
    });
    this.el.querySelector('.sb-empty').hidden = !!data.entries.length;
    this.el.querySelector('.sb-personal').hidden = !data.personal;
    this.el.querySelector('.sb-personal b').textContent = time(data.personal?.entry.totalMs);
    this.el.querySelector('.sb-personal-rank').textContent = data.personal ? `#${data.personal.rank} of ${data.totalPlayers}` : '';
    // the race just saved: its row (or, outside the top ten, the personal line) lights up and comes into view
    if (this.fresh && this.fresh.key === this.map + ':' + this.level && performance.now() - this.fresh.t < 2500) {
      const mine = body.querySelector('tr.me') || (!this.el.querySelector('.sb-personal').hidden && this.el.querySelector('.sb-personal'));
      if (mine) {
        mine.classList.remove('sb-fresh'); void mine.offsetWidth; mine.classList.add('sb-fresh');
        requestAnimationFrame(() => mine.scrollIntoView({ block: 'nearest' }));
      }
    }
  }

  captureResult() {
    const race = this.h.race, player = race?.player;
    if (!player?.finished || player.laps.length !== LAPS || !Number.isFinite(player.finishTime)) return;
    if (!MAPS.some(([id]) => id === this.h.map)) return;                            // (no board for this circuit)
    const slot = document.getElementById('results');
    slot.querySelector('.sb-result')?.remove();
    const panel = document.createElement('div'); panel.className = 'sb-result'; slot.querySelector('.r-score').after(panel);
    if (this.changed) { panel.textContent = 'Difficulty changed during this race. Finish a race on one difficulty to save its time.'; return; }
    if (!this.result) this.result = { runId: this.runId, map: this.h.map, difficulty: this.runLevel,
      totalMs: Math.round(player.finishTime * 1000), lapsMs: player.laps.map(t => Math.round(t * 1000)), points: race.total };
    if (!this.savedRuns.has(this.result.runId)) { this.pending = this.result; save(PENDING, this.pending); }
    this.submissionForm(panel, this.result);
    this.setName(this.profile.name);
  }

  renderPending() {
    const slot = this.el.querySelector('.sb-pending'); slot.replaceChildren();
    if (this.pending) this.submissionForm(slot, this.pending);
  }

  lockForms(runId, locked, receipt) {
    for (const form of this.menu.el.querySelectorAll('.sb-submit-form')) {
      if (form.dataset.runId !== runId) continue;
      const input = form.querySelector('input'), button = form.querySelector('button');
      if (input) { input.disabled = locked; if (receipt) input.value = receipt.name; }
      if (button) { button.disabled = locked; if (receipt) button.textContent = 'Saved'; }
      if (receipt) form.querySelector('.sb-submit-status').textContent = receipt.message;
    }
  }

  rememberSaved(score, data) {
    this.refreshRequest++;
    this.refreshing = null;
    this.el.querySelector('.sb-refresh').disabled = false;
    const name = data.submittedName || data.personal.entry.name;
    const receipt = { name, message: data.alreadySubmitted ? `Already saved as ${name}`
      : data.improved ? `Saved · #${data.rank}${data.rank > 10 ? ' · outside the top 10' : ''}` : `Best race kept · ${time(data.personal.entry.totalMs)}` };
    this.savedRuns.set(score.runId, receipt);
    save(SAVED, Object.fromEntries([...this.savedRuns].slice(-128)));
    if (this.pending?.runId === score.runId) { this.pending = null; save(PENDING, null); }
    this.setName(name);
    this.lockForms(score.runId, true, receipt);
  }

  submissionForm(slot, score) {
    if (!score.runId) score.runId = crypto.randomUUID();
    const receipt = this.savedRuns.get(score.runId);
    slot.innerHTML = `<form class="sb-submit-form"><div class="sb-submit-info"><span>Save your race time</span><b>${time(score.totalMs)}</b><small>${MAPS.find(([id]) => id === score.map)[1]} / ${LEVELS.find(([id]) => id === score.difficulty)[1]}</small></div>
      <label>Racing name <input class="sb-name" name="name" type="text" maxlength="24" autocomplete="nickname" placeholder="Enter your name" required></label>
      <button class="sb-btn sb-save" type="submit">Save time</button><div class="sb-submit-status" role="status"></div></form>`;
    const form = slot.querySelector('form'), input = form.querySelector('input'); form.dataset.runId = score.runId; input.value = this.profile.name;
    this.lockForms(score.runId, !!receipt || this.saving === score.runId, receipt);
    input.addEventListener('input', () => this.setName(input.value));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (this.savedRuns.has(score.runId) || this.saving) return;
      const name = cleanName(input.value), status = form.querySelector('.sb-submit-status');
      if (!name) { status.textContent = 'Enter your racing name.'; input.focus(); return; }
      this.setName(name); input.value = name;
      this.saving = score.runId; this.lockForms(score.runId, true); status.textContent = 'Saving…';
      try {
        const data = await this.request(null, { ...score, name });
        this.cache.set(score.map + ':' + score.difficulty, data);
        this.fresh = { key: score.map + ':' + score.difficulty, t: performance.now() };
        this.rememberSaved(score, data);
        // saved from the results: straight on to the board, the new time lit up (Esc comes back)
        if (this.menu.screen === 'results') { this.menu.sel.results = 0; this.menu.go('scoreboard'); }
        if (this.open && this.map === score.map && this.level === score.difficulty) {
          this.render(data);
          this.el.querySelector('.sb-connection').textContent = data.storage === 'local' ? 'Local preview' : 'Global';
          this.el.querySelector('.sb-updated').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch (e) { status.textContent = e.message; this.lockForms(score.runId, false); }
      finally { this.saving = false; }
    });
  }
}
