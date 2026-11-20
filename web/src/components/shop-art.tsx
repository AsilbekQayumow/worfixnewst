import type { ShopItem } from "@/lib/domain/types";

/** Flat drawn product art for the Fixcoin shop. One small scene per item, on a paper tile. */
export function ShopArt({ art, image }: { art: ShopItem["art"]; image?: string | null }) {
  if (image) return <img src={image} alt="" style={{ width: "100%", aspectRatio: "200 / 170", objectFit: "cover", borderRadius: 10, background: "var(--raised)", display: "block" }} />;
  const ink = "#2a251e";
  const paper = "var(--raised)";
  const g = "#3f8a2a", g2 = "#7cbf4f", sand = "#d9c7a3", brass = "#c9922f", clay = "#b0503c", sky = "#8db3c7";
  const scenes: Record<ShopItem["art"], React.ReactNode> = {
    bottle: <>
      <rect x="84" y="30" width="32" height="14" rx="3" fill={ink} />
      <rect x="76" y="44" width="48" height="96" rx="14" fill="#9aa7ad" />
      <rect x="76" y="70" width="48" height="34" fill={g} />
      <path d="M88 52v80" stroke="#fff" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
    </>,
    tote: <>
      <path d="M78 58c0-22 44-22 44 0" fill="none" stroke={ink} strokeWidth="5" />
      <path d="M60 58h80l-6 82H66Z" fill={sand} />
      <path d="M86 98c6-14 22-14 28 0-6 10-22 10-28 0Z" fill={g} />
    </>,
    tree: <>
      <rect x="96" y="96" width="8" height="40" rx="2" fill="#7a5a3a" />
      <circle cx="100" cy="78" r="30" fill={g} />
      <circle cx="84" cy="90" r="18" fill={g2} />
      <circle cx="118" cy="88" r="16" fill={g2} />
      <path d="M62 138h76" stroke={ink} strokeWidth="4" strokeLinecap="round" />
    </>,
    cap: <>
      <path d="M58 104c0-34 18-50 42-50s42 16 42 50Z" fill={g} />
      <path d="M100 104h52c0 8-8 12-20 12h-32Z" fill="#2d6b1f" />
      <circle cx="100" cy="56" r="5" fill={ink} />
      <path d="M100 60v42" stroke="#fff" strokeOpacity=".25" strokeWidth="3" />
    </>,
    badge: <>
      <path d="M100 40 132 58v38l-32 18-32-18V58Z" fill={brass} />
      <path d="M100 50 124 64v28l-24 14-24-14V64Z" fill="#f3dc8e" />
      <path d="M88 84c4-12 20-12 24 0-4 8-20 8-24 0Z" fill={g} />
      <path d="M96 114l-6 22 10-6 10 6-6-22" fill={clay} />
    </>,
    ticket: <>
      <path d="M50 70a8 8 0 0 0 8-8h84a8 8 0 0 0 8 8v40a8 8 0 0 0-8 8H58a8 8 0 0 0-8-8Z" fill={sky} />
      <path d="M118 66v56" stroke="#fff" strokeWidth="3" strokeDasharray="4 5" />
      <rect x="64" y="80" width="40" height="6" rx="3" fill="#fff" fillOpacity=".8" />
      <rect x="64" y="94" width="28" height="6" rx="3" fill="#fff" fillOpacity=".6" />
    </>,
    kit: <>
      <path d="M64 70h72l-8 70H72Z" fill="#5b6b5f" />
      <path d="M118 30l-14 70" stroke={ink} strokeWidth="5" strokeLinecap="round" />
      <path d="M100 96l8 6 4-8" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M70 60c6-8 18-8 22 0" fill="#e8b33a" />
      <rect x="64" y="62" width="30" height="12" rx="6" fill="#e8b33a" />
    </>,
    frame: <>
      <circle cx="100" cy="86" r="44" fill="none" stroke={g} strokeWidth="3" />
      <circle cx="100" cy="86" r="36" fill="none" stroke={g} strokeOpacity=".5" strokeWidth="2" strokeDasharray="2 4" />
      <circle cx="100" cy="86" r="28" fill={sand} />
      <circle cx="100" cy="78" r="9" fill="#7a6a55" />
      <path d="M84 104c3-10 29-10 32 0" fill="#7a6a55" />
    </>,
  };
  return (
    <svg viewBox="0 0 200 170" style={{ width: "100%", height: "auto", background: paper, borderRadius: 10 }} aria-hidden>
      <g stroke="var(--map-contour)" fill="none">
        <path d="M-10 150c40-20 80 10 120-6s60-26 100-8" />
        <path d="M-10 162c40-18 80 10 120-4s60-22 100-6" />
      </g>
      {scenes[art]}
    </svg>
  );
}
