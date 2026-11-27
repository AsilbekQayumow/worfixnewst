/**
 * Ready-made avatars (stored on the profile as "preset:<id>"): twelve flat motifs from WORFIX's world
 * (animals of the steppe and gardens, plants, sun, water, mountains), each on two grounds.
 */
import type { ReactNode } from "react";

const INK = "#2b2620";

const MOTIFS: Record<string, ReactNode> = {
  fox: (
    <g>
      <path d="M14 18 24 30 40 30 50 18 49 38C46 48 39 53 32 53S18 48 15 38Z" fill="#e8742c" />
      <path d="M18 36C22 40 27 42 32 42S42 40 46 36C45 46 39 52 32 52S19 46 18 36Z" fill="#fff4e6" />
      <path d="M17 21 23 29 18 30Z M47 21 41 29 46 30Z" fill="#b8501a" />
      <circle cx="25" cy="34" r="2.2" fill={INK} /><circle cx="39" cy="34" r="2.2" fill={INK} />
      <path d="M29.5 44h5L32 47Z" fill={INK} />
    </g>
  ),
  cat: (
    <g>
      <path d="M15 20 22 28C25 26 28 25.5 32 25.5S39 26 42 28L49 20 49 37C49 46 41 52 32 52S15 46 15 37Z" fill="#8c8a86" />
      <path d="M18 23 22 28 18.5 30Z M46 23 42 28 45.5 30Z" fill="#f2b8a8" />
      <ellipse cx="25" cy="36" rx="2.4" ry="3" fill="#f5d95a" /><ellipse cx="39" cy="36" rx="2.4" ry="3" fill="#f5d95a" />
      <path d="M25 34v4M39 34v4" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M30 42h4l-2 2.2Z" fill="#e48a8a" />
      <path d="M21 43h-6M21 45.5l-5 2M43 43h6M43 45.5l5 2" stroke="#e9e6e0" strokeWidth="1.1" strokeLinecap="round" />
    </g>
  ),
  owl: (
    <g>
      <path d="M17 22C17 16 22 15 25 19 28 17 36 17 39 19 42 15 47 16 47 22V40C47 48 40 53 32 53S17 48 17 40Z" fill="#9a6b45" />
      <path d="M22 41C24 47 28 50 32 50S40 47 42 41C40 44 36 45 32 45S24 44 22 41Z" fill="#d9b48a" />
      <circle cx="25.5" cy="30" r="6" fill="#fff8ec" /><circle cx="38.5" cy="30" r="6" fill="#fff8ec" />
      <circle cx="25.5" cy="30" r="2.8" fill={INK} /><circle cx="38.5" cy="30" r="2.8" fill={INK} />
      <path d="M30 35h4l-2 4Z" fill="#e8a23a" />
    </g>
  ),
  bear: (
    <g>
      <circle cx="19" cy="20" r="6.5" fill="#7a5236" /><circle cx="45" cy="20" r="6.5" fill="#7a5236" />
      <circle cx="19" cy="20" r="3" fill="#c79a74" /><circle cx="45" cy="20" r="3" fill="#c79a74" />
      <circle cx="32" cy="35" r="18" fill="#7a5236" />
      <ellipse cx="32" cy="42" rx="8.5" ry="6.5" fill="#d7b190" />
      <circle cx="25" cy="32" r="2.2" fill={INK} /><circle cx="39" cy="32" r="2.2" fill={INK} />
      <ellipse cx="32" cy="39.5" rx="3" ry="2.1" fill={INK} />
    </g>
  ),
  rabbit: (
    <g>
      <ellipse cx="24.5" cy="17" rx="4.5" ry="12" fill="#eeeae4" /><ellipse cx="39.5" cy="17" rx="4.5" ry="12" fill="#eeeae4" />
      <ellipse cx="24.5" cy="17" rx="2" ry="8.5" fill="#f2b8b8" /><ellipse cx="39.5" cy="17" rx="2" ry="8.5" fill="#f2b8b8" />
      <circle cx="32" cy="38" r="15" fill="#eeeae4" />
      <circle cx="26" cy="36" r="2.1" fill={INK} /><circle cx="38" cy="36" r="2.1" fill={INK} />
      <path d="M30 41.5h4l-2 2Z" fill="#e48a8a" />
      <circle cx="22.5" cy="42" r="2.4" fill="#f6c6c6" opacity=".7" /><circle cx="41.5" cy="42" r="2.4" fill="#f6c6c6" opacity=".7" />
    </g>
  ),
  frog: (
    <g>
      <circle cx="22" cy="23" r="7.5" fill="#5aa24a" /><circle cx="42" cy="23" r="7.5" fill="#5aa24a" />
      <ellipse cx="32" cy="38" rx="19" ry="14" fill="#5aa24a" />
      <circle cx="22" cy="23" r="4.5" fill="#fff" /><circle cx="42" cy="23" r="4.5" fill="#fff" />
      <circle cx="22.8" cy="23.5" r="2.4" fill={INK} /><circle cx="42.8" cy="23.5" r="2.4" fill={INK} />
      <path d="M22 41C26 45 38 45 42 41" stroke="#2f6a26" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="19" cy="38" r="2.4" fill="#f09a8a" opacity=".6" /><circle cx="45" cy="38" r="2.4" fill="#f09a8a" opacity=".6" />
    </g>
  ),
  leaf: (
    <g>
      <path d="M16 46C16 26 28 15 49 14 49 35 38 48 18 48Z" fill="#3f9a55" />
      <path d="M18 47C26 37 34 29 44 20" stroke="#cfe8cf" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M27 37 24 28M33 31 31 22M33 31 41 31M27 37 35 38" stroke="#cfe8cf" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  ),
  tree: (
    <g>
      <rect x="29.5" y="38" width="5" height="14" rx="2" fill="#8a5a36" />
      <circle cx="32" cy="27" r="13" fill="#3e8f4c" />
      <circle cx="22.5" cy="34" r="8" fill="#4ea35c" /><circle cx="41.5" cy="34" r="8" fill="#4ea35c" />
      <circle cx="27" cy="23" r="2" fill="#e85d4a" /><circle cx="38" cy="29" r="2" fill="#e85d4a" /><circle cx="24" cy="35" r="2" fill="#e85d4a" />
    </g>
  ),
  sun: (
    <g>
      <g stroke="#e8962a" strokeWidth="3" strokeLinecap="round">
        <path d="M32 9v6M32 49v6M9 32h6M49 32h6M15.7 15.7l4.3 4.3M44 44l4.3 4.3M15.7 48.3 20 44M44 20l4.3-4.3" />
      </g>
      <circle cx="32" cy="32" r="12" fill="#f4b73a" />
      <circle cx="27.5" cy="30.5" r="1.6" fill={INK} /><circle cx="36.5" cy="30.5" r="1.6" fill={INK} />
      <path d="M27.5 35.5C29.5 38 34.5 38 36.5 35.5" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  flower: (
    <g>
      <path d="M32 40v13" stroke="#3e8f4c" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 48C27 44 22 45 20 47 24 50 29 50 32 48Z" fill="#4ea35c" />
      {[0, 60, 120, 180, 240, 300].map((r) => <ellipse key={r} cx="32" cy="18.5" rx="6" ry="8.5" fill="#e86a8a" transform={`rotate(${r} 32 28)`} />)}
      <circle cx="32" cy="28" r="6" fill="#f5c84a" />
    </g>
  ),
  mountain: (
    <g>
      <path d="M8 50 25 22 34 36 40 28 56 50Z" fill="#5d6f86" />
      <path d="M25 22 30.5 31 27 29.5 23.5 32 20.5 29.6Z M40 28 44.5 34 41.5 33 39 35 36.6 33.3Z" fill="#f4f4f0" />
      <circle cx="46" cy="17" r="5" fill="#f4b73a" />
    </g>
  ),
  water: (
    <g>
      <path d="M32 12C32 12 19 28 19 37A13 13 0 0 0 45 37C45 28 32 12 32 12Z" fill="#2f8fd0" />
      <path d="M26 37A6 6 0 0 0 31 43" stroke="#cfe8f8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M10 52C14 49 18 49 22 52S30 55 34 52 42 49 46 52 52 55 54 53" stroke="#2f8fd0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>
  ),
};

const GROUNDS: [string, string] = ["#f3ead8", "#dcebe0"];
const GROUND_B: Record<string, string> = {
  fox: "#dfe9f2", cat: "#f6e3d3", owl: "#e4ecd6", bear: "#f2e6c9", rabbit: "#d9e8f0", frog: "#f5e6cf",
  leaf: "#f4ead2", tree: "#dbe9f4", sun: "#dbe8f2", flower: "#e6efd9", mountain: "#f5e8d2", water: "#f3ecd9",
};

/** v2 animal/nature presets: still drawn for people who picked one, no longer offered. */
const LEGACY: string[] = Object.keys(MOTIFS).flatMap((m) => [`${m}-a`, `${m}-b`]);

/* ───────── v5: people ───────── */
type Hair = "short" | "side" | "curly" | "long" | "bun" | "hijab" | "doppi" | "beanie" | "braids" | "buzz";
interface Person { skin: string; hair: Hair; hairC: string; top: string; bg: string; glasses?: boolean; beard?: boolean; freckles?: boolean; cap?: string }
const SK = ["#f7d7b8", "#efc199", "#dca47b", "#b97a50", "#87512f"];
const HC = { black: "#22170f", dark: "#3d2717", brown: "#6e4222", auburn: "#9c4a22", blond: "#d29a3f", grey: "#9aa0a6" };
const PEOPLE: Record<string, Person> = {
  p01: { skin: SK[1], hair: "doppi", hairC: HC.black, top: "#1fa84a", bg: "#dcf0fd" },
  p02: { skin: SK[0], hair: "long", hairC: HC.dark, top: "#ec4f93", bg: "#fff3cf" },
  p03: { skin: SK[2], hair: "short", hairC: HC.black, top: "#1c9bf0", bg: "#ffe3dd", glasses: true },
  p04: { skin: SK[1], hair: "hijab", hairC: "#10b3a3", top: "#10b3a3", bg: "#fde1ee" },
  p05: { skin: SK[3], hair: "curly", hairC: HC.black, top: "#ffbf1f", bg: "#d6f5f1" },
  p06: { skin: SK[0], hair: "bun", hairC: HC.auburn, top: "#6d74f5", bg: "#ddf5e3", freckles: true },
  p07: { skin: SK[2], hair: "side", hairC: HC.dark, top: "#ff6248", bg: "#dcf0fd", beard: true },
  p08: { skin: SK[1], hair: "braids", hairC: HC.black, top: "#1fa84a", bg: "#ffe8d2" },
  p09: { skin: SK[4], hair: "buzz", hairC: HC.black, top: "#1c9bf0", bg: "#fff3cf" },
  p10: { skin: SK[0], hair: "beanie", hairC: HC.blond, top: "#ff8a1f", bg: "#dcf0fd", cap: "#1fa84a" },
  p11: { skin: SK[2], hair: "hijab", hairC: "#ec4f93", top: "#ec4f93", bg: "#dcf0fd", glasses: true },
  p12: { skin: SK[1], hair: "short", hairC: HC.brown, top: "#10b3a3", bg: "#fde1ee" },
  p13: { skin: SK[3], hair: "long", hairC: HC.black, top: "#ffbf1f", bg: "#ddf5e3" },
  p14: { skin: SK[1], hair: "doppi", hairC: HC.grey, top: "#6d74f5", bg: "#ffe8d2", beard: true, glasses: true },
  p15: { skin: SK[0], hair: "curly", hairC: HC.auburn, top: "#1fa84a", bg: "#fff3cf", freckles: true },
  p16: { skin: SK[2], hair: "bun", hairC: HC.black, top: "#ff6248", bg: "#d6f5f1" },
  p17: { skin: SK[4], hair: "braids", hairC: HC.black, top: "#ec4f93", bg: "#fff3cf" },
  p18: { skin: SK[1], hair: "beanie", hairC: HC.dark, top: "#1c9bf0", bg: "#ffe3dd", cap: "#ff6248" },
  p19: { skin: SK[0], hair: "side", hairC: HC.blond, top: "#ec4f93", bg: "#ddf5e3", glasses: true },
  p20: { skin: SK[3], hair: "hijab", hairC: "#ffbf1f", top: "#ffbf1f", bg: "#d6f5f1" },
  p21: { skin: SK[2], hair: "buzz", hairC: HC.dark, top: "#10b3a3", bg: "#ffe3dd", beard: true },
  p22: { skin: SK[0], hair: "long", hairC: HC.blond, top: "#1c9bf0", bg: "#fde1ee" },
  p23: { skin: SK[1], hair: "short", hairC: HC.black, top: "#ffbf1f", bg: "#dcf0fd", freckles: true },
  p24: { skin: SK[4], hair: "curly", hairC: HC.black, top: "#6d74f5", bg: "#ddf5e3", glasses: true },
};

function darker(hex: string, k = 0.22) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k)).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function PersonArt({ p }: { p: Person }) {
  const shade = darker(p.skin, 0.12), hair = p.hairC, hairD = darker(hair, 0.25), top = p.top;
  const scarf = p.hair === "hijab";
  return (
    <>
      <rect width="80" height="80" fill={p.bg} />
      <circle cx="64" cy="14" r="22" fill="#fff" opacity=".35" />
      {/* hair that falls behind the head */}
      {p.hair === "long" && <path d="M21 36C21 20 30 13 40 13S59 20 59 36V62H21Z" fill={hair} />}
      {p.hair === "braids" && <><path d="M22 34C22 20 30 14 40 14S58 20 58 34V44H22Z" fill={hair} /><path d="M21 40c-3 6 3 9 0 15s3 9 0 13M59 40c3 6-3 9 0 15s-3 9 0 13" stroke={hair} strokeWidth="6" strokeLinecap="round" fill="none" /></>}
      {scarf && <path d="M17 40C17 21 27 11 40 11S63 21 63 40C63 52 58 60 60 80H20C22 60 17 52 17 40Z" fill={hair} />}
      {/* body */}
      <path d="M12 80C12 64 24 56 40 56S68 64 68 80Z" fill={top} />
      <path d="M12 80C12 72 15 66 20 62C22 70 21 76 22 80Z" fill={darker(top, 0.15)} />
      {!scarf && <><rect x="34.5" y="47" width="11" height="11" rx="4" fill={shade} /><path d="M33 56L40 64L47 56Z" fill={p.skin} /></>}
      {scarf && <path d="M24 60C30 66 50 66 56 60L60 80H20Z" fill={darker(hair, 0.12)} />}
      {/* head */}
      {!scarf && <><ellipse cx="24.5" cy="38" rx="3.6" ry="4.4" fill={shade} /><ellipse cx="55.5" cy="38" rx="3.6" ry="4.4" fill={shade} /></>}
      <ellipse cx="40" cy="36.5" rx={scarf ? 13 : 15.5} ry={scarf ? 15 : 17.5} fill={p.skin} />
      {scarf && <path d="M24 34C25 22 32 18 40 18S55 22 56 34C52 27 47 24 40 24S28 27 24 34Z" fill={hair} />}
      {/* hair on top */}
      {p.hair === "short" && <path d="M24 35C23 21 31 15 41 15C51 15 58 22 56.5 35C55 28 50 24.5 44 24C40 27 32 27 28 25C26 28 25 31 24 35Z" fill={hair} />}
      {p.hair === "buzz" && <path d="M25 33C25 21 32 17 40 17S55 21 55 33C51 26 46 24 40 24S29 26 25 33Z" fill={hair} opacity=".92" />}
      {p.hair === "side" && <path d="M24 37C22 21 31 14 42 15C52 16 58 23 56.5 36C54 27 49 24 46 23C40 29 30 30 24 37Z" fill={hair} />}
      {p.hair === "curly" && <g fill={hair}>{[[27, 25, 6], [33, 19, 6.5], [41, 17, 7], [49, 20, 6.5], [54, 27, 5.5], [24, 32, 4.5], [56, 33, 4]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}</g>}
      {p.hair === "long" && <path d="M24 38C23 22 31 16 40 16S57 22 56 38C53 30 48 25 40 24C35 29 29 32 24 38Z" fill={hair} />}
      {p.hair === "braids" && <path d="M24 36C24 22 31 17 40 17S56 22 56 36C52 29 46 25 40 25S28 29 24 36Z" fill={hair} />}
      {p.hair === "bun" && <><circle cx="40" cy="13" r="7" fill={hair} /><path d="M24 36C24 22 31 17 40 17S56 22 56 36C52 28 46 25 40 25S28 28 24 36Z" fill={hair} /></>}
      {p.hair === "doppi" && <>
        <path d="M24.5 33C25 26 30 23 40 23S55 26 55.5 33C51 29 46 28 40 28S29 29 24.5 33Z" fill={hair} />
        <path d="M25 27L27 15C33 11.5 47 11.5 53 15L55 27C49 24.5 31 24.5 25 27Z" fill="#1d1d1d" />
        <path d="M25 27C31 24.5 49 24.5 55 27" stroke="#2a2a2a" strokeWidth="2" fill="none" />
        <g fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"><path d="M31 21c0-3 3-5 5-3M41 20c0-3 3-5 5-3" /><path d="M35.5 14.5c1 2 3 2 4 0" /></g>
      </>}
      {p.hair === "beanie" && <>
        <path d="M24.5 34C24 30 27 28 30 28H50C53 28 56 30 55.5 34Z" fill={hair} />
        <path d="M24 29C24 18 31 12 40 12S56 18 56 29Z" fill={p.cap} />
        <rect x="22.5" y="25" width="35" height="7" rx="3.5" fill={darker(p.cap ?? top, 0.18)} />
        <circle cx="40" cy="10.5" r="3.5" fill="#fff" />
      </>}
      {/* face */}
      <g>
        <path d="M31.5 32.5q3-2 6 0M42.5 32.5q3-2 6 0" stroke={hairD} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <ellipse cx="34.5" cy="37.5" rx="2.1" ry="2.5" fill="#1d1712" /><ellipse cx="45.5" cy="37.5" rx="2.1" ry="2.5" fill="#1d1712" />
        <circle cx="35.2" cy="36.7" r=".75" fill="#fff" /><circle cx="46.2" cy="36.7" r=".75" fill="#fff" />
        <circle cx="30.5" cy="43" r="2.6" fill="#ff7a7a" opacity=".28" /><circle cx="49.5" cy="43" r="2.6" fill="#ff7a7a" opacity=".28" />
        <path d="M39 41.5q1 1.2 2 0" stroke={darker(p.skin, 0.3)} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M35.5 45.5Q40 49.5 44.5 45.5" stroke="#7a3a2a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        {p.freckles && <g fill={darker(p.skin, 0.32)}>{[[30, 40.5], [32, 42], [48, 40.5], [50, 42], [31, 43.5], [49, 43.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".7" />)}</g>}
        {p.beard && <path d="M25.5 41C27 51 33 55 40 55S53 51 54.5 41C52 46 48 48.5 44.5 48.5C43 50 37 50 35.5 48.5C32 48.5 28 46 25.5 41Z" fill={hair} opacity=".95" />}
        {p.beard && <path d="M35.5 46.5Q40 49 44.5 46.5" stroke="#5a2a1e" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
        {p.glasses && <g fill="none" stroke="#1d1712" strokeWidth="1.6"><circle cx="34.5" cy="37.5" r="4.6" /><circle cx="45.5" cy="37.5" r="4.6" /><path d="M39.1 37.2h1.8M29.9 36.5l-4 -1M50.1 36.5l4-1" /></g>}
      </g>
    </>
  );
}


/* ───────── v8: the New Year cast ───────── */
const EYES = (y = 37.5, dx = 5.5) => <>
  <ellipse cx={40 - dx} cy={y} rx="2.1" ry="2.5" fill="#1d1712" /><ellipse cx={40 + dx} cy={y} rx="2.1" ry="2.5" fill="#1d1712" />
  <circle cx={40.7 - dx} cy={y - .8} r=".75" fill="#fff" /><circle cx={40.7 + dx} cy={y - .8} r=".75" fill="#fff" />
</>;
const SNOW_DOTS = <g fill="#fff" opacity=".8">{[[10, 12, 1.4], [70, 22, 1.2], [14, 58, 1], [66, 66, 1.5], [22, 30, .9], [60, 8, 1]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}</g>;
const WINTER: Record<string, ReactNode> = {
  w01: <>{/* Qorbobo */}
    <rect width="80" height="80" fill="#cfe3f6" />{SNOW_DOTS}
    <path d="M12 80C12 64 24 57 40 57S68 64 68 80Z" fill="#d6262f" /><path d="M30 58h20l-2 22H32Z" fill="#fff" opacity=".95" />
    <ellipse cx="40" cy="37" rx="15" ry="16.5" fill="#f5cfae" />
    <path d="M23 40C23 58 32 66 40 66S57 58 57 40C54 46 48 49 40 49S26 46 23 40Z" fill="#fff" />
    <path d="M30 47c4-3 7-3 10-1 3-2 6-2 10 1-3 3-7 3-10 1-3 2-7 2-10-1Z" fill="#f2f2f2" stroke="#e1e1e1" strokeWidth=".6" />
    {EYES(36)}
    <circle cx="30" cy="41.5" r="3" fill="#ff7a7a" opacity=".4" /><circle cx="50" cy="41.5" r="3" fill="#ff7a7a" opacity=".4" />
    <ellipse cx="40" cy="42" rx="2.6" ry="2.2" fill="#f0a98a" />
    <path d="M24 29C25 15 34 9 46 11 54 12 60 18 63 27 58 23 52 21 47 21Z" fill="#d6262f" />
    <path d="M47 13c8 1 14 6 16 14" stroke="#a81c24" strokeWidth="1.2" fill="none" opacity=".5" />
    <rect x="22" y="26" width="36" height="7.5" rx="3.75" fill="#fff" /><circle cx="63.5" cy="29" r="4.6" fill="#fff" />
  </>,
  w02: <>{/* Qorqiz */}
    <rect width="80" height="80" fill="#e4f1fb" />{SNOW_DOTS}
    <path d="M58 30c6 10 4 26 0 38-2 4-6 3-6-1 2-12 4-24 0-34Z" fill="#e8b04c" />
    <path d="M12 80C12 65 24 57 40 57S68 65 68 80Z" fill="#2f7fd6" /><path d="M36 57h8v23h-8Z" fill="#fff" /><path d="M14 74c8-4 18-5 26-5s18 1 26 5v6H14Z" fill="#fff" opacity=".9" />
    <ellipse cx="40" cy="38" rx="14.5" ry="16.5" fill="#f7dcc4" />
    <path d="M26 36C26 24 32 20 40 20S54 24 54 36C51 30 46 27 40 27S29 30 26 36Z" fill="#e8b04c" />
    {EYES(38, 5.2)}
    <path d="M33 33.5q2.5-1.6 5 0M42 33.5q2.5-1.6 5 0" stroke="#b07a2a" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <circle cx="31" cy="43.5" r="2.8" fill="#ff7aa0" opacity=".35" /><circle cx="49" cy="43.5" r="2.8" fill="#ff7aa0" opacity=".35" />
    <path d="M36 46.5Q40 49.5 44 46.5" stroke="#c0455a" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    <path d="M23 26C24 13 31 7 40 7S56 13 57 26C51 23 46 22 40 22S29 23 23 26Z" fill="#2f7fd6" />
    <path d="M23 26C29 22.5 51 22.5 57 26L56.5 29C50 26 30 26 23.5 29Z" fill="#fff" />
    <g stroke="#fff" strokeWidth="1.4" strokeLinecap="round"><path d="M40 10v9M36.1 12.2l7.8 4.6M36.1 16.8l7.8-4.6" /></g>
    <g fill="#bfe3ff">{[[28, 17], [52, 17], [33, 12.5], [47, 12.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.3" />)}</g>
  </>,
  w03: <>{/* Qorbola */}
    <rect width="80" height="80" fill="#cfe7f2" />{SNOW_DOTS}
    <circle cx="40" cy="86" r="30" fill="#fff" /><circle cx="40" cy="86" r="30" fill="none" stroke="#dbe8f0" strokeWidth="2" />
    <path d="M18 58c10 6 34 6 44 0l1 6c-12 6-34 6-46 0Z" fill="#e2333b" /><path d="M50 61l6 16-6 1-4-15Z" fill="#c22831" />
    <circle cx="40" cy="40" r="18" fill="#fff" /><path d="M24 46a18 18 0 0 0 32 0" fill="#e6eff5" opacity=".7" />
    <circle cx="34" cy="37" r="2.3" fill="#1d1712" /><circle cx="46" cy="37" r="2.3" fill="#1d1712" />
    <path d="M40 41l13 3-13 2Z" fill="#f08a24" />
    <g fill="#2a2420">{[[33, 49], [36.5, 51], [40, 51.6], [43.5, 51], [47, 49]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.1" />)}</g>
    <circle cx="30" cy="43" r="2.6" fill="#ff8a8a" opacity=".35" /><circle cx="50" cy="43" r="2.6" fill="#ff8a8a" opacity=".35" />
    <rect x="27" y="22" width="26" height="4" rx="2" fill="#1f1f24" /><rect x="31" y="6" width="18" height="17" rx="2" fill="#1f1f24" /><rect x="31" y="17" width="18" height="3.5" fill="#e2333b" />
  </>,
  w04: <>{/* Elf */}
    <rect width="80" height="80" fill="#e2f3e4" />{SNOW_DOTS}
    <path d="M12 80C12 65 24 57 40 57S68 65 68 80Z" fill="#1d9a4a" /><path d="M28 58l12 8 12-8-2 8-10 4-10-4Z" fill="#d6262f" />
    <path d="M23 38l-9-8 11 2ZM57 38l9-8-11 2Z" fill="#f2c7a2" />
    <ellipse cx="40" cy="39" rx="15" ry="16.5" fill="#f5cfae" />
    {EYES(39)}
    <g fill="#c98a5e">{[[31, 43], [33, 44.5], [47, 43], [49, 44.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".75" />)}</g>
    <path d="M35 47Q40 51 45 47" stroke="#7a3a2a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M24 30C26 18 33 10 42 9 50 8 58 4 64 2 60 10 58 18 56 30Z" fill="#1d9a4a" />
    <rect x="22" y="27" width="36" height="6" rx="3" fill="#d6262f" /><circle cx="64.5" cy="3.5" r="3.2" fill="#ffd23f" />
  </>,
  w05: <>{/* Bug'u */}
    <rect width="80" height="80" fill="#f4e9d8" />{SNOW_DOTS}
    <g stroke="#8a5a32" strokeWidth="3.2" strokeLinecap="round" fill="none"><path d="M28 24C22 16 22 8 24 4M24 14l-6-4M26 19l-7 1" /><path d="M52 24c6-8 6-16 4-20M56 14l6-4M54 19l7 1" /></g>
    <path d="M16 80C16 66 26 58 40 58S64 66 64 80Z" fill="#b8473a" /><path d="M30 60h20v6H30Z" fill="#ffd23f" />
    <ellipse cx="22" cy="30" rx="6" ry="3.5" transform="rotate(-25 22 30)" fill="#a26a3e" /><ellipse cx="58" cy="30" rx="6" ry="3.5" transform="rotate(25 58 30)" fill="#a26a3e" />
    <path d="M26 34C26 24 32 20 40 20S54 24 54 34C54 46 50 58 40 58S26 46 26 34Z" fill="#a26a3e" />
    <ellipse cx="40" cy="49" rx="9" ry="7.5" fill="#d9b48a" />
    {EYES(35, 6)}
    <circle cx="40" cy="47" r="4.6" fill="#e2333b" /><circle cx="38.6" cy="45.6" r="1.4" fill="#fff" opacity=".7" />
    <path d="M36.5 53Q40 55.5 43.5 53" stroke="#5a3418" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </>,
  w06: <>{/* Pingvin */}
    <rect width="80" height="80" fill="#dbeaf8" />{SNOW_DOTS}
    <path d="M14 80C14 62 25 52 40 52S66 62 66 80Z" fill="#1f2530" /><path d="M26 80C26 66 32 60 40 60S54 66 54 80Z" fill="#fff" />
    <path d="M20 56c10 5 30 5 40 0l1 6c-12 5-30 5-42 0Z" fill="#1c9bf0" /><path d="M24 60l-4 14 6 1 3-14Z" fill="#147fc8" />
    <circle cx="40" cy="38" r="17" fill="#1f2530" />
    <path d="M27 40C27 30 33 27 40 31 47 27 53 30 53 40 53 48 47 52 40 52S27 48 27 40Z" fill="#fff" />
    {EYES(39, 5.2)}
    <path d="M36 44l4 4 4-4Z" fill="#ffb21f" />
    <circle cx="31" cy="45" r="2.4" fill="#ff8aa0" opacity=".4" /><circle cx="49" cy="45" r="2.4" fill="#ff8aa0" opacity=".4" />
    <path d="M23 31C23 19 31 13 40 13S57 19 57 31Z" fill="#1c9bf0" /><rect x="21.5" y="27" width="37" height="7" rx="3.5" fill="#fff" />
    <circle cx="40" cy="11" r="4" fill="#fff" />
  </>,
};

/** What the picker offers (the New Year cast first). */
export const AVATAR_PRESETS: string[] = [...Object.keys(WINTER), ...Object.keys(PEOPLE)];
/** v8: presets that already wear something festive (no extra Santa hat on top). */
export const HATTED = new Set(Object.keys(WINTER));

export function isPreset(src: string | null | undefined): boolean {
  if (!src || !src.startsWith("preset:")) return false;
  const id = src.slice(7);
  return id in PEOPLE || id in WINTER || LEGACY.includes(id);
}

export function PresetArt({ id }: { id: string }) {
  if (WINTER[id]) {
    return (
      <svg viewBox="0 0 80 80" width="100%" height="100%" role="img" aria-hidden style={{ display: "block" }}>
        {WINTER[id]}
      </svg>
    );
  }
  if (PEOPLE[id]) {
    return (
      <svg viewBox="0 0 80 80" width="100%" height="100%" role="img" aria-hidden style={{ display: "block" }}>
        <PersonArt p={PEOPLE[id]} />
      </svg>
    );
  }
  const [motif, variant] = id.split("-");
  const ground = variant === "b" ? GROUND_B[motif] ?? GROUNDS[1] : GROUNDS[0];
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-hidden style={{ display: "block" }}>
      <rect width="64" height="64" fill={ground} />
      {MOTIFS[motif]}
    </svg>
  );
}
