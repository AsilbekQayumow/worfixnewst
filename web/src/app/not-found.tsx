"use client";
import { SiteFrame } from "@/components/site";
import { ButtonLink, Empty } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <SiteFrame>
      <div className="container" style={{ paddingTop: 80, maxWidth: 560 }}>
        <div className="card"><Empty icon="compass" title={t("e.notFound")} action={<ButtonLink href="/" variant="primary">{t("nav.home")}</ButtonLink>} /></div>
      </div>
    </SiteFrame>
  );
}
