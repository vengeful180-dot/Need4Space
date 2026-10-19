// The race music: six original tracks composed here and rendered into buffers (OfflineAudioContext, on the audio
// thread) - no samples, no licensed music. They play as a playlist, one after another.
//  1. Ring Runner  - 144 BPM, A minor (Am F C G): four-to-the-floor, claps, a rolling 16th bass, a square arpeggio
//  2. Nebula Drift - 128 BPM, D minor (Dm Bb F C): progressive, an offbeat bass, a saw arpeggio in threes, long lines
//  3. Hyperlane    - 160 BPM, E minor (Em C G D): breakbeat drums, a sustained detuned "reese" bass, punchy stabs
//  4. Sands of Ra  - 128 BPM, D Hijaz (D Eb Cm D7): the Pyramid Run's - a drone and a breathy flute (a ney) opening
//     it, an oud's plucked riff, a darbuka playing the maqsum over the kick, finger cymbals in the drop
//  5. Gravity Well - 150 BPM, F minor (Fm Db Bbm C): dubstep - half-time drums, a snare and clap on the third beat, a
//     reese in the groove, then the drop's wobble bass (a distorted growl, its filter pulsing in time: eighths,
//     sixteenths, triplets), a sub dropping out of the build into it
//  6. Pixel Rush   - 160 BPM, E minor (Em C D B): chiptune - a pulse-wave lead with its echo, chords as fast 12.5 %
//     pulse arpeggios, a stepped triangle bass bouncing in octaves, noise drums, a 4-bit edge on it all
// Each is 64 bars: intro (0-8), groove (8-24), build (24-32), drop (32-48), breakdown (48-56), rebuild (56-64), its
// last bars fading out into the next one's intro. Supersaw pads, a lead in the drop, risers and crashes at the section
// changes; the pads, bass and arp duck under every kick.
// Rendered in eight 8-bar segments (the first alone, so the music starts within seconds, the rest in parallel), each
// with 8 s of the music before it rendered and dropped - everything still sounding at its start (pads, tails, the
// delay, the compressor) is there, and every random number is seeded by time, so the segments join sample-exact. The
// tempos make a segment a whole number of samples at 44.1 and 48 kHz, so they chain without a gap.
export const SEG_BARS = 8, SEGMENTS = 8;
const BARS = SEG_BARS * SEGMENTS;
const PRE = 8;                                                  // seconds of lead-in rendered before each segment
const hash = (x) => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const within = (bar, ranges) => ranges.some(([a, b]) => bar >= a && bar < b);

// the arrangement every song shares (bars)
const KICK = [[8, 30], [32, 48], [56, 64]], BACK = [[12, 30], [32, 48], [58, 64]], HATS = [[8, 48], [56, 64]];
const OPEN = [[16, 30], [32, 48], [60, 64]], BASS_ON = [[8, 48], [56, 64]], ARP_ON = [[4, 48], [56, 64]];

