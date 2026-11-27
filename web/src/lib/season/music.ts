/**
 * v8: background music for the New Year season — public-domain melodies (Jingle Bells, 1857; Deck the Halls and
 * We Wish You a Merry Christmas, traditional; Shchedryk / "Carol of the Bells", 1916) played live by a small
 * music-box synth in Web Audio. No recordings are downloaded, so nothing is licensed and the page stays light.
 * It starts only after a tap (browsers require that) and keeps playing across pages.
 */
type Note = [freq: number, beats: number];
interface Song { id: string; bpm: number; beat?: number; melody: Note[]; bass: Note[]; bells?: boolean; lead?: number }

const A4 = 440;
const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function hz(name: string): number {
  if (name === "r") return 0;
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return 0;
  const n = SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return A4 * Math.pow(2, n / 12);
}
/** "B4:1 B4:1 B4:2 r:1" → notes */
const seq = (s: string): Note[] => s.trim().split(/\s+/).map((tok) => { const [n, b] = tok.split(":"); return [hz(n), Number(b ?? 1)]; });

const JINGLE_CHORUS = `B4:1 B4:1 B4:2 B4:1 B4:1 B4:2 B4:1 D5:1 G4:1.5 A4:0.5 B4:4
C5:1 C5:1 C5:1.5 C5:0.5 C5:1 B4:1 B4:1 B4:0.5 B4:0.5 B4:1 A4:1 A4:1 B4:1 A4:2 D5:2
B4:1 B4:1 B4:2 B4:1 B4:1 B4:2 B4:1 D5:1 G4:1.5 A4:0.5 B4:4
C5:1 C5:1 C5:1.5 C5:0.5 C5:1 B4:1 B4:1 B4:0.5 B4:0.5 D5:1 D5:1 C5:1 A4:1 G4:4`;
const JINGLE_VERSE = `D4:1 B4:1 A4:1 G4:1 D4:3 D4:0.5 D4:0.5 D4:1 B4:1 A4:1 G4:1 E4:4
E4:1 C5:1 B4:1 A4:1 F#4:4 D5:1 D5:1 C5:1 A4:1 B4:4
D4:1 B4:1 A4:1 G4:1 D4:4 D4:1 B4:1 A4:1 G4:1 E4:3 E4:1
E4:1 C5:1 B4:1 A4:1 D5:1 D5:1 D5:1 D5:1 E5:1 D5:1 C5:1 A4:1 G4:2 D5:2`;
const bassBars = (roots: string, beatsPerBar = 4) => seq(roots.split(/\s+/).map((r) => `${r}:${beatsPerBar}`).join(" "));

const SONGS: Song[] = [
  {
    id: "jingle", bpm: 132, bells: true,
    melody: seq(`${JINGLE_VERSE} ${JINGLE_CHORUS}`),
    bass: bassBars("G2 G2 G2 C3 C3 D3 D3 G2 G2 G2 G2 C3 C3 D3 D3 D3  G2 G2 G2 G2 C3 G2 A2 D3 G2 G2 G2 G2 C3 G2 D3 G2"),
  },
  {
    id: "deck", bpm: 116,
    melody: seq(`D5:1.5 C5:0.5 B4:1 A4:1 G4:1 A4:1 B4:1 G4:1 A4:0.5 B4:0.5 C5:0.5 A4:0.5 B4:1.5 A4:0.5 G4:1 F#4:1 G4:2
D5:1.5 C5:0.5 B4:1 A4:1 G4:1 A4:1 B4:1 G4:1 A4:0.5 B4:0.5 C5:0.5 A4:0.5 B4:1.5 A4:0.5 G4:1 F#4:1 G4:2
A4:1.5 B4:0.5 C5:1 A4:1 B4:1.5 C5:0.5 D5:1 A4:1 B4:0.5 C#5:0.5 D5:1 E5:0.5 F#5:0.5 G5:1 F#5:1 E5:1 D5:2
D5:1.5 C5:0.5 B4:1 A4:1 G4:1 A4:1 B4:1 G4:1 E5:0.5 E5:0.5 E5:0.5 E5:0.5 D5:1.5 C5:0.5 B4:1 A4:1 G4:2`),
    bass: bassBars("G2 G2 D3 G2 G2 G2 D3 G2 D3 G2 A2 D3 G2 C3 D3 G2"),
  },
  {
    id: "wish", bpm: 150, beat: 3,
    melody: seq(`D4:1 G4:1 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:1 E4:1 E4:1 A4:1 A4:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:1 D4:1 D4:1
B4:1 B4:0.5 C5:0.5 B4:0.5 A4:0.5 G4:1 E4:1 D4:0.5 D4:0.5 E4:1 A4:1 F#4:1 G4:2
D4:1 G4:1 G4:1 G4:1 F#4:2 F#4:1 G4:1 F#4:1 E4:1 D4:2 A4:1 B4:1 A4:1 G4:1 D5:1 D4:1 D4:0.5 D4:0.5 E4:1 A4:1 F#4:1 G4:3`),
    bass: seq(`r:1 G2:3 C3:3 A2:3 D3:3 G2:3 C3:3 D3:3 G2:3 G2:3 D3:3 C3:3 D3:3 G2:3 B2:3 D3:3 G2:3`),
  },
  {
    id: "bells", bpm: 168, beat: 3, lead: 0.9,
    // the four-note figure of Shchedryk, then a second voice above it, over a falling bass
    melody: seq(Array(16).fill("Bb4:1 A4:0.5 Bb4:0.5 G4:1").join(" ")),
    bass: seq(Array(4).fill("G2:3 F2:3 Eb2:3 D2:3").join(" ")),
  },
];
/** The upper voice of "bells" enters after four bars. */
const BELLS_UPPER = seq(`r:12 ${Array(12).fill("D5:1 C5:0.5 D5:0.5 Bb4:1").join(" ")}`);

