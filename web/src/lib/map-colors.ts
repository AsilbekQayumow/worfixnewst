/** A steady, distinct colour per person for the territory map (no violet). */
export const MAP_COLORS = [
  "#e11d48", "#ea580c", "#ca8a04", "#65a30d", "#16a34a", "#0d9488", "#0891b2", "#2563eb",
  "#db2777", "#b91c1c", "#0369a1", "#854d0e", "#15803d", "#be185d", "#c2410c", "#1e40af",
];

export function personColor(id: string, chosen?: string | null): string {
  if (chosen && MAP_COLORS.includes(chosen)) return chosen;
  let h = 2166136261;
  for (const ch of id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return MAP_COLORS[h % MAP_COLORS.length];
}

/** The same colour, darker, for outlines and the walked line. */
export function shade(hex: string, amount = 0.28): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
