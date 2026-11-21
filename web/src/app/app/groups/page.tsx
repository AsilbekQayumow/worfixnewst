"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GroupDialog, JoinDialog } from "@/components/group-bits";
import { Icon } from "@/components/icons";
import { PageHead } from "@/components/shell";
import { Button, Skeleton } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

/** My group, or how to start one (create, or join with a code / QR). */
export default function Groups() {
  const { t } = useI18n();
  const router = useRouter();
  const q = useApi(() => api.myGroup());
  const [create, setCreate] = useState(false);
  const [join, setJoin] = useState(false);
  useEffect(() => { if (q.data) router.replace(`/app/groups/${q.data.group.id}`); }, [q.data, router]);
  if (q.data === undefined || q.data) return <Skeleton rows={3} />;
  return (
    <div className="stack g24 enter" style={{ maxWidth: 820 }}>
      <PageHead title={t("gr.title")} sub={t("gr.sub")} />
      <div className="grid cols-2">
        <button type="button" className="card pad-lg stack g12 choice-card" onClick={() => setCreate(true)}>
          <Icon name="plus" size={28} className="accent-text" />
          <span className="t-h3">{t("gr.create")}</span>
          <span className="t-small secondary">{t("gr.createBody")}</span>
        </button>
        <button type="button" className="card pad-lg stack g12 choice-card" onClick={() => setJoin(true)}>
          <Icon name="scan" size={28} className="accent-text" />
          <span className="t-h3">{t("gr.joinTitle")}</span>
          <span className="t-small secondary">{t("gr.joinBody")}</span>
        </button>
      </div>
      <section className="card pad stack g12">
        <h2 className="t-h3">{t("gr.whyTitle")}</h2>
        <ul className="stack g8 t-small secondary why-list">
          <li><Icon name="trophy" size={16} />{t("gr.why1")}</li>
          <li><Icon name="zap" size={16} />{t("gr.why2")}</li>
          <li><Icon name="message" size={16} />{t("gr.why3")}</li>
        </ul>
      </section>
      <GroupDialog open={create} onClose={() => setCreate(false)} />
      <JoinDialog open={join} onClose={() => setJoin(false)} />
    </div>
  );
}
