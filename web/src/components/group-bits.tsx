"use client";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GROUP_COLORS } from "@/lib/domain/community";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api, ValidationError } from "@/lib/store/api";
import { Icon } from "./icons";
import { Button, Dialog, Notice, TextArea, TextInput, useToast } from "./ui";

/** Round group mark: initials on the group colour. */
export function GroupMark({ name, color = GROUP_COLORS[0], size = 40 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "G";
  return (
    <span className="group-mark" aria-hidden style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.36) }}>{initials}</span>
  );
}

/** Create or edit a group. */
export function GroupDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { id: string; name: string; description: string; color: string } }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const [v, setV] = useState({ name: "", description: "", color: GROUP_COLORS[0] as string });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(initial ? { name: initial.name, description: initial.description, color: initial.color } : { name: "", description: "", color: GROUP_COLORS[0] }); setFields({}); setError(null); } }, [open, initial]);
  const save = async () => {
    setBusy(true); setFields({}); setError(null);
    try {
      if (initial) { await api.updateGroup(initial.id, v); toast(t("gr.saved")); onClose(); }
      else { const { id } = await api.createGroup(v); toast(t("gr.created")); onClose(); router.push(`/app/groups/${id}`); }
    } catch (e) {
      if (e instanceof ValidationError) setFields(e.fields); else setError(errText(e));
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t("gr.edit") : t("gr.create")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" loading={busy} onClick={save}>{initial ? t("a.save") : t("gr.createBtn")}</Button>
    </>}>
      <div className="stack g16">
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="row g12">
          <GroupMark name={v.name || "G"} color={v.color} size={56} />
          <div className="row g8 wrap" role="radiogroup" aria-label={t("gr.color")}>
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={c} className="swatch" style={{ background: c }} onClick={() => setV((s) => ({ ...s, color: c }))}>
                {v.color === c && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>
        <TextInput label={t("gr.name")} value={v.name} maxLength={40} onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))} error={fields.name && t(fields.name)} placeholder={t("gr.namePh")} />
        <TextArea label={t("gr.description")} rows={2} maxLength={200} value={v.description} onChange={(e) => setV((s) => ({ ...s, description: e.target.value }))} error={fields.description && t(fields.description)} />
        {!initial && <p className="t-small secondary">{t("gr.areaNote")}</p>}
      </div>
    </Dialog>
  );
}

/** Join with a code (or a pasted invite link). */
export function JoinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true); setErr(null);
    try {
      const raw = code.includes("/join/") ? code.split("/join/")[1] : code;
      const { id } = await api.joinGroup(raw);
      toast(t("gr.joined")); onClose(); router.push(`/app/groups/${id}`);
    } catch (e) { setErr(e instanceof ValidationError ? t(Object.values(e.fields)[0]) : errText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("gr.joinTitle")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" loading={busy} disabled={!code.trim()} onClick={join}>{t("gr.joinBtn")}</Button>
    </>}>
      <div className="stack g12">
        <p className="t-small secondary">{t("gr.joinBody")}</p>
        <TextInput label={t("gr.code")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="WFX-AB2CD" autoCapitalize="characters" spellCheck={false} error={err ?? undefined} />
      </div>
    </Dialog>
  );
}

/** Invite card: QR code with the join link, the code, copy and share. */
export function InviteCard({ code, groupName, owner, onNewCode }: { code: string; groupName: string; owner: boolean; onNewCode: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const link = typeof window === "undefined" ? `/app/join/${code}` : `${window.location.origin}/app/join/${code}`;
  useEffect(() => { void QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#1d1a15", light: "#ffffff" } }).then(setQr); }, [link]);
  const share = async () => {
    const text = t("gr.shareText", { name: groupName, code });
    if (navigator.share) { try { await navigator.share({ title: groupName, text, url: link }); return; } catch { /* closed */ } }
    await navigator.clipboard?.writeText(`${text}\n${link}`);
    toast(t("gr.linkCopied"));
  };
  return (
    <div className="card pad stack g12 invite-card">
      <h3 className="t-h3">{t("gr.invite")}</h3>
      <div className="row g16 wrap" style={{ alignItems: "center" }}>
        {qr ? <img src={qr} alt={t("gr.qrAlt", { code })} width={148} height={148} className="qr" /> : <span className="qr" style={{ width: 148, height: 148 }} />}
        <div className="stack g8" style={{ minWidth: 180 }}>
          <span className="t-small secondary">{t("gr.codeLabel")}</span>
          <span className="group-code num">{code}</span>
          <div className="row g8 wrap">
            <Button size="sm" icon="copy" onClick={async () => { await navigator.clipboard?.writeText(code); toast(t("gr.codeCopied")); }}>{t("gr.copyCode")}</Button>
            <Button size="sm" variant="primary" icon="send" onClick={share}>{t("gr.share")}</Button>
          </div>
          {owner && <button type="button" className="t-small link" style={{ width: "fit-content", background: "none", border: 0, padding: 0 }} onClick={onNewCode}>{t("gr.newCode")}</button>}
        </div>
      </div>
      <p className="t-small muted">{t("gr.inviteHint")}</p>
    </div>
  );
}
