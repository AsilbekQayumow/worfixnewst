"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { useMe } from "@/components/providers";
import { ButtonLink, Empty, Skeleton } from "@/components/ui";
import { homeForRole } from "@/lib/domain/permissions";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

/** One news post from the WORFIX team. */
export default function NewsArticle() {
  const { t } = useI18n();
  const f = useFmt();
  const { me } = useMe();
  const { id } = useParams<{ id: string }>();
  const q = useApi(() => api.newsPost(id), [id, me?.id]);
  const back = me ? homeForRole(me.role) : "/";
  if (q.data === undefined) return <div className="container" style={{ paddingTop: 40, maxWidth: 760 }}><Skeleton rows={4} /></div>;
  if (!q.data) return (
    <div className="container" style={{ paddingTop: 40, maxWidth: 760 }}>
      <div className="card"><Empty icon="list" title={t("nw.notFound")} body={me ? undefined : t("nw.signIn")} action={<ButtonLink href={me ? back : `/login?next=/news/${id}`}>{me ? t("a.back") : t("auth.login")}</ButtonLink>} /></div>
    </div>
  );
  const n = q.data;
  return (
    <article className="container stack g16 news-article enter" style={{ paddingTop: 32, paddingBottom: 64, maxWidth: 760 }}>
      <Link href={back} className="row g8 t-small secondary" style={{ width: "fit-content" }}><Icon name="arrowLeft" size={14} />{t("a.back")}</Link>
      {n.cover && <img src={n.cover} alt="" className="news-article-cover" />}
      <span className="t-small secondary">{t(`nw.cat.${n.category}`)} · {f.date(n.publishAt)}</span>
      <h1 className="t-h1">{n.title}</h1>
      {n.summary && !n.body.startsWith(n.summary) && <p className="lead secondary">{n.summary}</p>}
      <div className="prose news-text">{n.body}</div>
      {n.link && (n.link.startsWith("/")
        ? <ButtonLink href={n.link} variant="primary" icon="arrowRight">{t("nw.more")}</ButtonLink>
        : <a href={n.link} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: "fit-content" }}>{t("nw.more")} <Icon name="external" size={16} /></a>)}
    </article>
  );
}
