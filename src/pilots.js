// The rivals' pilots: a face for each team (six expressions, assets/racers/rNN/e1..e6.webp), a name, and what they say
// when something happens between them and the player - a speech bubble over the speaker's ship (Comms), and their
// faces in the results (hud.js). Setting: "Rival pilots".
import { Vector3 } from 'three';
export const EMOTES = { smirk: 1, laugh: 2, angry: 3, shock: 4, roll: 5, wink: 6 };
export const face = (p, emote) => `./assets/racers/${p.id}/e${EMOTES[emote] || 1}.webp`;

// what each situation looks like on their face (a pick of these)
const LOOK = {
  start: ['smirk', 'wink'], passed: ['wink', 'smirk'], overtaken: ['angry', 'roll'], slammed: ['laugh'], hit: ['shock', 'angry'],
  blocked: ['roll'], wrecked: ['shock'], youWrecked: ['laugh'], win: ['laugh'], lose: ['roll'],
  passRival: ['wink', 'smirk'], slamRival: ['laugh', 'smirk'], hitByRival: ['angry', 'shock'],
};

// by team (race.js TEAMS); the lines: start - the lights go out; passed - they get past the player; overtaken - the player
// gets past them; slammed - they slam the player; hit - the player slams them; blocked - the player blocks their slam;
// wrecked - their hull gone; youWrecked - the player's hull gone; win - they win the race; lose - the player beats them;
// and between two rivals close to the player ({name}: the other one): passRival - past another, slamRival - slamming
// another, hitByRival - slammed by another
export const PILOTS = {
  Ember: { id: 'r01', name: 'Roxy Vale', lines: {
    start: ["Try to keep up, rookie.", "Don't blink."],
    passed: ["Bye bye!", "Was that your top speed?"],
    overtaken: ["Oh, you did NOT.", "Enjoy it while it lasts."],
    slammed: ["Paint swap, free of charge.", "Oops. Not sorry."],
    hit: ["Hey! That was my good side!", "You'll pay for that."],
    blocked: ["Lucky.", "Fine. Next time."],
    wrecked: ["My ship!", "Seriously?!"],
    youWrecked: ["Ha! Scrap metal!", "That looked expensive."],
    passRival: ["See ya, {name}!", "Move over, {name}."],
    slamRival: ["Eat that, {name}!", "Nothing personal, {name}."],
    hitByRival: ["{name}, you are SO dead!", "Really, {name}?!"],
    win: ["Never a doubt."], lose: ["Rematch. Now."] } },
  Solar: { id: 'r02', name: 'Marcus "Torque" Okafor', short: 'Torque', lines: {
    start: ["Tuned her myself. Let's go.", "Hope you checked your bolts."],
    passed: ["Should've changed your oil.", "Outta my way, friend."],
    overtaken: ["Hey, I built this thing!", "Okay, okay. Nice line."],
    slammed: ["Tighten those panels!", "Whoops, my wrench slipped."],
    hit: ["That's coming out of your paycheck!", "My suspension!"],
    blocked: ["Solid frame, huh?", "Respect."],
    wrecked: ["Aw, I just fixed that!", "Gonna need a bigger toolbox."],
    youWrecked: ["I can fix that... for a price.", "Ouch. Call me later."],
    passRival: ["Pardon me, {name}.", "Coming through, {name}!"],
    slamRival: ["Sorry, {name}! Bad steering!", "That one's free, {name}."],
    hitByRival: ["{name}! I'm sending you the bill!", "Easy, {name}!"],
    win: ["Torque wins again!"], lose: ["Back to the garage..."] } },
  Glacier: { id: 'r03', name: 'Milo Finch', lines: {
    start: ["I've run the numbers. You lose.", "Optimal line: mine."],
    passed: ["Statistically inevitable.", "Drag coefficient: superior."],
    overtaken: ["That was NOT in my model!", "Recalculating..."],
    slammed: ["Physics! Look it up!", "Momentum transfer, baby!"],
    hit: ["My sensors! My beautiful sensors!", "That's a violation of... something!"],
    blocked: ["Wait, how?", "Error. Unexpected input."],
    wrecked: ["Catastrophic failure!", "My calculations!"],
    youWrecked: ["Predicted that. 87 percent.", "Science wins!"],
    passRival: ["Out-calculated, {name}.", "Overtake complete, {name}."],
    slamRival: ["Newton says hi, {name}!", "Kinetic energy, {name}!"],
    hitByRival: ["{name}, that was illogical!", "Ow! {name}!"],
    win: ["Q.E.D.!"], lose: ["There was a rounding error."] } },
  Cobalt: { id: 'r04', name: 'Skye Lennox', lines: {
    start: ["Good luck, sweetie!", "Let's make this fun."],
    passed: ["See you at the finish!", "Catch me if you can!"],
    overtaken: ["Rude!", "Ugh, really?"],
    slammed: ["Sorry, not sorry!", "Did that tickle?"],
    hit: ["Watch the hair!", "Hey! I just polished that!"],
    blocked: ["Okay, you're good.", "Hmph."],
    wrecked: ["No no no no!", "That's so unfair!"],
    youWrecked: ["Aww, bless your heart.", "Oopsie!"],
    passRival: ["Bye, {name}!", "Excuse me, {name}!"],
    slamRival: ["Oops, {name}!", "Hi, {name}!"],
    hitByRival: ["{name}, seriously?!", "Watch it, {name}!"],
    win: ["Was there ever a doubt?"], lose: ["Whatever. I let you win."] } },
  Onyx: { id: 'r05', name: 'Smokey Banks', lines: {
    start: ["Kid, I was racing before you hatched.", "Light 'em up."],
    passed: ["Eat my smoke.", "Too slow, chump."],
    overtaken: ["Hey! Show some respect!", "Punk kid..."],
    slammed: ["Heh. Love tap.", "That's how we did it back in my day."],
    hit: ["You knocked my cigar!", "Watch it, hairless!"],
    blocked: ["Not bad, kid.", "Hmph."],
    wrecked: ["Aw, bananas!", "Somebody call my insurance guy."],
    youWrecked: ["Ha! Rookie mistake.", "Heh heh heh."],
    passRival: ["Step aside, {name}.", "Smoke trail, {name}."],
    slamRival: ["Lesson one, {name}.", "Heh. Sorry, {name}."],
    hitByRival: ["{name}, you punk!", "Oi! {name}!"],
    win: ["Still got it."], lose: ["Beginner's luck."] } },
  Viper: { id: 'r06', name: 'Sgt. Hank Kessler', short: 'Sarge', lines: {
    start: ["Eyes front. Engage.", "Mission start."],
    passed: ["Outmaneuvered, soldier.", "Move it or lose it!"],
    overtaken: ["Tactical retreat. Temporary.", "Not on my watch!"],
    slammed: ["Contact! Ha!", "That's an order, private!"],
    hit: ["Taking fire!", "I've had worse in the war."],
    blocked: ["Good reflexes, private.", "Noted."],
    wrecked: ["Man down! Man down!", "I'm hit! I'm hit!"],
    youWrecked: ["Target down.", "Should've stayed in basic."],
    passRival: ["Flanking {name}!", "Passing {name}. Hold the line."],
    slamRival: ["Engaging {name}!", "{name}, you are dismissed!"],
    hitByRival: ["Hostile contact: {name}!", "{name}, stand down!"],
    win: ["Mission accomplished."], lose: ["Regroup. We go again."] } },
  Rose: { id: 'r07', name: 'Valentina Cruz', lines: {
    start: ["Try not to get lost, darling.", "Ready when you are."],
    passed: ["Ciao!", "Too easy."],
    overtaken: ["Oh, you want to play?", "Don't get comfortable."],
    slammed: ["Kiss of the Rose.", "That's for staring."],
    hit: ["How dare you!", "You'll regret that."],
    blocked: ["Clever.", "Next time, darling."],
    wrecked: ["My beautiful ship!", "Unbelievable!"],
    youWrecked: ["Thorns hurt, don't they?", "Such a shame."],
    passRival: ["After you? No. Ciao, {name}.", "Too slow, {name}."],
    slamRival: ["Thorns, {name}.", "Sorry, {name}. Not really."],
    hitByRival: ["{name}, how dare you!", "You will regret that, {name}."],
    win: ["Naturally."], lose: ["Enjoy it. It won't happen again."] } },
  Nebula: { id: 'r08', name: 'Pip "Sprocket" Rivet', short: 'Sprocket', lines: {
    start: ["Small ship, big trouble!", "Let's make some noise!"],
    passed: ["Look down, tall stuff!", "Zoom zoom, sucker!"],
    overtaken: ["Hey! I was using that air!", "Oh, it's ON now."],
    slammed: ["Boom! Gnomed!", "Size isn't everything!"],
    hit: ["My gears! My lovely gears!", "Pick on someone your own size!"],
    blocked: ["Huh. Sneaky.", "Pfft, lucky."],
    wrecked: ["That's coming out of my scrap budget!", "Aaargh! My rig!"],
    youWrecked: ["Hehe, spare parts!", "Gnome sweet gnome!"],
    passRival: ["Squeezing past, {name}!", "Hehe, bye {name}!"],
    slamRival: ["Boop! {name}!", "Gnomed you, {name}!"],
    hitByRival: ["{name}! Pick on someone your size!", "Hey! {name}!"],
    win: ["Punk's not dead!"], lose: ["Grr. Rigged!"] } },
};
export const pilotOf = (team) => (team && PILOTS[team.name]) || null;

