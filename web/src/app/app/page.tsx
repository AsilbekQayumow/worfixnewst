"use client";
import { AnnouncementBanner } from "@/components/admin-comms";
import Link from "next/link";
import { Medal } from "@/components/achievements";
import { Icon } from "@/components/icons";
import { MissionCard } from "@/components/mission-card";
import { useMe } from "@/components/providers";
import { PageHead } from "@/components/shell";
import { Avatar, ButtonLink, Coins, Empty, Notice, Progress, Skeleton, Status, VerificationStatusTag } from "@/components/ui";
import { levelProgress } from "@/lib/domain/rewards";
import { NewsStrip } from "@/components/news";
import { RankLadder } from "@/components/rank";
import { MyReport } from "@/components/report";
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
    <div className="stack g24 enter">
      <PageHead
        title={f.today().replace(/^./, (c) => c.toUpperCase())}
        sub={t("home.app.sub")}
        actions={<>
          <ButtonLink href="/app/signals?new=1" icon="zap">{t("sg.call")}</ButtonLink>
          <ButtonLink href="/app/missions?agent=1" variant="primary" icon="radar">{t("home.app.agent")}</ButtonLink>
        </>}
      />

      <AnnouncementBanner />
      {!isVerifiedAccount(me) && <Notice tone="warn">{t("home.app.verify")} <Link className="link" href="/verify-email?next=/app">{t("md.verifyLink")}</Link></Notice>}
      {signals.data && signals.data.length > 0 && (
        <section className="card signals-home">
          <div className="row between g8" style={{ padding: "12px 16px 4px" }}><h2 className="t-h3 row g8"><Icon name="zap" size={18} />{t("sg.near")}</h2><Link href="/app/signals" className="t-small link">{t("a.all")}</Link></div>
          <div className="rows">{signals.data.slice(0, 3).map((s) => <SignalRow key={s.id} s={s} />)}</div>
        </section>
      )}
      {d && d.needsInfo > 0 && <Notice tone="info">{t("home.app.needsInfo", { n: d.needsInfo })} <Link className="link" href="/app/missions?tab=active">{t("nav.missions")}</Link></Notice>}

      <div className="grid home-top">
        <section className="card pad stack g16">
          <RankLadder xp={me.xp} />
          <span className="t-small secondary num">{t("home.app.xpToNext", { n: f.num(lp.next - me.xp), level: lp.level + 1 })}{d?.nextCertificate ? ` · ${t("home.app.nextCert", { n: d.nextCertificate })}` : ""}</span>
        </section>
        <Link href="/app/shop" className="card pad stack g8">
          <span className="stat-label">{t("coin.balance")}</span>
          <Coins value={f.num(me.points)} size={24} className="stat-value" />
          <span className="t-small accent-text row g4">{t("home.app.toShop")} <Icon name="arrowRight" size={14} /></span>
        </Link>
        <div className="card pad stack g8">
          <span className="stat-label">{t("home.app.streak")}</span>
          <span className="row g8 stat-value"><Icon name="flame" size={22} style={{ color: me.streak ? "var(--brass)" : "var(--muted)" }} />{me.streak}</span>
          <span className="t-small muted">{t("home.app.streakHint")}</span>
        </div>
      </div>

      <NewsStrip />

      <MyReport />

      <div className="split-wide">
        <div className="stack g24" style={{ minWidth: 0 }}>
          <section>
            <div className="section-title"><h2 className="t-h2">{t("home.app.active")}</h2><Link href="/app/missions?tab=active" className="t-small link">{t("a.all")}</Link></div>
            {!d ? <Skeleton rows={2} /> : d.active.length === 0 ? (
              <div className="card"><Empty icon="flag" title={t("home.app.noActive")} body={t("home.app.noActiveBody")} action={<ButtonLink href="/app/missions?tab=explore" variant="primary">{t("nav.explore")}</ButtonLink>} /></div>
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
            <div className="section-title"><h2 className="t-h2">{t("home.app.forYou")}</h2><Link href="/app/missions?tab=explore" className="t-small link">{t("a.all")}</Link></div>
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
          {d && (
            <div className="card pad grid cols-2" style={{ gap: 12 }}>
              <div className="stack"><span className="t-small secondary">{t("home.app.done")}</span><span className="t-h2 num">{d.approved}</span></div>
              <div className="stack"><span className="t-small secondary">{t("home.app.hours")}</span><span className="t-h2 num">{Math.round(me.totalVolunteerHours * 10) / 10}</span></div>
              <div className="stack"><span className="t-small secondary">{t("home.app.achievements")}</span><span className="t-h2 num">{d.unlocked}<span className="t-small muted"> / {d.achievements.length}</span></span></div>
              <div className="stack"><span className="t-small secondary">{t("home.app.certs")}</span><span className="t-h2 num">{d.certificates}</span></div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
