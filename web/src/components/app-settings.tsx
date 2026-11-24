"use client";
/** v5: Settings → App, shown only inside the WORFIX app (Android/iOS). */
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { lockEnabled, setLockEnabled, worfix, type NativeInfo } from "@/lib/native";
import { Icon } from "./icons";
import { Button, Checkbox, useToast } from "./ui";

export function AppSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const [info, setInfo] = useState<NativeInfo | null>(null);
  const [lock, setLock] = useState(false);
  useEffect(() => {
    setLock(lockEnabled());
    void worfix().then((w) => w.info()).then(setInfo).catch(() => {});
  }, []);
  if (!info) return null;
  const bio = info.biometric !== "none";
  const text = { title: t("nt.bioTitle"), reason: t("nt.bioReason"), cancel: t("a.cancel") };

  const toggleLock = async (on: boolean) => {
    if (on) {
      const r = await (await worfix()).verifyBiometric(text).catch(() => ({ ok: false }));
      if (!r.ok) { toast(t("nt.bioFailed"), "error"); return; }
    }
    setLockEnabled(on);
    setLock(on);
  };
  const forgetLogin = async () => {
    await (await worfix()).clearLogin().catch(() => {});
    setInfo({ ...info, hasLogin: false });
  };

  return (
    <div className="stack g20">
      <div className="stack g8">
        <span className="row g8"><Icon name="lock" size={18} /><strong>{t("nt.lockToggle")}</strong></span>
        {bio ? (
          <Checkbox checked={lock} onChange={(v) => void toggleLock(v)}>{t("nt.lockHint")}</Checkbox>
        ) : <p className="t-small secondary">{t("nt.bioNone")}</p>}
      </div>
      {bio && (
        <div className="stack g8">
          <span className="row g8"><Icon name="key" size={18} /><strong>{t("nt.bioLoginToggle")}</strong></span>
          {info.hasLogin ? (
            <div className="row between wrap g8">
              <span className="t-small secondary">{t("nt.bioLoginOn")}</span>
              <Button variant="ghost" size="sm" onClick={() => void forgetLogin()}>{t("a.delete")}</Button>
            </div>
          ) : <p className="t-small secondary">{t("nt.bioLoginHint")}</p>}
        </div>
      )}
      <div className="stack g8">
        <span className="row g8"><Icon name="bell" size={18} /><strong>{t("nt.notifs")}</strong></span>
        <p className="t-small secondary">{t("nt.notifsHint")}</p>
        <div><Button variant="ghost" size="sm" icon="settings" onClick={() => void worfix().then((w) => w.openSettings())}>{t("nt.openSettings")}</Button></div>
      </div>
      <div className="stack g8">
        <span className="row g8"><Icon name="layers" size={18} /><strong>{t("nt.widgets")}</strong></span>
        <p className="t-small secondary">{t("nt.widgetsHint")}</p>
      </div>
      <span className="t-meta">{t("nt.version", { v: `${info.version} (${info.build})` })}</span>
    </div>
  );
}