// how much each situation matters: a bigger one may cut in over a smaller one still on the card
const RANK = { start: 1, passed: 1, overtaken: 1, passRival: 0, slamRival: 1, hitByRival: 1, blocked: 2, slammed: 3, hit: 3,
  wrecked: 4, youWrecked: 4, win: 5, lose: 5 };
const NEAR = 90;                      // (rivals' own fights: this close to the player, along the track, or nobody hears)
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const P = new Vector3();

export class Comms {
  // parent: the HUD (the bubble is placed over the speaker's ship every frame)
  constructor(parent) {
    const el = (this.el = document.createElement('div'));
    el.id = 'comms';
    el.innerHTML = '<img alt="" decoding="async"><div><b></b><span></span></div>';
    parent.appendChild(el);
    this.img = el.querySelector('img'); this.nameEl = el.querySelector('b'); this.textEl = el.querySelector('span');
    this.enabled = false;
    this.reset();
  }

  set on(v) {
    this.enabled = v;
    if (!v) this.hide();
    else if (!this.loaded) {
      // every face fetched once (676 KB), so a line never waits for its picture
      this.loaded = true;
      for (const p of Object.values(PILOTS)) for (const k in EMOTES) new Image().src = face(p, k);
    }
  }

  reset() {
    this.t = 0;                       // the race's clock as the card knows it
    this.showT = 0;                   // how long the card stays
    this.cur = 0;                     // the rank of what is on it
    this.quiet = 0;                   // no small talk until then
    this.said = new Map();            // pilot -> when it last spoke
    this.ahead = null;                // the rivals ahead of the player at the last look
    this.ranks = null;                // every rival's place at the last look
    this.lookT = 0;
    this.hitBy = null; this.hitT = -9;     // the last rival the player slammed, and when
    this.hide();
  }

