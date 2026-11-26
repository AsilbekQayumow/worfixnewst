"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHead } from "@/components/shell";
import { SignalDialog, SignalRow } from "@/components/signals";
import { Button, Dialog, Empty, Notice, Select, Skeleton, TextArea, TextInput, useToast } from "@/components/ui";
import { EmergencyBanner, EmergencyNumbers } from "@/components/v6-bits";
import { EMERGENCY_KINDS, type EmergencyKind } from "@/lib/domain/emergency";
import { useErrorText } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { getPosition } from "@/lib/store/media";

function Signals() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const [flag, setFlag] = useState(false);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => { getPosition(8000).then((p) => setNear({ lat: p.lat, lng: p.lng })).catch(() => undefined); }, []);
  const q = useApi(() => api.helpSignals(near), [near?.lat, near?.lng]);
  return (
    <div className="stack g24 enter">
      <PageHead title={t("sg.titlePlural")} sub={t("sg.sub")} actions={<>
        <Button variant="ghost" icon="alert" onClick={() => setFlag(true)}>{t("em.flag")}</Button>
        <Button variant="primary" icon="zap" onClick={() => setOpen(true)}>{t("sg.call")}</Button>
      </>} />
      <EmergencyBanner />
      {!q.data ? <Skeleton rows={3} /> : q.data.length === 0 ? <div className="card"><Empty icon="zap" title={t("sg.none")} body={t("sg.noneBody")} /></div> : (
        <div className="card rows">{q.data.map((s) => <SignalRow key={s.id} s={s} />)}</div>
      )}
      <SignalDialog open={open} onClose={() => setOpen(false)} />
      {flag && <FlagDialog near={near} onClose={() => setFlag(false)} />}
    </div>
  );
}

export default function SignalsPage() {
  return <Suspense fallback={null}><Signals /></Suspense>;
}

/** v6 · feature 19, level 2: "I see an emergency here". Three independent people within 2 km raise a yellow alert. */
function FlagDialog({ near, onClose }: { near: { lat: number; lng: number } | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [kind, setKind] = useState<EmergencyKind>("flood");
  const [note, setNote] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title={t("em.flag")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" disabled={!near} loading={busy} onClick={async () => {
        if (!near) return;
        setBusy(true);
        try { await api6.flagEmergency({ type: kind, note, place, lat: near.lat, lng: near.lng }); toast(t("em.flagged")); onClose(); } catch (e) { toast(errText(e), "error"); } finally { setBusy(false); }
      }}>{t("em.flagSend")}</Button>
    </>}>
      <div className="stack g12">
        <EmergencyNumbers />
        <p className="t-small secondary">{t("em.flagBody")}</p>
        <Select label={t("em.kind")} value={kind} onChange={(e) => setKind(e.target.value as EmergencyKind)}>{EMERGENCY_KINDS.map((k) => <option key={k} value={k}>{t(`em.k.${k}`)}</option>)}</Select>
        <TextInput label={t("em.placeLabel")} value={place} onChange={(e) => setPlace(e.target.value)} />
        <TextArea label={t("em.noteLabel")} value={note} rows={2} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        {!near && <Notice tone="warn">{t("em.needGps")}</Notice>}
      </div>
    </Dialog>
  );
}
