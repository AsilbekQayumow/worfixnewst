"use client";
import { useMemo, useState } from "react";
import type { AchievementFamily, AchievementState, AchievementTier } from "@/lib/domain/achievements";
import { useI18n } from "@/lib/i18n";
import { CATEGORY_ICON, Icon, type IconName } from "./icons";
import { Progress, Segmented } from "./ui";

const FAMILY_ICON: Record<AchievementFamily, IconName> = {
  missions: "flag", hours: "clock", streak: "flame", level: "zap", cause: "leaf", explorer: "compass", impact: "target", friends: "users",
  cheersGiven: "heart", cheersReceived: "heart", certificates: "award", profile: "user", hard: "trophy", team: "hands", agent: "radar", shop: "bag",
};
const TIER: Record<AchievementTier, { rim: string; face: string; ink: string }> = {
  bronze: { rim: "#a8683a", face: "#e9c7a4", ink: "#5a3216" },
  silver: { rim: "#8a8f96", face: "#e4e7ea", ink: "#3a3f45" },
  gold: { rim: "#b58a1c", face: "#f3dc8e", ink: "#5a4205" },
};

/** Enamel-style medal drawn per tier, with the family's line icon struck into it. */
export function Medal({ a, size = 44 }: { a: Pick<AchievementState, "tier" | "family" | "cause">; size?: number }) {
  const c = TIER[a.tier];
  const icon = a.family === "cause" && a.cause ? CATEGORY_ICON[a.cause] : FAMILY_ICON[a.family];
  return (
    <span className="medal" style={{ width: size, height: size, position: "relative", display: "inline-block", flex: "none" }} aria-hidden>
      <svg viewBox="0 0 44 44" width={size} height={size}>
        <path d="M22 2.5 39 12v20L22 41.5 5 32V12Z" fill={c.rim} />
        <path d="M22 6.5 35.5 14v16L22 37.5 8.5 30V14Z" fill={c.face} />
        <path d="M22 6.5 35.5 14v4L22 10.5 8.5 18v-4Z" fill="#fff" opacity=".35" />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: c.ink }}>
        <Icon name={icon} size={Math.round(size * 0.42)} strokeWidth={1.8} />
      </span>
    </span>
  );
}

export function AchievementGrid({ list }: { list: AchievementState[] }) {
  const { t, lang } = useI18n();
  const [show, setShow] = useState<"all" | "unlocked" | "locked">("all");
  const shown = useMemo(() => list.filter((a) => (show === "all" ? true : show === "unlocked" ? a.unlocked : !a.unlocked)), [list, show]);
  const unlocked = list.filter((a) => a.unlocked).length;
  return (
    <div className="stack g16">
      <div className="row between wrap g12">
        <p className="secondary"><span className="num" style={{ color: "var(--text)", fontWeight: 500 }}>{unlocked}</span> / <span className="num">{list.length}</span> {t("ach.unlocked")}</p>
        <Segmented value={show} onChange={setShow} items={[{ value: "all", label: t("ach.all") }, { value: "unlocked", label: t("ach.got") }, { value: "locked", label: t("ach.locked") }]} />
      </div>
      <div className="ach-grid">
        {shown.map((a) => (
          <div key={a.id} className="ach" data-locked={!a.unlocked}>
            <Medal a={a} />
            <div className="stack g4">
              <span style={{ fontSize: 14, fontWeight: 500 }}>{a.title[lang]}</span>
              <span className="t-small muted">{t(`achd.${a.family}`, { n: a.goal, cause: a.cause ? t(`cat.${a.cause}`) : "" })}</span>
            </div>
            {!a.unlocked && (
              <div className="stack g4" style={{ marginTop: "auto" }}>
                <Progress value={a.fraction} />
                <span className="t-meta">{a.current} / {a.goal}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