  hide() { this.el.classList.remove('on'); this.showT = 0; this.cur = 0; }

  // who: the speaker's race entry; other: the one it talks about (rival against rival)
  say(who, what, other = null) {
    const team = who?.team, p = pilotOf(team), o = pilotOf(other?.team);
    if (!this.enabled || !p) return false;
    const r = RANK[what] ?? 1;
    if (this.showT > 0 && r < this.cur) return false;                       // something bigger on the card
    if (r <= 1 && (this.t < this.quiet || this.t - (this.said.get(p) ?? -99) < 9)) return false;   // small talk spaced out
    if (r === 0 && this.t - (this.rivalT ?? -99) < 12) return false;                             // (and rivals' passing rarer)
    this.img.src = face(p, pick(LOOK[what]));
    this.nameEl.textContent = p.short || p.name;
    this.textEl.textContent = pick(p.lines[what]).replace('{name}', o ? o.short || o.name.split(' ')[0] : 'pal');
    this.el.style.setProperty('--c', team.css);
    this.who = who;
    this.el.classList.remove('on'); void this.el.offsetWidth; this.el.classList.add('on');   // (pops in again)
    this.w = this.el.offsetWidth; this.h = this.el.offsetHeight; this.x = null;
    this.showT = r >= 4 ? 3.2 : 2.6; this.cur = r;
    this.said.set(p, this.t);
    if (other) this.rivalT = this.t;
    this.quiet = this.t + (r <= 1 ? 4 : 2.5);
    return true;
  }

