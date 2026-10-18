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
  map: ['smirk', 'laugh', 'roll', 'wink'], agree: ['laugh', 'smirk'], plot: ['angry', 'smirk'], plotJoin: ['smirk', 'wink', 'angry'],
  cheater: ['angry', 'roll'], leaderHurt: ['laugh', 'smirk'], leaderDown: ['laugh', 'wink'],
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
//   by it; slamRival / hitByRival - slamming another, or slammed by it; retort - the last word after the other's reply;
//   map - now and then, about the circuit (one list per circuit), agree - another chiming in; and while the player
//   leads: plot - a rival asking another ({name}) to gang up on the leader, plotJoin - in on it, cheater - calling the
//   leader a cheater, leaderHurt - the leading player's hull taking hits, leaderDown - nearly gone
export const PILOTS = {
  Ember: { id: 'r01', name: 'Roxy Vale', lines: {
    start: ["Try to keep up, rookie.", "Don't blink.", "Hope you said your goodbyes.", "Let's dance."],
    passed: ["Bye bye!", "Was that your top speed?", "Enjoy my exhaust.", "Too slow, cutie.", "Keep up, keep up.", "Window's closing, rookie.", "And that's how it's done."],
    overtaken: ["Oh, you did NOT.", "Enjoy it while it lasts.", "Cute move. Watch this.", "That's it, gloves off.", "Hey! I was saving that spot.", "Okay, now I'm awake.", "You'll see me again. Soon."],
    slammed: ["Paint swap, free of charge.", "Oops. Not sorry.", "Felt that? Good.", "Kiss the wall, hotshot.", "Special delivery!", "That's what you get, hotshot.", "Shake it off. Oh wait, you can't."],
    hit: ["Hey! That was my good side!", "You'll pay for that.", "Oh, it's personal now.", "Did you just...", "Rude! So rude!", "Mark my words. Payback.", "Okay, you're on my list."],
    blocked: ["Lucky.", "Fine. Next time.", "Ugh. Show-off.", "You got reflexes. Noted."],
    wrecked: ["My ship!", "Seriously?!", "This is NOT over!", "Somebody's paying for that."],
    youWrecked: ["Ha! Scrap metal!", "That looked expensive.", "Pieces everywhere. Love it.", "Called it."],
    map: {
      space: ["Nice view. Shame you'll only see my tail.", "That derelict gives me the creeps.", "Loop coming. Try not to throw up.", "Gas giant on the left, losers behind."],
      forest: ["Is that a skull? Cute.", "A river over the track. Sure. Why not.", "This moon smells like wet socks.", "Caves. Great. Love the dark."],
      ice: ["Freezing my braid off out here.", "Storm's coming. So am I.", "Don't slip on the floes, rookie.", "Aurora's pretty. I'm prettier."],
      desert: ["Sand in my suit. Again.", "Sunset racing. Romantic, huh?", "Sandstorm ahead. Hold your breath.", "This heat is ruining my hair."],
      ocean: ["Hope your ship floats.", "Anyone else see the giant squid?!", "Diving in. Don't drown, rookie.", "Rain, waves, lightning. Perfect date."],
    },
    agree: ["Ha! Right, {name}?", "Tell me about it, {name}.", "Preach, {name}.", "For once you're right, {name}."],
    plot: ["{name}, that leader's way too fast. Cheating?", "Hey {name}, let's box the leader in.", "{name}, you seeing this? Nobody's that clean.", "Somebody take the leader out. {name}?"],
    plotJoin: ["I'm in, {name}.", "On it, {name}. Squeeze 'em.", "Way ahead of you, {name}.", "Deal, {name}. Wall them."],
    cheater: ["Cheater! Check that ship!", "Nobody's that fast. Hacks!", "Somebody check their boosters!", "Leader's cheating. Calling it."],
    leaderHurt: ["Ooh, the leader's bleeding!", "Cracks in the crown, hotshot.", "Not so shiny now, are you?", "Leader's smoking! Keep hitting!", "Oh, that dented the ego."],
    leaderDown: ["One more hit and that crown's mine!", "Leader's on fumes! Finish it!", "Bye-bye, first place.", "Who's laughing now, champ?", "Smell that? That's your hull giving up."],
    win: ["Never a doubt.", "That's how it's done.", "Bow down."], lose: ["Rematch. Now.", "Beginner's luck.", "Enjoy it. Once."],
    passRival: ["See ya, {name}!", "Move over, {name}.", "Bye, {name}. Mwah.", "Out of my lane, {name}.", "Later, {name}!", "Enjoy the view, {name}.", "Lane's mine now, {name}."],
    passedByRival: ["Hey! {name}, really?", "I'm coming back for you, {name}.", "Watch your mirrors, {name}.", "Not cool, {name}.", "Enjoy it, {name}. It won't last.", "{name}, I see you."],
    slamRival: ["Eat that, {name}!", "Nothing personal, {name}.", "Night night, {name}.", "Wall says hi, {name}.", "Bye-bye, {name}!", "That's for earlier, {name}.", "Oops, {name}. Totally an accident."],
    hitByRival: ["{name}, you are SO dead!", "Really, {name}?!", "Big mistake, {name}.", "Ow! {name}!", "{name}, you're gonna regret that.", "Watch the paint, {name}!", "Okay, {name}. War."],
    retort: ["Cry about it, {name}.", "Whatever you say, {name}.", "Bring it, {name}.", "Talk is cheap, {name}.", "Aww, {name}'s upset.", "Bless your heart, {name}. Wait, that's Skye's line.", "Keep crying, {name}."],
    spectate: ["Ooh, that'll leave a mark.", "Ha! Front row seats.", "Somebody grab the popcorn.", "Brutal. I love it.", "Yikes. Someone's having a day.", "Not my problem. Love it.", "Ha! Called it."],
    lastLap: ["Last lap. Don't choke.", "Final lap, babe. Watch me.", "One lap. Then I win."],
    fallen: ["Mind the gap!", "Gravity's a pain, huh?", "Wrong way, rookie!", "Track's up here, genius.", "Bye-bye!", "Somebody forgot the floor."],
    wallHit: ["Nice parking.", "The wall's not a shortcut.", "Steering is the round thing, hon.", "Did the wall insult your mother?", "Ooh, that scraped.", "Wall hugger.", "You and that wall. Get a room.", "Graceful. Really."],
    lostLead: ["Give it back. Now.", "Front's MY spot.", "Enjoy the view. Briefly."],
    tookLead: ["My lead now. Bye!", "Watch and learn.", "Back where I belong."],
    hurt: ["I'm hanging by a thread!", "My hull's toast!", "Okay, ouch. Okay."],
    playerLow: ["You're falling apart, sweetheart.", "One more tap and you're done.", "Smoking already?"],
    tailing: ["Right behind you.", "Feel me breathing down your neck?", "Boo.", "Can't shake me, hon.", "Getting cozy back here.", "I'm your shadow now."] } },
  Solar: { id: 'r02', name: 'Marcus "Torque" Okafor', short: 'Torque', lines: {
    start: ["Tuned her myself. Let's go.", "Hope you checked your bolts.", "Engines warm. Hands steady.", "Let's see what she's got."],
    passed: ["Should've changed your oil.", "Outta my way, friend.", "Torque beats talk.", "Pardon me, buddy.", "Torque's got torque.", "Smooth shift, buddy.", "Bye now. Drive safe."],
    overtaken: ["Hey, I built this thing!", "Okay, okay. Nice line.", "That's a clean pass. Respect.", "My carburetor's crying.", "Nice engine. Who built it?", "Alright, alright, I see you.", "That's a good line. Stealing it."],
    slammed: ["Tighten those panels!", "Whoops, my wrench slipped.", "That's a free alignment.", "Heavy metal, baby!", "Little nudge, friend.", "That's a love tap from a big guy.", "Check your suspension, buddy."],
    hit: ["That's coming out of your paycheck!", "My suspension!", "Easy on the paint job!", "Do you know what parts cost?", "Watch the bodywork!", "Hey! That's fresh paint!", "Ugh, there goes my weekend."],
    blocked: ["Solid frame, huh?", "Respect.", "Good build on that one.", "Well, well. Sturdy."],
    wrecked: ["Aw, I just fixed that!", "Gonna need a bigger toolbox.", "My baby!", "Three weeks of work. Gone."],
    youWrecked: ["I can fix that... for a price.", "Ouch. Call me later.", "Tow truck's on the way, buddy.", "That's a total loss."],
    map: {
      space: ["Vacuum's murder on the seals.", "That derelict's got good parts in it.", "Upside down through the hold. Hold your lunch.", "Meteor ahead. Duck!"],
      forest: ["Moss in my intake again.", "Who parks a giant skull on a racetrack?", "That tree's older than my wrench.", "Caves are hard on the headlights."],
      ice: ["Cold engine, angry engine.", "My oil's turning to jelly.", "Glacier ahead. Don't scratch her.", "Storm's gonna rattle every bolt."],
      desert: ["Sand gets in everything. Everything.", "My radiator hates this place.", "Natural bridges. Unnatural speeds.", "Gravity flip. Check your straps."],
      ocean: ["Salt water. My bearings are crying.", "She's not built for diving, folks.", "Rain on the deck. Easy on the brakes.", "Was that a squid? I'm not fixing that."],
    },
    agree: ["Ha! You said it, {name}.", "True, {name}. True.", "Couldn't agree more, {name}.", "Heh. Good one, {name}."],
    plot: ["{name}, that leader's ship isn't stock. I know engines.", "{name}, let's lean on the leader.", "Something's fishy up front, {name}.", "{name}, help me slow that leader down."],
    plotJoin: ["Count me in, {name}.", "I'll bring the wrench, {name}.", "Right behind you, {name}.", "Heavy duty, {name}. Let's go."],
    cheater: ["That's not a legal engine!", "Turbo kit! I can hear it!", "Cheater! I know what stock sounds like!", "Somebody check the leader's tuning!"],
    leaderHurt: ["Leader's leaking oil, folks!", "Hear that rattle? That's first place.", "Panels coming loose up front!", "Told you it wasn't built right.", "That's a costly dent, leader."],
    leaderDown: ["Leader's held together with tape now!", "One more tap and she falls apart!", "I'd scrap that ship, buddy.", "Engine's dying up front!", "Somebody call the leader a tow truck!"],
    win: ["Torque wins again!", "Built to win.", "Good engine, good driver."], lose: ["Back to the garage...", "Needs a tune-up.", "You earned that one."],
    passRival: ["Pardon me, {name}.", "Coming through, {name}!", "Check your engine, {name}.", "Sorry, {name}. More horsepower.", "Big engine, {name}. Sorry.", "Make way, {name}.", "Smooth pass, if I say so, {name}."],
    passedByRival: ["{name}! I tuned that ship!", "Lucky gearing, {name}.", "Hey, {name}, no fair!", "{name}, who tuned that?", "Easy, {name}.", "Alright, {name}. Round two."],
    slamRival: ["Sorry, {name}! Bad steering!", "That one's free, {name}.", "Heavy duty, {name}!", "Buckle up, {name}.", "Steel beats paint, {name}.", "Ooh. Sorry, {name}. Kind of.", "Feel that torque, {name}?"],
    hitByRival: ["{name}! I'm sending you the bill!", "Easy, {name}!", "My panels, {name}!", "Hey! {name}, I just fixed that!", "{name}! That's my good fender!", "Watch it, {name}!", "Ugh, {name}. Parts aren't free."],
    retort: ["Talk to my wrench, {name}.", "You want a quote for repairs, {name}?", "Ha! Easy, {name}.", "Sure thing, {name}.", "Come by the garage, {name}. I'll fix your attitude.", "Easy, tiger. {name}.", "Heh. Sure, {name}."],
    spectate: ["Oof. That's a rebuild.", "Somebody call a mechanic. Oh wait.", "That's gonna cost.", "Yikes. Insurance won't cover that.", "That'll need a full rebuild.", "Ooh, I felt that one.", "Somebody get the toolbox."],
    lastLap: ["Last lap. Full throttle.", "Final lap. Pedal down.", "One more. Hold together, girl."],
    fallen: ["Need a tow, friend?", "Gravity always wins.", "Down she goes!", "Need a winch, friend?", "Lost something? Like the track?", "Tow cable's in the back."],
    wallHit: ["Your alignment's off.", "Walls don't move, buddy.", "Gonna need body work.", "That's a dent you'll feel in your wallet.", "I can hear your panels crying.", "Easy! That's somebody's hard work.", "Want me to look at your steering?", "Body shop's open after the race."],
    lostLead: ["Hey! I had that!", "Okay. Game on.", "Front spot's mine, friend."],
    tookLead: ["Torque's in front!", "Excuse me, coming through.", "Lead's mine, buddy."],
    hurt: ["She's falling apart!", "Hold together, baby!", "I'm leaking everything!"],
    playerLow: ["You're leaking, friend.", "Your engine sounds sick.", "Need a mechanic?"],
    tailing: ["Right on your bumper.", "Smell my exhaust? No, I smell yours.", "Riding your tail, buddy.", "Right on your tail, friend.", "Don't brake check me, buddy.", "Just drafting. Totally innocent."] } },
  Glacier: { id: 'r03', name: 'Milo Finch', lines: {
    start: ["I've run the numbers. You lose.", "Optimal line: mine.", "Initiating victory protocol.", "Simulations say I win."],
    passed: ["Statistically inevitable.", "Drag coefficient: superior.", "As predicted.", "Overtake executed. 99 percent efficiency.", "Aerodynamics, people.", "Efficiency wins.", "My algorithm says goodbye."],
    overtaken: ["That was NOT in my model!", "Recalculating...", "Variance! Pure variance!", "My algorithm didn't account for that.", "Unexpected variable!", "Hold on, re-running the simulation.", "That was... statistically rude."],
    slammed: ["Physics! Look it up!", "Momentum transfer, baby!", "F equals MA, sucker!", "Inelastic collision!", "Impulse delivered!", "That's applied science!", "Momentum! Glorious momentum!"],
    hit: ["My sensors! My beautiful sensors!", "That's a violation of... something!", "Ow! My calculations!", "Rude! And unscientific!", "My hull plating!", "That's not peer reviewed!", "Ouch! Data loss!"],
    blocked: ["Wait, how?", "Error. Unexpected input.", "Statistically improbable.", "That shouldn't be possible."],
    wrecked: ["Catastrophic failure!", "My calculations!", "Critical error!", "Reboot! Reboot!"],
    youWrecked: ["Predicted that. 87 percent.", "Science wins!", "Structural failure confirmed.", "Ha! Called it. Mathematically."],
    map: {
      space: ["Fun fact: nobody hears you scream up here.", "That derelict's hull is 40 percent intact. I checked.", "The loop is pure physics. I love it.", "Glass tunnel stress tolerance: questionable."],
      forest: ["The flora here is fascinating. And in the way.", "A skull that size implies a very large... nope.", "A river upside down! My brain hurts!", "Cave humidity: 98 percent. Ew."],
      ice: ["Ambient temperature: minus forty. Hands: shaking.", "Aurora: solar wind. You're welcome.", "Crevasse depth: unknown. Don't fall.", "The storm front is closing at 60 km/h."],
      desert: ["Surface temperature: way too hot.", "Sand friction coefficient: terrible.", "Those ruins predate everything. Fascinating!", "Dust devils! Tiny tornadoes! Cool!"],
      ocean: ["Water density matters when we dive!", "A squid that size shouldn't exist! Science!", "Lightning plus water. Great idea, organizers.", "Those pillars aren't natural. Alien. Probably."],
    },
    agree: ["Correct, {name}.", "Statistically true, {name}.", "Data supports that, {name}.", "Agreed, {name}. Peer reviewed."],
    plot: ["{name}, the leader's lap times are statistically impossible.", "{name}, I propose a tactical blockade.", "{name}, probability of cheating: 94 percent.", "{name}, if we both slam them, physics wins."],
    plotJoin: ["Calculating the ambush, {name}.", "Optimal plan, {name}. I'm in.", "Joining the blockade, {name}.", "Affirmative, {name}. Squeeze protocol."],
    cheater: ["Those lap times are impossible!", "Statistical anomaly! Cheater!", "I demand an inspection!", "That speed violates physics!"],
    leaderHurt: ["Leader hull integrity dropping!", "Damage confirmed on the leader.", "The math is turning in our favor!", "Hypothesis: the leader is fragile. Confirmed.", "Leader efficiency down 30 percent!"],
    leaderDown: ["Leader integrity critical! Engage!", "Probability of the leader surviving: low.", "One more impact. Calculated.", "The leader is a statistical goner!", "Structural failure imminent up front!"],
    win: ["Q.E.D.!", "The numbers never lie.", "Peer review this!"], lose: ["There was a rounding error.", "I demand a recount.", "Outlier result."],
    passRival: ["Out-calculated, {name}.", "Overtake complete, {name}.", "Your line was suboptimal, {name}.", "Math says bye, {name}.", "Superior aerodynamics, {name}.", "Bye, {name}. Science wins.", "Overtake logged, {name}."],
    passedByRival: ["{name}, that defies logic!", "Anomaly detected: {name}.", "Recalculating {name}...", "{name}, that wasn't in my data!", "Statistically, {name}, that's rude.", "Recalibrating for {name}."],
    slamRival: ["Newton says hi, {name}!", "Kinetic energy, {name}!", "Applied physics, {name}!", "Conservation of momentum, {name}!", "Momentum, {name}!", "Science hurts, {name}!", "Impact successful, {name}!"],
    hitByRival: ["{name}, that was illogical!", "Ow! {name}!", "My sensors, {name}!", "{name}, that's assault on science!", "{name}! My equipment!", "That's unscientific, {name}!", "{name}, I'm filing a report!"],
    retort: ["Statistically, you're wrong, {name}.", "Citation needed, {name}.", "Your logic is flawed, {name}.", "Data disagrees, {name}.", "Your hypothesis is weak, {name}.", "Source? {name}?", "Debunked, {name}."],
    spectate: ["Fascinating impact data!", "That's a lot of kinetic energy.", "I'm recording this for science.", "Textbook collision!", "That's going in my research paper.", "The energy transfer! Beautiful!", "Fascinating debris pattern."],
    lastLap: ["Final lap. Engaging all algorithms.", "Last lap. Probability of victory: high.", "Final iteration."],
    fallen: ["Gravity: 1. You: 0.", "Classic trajectory error.", "You forgot about gravity.", "Trajectory: downward.", "Escape velocity: not reached.", "Physics claims another victim."],
    wallHit: ["Collision with a static object detected.", "Poor spatial reasoning.", "Fascinating. You chose the wall.", "That impact was 100 percent avoidable.", "Have you considered... not doing that?", "Elastic collision. Barely.", "The wall's coordinates were known, you know.", "My simulation never hits walls."],
    lostLead: ["That violates my projections!", "Lead lost. Recalibrating.", "Unacceptable data point."],
    tookLead: ["Lead acquired.", "Optimal position achieved.", "First place. As calculated."],
    hurt: ["Structural integrity critical!", "Hull at 12 percent! Maybe less!", "Systems failing!"],
    playerLow: ["Your hull integrity looks... poor.", "Failure imminent. For you.", "I estimate one hit left."],
    tailing: ["Slipstream acquired.", "Drafting. Very efficient.", "I'm in your wake. Mathematically.", "Slipstream efficiency: 14 percent gain.", "Optimal following distance achieved.", "Tailing you. For science."] } },
  Cobalt: { id: 'r04', name: 'Skye Lennox', lines: {
    start: ["Good luck, sweetie!", "Let's make this fun.", "Don't cry when you lose, okay?", "Ready, set, sparkle!"],
    passed: ["See you at the finish!", "Catch me if you can!", "Toodles!", "Bye, slowpoke!", "Kisses!", "Too fast for you, sweetie!", "See ya, wouldn't wanna be ya!"],
    overtaken: ["Rude!", "Ugh, really?", "Excuse you!", "Oh, you're brave.", "Hey! Not nice!", "You're lucky I like you.", "Ugh, fine."],
    slammed: ["Sorry, not sorry!", "Did that tickle?", "Oopsie!", "Bless your heart.", "Love tap!", "Oh no! Did I do that?", "Hehe! Bump!"],
    hit: ["Watch the hair!", "Hey! I just polished that!", "Ow! My nails!", "How dare you!", "Ow! Meanie!", "My makeup!", "Not the paint!"],
    blocked: ["Okay, you're good.", "Hmph.", "Show-off.", "Fine, whatever."],
    wrecked: ["No no no no!", "That's so unfair!", "My pretty ship!", "I'm telling everyone!"],
    youWrecked: ["Aww, bless your heart.", "Oopsie!", "Pieces! So many pieces!", "Was that your first race?"],
    map: {
      space: ["Stars are so pretty! Focus, Skye.", "Ew, that old ship is so dusty.", "Loops make my hair go crazy.", "Space is so... spacey."],
      forest: ["Bugs! There are bugs!", "Aww, glowworms!", "That skull is so not cute.", "A river above the track? Rude."],
      ice: ["Brrr! My nails are freezing!", "Ooh, the aurora is gorgeous!", "Ice is so slippery. Ugh.", "This storm is ruining my look."],
      desert: ["Sand in my hair. Again.", "Perfect tanning weather!", "Is that a mirage or a ruin?", "Sandstorm! Close the windows!"],
      ocean: ["Ooh, a moon! So romantic!", "I can't swim in this suit!", "Something with tentacles just waved at me!", "Rain is ruining my hair."],
    },
    agree: ["Totally, {name}!", "Ha! So true, {name}!", "Right?! {name}!", "Love that, {name}!"],
    plot: ["{name}, is the leader cheating? Like, totally?", "{name}, let's gang up on them. Teehee.", "{name}, that leader needs a little bump.", "Psst, {name}. Wanna knock the leader down?"],
    plotJoin: ["Ooh, I'm in, {name}!", "Yes! Let's get 'em, {name}!", "Count me in, {name}!", "On it, {name}! So fun!"],
    cheater: ["Ew, cheater!", "Nobody's that good. Cheating!", "That's so unfair! Cheater!", "Somebody report them!"],
    leaderHurt: ["Aww, the leader's all scratched!", "Not so perfect now, sweetie!", "Ooh, that left a mark!", "Leader's looking rough!", "Hehe, the leader's sparkling. Not the good way."],
    leaderDown: ["Bye-bye, little leader!", "One more bump, sweetie!", "Leader's falling apart! Yay!", "Aww, almost done!", "First place looks so tired!"],
    win: ["Was there ever a doubt?", "Gold looks good on me.", "Thank you, thank you!"], lose: ["Whatever. I let you win.", "Hmph. Lucky.", "I wasn't even trying."],
    passRival: ["Bye, {name}!", "Excuse me, {name}!", "Toodles, {name}!", "Sorry, {name}! Not really!", "Hehe, bye {name}!", "Catch up, {name}!", "Smooches, {name}!"],
    passedByRival: ["{name}! So rude!", "Ugh, {name}.", "Hey, {name}, ladies first!", "{name}, that's mean!", "Rude, {name}!", "Ugh! {name}!"],
    slamRival: ["Oops, {name}!", "Hi, {name}!", "Did that hurt, {name}?", "Bye-bye, {name}!", "Hehe! Bump, {name}!", "Love tap, {name}!", "Whoopsie, {name}!"],
    hitByRival: ["{name}, seriously?!", "Watch it, {name}!", "My hair, {name}!", "{name}! You brute!", "{name}, you meanie!", "Ow! {name}!", "{name}! My paint!"],
    retort: ["Aww, poor {name}.", "Bless you, {name}.", "Sure, {name}. Sure.", "Cry me a river, {name}.", "Whatever, {name}!", "Hehe, poor {name}!", "Nope, {name}!"],
    spectate: ["Ooh! Drama!", "Yikes! That looked painful.", "Somebody's having a bad day.", "Oof. Glad that's not me.", "Ooh, juicy!", "Somebody's grounded!", "Eek! Glad that's not me!"],
    lastLap: ["Last lap, sweetie!", "Final lap! Let's go!", "One more lap. Easy peasy."],
    fallen: ["Oopsie daisy!", "Where'd you go, sweetie?", "Bye-bye!", "Wheee! Oh no.", "Where'd you go?", "Fly, little birdie!"],
    wallHit: ["Aww, poor wall.", "Need driving lessons, sweetie?", "Oof! That looked expensive.", "Was the wall in your way, hon?", "Hehe, scrape!", "Oh no, your paint!", "Walls are friends, not food.", "Bless your steering."],
    lostLead: ["Hey! That's my spot!", "Rude! Give it back!", "Not cool."],
    tookLead: ["Ladies first!", "Leading looks good on me.", "Thanks for keeping it warm!"],
    hurt: ["I'm falling apart here!", "My poor ship!", "This is a disaster!"],
    playerLow: ["You look terrible, sweetie.", "Need a band-aid?", "Aww, you're smoking."],
    tailing: ["Hiii, right behind you!", "Peekaboo!", "Don't mind me.", "Hi, I'm right here!", "Following you, sweetie!", "Boop! Behind you!"] } },
  Onyx: { id: 'r05', name: 'Smokey Banks', lines: {
    start: ["Kid, I was racing before you hatched.", "Light 'em up.", "Old monkey, new tricks.", "Hold my cigar. Actually, don't."],
    passed: ["Eat my smoke.", "Too slow, chump.", "Smell that? That's experience.", "Move it, kid.", "Slow and steady? Nah.", "Experience, kid.", "Bye, chump."],
    overtaken: ["Hey! Show some respect!", "Punk kid...", "Fine. Have your moment.", "My knees are older than you.", "Kids these days.", "Hmph. Enjoy your moment.", "I'll be back, kid."],
    slammed: ["Heh. Love tap.", "That's how we did it back in my day.", "Old school, kid.", "Learn from the best.", "Old school bump.", "Heh. Learn something.", "That's a veteran's welcome."],
    hit: ["You knocked my cigar!", "Watch it, hairless!", "Disrespectful!", "Do that again. I dare ya.", "My fur!", "Disrespect!", "Kid, you're gonna regret that."],
    blocked: ["Not bad, kid.", "Hmph.", "You've been practicing.", "Smart cookie."],
    wrecked: ["Aw, bananas!", "Somebody call my insurance guy.", "Not the ship! Not again!", "My lucky cigar's ruined!"],
    youWrecked: ["Ha! Rookie mistake.", "Heh heh heh.", "That's what experience looks like.", "Should've stayed home, kid."],
    map: {
      space: ["Back in my day, space was cleaner.", "That derelict? I raced her captain once.", "Loop-de-loops. Kid stuff.", "Meteor. Seen bigger."],
      forest: ["Jungle moon. Smells like home.", "Bananas up there? No? Shame.", "Who left their skull out?", "Caves. Watch for bats, kid."],
      ice: ["Cold's bad for the cigar.", "My fur's frozen stiff.", "Aurora. Pretty. Now move.", "Ice racing. My old knees hate it."],
      desert: ["Hot enough to light my cigar without a match.", "Sand. My old enemy.", "These ruins were old when I was young.", "Sandstorm. Keep your mouth shut, kid."],
      ocean: ["Monkeys and water don't mix, kid.", "Wet cigar. Worst day of my life.", "That squid owes me money.", "Storm's coming. Hold onto your tail."],
    },
    agree: ["Heh. True, {name}.", "Smart cookie, {name}.", "Kid's right, {name}.", "Yep, {name}. Seen it before."],
    plot: ["{name}, that kid up front's too lucky.", "{name}, let's teach the leader some manners.", "{name}, old trick: squeeze 'em into the wall.", "{name}, nobody leads my race. Let's go."],
    plotJoin: ["Heh. I'm in, {name}.", "Like the old days, {name}.", "Let's squeeze 'em, {name}.", "You got it, {name}."],
    cheater: ["Kid's cheating. I've seen it all.", "Nobody's that fast without tricks!", "Cheater! In my day we'd fix that.", "Something stinks up front. And it ain't my cigar."],
    leaderHurt: ["Heh. Leader's getting tenderized.", "Wobbly up front, kid?", "That's what leading gets you.", "Leader's taking a beating. Heh.", "Kid's learning the hard way."],
    leaderDown: ["Leader's done, kid. Done.", "One more and they're scrap.", "Hang up the gloves, champ.", "Light me a cigar. Leader's toast.", "Time to retire, kid."],
    win: ["Still got it.", "Age before beauty.", "Light me a victory cigar."], lose: ["Beginner's luck.", "I'm getting too old for this.", "Kid's got talent."],
    passRival: ["Step aside, {name}.", "Smoke trail, {name}.", "Respect your elders, {name}.", "Move it, {name}.", "Out of my way, {name}.", "Experience, {name}.", "Bye, {name}."],
    passedByRival: ["{name}! Show respect!", "Punk {name}...", "You'll keep, {name}.", "Kid {name}...", "Show respect, {name}!", "Hmph. {name}."],
    slamRival: ["Lesson one, {name}.", "Heh. Sorry, {name}.", "Old school, {name}.", "Taste the veteran, {name}.", "Heh. Welcome, {name}.", "Learn something, {name}.", "Back in my day, {name}..."],
    hitByRival: ["{name}, you punk!", "Oi! {name}!", "My cigar, {name}!", "{name}! I'll remember that.", "Watch the fur, {name}!", "{name}! Disrespect!", "Kid {name}, you'll pay."],
    retort: ["Kid, please, {name}.", "Heh. Cute, {name}.", "Cry to your mama, {name}.", "Get in line, {name}.", "Heh. Sure, {name}.", "Whatever you say, {name}.", "Go cry, {name}."],
    spectate: ["Heh. Seen worse.", "That's racing, kids.", "Ooh, old school.", "Brings back memories.", "Heh. Classic.", "Seen it a hundred times.", "That's racing."],
    lastLap: ["Last lap. Time for the old tricks.", "Final lap, kid. Watch the master.", "One more. Then a cigar."],
    fallen: ["Look ma, no track!", "Gravity's a cruel mistress, kid.", "Heh. Down the hole.", "Heh. Off the edge.", "Kid flew the coop.", "Look out below!"],
    wallHit: ["Walls don't move, kid.", "Who taught you to drive?", "Rookies and walls. Name a better duo.", "That's gonna leave a mark, kid.", "In my day we steered.", "Kissed the wall, huh?", "Scraping paint like a pro.", "Heh. Sparks. Pretty."],
    lostLead: ["Respect the old timer!", "Fine. For now.", "Kid, you're asking for it."],
    tookLead: ["Veteran's in front.", "Watch and learn, kid.", "Back where I belong."],
    hurt: ["She's held together with tape!", "My old girl's dying!", "Bananas! Bananas!"],
    playerLow: ["You're smoking more than me, kid.", "Looking rough, chump.", "One more and you're done."],
    tailing: ["Smell that cigar? I'm right here.", "Breathing down your neck, kid.", "Mind if I tag along?", "Right behind you, kid.", "Smell the smoke yet?", "Old monkey, close behind."] } },
  Viper: { id: 'r06', name: 'Sgt. Hank Kessler', short: 'Sarge', lines: {
    start: ["Eyes front. Engage.", "Mission start.", "Lock and load.", "Drop and give me three laps."],
    passed: ["Outmaneuvered, soldier.", "Move it or lose it!", "Flanking complete.", "Left you in the dust, private.", "Outpaced, soldier.", "Keep up, private!", "Advance! Ha!"],
    overtaken: ["Tactical retreat. Temporary.", "Not on my watch!", "Regroup!", "You'll regret that, soldier.", "Hold the line!", "Fall back and regroup!", "You'll pay for that, private."],
    slammed: ["Contact! Ha!", "That's an order, private!", "Direct hit!", "Ram 'em! Ha!", "Shock and awe!", "Incoming! Ha!", "That's tactical, soldier."],
    hit: ["Taking fire!", "I've had worse in the war.", "Hostile contact!", "Return fire!", "We're hit!", "Damage control!", "Hostile fire!"],
    blocked: ["Good reflexes, private.", "Noted.", "Solid defense, soldier.", "Hmph. Trained."],
    wrecked: ["Man down! Man down!", "I'm hit! I'm hit!", "Eject! Eject!", "Mayday! Mayday!"],
    youWrecked: ["Target down.", "Should've stayed in basic.", "Enemy neutralized.", "Clean up on aisle five."],
    map: {
      space: ["Zero-g. Zero excuses.", "That derelict was a good ship. Respect.", "Loop ahead. Brace for G-force.", "Watch for debris, soldiers."],
      forest: ["Jungle ops. Stay sharp.", "Enemy could be hiding in those caves.", "Skull ahead. Somebody lost a war.", "Upside down terrain. Adapt."],
      ice: ["Cold-weather ops. Love it.", "Storm front. Visibility: poor. Morale: high.", "Ice is no excuse, private.", "Crevasse ahead. Mind your footing."],
      desert: ["Desert ops. Hydrate, soldiers.", "Sandstorm incoming. Goggles on.", "Ruins at twelve o'clock.", "Heat's no excuse. Push!"],
      ocean: ["Naval assault. Dive, dive, dive!", "Giant squid at two o'clock!", "Wet ops. Keep your powder dry.", "Lightning! Take cover! Wait, we can't."],
    },
    agree: ["Affirmative, {name}.", "Copy that, {name}.", "Roger, {name}.", "Hooah, {name}."],
    plot: ["{name}, hostile in the lead. Flank them.", "{name}, coordinated assault on the leader. Now.", "{name}, the leader's out of line. Take them down.", "All units: target the leader. {name}, you're with me."],
    plotJoin: ["Copy, {name}. Moving to flank.", "Roger that, {name}. Engaging.", "On your six, {name}.", "Affirmative, {name}. Squeeze 'em."],
    cheater: ["Suspected sabotage up front!", "That leader's running illegal hardware!", "Cheater! Court martial!", "Inspect that vessel!"],
    leaderHurt: ["Target damaged! Keep the pressure on!", "Leader's taking fire! Push!", "Hits confirmed on the leader!", "Enemy lead weakening!", "Leader's armor is cracking!"],
    leaderDown: ["Leader critical! Finish the mission!", "One more strike! Go go go!", "Leader's going down!", "Target almost neutralized!", "All units: final strike on the leader!"],
    win: ["Mission accomplished.", "Victory, soldiers.", "Hooah!"], lose: ["Regroup. We go again.", "Retreat. For now.", "Well fought, soldier."],
    passRival: ["Flanking {name}!", "Passing {name}. Hold the line.", "Outflanked, {name}.", "Advancing past {name}.", "Moving up past {name}.", "Advance past {name}!", "Outflanked you, {name}."],
    passedByRival: ["{name}, insubordination!", "{name} broke formation!", "Watch it, {name}!", "{name}, fall back!", "Insubordinate, {name}!", "{name}, you broke rank!"],
    slamRival: ["Engaging {name}!", "{name}, you are dismissed!", "Direct hit on {name}!", "Take cover, {name}!", "Take that, {name}!", "Engaged {name}!", "Contact on {name}!"],
    hitByRival: ["Hostile contact: {name}!", "{name}, stand down!", "Taking fire from {name}!", "{name}! Court martial!", "{name}! Friendly fire!", "Hostile: {name}!", "Return fire on {name}!"],
    retort: ["Drop and give me twenty, {name}.", "Dismissed, {name}.", "Zip it, {name}.", "That's an order, {name}.", "At ease, {name}.", "Noted, {name}. Dismissed.", "Save it, {name}."],
    spectate: ["Casualties on the left!", "That's combat, people.", "Medic!", "Ooh-rah. Brutal.", "Casualty!", "That's a medic call.", "Ooh. Friendly fire?"],
    lastLap: ["Final lap. Full assault.", "Last lap. No retreat.", "All units: final push."],
    fallen: ["Man overboard!", "You fell out of formation.", "Lost one in the void.", "Soldier down! Off the map!", "Fell out of formation.", "That's a long drop, private."],
    wallHit: ["Watch your flank, private.", "Sloppy, soldier.", "You call that driving?", "Barrier contact! Disgraceful!", "Twenty push-ups for that.", "Eyes on the road, private!", "The barrier held. Did you?", "I've seen recruits steer better."],
    lostLead: ["Retake the position!", "Lead lost. Counterattack!", "Not for long, private."],
    tookLead: ["Point position secured.", "Taking the lead. Follow me.", "Forward! Ha!"],
    hurt: ["Hull critical! Holding!", "I'm bleeding fuel!", "Damage report: everything!"],
    playerLow: ["You're done, soldier.", "Wave the white flag.", "Your armor's gone."],
    tailing: ["On your six.", "Shadowing the target.", "Got you in my sights.", "Tracking target.", "Locked on.", "Pursuit in progress."] } },
  Rose: { id: 'r07', name: 'Valentina Cruz', lines: {
    start: ["Try not to get lost, darling.", "Ready when you are.", "Let's make it elegant.", "Ciao, losers."],
    passed: ["Ciao!", "Too easy.", "Adios, darling.", "Watch and learn.", "Adios.", "Grazie for the space.", "Too slow, querido."],
    overtaken: ["Oh, you want to play?", "Don't get comfortable.", "Bold. I like bold.", "Mm. Brave.", "Hm. Brave.", "Enjoy it. Really.", "You'll regret that, darling."],
    slammed: ["Kiss of the Rose.", "That's for staring.", "Thorns, darling.", "Mwah.", "A little kiss.", "Sweet dreams, darling.", "Careful. I bite."],
    hit: ["How dare you!", "You'll regret that.", "My paint!", "You're going to pay for that, darling.", "Animal!", "My paint, you brute!", "Unforgivable."],
    blocked: ["Clever.", "Next time, darling.", "Hm. Impressive.", "You're quicker than you look."],
    wrecked: ["My beautiful ship!", "Unbelievable!", "This is a tragedy!", "Que horror!"],
    youWrecked: ["Thorns hurt, don't they?", "Such a shame.", "Ciao, darling.", "Pity."],
    map: {
      space: ["The view from up here. Divine.", "That old wreck. So tragic.", "A loop. How vulgar.", "Stars, darling. Look up. Or don't."],
      forest: ["Jungle. So humid. My hair.", "The glowworms are almost romantic.", "A skull? Very gothic.", "Upside down. Like my love life."],
      ice: ["Ice suits me, darling.", "The aurora is stunning. Like me.", "Cold. But I've had colder exes.", "A storm. So dramatic."],
      desert: ["Sunset over the dunes. Perfecto.", "Sand everywhere. Disgusting.", "Ruins. So romantic.", "The heat. Unbearable. Elegant, though."],
      ocean: ["The moon over the sea. Magnifico.", "Rain, darling. Like a film.", "A squid. How dreadful.", "The sea is beautiful. You're not."],
    },
    agree: ["Exactly, {name}.", "Mm. True, {name}.", "For once, {name}, yes.", "Clever, {name}."],
    plot: ["{name}, darling, that leader needs humbling.", "{name}, shall we ruin someone's day?", "{name}, the leader is cheating. Obviously.", "{name}, together? Thorns for the leader."],
    plotJoin: ["With pleasure, {name}.", "Delicious idea, {name}.", "I'm in, darling {name}.", "Let's make it elegant, {name}."],
    cheater: ["Cheater. How tacky.", "Nobody leads like that without cheating.", "Disgraceful. Disqualify them.", "That's not talent, darling. That's cheating."],
    leaderHurt: ["The leader is wilting, darling.", "A few scratches on the crown.", "Not so elegant now, leader.", "Ooh, the leader bleeds.", "That's what happens at the top, darling."],
    leaderDown: ["The crown is slipping, darling.", "One more kiss and it's over.", "Goodbye, first place.", "Such a fragile leader.", "Fall, darling. Gracefully."],
    win: ["Naturally.", "Of course.", "Elegance wins."], lose: ["Enjoy it. It won't happen again.", "Hm. Well played.", "Next time, darling."],
    passRival: ["After you? No. Ciao, {name}.", "Too slow, {name}.", "Adios, {name}.", "Excuse me, {name}.", "Ciao, {name}.", "Grazie, {name}.", "Too slow, {name}, darling."],
    passedByRival: ["{name}, how rude.", "Enjoy it, {name}.", "Careful, {name}. Thorns.", "How rude, {name}.", "{name}, darling, no."],
    slamRival: ["Thorns, {name}.", "Sorry, {name}. Not really.", "A kiss, {name}.", "Mwah, {name}.", "Sweet dreams, {name}.", "Careful, {name}. I bite.", "Kisses, {name}."],
    hitByRival: ["{name}, how dare you!", "You will regret that, {name}.", "{name}! My paint!", "Oh, {name}. Big mistake.", "{name}, you brute!", "Animal, {name}!", "Unforgivable, {name}."],
    retort: ["Darling, please, {name}.", "So dramatic, {name}.", "Cute, {name}.", "Bye, {name}.", "Darling, {name}. Please.", "Mm. Cute, {name}.", "Adios, {name}."],
    spectate: ["Ooh, messy.", "So vulgar. I love it.", "That's going to bruise.", "Tragic. Beautiful.", "How dramatic.", "Delicious chaos.", "Ouch. Poor thing."],
    lastLap: ["Last lap, darling. Try to keep up.", "Final lap. Time to shine.", "One more lap. Then champagne."],
    fallen: ["Lost, darling?", "Gravity is so unforgiving.", "Ciao, little one.", "Ciao, darling!", "Falling for me?", "Such a dramatic exit."],
    wallHit: ["Ouch. Inelegant.", "That was ugly, darling.", "You and the wall. Such a couple.", "Careful, darling. Walls don't apologize.", "Mm. Messy.", "Is that how you drive at home?", "Scraping along. How common.", "Graceful as a brick, darling."],
    lostLead: ["Give it back, darling.", "That's my place.", "Enjoy it. Briefly."],
    tookLead: ["My place, darling.", "Excuse me, first class.", "Ciao from the front."],
    hurt: ["My ship is ruined!", "Barely holding on!", "This is a disaster!"],
    playerLow: ["You look exhausted, darling.", "Falling to pieces?", "Such a mess."],
    tailing: ["Right behind you, darling.", "Feel my thorns?", "I'm your shadow tonight.", "Feel my breath, darling?", "I'm close. Very close.", "Following you. Like a rose."] } },
  Nebula: { id: 'r08', name: 'Pip "Sprocket" Rivet', short: 'Sprocket', lines: {
    start: ["Small ship, big trouble!", "Let's make some noise!", "Punk rock, baby!", "Light it up!"],
    passed: ["Look down, tall stuff!", "Zoom zoom, sucker!", "Small and fast!", "Hehe! Bye!", "Zoom!", "Tiny but fast!", "Hehe! Bye bye!"],
    overtaken: ["Hey! I was using that air!", "Oh, it's ON now.", "Cheater!", "Pfft. Wait for it.", "Grr! Not fair!", "Big ship bully!", "I'll get you!"],
    slammed: ["Boom! Gnomed!", "Size isn't everything!", "Pocket rocket!", "Hehe! Bonk!", "Boop!", "Gnome power!", "Smash! Hehe!"],
    hit: ["My gears! My lovely gears!", "Pick on someone your own size!", "Hey! Bully!", "That's it, you're scrap!", "Ow! My bolts!", "Bully!", "Hey! I'm small!"],
    blocked: ["Huh. Sneaky.", "Pfft, lucky.", "Okay, okay. Nice.", "Grr."],
    wrecked: ["That's coming out of my scrap budget!", "Aaargh! My rig!", "Not my pretty junk!", "Boom. Ow."],
    youWrecked: ["Hehe, spare parts!", "Gnome sweet gnome!", "I'll take those bolts!", "Kaboom! Hehe!"],
    map: {
      space: ["Space junk! My favorite!", "That wreck's full of free parts!", "Loop! Wheee!", "Space is big. I'm small. Perfect."],
      forest: ["Glowworms! Can I keep one?", "That tree's taller than everyone. Respect.", "Skull! So punk!", "Caves! Echo! Echo!"],
      ice: ["Too cold for gnomes!", "My gears are freezing up!", "Aurora! Rad lights!", "Ice! Slidey slidey!"],
      desert: ["Sand in my gears! Grr!", "Hot! Hot! Hot!", "Ruins! Free scrap!", "Sandstorm! Punk weather!"],
      ocean: ["Gnomes can't swim!", "Squid! Can I ride it?!", "Diving! Hold your breath!", "Lightning! Free power!"],
    },
    agree: ["Hehe! Yeah, {name}!", "Rad, {name}!", "So true, {name}!", "Punk, {name}!"],
    plot: ["{name}! That leader's cheating! Let's wreck 'em!", "{name}, sabotage time?", "Psst, {name}! Squeeze the leader!", "{name}, I've got a plan. It involves crashing."],
    plotJoin: ["Ooh! I'm in, {name}!", "Sabotage! Yes, {name}!", "Let's wreck 'em, {name}!", "Count me in, {name}! Hehe!"],
    cheater: ["Cheater cheater!", "Hacks! I know hacks!", "Nobody's that fast! Rigged!", "Leader's cheating! Boo!"],
    leaderHurt: ["Leader's sparking! Hehe!", "Loose bolts up front!", "Dent the leader! Dent 'em!", "Leader's wobbling! Yes!", "Punk attack working!"],
    leaderDown: ["Leader's almost scrap! Dibs!", "One more! Smash 'em!", "Leader's falling apart! Hehe!", "Bye-bye, big shot!", "Leader's toast! Toast!"],
    win: ["Punk's not dead!", "Tiny but mighty!", "Bow to the gnome!"], lose: ["Grr. Rigged!", "My ship's too small!", "Next time, big feet."],
    passRival: ["Squeezing past, {name}!", "Hehe, bye {name}!", "Small and fast, {name}!", "Look down, {name}!", "Zoom, {name}!", "Hehe, {name}!", "Tiny but fast, {name}!"],
    passedByRival: ["{name}! I was using that air!", "Hey, {name}, cheater!", "{name}, you big bully!", "{name}! Bully!", "Not fair, {name}!", "Grr, {name}!"],
    slamRival: ["Boop! {name}!", "Gnomed you, {name}!", "Bonk, {name}!", "Hehe! Sorry, {name}!", "Smash, {name}!", "Gnome power, {name}!", "Hehe! Crunch, {name}!"],
    hitByRival: ["{name}! Pick on someone your size!", "Hey! {name}!", "My gears, {name}!", "{name}, you big oaf!", "{name}! My bolts!", "Bully {name}!", "{name}, I'm telling!"],
    retort: ["Whatever, {name}!", "Hehe, cry more, {name}!", "Bleh, {name}!", "You're just tall, {name}.", "Hehe, {name}!", "Nope, {name}!"],
    spectate: ["Ooh! Scrap!", "Kaboom! Love it!", "Hehe! Messy!", "Free parts!", "Kaboom!", "Ooh, sparks!", "Scrap! Dibs!"],
    lastLap: ["Last lap! Full punk!", "Final lap! Crank it!", "One more! Rock on!"],
    fallen: ["Bye-bye, big feet!", "Down you go!", "Gravity got ya!", "Wheee! Bye!", "Down the hole!", "Splat!"],
    wallHit: ["Clang! Love that sound!", "Scrape scrape!", "Haha! Sparks!", "Did you mean to do that?!", "Free paint job! From the wall!", "Crunch! Hehe!", "Ooh! Do it again!", "Bang! Hehe!"],
    lostLead: ["Hey! Gimme that!", "Thief!", "Not fair! Not fair!"],
    tookLead: ["Gnome in front!", "Tiny leader!", "Hehe! Mine now!"],
    hurt: ["Held together with spit!", "My rig's dying!", "Aaah! Sparks!"],
    playerLow: ["You're sparking, big feet!", "Falling apart, huh?", "I see loose bolts!"],
    tailing: ["Behind you! Hehe!", "Tailgating! Punk style!", "Can't shake the gnome!", "Right behind! Hehe!", "Can't lose me!", "Tiny shadow!"] } },
};
export const pilotOf = (team) => (team && PILOTS[team.name]) || null;

