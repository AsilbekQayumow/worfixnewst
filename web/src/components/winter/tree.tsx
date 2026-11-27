/** v8: a New Year tree with a glowing star, baubles and lights that blink in turn (theme-winter.css). */
const BAUBLES: [number, number, string][] = [
  [46, 44, "#ff4d5a"], [70, 52, "#ffc93c"], [38, 74, "#4fb4ff"], [62, 82, "#ff7ad9"], [82, 76, "#3ad06a"],
  [30, 104, "#ffc93c"], [54, 110, "#ff4d5a"], [78, 106, "#4fb4ff"], [96, 114, "#ffc93c"], [44, 132, "#ff7ad9"], [70, 136, "#ffc93c"], [92, 140, "#ff4d5a"], [22, 138, "#4fb4ff"],
];
const LIGHTS: [number, number][] = [[40, 56], [52, 60], [64, 63], [76, 64], [30, 90], [44, 94], [58, 97], [72, 98], [86, 96], [22, 124], [38, 128], [54, 130], [70, 131], [86, 129], [102, 126]];

export function TreeArt({ width = 120, className }: { width?: number; className?: string }) {
  return (
    <svg viewBox="0 0 124 180" width={width} height={(width * 180) / 124} className={className ?? "tree-art"} aria-hidden>
      <defs>
        <radialGradient id="tree-star-glow"><stop offset="0" stopColor="#fff6c2" stopOpacity=".9" /><stop offset="1" stopColor="#ffc93c" stopOpacity="0" /></radialGradient>
        <linearGradient id="tree-green" x1="0" x2="1"><stop offset="0" stopColor="#1f9d55" /><stop offset=".55" stopColor="#14803f" /><stop offset="1" stopColor="#0d6431" /></linearGradient>
      </defs>
      <rect x="54" y="150" width="16" height="18" rx="3" fill="#7a4a26" />
      <path d="M62 14 32 58h12L18 96h14L4 146h116L92 96h14L80 58h12Z" fill="url(#tree-green)" />
      <path d="M62 14 44 58h-12M44 58 32 96H18M32 96 20 146" stroke="#0b5a2b" strokeWidth="1" fill="none" opacity=".35" />
      {/* snow on the branches */}
      <path d="M33 58c6 3 10-1 14 1s8 2 12 0 8 1 12 0 8-3 13-1l-3 3c-4-1-6 1-10 1s-8-2-12 0-8 0-12-1-8 1-12-1Z" fill="#fff" opacity=".85" />
      <path d="M19 96c7 3 12-1 17 1s10 2 15 0 10 1 15 0 10-3 15-1 8 1 10 0l-2 3c-6 1-9-1-14 0s-10-1-15 0-10 0-15-1-10 2-15 0-9 0-13 0Z" fill="#fff" opacity=".85" />
      <path d="M5 146c8-4 14 0 20-2s12 2 18 0 12 1 18 0 12-3 18-1 12 2 18 0 10 0 18 3Z" fill="#fff" opacity=".9" />
      {/* garland */}
      <path d="M38 60Q62 70 86 58M24 96Q62 112 100 94M12 140Q62 150 112 138" stroke="#ffc93c" strokeWidth="1.4" fill="none" strokeDasharray="1 3" strokeLinecap="round" />
      {LIGHTS.map(([x, y], i) => <circle key={i} className="tree-light" cx={x} cy={y} r="1.9" style={{ animationDelay: `${(i % 5) * 0.4}s` }} />)}
      {BAUBLES.map(([x, y, c], i) => (
        <g key={i}><circle cx={x} cy={y} r="4.6" fill={c} /><circle cx={x - 1.4} cy={y - 1.6} r="1.3" fill="#fff" opacity=".7" /></g>
      ))}
      <circle cx="62" cy="13" r="18" fill="url(#tree-star-glow)" className="tree-glow" />
      <path className="tree-star" d="m62 2 3.3 6.8 7.5 1.1-5.4 5.3 1.3 7.4L62 19l-6.7 3.6 1.3-7.4-5.4-5.3 7.5-1.1Z" fill="#ffd23f" stroke="#e7a800" strokeWidth=".8" />
      {/* gifts under the tree */}
      <rect x="14" y="152" width="26" height="20" rx="2" fill="#d6262f" /><path d="M27 152v20M14 160h26" stroke="#ffc93c" strokeWidth="2.4" />
      <rect x="84" y="156" width="24" height="16" rx="2" fill="#4fb4ff" /><path d="M96 156v16M84 163h24" stroke="#fff" strokeWidth="2.2" />
      <rect x="66" y="160" width="16" height="12" rx="2" fill="#ffc93c" /><path d="M74 160v12" stroke="#1d9a4a" strokeWidth="2" />
    </svg>
  );
}
