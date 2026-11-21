"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ReviewQueue } from "@/components/review-queue";
import { PageHead } from "@/components/shell";
import { useI18n } from "@/lib/i18n";

/** The organization reviews the evidence for its own missions (admins only oversee). */
function OrgReview() {
  const { t } = useI18n();
  const mission = useSearchParams().get("mission");
  return (
    <div className="stack g24 enter">
      <PageHead title={t("nav.review")} sub={t("rv.subOrg")} />
      <ReviewQueue scope="org" missionId={mission} />
    </div>
  );
}

export default function OrgReviewPage() {
  return <Suspense fallback={null}><OrgReview /></Suspense>;
}
