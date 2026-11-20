"use client";
import { useRouter } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { useMe } from "@/components/providers";
import { PageHead } from "@/components/shell";
import { useI18n } from "@/lib/i18n";

export default function Onboarding() {
  const { t } = useI18n();
  const { me, reload } = useMe();
  const router = useRouter();
  if (!me) return null;
  return (
    <div style={{ maxWidth: 760 }}>
      <PageHead title={t("ob.title")} sub={t("ob.sub")} />
      <div className="card pad-lg">
        <ProfileForm me={me} onboarding onSaved={() => { reload(); router.replace("/app"); }} />
      </div>
    </div>
  );
}
