"use client";
import { PulseCounter, ResultsStrip } from "@/components/results";
import { AnnouncementBanner } from "@/components/admin-comms";
import Link from "next/link";
import { Medal } from "@/components/achievements";
import { GroupSpot } from "@/components/group-bits";
import { Icon } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { useMe } from "@/components/providers";
import { Avatar, ButtonLink, Coins, Empty, Notice, Progress, Skeleton, Status, VerificationStatusTag } from "@/components/ui";
import { levelProgress, levelTitleKey, rankFor } from "@/lib/domain/rewards";
import { NewsStrip } from "@/components/news";
import { RankBadge } from "@/components/rank";
import { SignalRow } from "@/components/signals";
import { useFmt, useI18n } from "@/lib/i18n";
import { api, isVerifiedAccount } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function Home() {
  const { t, lang } = useI18n();
  const f = useFmt();
  const { me } = useMe();
  const q = useApi(() => api.myInsights());
  const signals = useApi(() => api.helpSignals());
  if (!me) return null;
  const lp = levelProgress(me.xp);
  const d = q.data;

  return (
    <div className="stack g24 enter home5">
      <section className="hello5">
        <div className="hello5-main">
          <Link href="/app/profile" className="hello5-avatar" aria-label={t("nav.profile")}><Avatar name={me.fullName} src={me.avatar} size={68} /></Link>
          <div className="stack g4" style={{ minWidth: 0 }}>
            <span className="t-small hello5-date">{f.today().replace(/^./, (c) => c.toUpperCase())}</span>
            <h1 className="t-h1 truncate">{t("h5.hello", { name: me.fullName.split(/\s+/)[0] })}</h1>
          </div>
        </div>
        <Link href="/app/profile" className="hello5-level">
          <RankBadge rank={rankFor(lp.level)} size={44} />
          <span className="stack g8 grow" style={{ minWidth: 0 }}>
            <span className="row between g8"><strong>{t("lvl.long", { n: lp.level })} · {t(levelTitleKey(lp.level))}</strong><span className="t-small num">{f.num(me.xp)} XP</span></span>
            <Progress value={lp.fraction} />
            <span className="t-small secondary num">{t("home.app.xpToNext", { n: f.num(lp.next - me.xp), level: lp.level + 1 })}</span>
          </span>
        </Link>
        <div className="hello5-chips">
          <span className="hello5-chip" style={{ ["--tone" as string]: "var(--flame)" }} title={t("home.app.streakHint")}><Icon name="flame" size={20} /><b className="num">{me.streak}</b><span>{t("h5.days")}</span></span>
          <Link href="/app/shop" className="hello5-chip" style={{ ["--tone" as string]: "var(--sun)" }}><Coins value={f.num(me.points)} size={18} /><span>Fixcoin</span></Link>
          <Link href="/app/profile?tab=achievements" className="hello5-chip" style={{ ["--tone" as string]: "var(--berry)" }}><Icon name="award" size={20} /><b className="num">{d?.unlocked ?? "·"}</b><span>{t("h5.badges")}</span></Link>
        </div>
        <div className="hello5-actions">
          <ButtonLink href="/app/missions?agent=1" variant="primary" icon="radar">{t("home.app.agent")}</ButtonLink>
          <ButtonLink href="/app/signals?new=1" variant="secondary" icon="zap">{t("sg.call")}</ButtonLink>
        </div>
      </section>

      <AnnouncementBanner />
      {!isVerifiedAccount(me) && <Notice tone="warn">{t("home.app.verify")} <Link className="link" href="/verify-email?next=/app">{t("md.verifyLink")}</Link></Notice>}
      {signals.data && signals.data.length > 0 && (
        <section className="card signals-home">
          <div className="row between g8" style={{ padding: "12px 16px 4px" }}><h2 className="t-h3 row g8"><Icon name="zap" size={18} />{t("sg.near")}</h2><Link href="/app/signals" className="t-small link">{t("a.all")}</Link></div>
          <div className="rows">{signals.data.slice(0, 3).map((s) => <SignalRow key={s.id} s={s} />)}</div>
        </section>
      )}
      {d && d.needsInfo > 0 && <Notice tone="info">{t("home.app.needsInfo", { n: d.needsInfo })} <Link className="link" href="/app/map?view=list&tab=active">{t("nav.missions")}</Link></Notice>}

      {me.role === "volunteer" && <div className="spots5"><MapSpot /><GroupSpot /></div>}

      <div className="split-wide">
        <div className="stack g24" style={{ minWidth: 0 }}>
          <section>
            <div className="section-title"><h2 className="t-h2">{t("home.app.active")}</h2><Link href="/app/map?view=list&tab=active" className="t-small link">{t("a.all")}</Link></div>
            {!d ? <Skeleton rows={2} /> : d.active.length === 0 ? (
              <div className="card"><Empty icon="flag" title={t("home.app.noActive")} body={t("home.app.noActiveBody")} action={<ButtonLink href="/app/map?view=list&tab=explore" variant="primary">{t("nav.explore")}</ButtonLink>} /></div>
            ) : (
              <div className="card rows">
                {d.active.map(({ mission: m, participant: p, status }) => (
                  <Link key={m.id} href={`/app/missions/${m.id}`} className="row-item">
                    <span className={`cat-${m.category}`}><span className="cat-dot" /></span>
                    <span className="stack grow" style={{ minWidth: 0 }}>
                      <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
                      <span className="t-small secondary truncate">{f.dayTime(m.date)} · {m.location}</span>
                    </span>
                    {status ? <VerificationStatusTag status={status} /> : p.startedAt ? <Status tone="info">{t("ms.inProgress")}</Status> : <Status tone="neutral">{t("ms.joined")}</Status>}
                    <Icon name="chevronRight" size={16} className="muted" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="section-title"><h2 className="t-h2">{t("home.app.forYou")}</h2><Link href="/app/map?view=list&tab=explore" className="t-small link">{t("a.all")}</Link></div>
            {!d ? <Skeleton rows={2} height={160} /> : d.forYou.length === 0 ? (
              <div className="card"><Empty icon="radar" title={t("home.app.noneNear")} action={<ButtonLink href="/app/missions?agent=1" variant="primary" icon="radar">{t("home.app.agent")}</ButtonLink>} /></div>
            ) : (
              <div className="grid cols-2">{d.forYou.map((m) => <MissionCard key={m.id} m={m} href={`/app/missions/${m.id}`} />)}</div>
            )}
          </section>
        </div>

        <aside className="stack g16">
          {d?.next && (
            <Link href="/app/profile?tab=achievements" className="card pad row g12">
              <Medal a={d.next} />
              <span className="stack g4 grow" style={{ minWidth: 0 }}>
                <span className="t-small secondary">{t("home.app.nextAch")}</span>
                <span style={{ fontWeight: 500 }}>{d.next.title[lang]}</span>
                <Progress value={d.next.fraction} />
                <span className="t-meta">{d.next.current} / {d.next.goal}</span>
              </span>
            </Link>
          )}
          <section className="card pad stack g12">
            <div className="row between"><h2 className="t-h3">{t("home.app.board")}</h2><Link href="/app/chat?tab=friends" className="t-small link">{t("nav.friends")}</Link></div>
            {!d ? <Skeleton rows={3} height={32} /> : d.board.length <= 1 ? <p className="t-small secondary">{t("home.app.boardEmpty")}</p> : (
              <ol className="stack g8">
                {d.board.map((p, i) => (
                  <li key={p.id}>
                    <Link href={p.isMe ? "/app/profile" : `/app/people/${p.id}`} className="row g12">
                      <span className="t-meta" style={{ width: 16 }}>{i + 1}</span>
                      <Avatar name={p.fullName} src={p.avatar} size={28} />
                      <span className="grow truncate" style={{ fontSize: 14, fontWeight: p.isMe ? 500 : 400 }}>{p.isMe ? t("a.you") : p.fullName}</span>
                      <span className="t-meta">{f.num(p.xp)} XP</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <PulseCounter />
      <ResultsStrip />
      <NewsStrip />
    </div>
  );
}

/** v3.2: the way into the territory game from Home. */
function MapSpot() {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api.myTerritory());
  if (!q.data) return null;
  const has = q.data.areaM2 > 0;
  return (
    <Link href="/app/map" className="card pad row g12 map-spot">
      <span className="map-spot-art" aria-hidden><svg viewBox="0 0 48 48"><path d="M10 30c3-9 9-15 18-16s11 7 9 13-9 11-17 10-11-1-10-7Z" /><circle cx="24" cy="25" r="2.6" /></svg></span>
      <span className="stack grow" style={{ minWidth: 0 }}>
        <strong>{has ? t("home.mapYours", { area: f.area(q.data.areaM2), rank: q.data.rank ?? "—" }) : t("home.mapCta")}</strong>
        <span className="t-small secondary">{t("home.mapCtaBody")}</span>
      </span>
      <Icon name="chevronRight" size={16} className="muted" />
    </Link>
  );
}
