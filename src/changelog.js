// The game's version and what changed in it, shown on the title screen (menu.js) and under Settings. Newest first;
// the title shows the first entry's notes and, under them, the one before's brief (or its first two notes).
export const UPDATES = [
  {
    version: '1.14.0', date: '19 Oct 2026', name: 'Umbra and the Pyramid Run',
    notes: [
      'New ship: the Umbra V1 - a black-hole engine, floating blades, time slowing round it on the boost',
      'The fastest ship and the most fragile: no slam, no block. Three paints',
      'New circuit: the Pyramid Run - twice the top speed, a desert planet of ruins, down a colossal pyramid and through its torch-lit root',
      'The Pyramid Run on the global scoreboard',
      'Every ship rated on slam power on the Ship screen',
      'Thank you, RwkY, our newest supporter!',
    ],
  },
  {
    version: '1.13.0', date: '18 Oct 2026', name: 'Rival pilots',
    brief: [
      'Rival pilots who talk during the race',
      'Donate $5 or more: a free Steam key - see Support',
    ],
    notes: [
      'Meet the rivals: eight pilots, each with a face, a personality and plenty to say - Roxy, Torque, Milo, Skye, Smokey, Sarge, Valentina and Sprocket',
      'They talk during the race: when you pass them or they pass you, on slams, blocks and wrecks, about the circuit you are on, and to each other - and they gang up on you when you lead',
      'Their faces in the results table, as the race left them',
      'A notice over the bars when your slam is charged, with the key to press',
      'Both can be switched off in Settings: Rival pilots, Slam ready notice',
      'Damaged ships pour smoke out of their breaches, lit by the sun, sooty where it leaves the hull; burning ones throw embers',
      'Support: donate with PayPal or Revolut, and a list of the supporters - thank you, Mangooo!',
      'The web version stays free to play, forever; Need4Space is coming to Steam too, as a paid game. Early supporters: donate $5 or more now and get a free Steam key and a place on the Supporters wall of fame - write the name you want on it and an email for your key in the payment note',
    ],
  },
  {
    version: '1.12.1', date: '18 Oct 2026', name: 'Phones and Settings',
    notes: [
      'Phones: the Slam button is back above Boost (it had slipped into the top corner), Boost sits low in the right corner under the thumb with a ring showing the boost left, and Slam lights up when it is charged',
      'Phones: no more Enter VR box over the game, the meters sit between the sticks, the pause menu gets the whole screen, and the Ship screen shows the paint chips of the chosen ship only',
      'Settings in sections that open and close - General, Picture, Performance and one for each circuit, the current one marked - on a darker panel that is easier to read',
      'Ship damage, explosions, the rival mix and the ship look switches are part of the game now and leave Settings (paint is chosen on the Ship screen); Low graphics also turns off shockwaves and the Ship screen showroom',
      'The VR settings show only while a headset is in use',
    ],
  },
  {
    version: '1.12.0', date: '18 Oct 2026', name: 'VR',
    notes: [
      'Experimental VR: race from a seated cockpit in a WebXR headset, with a headset HUD and menus and a VR resolution setting. Enter VR appears only where a headset can be used - contributed by Michael Sitarzewski',
      'Xbox controller: the Menu button pauses, a left-stick click recovers to the track, and the controller works in the menus everywhere',
      'Nothing changes for desktop or phone players without a headset: same look, same controls',
    ],
  },
  {
    version: '1.11.5', date: '17 Oct 2026', name: 'Graphics card check',
    notes: [
      'A browser that cannot use the graphics card (hardware acceleration off, or a blocked driver) now says so and how to fix it, instead of a misleading out-of-memory error',
      'A browser drawing in software, with no graphics card at all, is told first that the game would barely move - with a Start anyway button',
    ],
  },
  {
    version: '1.11.4', date: '17 Oct 2026', name: 'Smoother',
    notes: [
      'No more hitch a few seconds into a race with Comets and Anvils in the field: every paint is loaded with the game',
      'Sparks, smoke and other particles cost nothing while there are none, and far less is sent to the graphics card every frame',
      'The light strips along the walls no longer flicker in and out in the distance (the forest moon most of all)',
    ],
  },
  {
    version: '1.11.3', date: '17 Oct 2026', name: 'Second wind',
    notes: [
      'Hitting the edge of the track costs every ship a third of the hull it did',
      'A slam that lands gives the ship that threw it a fifth of its hull back (none if it is blocked) - the Hull bar glows green',
    ],
  },
  {
    version: '1.11.2', date: '17 Oct 2026', name: 'Ship screen',
    notes: [
      'Ship screen: a click puts a ship on the stand and hovering no longer switches it; Enter or the Confirm button flies it - no more flying off by a second click when reaching for a paint',
      'Switching a Feather flown in another paint back to Classic in the Ship screen shows the Classic paint again',
      'Your own slam: no damage from the moment you press it until 2 seconds after it lands (or after a block) - no more losing hull to the wall it carries you into',
    ],
  },
  {
    version: '1.11.1', date: '17 Oct 2026', name: 'Smooth start',
    notes: [
      'No hitch in the first lap of a race started straight after loading: the showroom of the Ship screen is now made ready only while you are in the menus',
    ],
  },
  {
    version: '1.11.0', date: '17 Oct 2026', name: 'Slam cam',
    notes: [
      'Your slams in slow motion: the camera swings out to the side to show the dash, the blow and the other ship thrown into the wall, with a hit-stop as it lands (Settings: Slam camera)',
      'Slams and explosions rebuilt: the shockwave bends the air itself, the blow lights both hulls, a cone of sparks drives into the ship hit and plates of its hull tear off and tumble along the track; the ship thrown streaks sparks all the way to the wall and bursts against it (Settings: Shockwaves)',
      'A blocked slam costs neither ship any hull',
      'The smoke off a damaged ship is much thinner and short-lived - it no longer blocks the view',
      'Ship screen: every ship shows its paints as colour chips on its own row - click one to paint it, click the ship to fly it and go straight back',
    ],
  },
  {
    version: '1.10.2', date: '17 Oct 2026', name: 'Blow up',
    notes: [
      'A ship alongside in reach now shows what to press by the arrow: Space (X on a gamepad, the Slam button on a touchscreen) - and Block when a slam is coming at you',
      'No hull takes damage in the first 10 seconds of a race',
      'The slam is ready again 10 seconds after it was used, on every ship',
      'A destroyed hull blows up: a fireball, shockwaves over the deck, burning debris and a smoke cloud (Settings: Ship explosions)',
    ],
  },
  {
    version: '1.10.1', date: '17 Oct 2026', name: 'Clean start',
    notes: [
      'No slams in the first 10 seconds of a race - the Slam bar fills over them',
      'The Boost and Slam bars sit together over the Hull bar at the bottom of the screen, bigger and easier to read',
    ],
  },
  {
    version: '1.10.0', date: '17 Oct 2026', name: 'Slam',
    notes: [
      'The slam is its own ability, on Space (X on a gamepad, the Slam button on a touchscreen): with a ship alongside in reach - the arrow shows the side - your ship snaps across and always lands it. Ready again after a few seconds, the Anvil\'s sooner (the Slam meter)',
      'Slammed? Hit Space back within half a second - a red arrow shows where it comes from - and it is a double attack: you bounce off each other and no one goes into the wall. The rivals block too, more often the harder the level',
      'The airbrakes are only airbrakes again',
    ],
  },
  {
    version: '1.9.4', date: '17 Oct 2026', name: 'Knockout',
    notes: [
      'The slam is a punch: your ship snaps across into the other at once, stops dead where it hits, and the other is launched across the track into the wall',
    ],
  },
  {
    version: '1.9.3', date: '17 Oct 2026', name: 'Heavy hitter',
    notes: [
      'The slam hits far harder: your ship drives in faster and the one hit is thrown across the track, sliding loose into the wall - and a wall it is thrown into hurts more',
      'Weight counts: the heavier ship throws the lighter one further and hurts it more - the Anvil wrecks a Comet in a slam or two',
      'Your own slam lands with a zoom punch, a hard shake and a flash',
    ],
  },
  {
    version: '1.9.2', date: '17 Oct 2026', name: 'Smash',
    notes: [
      'The airbrake attack smashes in: your ship drives across into the other and keeps pressing through the hit, the other thrown across ahead of it',
      'An arrow on the screen\'s left or right when a ship is in reach of the attack on that side',
      'The hull of a ship you have just hurt shows over it for 3 seconds',
    ],
  },
  {
    version: '1.9.1', date: '17 Oct 2026', name: 'Punchier',
    notes: [
      'The airbrake attack: your ship slides across level into the other and holds its line - no more rolling up onto a wing; the press goes into the push, not a turn',
      'The ship hit is thrown hard across the track and knocked loose for a moment',
      'No more stall when your own hull is destroyed',
    ],
  },
  {
    version: '1.9.0', date: '17 Oct 2026', name: 'Fight for it',
    notes: [
      'The airbrake attack: fire the airbrake toward a ship alongside - up to 7 m away - and yours throws itself at it. The slam shoves it across the track and off its line and tears its hull, in a burst of light, shockwaves and sparks; you hold your line',
      'The rivals attack too, and the first three fight each other for the lead and slow themselves down - the ones behind can catch them',
      'Damage you can see: hits throw sparks and your screen flashes red; hurt ships smoke and, near the end, burn. The Hull bar is big along the bottom of the screen and shows the chunk each hit takes',
      'A wrecked hull stops dead and starts again from nothing; for its 3 seconds it blinks in and out and cannot boost',
    ],
  },
  {
    version: '1.8.0', date: '17 Oct 2026', name: 'Hulls and rivals',
    notes: [
      'The rivals fly all three ships: four Feathers, two Comets and two Anvils (Settings: Feathers only)',
      'Hull damage: walls and other ships wear the hull down - a graze or a slow touch costs nothing, a hard knock at speed a lot, another ship\'s knock less than a wall\'s. The Anvil\'s hull is the toughest and it hits hardest, the Comet\'s the weakest and softest. A hull at zero resets the ship where it is, slowed, and for 3 seconds it can be flown through. A Hull meter on the HUD, a switch in Settings',
      'The airbrake is a weapon: fired toward a ship alongside, it shoves it off its line - it loses speed and hull, you hold yours. The Anvil holds two airbrakes',
      'Each difficulty has an ace, a rival a bit smarter and faster than the rest, starting on pole: an Anvil on Easy and Normal, a Comet on Hard, a Feather on Brutal. The Comets are a touch quick overall',
      'The ocean: the long bend round the aqueduct is banked into the turn - it threw the ships off the road and into the wall, every lap - and the run into the great gate is eased',
      'The results show each rival\'s ship; the Ship screen shows its toughness and ramming',
    ],
  },
  {
    version: '1.7.0', date: '16 Oct 2026', name: 'The Anvil',
    notes: [
      'A third ship: the Anvil H1 - a heavy armoured lifting body, two pulse engines in its housings with magnet balls orbiting them, headlamps across its nose and a cockpit under the canopy',
      'It flies heavy: a little slower off the line and in the turns, harder on the boost, and a knock costs it a third less',
      'Three paints for every ship, chosen on the Ship screen (left / right, or click one) - the ship on the stand changes as you pick',
      'Sharper ships up close: every ship\'s textures baked again - clean paint edges, smooth shading, no more blocky or pixelated patches in the showroom',
      'Switches in Settings for the Anvil\'s pulse rings and for the sharp paint edges',
      'No ship dips into the road any more where the track twists into a roll: the long hulls\' tail corners went under it',
    ],
  },
  {
    version: '1.6.4', date: '16 Oct 2026', name: 'Where it lands',
    notes: [
      'The splashes of the rain stay where they hit: on the track and on the sea they no longer slide along with the camera as you race by',
    ],
  },
  {
    version: '1.6.3', date: '16 Oct 2026', name: 'Into the clouds',
    notes: [
      'The alien pillars go up out of sight: kilometres tall and far broader, they rise into the cloud and vanish - nobody sees where they end',
      'Puddles on the track in the rain: dark and smooth as glass, mirroring the lights, the drops ringing them as you pass',
      'Bigger, heavier rain everywhere, bigger splashes off the track, and the rain splashing off the sea all round you - crowns and jets, the reflections broken up by the drops',
    ],
  },
  {
    version: '1.6.2', date: '16 Oct 2026', name: 'The alien pillars',
    notes: [
      'The power line is gone: in its place a ring of colossal alien pillars round the ocean circuit, 650 - 1150 m tall - the drowned civilisation\'s oldest works',
      'Fluted columns twisting up out of the sea on root buttresses, segmented and worn, great conduits clamped up their sides, a gallery of glowing nodes round each',
      'Some still crowned with spires round a beacon, others broken off with their ribs standing out; girders reaching from one to the next, most snapped off part way',
      'Cyan veins in their flutes - most dead, the few still alive pulsing slowly upward - and glowing rings round some of their collars',
    ],
  },
  {
    version: '1.6.1', date: '16 Oct 2026', name: 'The old power line',
    notes: [
      'A ring of colossal old transmission towers round the ocean circuit - a kilometre tall, rusted lattice steel on concrete caissons in the sea, cables sagging from one to the next high over the track',
      'Insulator strings, relay dishes, a maintenance deck at each waist; red warning lamps pulsing out of time with each other, sodium floodlights at their feet',
      'One cable has snapped: its ends hang down into the sea',
      'A switch for them in Settings',
    ],
  },
  {
    version: '1.6.0', date: '16 Oct 2026', name: 'Airbrake charge',
    notes: [
      'An airbrake is now one shot: press and it fires (held, up to a second), then it takes 3 seconds to charge again - a new Airbrake meter shows it',
      'The drift setting is gone (drifting stays off)',
      'Ship screen: no more black block under the Comet R1 seen from behind (the Feather\'s trail, left behind in the studio)',
    ],
  },
  {
    version: '1.5.9', date: '16 Oct 2026', name: 'Rain',
    notes: [
      'Rain over the ocean planet: it slants down in the wind and rushes past as you race, lit up in the headlights; drops splash on the track and ring the sea, and you hear it',
      'A little more mist on the sea',
      'The airbrakes are on the left / right arrows now (Z / X still work); steer with A / D, the mouse or a stick',
      'A switch for the rain in Settings',
    ],
  },
  {
    version: '1.5.8', date: '16 Oct 2026', name: 'Smoother seas',
    notes: [
      'The ocean planet runs faster, most of all under the sea (the slowest stretch a quarter quicker), with nothing changed in how it looks',
      'Crabs, fish, sea grass and kelp are drawn only within reach of the camera; the crabs themselves are lighter',
      'The drowned city is no longer drawn while you are above the sea, and what stands above the sea is not drawn deep under it',
    ],
  },
  {
    version: '1.5.7', date: '16 Oct 2026', name: 'Teeming',
    notes: [
      'Twice the fish along the road under the sea, in more and bigger shoals',
      'Big schools all round the track at every depth, and far more out over the abyss: clouds of fish in every direction',
      'Fish are seen much further off - twice as far before the water swallows them',
      'The giant squid comes alive: it turns its head to watch you pass, its arms writhe and grip their way down the rock, the mantle pumps and sways, and every so often the long tentacle lashes out toward the track',
    ],
  },
  {
    version: '1.5.6', date: '16 Oct 2026', name: 'The kraken',
    notes: [
      'A giant squid lies on a great sea stack ahead and to the left of the grid: its head on the rim watching the track with glowing amber eyes, its mantle rising behind',
      'Its arms grip down the rock into the sea while two arms and a long tentacle curl slowly in the air; over minutes it creeps round the rock and back',
      'The crabs are bigger and more detailed - spiny shells, eyes on stalks, jointed legs, claws that open and shut - and they cross the road itself now, not only its edges',
      'A switch for the giant squid in Settings',
    ],
  },
  {
    version: '1.5.5', date: '16 Oct 2026', name: 'Life on the road',
    notes: [
      'Under the sea the road is overgrown: grass in tufts and weed along the walls, thinning out across the deck',
      'Crabs walk sideways along the foot of the walls, the odd big one among them',
      'Many more fish and of many kinds: silver sardines, mackerel, red snappers, round yellow fish, blue fish, a few big tuna - in every size',
      'Twice as many schools far out over the abyss, and lanternfish that glow cyan and violet, seen from far off',
    ],
  },
  {
    version: '1.5.4', date: '16 Oct 2026', name: 'Nothing afloat',
    notes: [
      'The leviathans’ fins and tail grow out of their bodies (they floated beside them)',
      'The braziers round the Keeper’s feet stand on a ledge of the pedestal instead of floating in the water',
    ],
  },
  {
    version: '1.5.3', date: '16 Oct 2026', name: 'Darker night',
    notes: [
      'The ocean planet’s night is darker over the sea: the road dark and wet, the lamps’ pools and the headlights standing out',
      'The ships’ headlights at half their strength on the ocean planet',
      'No more fish tails sticking out of the road: the shoals keep clear of it',
    ],
  },
  {
    version: '1.5.2', date: '16 Oct 2026', name: 'Sea mist',
    notes: [
      'A low mist lies over the sea all round: the far stacks, causeways and the edge of the world fade into it',
      'Under the sea the city’s lamps are baked onto the road: it lies lit ahead as it comes into sight, not lit up only as you get there',
      'No more parts of the deep popping in as you move',
      'Weed, grass and anemones sit on the rock spires instead of floating over them, and the kelp beds glow faintly so they come out of the dark gradually',
    ],
  },
  {
    version: '1.5.1', date: '16 Oct 2026', name: 'Steady walls',
    notes: [
      'Under the sea the walls of the abyss, the rock spires and the Keeper’s pedestal no longer show dark squares that slide as you move: their shading is baked in, as on the desert’s canyons',
    ],
  },
  {
    version: '1.5.0', date: '16 Oct 2026', name: 'Dark water',
    notes: [
      'The sea is dark water from above: the road under it, the rocks and the ships diving are no longer seen through it',
      'Lights in the sea no longer blow out or swell and fade as you move: their reflections are steady and softer',
      'Reflections sway less as you drive over the water',
    ],
  },
  {
    version: '1.4.9', date: '16 Oct 2026', name: 'Solid water',
    notes: [
      'With ambient occlusion on, what lies under the sea no longer shows through the water as dark shapes',
      'Fixed the black blocks on the far sea',
    ],
  },
  {
    version: '1.4.8', date: '16 Oct 2026', name: 'No black slabs',
    notes: [
      'Fixed the black slabs in the sea: the dark underside of the causeways is no longer mirrored in the moon’s glade',
      'The moon’s glade softens with distance, and the sea no longer shows what is under it at a shallow angle',
    ],
  },
  {
    version: '1.4.7', date: '16 Oct 2026', name: 'Moonlit column',
    notes: [
      'The moon’s reflection is a column of light toward the moon again, not a white sheet over the sea',
      'No more black bands cutting through the reflections of the sea stacks',
    ],
  },
  {
    version: '1.4.6', date: '16 Oct 2026', name: 'Clear of the swell',
    notes: [
      'The low causeway between the sea stacks is raised clear of the waves: no more dark slabs washing in and out under it',
      'Lights reflected in the sea no longer flicker: the track’s own lamps show in the reflection itself, the big lights out at sea as steady streaks',
    ],
  },
  {
    version: '1.4.5', date: '16 Oct 2026', name: 'Steady horizon',
    notes: [
      'Far off the sea mirrors the sky and the lights’ streaks only: distant reflections no longer flicker as you move',
      'Reflections are bent by the waves only close by, as in three.js’s own ocean',
    ],
  },
  {
    version: '1.4.4', date: '16 Oct 2026', name: 'Smooth reflections',
    notes: [
      'The reflection in the sea is drawn anti-aliased: thin lights in it no longer crawl as you move',
      'Ripples finer than the screen can show no longer glitter: the moon’s glade softens with distance instead',
      'The barrel roll over the sea is raised high over the swell: you no longer dip in and out of the water rolling through it',
    ],
  },
  {
    version: '1.4.3', date: '16 Oct 2026', name: 'Still water',
    notes: [
      'No more white specks and dashes jumping about on the sea as you move',
      'Reflections in the sea are soft and steady, without stripes, and the lamps’ reflections are smooth streaks',
    ],
  },
  {
    version: '1.4.2', date: '16 Oct 2026', name: 'Calm water',
    notes: [
      'Reflections on the sea hold still as you drive: far off they no longer break into bands that reshuffle every moment',
      'The moon’s glitter and the lamps’ streaks on the water are calmer',
      'Going under the sea: a quick splash instead of seconds of bubbles over the view',
      'Shoals glow faintly and can be seen coming from a few hundred metres, not only in your headlights',
      'Leaping fish break the surface further ahead',
    ],
  },
  {
    version: '1.4.1', date: '16 Oct 2026', name: 'Into the deep',
    notes: [
      'The sea reads as water where the road dives in: foam laps at the waterline and what lies under the surface turns teal and dims',
      'Ships come out of the sea wet: water runs off the hull and streams off behind them as it dries (Settings)',
      'Calmer reflections on the sea: lights fade in and out of them, and fine ripples no longer sparkle',
      'Under the sea: braziers round the Keeper’s feet light the colossus, and the deep is lit from above so rock and stone show their shape',
      'Shoals can be seen far off, big schools swim out over the abyss, and the fish have proper tails',
      'No more striped surface or rows of light beams when looking up from under the water',
      'Distant parts of the city no longer pop in as you dive, and the giant creature no longer hangs over the road on the way in',
    ],
  },
  {
    version: '1.4.0', date: '16 Oct 2026', name: 'The drowned world',
    notes: [
      'A new circuit: the ocean planet - a night sea under a great moon, sea stacks, a lighthouse and a storm out to sea',
      'The dive spirals down round the Keeper, a colossal statue holding its lantern over the water, into a drowned city lit 900 m down',
      'Under the sea the light fades with depth: your headlights, the city’s lamps, moonlight shafts; fish, kelp, jellyfish and leviathans',
      'Leaping fish and birds over the waves, reflections on the sea and lightning (Settings: sea life, sea reflections, lightning storm)',
    ],
  },
  {
    version: '1.3.0', date: '16 Oct 2026', name: 'The Comet',
    notes: [
      'A second ship: the Comet R1, a titanium manta on two hover sponsons with its rocket in a long tail cone (title menu, Ship)',
      'Its nozzle has 18 teeth: they fan out with the engine off and under the brake, close in on the throttle and spin faster with speed and boost',
      'It flies differently: a higher top speed and sharper in the turns, less boost, and every knock costs it half as much again',
      'The Ship screen is a showroom: each ship alone on a turning stand (drag to look round, scroll to zoom) with its stats',
      'Both ships refinished: deep gloss paint, dark trim, dark engine faces with only the ring lit, accent strips in the engine colour, lit by the deck under them',
      'Engine glow rings go dark with the engines off',
      'The rivals still fly Feathers',
    ],
  },
  {
    version: '1.2.5', date: '16 Oct 2026', name: 'The broken giant',
    notes: [
      'A colossal warship broken in two hangs over the ringed planet in space, wreckage drifting from the break',
      'The ring station rebuilt in full detail, and the light gates stand on proper emitter pylons',
      'Engines: heat shimmer behind every ship and glowing gas trails (both in Settings)',
      'Rival engine lights in the dark are softer and shine from their tails',
      'The chase camera no longer dips through the road on the rolling straight',
      'Desert sandstorm: no more black lamp posts or dark shapes in the dust',
      'Fixed a flickering white bar near the lane lights',
    ],
  },
  {
    version: '1.2.4', date: '16 Oct 2026', name: 'Lamps fixed in place',
    notes: [
      'No more lights floating in the space derelict: floodlights hang from the ceiling on rods',
      'Marker lights only where their frame still stands; the red lights sit on the engine bell rim',
      'Hangar tower lamps stand on the towers, out of the parked fighters',
    ],
  },
  {
    version: '1.2.3', date: '15 Oct 2026', name: 'Derelict lights from afar',
    notes: [
      'The lamps in the space derelict light it from any distance, no more lights popping in as you come close',
      'Their lenses shine from 1.8 km instead of 500 m',
    ],
  },
  {
    version: '1.2.2', date: '15 Oct 2026', name: 'Smooth preset switching',
    notes: [
      'Changing the graphics quality mid-session no longer stutters in the race',
      'The shaders are rebuilt at once in the menu, as the loading screen does',
    ],
  },
  {
    version: '1.2.1', date: '15 Oct 2026', name: 'Graphics presets',
    notes: [
      'Graphics quality in Settings: Low (laptop), Balanced and High',
      'Balanced: about a third lighter on the GPU than High, the look nearly the same',
      'Low is the old Laptop mode; changing any option by hand shows Custom',
    ],
  },
  {
    version: '1.2', date: '15 Oct 2026', name: 'Global scoreboard',
    notes: [
      'A global top 10 for every circuit and difficulty',
      'Save your time right from the results and see your rank at once',
      'Save with Enter or the gamepad too',
      'A new logo, tinted by the difficulty',
      'Smoother menus: a paused game no longer redraws the world',
      'Canyon walls on the ice and desert planets shade cleanly, no moving squares',
    ],
  },
  {
    version: '1.1', date: '13 Oct 2026', name: 'Four worlds',
    notes: [
      'Three new circuits: the forest moon, the ice planet and the desert planet',
      'Space: race through a 12 km derelict, a 26.6 km lap',
      'Gravity flips on every circuit: ride upside down on the road overhead',
      'Wider roads, and nose control in the air over jumps',
      'New Easy difficulty; Normal, Hard and Brutal about 30 % easier',
      'Smoother frame rate (up to 10 % faster) and quicker first loading',
    ],
  },
  {
    version: '1.0', date: '12 Oct 2026', name: 'First flight',
    notes: ['The Feather S1, eight rivals and the space circuit'],
  },
];
export const VERSION = UPDATES[0].version;
