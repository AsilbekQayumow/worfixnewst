"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHead } from "@/components/shell";
import { SignalDialog, SignalRow } from "@/components/signals";
import { Button, Empty, Skeleton } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { getPosition } from "@/lib/store/media";

function Signals() {
  const { t } = useI18n();
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => { getPosition(8000).then((p) => setNear({ lat: p.lat, lng: p.lng })).catch(() => undefined); }, []);
  const q = useApi(() => api.helpSignals(near), [near?.lat, near?.lng]);
  return (
    <div className="stack g24 enter">
      <PageHead title={t("sg.titlePlural")} sub={t("sg.sub")} actions={<Button variant="primary" icon="zap" onClick={() => setOpen(true)}>{t("sg.call")}</Button>} />
      {!q.data ? <Skeleton rows={3} /> : q.data.length === 0 ? <div className="card"><Empty icon="zap" title={t("sg.none")} body={t("sg.noneBody")} /></div> : (
        <div className="card rows">{q.data.map((s) => <SignalRow key={s.id} s={s} />)}</div>
      )}
      <SignalDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function SignalsPage() {
  return <Suspense fallback={null}><Signals /></Suspense>;
}
