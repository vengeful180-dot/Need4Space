// The rivals' pilots: a face for each team (six expressions, assets/racers/rNN/e1..e6.webp), a name, and what they say
// when something happens around the player - cards on the right of the screen, stacking upwards as more of them talk
// (Comms), and their faces in the results (hud.js). Setting: "Rival pilots".
import { LAPS } from './race.js';
export const EMOTES = { smirk: 1, laugh: 2, angry: 3, shock: 4, roll: 5, wink: 6 };
export const face = (p, emote) => `./assets/racers/${p.id}/e${EMOTES[emote] || 1}.webp`;

// what each situation looks like on their face (a pick of these)
const LOOK = {
  start: ['smirk', 'wink'], passed: ['wink', 'smirk'], overtaken: ['angry', 'roll'], slammed: ['laugh'], hit: ['shock', 'angry'],
  blocked: ['roll'], wrecked: ['shock'], youWrecked: ['laugh'], win: ['laugh'], lose: ['roll'],
  passRival: ['wink', 'smirk'], passedByRival: ['angry', 'roll'], slamRival: ['laugh', 'smirk'], hitByRival: ['angry', 'shock'],
  retort: ['laugh', 'wink'], spectate: ['laugh', 'shock'], lastLap: ['smirk', 'angry'], fallen: ['laugh'], wallHit: ['laugh', 'roll'],
  lostLead: ['angry'], tookLead: ['wink', 'laugh'], hurt: ['shock', 'angry'], playerLow: ['smirk', 'laugh'], tailing: ['smirk', 'wink'],
};

