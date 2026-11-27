/** v8: a string of lights that sags between hooks; the bulbs twinkle one after another (theme-winter.css). */
const COLORS = ["#ff4d5a", "#ffc93c", "#3ad06a", "#4fb4ff", "#ff7ad9"];

export function Garland({ count = 24, className }: { count?: number; className?: string }) {
  return (
    <div className={`garland${className ? ` ${className}` : ""}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 64 30" width="64" height="30" className="garland-seg">
          <path d="M0 4Q32 20 64 4" fill="none" stroke="var(--garland-wire)" strokeWidth="1.6" />
          {[16, 48].map((x, k) => {
            const y = x === 16 ? 10.2 : 10.2;
            const c = COLORS[(i * 2 + k) % COLORS.length];
            return (
              <g key={x} transform={`translate(${x} ${y}) rotate(${k ? -8 : 8})`}>
                <rect x="-2.2" y="-1" width="4.4" height="3.6" rx=".8" fill="var(--garland-cap)" />
                <path className="bulb" d="M0 2.4c3.4 0 4.6 4 4.6 6.4 0 3-2 5.4-4.6 5.4S-4.6 11.8-4.6 8.8C-4.6 6.4-3.4 2.4 0 2.4Z" fill={c}
                  style={{ ["--glow" as string]: c, animationDelay: `${((i * 2 + k) % 7) * 0.35}s` }} />
              </g>
            );
          })}
        </svg>
      ))}
    </div>
  );
}
