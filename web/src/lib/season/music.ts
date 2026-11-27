/**
 * v8: New Year background music — three songs in public/music (supplied by the WORFIX team), played one after
 * another in a loop. A small Web Audio synth gives the short "chime" for rewards.
 * Browsers allow sound only after the first tap or key press, so start() is tried on load and again on the first tap.
 */
const A4 = 440;
const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function hz(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) return 0;
  const n = SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return A4 * Math.pow(2, n / 12);
}
const TRACKS = ["/music/newyear-1.mp3", "/music/newyear-2.mp3", "/music/newyear-3.mp3"];

/* ── the synth ── */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wet: GainNode | null = null;

function setup() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3;
  master = ctx.createGain();
  master.gain.value = 0.9;
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

/* ── the songs ── */
let audio: HTMLAudioElement | null = null;
let track = 0;
let playing = false;
let volume = 0.45;
let fade = 0;
const listeners = new Set<(on: boolean) => void>();
const emit = () => listeners.forEach((fn) => fn(playing));

function player() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("ended", () => { track = (track + 1) % TRACKS.length; audio!.src = TRACKS[track]; void audio!.play().catch(() => undefined); });
  return audio;
}
function rampTo(target: number, ms: number, done?: () => void) {
  const a = player();
  window.clearInterval(fade);
  const from = a.volume, t0 = performance.now();
  fade = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (target - from) * k));
    if (k >= 1) { window.clearInterval(fade); fade = 0; done?.(); }
  }, 40);
}

export const music = {
  get on() { return playing; },
  /** Starts the songs; resolves false when the browser still blocks sound (no tap yet). */
  async start(): Promise<boolean> {
    if (playing) return true;
    const a = player();
    if (!a.src) { track = Math.floor(Math.random() * TRACKS.length); a.src = TRACKS[track]; }
    a.volume = 0;
    try { await a.play(); } catch { return false; }
    playing = true;
    rampTo(volume, 1200);
    emit();
    return true;
  },
  stop() {
    if (!playing || !audio) return;
    playing = false;
    emit();
    rampTo(0, 500, () => audio?.pause());
  },
  setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    if (audio && playing) audio.volume = volume;
  },
  get volume() { return volume; },
  /** A short jingle for a reward. */
  chime() {
    try {
      const c = setup();
      if (c.state === "suspended") void c.resume();
      const t = c.currentTime + 0.02;
      [hz("G5"), hz("B5"), hz("D6"), hz("G6")].forEach((f, i) => bell(f, t + i * 0.08, 0.5, 0.12));
      jingle(t, 0.05); jingle(t + 0.12, 0.04);
    } catch { /* no audio */ }
  },
  subscribe(fn: (on: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
