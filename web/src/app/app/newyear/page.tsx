"use client";
import Link from "next/link";
import { PageHead } from "@/components/shell";
import { Icon } from "@/components/icons";
import { Button, Skeleton } from "@/components/ui";
import { NewYearCountdown } from "@/components/winter/countdown";
import { AdventCalendar } from "@/components/winter/advent";
import { HeroPicker } from "@/components/winter/hero-picker";
import { GreetingCard } from "@/components/winter/greeting";
import { GoodDeeds } from "@/components/winter/good-deeds";
import { useSeason } from "@/components/winter/season";
import { useI18n } from "@/lib/i18n";
import { comingYear } from "@/lib/season/winter";
import { api7 } from "@/lib/store/api7";
import { useApi } from "@/lib/store/hooks";

/** v8: the New Year hub — the countdown, the gift calendar, your 3D hero, a card for friends, winter good deeds. */
export default function NewYear() {
  const { t } = useI18n();
  const season = useSeason();
  const g = useApi(() => api7.game(null));
  const year = comingYear();
  return (
    <div className="stack g24 enter ny-page">
      <PageHead title={t("ny.hubTitle", { year })} sub={t("ny.hubSub")} />
      <NewYearCountdown cta={false} compact />

      {!g.data ? <Skeleton rows={3} height={90} /> : <AdventCalendar g={g.data} onChange={g.reload} />}

      <div className="ny-split">
        <section className="card pad stack g16" aria-labelledby="hero-h">
          <div className="stack g4">
            <h2 id="hero-h" className="t-h2 row g8"><Icon name="user" size={20} />{t("hero.title")}</h2>
            <p className="t-small secondary">{t("hero.sub")}</p>
          </div>
          <HeroPicker />
          <Link href="/app/map" className="link t-small row g4" style={{ alignSelf: "center" }}><Icon name="map" size={14} />{t("hero.toMap")}</Link>
        </section>
        <div className="stack g24">
          <section className="card pad stack g16 ny-gifts" aria-labelledby="map-h">
            <div className="ny-gifts-art" aria-hidden><Icon name="sled" size={34} /></div>
            <div className="stack g4">
              <h2 id="map-h" className="t-h2">{t("ny.mapH")}</h2>
              <p className="t-small secondary">{t("ny.mapB")}</p>
            </div>
            <Link href="/app/map" className="btn btn-primary"><Icon name="gift" size={18} />{t("ny.toMap")}</Link>
          </section>
          <section className="card pad stack g12" aria-labelledby="mood-h">
            <h2 id="mood-h" className="t-h3">{t("ny.moodH")}</h2>
            <div className="ny-switches">
              <Button variant={season.music ? "ink" : "secondary"} icon={season.music ? "music" : "musicOff"} onClick={season.toggleMusic} aria-pressed={season.music}>{season.music ? t("ny.musicOff") : t("ny.musicOn")}</Button>
              <Button variant={season.snow ? "ink" : "secondary"} icon="snowflake" onClick={() => season.setSnow(!season.snow)} aria-pressed={season.snow}>{season.snow ? t("ny.snowOff") : t("ny.snowOn")}</Button>
            </div>
            <p className="t-small muted">{t("ny.musicNote")}</p>
          </section>
        </div>
      </div>

      <GreetingCard />
      <GoodDeeds year={year} />
    </div>
  );
}
