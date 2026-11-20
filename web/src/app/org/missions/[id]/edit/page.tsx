"use client";
import { useParams } from "next/navigation";
import { MissionForm } from "@/components/mission-form";
import { PageHead } from "@/components/shell";
import { Skeleton } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function EditMission() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const q = useApi(() => api.getMission(id), [id]);
  return (
    <div className="stack g24" style={{ maxWidth: 880 }}>
      <PageHead title={t("a.edit")} />
      {q.data ? <MissionForm existing={q.data.mission} /> : <Skeleton rows={6} />}
    </div>
  );
}
