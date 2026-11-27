/** v8: Qorbobo in his sleigh with three reindeer (flying right). `silhouette` draws it in one colour, for the moon. */
export function SleighArt({ width = 220, silhouette, className }: { width?: number; silhouette?: boolean; className?: string }) {
  const c = (color: string) => (silhouette ? "currentColor" : color);
  const deer = (x: number, y: number, lead: boolean, i: number) => (
    <g key={x} transform={`translate(${x} ${y})`}><g className="rd" style={{ animationDelay: `${i * -0.18}s` }}>
      {/* legs: two forward, two back, galloping */}
      <g stroke={c("#6b4423")} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path className="rd-leg rd-f" d="M9 4l7 6 4-2" /><path className="rd-leg rd-f2" d="M6 5l5 7 4 0" />
        <path className="rd-leg rd-b" d="M-10 4l-8 5-4-2" /><path className="rd-leg rd-b2" d="M-7 5l-5 7-4 1" />
      </g>
      <ellipse cx="0" cy="0" rx="15" ry="7" fill={c("#9a6236")} />
      <ellipse cx="2" cy="3" rx="9" ry="3.5" fill={c("#c9925c")} opacity={silhouette ? 1 : 0.9} />
      <path d="M-14 -2c-4-2-6 0-6 2 3 0 5 0 6-1Z" fill={c("#f3e3cc")} />
      <path d="M11 -3c3-6 6-9 9-10l3 3c-2 2-4 5-6 9Z" fill={c("#9a6236")} />
      <ellipse cx="23" cy="-10" rx="5.5" ry="3.6" transform="rotate(18 23 -10)" fill={c("#9a6236")} />
      <g stroke={c("#7b5230")} strokeWidth="1.6" strokeLinecap="round" fill="none"><path d="M20 -13c-2-5-1-9 2-11M21 -18l-4-2M24 -13c1-6 4-8 7-8M28 -19l1-4" /></g>
      <circle cx={28} cy={-9} r={lead ? 2.4 : 1.6} fill={c(lead ? "#ff2d3a" : "#3a2414")} className={lead && !silhouette ? "rd-nose" : undefined} />
      <circle cx="22" cy="-11.5" r=".9" fill={c("#1d1712")} />
      <path d="M8 -4h8" stroke={c("#d6262f")} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="12" cy="-4" r="1.5" fill={c("#ffc93c")} />
    </g></g>
  );
  return (
    <svg viewBox="-4 -8 228 84" width={width} height={(width * 84) / 228} className={className ?? "sleigh-art"} aria-hidden>
      {/* reins */}
      <g stroke={c("#ffc93c")} strokeWidth="1.1" fill="none" opacity=".9">
        <path d="M56 30Q78 32 98 37" /><path d="M56 30Q100 26 138 33" /><path d="M56 30Q122 20 178 29" />
      </g>
      {deer(100, 38, false, 2)}
      {deer(140, 34, false, 1)}
      {deer(180, 30, true, 0)}
      {/* the sack and the gifts */}
      <path d="M8 40c-6-8-2-22 8-24 8-2 14 4 14 12 0 6-2 10-6 12Z" fill={c("#7a4a26")} />
      <rect x="10" y="12" width="9" height="8" rx="1" fill={c("#1d9a4a")} transform="rotate(-12 14 16)" />
      <rect x="18" y="9" width="8" height="9" rx="1" fill={c("#ffc93c")} transform="rotate(10 22 13)" />
      <path d="M22 9v9M18 13h8" stroke={c("#d6262f")} strokeWidth="1.4" transform="rotate(10 22 13)" />
      {/* Qorbobo */}
      <path d="M30 42c0-14 6-20 14-20s12 8 12 18Z" fill={c("#d6262f")} />
      <path d="M44 24c4 0 8 3 10 8" stroke={c("#ffffff")} strokeWidth="2" fill="none" opacity={silhouette ? 0 : 0.6} />
      <path d="M50 32l8-2" stroke={c("#d6262f")} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="58.5" cy="29.8" r="2.4" fill={c("#1f1f24")} />
      <circle cx="46" cy="16" r="6.5" fill={c("#f5cfae")} />
      <path d="M40 17c0 8 3 12 7 12s6-4 6-11c-2 2-4 3-6 3s-5-1-7-4Z" fill={c("#ffffff")} />
      <path d="M39 13c1-6 5-9 10-8 3 .5 5 3 5 6l-4-1c-1 3-1 5-1 5" fill={c("#d6262f")} />
      <path d="M41 6c-5-1-9 1-11 5" stroke={c("#d6262f")} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <circle cx="29.5" cy="12" r="2.6" fill={c("#ffffff")} />
      <rect x="38" y="10.5" width="16" height="3.6" rx="1.8" fill={c("#ffffff")} />
      <circle cx="48.5" cy="16" r=".9" fill={c("#1d1712")} />
      {/* the sleigh */}
      <path d="M4 38c-2 14 4 24 18 24h40c8 0 14-6 16-16l2-10c-10 6-22 8-36 6Z" fill={c("#c81e2a")} />
      <path d="M4 38c13 2 27 4 40 4 12 0 24-2 36-6" stroke={c("#ffc93c")} strokeWidth="2.2" fill="none" />
      <path d="M12 52h56" stroke={c("#ffc93c")} strokeWidth="1.2" opacity=".7" fill="none" strokeDasharray="2 3" />
      <path d="M2 70h70c10 0 14-6 14-12" stroke={c("#ffc93c")} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M86 58c0-4 4-6 6-3" stroke={c("#ffc93c")} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M18 62v8M58 62v8" stroke={c("#ffc93c")} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
