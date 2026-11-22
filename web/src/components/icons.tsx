import type { ReactNode, SVGProps } from "react";

/** WORFIX line icons: 24×24 grid, 1.5 stroke, round joins. Drawn for this product. */
const P = {
  home: <><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1Z" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5Z" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4.5h11l-2 4 2 4H5" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10" r="2.3" /></>,
  route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7.5a3 3 0 0 0 0-6h-7a3 3 0 0 1 0-6H16" strokeDasharray="2 2.5" /></>,
  crosshair: <><circle cx="12" cy="12" r="6.5" /><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" /><circle cx="12" cy="12" r="1.2" /></>,
  radar: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12 18 6" /><circle cx="15.8" cy="14.6" r="1" /></>,
  camera: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" /><circle cx="12" cy="12.5" r="3.5" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="9.5" r="1.6" /><path d="m20.5 15.5-5-5-9 9" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  checkCircle: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.3 2.5 2.5 4.8-5" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  xCircle: <><circle cx="12" cy="12" r="8.5" /><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.1" /></>,
  minus: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12h7" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  chevronRight: <><path d="m9.5 6 6 6-6 6" /></>,
  chevronLeft: <><path d="m14.5 6-6 6 6 6" /></>,
  chevronDown: <><path d="m6 9.5 6 6 6-6" /></>,
  arrowRight: <><path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" /></>,
  arrowLeft: <><path d="M19 12H5M10.5 6.5 5 12l5.5 5.5" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 6M17.5 14.2a5.5 5.5 0 0 1 3 5.3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.7" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  userPlus: <><circle cx="10" cy="8.5" r="3.5" /><path d="M3.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" /></>,
  message: <><path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h0a1 1 0 0 1-1-1Z" /></>,
  send: <><path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5Z" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M9.9 6a9.5 9.5 0 0 1 2.1-.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.5M14.1 14.2A3 3 0 0 1 9.8 9.9M6.5 7.6C4 9.3 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.1-1" /></>,
  shield: <><path d="M12 3.5 19 6v6c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V6Z" /><path d="m9 12 2.2 2.2 4-4.2" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.3-1.5 7.2 5-2.6 5 2.6-1.5-7.2" /></>,
  trophy: <><path d="M8 4.5h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M10 17h4" /></>,
  flame: <><path d="M12 21c3.6 0 6-2.4 6-5.7 0-4.1-3.6-6-4.6-10.3C11 6.8 9 9.3 9.2 12c-1-.4-1.7-1.3-2-2.4C6.4 10.9 6 12.6 6 14.9 6 18.4 8.4 21 12 21Z" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  leaf: <><path d="M5 19c0-8 5-13.5 14.5-14-0.3 9-5.5 14.5-13 14.5" /><path d="M5 19 13 11" /></>,
  droplet: <><path d="M12 3.5s6 6.4 6 10.7a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z" /></>,
  paw: <><circle cx="7" cy="10" r="1.8" /><circle cx="10.3" cy="6.3" r="1.8" /><circle cx="14.2" cy="6.3" r="1.8" /><circle cx="17.3" cy="10" r="1.8" /><path d="M12.2 11.5c-2.6 0-5 3.3-5 5.6 0 1.6 1.3 2.4 2.6 2.4 1 0 1.5-.5 2.4-.5s1.5.5 2.4.5c1.3 0 2.6-.8 2.6-2.4 0-2.3-2.4-5.6-5-5.6Z" /></>,
  book: <><path d="M4 5.5a1.5 1.5 0 0 1 1.5-1.5H11v15.5H5.5A1.5 1.5 0 0 0 4 21Z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 1 20 21Z" /></>,
  recycle: <><path d="m7.5 9.5-2.3 4a2 2 0 0 0 1.7 3h3.6" /><path d="m9 6.5 1.3-2.2a2 2 0 0 1 3.4 0l1.8 3.2" /><path d="M16.8 11.5 18.8 15a2 2 0 0 1-1.7 3h-3.6" /><path d="m5.6 11.4 1.9-1.9 1.9 1.9M13.8 7.4l1.7 2.4 2.6-.9M15.4 20.4l-1.9-1.9 1.9-1.9" /></>,
  hands: <><path d="M3.5 13.5 7 10l3.5 1 3-3 6.5 5.5" /><path d="M7 10 4 7M13.5 8l3-3 4 4" /><path d="m10 16 1.5 1.5a1.4 1.4 0 0 0 2-2l-1-1M8 14.5l2 2" /></>,
  heart: <><path d="M12 19.5S4 15 4 9.3A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.3c0 5.7-8 10.2-8 10.2Z" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  bag: <><path d="M5 8h14l-1 12.5H6Z" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></>,
  logout: <><path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" /><path d="M10.5 12H20M16.5 8.5 20 12l-3.5 3.5" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m15.5 15.5 4.5 4.5" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1" /><path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4" /></>,
  building: <><path d="M5 20.5V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15.5M15 9.5h3a1 1 0 0 1 1 1v10" /><path d="M8.5 8h3M8.5 11.5h3M8.5 15h3M3.5 20.5h17" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" /></>,
  moon: <><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" /></>,
  edit: <><path d="m14.5 5.5 4 4L8 20H4v-4Z" /><path d="m12.5 7.5 4 4" /></>,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5" /></>,
  external: <><path d="M13.5 4.5h6v6M19.5 4.5l-9 9" /><path d="M17.5 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1h5" /></>,
  map: <><path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5Z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  footprints: <><path d="M7 3.5c1.7 0 2.5 1.8 2.5 4s-.6 4.5-2.5 4.5S4.5 9.7 4.5 7.5 5.3 3.5 7 3.5Z" /><path d="M5 14.5h4.2v1.7a2.1 2.1 0 0 1-4.2 0Z" /><path d="M17 8.5c-1.7 0-2.5 1.8-2.5 4s.6 4.5 2.5 4.5 2.5-2.3 2.5-4.5-.8-4-2.5-4Z" /><path d="M19 19.5h-4.2v.3a2.1 2.1 0 0 0 4.2 0Z" /></>,
  play: <><path d="M8 5.5v13l10.5-6.5Z" /></>,
  pause: <><path d="M8.5 5.5v13M15.5 5.5v13" /></>,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5Z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.8" cy="6.5" r=".9" /><circle cx="4.8" cy="12" r=".9" /><circle cx="4.8" cy="17.5" r=".9" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></>,
  phone: <><path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".8" /></>,
  scan: <><path d="M4 8.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3" /><path d="M4 12h16" /></>,
  zap: <><path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6Z" /></>,
  ticket: <><path d="M3.5 8a1.5 1.5 0 0 0 1.5-1.5h14A1.5 1.5 0 0 0 20.5 8v2.5a1.5 1.5 0 0 0 0 3V16a1.5 1.5 0 0 0-1.5 1.5H5A1.5 1.5 0 0 0 3.5 16v-2.5a1.5 1.5 0 0 0 0-3Z" /><path d="M14.5 6.5v11" strokeDasharray="1.5 2" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>,
  printer: <><path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2" /><rect x="7" y="13.5" width="10" height="7" rx="1" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {P[name]}
    </svg>
  );
}

export const CATEGORY_ICON: Record<import("@/lib/domain/types").Category, IconName> = {
  environment: "leaf", water: "droplet", animals: "paw", education: "book", community: "hands", recycling: "recycle",
};