  // each frame of a race: the bubble over its ship, the card's time, and who got past whom (close passes only, not a
  // wreck's or a respawn's)
  update(dt, race, camera) {
    this.t += dt;
    if (this.showT > 0 && (this.showT -= dt) <= 0) this.hide();
    if (this.showT > 0 && camera) this.place(camera);
    if (!this.enabled || !race?.racing || race.player.finished) { this.ahead = null; return; }
    if ((this.lookT -= dt) > 0) return;
    this.lookT = 0.25;
    const me = race.player, pr = race.position(me), now = new Set();
    for (const e of race.entries) if (!e.player && e.rank && e.rank < pr) now.add(e);
    if (this.ahead && race.time > 5) {
      for (const e of race.entries) {
        if (e.player || e.finished || e.racer.ghost > 0 || me.racer.ghost > 0) continue;
        if (Math.abs(e.progress - me.progress) > 60) continue;
        const was = this.ahead.has(e), is = now.has(e);
        if (!was && is && this.say(e, 'passed')) break;
        if (was && !is && this.say(e, 'overtaken')) break;
      }
    }
    this.ahead = now;
    // two rivals near the player swapping places: the one now in front says so
    const ranks = new Map(race.entries.map((e) => [e, e.rank]));
    if (this.ranks && race.time > 5) {
      for (const a of race.entries) {
        if (a.player || a.finished || a.racer.ghost > 0 || Math.abs(a.progress - me.progress) > NEAR) continue;
        const was = this.ranks.get(a);
        if (!(a.rank < was)) continue;
        const b = race.entries.find((o) => !o.player && o !== a && this.ranks.get(o) < was && o.rank > a.rank &&
          !(o.racer.ghost > 0) && Math.abs(o.progress - a.progress) < 30);
        if (b && this.say(a, 'passRival', b)) break;
      }
    }
    this.ranks = ranks;
  }

  // the bubble's point over the speaker's ship (above its hull tag), kept on the screen: a ship out of view keeps it at
  // the edge nearest to it, the pointer then hidden
  place(camera) {
    const root = this.who?.ship?.root;
    if (!root) return;
    P.set(0, 5.2, 0).applyQuaternion(root.quaternion).add(root.position).project(camera);
    const behind = P.z > 1, W = innerWidth, H = innerHeight;
    let x = behind ? -P.x : P.x, y = behind ? -P.y : P.y;
    const off = behind || Math.abs(x) > 1 || Math.abs(y) > 1;
    // out of view: at the side it is towards, half way up (clear of the HUD's corners)
    if (off) { y = Math.min(0.5, Math.max(-0.1, y / Math.max(Math.abs(x), 1e-3))); x = Math.sign(x) || 1; }
    x = (x + 1) / 2 * W; y = (1 - y) / 2 * H;
    const m = 12, w = this.w || 300, h = this.h || 90, top = H * 0.12, bottom = H * 0.18;
    const lx = Math.min(W - w - m, Math.max(m, x - w / 2)), ly = Math.min(H - h - bottom, Math.max(top, y - h - 14));
    const edge = off || lx !== x - w / 2 || ly !== y - h - 14;
    // (eased: the chase camera's shake does not shake the bubble)
    if (this.x == null) { this.x = lx; this.y = ly; } else { this.x += (lx - this.x) * 0.35; this.y += (ly - this.y) * 0.35; }
    this.el.style.transform = `translate(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px)`;
    if (edge !== this.edge) { this.el.classList.toggle('edge', edge); this.edge = edge; }
  }

  // the race's events (main.js, as they come)
  event(e, race) {
    if (!this.enabled || !race) return;
    const me = race.player;
    if (e.type === 'go') {
      this.reset();
      const near = race.entries.filter((o) => !o.player && Math.abs(o.progress - me.progress) < 40);
      if (near.length) setTimeout(() => this.say(pick(near), 'start'), 900);
    } else if (e.type === 'attack' && e.slam) {
      if (e.victim?.player && !e.attacker.player) this.say(e.attacker, 'slammed');
      else if (e.attacker?.player && !e.victim.player) { this.hitBy = e.victim; this.hitT = this.t; this.say(e.victim, 'hit'); }
      else if (e.attacker && e.victim && Math.abs(e.attacker.progress - me.progress) < NEAR) {
        // two rivals fighting near the player: the one who slammed gloats, or the one hit shouts back
        if (Math.random() < 0.5) this.say(e.attacker, 'slamRival', e.victim);
        else this.say(e.victim, 'hitByRival', e.attacker);
      }
    } else if (e.type === 'clash') {
      const other = e.a?.player ? e.b : e.b?.player ? e.a : null;
      if (other) this.say(other, 'blocked');
    } else if (e.type === 'wreck') {
      if (e.player) {
        // the rival who did it (the closest one), laughing
        let best = null, bd = 80;
        for (const o of race.entries) if (!o.player) { const d = o.racer.pos.distanceTo(me.racer.pos); if (d < bd) { bd = d; best = o; } }
        if (best) this.say(best, 'youWrecked');
      } else if (e.entry === this.hitBy && this.t - this.hitT < 4) this.say(e.entry, 'wrecked');
      else if (e.entry.racer.pos.distanceTo(me.racer.pos) < 120) this.say(e.entry, 'wrecked');
    } else if (e.type === 'finish') {
      const order = race.standings();
      if (e.pos === 1) { const second = order.find((o) => !o.player); if (second) this.say(second, 'lose'); }
      else if (!order[0].player) this.say(order[0], 'win');
    }
  }
}
