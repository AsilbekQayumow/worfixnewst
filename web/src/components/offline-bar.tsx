"use client";
/** v6 · feature 15: the "Offline" strip and the "Not sent yet" list. */
import { useState } from "react";
import { useFmt, useI18n } from "@/lib/i18n";
import { dismissPending, savedMissions, useOnline, usePending } from "@/lib/store/outbox";
import { retryFailed, useFailedQueries } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { Button, Dialog, Empty, Status } from "./ui";

export function OfflineBar() {
  const { t } = useI18n();
  const f = useFmt();
  const online = useOnline();
  const pending = usePending();
  const [open, setOpen] = useState(false);
  if (online && pending.length === 0) return null;
  const failed = pending.filter((p) => p.status === "failed").length;
  return (
    <>
      <button type="button" className="offline-bar" data-online={online || undefined} data-failed={failed || undefined} onClick={() => setOpen(true)} aria-live="polite">
        <Icon name={online ? "upload" : "alert"} size={16} />
        <span className="grow">{online ? t("ofl.sending", { n: pending.length }) : pending.length ? t("ofl.offlineN", { n: pending.length }) : t("ofl.offline")}</span>
        <Icon name="chevronRight" size={16} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("ofl.title")}>
        <div className="stack g16">
          <p className="t-small secondary">{online ? t("ofl.onlineBody") : t("ofl.offlineBody")}</p>
          {pending.length === 0 ? <Empty icon="checkCircle" title={t("ofl.nothing")} /> : (
            <ul className="stack g8">
              {pending.map((p) => (
                <li key={p.id} className="row g12 inset" style={{ padding: 12 }}>
                  <span className="stack grow">
                    <strong className="t-small">{t(`audit.${p.label}`) === `audit.${p.label}` ? p.label : t(`audit.${p.label}`)}</strong>
                    <span className="t-meta">{f.relative(p.at)}{p.error ? ` · ${p.error.slice(0, 80)}` : ""}</span>
                  </span>
                  {p.status === "failed" ? <><Status tone="bad">{t("ofl.failed")}</Status><Button size="sm" variant="ghost" onClick={() => dismissPending(p.id)}>{t("a.close")}</Button></> : <Status tone="warn">{online ? t("ofl.sendingOne") : t("ofl.waiting")}</Status>}
                </li>
              ))}
            </ul>
          )}
          <p className="t-small muted">{t("ofl.noRewards")}</p>
          <SavedList />
        </div>
      </Dialog>
    </>
  );
}

function SavedList() {
  const { t } = useI18n();
  const f = useFmt();
  const list = typeof window === "undefined" ? [] : savedMissions();
  if (!list.length) return null;
  return (
    <section className="stack g8">
      <h3 className="t-h3">{t("ofl.savedTitle")}</h3>
      {list.map((m) => (
        <details key={m.id} className="inset" style={{ padding: 12 }}>
          <summary><strong>{m.title}</strong> <span className="t-meta">{f.dayTime(m.date)}</span></summary>
          <div className="stack g8 t-small" style={{ marginTop: 8 }}>
            <span className="row g8"><Icon name="pin" size={14} />{m.location}{m.coordinates ? ` · ${f.coords(m.coordinates.lat, m.coordinates.lng)}` : ""}</span>
            <p className="secondary">{m.description}</p>
            {(m.checklist?.length ?? 0) > 0 && <ol style={{ paddingLeft: 18 }}>{m.checklist!.map((c) => <li key={c}>{c}</li>)}</ol>}
            {m.safety && <p><strong>{t("md.safety")}:</strong> {m.safety}</p>}
          </div>
        </details>
      ))}
    </section>
  );
}

/** Design rec. 1: when a screen could not load its data, one calm bar with "Try again" instead of an endless skeleton. */
export function QueryErrorBar() {
  const { t } = useI18n();
  const n = useFailedQueries();
  const online = useOnline();
  if (!n || !online) return null;
  return (
    <div className="offline-bar" data-failed="" role="alert">
      <Icon name="alert" size={16} />
      <span className="grow">{t("st.loadFailed")}</span>
      <button type="button" className="btn btn-sm btn-secondary" onClick={retryFailed}>{t("st.retry")}</button>
    </div>
  );
}
