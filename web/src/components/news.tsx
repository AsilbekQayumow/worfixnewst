"use client";
import Link from "next/link";
import type { NewsPost } from "@/lib/domain/types";
import { useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Icon } from "./icons";

const CAT_ICON: Record<NewsPost["category"], "info" | "calendar" | "zap" | "heart" | "hands"> = {
  news: "info", event: "calendar", update: "zap", story: "heart", partner: "hands",
};

/** News from the WORFIX team on the home pages (pinned first). */
export function NewsStrip({ limit = 4 }: { limit?: number }) {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api.newsFeed(limit), [limit]);
  if (!q.data?.length) return null;
  const [lead, ...rest] = q.data;
  return (
    <section className="stack g12" aria-labelledby="news-h">
      <div className="section-title"><h2 id="news-h" className="t-h2">{t("nw.title")}</h2></div>
      <div className="news-grid" data-single={rest.length === 0 || undefined}>
        <Link href={`/news/${lead.id}`} className="card news-lead" data-cover={Boolean(lead.cover) || undefined}>
          {lead.cover ? <img src={lead.cover} alt="" className="news-cover" /> : <span className="news-cover-empty"><Icon name={CAT_ICON[lead.category]} size={28} /></span>}
          <span className="stack g8 news-body">
            <span className="row g8 t-small secondary">{lead.pinned && <Icon name="pin" size={14} />}<span>{t(`nw.cat.${lead.category}`)}</span><span>·</span><span>{f.relative(lead.publishAt)}</span></span>
            <span className="t-h3">{lead.title}</span>
            <span className="t-small secondary news-sum">{lead.summary}</span>
          </span>
        </Link>
        {rest.length > 0 && (
          <div className="card rows">
            {rest.map((n) => (
              <Link key={n.id} href={`/news/${n.id}`} className="row-item">
                <span className="news-thumb">{n.cover ? <img src={n.cover} alt="" /> : <Icon name={CAT_ICON[n.category]} size={18} />}</span>
                <span className="stack grow" style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ fontWeight: 500 }}>{n.title}</span>
                  <span className="t-small secondary truncate">{t(`nw.cat.${n.category}`)} · {f.relative(n.publishAt)}</span>
                </span>
                <Icon name="chevronRight" size={16} className="muted" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
