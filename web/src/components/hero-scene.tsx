"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DIFFICULTY_REWARD } from "@/lib/domain/rewards";
import { useI18n } from "@/lib/i18n";
import { Icon } from "./icons";
import { Tilt } from "./motion";
import { RankBadge } from "./rank";
import { contours } from "./topo";
import { Coins } from "./ui";

const W = 600;
const H = 560;
const TRAIL = "M118,470 C170,430 160,380 220,360 S330,350 350,300 S420,230 452,196";
const LOOP_MS = 12000;

/**
 * The landing hero: a field map that draws itself, a volunteer walks the trail to a mission,
 * the photo is approved and XP lands. Loops; holds still for reduced motion.
 */
export function HeroScene() {
  const { t } = useI18n();
  const [run, setRun] = useState(0);
  const [still, setStill] = useState(false);
  const walker = useRef<SVGAnimateMotionElement>(null);
  const lines = useMemo(() => contours(W, H), []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(mq.matches);
    if (mq.matches) return;
    let visible = true;
    const vis = () => { visible = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", vis);
    const id = window.setInterval(() => { if (visible) setRun((n) => n + 1); }, LOOP_MS);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);

  useEffect(() => {
    if (still) return;
    const id = window.setTimeout(() => { try { walker.current?.beginElement(); } catch { /* old browsers */ } }, 3300);
    return () => window.clearTimeout(id);
  }, [run, still]);

  const reward = DIFFICULTY_REWARD.medium;
  return (
    <Tilt className="hero-scene">
      <div className="scene" key={run} data-still={still || undefined}>
        <div className="scene-map layer-back">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <mask id="trail-mask">
                <path d={TRAIL} pathLength={1} fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" className="trail-reveal" />
              </mask>
              <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--leaf)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--leaf)" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="var(--map-land)" />
            <path className="scene-water" d="M-10,120 C80,140 140,90 230,110 S380,170 470,150 S580,120 620,140 L620,175 C560,160 500,190 460,190 S360,150 260,140 S120,170 -10,155Z" fill="var(--map-water)" />
            {lines.map((l, i) => (
              <path key={i} d={l.d} pathLength={1} className="contour" style={{ animationDelay: `${120 + i * 45}ms` }}
                fill="none" stroke={l.strong ? "var(--map-contour-strong)" : "var(--map-contour)"} strokeWidth={l.strong ? 1.4 : 1} />
            ))}
            <g stroke="var(--map-contour)" strokeWidth={1} className="scene-grid">
              {Array.from({ length: 7 }, (_, i) => <line key={`v${i}`} x1={i * 100} y1={0} x2={i * 100} y2={H} strokeDasharray="2 6" />)}
              {Array.from({ length: 6 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 100} x2={W} y2={i * 100} strokeDasharray="2 6" />)}
            </g>

            {/* the trail from you to the mission */}
            <g mask="url(#trail-mask)">
              <path d={TRAIL} fill="none" stroke="var(--surface)" strokeWidth={8} strokeLinecap="round" opacity={0.9} />
              <path d={TRAIL} fill="none" stroke="var(--text)" strokeWidth={3.2} strokeLinecap="round" strokeDasharray="1 8" />
            </g>

            {/* other missions nearby */}
            {[[250, 250, "#1d6fb8", 1.9], [520, 420, "#c27a12", 2.1], [300, 470, "#7a4cc2", 2.3]].map(([x, y, c, d]) => (
              <g key={`${x}`} transform={`translate(${x} ${y})`}>
                <g className="pin-pop" style={{ animationDelay: `${d}s` }}>
                  <circle r={5} fill={c as string} stroke="var(--surface)" strokeWidth={2.5} />
                </g>
              </g>
            ))}

            {/* you */}
            <g transform="translate(118 470)">
              <circle r={10} className="ripple" fill="var(--info)" />
              <circle r={10} className="ripple r2" fill="var(--info)" />
              <g className="pin-pop" style={{ animationDelay: "1.1s" }}>
                <circle r={22} fill="color-mix(in oklab, var(--info) 18%, transparent)" />
                <circle r={8} fill="var(--info)" stroke="var(--surface)" strokeWidth={3} />
              </g>
            </g>

            {/* walking volunteer */}
            {!still && (
              <g className="walker">
                <circle r={26} fill="url(#glow)" />
                <circle r={7} fill="var(--accent)" stroke="var(--surface)" strokeWidth={3} />
                <animateMotion ref={walker} begin="indefinite" dur="1.6s" fill="freeze" path={TRAIL} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.25 1" />
              </g>
            )}

            {/* the mission */}
            <g transform="translate(452 196)">
              <circle r={14} className="ripple accent" fill="var(--accent)" style={{ animationDelay: "4.9s" }} />
              <g className="pin-drop" style={{ animationDelay: "1.5s" }}>
                <path d="M0 0c-9-12-15-18-15-26a15 15 0 0 1 30 0c0 8-6 14-15 26Z" fill="var(--accent)" stroke="var(--surface)" strokeWidth={2.5} />
                <circle cy={-26} r={5.5} fill="var(--surface)" />
              </g>
            </g>
            <text x={470} y={232} fontFamily="var(--font-mono)" fontSize={11} fill="var(--text-2)" className="scene-label" style={{ animationDelay: "1.8s" }}>39.6542° N  66.9597° E</text>
            <text x={136} y={500} fontFamily="var(--font-mono)" fontSize={11} fill="var(--text-2)" className="scene-label" style={{ animationDelay: "2.6s" }}>1.2 km · 16 min</text>
          </svg>
        </div>

        <div className="float-card scene-mission layer-front">
          <div className="row between g8" style={{ marginBottom: 8 }}>
            <span className="tag cat-environment"><span className="cat-dot" />{t("cat.environment")}</span>
            <span className="t-meta">1.2 km</span>
          </div>
          <p style={{ fontWeight: 500, marginBottom: 12 }}>{t("home.demoMission")}</p>
          <div className="row between" style={{ borderTop: "1px dashed var(--line-strong)", paddingTop: 10, position: "relative" }}>
            <span className="status-swap">
              <span className="status s-warn swap-a">{t("vs.pending")}</span>
              <span className="status s-ok swap-b">{t("vs.approved")}</span>
            </span>
            <span className="row g12 t-small num"><span style={{ fontWeight: 500 }}>+{reward.xp} XP</span><Coins value={`+${reward.coins}`} size={14} /></span>
            <span className="xp-fly num" aria-hidden>+{reward.xp} XP</span>
          </div>
        </div>

        <div className="float-card scene-photo layer-front" aria-hidden>
          <span className="scene-photo-img"><Icon name="camera" size={18} /></span>
          <span className="scan-line" />
        </div>

        <div className="float-card scene-level layer-mid">
          <RankBadge rank="protector" size={28} />
          <span className="stack">
            <span className="t-small" style={{ fontWeight: 600 }}>{t("rank.protector")}</span>
            <span className="t-meta">{t("home.levelCert", { n: 5 })}</span>
          </span>
        </div>
      </div>
    </Tilt>
  );
}

/** A few leaves drifting across a section; purely decorative. */
export function Leaves({ count = 7 }: { count?: number }) {
  return (
    <div className="leaves" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{ ["--i" as string]: i, ["--x" as string]: `${(i * 37) % 100}%`, ["--s" as string]: `${0.7 + ((i * 13) % 6) / 10}` }}>
          <path d="M4 20c0-9 6-15 16-16-1 10-7 16-15 16H4Zm1-1c3-5 7-8 11-11" fill="currentColor" stroke="currentColor" strokeWidth="0" />
        </svg>
      ))}
    </div>
  );
}
