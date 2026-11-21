"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { SignalPeople } from "@/components/signals";
import { TileMap } from "@/components/tile-map";
import { Avatar, Button, ButtonLink, Empty, Notice, Skeleton, Status, useToast } from "@/components/ui";
import { km } from "@/lib/domain/community";
import { osmLink } from "@/lib/map/geo";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { getPosition } from "@/lib/store/media";
import type { GpsFix } from "@/lib/domain/types";

export default function SignalPage() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const { id } = useParams<{ id: string }>();
  const q = useApi(() => api.helpSignal(id), [id]);
  const [me, setMe] = useState<GpsFix | null>(null);
  useEffect(() => { getPosition(8000).then(setMe).catch(() => undefined); }, []);
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); } catch (e) { toast(errText(e), "error"); } };
  if (q.data === undefined) return <Skeleton rows={4} />;
  if (!q.data) return <div className="card"><Empty icon="zap" title={t("sg.notFound")} action={<ButtonLink href="/app/signals">{t("sg.titlePlural")}</ButtonLink>} /></div>;
  const s = q.data;
  const dist = me ? Math.round(km(me, s.location) * 10) / 10 : null;
  return (
    <div className="stack g20 enter" style={{ maxWidth: 860 }}>
      <Link href="/app/signals" className="row g8 t-small secondary" style={{ width: "fit-content" }}><Icon name="arrowLeft" size={14} />{t("sg.titlePlural")}</Link>
      <section className="card pad-lg stack g16">
        <div className="row g12 wrap" style={{ alignItems: "flex-start" }}>
          <span className="signal-dot big" aria-hidden><Icon name="zap" size={22} /></span>
          <div className="stack g4 grow" style={{ minWidth: 0 }}>
            <h1 className="t-h2">{s.title}</h1>
            <span className="row g8 t-small secondary wrap">
              {s.author && <><Avatar name={s.author.fullName} src={s.author.avatar} size={20} />{s.isMine ? t("a.you") : s.author.fullName}</>}
              <span>· {f.relative(s.createdAt)}</span>{s.groupName && <span>· {s.groupName}</span>}
            </span>
          </div>
          {s.open ? <Status tone="warn">{t("sg.openUntil", { time: f.time(s.expiresAt) })}</Status> : <Status tone="neutral">{t("sg.closed")}</Status>}
        </div>
        {s.note && <p className="prose">{s.note}</p>}
        <TileMap height={280} animateRoute={false} markers={[{ ...s.location, kind: "target" }, ...(me ? [{ ...me, kind: "me" as const }] : [])]} label={s.place || t("sg.where")} />
        <div className="row g8 wrap t-small secondary">
          <Icon name="pin" size={16} />{s.place || f.coords(s.location.lat, s.location.lng)}{dist !== null ? ` · ${t("u.km", { n: dist })}` : ""}
          <a className="link" href={osmLink(s.location)} target="_blank" rel="noreferrer">{t("sg.openMap")}</a>
        </div>
        <div className="stack g8">
          <span className="label">{t("sg.going", { n: s.responders.length })}</span>
          <SignalPeople s={s} />
        </div>
        {!s.open ? <Notice tone="info">{t("sg.closedBody")}</Notice> : s.isMine ? (
          <Button variant="secondary" icon="check" onClick={() => run(() => api.closeSignal(s.id), t("sg.closedToast"))}>{t("sg.close")}</Button>
        ) : (
          <div className="row g8 wrap">
            {s.going
              ? <Button icon="x" onClick={() => run(() => api.respondSignal(s.id, false), t("sg.notGoingToast"))}>{t("sg.notGoing")}</Button>
              : <Button variant="primary" icon="hands" onClick={() => run(() => api.respondSignal(s.id, true), t("sg.goingToast"))}>{t("sg.imGoing")}</Button>}
          </div>
        )}
      </section>
    </div>
  );
}
