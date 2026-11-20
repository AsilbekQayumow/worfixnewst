"use client";
import { useI18n } from "@/lib/i18n";
import { FIREBASE } from "@/lib/store/db";

/** Shown only in local demo mode, so demo data is never mistaken for real activity. */
export function DemoBanner() {
  const { t } = useI18n();
  if (FIREBASE) return null;
  return (
    <div className="demo-banner" style={{ background: "var(--warn-soft)", color: "var(--warn)", fontSize: 12, padding: "6px 16px", textAlign: "center" }}>
      {t("demo.banner")}
    </div>
  );
}
