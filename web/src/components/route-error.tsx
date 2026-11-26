"use client";
/** Design rec. 1: a page that crashed shows a calm message and a way back, not a blank screen. */
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Button, Empty } from "./ui";

export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => { console.error("[route-error]", error); }, [error]);
  return (
    <div className="card" role="alert">
      <Empty icon="alert" title={t("st.crashTitle")} body={t("st.crashBody")}
        action={<div className="row g8"><Button variant="primary" icon="refresh" onClick={reset}>{t("st.retry")}</Button><Button variant="ghost" onClick={() => location.reload()}>↻</Button></div>} />
    </div>
  );
}
