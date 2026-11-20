"use client";
import { useState } from "react";
import type { Organization } from "@/lib/domain/types";
import type { OrganizationInput } from "@/lib/domain/validation";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { Button, Notice, TextArea, TextInput, useToast } from "./ui";

export function OrgForm({ org, onDone }: { org: Organization | null; onDone?: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [o, setO] = useState<OrganizationInput>({
    name: org?.name ?? "", organizationType: org?.organizationType ?? "", description: org?.description ?? "", email: org?.email ?? "",
    phone: org?.phone ?? "", website: org?.website ?? "", address: org?.address ?? "", country: org?.country ?? "Uzbekistan", city: org?.city ?? "",
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof OrganizationInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setO((x) => ({ ...x, [k]: e.target.value }));

  return (
    <form className="stack g16" noValidate onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setFields({}); setError(null);
      try {
        if (org) await api.updateOrganization(o); else await api.registerOrganization(o);
        toast(t("org.saved"));
        onDone?.();
      } catch (err) {
        if (err instanceof ValidationError) { setFields(err.fields); setError(t("v.check")); } else setError(errText(err));
      } finally { setBusy(false); }
    }}>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="grid cols-2">
        <TextInput label={t("org.name")} value={o.name} onChange={set("name")} error={fields.name} />
        <TextInput label={t("org.type")} value={o.organizationType} onChange={set("organizationType")} error={fields.organizationType} />
      </div>
      <TextArea label={t("org.description")} hint={t("org.descriptionHint")} value={o.description} onChange={set("description")} error={fields.description} rows={4} />
      <div className="grid cols-2">
        <TextInput label={t("org.email")} type="email" value={o.email} onChange={set("email")} error={fields.email} />
        <TextInput label={t("org.phone")} type="tel" value={o.phone} onChange={set("phone")} error={fields.phone} />
      </div>
      <TextInput label={t("org.website")} type="url" placeholder="https://" value={o.website} onChange={set("website")} error={fields.website} />
      <TextInput label={t("org.address")} value={o.address} onChange={set("address")} error={fields.address} />
      <div className="grid cols-2">
        <TextInput label={t("org.country")} value={o.country} onChange={set("country")} error={fields.country} />
        <TextInput label={t("org.city")} value={o.city} onChange={set("city")} error={fields.city} />
      </div>
      <div><Button type="submit" variant="primary" loading={busy}>{org ? t("a.save") : t("auth.registerOrg")}</Button></div>
    </form>
  );
}
