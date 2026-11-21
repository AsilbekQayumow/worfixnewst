"use client";
import { useMemo } from "react";

/** Deterministic contour lines around a few "hills" — the hand-drawn field map behind the hero. */
export function contours(w: number, h: number) {
  const hills = [
    { x: 0.28, y: 0.32, r: 1, k: 9 },
    { x: 0.78, y: 0.7, r: 0.8, k: 7 },
    { x: 0.82, y: 0.12, r: 0.5, k: 4 },
  ];
  const out: { d: string; strong: boolean }[] = [];
  hills.forEach((hl, hi) => {
    for (let i = 1; i <= hl.k; i++) {
      let d = "";
      const base = i * 34 * hl.r;
      for (let s = 0; s <= 72; s++) {
        const a = (s / 72) * Math.PI * 2;
        const wob = Math.sin(a * 3 + hi * 1.7 + i * 0.35) * 0.11 + Math.cos(a * 5 - i * 0.6) * 0.05 + Math.sin(a * 2 + hi) * 0.07;
        const r = base * (1 + wob);
        const x = hl.x * w + Math.cos(a) * r * 1.3;
        const y = hl.y * h + Math.sin(a) * r;
        d += `${s ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      }
      out.push({ d: `${d}Z`, strong: i % 4 === 0 });
    }
  });
  return out;
}

export function TopoMap({ className }: { className?: string }) {
  const W = 600, H = 560;
  const lines = useMemo(() => contours(W, H), []);
  const trail = "M118,470 C170,430 160,380 220,360 S330,350 350,300 S420,230 452,196";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ width: "100%", height: "100%" }}>
      <rect width={W} height={H} fill="var(--map-land)" />
      <path d="M-10,120 C80,140 140,90 230,110 S380,170 470,150 S580,120 620,140 L620,175 C560,160 500,190 460,190 S360,150 260,140 S120,170 -10,155Z" fill="var(--map-water)" />
      {lines.map((l, i) => <path key={i} d={l.d} fill="none" stroke={l.strong ? "var(--map-contour-strong)" : "var(--map-contour)"} strokeWidth={l.strong ? 1.4 : 1} />)}
      <g stroke="var(--map-contour)" strokeWidth={1}>
        {Array.from({ length: 7 }, (_, i) => <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={H} strokeDasharray="2 6" />)}
        {Array.from({ length: 6 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 100} x2={W} y2={i * 100} strokeDasharray="2 6" />)}
      </g>
      <path d={trail} fill="none" stroke="var(--surface)" strokeWidth={8} strokeLinecap="round" opacity={0.9} />
      <path d={trail} fill="none" stroke="var(--text)" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="1 8" />
      <circle cx={118} cy={470} r={22} fill="color-mix(in oklab, var(--info) 18%, transparent)" />
      <circle cx={118} cy={470} r={8} fill="var(--info)" stroke="var(--surface)" strokeWidth={3} />
      <g transform="translate(452 196)">
        <path d="M0 0c-9-12-15-18-15-26a15 15 0 0 1 30 0c0 8-6 14-15 26Z" fill="var(--accent)" stroke="var(--surface)" strokeWidth={2.5} />
        <circle cy={-26} r={5.5} fill="var(--surface)" />
      </g>
      <text x={470} y={232} fontFamily="var(--font-mono)" fontSize={11} fill="var(--text-2)">39.6542° N  66.9597° E</text>
      <text x={136} y={500} fontFamily="var(--font-mono)" fontSize={11} fill="var(--text-2)">1.2 km · 16 min</text>
    </svg>
  );
}
