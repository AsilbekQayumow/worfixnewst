const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** WFX-XXXX-XXXX-XXXX, from the platform CSPRNG. */
export function makeVerificationCode(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `WFX-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

export function normaliseCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export const CODE_PATTERN = /^WFX-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;

/** Short order pickup code, e.g. FX-7KQ2-M9. */
export function makeOrderCode(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const c = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `FX-${c.slice(0, 4)}-${c.slice(4)}`;
}