// how much each situation matters: small talk (1 and under) is spaced out, the rest always gets a card
const RANK = { passRival: 0, passedByRival: 0, retort: 1, start: 1, passed: 1, overtaken: 1, slamRival: 1, hitByRival: 1, spectate: 1,
  wallHit: 1, tailing: 1, lastLap: 1, playerLow: 2, blocked: 2, fallen: 2, hurt: 2, slammed: 3, hit: 3, lostLead: 3, tookLead: 3,
  wrecked: 4, youWrecked: 4, win: 5, lose: 5, map: 1, agree: 1, plot: 1, plotJoin: 1, cheater: 1, leaderHurt: 2, leaderDown: 3 };
// not every time: how often a moment gets a line at all (replies in an exchange have their own odds)
const CHANCE = { start: 0.75, passed: 0.6, overtaken: 0.6, passRival: 0.45, slamRival: 0.8, slammed: 0.85, hit: 0.85, blocked: 0.7,
  spectate: 1, lastLap: 0.7, fallen: 0.8, wallHit: 0.5, lostLead: 0.85, tookLead: 0.85, hurt: 0.9, playerLow: 0.7, tailing: 0.6,
  leaderHurt: 0.75 };
const NEAR = 90;                      // (rivals' own fights: this close to the player, along the track, or nobody hears)
const REPLY = 1.3;                    // (seconds before the other one answers)
const COOL = { wallHit: 25, fallen: 20, tailing: 30, playerLow: 20, spectate: 10, passed: 6, overtaken: 6, passRival: 12, map: 30, cheater: 25,
  lostLead: 15, tookLead: 15, blocked: 8, lastLap: 60, leaderHurt: 15 };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const between = (a, b) => a + Math.random() * (b - a);
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
    this.clock = (this.clock || 0) + (this.t || 0);    // (the time before this race: for the lines' memory)
    this.t = 0;                       // the race's clock as the cards know it
    this.quiet = 0;                   // no small talk until then
    this.said = new Map();            // pilot -> when it last spoke
    this.last = new Map();            // moment -> when it last got a line (COOL)
    this.queue = [];                  // replies waiting their turn: { at, who, what, other }
    this.ahead = null;                // the rivals ahead of the player at the last look
    this.ranks = null;                // every rival's place at the last look
    this.lookT = 0;
    this.hitBy = null; this.hitT = -9;     // the last rival the player slammed, and when
    this.lowT = -99; this.tail = null; this.tailT = 0; this.tailSaid = -99;
    this.lastLapSaid = false;
    this.downSaid = false;             // (the leader nearly gone: said once until the hull is back over 60 %)
    this.mapT = between(14, 30);       // the first talk about the circuit, then every 35 - 70 s
    this.leadT = 0; this.plotT = 0;    // how long the player has led; the next plot against them
    this.used = this.used || new Map();     // line -> when it was last said (kept across races: no repeats soon)
    this.clear();
  }

  clear() { for (const c of this.cards) c.el.remove(); this.cards = []; }

  // the most cards at once: two on a phone (between the lap times and the Slam button), three otherwise
  get max() { return document.body.classList.contains('touch') ? 2 : 3; }

  // who: the speaker's race entry; other: the one it talks about (rival against rival); reply: part of an exchange
  // (not held back by the small-talk spacing)
  say(who, what, other = null, reply = false) {
    const team = who?.team, p = pilotOf(team), o = pilotOf(other?.team);
    const lines = what === 'map' ? p?.lines.map?.[this.map] : p?.lines[what];
    if (!this.enabled || !p || !lines?.length) return false;
    if (!reply && Math.random() > (CHANCE[what] ?? 1)) return false;
    if (!reply && this.t - (this.last?.get(what) ?? -99) < (COOL[what] ?? 0)) return false;
    const r = RANK[what] ?? 1;
    if (!reply && r <= 1 && (this.t < this.quiet || this.t - (this.said.get(p) ?? -99) < 9)) return false;   // small talk spaced out
    if (!reply && r === 0 && this.t - (this.rivalT ?? -99) < 10) return false;                             // (rivals passing rarer)
    // one card a person: the same line again is skipped; a new one replaces their card, on top of the stack
    const mine = this.cards.find((c) => c.p === p);
    if (mine && mine.what === what) return false;
    if (mine) this.drop(mine, true);
    const el = document.createElement('div');
    el.className = 'cm';
    el.style.setProperty('--c', team.css);
    el.innerHTML = `<img alt="" decoding="async" src="${face(p, pick(LOOK[what]))}"><div><b></b><span></span></div>`;
    el.querySelector('b').textContent = p.short || p.name;
    el.querySelector('span').textContent = this.fresh(p, lines).replace('{name}', o ? o.short || o.name.split(' ')[0] : 'pal');
    this.el.appendChild(el);                                    // (the stack grows upwards: the newest on top)
    requestAnimationFrame(() => el.classList.add('on'));
    this.cards.push({ el, p, what, life: r >= 4 ? 4 : 3.2 });
    while (this.cards.length > this.max) this.drop(this.cards[0], true);   // the oldest makes room (at once: no gap left)
    this.said.set(p, this.t);
    this.last.set(what, this.t);
    if (other) this.rivalT = this.t;
    if (!reply) this.quiet = Math.max(this.quiet, this.t + (r <= 1 ? 4 : 2));
    return true;
  }

  // a line of theirs not said in the last few minutes (all of them said lately: the longest ago)
  fresh(p, lines) {
    const ago = (l) => this.t + (this.clock || 0) - (this.used.get(p.id + l) ?? -1e9);
    const fresh = lines.filter((l) => ago(l) > 240);
    const l = fresh.length ? pick(fresh) : lines.reduce((a, b) => (ago(a) >= ago(b) ? a : b));
    this.used.set(p.id + l, this.t + (this.clock || 0));
    return l;
  }

  drop(c, now = false) {
    this.cards.splice(this.cards.indexOf(c), 1);
    if (now) { c.el.remove(); return; }
    c.el.classList.remove('on'); c.el.classList.add('out');
    setTimeout(() => c.el.remove(), 260);
  }

  // an exchange: the first line now, the answers after it (each only if the first was said); false: nothing said
  talk(lines) {
    const [first, ...rest] = lines;
    if (!this.say(first.who, first.what, first.other)) return false;
    let at = this.t;
    for (const l of rest) { if (l.p != null && Math.random() > l.p) break; at += REPLY; this.queue.push({ ...l, at }); }
    return true;
  }

  // a third rival close to the player, not one of these
  bystander(race, ...not) {
    const me = race.player;
    const near = race.entries.filter((o) => !o.player && !not.includes(o) && !(o.racer.ghost > 0) && Math.abs(o.progress - me.progress) < NEAR);
    return near.length ? pick(near) : null;
  }

  // the leading player's hull going down: by (or a chaser) gloats, another may join in; true if said
  leaderHit(race, by) {
    const h = hp(race.player);
    if (h > 0.8) return false;
    const chasers = race.standings().filter((o) => !o.player && !o.finished && !(o.racer.ghost > 0)).slice(0, 5);
    const a = by || pick(chasers), b = pick(chasers.filter((o) => o !== a));
    if (!a) return false;
    const what = h < 0.35 && !this.downSaid ? 'leaderDown' : 'leaderHurt';
    const said = this.talk([{ who: a, what }, ...(b ? [{ who: b, what: 'agree', other: a, p: what === 'leaderDown' ? 0.7 : 0.45 }] : [])]);
    if (said && what === 'leaderDown') this.downSaid = true;
    return said;
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
    if (this.downSaid && hp(race.player) > 0.6) this.downSaid = false;
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
      // now and then, rivals near the player talking about the circuit (one answering, sometimes a third)
      if (race.time > 12 && this.t >= this.mapT) {
        const near = race.entries.filter((o) => !o.player && !(o.racer.ghost > 0) && Math.abs(o.progress - me.progress) < NEAR);
        if (near.length && !this.cards.length) {
          const a = pick(near), b = pick(near.filter((o) => o !== a)), c = pick(near.filter((o) => o !== a && o !== b));
          const said = this.talk([{ who: a, what: 'map' }, ...(b ? [{ who: b, what: 'agree', other: a, p: 0.55 }] : []), ...(c ? [{ who: c, what: 'map', p: 0.35 }] : [])]);
          this.mapT = this.t + (said ? between(35, 70) : 6);
        } else this.mapT = this.t + 5;
      }
      // the player leading a while: rivals plotting against them on the radio, now and then (not every time it could)
      this.leadT = pr === 1 ? this.leadT + step : 0;
      if (this.leadT > 8 && this.t >= this.plotT) {
        const chasers = race.standings().filter((o) => !o.player && !o.finished && !(o.racer.ghost > 0)).slice(0, 5);
        if (chasers.length >= 2 && Math.random() < 0.7) {
          const a = pick(chasers), b = pick(chasers.filter((o) => o !== a)), c = pick(chasers.filter((o) => o !== a && o !== b));
          const said = Math.random() < 0.3 ? this.talk([{ who: a, what: 'cheater' }, { who: b, what: 'agree', other: a, p: 0.6 }])
            : this.talk([{ who: a, what: 'plot', other: b }, { who: b, what: 'plotJoin', other: a, p: 0.85 }, ...(c ? [{ who: c, what: 'cheater', p: 0.45 }] : [])]);
          this.plotT = this.t + (said ? between(30, 55) : 6);
        } else this.plotT = this.t + 12;
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
      if (B.player && me.rank === 1 && this.leaderHit(race, A)) { /* (the leader's hull: leaderHit) */ }
      else if (B.player) this.talk([{ who: A, what: 'slammed' }, { who: this.bystander(race, A), what: 'spectate', p: 0.35 }]);
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
    } else if (e.type === 'damage' && e.player && e.why === 'wall' && me.rank === 1 && hp(me) < 0.8) {
      this.leaderHit(race, null);                // (the leader losing hull on the walls: the chasers notice)
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
