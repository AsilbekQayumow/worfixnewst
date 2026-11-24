"use client";
/**
 * v5 landing hero: a bright little world. A city block map with three players' areas in their colours,
 * a loop drawing itself and filling in, volunteers bobbing on it, and the game's moments floating
 * around it (XP, a streak, an approved photo, a new area). Holds still for reduced motion.
 */
import { useI18n } from "@/lib/i18n";
import { PresetArt } from "./avatar-presets";
import { Icon } from "./icons";
import { Coins } from "./ui";

const LOOP = "M168 300C150 236 196 176 262 170S376 196 380 262S332 352 266 356S184 352 168 300Z";

export function HeroPlay() {
  const { t } = useI18n();
  return (
    <div className="hp" aria-hidden>
      <div className="hp-board">
        <svg viewBox="0 0 520 460" className="hp-map">
          {/* blocks and streets */}
          <rect width="520" height="460" rx="30" className="hp-ground" />
          <g className="hp-blocks">
            {[[28, 28, 120, 92], [164, 28, 140, 92], [320, 28, 172, 64], [320, 108, 80, 52], [416, 108, 76, 140], [28, 136, 92, 120], [28, 272, 120, 160], [164, 380, 150, 52], [330, 380, 162, 52], [416, 264, 76, 100]].map(([x, y, w, h], i) =>
              <rect key={i} x={x} y={y} width={w} height={h} rx="14" />)}
          </g>
          <path d="M0 128H520M0 264H520M152 0V460M408 0V460" className="hp-street" />
          <path d="M-10 214C80 196 120 240 200 226S360 180 530 206" className="hp-river" />
          {/* other players' areas */}
          <path d="M342 40C392 22 486 40 480 96S412 150 366 132S300 58 342 40Z" className="hp-area" style={{ ["--c" as string]: "#1c9bf0" }} />
          <path d="M44 300C60 262 132 266 140 314S110 410 70 400S30 338 44 300Z" className="hp-area" style={{ ["--c" as string]: "#ec4f93" }} />
          <path d="M392 300C420 276 482 290 480 330S440 372 412 364S370 320 392 300Z" className="hp-area" style={{ ["--c" as string]: "#ffbf1f" }} />
          {/* my loop: draws, then fills */}
          <path d={LOOP} className="hp-fill" />
          <path d={LOOP} pathLength={1} className="hp-loop" />
          <circle cx="168" cy="300" r="9" className="hp-start" />
          {/* missions */}
          <g className="hp-pin" style={{ ["--i" as string]: 0 }} transform="translate(270 250)"><circle r="17" fill="#fff" /><circle r="13" fill="#22b14c" /><path d="M-5 0l3 4 7-8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
          <g className="hp-pin" style={{ ["--i" as string]: 1 }} transform="translate(430 190)"><circle r="15" fill="#fff" /><circle r="11" fill="#1c9bf0" /><circle r="4" fill="#fff" /></g>
          <g className="hp-pin" style={{ ["--i" as string]: 2 }} transform="translate(96 190)"><circle r="15" fill="#fff" /><circle r="11" fill="#ff8a1f" /><circle r="4" fill="#fff" /></g>
        </svg>

        {/* volunteers on the map */}
        <span className="hp-person" style={{ left: "28%", top: "56%", ["--d" as string]: "0s" }}><PresetArt id="p02" /></span>
        <span className="hp-person" style={{ left: "70%", top: "14%", ["--d" as string]: ".6s" }}><PresetArt id="p01" /></span>
        <span className="hp-person" style={{ left: "10%", top: "66%", ["--d" as string]: "1.2s" }}><PresetArt id="p04" /></span>
      </div>

      {/* the game's moments */}
      <div className="hp-float f1"><span className="hp-ico" style={{ background: "var(--accent)" }}><Icon name="zap" size={16} /></span><b>+60 XP</b></div>
      <div className="hp-float f2"><span className="hp-ico" style={{ background: "var(--flame)" }}><Icon name="flame" size={16} /></span><span><b>7</b> {t("hp.streak")}</span></div>
      <div className="hp-float f3"><span className="hp-avatar"><PresetArt id="p05" /></span><span className="stack"><b>{t("hp.taken")}</b><span className="t-small secondary">0.12 km²</span></span></div>
      <div className="hp-float f4"><Coins value={35} size={16} /><span className="t-small secondary">Fixcoin</span></div>
      <div className="hp-float f5"><span className="hp-ico" style={{ background: "var(--sky)" }}><Icon name="checkCircle" size={16} /></span><b>{t("hp.verified")}</b></div>
    </div>
  );
}
