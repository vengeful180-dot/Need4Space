// The ships the player can fly: the Feather S1 (twin turbofan pods on swept wings), the Comet R1 (one big rocket in
// the back of a titanium manta riding two hover sponsons) and the Anvil H1 (a heavy armoured lifting body, two pulse
// engines in its housings, magnet balls orbiting them). main.js loads the one chosen - the page reloads into it - and
// the rivals stay Feathers whichever it is. All share the same lowest point, so the hover and the chase camera treat
// them alike; the Anvil is wider (its half span is its wall limit); HANDLING (below) is how each flies.
export const SHIPS = [
  ['feather', 'Feather S1', 'Twin turbofan pods on swept wings: the original'],
  ['rocket', 'Comet R1', 'Faster and sharper, but every knock costs it more'],
  ['heavy', 'Anvil H1', 'Heavy armour and two pulse engines: shrugs off knocks, hits hardest on the boost'],
  ['umbra', 'Umbra V1', 'A black hole for an engine and four floating blades: quick, but its field takes knocks badly'],
];

// How hard each ship is to fly well (the Ship screen's tag, in the race levels' colours): the Feather the forgiving
// all-rounder, the Anvil tough but heavy in the turns, the Comet quick and fragile, the Umbra the hardest - the
// fastest, a glass hull, no slam to answer one with
export const PILOTING = { feather: 'easy', heavy: 'medium', rocket: 'hard', umbra: 'expert' };
export const PILOTING_LEVELS = [['easy', 'Easy', 'c-easy'], ['medium', 'Medium', 'c-normal'], ['hard', 'Hard', 'c-hard'], ['expert', 'Expert', 'c-brutal']];

// How each ship flies (track.js TrackRacer): thrust and boost - its engine's pull, cruising and boosting; drag - the
// speed-squared drag (less of it: a higher top speed for the same pull); turn - the yaw rate and grip it has at the
// same share of its own top speed; impact - what a knock costs it (walls, other ships). The Comet: a higher top
// speed and a little sharper in the turns, a little less on the boost, and every knock costs it half as much again -
// a clean lap a few per cent quicker than the Feather's, a scrappy one slower.
// health - its hull (track.js TrackRacer.hurt: walls and other ships wear it down; at 0 the ship is reset where it is,
// slowed, and can be flown through for 3 s); ram - how hard it hits another ship (the damage it deals); airbrakes -
// the charges it holds (input.js: one fires at a time, each back 3 s after it was spent); mass - in a slam the heavier
// throws the lighter further and hurts it more (race.js); slamCool - s before its slam is ready again ("give slam 10
// seconds cooldown": the same for all three). The Feather is
// the middle of all three, the Comet a glass cannon, the Anvil the tank that hits hardest.
export const HANDLING = {
  feather: { thrust: 1, boost: 1, drag: 1, turn: 1, impact: 1, health: 100, ram: 1, airbrakes: 1, mass: 1, slamCool: 10 },
  rocket: { thrust: 1, boost: 0.9, drag: 0.92, turn: 1.05, impact: 1.5, health: 80, ram: 0.6, airbrakes: 1, mass: 0.8, slamCool: 10 },   // (clean flying laps 2-4 % under the Feather's)
  // the Anvil: a little slower off the line and in the turns, more on the boost, and knocks cost it a third less
  heavy: { thrust: 0.97, boost: 1.12, drag: 1, turn: 0.94, impact: 0.65, health: 150, ram: 1.6, airbrakes: 2, mass: 1.7, slamCool: 10 },
  // the Umbra: the fastest there is - the top speed, the boost - and a glass hull: under half the Feather's, every knock
  // costing it nearly twice the speed, light enough to be thrown far, a feeble ram; and no slam at all - it can neither
  // throw one nor answer one (slam: false). (Its pull eased from 1.08: clean flying laps 6.4 % under the Feather's,
  // were 8.7 % - the Comet's 4.3 %; a human pays for its glass in the corners and the slams, the AI's clean laps do not)
  umbra: { thrust: 1, boost: 1.12, drag: 0.9, turn: 1.02, impact: 1.9, health: 45, ram: 0.5, airbrakes: 1, mass: 0.8, slamCool: 10, slam: false },
};

