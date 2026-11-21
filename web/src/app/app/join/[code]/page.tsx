"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { GroupMark } from "@/components/group-bits";
import { Button, ButtonLink, Empty, Notice, Skeleton } from "@/components/ui";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

/** Opened from a group QR code or invite link. */
export default function JoinByCode() {
  const { t } = useI18n();
  const errText = useErrorText();
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const q = useApi(() => api.groupByCode(decodeURIComponent(code)), [code]);
  const mine = useApi(() => api.myGroup());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (q.data === undefined || mine.data === undefined) return <Skeleton rows={3} />;
  if (!q.data) return <div className="card"><Empty icon="users" title={t("gr.codeWrong")} action={<ButtonLink href="/app/groups">{t("gr.title")}</ButtonLink>} /></div>;
  const g = q.data;
  const already = mine.data?.group.id === g.id;
  return (
    <div className="card pad-lg stack g16 enter" style={{ maxWidth: 520, margin: "0 auto", alignItems: "center", textAlign: "center" }}>
      <GroupMark name={g.name} color={g.color} size={72} />
      <h1 className="t-h2">{g.name}</h1>
      {g.description && <p className="secondary">{g.description}</p>}
      <span className="t-small muted">{t("gr.members", { n: g.members })}{g.mahalla ? ` · ${g.mahalla}` : ""}{g.district ? `, ${g.district}` : ""}</span>
      {err && <Notice tone="bad">{err}</Notice>}
      {already ? <ButtonLink href={`/app/groups/${g.id}`} variant="primary">{t("gr.open")}</ButtonLink>
        : mine.data ? <Notice tone="info">{t("gr.leaveFirst", { name: mine.data.group.name })}</Notice>
        : <Button variant="primary" icon="userPlus" loading={busy} onClick={async () => {
            setBusy(true); setErr(null);
            try { await api.joinGroup(g.code); router.replace(`/app/groups/${g.id}`); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
          }}>{t("gr.joinBtn")}</Button>}
    </div>
  );
}
