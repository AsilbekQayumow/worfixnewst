"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, TextInput } from "@/components/ui";
import { CODE_PATTERN, normaliseCode } from "@/lib/domain/certificates";
import { useI18n } from "@/lib/i18n";

export default function VerifyIndex() {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | undefined>();
  return (
    <div className="container" style={{ paddingTop: 64, maxWidth: 560 }}>
      <form className="card pad-lg stack g16" onSubmit={(e) => {
        e.preventDefault();
        const c = normaliseCode(code);
        if (!CODE_PATTERN.test(c)) { setErr("ver.badCode"); return; }
        router.push(`/verify/${c}`);
      }}>
        <h1 className="t-h1">{t("ver.title")}</h1>
        <p className="secondary">{t("ver.sub")}</p>
        <TextInput label={t("ver.code")} placeholder="WFX-XXXX-XXXX-XXXX" value={code} onChange={(e) => { setCode(e.target.value); setErr(undefined); }} error={err} autoCapitalize="characters" spellCheck={false} style={{ fontFamily: "var(--font-mono)" }} />
        <Button type="submit" variant="primary">{t("ver.check")}</Button>
      </form>
    </div>
  );
}
