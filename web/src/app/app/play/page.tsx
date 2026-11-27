"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHead } from "@/components/shell";
import { BattlePanel, BoostBar, DailyChest, DuelsPanel, GameBadgeShelf, LookLocker, QuestList, SeasonPass } from "@/components/game";
import { ButtonLink, Coins, Skeleton, Tabs } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api7 } from "@/lib/store/api7";
import { useApi } from "@/lib/store/hooks";

const TABS = ["today", "season", "looks", "battle", "duels", "badges"] as const;
type Tab = (typeof TABS)[number];

/** v7: the game hub — today's chest and quests, the season pass, looks, the mahalla battle, duels and badges. */
function Play() {
  const { t } = useI18n();
  const router = useRouter();
  const raw = useSearchParams().get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "today";
  const q = useApi(() => api7.game(null));
  const g = q.data;
  const pending = g?.duels.filter((d) => d.status === "pending" && !d.mine).length ?? 0;
  return (
    <div className="stack g24 enter play7">
      <PageHead title={t("g.title")} sub={t("g.sub")} actions={<div className="row g8">{g && <Coins value={g.me.points} size={18} />}<ButtonLink href="/app/wrapped" size="sm" icon="share">{t("wr.short")}</ButtonLink></div>} />
      <Tabs value={tab} onChange={(v) => router.replace(`/app/play?tab=${v}`)} items={TABS.map((v) => ({ value: v, label: t(`g.tab.${v}`), count: v === "duels" && pending ? pending : undefined }))} />
      {!g ? <Skeleton rows={3} height={90} /> : (
        <>
          {tab === "today" && (
            <div className="stack g20">
              <section className="card pad"><DailyChest g={g} /></section>
              {g.boostUntil && <BoostBar until={g.boostUntil} />}
              <section className="card pad"><QuestList g={g} /></section>
              <section className="card pad row between g12 wrap">
                <span className="stack g4"><strong>{t("g.mapTitle")}</strong><span className="t-small secondary">{t("g.mapBody", { n: g.limit.used, max: 15 })}</span></span>
                <ButtonLink href="/app/map" variant="primary" icon="map">{t("g.findChests")}</ButtonLink>
              </section>
            </div>
          )}
          {tab === "season" && <SeasonPass g={g} />}
          {tab === "looks" && <LookLocker g={g} />}
          {tab === "battle" && <BattlePanel g={g} />}
          {tab === "duels" && <DuelsPanel g={g} />}
          {tab === "badges" && <section className="card pad"><GameBadgeShelf g={g} /></section>}
        </>
      )}
    </div>
  );
}

export default function PlayPage() {
  return <Suspense fallback={null}><Play /></Suspense>;
}