// A song: tempo, four chords (two bars each) and their bass roots, the lead's 8-bar round (beat, length, note), the
// bass's 16ths (R root, O octave, F fifth, - rest), the arpeggio's chord tones, drum steps and the sound of it all.
const SONGS = [
  {
    name: 'Ring Runner', bpm: 144, gain: 0.66,
    chords: [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]], roots: [33, 29, 36, 31],
    lead: [
      [0, 1.5, 69], [1.5, 0.5, 72], [2, 1, 76], [3, 1, 74], [4, 1, 72], [5, 1, 69], [6, 2, 72],
      [8, 1.5, 72], [9.5, 0.5, 77], [10, 1, 76], [11, 1, 72], [12, 2, 69], [14, 1, 72], [15, 1, 74],
      [16, 1.5, 76], [17.5, 0.5, 79], [18, 1, 76], [19, 1, 74], [20, 1, 72], [21, 1, 74], [22, 2, 76],
      [24, 1.5, 74], [25.5, 0.5, 71], [26, 1, 67], [27, 1, 71], [28, 3, 74], [31, 1, 76],
    ],
    bass: '-RRO-RRR-ROR-RRF', sustain: false, bassCut: 320, bassDetune: 9, bassQ: 5,
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 3, 2, 1, 2], arpWave: 'square', arpLevel: 0.085,
    kick: [0, 4, 8, 12], back: 'clap', backSteps: [4, 12], open: [2, 6, 10, 14],
    hatV: [0.45, 0.22, 0.8, 0.28, 0.5, 0.22, 0.8, 0.3, 0.45, 0.22, 0.8, 0.28, 0.55, 0.25, 0.85, 0.35],
    padCut: 1, padLevel: 1, leadCut: 1,
  },
  {
    name: 'Nebula Drift', bpm: 128, gain: 0.78,
    chords: [[50, 53, 57, 62], [46, 50, 53, 58], [53, 57, 60, 65], [48, 52, 55, 60]], roots: [38, 34, 41, 36],
    lead: [
      [0, 2, 74], [2, 1, 72], [3, 1, 69], [4, 3, 74], [7, 1, 76],
      [8, 2, 77], [10, 1, 74], [11, 1, 72], [12, 4, 70],
      [16, 2, 72], [18, 1, 74], [19, 1, 77], [20, 3, 76], [23, 1, 72],
      [24, 2, 76], [26, 2, 74], [28, 4, 72],
    ],
    bass: '--R---R---R---O-', sustain: false, bassCut: 380, bassDetune: 12, bassQ: 4,
    arp: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 3], arpWave: 'sawtooth', arpLevel: 0.075,
    kick: [0, 4, 8, 12], back: 'clap', backSteps: [4, 12], open: [2, 6, 10, 14],
    hatV: [0.3, 0.12, 0.6, 0.18, 0.35, 0.12, 0.6, 0.2, 0.3, 0.12, 0.6, 0.18, 0.4, 0.15, 0.65, 0.22],
    padCut: 1.25, padLevel: 1.2, leadCut: 0.85,
  },
  {
    name: 'Hyperlane', bpm: 160, gain: 0.74,
    chords: [[52, 55, 59, 64], [48, 52, 55, 60], [55, 59, 62, 67], [50, 54, 57, 62]], roots: [28, 24, 31, 26],
    lead: [
      [0, 0.75, 76], [0.75, 0.75, 79], [1.5, 0.5, 83], [2, 1.5, 81], [3.5, 0.5, 79], [4, 1, 76], [5, 1, 74], [6, 2, 76],
      [8, 0.75, 76], [8.75, 0.75, 79], [9.5, 0.5, 84], [10, 2, 83], [12, 1, 79], [13, 1, 76], [14, 2, 79],
      [16, 0.75, 79], [16.75, 0.75, 83], [17.5, 0.5, 86], [18, 1.5, 83], [19.5, 0.5, 81], [20, 2, 79], [22, 2, 83],
      [24, 0.75, 81], [24.75, 0.75, 78], [25.5, 0.5, 74], [26, 2, 78], [28, 2, 81], [30, 2, 78],
    ],
    bass: 'R-------R-----O-', sustain: true, bassCut: 240, bassDetune: 22, bassQ: 2,
    arp: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 2, 1, 0, 1], arpWave: 'square', arpLevel: 0.065,
    kick: [0, 10], back: 'snare', backSteps: [4, 12], open: [14],
    hatV: [0.6, 0.15, 0.5, 0.2, 0.6, 0.15, 0.5, 0.25, 0.6, 0.15, 0.5, 0.2, 0.6, 0.2, 0.55, 0.3],
    padCut: 0.8, padLevel: 0.9, leadCut: 1.15,
  },
  {
    // D Hijaz (D Eb F# G A Bb C): the augmented second Eb - F# is the sound of it
    name: 'Sands of Ra', bpm: 128, gain: 0.66,
    chords: [[50, 54, 57, 62], [51, 55, 58, 63], [48, 51, 55, 60], [50, 54, 57, 60]], roots: [38, 39, 36, 38],
    lead: [
      [0, 0.5, 74], [0.5, 0.5, 75], [1, 1.5, 78], [2.5, 0.5, 79], [3, 1, 81], [4, 0.5, 82], [4.5, 0.5, 81], [5, 1, 79], [6, 2, 78],
      [8, 0.5, 79], [8.5, 0.5, 81], [9, 1, 82], [10, 1, 84], [11, 1, 82], [12, 1.5, 81], [13.5, 0.5, 79], [14, 2, 81],
      [16, 0.5, 81], [16.5, 0.5, 82], [17, 1, 84], [18, 1, 86], [19, 0.5, 84], [19.5, 0.5, 82], [20, 1, 81], [21, 1, 79], [22, 2, 78],
      [24, 0.5, 79], [24.5, 0.5, 78], [25, 1, 75], [26, 1, 78], [27, 1, 75], [28, 3, 74], [31, 1, 72],
    ],
    // the flute: an octave down and soft over the drone in the intro, then the drop's two rounds and the breakdown's
    leadType: 'ney', leadLevel: 1.9, leadRounds: [[0, 0.55, 1500, -12], [32, 1, 3000, 0], [40, 1, 3400, 0], [48, 0.65, 1800, 0]],
    bass: '-RRO-RRR-ROR-RRF', sustain: false, bassCut: 340, bassDetune: 10, bassQ: 5,
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 3, 2, 1, 2], arpWave: 'sawtooth', arpLevel: 0.11,
    // the oud's riff, in D whatever the chord (the mode is the music, the chords only colour it): turning round the
    // tonic, then climbing to the fifth and falling back
    riff: [[62, 63, 66, 63, 62, 63, 66, 67, 69, 67, 66, 63, 62, 63, 66, 63], [69, 70, 69, 67, 66, 67, 66, 63, 62, 63, 66, 67, 66, 63, 62, 60]],
    darbuka: { main: 'D-T-k-T-D-k-T-kk', sparse: 'D-------D---k---', on: [[4, 30], [32, 48], [56, 64]], sparseOn: [[48, 56]] },
    zills: { steps: [2, 6, 10, 14], on: [[16, 30], [32, 48], [60, 64]] },
    drone: { notes: [38, 45, 50], on: [[0, 8], [48, 56]] },
    kick: [0, 4, 8, 12], back: 'clap', backSteps: [4, 12], open: [6, 14],
    hatV: [0.22, 0.08, 0.4, 0.1, 0.22, 0.08, 0.4, 0.12, 0.22, 0.08, 0.4, 0.1, 0.25, 0.1, 0.45, 0.14],
    padCut: 1.1, padLevel: 0.95, leadCut: 1,
  },
  {
    // dubstep: the drop is the wobble's (wobble.pats: 2-bar rounds of [16th, length in 16ths, semitones over the
    // chord's root an octave up, filter cycles a beat])
    name: 'Gravity Well', bpm: 150, gain: 0.6,
    chords: [[53, 56, 60, 65], [49, 53, 56, 61], [46, 49, 53, 58], [48, 52, 55, 60]], roots: [29, 25, 22, 24],
    lead: [
      [0, 1, 72], [1, 1, 75], [2, 2, 77], [4, 1, 80], [5, 1, 79], [6, 2, 75],
      [8, 1, 73], [9, 1, 77], [10, 2, 80], [12, 2, 82], [14, 2, 80],
      [16, 1, 77], [17, 1, 80], [18, 2, 82], [20, 1, 80], [21, 1, 77], [22, 2, 73],
      [24, 2, 76], [26, 1, 79], [27, 1, 76], [28, 3, 72], [31, 1, 79],
    ],
    leadRounds: [[16, 0.42, 1400], [48, 0.8, 2200]],
    bass: 'R-------------R-', sustain: true, bassCut: 190, bassDetune: 26, bassQ: 2,
    arp: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 2, 1, 0, 1], arpWave: 'triangle', arpLevel: 0.06,
    kick: [0, 10], back: 'snareclap', backSteps: [8], open: [14],
    hatV: [0.4, 0.14, 0.28, 0.14, 0.4, 0.14, 0.28, 0.18, 0.4, 0.14, 0.28, 0.14, 0.45, 0.18, 0.32, 0.22],
    wobble: { on: [[32, 48], [56, 64]], pats: [
      [[0, 6, 0, 1], [6, 2, 0, 4], [8, 4, 12, 2], [12, 4, 0, 3], [16, 3, 0, 2], [19, 3, 7, 2], [22, 2, 10, 4], [24, 8, 0, 1.5]],
      [[0, 4, 0, 4], [4, 4, 0, 2], [8, 2, 12, 4], [10, 2, 12, 4], [12, 4, 0, 6], [16, 6, 0, 2], [22, 2, 3, 4], [24, 4, 0, 3], [28, 4, -2, 8]],
    ], pick: (bar) => (bar >= 40 && bar < 48 ? 1 : 0) },
    subdrop: [32, 56],
    padCut: 0.75, padLevel: 0.85, leadCut: 1,
  },
  {
    // chiptune (chip): pulse and stepped-triangle waves, noise drums, no pads
    name: 'Pixel Rush', bpm: 160, gain: 0.7, chip: true,
    chords: [[52, 55, 59, 64], [48, 52, 55, 60], [50, 54, 57, 62], [47, 51, 54, 59]], roots: [28, 24, 26, 23],
    lead: [
      [0, 0.5, 76], [0.5, 0.5, 79], [1, 1, 83], [2, 0.5, 81], [2.5, 0.5, 79], [3, 1, 78], [4, 1.5, 79], [5.5, 0.5, 76], [6, 2, 71],
      [8, 0.5, 72], [8.5, 0.5, 76], [9, 1, 79], [10, 1, 84], [11, 1, 83], [12, 1.5, 79], [13.5, 0.5, 76], [14, 2, 72],
      [16, 0.5, 74], [16.5, 0.5, 78], [17, 1, 81], [18, 0.5, 86], [18.5, 0.5, 84], [19, 1, 81], [20, 1, 78], [21, 1, 81], [22, 2, 74],
      [24, 0.5, 75], [24.5, 0.5, 78], [25, 1, 83], [26, 1, 81], [27, 1, 78], [28, 2, 75], [30, 1, 78], [31, 1, 81],
    ],
    leadRounds: [[16, 0.55, 1], [32, 1, 1], [40, 1, 1], [48, 0.7, 1]],
    bass: 'R-O-R-O-R-O-ROFO', sustain: false, bassCut: 0, bassDetune: 0, bassQ: 1,
    arp: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3], arpWave: 'square', arpLevel: 0.06,
    kick: [0, 4, 8, 12], back: 'snare', backSteps: [4, 12], open: [],
    hatV: [0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0.2],
    padCut: 1, padLevel: 0, introPad: 1.2, leadCut: 1,
  },
];
export const SONG_COUNT = SONGS.length;
export const SONG_NAMES = SONGS.map((s) => s.name);

