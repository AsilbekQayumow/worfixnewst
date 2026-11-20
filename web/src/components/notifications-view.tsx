"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useFmt, useI18n, useNotificationText } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Icon, type IconName } from "./icons";
import { PageHead } from "./shell";
import { Button, Empty, Skeleton } from "./ui";

const TYPE_ICON: Record<string, IconName> = { submission: "camera", mission: "flag", organization: "building", reward: "award", system: "bell" };

export function NotificationsView() {
  const { t } = useI18n();
  const f = useFmt();
  const text = useNotificationText();
  const q = useApi(() => api.myNotifications());
  const unread = q.data?.filter((n) => !n.read).length ?? 0;
  useEffect(() => {
    if (!unread) return;
    const id = setTimeout(() => void api.markNotificationsRead(), 2500);
    return () => clearTimeout(id);
  }, [unread]);
  return (
    <div className="stack g24 enter" style={{ maxWidth: 760 }}>
      <PageHead title={t("nav.notifications")} actions={unread > 0 && <Button size="sm" variant="ghost" icon="check" onClick={() => api.markNotificationsRead()}>{t("nt.markAll")}</Button>} />
      {!q.data ? <Skeleton rows={5} /> : q.data.length === 0 ? <div className="card"><Empty icon="bell" title={t("nt.none")} /></div> : (
        <div className="card rows">
          {q.data.map((n) => {
            const x = text(n.title, n.message);
            const body = (
              <>
                <Icon name={TYPE_ICON[n.type] ?? "bell"} className="muted" />
                <span className="stack grow" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: n.read ? 400 : 600 }}>{x.title}</span>
                  {x.body && <span className="t-small secondary">{x.body}</span>}
                </span>
                <span className="t-meta" style={{ flex: "none" }}>{f.relative(n.createdAt)}</span>
                {!n.read && <span className="dot" style={{ background: "var(--accent)" }} aria-label={t("nt.unread")} />}
              </>
            );
            return n.link ? <Link key={n.id} href={n.link} className="row-item">{body}</Link> : <div key={n.id} className="row-item">{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}
