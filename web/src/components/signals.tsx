"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api, ValidationError, type SignalView } from "@/lib/store/api";
import { getPosition } from "@/lib/store/media";
import type { GpsFix } from "@/lib/domain/types";
import { Icon } from "./icons";
import { TileMap } from "./tile-map";
import { Avatar, Button, Dialog, Notice, Status, TextArea, TextInput } from "./ui";

/** One help signal in a list. */
export function SignalRow({ s }: { s: SignalView }) {
  const { t } = useI18n();
  const f = useFmt();
  return (
    <Link href={`/app/signals/${s.id}`} className="row-item">
      <span className="signal-dot" aria-hidden><Icon name="zap" size={16} /></span>
      <span className="stack grow" style={{ minWidth: 0 }}>
        <span className="truncate" style={{ fontWeight: 500 }}>{s.title}</span>
        <span className="t-small secondary truncate">
          {s.isMine ? t("a.you") : s.author?.fullName}{s.place ? ` · ${s.place}` : ""}{s.distanceKm !== null ? ` · ${t("u.km", { n: s.distanceKm })}` : ""} · {f.relative(s.createdAt)}
        </span>
      </span>
      <span className="t-small secondary">{t("sg.going", { n: s.responders.length })}</span>
      {s.going && <Status tone="ok">{t("sg.youGo")}</Status>}
      <Icon name="chevronRight" size={16} className="muted" />
    </Link>
  );
}

/** "Call for help": uses the current GPS position, tells the group and volunteers nearby. */
export function SignalDialog({ open, onClose, missionId = null, presetPlace = "" }: { open: boolean; onClose: () => void; missionId?: string | null; presetPlace?: string }) {
  const { t } = useI18n();
  const errText = useErrorText();
  const router = useRouter();
  const [v, setV] = useState({ title: "", note: "", place: presetPlace });
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setV({ title: "", note: "", place: presetPlace }); setFields({}); setError(null); setGpsErr(null); setFix(null);
    getPosition().then(setFix).catch((e) => setGpsErr(errText(e)));
  }, [open, presetPlace, errText]);
  const send = async () => {
    if (!fix) { setGpsErr(t("e.gpsUnavailable")); return; }
    setBusy(true); setFields({}); setError(null);
    try {
      const { id } = await api.sendHelpSignal({ ...v, lat: fix.lat, lng: fix.lng, missionId });
      onClose();
      router.push(`/app/signals/${id}`);
    } catch (e) { if (e instanceof ValidationError) setFields(e.fields); else setError(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("sg.call")} wide footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" icon="zap" loading={busy} disabled={!fix} onClick={send}>{t("sg.send")}</Button>
    </>}>
      <div className="stack g16">
        <p className="t-small secondary">{t("sg.body")}</p>
        {error && <Notice tone="bad">{error}</Notice>}
        <TextInput label={t("sg.what")} value={v.title} maxLength={80} placeholder={t("sg.whatPh")} onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))} error={fields.title} />
        <TextInput label={t("sg.place")} value={v.place} maxLength={120} placeholder={t("sg.placePh")} onChange={(e) => setV((s) => ({ ...s, place: e.target.value }))} />
        <TextArea label={t("sg.note")} rows={2} maxLength={300} value={v.note} onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))} error={fields.note} />
        {fix ? <TileMap height={180} animateRoute={false} markers={[{ ...fix, kind: "me" }]} label={t("sg.where")} />
          : gpsErr ? <Notice tone="warn">{gpsErr}</Notice> : <span className="t-small muted row g8"><Icon name="crosshair" size={14} />{t("sg.locating")}</span>}
      </div>
    </Dialog>
  );
}

export function SignalPeople({ s }: { s: SignalView }) {
  const { t } = useI18n();
  if (!s.people.length) return <span className="t-small muted">{t("sg.nobody")}</span>;
  return (
    <div className="row g8 wrap">
      {s.people.map((p) => <span key={p.id} className="row g4 t-small"><Avatar name={p.fullName} src={p.avatar} size={24} />{p.fullName.split(" ")[0]}</span>)}
    </div>
  );
}
