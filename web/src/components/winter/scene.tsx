"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { comingYear, countdown, type Countdown } from "@/lib/season/winter";
import { SleighArt } from "./sleigh";
import { TreeArt } from "./tree";

/** Snow inside one box (the scene panel), not behind the page. */
function LocalSnow() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const g = cv.getContext("2d")!;
    let w = 0, h = 0, raf = 0, last = performance.now();
    let fl: { x: number; y: number; r: number; v: number; p: number }[] = [];
    const size = () => {
      const r = cv.parentElement!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      fl = Array.from({ length: Math.round((w * h) / 6000) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.8 + Math.random() * 2.6, v: 18 + Math.random() * 40, p: Math.random() * 6 }));
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,.85)";
      for (const f of fl) {
        f.y += f.v * dt; f.p += dt; f.x += Math.sin(f.p) * 0.4;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(cv.parentElement!);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="ws-snow" aria-hidden />;
}

/** v8: the sign-in art in the New Year season — a snowy town at night, the tree, Qorbobo crossing the moon. */
export function WinterScene() {
  const { t } = useI18n();
  const [c, setC] = useState<Countdown | null>(null);
  const [year, setYear] = useState(0);
  useEffect(() => {
    const tick = () => { setC(countdown()); setYear(comingYear()); };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="ws">
      <div className="ws-aurora" aria-hidden />
      <span className="ws-moon" aria-hidden />
      {Array.from({ length: 40 }, (_, i) => <span key={i} className="ws-star" aria-hidden style={{ left: `${(i * 29) % 100}%`, top: `${(i * 47) % 55}%`, animationDelay: `${(i % 7) * 0.4}s` }} />)}
      <div className="ws-flight" aria-hidden><SleighArt width={240} /></div>
      <svg className="ws-town" viewBox="0 0 600 260" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <path d="M0 150C90 110 170 120 250 140S420 170 600 120V260H0Z" fill="#c9dcf0" />
        {/* houses with lit windows */}
        <g>
          {[[40, 150, 64, 52], [120, 160, 52, 44], [400, 150, 70, 56], [490, 140, 56, 50]].map(([x, y, w, hh], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height={hh} fill={i % 2 ? "#7a5a48" : "#8a6650"} />
              <path d={`M${x - 6} ${y + 2}L${x + w / 2} ${y - 24}L${x + w + 6} ${y + 2}Z`} fill="#5b3f33" />
              <path d={`M${x - 8} ${y + 2}L${x + w / 2} ${y - 26}L${x + w + 8} ${y + 2}L${x + w + 2} ${y + 6}L${x + w / 2} ${y - 18}L${x - 2} ${y + 6}Z`} fill="#fff" />
              <rect className="ws-win" x={x + 10} y={y + 14} width="12" height="12" rx="1" style={{ animationDelay: `${i * 0.7}s` }} />
              <rect className="ws-win" x={x + w - 22} y={y + 14} width="12" height="12" rx="1" style={{ animationDelay: `${i * 0.7 + 0.3}s` }} />
            </g>
          ))}
        </g>
        <path d="M0 190C110 168 230 176 340 192S520 206 600 182V260H0Z" fill="#e6f0fa" />
        <path d="M0 220C140 206 280 212 400 222S540 230 600 218V260H0Z" fill="#ffffff" />
      </svg>
      <div className="ws-tree" aria-hidden><TreeArt width={150} /></div>
      <LocalSnow />
      <div className="ws-copy">
        <span className="ws-kicker">{t("ny.sceneKicker", { year })}</span>
        <p className="ws-title">{t("ny.sceneTitle")}</p>
        {c && !c.arrived && (
          <p className="ws-count num">
            <b>{c.days}</b> {t("ny.d")} <b>{String(c.hours).padStart(2, "0")}</b>:{String(c.minutes).padStart(2, "0")}:{String(c.seconds).padStart(2, "0")}
          </p>
        )}
      </div>
    </div>
  );
}