/* ── the synth ── */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wet: GainNode | null = null;
let timer = 0;
let songIdx = 0;
let nextT = 0;
let playing = false;
let volume = 0.55;
const listeners = new Set<(on: boolean) => void>();

function setup() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3;
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(comp).connect(ctx.destination);
  // a short hall: decaying noise as the impulse response
  const len = Math.floor(ctx.sampleRate * 2.4);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  wet = ctx.createGain();
  wet.gain.value = 0.32;
  wet.connect(verb).connect(master);
  return ctx;
}

function bell(f: number, t: number, dur: number, amp: number) {
  if (!ctx || !master || !wet || !f) return;
  const out = ctx.createGain();
  const ring = Math.max(0.9, dur * 1.8);
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(amp, t + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, t + ring);
  out.connect(master);
  out.connect(wet);
  // a music box / celesta: the fundamental, a bright octave and a faint inharmonic shimmer
  for (const [mul, g, type] of [[1, 0.6, "sine"], [2, 0.22, "sine"], [3.98, 0.06, "sine"], [1, 0.16, "triangle"]] as const) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = f * mul;
    og.gain.value = g;
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + ring + 0.05);
  }
}

function bass(f: number, t: number, dur: number) {
  if (!ctx || !master || !f) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  o.type = "triangle";
  o.frequency.value = f;
  lp.type = "lowpass"; lp.frequency.value = 600;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 2.2));
  o.connect(lp).connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

let noise: AudioBuffer | null = null;
function jingle(t: number, amp: number) {
  if (!ctx || !master) return;
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "bandpass"; hp.frequency.value = 7800; hp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  src.connect(hp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.2);
}

/** Schedules one whole song from time t; returns its length in seconds. */
function schedule(song: Song, t: number) {
  const spb = 60 / song.bpm;
  let x = t;
  for (const [f, b] of song.melody) { bell(f, x, b * spb, 0.16 * (song.lead ?? 1)); x += b * spb; }
  const end = x;
  x = t;
  for (const [f, b] of song.bass) { bass(f, x, b * spb); x += b * spb; }
  if (song.id === "bells") { x = t; for (const [f, b] of BELLS_UPPER) { bell(f, x, b * spb, 0.09); x += b * spb; } }
  if (song.bells) {
    const per = song.beat ?? 4;
    for (let k = 0; t + k * spb < end; k++) jingle(t + k * spb, k % per === 0 ? 0.05 : 0.025);
  }
  return end - t;
}

function pump() {
  if (!ctx || !playing) return;
  // schedule the next song a little before the current one ends
  if (nextT - ctx.currentTime < 1.5) {
    const song = SONGS[songIdx % SONGS.length];
    songIdx++;
    const len = schedule(song, Math.max(nextT, ctx.currentTime + 0.1));
    nextT = Math.max(nextT, ctx.currentTime + 0.1) + len + 1.6;
  }
}

export const music = {
  get on() { return playing; },
  /** Must be called from a tap or click the first time. */
  async start() {
    const c = setup();
    if (c.state === "suspended") await c.resume().catch(() => undefined);
    if (playing) return;
    playing = true;
    songIdx = Math.floor(Math.random() * SONGS.length);
    nextT = c.currentTime + 0.15;
    master!.gain.cancelScheduledValues(c.currentTime);
    master!.gain.setTargetAtTime(volume, c.currentTime, 0.4);
    pump();
    timer = window.setInterval(pump, 400);
    listeners.forEach((fn) => fn(true));
  },
  stop() {
    if (!ctx || !playing) return;
    playing = false;
    window.clearInterval(timer);
    const c = ctx;
    master!.gain.cancelScheduledValues(c.currentTime);
    master!.gain.setTargetAtTime(0, c.currentTime, 0.25);
    // what was already scheduled fades out; then the context sleeps
    window.setTimeout(() => { if (!playing) void c.suspend().catch(() => undefined); }, 1200);
    // the next start begins a fresh song
    nextT = 0;
    listeners.forEach((fn) => fn(false));
  },
  setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (ctx && master && playing) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
  },
  get volume() { return volume; },
  /** A short jingle for a reward (works even when the music is off, after any tap). */
  chime() {
    try {
      const c = setup();
      if (c.state === "suspended") void c.resume();
      if (!playing) master!.gain.setTargetAtTime(volume, c.currentTime, 0.01);
      const t = c.currentTime + 0.02;
      [hz("G5"), hz("B5"), hz("D6"), hz("G6")].forEach((f, i) => bell(f, t + i * 0.08, 0.5, 0.12));
      jingle(t, 0.05); jingle(t + 0.12, 0.04);
      if (!playing) master!.gain.setTargetAtTime(0, t + 1.6, 0.3);
    } catch { /* no audio */ }
  },
  subscribe(fn: (on: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
