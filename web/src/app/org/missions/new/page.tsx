"use client";
import { MissionForm } from "@/components/mission-form";
import { PageHead } from "@/components/shell";
import { Notice } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function NewMission() {
  const { t } = useI18n();
  const org = useApi(() => api.myOrganization());
  return (
    <div className="stack g24 enter" style={{ maxWidth: 880 }}>
      <PageHead title={t("nav.newMission")} sub={t("mf.sub")} />
      {org.data && org.data.verificationStatus !== "approved" && <Notice tone="warn">{t("mf.draftOnly")}</Notice>}
      <MissionForm />
    </div>
  );
}