// by team (race.js TEAMS). The situations:
//   start - the lights go out; passed - they get past the player; overtaken - the player gets past them; slammed - they
//   slam the player; hit - the player slams them; blocked - the player blocks their slam; wrecked - their hull gone;
//   youWrecked - the player's hull gone; win - they win; lose - the player beats them; lastLap - the last lap begins;
//   fallen - the player falls off the track; wallHit - the player hits a wall hard; lostLead - the player takes the lead
//   from them; tookLead - they take it from the player; hurt - their hull nearly gone after the player's hit; playerLow -
//   the player's hull nearly gone; tailing - they sit right behind the player; spectate - watching someone else's slam or
//   wreck near the player;
//   between two rivals close to the player ({name}: the other one): passRival / passedByRival - past another, or passed
//   by it; slamRival / hitByRival - slamming another, or slammed by it; retort - the last word after the other's reply
export const PILOTS = {
  Ember: { id: 'r01', name: 'Roxy Vale', lines: {
    start: ["Try to keep up, rookie.", "Don't blink.", "Hope you said your goodbyes.", "Let's dance."],
    passed: ["Bye bye!", "Was that your top speed?", "Enjoy my exhaust.", "Too slow, cutie."],
    overtaken: ["Oh, you did NOT.", "Enjoy it while it lasts.", "Cute move. Watch this.", "That's it, gloves off."],
    slammed: ["Paint swap, free of charge.", "Oops. Not sorry.", "Felt that? Good.", "Kiss the wall, hotshot."],
    hit: ["Hey! That was my good side!", "You'll pay for that.", "Oh, it's personal now.", "Did you just..."],
    blocked: ["Lucky.", "Fine. Next time.", "Ugh. Show-off.", "You got reflexes. Noted."],
    wrecked: ["My ship!", "Seriously?!", "This is NOT over!", "Somebody's paying for that."],
    youWrecked: ["Ha! Scrap metal!", "That looked expensive.", "Pieces everywhere. Love it.", "Called it."],
    win: ["Never a doubt.", "That's how it's done.", "Bow down."], lose: ["Rematch. Now.", "Beginner's luck.", "Enjoy it. Once."],
    passRival: ["See ya, {name}!", "Move over, {name}.", "Bye, {name}. Mwah.", "Out of my lane, {name}."],
    passedByRival: ["Hey! {name}, really?", "I'm coming back for you, {name}.", "Watch your mirrors, {name}."],
    slamRival: ["Eat that, {name}!", "Nothing personal, {name}.", "Night night, {name}.", "Wall says hi, {name}."],
    hitByRival: ["{name}, you are SO dead!", "Really, {name}?!", "Big mistake, {name}.", "Ow! {name}!"],
    retort: ["Cry about it, {name}.", "Whatever you say, {name}.", "Bring it, {name}.", "Talk is cheap, {name}."],
    spectate: ["Ooh, that'll leave a mark.", "Ha! Front row seats.", "Somebody grab the popcorn.", "Brutal. I love it."],
    lastLap: ["Last lap. Don't choke.", "Final lap, babe. Watch me.", "One lap. Then I win."],
    fallen: ["Mind the gap!", "Gravity's a pain, huh?", "Wrong way, rookie!"],
    wallHit: ["Nice parking.", "The wall's not a shortcut.", "Steering is the round thing, hon."],
    lostLead: ["Give it back. Now.", "Front's MY spot.", "Enjoy the view. Briefly."],
    tookLead: ["My lead now. Bye!", "Watch and learn.", "Back where I belong."],
    hurt: ["I'm hanging by a thread!", "My hull's toast!", "Okay, ouch. Okay."],
    playerLow: ["You're falling apart, sweetheart.", "One more tap and you're done.", "Smoking already?"],
    tailing: ["Right behind you.", "Feel me breathing down your neck?", "Boo."] } },
  Solar: { id: 'r02', name: 'Marcus "Torque" Okafor', short: 'Torque', lines: {
    start: ["Tuned her myself. Let's go.", "Hope you checked your bolts.", "Engines warm. Hands steady.", "Let's see what she's got."],
    passed: ["Should've changed your oil.", "Outta my way, friend.", "Torque beats talk.", "Pardon me, buddy."],
    overtaken: ["Hey, I built this thing!", "Okay, okay. Nice line.", "That's a clean pass. Respect.", "My carburetor's crying."],
    slammed: ["Tighten those panels!", "Whoops, my wrench slipped.", "That's a free alignment.", "Heavy metal, baby!"],
    hit: ["That's coming out of your paycheck!", "My suspension!", "Easy on the paint job!", "Do you know what parts cost?"],
    blocked: ["Solid frame, huh?", "Respect.", "Good build on that one.", "Well, well. Sturdy."],
    wrecked: ["Aw, I just fixed that!", "Gonna need a bigger toolbox.", "My baby!", "Three weeks of work. Gone."],
    youWrecked: ["I can fix that... for a price.", "Ouch. Call me later.", "Tow truck's on the way, buddy.", "That's a total loss."],
    win: ["Torque wins again!", "Built to win.", "Good engine, good driver."], lose: ["Back to the garage...", "Needs a tune-up.", "You earned that one."],
    passRival: ["Pardon me, {name}.", "Coming through, {name}!", "Check your engine, {name}.", "Sorry, {name}. More horsepower."],
    passedByRival: ["{name}! I tuned that ship!", "Lucky gearing, {name}.", "Hey, {name}, no fair!"],
    slamRival: ["Sorry, {name}! Bad steering!", "That one's free, {name}.", "Heavy duty, {name}!", "Buckle up, {name}."],
    hitByRival: ["{name}! I'm sending you the bill!", "Easy, {name}!", "My panels, {name}!", "Hey! {name}, I just fixed that!"],
    retort: ["Talk to my wrench, {name}.", "You want a quote for repairs, {name}?", "Ha! Easy, {name}.", "Sure thing, {name}."],
    spectate: ["Oof. That's a rebuild.", "Somebody call a mechanic. Oh wait.", "That's gonna cost.", "Yikes. Insurance won't cover that."],
    lastLap: ["Last lap. Full throttle.", "Final lap. Pedal down.", "One more. Hold together, girl."],
    fallen: ["Need a tow, friend?", "Gravity always wins.", "Down she goes!"],
    wallHit: ["Your alignment's off.", "Walls don't move, buddy.", "Gonna need body work."],
    lostLead: ["Hey! I had that!", "Okay. Game on.", "Front spot's mine, friend."],
    tookLead: ["Torque's in front!", "Excuse me, coming through.", "Lead's mine, buddy."],
    hurt: ["She's falling apart!", "Hold together, baby!", "I'm leaking everything!"],
    playerLow: ["You're leaking, friend.", "Your engine sounds sick.", "Need a mechanic?"],
    tailing: ["Right on your bumper.", "Smell my exhaust? No, I smell yours.", "Riding your tail, buddy."] } },
  Glacier: { id: 'r03', name: 'Milo Finch', lines: {
    start: ["I've run the numbers. You lose.", "Optimal line: mine.", "Initiating victory protocol.", "Simulations say I win."],
    passed: ["Statistically inevitable.", "Drag coefficient: superior.", "As predicted.", "Overtake executed. 99 percent efficiency."],
    overtaken: ["That was NOT in my model!", "Recalculating...", "Variance! Pure variance!", "My algorithm didn't account for that."],
    slammed: ["Physics! Look it up!", "Momentum transfer, baby!", "F equals MA, sucker!", "Inelastic collision!"],
    hit: ["My sensors! My beautiful sensors!", "That's a violation of... something!", "Ow! My calculations!", "Rude! And unscientific!"],
    blocked: ["Wait, how?", "Error. Unexpected input.", "Statistically improbable.", "That shouldn't be possible."],
    wrecked: ["Catastrophic failure!", "My calculations!", "Critical error!", "Reboot! Reboot!"],
    youWrecked: ["Predicted that. 87 percent.", "Science wins!", "Structural failure confirmed.", "Ha! Called it. Mathematically."],
    win: ["Q.E.D.!", "The numbers never lie.", "Peer review this!"], lose: ["There was a rounding error.", "I demand a recount.", "Outlier result."],
    passRival: ["Out-calculated, {name}.", "Overtake complete, {name}.", "Your line was suboptimal, {name}.", "Math says bye, {name}."],
    passedByRival: ["{name}, that defies logic!", "Anomaly detected: {name}.", "Recalculating {name}..."],
    slamRival: ["Newton says hi, {name}!", "Kinetic energy, {name}!", "Applied physics, {name}!", "Conservation of momentum, {name}!"],
    hitByRival: ["{name}, that was illogical!", "Ow! {name}!", "My sensors, {name}!", "{name}, that's assault on science!"],
    retort: ["Statistically, you're wrong, {name}.", "Citation needed, {name}.", "Your logic is flawed, {name}.", "Data disagrees, {name}."],
    spectate: ["Fascinating impact data!", "That's a lot of kinetic energy.", "I'm recording this for science.", "Textbook collision!"],
    lastLap: ["Final lap. Engaging all algorithms.", "Last lap. Probability of victory: high.", "Final iteration."],
    fallen: ["Gravity: 1. You: 0.", "Classic trajectory error.", "You forgot about gravity."],
    wallHit: ["Wall: immovable. You: movable.", "Collision with static object detected.", "Poor spatial reasoning."],
    lostLead: ["That violates my projections!", "Lead lost. Recalibrating.", "Unacceptable data point."],
    tookLead: ["Lead acquired.", "Optimal position achieved.", "First place. As calculated."],
    hurt: ["Structural integrity critical!", "Hull at 12 percent! Maybe less!", "Systems failing!"],
    playerLow: ["Your hull integrity looks... poor.", "Failure imminent. For you.", "I estimate one hit left."],
    tailing: ["Slipstream acquired.", "Drafting. Very efficient.", "I'm in your wake. Mathematically."] } },
  Cobalt: { id: 'r04', name: 'Skye Lennox', lines: {
    start: ["Good luck, sweetie!", "Let's make this fun.", "Don't cry when you lose, okay?", "Ready, set, sparkle!"],
    passed: ["See you at the finish!", "Catch me if you can!", "Toodles!", "Bye, slowpoke!"],
    overtaken: ["Rude!", "Ugh, really?", "Excuse you!", "Oh, you're brave."],
    slammed: ["Sorry, not sorry!", "Did that tickle?", "Oopsie!", "Bless your heart."],
    hit: ["Watch the hair!", "Hey! I just polished that!", "Ow! My nails!", "How dare you!"],
    blocked: ["Okay, you're good.", "Hmph.", "Show-off.", "Fine, whatever."],
    wrecked: ["No no no no!", "That's so unfair!", "My pretty ship!", "I'm telling everyone!"],
    youWrecked: ["Aww, bless your heart.", "Oopsie!", "Pieces! So many pieces!", "Was that your first race?"],
    win: ["Was there ever a doubt?", "Gold looks good on me.", "Thank you, thank you!"], lose: ["Whatever. I let you win.", "Hmph. Lucky.", "I wasn't even trying."],
    passRival: ["Bye, {name}!", "Excuse me, {name}!", "Toodles, {name}!", "Sorry, {name}! Not really!"],
    passedByRival: ["{name}! So rude!", "Ugh, {name}.", "Hey, {name}, ladies first!"],
    slamRival: ["Oops, {name}!", "Hi, {name}!", "Did that hurt, {name}?", "Bye-bye, {name}!"],
    hitByRival: ["{name}, seriously?!", "Watch it, {name}!", "My hair, {name}!", "{name}! You brute!"],
    retort: ["Aww, poor {name}.", "Bless you, {name}.", "Sure, {name}. Sure.", "Cry me a river, {name}."],
    spectate: ["Ooh! Drama!", "Yikes! That looked painful.", "Somebody's having a bad day.", "Oof. Glad that's not me."],
    lastLap: ["Last lap, sweetie!", "Final lap! Let's go!", "One more lap. Easy peasy."],
    fallen: ["Oopsie daisy!", "Where'd you go, sweetie?", "Bye-bye!"],
    wallHit: ["Aww, poor wall.", "Need driving lessons, sweetie?", "Bonk!"],
    lostLead: ["Hey! That's my spot!", "Rude! Give it back!", "Not cool."],
    tookLead: ["Ladies first!", "Leading looks good on me.", "Thanks for keeping it warm!"],
    hurt: ["I'm falling apart here!", "My poor ship!", "This is a disaster!"],
    playerLow: ["You look terrible, sweetie.", "Need a band-aid?", "Aww, you're smoking."],
    tailing: ["Hiii, right behind you!", "Peekaboo!", "Don't mind me."] } },
  Onyx: { id: 'r05', name: 'Smokey Banks', lines: {
    start: ["Kid, I was racing before you hatched.", "Light 'em up.", "Old monkey, new tricks.", "Hold my cigar. Actually, don't."],
    passed: ["Eat my smoke.", "Too slow, chump.", "Smell that? That's experience.", "Move it, kid."],
    overtaken: ["Hey! Show some respect!", "Punk kid...", "Fine. Have your moment.", "My knees are older than you."],
    slammed: ["Heh. Love tap.", "That's how we did it back in my day.", "Old school, kid.", "Learn from the best."],
    hit: ["You knocked my cigar!", "Watch it, hairless!", "Disrespectful!", "Do that again. I dare ya."],
    blocked: ["Not bad, kid.", "Hmph.", "You've been practicing.", "Smart cookie."],
    wrecked: ["Aw, bananas!", "Somebody call my insurance guy.", "Not the ship! Not again!", "My lucky cigar's ruined!"],
    youWrecked: ["Ha! Rookie mistake.", "Heh heh heh.", "That's what experience looks like.", "Should've stayed home, kid."],
    win: ["Still got it.", "Age before beauty.", "Light me a victory cigar."], lose: ["Beginner's luck.", "I'm getting too old for this.", "Kid's got talent."],
    passRival: ["Step aside, {name}.", "Smoke trail, {name}.", "Respect your elders, {name}.", "Move it, {name}."],
    passedByRival: ["{name}! Show respect!", "Punk {name}...", "You'll keep, {name}."],
    slamRival: ["Lesson one, {name}.", "Heh. Sorry, {name}.", "Old school, {name}.", "Taste the veteran, {name}."],
    hitByRival: ["{name}, you punk!", "Oi! {name}!", "My cigar, {name}!", "{name}! I'll remember that."],
    retort: ["Kid, please, {name}.", "Heh. Cute, {name}.", "Cry to your mama, {name}.", "Get in line, {name}."],
    spectate: ["Heh. Seen worse.", "That's racing, kids.", "Ooh, old school.", "Brings back memories."],
    lastLap: ["Last lap. Time for the old tricks.", "Final lap, kid. Watch the master.", "One more. Then a cigar."],
    fallen: ["Look ma, no track!", "Gravity's a cruel mistress, kid.", "Heh. Down the hole."],
    wallHit: ["Walls don't move, kid.", "Who taught you to drive?", "Heh. Bonk."],
    lostLead: ["Respect the old timer!", "Fine. For now.", "Kid, you're asking for it."],
    tookLead: ["Veteran's in front.", "Watch and learn, kid.", "Back where I belong."],
    hurt: ["She's held together with tape!", "My old girl's dying!", "Bananas! Bananas!"],
    playerLow: ["You're smoking more than me, kid.", "Looking rough, chump.", "One more and you're done."],
    tailing: ["Smell that cigar? I'm right here.", "Breathing down your neck, kid.", "Mind if I tag along?"] } },
  Viper: { id: 'r06', name: 'Sgt. Hank Kessler', short: 'Sarge', lines: {
    start: ["Eyes front. Engage.", "Mission start.", "Lock and load.", "Drop and give me three laps."],
    passed: ["Outmaneuvered, soldier.", "Move it or lose it!", "Flanking complete.", "Left you in the dust, private."],
    overtaken: ["Tactical retreat. Temporary.", "Not on my watch!", "Regroup!", "You'll regret that, soldier."],
    slammed: ["Contact! Ha!", "That's an order, private!", "Direct hit!", "Ram 'em! Ha!"],
    hit: ["Taking fire!", "I've had worse in the war.", "Hostile contact!", "Return fire!"],
    blocked: ["Good reflexes, private.", "Noted.", "Solid defense, soldier.", "Hmph. Trained."],
    wrecked: ["Man down! Man down!", "I'm hit! I'm hit!", "Eject! Eject!", "Mayday! Mayday!"],
    youWrecked: ["Target down.", "Should've stayed in basic.", "Enemy neutralized.", "Clean up on aisle five."],
    win: ["Mission accomplished.", "Victory, soldiers.", "Hooah!"], lose: ["Regroup. We go again.", "Retreat. For now.", "Well fought, soldier."],
    passRival: ["Flanking {name}!", "Passing {name}. Hold the line.", "Outflanked, {name}.", "Advancing past {name}."],
    passedByRival: ["{name}, insubordination!", "{name} broke formation!", "Watch it, {name}!"],
    slamRival: ["Engaging {name}!", "{name}, you are dismissed!", "Direct hit on {name}!", "Take cover, {name}!"],
    hitByRival: ["Hostile contact: {name}!", "{name}, stand down!", "Taking fire from {name}!", "{name}! Court martial!"],
    retort: ["Drop and give me twenty, {name}.", "Dismissed, {name}.", "Zip it, {name}.", "That's an order, {name}."],
    spectate: ["Casualties on the left!", "That's combat, people.", "Medic!", "Ooh-rah. Brutal."],
    lastLap: ["Final lap. Full assault.", "Last lap. No retreat.", "All units: final push."],
    fallen: ["Man overboard!", "You fell out of formation.", "Lost one in the void."],
    wallHit: ["Watch your flank, private.", "Wall: one. You: zero.", "Sloppy, soldier."],
    lostLead: ["Retake the position!", "Lead lost. Counterattack!", "Not for long, private."],
    tookLead: ["Point position secured.", "Taking the lead. Follow me.", "Forward! Ha!"],
    hurt: ["Hull critical! Holding!", "I'm bleeding fuel!", "Damage report: everything!"],
    playerLow: ["You're done, soldier.", "Wave the white flag.", "Your armor's gone."],
    tailing: ["On your six.", "Shadowing the target.", "Got you in my sights."] } },
  Rose: { id: 'r07', name: 'Valentina Cruz', lines: {
    start: ["Try not to get lost, darling.", "Ready when you are.", "Let's make it elegant.", "Ciao, losers."],
    passed: ["Ciao!", "Too easy.", "Adios, darling.", "Watch and learn."],
    overtaken: ["Oh, you want to play?", "Don't get comfortable.", "Bold. I like bold.", "Mm. Brave."],
    slammed: ["Kiss of the Rose.", "That's for staring.", "Thorns, darling.", "Mwah."],
    hit: ["How dare you!", "You'll regret that.", "My paint!", "You're going to pay for that, darling."],
    blocked: ["Clever.", "Next time, darling.", "Hm. Impressive.", "You're quicker than you look."],
    wrecked: ["My beautiful ship!", "Unbelievable!", "This is a tragedy!", "Que horror!"],
    youWrecked: ["Thorns hurt, don't they?", "Such a shame.", "Ciao, darling.", "Pity."],
    win: ["Naturally.", "Of course.", "Elegance wins."], lose: ["Enjoy it. It won't happen again.", "Hm. Well played.", "Next time, darling."],
    passRival: ["After you? No. Ciao, {name}.", "Too slow, {name}.", "Adios, {name}.", "Excuse me, {name}."],
    passedByRival: ["{name}, how rude.", "Enjoy it, {name}.", "Careful, {name}. Thorns."],
    slamRival: ["Thorns, {name}.", "Sorry, {name}. Not really.", "A kiss, {name}.", "Mwah, {name}."],
    hitByRival: ["{name}, how dare you!", "You will regret that, {name}.", "{name}! My paint!", "Oh, {name}. Big mistake."],
    retort: ["Darling, please, {name}.", "So dramatic, {name}.", "Cute, {name}.", "Bye, {name}."],
    spectate: ["Ooh, messy.", "So vulgar. I love it.", "That's going to bruise.", "Tragic. Beautiful."],
    lastLap: ["Last lap, darling. Try to keep up.", "Final lap. Time to shine.", "One more lap. Then champagne."],
    fallen: ["Lost, darling?", "Gravity is so unforgiving.", "Ciao, little one."],
    wallHit: ["Ouch. Inelegant.", "The wall wins, darling.", "That was ugly."],
    lostLead: ["Give it back, darling.", "That's my place.", "Enjoy it. Briefly."],
    tookLead: ["My place, darling.", "Excuse me, first class.", "Ciao from the front."],
    hurt: ["My ship is ruined!", "Barely holding on!", "This is a disaster!"],
    playerLow: ["You look exhausted, darling.", "Falling to pieces?", "Such a mess."],
    tailing: ["Right behind you, darling.", "Feel my thorns?", "I'm your shadow tonight."] } },
  Nebula: { id: 'r08', name: 'Pip "Sprocket" Rivet', short: 'Sprocket', lines: {
    start: ["Small ship, big trouble!", "Let's make some noise!", "Punk rock, baby!", "Light it up!"],
    passed: ["Look down, tall stuff!", "Zoom zoom, sucker!", "Small and fast!", "Hehe! Bye!"],
    overtaken: ["Hey! I was using that air!", "Oh, it's ON now.", "Cheater!", "Pfft. Wait for it."],
    slammed: ["Boom! Gnomed!", "Size isn't everything!", "Pocket rocket!", "Hehe! Bonk!"],
    hit: ["My gears! My lovely gears!", "Pick on someone your own size!", "Hey! Bully!", "That's it, you're scrap!"],
    blocked: ["Huh. Sneaky.", "Pfft, lucky.", "Okay, okay. Nice.", "Grr."],
    wrecked: ["That's coming out of my scrap budget!", "Aaargh! My rig!", "Not my pretty junk!", "Boom. Ow."],
    youWrecked: ["Hehe, spare parts!", "Gnome sweet gnome!", "I'll take those bolts!", "Kaboom! Hehe!"],
    win: ["Punk's not dead!", "Tiny but mighty!", "Bow to the gnome!"], lose: ["Grr. Rigged!", "My ship's too small!", "Next time, big feet."],
    passRival: ["Squeezing past, {name}!", "Hehe, bye {name}!", "Small and fast, {name}!", "Look down, {name}!"],
    passedByRival: ["{name}! I was using that air!", "Hey, {name}, cheater!", "{name}, you big bully!"],
    slamRival: ["Boop! {name}!", "Gnomed you, {name}!", "Bonk, {name}!", "Hehe! Sorry, {name}!"],
    hitByRival: ["{name}! Pick on someone your size!", "Hey! {name}!", "My gears, {name}!", "{name}, you big oaf!"],
    retort: ["Whatever, {name}!", "Hehe, cry more, {name}!", "Bleh, {name}!", "You're just tall, {name}."],
    spectate: ["Ooh! Scrap!", "Kaboom! Love it!", "Hehe! Messy!", "Free parts!"],
    lastLap: ["Last lap! Full punk!", "Final lap! Crank it!", "One more! Rock on!"],
    fallen: ["Bye-bye, big feet!", "Down you go!", "Gravity got ya!"],
    wallHit: ["Bonk! Hehe!", "Wall: one!", "You hit it! Haha!"],
    lostLead: ["Hey! Gimme that!", "Thief!", "Not fair! Not fair!"],
    tookLead: ["Gnome in front!", "Tiny leader!", "Hehe! Mine now!"],
    hurt: ["Held together with spit!", "My rig's dying!", "Aaah! Sparks!"],
    playerLow: ["You're sparking, big feet!", "Falling apart, huh?", "I see loose bolts!"],
    tailing: ["Behind you! Hehe!", "Tailgating! Punk style!", "Can't shake the gnome!"] } },
};
export const pilotOf = (team) => (team && PILOTS[team.name]) || null;

