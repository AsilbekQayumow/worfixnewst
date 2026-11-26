"use client";
import { ReportButton } from "@/components/v6-bits";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Medal } from "@/components/achievements";
import { MyTree } from "@/components/my-tree";
import { Icon } from "@/components/icons";
import { Avatar, Button, ButtonLink, CategoryTag, DifficultyTag, Empty, Skeleton, Stat, useToast } from "@/components/ui";
import { levelTitleKey } from "@/lib/domain/rewards";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.profile(id), [id]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(errText(e), "error"); } };

  if (q.loading && !q.data) return <Skeleton rows={4} height={100} />;
  const d = q.data;
  if (!d) return <div className="card"><Empty icon="user" title={t("pp.notFound")} action={<ButtonLink href="/app/chat">{t("nav.chat")}</ButtonLink>} /></div>;
  const p = d.person;

  return (
    <div className="stack g24 enter">
      <Link href="/app/chat" className="row g8 t-small secondary" style={{ width: "fit-content" }}><Icon name="arrowLeft" size={16} />{t("nav.chat")}</Link>
      <section className="row g20 wrap">
        <Avatar name={p.fullName} src={p.avatar} size={88} />
        <div className="stack g8 grow" style={{ minWidth: 220 }}>
          <h1 className="t-h1">{p.fullName}</h1>
          <span className="secondary">@{p.username} · {t("lvl.long", { n: p.level })} · {t(levelTitleKey(p.level))}{p.city ? ` · ${p.city}` : ""}</span>
          {d.bio && <p className="secondary" style={{ maxWidth: 560 }}>{d.bio}</p>}
          {d.interests.length > 0 && <div className="row g12 wrap">{d.interests.map((c) => <CategoryTag key={c} category={c} />)}</div>}
        </div>
        {!d.isMe && (
          <div className="row g8">
            {d.relation === "friend" && <ButtonLink href={`/app/chat/${p.id}`} variant="primary" icon="message">{t("fr.message")}</ButtonLink>}
            {d.relation === "none" && <Button variant="primary" icon="userPlus" onClick={() => run(() => api.sendFriendRequest(p.id), t("fr.requestSent"))}>{t("fr.add")}</Button>}
            {d.relation === "incoming" && <Button variant="primary" icon="userPlus" onClick={() => run(() => api.sendFriendRequest(p.id), t("fr.accepted"))}>{t("fr.accept")}</Button>}
            {d.relation === "outgoing" && <span className="t-small muted">{t("fr.pending")}</span>}
            {d.relation === "friend" && <Button variant="ghost" onClick={() => run(() => api.removeFriend(p.id))}>{t("fr.remove")}</Button>}
            <ReportButton type="user" id={p.id} />
          </div>
        )}
      </section>

      {d.locked ? (
        <div className="card"><Empty icon="lock" title={t("pp.locked")} body={t(p.privacy === "friends" ? "pp.lockedFriends" : "pp.lockedPrivate")} /></div>
      ) : (
        <>
          <div className="grid cols-4">
            <Stat label="XP" value={f.num(p.xp)} />
            <Stat label={t("home.app.done")} value={d.missionCount} />
            <Stat label={t("home.app.hours")} value={Math.round(p.hours * 10) / 10} />
            <Stat label={t("home.app.achievements")} value={<>{d.achievementCount}<span className="t-small muted"> / 54</span></>} />
          </div>

          <MyTree own={false} count={d.missionCount} last={d.missions.reduce<string | null>((m, x) => (!m || x.at > m ? x.at : m), null)} />

          <div className="split-wide">
            <section className="stack g12" style={{ minWidth: 0 }}>
              <h2 className="t-h2">{t("pp.results")}</h2>
              {d.missions.length === 0 ? <div className="card"><Empty icon="flag" title={t("pp.noResults")} /></div> : (
                <div className="card rows">
                  {d.missions.map((m) => (
                    <div key={m.id} className="row-item">
                      {m.photo ? <span className="thumb" style={{ width: 48, height: 48, flex: "none" }}><img src={m.photo} alt="" /></span> : <span className={`cat-${m.category}`}><span className="cat-dot" /></span>}
                      <span className="stack grow" style={{ minWidth: 0 }}>
                        <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
                        <span className="t-small secondary">{f.date(m.at)}</span>
                      </span>
                      <DifficultyTag difficulty={m.difficulty} showLabel={false} />
                      <span className="t-meta">+{m.xp} XP</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <aside className="stack g16">
              <section className="card pad stack g12">
                <h2 className="t-h3">{t("pp.achievements")}</h2>
                {d.achievements.length === 0 ? <p className="t-small secondary">{t("pp.noAch")}</p> : (
                  <div className="row g8 wrap">{d.achievements.map((a) => <span key={a.id} title={a.title[lang]}><Medal a={a} size={36} /></span>)}</div>
                )}
              </section>
              <section className="card pad stack g12">
                <h2 className="t-h3">{t("pf.certificates")}</h2>
                {d.certificates.length === 0 ? <p className="t-small secondary">{t("pp.noCerts")}</p> : d.certificates.map((c) => (
                  <Link key={c.id} href={`/verify/${c.verificationCode}`} className="row g12">
                    <Icon name="award" />
                    <span className="stack grow"><span style={{ fontSize: 14 }}>{c.level ? t("cert.levelTitle", { n: c.level }) : c.missionTitle}</span><span className="t-meta">{c.verificationCode}</span></span>
                  </Link>
                ))}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
