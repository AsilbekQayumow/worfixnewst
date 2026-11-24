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

export const AVATAR_PRESETS: string[] = Object.keys(MOTIFS).flatMap((m) => [`${m}-a`, `${m}-b`]);

export function isPreset(src: string | null | undefined): boolean {
  return Boolean(src && src.startsWith("preset:") && AVATAR_PRESETS.includes(src.slice(7)));
}

export function PresetArt({ id }: { id: string }) {
  const [motif, variant] = id.split("-");
  const ground = variant === "b" ? GROUND_B[motif] ?? GROUNDS[1] : GROUNDS[0];
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-hidden style={{ display: "block" }}>
      <rect width="64" height="64" fill={ground} />
      {MOTIFS[motif]}
    </svg>
  );
}
