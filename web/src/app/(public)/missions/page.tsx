"use client";
import { Explore } from "@/components/explore";
import { useI18n } from "@/lib/i18n";

export default function PublicMissions() {
  const { t } = useI18n();
  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="stack g8" style={{ marginBottom: 24 }}>
        <h1 className="t-h1">{t("ex.title")}</h1>
        <p className="secondary">{t("ex.sub")}</p>
      </div>
      <Explore base="/missions" />
    </div>
  );
}
