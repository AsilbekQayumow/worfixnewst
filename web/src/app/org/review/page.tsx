"use client";
import { ReviewQueue } from "@/components/review-queue";
import { PageHead } from "@/components/shell";
import { useI18n } from "@/lib/i18n";

export default function OrgReview() {
  const { t } = useI18n();
  return (
    <div className="stack g24 enter">
      <PageHead title={t("nav.review")} sub={t("rv.sub")} />
      <ReviewQueue scope="org" />
    </div>
  );
}
