"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GroupDialog, GroupMark, JoinDialog } from "@/components/group-bits";
import { Icon } from "@/components/icons";
import { PageHead } from "@/components/shell";
import { Avatar, Button, Skeleton, useToast } from "@/components/ui";
import { celebrate } from "@/lib/fx";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

/** My group, or how to get one: answer an invite, create a group, or join with a code / QR. */
export default function Groups() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const q = useApi(() => api.myGroup());
  const invites = useApi(() => api.myGroupInvites());
  const [create, setCreate] = useState(false);
  const [join, setJoin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const cards = useRef<HTMLDivElement>(null);
  useEffect(() => { if (q.data) router.replace(`/app/groups/${q.data.group.id}`); }, [q.data, router]);
  if (q.data === undefined || q.data) return <Skeleton rows={3} />;
  const answer = async (messageId: string, decision: "accepted" | "declined", el?: HTMLElement | null) => {
    setBusy(messageId + decision);
    try {
      const { groupId } = await api.respondGroupInvite(messageId, decision);
      if (decision === "accepted") { celebrate(el); router.push(`/app/groups/${groupId}`); }
      else toast(t("gi.declinedToast"));
    } catch (e) { toast(errText(e), "error"); } finally { setBusy(null); }
  };
  const pending = invites.data ?? [];
  return (
    <div className="stack g24 enter" style={{ maxWidth: 860 }}>
      <PageHead title={t("gr.title")} sub={t("gr.sub")} />

      {pending.length > 0 && (
        <section className="stack g12">
          <h2 className="t-h3 row g8"><span className="pulse-dot" aria-hidden />{t("gi.pending")}</h2>
          <div className="stack g12">
            {pending.map((p) => (
              <div key={p.messageId} className="invite-bubble invite-wide" style={{ ["--gc" as string]: p.group.color }}>
                <span className="invite-bubble-band" aria-hidden />
                <div className="row g16 wrap" style={{ alignItems: "center" }}>
                  <GroupMark name={p.group.name} color={p.group.color} size={56} />
                  <span className="stack g4 grow" style={{ minWidth: 0 }}>
                    <strong className="invite-bubble-name truncate">{p.group.name}</strong>
                    <span className="row g8 t-small secondary"><Avatar name={p.from.fullName} src={p.from.avatar} size={20} />{t("gi.pendingFrom", { name: p.from.fullName })} · {f.relative(p.createdAt)}</span>
                    <span className="t-small muted">{t("gi.card.members", { n: p.group.members })}</span>
                  </span>
                  <div className="row g8">
                    <Button variant="primary" icon="check" loading={busy === p.messageId + "accepted"} onClick={(e) => answer(p.messageId, "accepted", e.currentTarget)}>{t("gi.card.join")}</Button>
                    <Button variant="ghost" loading={busy === p.messageId + "declined"} onClick={() => answer(p.messageId, "declined")}>{t("gi.card.decline")}</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid cols-2" ref={cards}>
        <button type="button" className="card pad-lg stack g12 choice-card choice-primary" onClick={() => setCreate(true)}>
          <span className="choice-icon"><Icon name="plus" size={24} /></span>
          <span className="t-h3">{t("gr.create")}</span>
          <span className="t-small secondary">{t("gr.createBody")}</span>
        </button>
        <button type="button" className="card pad-lg stack g12 choice-card" onClick={() => setJoin(true)}>
          <span className="choice-icon"><Icon name="scan" size={24} /></span>
          <span className="t-h3">{t("gi.haveCode")}</span>
          <span className="t-small secondary">{t("gr.joinBody")}</span>
        </button>
      </div>

      <section className="card pad stack g16">
        <h2 className="t-h3">{t("gi.how")}</h2>
        <ol className="steps-row">
          {[["plus", "gi.step1", "gr.createBody"], ["message", "gi.step2", "gi.body"], ["trophy", "gi.step3", "gr.why1"]].map(([icon, title, body], i) => (
            <li key={title} style={{ ["--i" as string]: i }}>
              <span className="step-num num">{i + 1}</span>
              <span className="stack g4"><strong className="row g8"><Icon name={icon as "plus"} size={16} />{t(title)}</strong><span className="t-small secondary">{t(body)}</span></span>
            </li>
          ))}
        </ol>
      </section>
      <GroupDialog open={create} onClose={() => setCreate(false)} />
      <JoinDialog open={join} onClose={() => setJoin(false)} />
    </div>
  );
}
