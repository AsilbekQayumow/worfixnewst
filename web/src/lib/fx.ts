/**
 * Small, dependency-free celebration effects. Every effect is skipped when the visitor
 * prefers reduced motion, and cleans up after itself.
 */

import { haptic, isNative } from "./native";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PALETTE = ["#4daa27", "#6cc24a", "#0a6a2c", "#e0a84a", "#9a5b0b", "#cfe8bf"];

type Piece = { x: number; y: number; vx: number; vy: number; r: number; spin: number; w: number; h: number; c: string; leaf: boolean; life: number };

/** Burst of leaves and paper confetti from a point (defaults to the centre of the screen). */
export function celebrate(from?: { x: number; y: number } | HTMLElement | null, amount = 90) {
  if (typeof window === "undefined" || reduced()) return;
  let ox = window.innerWidth / 2;
  let oy = window.innerHeight / 2.4;
  if (from instanceof HTMLElement) { const r = from.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; }
  else if (from) { ox = from.x; oy = from.y; }

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "200" });
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = Array.from({ length: amount }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 6 + Math.random() * 9;
    return {
      x: ox, y: oy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 8, c: PALETTE[(Math.random() * PALETTE.length) | 0], leaf: Math.random() < 0.45, life: 1,
    };
  });

  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min((now - last) / 16.67, 2.5);
    last = now;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = 0;
    for (const p of pieces) {
      p.vy += 0.32 * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx * dt + Math.sin(p.r * 2) * 0.6;
      p.y += p.vy * dt;
      p.r += p.spin * dt;
      if (p.vy > 0) p.life -= 0.008 * dt;
      if (p.life <= 0 || p.y > window.innerHeight + 40) continue;
      alive += 1;
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      if (p.leaf) {
        ctx.beginPath();
        ctx.moveTo(0, -p.h);
        ctx.quadraticCurveTo(p.w, 0, 0, p.h);
        ctx.quadraticCurveTo(-p.w, 0, 0, -p.h);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 4, p.w, p.h / 2);
      }
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

/** Short haptic tick on phones that support it. */
export function buzz(ms = 12) {
  if (typeof navigator === "undefined" || reduced()) return;
  // v5: real haptics in the WORFIX app (a short tap, a firm one, or the "success" pattern for big moments).
  if (isNative()) { haptic(ms >= 40 ? "success" : ms >= 18 ? "medium" : "light"); return; }
  if ("vibrate" in navigator) { try { navigator.vibrate(ms); } catch { /* ignore */ } }
}
