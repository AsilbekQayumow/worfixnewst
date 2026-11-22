"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Icon } from "@/components/icons";
import { useMe } from "@/components/providers";
import { Button, Checkbox, Notice, PasswordInput, Select, TextArea, TextInput } from "@/components/ui";
import type { OrganizationInput } from "@/lib/domain/validation";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";

const ORG_TYPES = ["ngo", "school", "university", "government", "company", "community", "other"] as const;

function Register() {
  const { t, lang } = useI18n();
  const errText = useErrorText();
  const router = useRouter();
  const { reload } = useMe();
  const params = useSearchParams();
  const [type, setType] = useState<"volunteer" | "organization">(params.get("type") === "organization" ? "organization" : "volunteer");
  const [v, setV] = useState({ fullName: "", email: "", password: "", birthYear: "", ageConfirmed: false, guardianConsent: false });
  const [o, setO] = useState<OrganizationInput>({ name: "", organizationType: "ngo", description: "", email: "", phone: "", website: "", address: "", country: "Uzbekistan", city: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const age = v.birthYear ? new Date().getFullYear() - Number(v.birthYear) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const r = await api.register({
        fullName: v.fullName, email: v.email, password: v.password, accountType: type, birthYear: Number(v.birthYear) || 0,
        ageConfirmed: v.ageConfirmed, guardianConsent: v.guardianConsent,
        organization: type === "organization" ? { ...o, organizationType: t(`orgType.${o.organizationType}`) } : undefined,
      }, lang);
      reload();
      const q = r.devVerifyToken ? `?dev=${r.devVerifyToken}` : "";
      router.replace(type === "organization" ? `/verify-email${q}${q ? "&" : "?"}next=/org` : `/verify-email${q}${q ? "&" : "?"}next=/app/onboarding`);
    } catch (err) {
      if (err instanceof ValidationError) { setFields(err.fields); setError(t("v.check")); }
      else setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  const setOrg = (k: keyof OrganizationInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setO((x) => ({ ...x, [k]: e.target.value }));

  return (
    <form className="stack g20" onSubmit={submit} noValidate>
      <div className="stack g8">
        <h1 className="t-h1">{t("auth.registerTitle")}</h1>
        <p className="secondary">{t("auth.registerSub")}</p>
      </div>

      <div className="grid cols-2" role="radiogroup" aria-label={t("auth.accountType")}>
        {(["volunteer", "organization"] as const).map((k) => (
          <label key={k} className="radio-card" data-on={type === k} style={{ position: "relative" }}>
            <input type="radio" name="type" checked={type === k} onChange={() => setType(k)} />
            <Icon name={k === "volunteer" ? "user" : "building"} />
            <span className="stack g4">
              <span style={{ fontWeight: 500, fontSize: 14 }}>{t(`auth.as.${k}`)}</span>
              <span className="t-small secondary">{t(`auth.as.${k}.b`)}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <TextInput label={type === "organization" ? t("auth.contactName") : t("auth.fullName")} autoComplete="name" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} error={fields.fullName} />
      <TextInput label={t("auth.email")} type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={fields.email} />
      <PasswordInput label={t("auth.password")} autoComplete="new-password" hint={t("auth.passwordHint")} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} error={fields.password} />

      {type === "volunteer" ? (
        <>
          <TextInput label={t("auth.birthYear")} inputMode="numeric" placeholder="2006" value={v.birthYear} onChange={(e) => setV({ ...v, birthYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} error={fields.birthYear} />
          {age !== null && age >= 15 && age < 18 && (
            <Checkbox checked={v.guardianConsent} onChange={(c) => setV({ ...v, guardianConsent: c })} error={fields.guardianConsent}>{t("auth.guardian")}</Checkbox>
          )}
          <Checkbox checked={v.ageConfirmed} onChange={(c) => setV({ ...v, ageConfirmed: c })} error={fields.ageConfirmed}>{t("auth.ageConfirm")}</Checkbox>
        </>
      ) : (
        <fieldset className="stack g16" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="t-h3" style={{ marginBottom: 4 }}>{t("auth.orgSection")}</legend>
          <TextInput label={t("org.name")} value={o.name} onChange={setOrg("name")} error={fields["org.name"]} />
          <Select label={t("org.type")} value={o.organizationType} onChange={setOrg("organizationType")}>
            {ORG_TYPES.map((k) => <option key={k} value={k}>{t(`orgType.${k}`)}</option>)}
          </Select>
          <TextArea label={t("org.description")} hint={t("org.descriptionHint")} value={o.description} onChange={setOrg("description")} error={fields["org.description"]} rows={3} />
          <div className="grid cols-2">
            <TextInput label={t("org.email")} type="email" value={o.email} onChange={setOrg("email")} error={fields["org.email"]} />
            <TextInput label={t("org.phone")} type="tel" value={o.phone} onChange={setOrg("phone")} error={fields["org.phone"]} />
          </div>
          <TextInput label={t("org.website")} type="url" placeholder="https://" value={o.website} onChange={setOrg("website")} error={fields["org.website"]} />
          <TextInput label={t("org.address")} value={o.address} onChange={setOrg("address")} error={fields["org.address"]} />
          <div className="grid cols-2">
            <TextInput label={t("org.country")} value={o.country} onChange={setOrg("country")} error={fields["org.country"]} />
            <TextInput label={t("org.city")} value={o.city} onChange={setOrg("city")} error={fields["org.city"]} />
          </div>
          <Notice tone="info">{t("auth.orgReview")}</Notice>
        </fieldset>
      )}

      <Button type="submit" variant="primary" size="lg" loading={busy} block>{type === "organization" ? t("auth.registerOrg") : t("auth.registerBtn")}</Button>
      <p className="t-small secondary">{t("auth.haveAccount")} <Link href="/login" className="link">{t("auth.login")}</Link></p>
    </form>
  );
}

export default function RegisterPage() {
  return <Suspense fallback={null}><Register /></Suspense>;
}
