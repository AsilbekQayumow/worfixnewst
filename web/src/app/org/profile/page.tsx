"use client";
import { OrgForm } from "@/components/org-form";
import { PageHead } from "@/components/shell";
import { Skeleton } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function OrgProfile() {
  const { t } = useI18n();
  const q = useApi(() => api.myOrganization());
  return (
    <div className="stack g24 enter" style={{ maxWidth: 760 }}>
      <PageHead title={t("nav.orgProfile")} sub={t("org.profileSub")} />
      <div className="card pad-lg">{q.loading && !q.data ? <Skeleton rows={6} /> : <OrgForm key={q.data?.id ?? "new"} org={q.data ?? null} onDone={q.reload} />}</div>
    </div>
  );
}
