"use client";
import { useParams } from "next/navigation";
import { CertificateCanvas } from "@/components/certificate";
import { Icon } from "@/components/icons";
import { ButtonLink, Empty, Skeleton } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

export default function VerifyCode() {
  const { code } = useParams<{ code: string }>();
  const { t } = useI18n();
  const q = useApi(() => api.verifyCertificate(decodeURIComponent(code)), [code]);
  return (
    <div className="container" style={{ paddingTop: 40, maxWidth: 920 }}>
      {q.loading ? <Skeleton rows={2} height={200} /> : !q.data ? (
        <div className="card"><Empty icon="xCircle" title={t("ver.notFound")} body={t("ver.notFoundBody")} action={<ButtonLink href="/verify">{t("ver.tryAgain")}</ButtonLink>} /></div>
      ) : (
        <div className="stack g20 enter">
          <div className="notice n-ok"><Icon name="shield" /><div><strong>{t("ver.valid")}</strong> {t("ver.validBody", { name: q.data.holderName })}</div></div>
          <CertificateCanvas c={q.data} actions={false} />
          <span className="t-meta">{q.data.verificationCode}</span>
        </div>
      )}
    </div>
  );
}
