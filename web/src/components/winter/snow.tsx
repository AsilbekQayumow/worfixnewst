"use client";
import { useEffect, useRef } from "react";

interface Flake { x: number; y: number; r: number; vy: number; phase: number; sway: number; star: boolean; spin: number; a: number }

/** v8: falling snow behind the page (it shows through the gaps between cards, never over text). */
export function Snow({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const g = cv.getContext("2d");
    if (!g) return;
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    let flakes: Flake[] = [];
    const make = (top: boolean): Flake => {
      const r = Math.random() < 0.12 ? 3 + Math.random() * 2.5 : 0.8 + Math.random() * 2.2;
      return {
        x: Math.random() * w, y: top ? -10 - Math.random() * 40 : Math.random() * h, r,
        vy: 14 + r * 9 + Math.random() * 10, phase: Math.random() * Math.PI * 2, sway: 8 + Math.random() * 22,
        star: r > 3, spin: Math.random() * Math.PI, a: 0.45 + Math.random() * 0.45,
      };
    };
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, (w * h) / 14000) * density);
      flakes = Array.from({ length: n }, () => make(false));
    };
    const star = (f: Flake) => {
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.spin);
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * f.r * 1.6, Math.sin(a) * f.r * 1.6);
      }
      g.stroke();
      g.restore();
    };
    const color = () => (document.documentElement.dataset.theme === "dark" ? "255,255,255" : "176,198,222");
    let rgb = color();
    const theme = new MutationObserver(() => { rgb = color(); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      g.clearRect(0, 0, w, h);
      const wind = Math.sin(now / 5200) * 12;
      g.lineWidth = 1.1;
      for (const f of flakes) {
        f.y += f.vy * dt;
        f.phase += dt * 0.9;
        f.spin += dt * 0.4;
        f.x += (Math.sin(f.phase) * f.sway * 0.04) + wind * dt;
        if (f.y > h + 10) Object.assign(f, make(true));
        if (f.x < -10) f.x = w + 10; else if (f.x > w + 10) f.x = -10;
        g.fillStyle = g.strokeStyle = `rgba(${rgb},${f.a})`;
        if (f.star) star(f);
        else { g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill(); }
      }
      raf = requestAnimationFrame(tick);
    };
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    size();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", size); document.removeEventListener("visibilitychange", vis); theme.disconnect(); };
  }, [density]);
  return <canvas ref={ref} className="snow-canvas" aria-hidden />;
}