// the reverb's impulse and the noise, made once (an AudioBuffer plays in any context; making them for every segment held
// the main thread ~25 ms each time)
const shared = {};
function impulse(sr, seconds = 2.2, decay = 0.6) {
  if (shared.ir?.sampleRate === sr) return shared.ir;
  const n = Math.floor(seconds * sr), b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr }), rnd = seeded(77);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      y = y * 0.55 + (rnd() * 2 - 1) * 0.45;                         // a darker tail
      d[i] = y * Math.exp(-i / (sr * decay)) * Math.min(1, i / (sr * 0.008));
    }
  }
  return (shared.ir = b);
}
function noiseBuffer(sr) {
  if (shared.noise?.sampleRate === sr) return shared.noise;
  const b = new AudioBuffer({ numberOfChannels: 1, length: sr * 2, sampleRate: sr }), d = b.getChannelData(0), rnd = seeded(1234);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  return (shared.noise = b);
}

// the chip waves: a pulse of each duty, the stepped (4-bit) triangle - harmonics of one cycle of the shape, made once
const WAVES = {};
function waveTable(key, fn, N = 64) {
  if (WAVES[key]) return WAVES[key];
  const real = new Float32Array(N), imag = new Float32Array(N), M = 2048;
  for (let n = 1; n < N; n++) {
    let a = 0, b = 0;
    for (let i = 0; i < M; i++) { const x = fn(i / M), ph = 2 * Math.PI * n * i / M; a += x * Math.cos(ph); b += x * Math.sin(ph); }
    real[n] = (2 * a) / M; imag[n] = (2 * b) / M;
  }
  return (WAVES[key] = [real, imag]);
}
const pulse = (d) => waveTable('pulse' + d, (p) => (p < d ? 1 : -1));
const stepTri = () => waveTable('tri', (p) => { const k = Math.floor(p * 32); return (k < 16 ? k : 31 - k) / 7.5 - 1; });

// the graph building is shared out: one segment at a time, a bar at a time, the game's frames running in between
let building = Promise.resolve();
const breathe = () => new Promise((res) => setTimeout(res, 0));

// song si's segment k (bars 8k .. 8k + 8) as its own buffer
export async function renderSegment(si, k, sr = 48000) {
  let done;
  const turn = building;
  building = new Promise((res) => (done = res));
  await turn;
  try { return await buildAndRender(si, k, sr, done); } finally { done(); }
}