// how much each situation matters: small talk (1 and under) is spaced out, the rest always gets a card
const RANK = { passRival: 0, passedByRival: 0, retort: 1, start: 1, passed: 1, overtaken: 1, slamRival: 1, hitByRival: 1, spectate: 1,
  wallHit: 1, tailing: 1, lastLap: 1, playerLow: 2, blocked: 2, fallen: 2, hurt: 2, slammed: 3, hit: 3, lostLead: 3, tookLead: 3,
  wrecked: 4, youWrecked: 4, win: 5, lose: 5 };
const NEAR = 90;                      // (rivals' own fights: this close to the player, along the track, or nobody hears)
const REPLY = 1.3;                    // (seconds before the other one answers)
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hp = (e) => e.racer.health / (e.racer.maxHealth || 1);

export class Comms {
  // parent: the HUD (the cards stack on its right, the newest on top)
  constructor(parent) {
    const el = (this.el = document.createElement('div'));
    el.id = 'comms';
    parent.appendChild(el);
    this.enabled = false;
    this.cards = [];
    this.reset();
  }

  set on(v) {
    this.enabled = v;
    if (!v) this.clear();
    else if (!this.loaded) {
      // every face fetched once (676 KB), so a line never waits for its picture
      this.loaded = true;
      for (const p of Object.values(PILOTS)) for (const k in EMOTES) new Image().src = face(p, k);
    }
  }

