"use client";
import { Explore } from "@/components/explore";
import { PageHead } from "@/components/shell";
import { useI18n } from "@/lib/i18n";

export default function AppExplore() {
  const { t } = useI18n();
  return (
    <div className="enter">
      <PageHead title={t("ex.title")} sub={t("ex.subApp")} />
      <Explore base="/app/missions" />
    </div>
  );
}