// the rivals' ships, by grid slot (the player's slot, 4, is skipped): two Comets near the front (passing is hard: from
// the back their speed was lost in the pack), two Anvils further back (off the front row their boost out-dragged the
// pole-sitter and held the lead), the rest Feathers; the level's ace takes pole (race.js).
// (Settings "Rival ships": Feathers only puts Feathers in every slot)
export const RIVAL_SHIPS = ['feather', 'rocket', 'feather', 'rocket', null, 'heavy', 'feather', 'heavy', 'feather'];

// which bake of the ships' maps the files are: a livery's maps (and its edge map) fit only the hull atlas they were
// baked on, and Pages lets a browser keep a file ten minutes - a new bake changes the tag, so the ship and its liveries
// are fetched together, never last bake's ship under this bake's paint
export const BAKE = '?b=2';

// each ship's model by memory tier (quality.js memoryTier): the 2K maps on every tier - supersampled, lossless and the
// atlas packed to ~60 %, they hold up in the showroom's closest view
const all = (url) => ({ high: url + BAKE, mid: url + BAKE, low: url + BAKE });
export const SHIP_URLS = {
  feather: all('assets/racer_web_2k.glb'),
  rocket: all('assets/rocket_web_2k.glb'),
  heavy: all('assets/heavy_web_2k.glb'),
  umbra: all('assets/umbra_web_2k.glb'),
};

// each ship's liveries (Settings, the Ship screen): the first is the GLB's own paint, the others' hull maps (colour,
// roughness / metal) load from assets/liveries/<ship>/<livery>_albedo_<n>k.webp and _orm_ - in the sizes listed (the
// largest not over the ship's own atlas is used); key - the setting that holds the choice
// colors: each livery's two main colours (from its paint), for its chip on the Ship screen
export const LIVERIES = {
  feather: { names: ['classic', 'airracer', 'green'], labels: ['Classic', 'Air Racer', 'Racing Green'], key: 'featherLivery', res: [2048],
    colors: [['#ecebe7', '#b3202a'], ['#e6dcc3', '#87342e'], ['#14462e', '#b0a996']] },
  rocket: { names: ['titanium', 'orbiter', 'testflight'], labels: ['Titanium', 'Orbiter', 'Test Flight'], key: 'cometLivery', res: [2048],
    colors: [['#c4c8cc', '#4a4e56'], ['#e6e6e2', '#1a1a1d'], ['#f05b16', '#e6e6e2']] },
  heavy: { names: ['hazard', 'military', 'navy'], labels: ['Hazard', 'Military', 'Navy'], key: 'heavyLivery', res: [2048],
    colors: [['#e8b51a', '#1b1b1b'], ['#5b633e', '#ad9c6f'], ['#1a3062', '#7d8aa8']] },
  umbra: { names: ['umbra', 'horizon', 'pharaoh'], labels: ['Umbra', 'Event Horizon', 'Pharaoh'], key: 'umbraLivery', res: [2048],
    colors: [['#141218', '#7a42ec'], ['#e4e4e8', '#7842ec'], ['#be9246', '#7842ec']] },
};

// the rivals' Feathers when the player flies another ship: a tier lighter - they are never as close to the camera as
// the player's ship, and two full 8K ships would double what a 4 GB card holds
export const RIVAL_TIER = { high: 'mid', mid: 'mid', low: 'low' };

// ?ship=rocket, or the saved setting
export function shipChoice(saved) {
  const id = new URLSearchParams(location.search).get('ship') || saved;
  return SHIP_URLS[id] ? id : 'feather';
}

export const shipName = (id) => SHIPS.find(([k]) => k === id)?.[1] || SHIPS[0][1];