  reset() {
    this.t = 0;                       // the race's clock as the cards know it
    this.quiet = 0;                   // no small talk until then
    this.said = new Map();            // pilot -> when it last spoke
    this.queue = [];                  // replies waiting their turn: { at, who, what, other }
    this.ahead = null;                // the rivals ahead of the player at the last look
    this.ranks = null;                // every rival's place at the last look
    this.lookT = 0;
    this.hitBy = null; this.hitT = -9;     // the last rival the player slammed, and when
    this.lowT = -99; this.tail = null; this.tailT = 0; this.tailSaid = -99;
    this.lastLapSaid = false;
    this.clear();
  }

  clear() { for (const c of this.cards) c.el.remove(); this.cards = []; }

  // the most cards at once: two on a phone (between the lap times and the Slam button), three otherwise
  get max() { return document.body.classList.contains('touch') ? 2 : 3; }

  // who: the speaker's race entry; other: the one it talks about (rival against rival); reply: part of an exchange
  // (not held back by the small-talk spacing)
  say(who, what, other = null, reply = false) {
    const team = who?.team, p = pilotOf(team), o = pilotOf(other?.team);
    if (!this.enabled || !p || !p.lines[what]) return false;
    const r = RANK[what] ?? 1;
    if (!reply && r <= 1 && (this.t < this.quiet || this.t - (this.said.get(p) ?? -99) < 9)) return false;   // small talk spaced out
    if (!reply && r === 0 && this.t - (this.rivalT ?? -99) < 10) return false;                             // (rivals passing rarer)
    if (this.cards.some((c) => c.p === p && c.what === what)) return false;                                // (not twice at once)
    const el = document.createElement('div');
    el.className = 'cm';
    el.style.setProperty('--c', team.css);
    el.innerHTML = `<img alt="" decoding="async" src="${face(p, pick(LOOK[what]))}"><div><b></b><span></span></div>`;
    el.querySelector('b').textContent = p.short || p.name;
    el.querySelector('span').textContent = pick(p.lines[what]).replace('{name}', o ? o.short || o.name.split(' ')[0] : 'pal');
    this.el.appendChild(el);                                    // (the stack grows upwards: the newest on top)
    requestAnimationFrame(() => el.classList.add('on'));
    this.cards.push({ el, p, what, life: r >= 4 ? 4 : 3.2 });
    while (this.cards.length > this.max) this.drop(this.cards[0], true);   // the oldest makes room (at once: no gap left)
    this.said.set(p, this.t);
    if (other) this.rivalT = this.t;
    if (!reply) this.quiet = Math.max(this.quiet, this.t + (r <= 1 ? 4 : 2));
    return true;
  }