async function buildAndRender(si, k, sr, built) {
  const S = SONGS[si], BEAT = 60 / S.bpm, S16 = BEAT / 4, BAR = BEAT * 4, SEG_DUR = SEG_BARS * BAR;
  const chordOf = (bar) => Math.floor(bar / 2) % 4;
  const segStart = k * SEG_DUR, w0 = Math.max(0, segStart - PRE), w1 = segStart + SEG_DUR;
  const pre = Math.round((segStart - w0) * sr), len = Math.round(SEG_DUR * sr);
  const c = new OfflineAudioContext(2, pre + len, sr);
  // only what starts inside the window, in its own time (seconds from the window's start)
  // (never below 0: at some tempos the window's start and a step's time differ by a rounding error - -4e-15 s, refused)
  const at = (t) => (t >= w0 - 1e-6 && t < w1 ? Math.max(0, t - w0) : null);
  await breathe();
  const noise = noiseBuffer(sr);
  const gain = (v, ...to) => { const g = c.createGain(); g.gain.value = v; for (const t of to) g.connect(t); return g; };
  const filter = (type, f, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const noiseAt = (t, dur) => { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, hash(t + w0 + dur) * 1.5); s.stop(t + dur); return s; };

  // ---- the mix: master -> glue compressor; a plate-ish reverb and a 3/16 delay as sends; a kick-keyed duck
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3.5; comp.knee.value = 8; comp.attack.value = 0.006; comp.release.value = 0.14;
  comp.connect(c.destination);
  const out = gain(S.gain, comp);
  const ir = impulse(sr);
  await breathe();
  const rev = c.createConvolver(); rev.buffer = ir;
  rev.connect(gain(0.3, out));
  const dl = c.createDelay(2); dl.delayTime.value = S16 * 3;
  const dlf = filter('lowpass', 2600), fb = gain(0.36);
  dl.connect(dlf); dlf.connect(fb); fb.connect(dl);
  dlf.connect(gain(0.32, out, rev));
  const duck = gain(1, out);
  const drums = gain(1, out), kickBus = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
  kickBus.curve = curve;
  kickBus.connect(gain(0.85, drums));
  const revSend = gain(1, rev), dlSend = gain(1, dl);

  // ---- drums
  const kick = (t) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.075); o.frequency.exponentialRampToValueAtTime(41, t + 0.35);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + 0.002); g.gain.setTargetAtTime(0, t + 0.07, 0.085);
    o.connect(g).connect(kickBus); o.start(t); o.stop(t + 0.7);
    const n = noiseAt(t, 0.02), hp = filter('highpass', 2500), cg = c.createGain();
    cg.gain.setValueAtTime(0.22, t); cg.gain.setTargetAtTime(0, t + 0.001, 0.003);
    n.connect(hp).connect(cg).connect(drums);
    duck.gain.setTargetAtTime(0.42, t, 0.004); duck.gain.setTargetAtTime(1, t + 0.035, 0.085);
  };
  const clap = (t, v = 1) => {
    const n = noiseAt(t, 0.4), bp = filter('bandpass', 1350, 1.1), g = c.createGain();
    g.gain.setValueAtTime(0, t);
    for (let q = 0; q < 3; q++) { g.gain.setValueAtTime(0.45 * v, t + q * 0.011); g.gain.setTargetAtTime(0, t + q * 0.011 + 0.001, 0.0035); }
    g.gain.setValueAtTime(0.38 * v, t + 0.034); g.gain.setTargetAtTime(0, t + 0.035, 0.055);
    n.connect(bp).connect(g); g.connect(drums); g.connect(gain(0.35, revSend));
  };
  const hat = (t, v, open = false) => {
    const n = noiseAt(t, open ? 0.45 : 0.08), hp = filter('highpass', open ? 6500 : 7800, 0.9), g = c.createGain();
    g.gain.setValueAtTime(v * (open ? 0.12 : 0.15), t); g.gain.setTargetAtTime(0, t + 0.002, open ? 0.07 : 0.013);
    n.connect(hp).connect(g).connect(drums);
    if (open) g.connect(gain(0.15, revSend));
  };
  const snare = (t, v) => {
    const n = noiseAt(t, 0.25), bp = filter('bandpass', 1900, 0.8), g = c.createGain();
    g.gain.setValueAtTime(0.32 * v, t); g.gain.setTargetAtTime(0, t + 0.002, 0.045);
    n.connect(bp).connect(g); g.connect(drums); g.connect(gain(0.25, revSend));
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(195, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    og.gain.setValueAtTime(0.25 * v, t); og.gain.setTargetAtTime(0, t + 0.002, 0.03);
    o.connect(og).connect(drums); o.start(t); o.stop(t + 0.3);
  };
  const crash = (t) => {
    const n = noiseAt(t, 3), hp = filter('highpass', 3800, 0.6), g = c.createGain();
    g.gain.setValueAtTime(0.22, t); g.gain.setTargetAtTime(0, t + 0.01, 0.65);
    n.connect(hp).connect(g); g.connect(drums); g.connect(gain(0.5, revSend));
  };
  const sweep = (t, dur, f0, f1, g0, g1) => {
    const n = noiseAt(t, dur + 0.05), bp = filter('bandpass', f0, 2.5), g = c.createGain();
    bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(g0, t); g.gain.linearRampToValueAtTime(g1, t + dur); g.gain.setValueAtTime(g1, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    n.connect(bp).connect(g); g.connect(out); g.connect(gain(0.6, revSend));
  };

  // ---- the synths play a voice per note (a free-running oscillator's phase would depend on when the segment's render
  // began, and the seams would not match)
  // bass: two detuned saws through a resonant low-pass and a sine for the weight - a pluck, or held to the next note
  // with the filter opening and closing (the reese)
  const bassOut = gain(0.36, duck);
  const bassNote = (t, m, d, v, cut) => {
    const f = filter('lowpass', cut + 900, S.bassQ), a = c.createGain();
    if (S.sustain) {
      f.frequency.setValueAtTime(cut, t); f.frequency.linearRampToValueAtTime(cut * 3.2, t + d * 0.5); f.frequency.linearRampToValueAtTime(cut * 1.4, t + d);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.01); a.gain.setTargetAtTime(0, t + d * 0.94, 0.02);
    } else {
      f.frequency.setValueAtTime(cut + 900, t); f.frequency.setTargetAtTime(cut, t + 0.008, 0.05);
      a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.004); a.gain.setTargetAtTime(0, t + d * 0.78, 0.012);
    }
    for (const dt of [-S.bassDetune, S.bassDetune]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + d + 0.12); }
    const so = c.createOscillator(); so.frequency.value = hz(m); so.connect(gain(0.65, a)); so.start(t); so.stop(t + d + 0.12);
    f.connect(a); a.connect(bassOut);
  };
  // arp: a pluck
  const arpBus = gain(1, gain(S.arpLevel, duck));
  arpBus.connect(gain(0.05, dlSend)); arpBus.connect(gain(0.04, revSend));
  const arpNote = (t, m, v, open) => {
    const o = c.createOscillator(), f = filter('lowpass', open, 3), a = c.createGain();
    o.type = S.arpWave; o.frequency.value = hz(m);
    f.frequency.setValueAtTime(open, t); f.frequency.setTargetAtTime(open * 0.3, t + 0.01, 0.07);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.002); a.gain.setTargetAtTime(0, t + 0.012, 0.06);
    o.connect(f).connect(a).connect(arpBus); o.start(t); o.stop(t + 0.4);
  };
  // lead: two saws, a little glide from the note before, vibrato after the attack
  const leadBus = gain(1, gain(0.13 * (S.leadLevel || 1), out));
  leadBus.connect(gain(0.08, dlSend)); leadBus.connect(gain(0.1, revSend));
  const leadNote = (t, m, from, d, v, cut) => {
    const f = filter('lowpass', cut * 1.6, 1.2), a = c.createGain(), lfo = c.createOscillator(), vg = c.createGain();
    f.frequency.setValueAtTime(cut * 1.6, t); f.frequency.setTargetAtTime(cut, t + 0.03, 0.12);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.9 * v, t + 0.008); a.gain.setTargetAtTime(0.65 * v, t + 0.06, 0.2); a.gain.setTargetAtTime(0, t + d * 0.92, 0.04);
    lfo.frequency.value = 5.4; vg.gain.setValueAtTime(0, t); vg.gain.setTargetAtTime(13, t + 0.22, 0.12); lfo.connect(vg);
    for (const dt of [-7, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.detune.value = dt;
      o.frequency.setValueAtTime(hz(from), t); o.frequency.setTargetAtTime(hz(m), t, 0.018);
      vg.connect(o.detune); o.connect(f); o.start(t); o.stop(t + d + 0.35);
    }
    lfo.start(t); lfo.stop(t + d + 0.35);
    f.connect(a).connect(leadBus);
  };
  // the ney: a breathy reed flute - a triangle and sines (its octave faint), a slow glide from the note before, a wide
  // vibrato after the attack, and the breath: noise band-passed round the note, strongest as it is blown
  const neyNote = (t, m, from, d, v, cut) => {
    const f = filter('lowpass', cut * 1.3, 0.7), a = c.createGain(), lfo = c.createOscillator(), vg = c.createGain();
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.8 * v, t + 0.05); a.gain.setTargetAtTime(0.62 * v, t + 0.09, 0.25); a.gain.setTargetAtTime(0, t + d * 0.92, 0.06);
    lfo.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.setTargetAtTime(20, t + 0.2, 0.18); lfo.connect(vg);
    for (const [type, mult, lv] of [['triangle', 1, 0.9], ['sine', 1, 0.55], ['sine', 2, 0.14]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz(from) * mult, t); o.frequency.setTargetAtTime(hz(m) * mult, t, 0.04);
      vg.connect(o.detune); o.connect(gain(lv, f)); o.start(t); o.stop(t + d + 0.4);
    }
    const n = noiseAt(t, d + 0.3), bp = filter('bandpass', hz(m) * 2, 2.2), bg = c.createGain();
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.5 * v, t + 0.025); bg.gain.setTargetAtTime(0.12 * v, t + 0.07, 0.12); bg.gain.setTargetAtTime(0, t + d * 0.9, 0.05);
    n.connect(bp).connect(bg).connect(f);
    lfo.start(t); lfo.stop(t + d + 0.4);
    f.connect(a).connect(leadBus);
  };
  // the oud: a plucked string - detuned saws and a square through a filter snapping shut, the pitch settling from a
  // touch sharp, the pick's click; a little right of centre
  const oudPan = c.createStereoPanner(); oudPan.pan.value = 0.22; oudPan.connect(arpBus);
  const oudNote = (t, m, v) => {
    const f = filter('lowpass', 4200, 2), a = c.createGain();
    f.frequency.setValueAtTime(4200, t); f.frequency.setTargetAtTime(850, t + 0.004, 0.06);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.0015); a.gain.setTargetAtTime(0, t + 0.004, 0.11);
    for (const [type, dt, lv] of [['sawtooth', -6, 0.5], ['sawtooth', 6, 0.5], ['square', 0, 0.3]]) {
      const o = c.createOscillator();
      o.type = type; o.detune.value = dt;
      o.frequency.setValueAtTime(hz(m) * 1.012, t); o.frequency.setTargetAtTime(hz(m), t, 0.01);
      o.connect(gain(lv, f)); o.start(t); o.stop(t + 0.6);
    }
    const n = noiseAt(t, 0.015), bp = filter('bandpass', 3000, 1.5), cg = c.createGain();
    cg.gain.setValueAtTime(0.25 * v, t); cg.gain.setTargetAtTime(0, t + 0.001, 0.004);
    n.connect(bp).connect(cg).connect(f);
    f.connect(a).connect(oudPan);
  };
  // the darbuka, a little left: the doum (the low, open stroke at the drum's middle), the tek (the high one at its rim)
  // and the ka (a softer tek with the other hand)
  const darbPan = c.createStereoPanner(); darbPan.pan.value = -0.2; darbPan.connect(drums); darbPan.connect(gain(0.18, revSend));
  const doum = (t, v) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(88, t + 0.06);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.62 * v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.02, 0.09);
    o.connect(g).connect(darbPan); o.start(t); o.stop(t + 0.6);
  };
  const tek = (t, v, f0 = 3200) => {
    const n = noiseAt(t, 0.08), bp = filter('bandpass', f0, 1.4), g = c.createGain();
    g.gain.setValueAtTime(0.5 * v, t); g.gain.setTargetAtTime(0, t + 0.001, 0.012);
    n.connect(bp).connect(g).connect(darbPan);
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f0 * 0.245, t);
    og.gain.setValueAtTime(0.22 * v, t); og.gain.setTargetAtTime(0, t + 0.001, 0.02);
    o.connect(og).connect(darbPan); o.start(t); o.stop(t + 0.15);
  };
  // finger cymbals: three inharmonic partials ringing, right
  const zillPan = c.createStereoPanner(); zillPan.pan.value = 0.35; zillPan.connect(drums); zillPan.connect(gain(0.3, revSend));
  const zill = (t, v) => {
    for (const [f0, lv] of [[2730, 1], [4180, 0.6], [5960, 0.35]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f0; g.gain.setValueAtTime(0.05 * v * lv, t); g.gain.setTargetAtTime(0, t + 0.002, 0.12);
      o.connect(g).connect(zillPan); o.start(t); o.stop(t + 0.8);
    }
  };

  // ---- the chiptune's voices: the waves, the 4-bit edge (the amplitude stepped to 17 levels), the drums out of noise and
  // a falling square
  const wave = (key) => { const [re, im] = key === 'tri' ? stepTri() : pulse(key); return c.createPeriodicWave(re, im); };
  const chipW = S.chip ? { p50: wave(0.5), p25: wave(0.25), p125: wave(0.125), tri: wave('tri') } : null;
  const crush = () => {
    const ws = c.createWaveShaper(), n = 4096, cv = new Float32Array(n);
    for (let i = 0; i < n; i++) cv[i] = Math.round((i / (n - 1) * 2 - 1) * 8) / 8;
    ws.curve = cv;
    return ws;
  };
  const chipKick = (t) => {
    const o = c.createOscillator(), g = c.createGain();
    o.setPeriodicWave(chipW.p50);
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.7, t); g.gain.setTargetAtTime(0, t + 0.04, 0.035);
    o.connect(g).connect(drums); o.start(t); o.stop(t + 0.3);
    duck.gain.setTargetAtTime(0.55, t, 0.004); duck.gain.setTargetAtTime(1, t + 0.03, 0.06);
  };
  const chipNoise = (t, dur, type, f, lv, tc) => {
    const n = noiseAt(t, dur), fl = filter(type, f, 0.7), g = c.createGain();
    g.gain.setValueAtTime(lv, t); g.gain.setTargetAtTime(0, t + 0.002, tc);
    n.connect(fl).connect(g).connect(drums);
    return g;
  };
  const chipSnare = (t, v) => {
    chipNoise(t, 0.2, 'bandpass', 2300, 0.42 * v, 0.045).connect(gain(0.15, revSend));
    const o = c.createOscillator(), g = c.createGain();
    o.setPeriodicWave(chipW.p50); o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
    g.gain.setValueAtTime(0.2 * v, t); g.gain.setTargetAtTime(0, t + 0.01, 0.02);
    o.connect(g).connect(drums); o.start(t); o.stop(t + 0.15);
  };
  // the wobble: two detuned saws and a square an octave down, driven hard, through a resonant low-pass whose cut-off
  // swings `rate` times a beat from its trough (its curve worked out per note: always in time), a clean sub under it
  const driveCurve = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) { const x = i / 2047 * 2 - 1; driveCurve[i] = Math.tanh(x * 3.2) / Math.tanh(3.2); }
  const wobBus = gain(0.3, duck);
  const wobNote = (t, m, d, rate, v) => {
    const f = c.createBiquadFilter(), a = c.createGain(), N = Math.max(16, Math.round(d * 220)), cv = new Float32Array(N);
    f.type = 'lowpass'; f.Q.value = 9;
    for (let i = 0; i < N; i++) cv[i] = 85 * Math.pow(34, 0.5 - 0.5 * Math.cos((2 * Math.PI * rate * (i / (N - 1)) * d) / BEAT));
    f.frequency.setValueCurveAtTime(cv, t, d);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.006); a.gain.setValueAtTime(v, t + d - 0.02); a.gain.linearRampToValueAtTime(0, t + d);
    const pre = c.createGain(); pre.gain.value = 0.7;
    for (const [type, mult, dt, lv] of [['sawtooth', 1, -18, 0.5], ['sawtooth', 1, 18, 0.5], ['square', 0.5, 0, 0.45]]) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = hz(m) * mult; o.detune.value = dt;
      o.connect(gain(lv, pre)); o.start(t); o.stop(t + d + 0.05);
    }
    const dr = c.createWaveShaper(); dr.curve = driveCurve;          // (each note its own: one shared fed every filter)
    pre.connect(dr); dr.connect(f);
    f.connect(a).connect(wobBus);
    const so = c.createOscillator(), sg = c.createGain();
    so.frequency.value = hz(m - 12);
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.55 * v, t + 0.008); sg.gain.setValueAtTime(0.55 * v, t + d - 0.02); sg.gain.linearRampToValueAtTime(0, t + d);
    so.connect(sg).connect(bassOut); so.start(t); so.stop(t + d + 0.05);
  };
  // the sub drop into the drop: a sine falling an octave and more, fading
  const subdrop = (t) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.6);
    g.gain.setValueAtTime(0.55, t); g.gain.setTargetAtTime(0, t + 0.6, 0.45);
    o.connect(g).connect(out); o.start(t); o.stop(t + 2.6);
  };
  // the chip's notes: the triangle bass (a gate, no filter), the arpeggio (two chord tones a sixteenth, 12.5 % pulse)
  // and the lead (25 % pulse, a quick slide, a delayed vibrato; its echo through the delay)
  const chipBus = S.chip ? gain(1, duck) : null;
  if (chipBus) { const cr = crush(); cr.connect(chipBus); chipBus.crush = cr; }
  const triNote = (t, m, d, v) => {
    const o = c.createOscillator(), a = c.createGain();
    o.setPeriodicWave(chipW.tri); o.frequency.value = hz(m);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.5 * v, t + 0.003); a.gain.setValueAtTime(0.5 * v, t + d * 0.85); a.gain.linearRampToValueAtTime(0, t + d * 0.95);
    o.connect(a).connect(bassOut); o.start(t); o.stop(t + d + 0.05);
  };
  const chipArpNote = (t, m, v) => {
    const o = c.createOscillator(), a = c.createGain();
    o.setPeriodicWave(chipW.p125); o.frequency.value = hz(m);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(S.arpLevel * 1.4 * v, t + 0.002); a.gain.setTargetAtTime(0, t + S16 * 0.4, 0.02);
    o.connect(a).connect(chipBus.crush); o.start(t); o.stop(t + S16);
    a.connect(gain(0.05, dlSend));
  };
  const chipLead = (t, m, from, d, v) => {
    const o = c.createOscillator(), a = c.createGain(), lfo = c.createOscillator(), vg = c.createGain();
    o.setPeriodicWave(chipW.p25);
    o.frequency.setValueAtTime(hz(from), t); o.frequency.setTargetAtTime(hz(m), t, 0.01);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.19 * v, t + 0.004); a.gain.setTargetAtTime(0.14 * v, t + 0.03, 0.08); a.gain.setTargetAtTime(0, t + d * 0.9, 0.02);
    lfo.frequency.value = 6.2; vg.gain.setValueAtTime(0, t); vg.gain.setTargetAtTime(22, t + Math.min(0.25, d * 0.5), 0.06); lfo.connect(vg); vg.connect(o.detune);
    o.connect(a); a.connect(chipBus.crush); a.connect(gain(0.6, dlSend));
    o.start(t); o.stop(t + d + 0.2); lfo.start(t); lfo.stop(t + d + 0.2);
  };

  const kicks = new Set(S.kick), backs = new Set(S.backSteps), opens = new Set(S.open);
  // a held bass note lasts to the next one in the bar (or the bar's end)
  const bassLen = (st) => { let n = 1; while (st + n < 16 && S.bass[st + n] === '-') n++; return n; };
  const bar0 = Math.max(0, Math.floor(w0 / BAR) - 1), bar1 = Math.min(BARS, Math.ceil(w1 / BAR));
  for (let bar = bar0; bar < bar1; bar++) {
    await breathe();
    const T0 = bar * BAR, ci = chordOf(bar), chord = S.chords[ci], root = S.roots[ci];
    // build tension: the bass filter opens through the builds
    const build = bar >= 24 && bar < 32 ? (bar - 24) / 8 : bar >= 56 ? (bar - 56) / 8 : 0;
    for (let st = 0; st < 16; st++) {
      const t = at(T0 + st * S16);
      if (t === null) continue;
      if (kicks.has(st) && within(bar, KICK)) { if (S.chip) chipKick(t); else kick(t); }
      if (backs.has(st) && within(bar, BACK)) {
        if (S.chip) chipSnare(t, 1);
        else if (S.back === 'snareclap') { snare(t, 1.25); clap(t, 0.8); }
        else if (S.back === 'snare') snare(t, 1); else clap(t);
      }
      if (within(bar, HATS) && !(bar >= 30 && bar < 32) && S.hatV[st] > 0) {
        if (S.chip) chipNoise(t, 0.05, 'highpass', 9000, 0.13 * S.hatV[st], 0.012); else hat(t, S.hatV[st]);
      }
      if (opens.has(st) && within(bar, OPEN)) hat(t, 0.8, true);
      if (S.wobble && within(bar, S.wobble.on)) { /* (the drop's bass: the wobble's, below) */ }
      else if (S.chip && within(bar, BASS_ON)) {
        const q = S.bass[st];
        if (q !== '-') triNote(t, root + 12 + (q === 'O' ? 12 : q === 'F' ? 7 : 0), S16 * 2, st % 4 === 0 ? 1 : 0.8);
      } else if (within(bar, BASS_ON)) {
        const q = S.bass[st];
        if (q !== '-') bassNote(t, root + (q === 'O' ? 12 : q === 'F' ? 7 : 0), S.sustain ? bassLen(st) * S16 : S16,
          q === 'R' && st % 4 === 1 ? 0.95 : 0.75 + (S.sustain ? 0.1 : 0), S.bassCut * Math.pow(4.2, build + st / 16 / 8));
      }
      if (within(bar, ARP_ON)) {
        if (S.riff) oudNote(t, S.riff[bar % 2][st], (st % 4 === 0 ? 1 : 0.68) * (bar < 8 ? Math.min(1, (bar - 4 + st / 16) / 3) : 1));
        else if (S.chip) {
          // two chord tones a sixteenth (32nds): the chord rolled up and round, an octave higher in the drop
          const up = bar >= 32 && bar < 48 ? 24 : 12, fade = bar < 8 ? Math.min(1, (bar - 4 + st / 16) / 3) : 1;
          for (const h of [0, 1]) chipArpNote(t + h * S16 / 2, chord[(st * 2 + h) % 4] + up, (st % 4 === 0 && !h ? 1 : 0.75) * fade);
        } else {
          const m = chord[S.arp[st]] + 12 + (bar % 2 === 1 && st >= 12 ? 12 : 0);
          arpNote(t, m, st % 4 === 0 ? 1 : 0.7, bar < 8 ? 600 * Math.pow(5.5, (bar - 4 + st / 16) / 4) : bar >= 32 ? 3600 : 3000);
        }
      }
      if (S.darbuka) {
        const pat = within(bar, S.darbuka.on) && !(bar >= 30 && bar < 32) ? S.darbuka.main : within(bar, S.darbuka.sparseOn) ? S.darbuka.sparse : null;
        const q = pat?.[st], tt = t + (hash(T0 + st * 0.13) - 0.5) * 0.006, vel = bar < 8 ? 0.75 : 1;
        if (q === 'D') doum(tt, vel); else if (q === 'T') tek(tt, (st === 12 ? 0.95 : 0.8) * vel); else if (q === 'k') tek(tt, 0.42 * vel, 2600);
      }
      if (S.zills && within(bar, S.zills.on) && S.zills.steps.includes(st)) zill(t, st === 14 ? 1 : 0.75);
    }
    // the drop's wobble: its 2-bar round from each even bar
    if (S.wobble && within(bar, S.wobble.on) && bar % 2 === 0) for (const [s0, n, off, rate] of S.wobble.pats[S.wobble.pick(bar)]) {
      const tw = at(T0 + s0 * S16);
      if (tw !== null) wobNote(tw, root + 12 + off, n * S16, rate, s0 % 8 === 0 ? 1 : 0.85);
    }
    await breathe();
    // pads: a chord every two bars, slow attack and release, darker in the groove, open in the breakdown (the chip song's:
    // the chord held in pulse waves, in the intro only)
    const t0 = at(T0), padLevel = S.padLevel || (bar < 8 ? S.introPad || 0 : 0);
    if (bar % 2 === 0 && t0 !== null && padLevel > 0) {
      const dur = 2 * BAR, cut = S.padCut * (bar < 8 ? 450 * Math.pow(5, bar / 8) : bar >= 48 && bar < 56 ? 3000 : bar >= 32 && bar < 48 ? 2200 : 1500);
      const pf = filter('lowpass', cut, 0.6), pa = c.createGain(), lvl = padLevel * (bar >= 48 && bar < 56 ? 0.16 : bar < 8 ? 0.22 : 0.09);
      pa.gain.setValueAtTime(0, t0); pa.gain.setTargetAtTime(lvl, t0, 0.18); pa.gain.setTargetAtTime(0, t0 + dur - 0.05, 0.25);
      pf.connect(pa); pa.connect(duck); pa.connect(gain(0.5, revSend));
      for (const m of [...chord, root + 24]) for (const dt of S.chip ? [-4, 4] : [-11, 0, 11]) {
        const o = c.createOscillator();
        if (S.chip) o.setPeriodicWave(chipW.p50); else o.type = 'sawtooth';
        o.frequency.value = hz(m); o.detune.value = dt + (hash(T0 + m * 0.37 + dt) - 0.5) * 4;
        o.connect(gain(0.16, pf)); o.start(t0); o.stop(t0 + dur + 1.6);
      }
    }
    // the drone: the tonic and its fifth held low, a voice every two bars, opening slowly
    if (S.drone && bar % 2 === 0 && t0 !== null && within(bar, S.drone.on)) {
      const dur = 2 * BAR, df = filter('lowpass', 420 + 260 * ((bar % 8) / 8), 0.8), da = c.createGain();
      da.gain.setValueAtTime(0, t0); da.gain.setTargetAtTime(0.11, t0, 0.3); da.gain.setTargetAtTime(0, t0 + dur - 0.05, 0.3);
      df.connect(da); da.connect(out); da.connect(gain(0.45, revSend));
      for (const m of S.drone.notes) for (const dt of [-6, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = dt;
        o.connect(gain(0.2, df)); o.start(t0); o.stop(t0 + dur + 1.8);
      }
    }
    // the breakdown's sub: whole bars of the root under the pads
    if (bar >= 48 && bar < 56 && t0 !== null) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = hz(root + 12); g.gain.setValueAtTime(0, t0); g.gain.setTargetAtTime(0.28, t0, 0.05); g.gain.setTargetAtTime(0, t0 + BAR - 0.08, 0.04);
      o.connect(g).connect(out); o.start(t0); o.stop(t0 + BAR + 0.3);
    }
  }
  // the lead: two rounds in the drop, one softer and darker in the breakdown
  const voice = S.leadType === 'ney' ? neyNote : S.chip ? chipLead : leadNote;
  for (const [start, v, cut, oct = 0] of S.leadRounds || [[32, 1, 2800], [40, 1, 3200], [48, 0.6, 1500]]) {
    await breathe();
    S.lead.forEach(([b, n, m], i) => {
      const t = at(start * BAR + b * BEAT);
      if (t !== null) voice(t, m + oct, S.lead[(i + S.lead.length - 1) % S.lead.length][2] + oct, n * BEAT, v, cut * S.leadCut);
    });
  }
  // the darbuka's roll into the drop (teks in 16ths, louder to the end)
  if (S.darbuka) for (let s = 0; s < 32; s++) { const t = at(30 * BAR + s * S16); if (t !== null) tek(t, 0.35 + 0.55 * (s / 32), s % 2 ? 2600 : 3200); }
  // snare rolls into the drop and back into the groove, risers, crashes, a downlifter into the breakdown
  for (const [bar, steps, v0] of [[28, 2, 0.35], [29, 2, 0.45], [30, 1, 0.55], [31, 0.5, 0.7], [62, 1, 0.5], [63, 0.5, 0.7]]) {
    for (let s = 0; s < 16; s += steps) { const t = at(bar * BAR + s * S16); if (t !== null) (S.chip ? chipSnare : snare)(t, v0 + (s / 16) * 0.3); }
  }
  for (const b of S.subdrop || []) { const t = at(b * BAR); if (t !== null) subdrop(t); }
  for (const [b, n, f0, f1, g0, g1] of [[4, 4, 300, 6000, 0, 0.16], [28, 4, 250, 7500, 0, 0.2], [60, 4, 250, 7500, 0, 0.2], [48, 2, 6000, 200, 0.18, 0]]) {
    const t = at(b * BAR);
    if (t !== null) sweep(t, n * BAR, f0, f1, g0, g1);
  }
  for (const bar of [8, 32, 40, 56]) { const t = at(bar * BAR); if (t !== null) crash(t); }
  const rendering = c.startRendering();
  await breathe();
  built();                                                       // the next segment may build while this one renders
  const full = await rendering;
  const res = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
  for (let ch = 0; ch < 2; ch++) {
    const d = k === SEGMENTS - 1 ? full.getChannelData(ch).slice(pre, pre + len) : full.getChannelData(ch).subarray(pre, pre + len);
    // the song's end: its last bar and a half fade out into the next song's intro
    if (k === SEGMENTS - 1) {
      const n = Math.round(1.5 * BAR * sr);
      for (let i = 0; i < n; i++) d[len - n + i] *= Math.cos((i / n) * Math.PI / 2) ** 2;
    }
    res.copyToChannel(d, ch);
  }
  return res;
}
