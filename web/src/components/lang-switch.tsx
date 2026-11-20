"use client";
import { LANGS, type Lang } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n";

const SHORT: Record<Lang, string> = { uz: "O‘z", ru: "Ру", en: "En" };
const FULL: Record<Lang, string> = { uz: "O‘zbekcha", ru: "Русский", en: "English" };

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="seg" role="group" aria-label={t("set.language")}>
      {LANGS.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)} title={FULL[l]} style={{ padding: "0 8px", height: 26 }}>
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}

export const LANG_LABEL = FULL;