  drop(c, now = false) {
    this.cards.splice(this.cards.indexOf(c), 1);
    if (now) { c.el.remove(); return; }
    c.el.classList.remove('on'); c.el.classList.add('out');
    setTimeout(() => c.el.remove(), 260);
  }

  // an exchange: the first line now, the answers after it (each only if the first was said)
  talk(lines) {
    const [first, ...rest] = lines;
    if (!this.say(first.who, first.what, first.other)) return;
    let at = this.t;
    for (const l of rest) { if (l.p != null && Math.random() > l.p) break; at += REPLY; this.queue.push({ ...l, at }); }
  }

  // a third rival close to the player, not one of these
  bystander(race, ...not) {
    const me = race.player;
    const near = race.entries.filter((o) => !o.player && !not.includes(o) && !(o.racer.ghost > 0) && Math.abs(o.progress - me.progress) < NEAR);
    return near.length ? pick(near) : null;
  }

  nearest(race, range = 100) {
    const me = race.player;
    let best = null, bd = range;
    for (const o of race.entries) if (!o.player) { const d = o.racer.pos.distanceTo(me.racer.pos); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  // each frame of a race: the cards' time, the replies due, and who got past whom (close passes only, not a wreck's or a
  // respawn's), the lead changing hands, a rival sitting on the player's tail
  update(dt, race) {
    this.t += dt;
    for (const c of [...this.cards]) if ((c.life -= dt) <= 0) this.drop(c);
    if (!this.enabled || !race?.racing || race.player.finished) { this.ahead = null; this.ranks = null; return; }
    for (const q of [...this.queue]) if (q.at <= this.t) { this.queue.splice(this.queue.indexOf(q), 1); this.say(q.who, q.what, q.other, true); }
    if ((this.lookT -= dt) > 0) return;
    const step = 0.25 - this.lookT;
    this.lookT = 0.25;
    const me = race.player, pr = race.position(me), now = new Set();
    for (const e of race.entries) if (!e.player && e.rank && e.rank < pr) now.add(e);
    const ranks = new Map(race.entries.map((e) => [e, e.rank]));
    if (this.ahead && race.time > 5) {
      const wasFirst = this.ranks?.get(me) === 1;
      if (!wasFirst && pr === 1) {
        const old = race.entries.find((o) => !o.player && this.ranks.get(o) === 1);
        if (old) this.say(old, 'lostLead');
      } else if (wasFirst && pr > 1) {
        const lead = race.entries.find((o) => !o.player && o.rank === 1);
        if (lead) this.say(lead, 'tookLead');
      } else {
        for (const e of race.entries) {
          if (e.player || e.finished || e.racer.ghost > 0 || me.racer.ghost > 0) continue;
          if (Math.abs(e.progress - me.progress) > 60) continue;
          const was = this.ahead.has(e), is = now.has(e);
          if (!was && is && this.say(e, 'passed')) break;
          if (was && !is && this.say(e, 'overtaken')) break;
        }
      }
      // two rivals near the player swapping places: the one now in front says so, the other may answer
      for (const a of race.entries) {
        if (a.player || a.finished || a.racer.ghost > 0 || Math.abs(a.progress - me.progress) > NEAR) continue;
        const was = this.ranks.get(a);
        if (!(a.rank < was)) continue;
        const b = race.entries.find((o) => !o.player && o !== a && this.ranks.get(o) < was && o.rank > a.rank &&
          !(o.racer.ghost > 0) && Math.abs(o.progress - a.progress) < 30);
        if (b) { this.talk([{ who: a, what: 'passRival', other: b }, { who: b, what: 'passedByRival', other: a, p: 0.6 }, { who: a, what: 'retort', other: b, p: 0.4 }]); break; }
      }
      // a rival sitting just behind the player for six seconds
      const tail = race.entries.find((o) => !o.player && !(o.racer.ghost > 0) && me.progress - o.progress > 4 && me.progress - o.progress < 25);
      if (tail && tail === this.tail) this.tailT += step; else { this.tail = tail; this.tailT = 0; }
      if (tail && this.tailT > 6 && this.t - this.tailSaid > 30 && this.say(tail, 'tailing')) this.tailSaid = this.t;
    }
    this.ahead = now;
    this.ranks = ranks;
  }

  // the race's events (main.js, as they come)
  event(e, race) {
    if (!this.enabled || !race) return;
    const me = race.player;
    if (e.type === 'go') {
      this.reset();
      const near = race.entries.filter((o) => !o.player && Math.abs(o.progress - me.progress) < 40);
      if (near.length) {
        const a = pick(near), b = pick(near.filter((o) => o !== a));
        setTimeout(() => this.talk([{ who: a, what: 'start' }, ...(b ? [{ who: b, what: 'start', p: 0.5 }] : [])]), 900);
      }
    } else if (e.type === 'attack' && e.slam) {
      const A = e.attacker, B = e.victim;
      if (!A || !B) return;
      if (B.player) this.talk([{ who: A, what: 'slammed' }, { who: this.bystander(race, A), what: 'spectate', p: 0.35 }]);
      else if (A.player) {
        this.hitBy = B; this.hitT = this.t;
        this.talk([{ who: B, what: hp(B) < 0.3 ? 'hurt' : 'hit' }, { who: this.bystander(race, B), what: 'spectate', p: 0.35 }]);
      } else if (Math.abs(A.progress - me.progress) < NEAR) {
        // two rivals fighting near the player: the one who slammed gloats, the one hit answers, the first has the last word
        this.talk([{ who: A, what: 'slamRival', other: B }, { who: B, what: 'hitByRival', other: A, p: 0.8 }, { who: A, what: 'retort', other: B, p: 0.5 }]);
      }
    } else if (e.type === 'clash') {
      const other = e.a?.player ? e.b : e.b?.player ? e.a : null;
      if (other) this.say(other, 'blocked');
    } else if (e.type === 'wreck') {
      if (e.player) {
        const best = this.nearest(race, 80);
        if (best) this.talk([{ who: best, what: 'youWrecked' }, { who: this.bystander(race, best), what: 'spectate', p: 0.5 }]);
      } else if ((e.entry === this.hitBy && this.t - this.hitT < 4) || e.entry.racer.pos.distanceTo(me.racer.pos) < 120) {
        this.talk([{ who: e.entry, what: 'wrecked' }, { who: this.bystander(race, e.entry), what: 'spectate', p: 0.5 }]);
      }
    } else if (e.type === 'damage' && e.player && hp(me) < 0.25 && this.t - this.lowT > 20) {
      const r = this.nearest(race, 100);
      if (r && this.say(r, 'playerLow')) this.lowT = this.t;
    } else if (e.type === 'fall' && e.player) {
      const r = this.nearest(race, 150);
      if (r) this.say(r, 'fallen');
    } else if (e.type === 'wallfx' && e.player && e.v > 22) {
      const r = this.nearest(race, 80);
      if (r) this.say(r, 'wallHit');
    } else if (e.type === 'lap' && e.lap === LAPS - 1 && !this.lastLapSaid) {
      // the last lap begins: the rival just ahead (or the leader) says so
      this.lastLapSaid = true;
      const ahead = race.standings().filter((o) => !o.player && o.progress > me.progress).pop() || race.standings().find((o) => !o.player);
      if (ahead) this.say(ahead, 'lastLap');
    } else if (e.type === 'finish') {
      const order = race.standings();
      if (e.pos === 1) {
        const second = order.find((o) => !o.player);
        if (second) this.talk([{ who: second, what: 'lose' }, { who: this.bystander(race, second), what: 'spectate', p: 0.4 }]);
      } else if (!order[0].player) this.say(order[0], 'win');
    }
  }
}
