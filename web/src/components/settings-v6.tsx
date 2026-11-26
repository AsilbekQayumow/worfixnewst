"use client";
/** v6: settings for skills (11), discoverability, movement mode (10) and reminder / emergency notifications (4, 19). */
import { useEffect, useState } from "react";
import { SKILL_GROUPS, SKILL_LEVELS, SKILLS, skillName, type SkillLevel } from "@/lib/domain/skills";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { useMe } from "./providers";
import { Button, Checkbox, Notice, Segmented, Select, cx, useToast } from "./ui";

export function SkillsSettings() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api6.mySkills(), []);
  const [picked, setPicked] = useState<{ id: string; level: SkillLevel }[] | null>(null);
  const [disc, setDisc] = useState(false);
  const [mode, setMode] = useState<"walk" | "assisted">("walk");
  const [group, setGroup] = useState<(typeof SKILL_GROUPS)[number]>("medical");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data && picked === null) { setPicked(q.data.skills.map((s) => ({ id: s.id, level: s.level }))); setDisc(q.data.discoverable); setMode(q.data.moveMode); }
  }, [q.data, picked]);
  if (!q.data || !picked) return null;
  const proof = new Map(q.data.skills.map((s) => [s.id, s.proof]));
  const toggle = (id: string) => setPicked((p) => (p!.some((x) => x.id === id) ? p!.filter((x) => x.id !== id) : p!.length >= 20 ? p! : [...p!, { id, level: "beginner" }]));
  const save = async () => {
    setBusy(true);
    try { await api6.setSkills(picked, { discoverable: disc, moveMode: mode }); toast(t("set.saved")); q.reload(); } catch (e) { toast(errText(e), "error"); } finally { setBusy(false); }
  };
  return (
    <div className="stack g16">
      <Segmented value={group} onChange={setGroup} label={t("sk.groups")} items={SKILL_GROUPS.map((g) => ({ value: g, label: t(`sk.g.${g}`) }))} />
      <div className="row g8 wrap">
        {SKILLS.filter((s) => s.group === group).map((s) => {
          const on = picked.some((x) => x.id === s.id);
          return <button key={s.id} type="button" className="chip" aria-pressed={on} onClick={() => toggle(s.id)}>{on && <Icon name="check" size={14} />}{skillName(s.id, lang)}</button>;
        })}
      </div>
      {picked.length > 0 && (
        <ul className="stack g8">
          {picked.map((p) => (
            <li key={p.id} className="row g12 wrap skill-row">
              <span className="grow row g8" style={{ minWidth: 160 }}>
                {skillName(p.id, lang)}
                {proof.get(p.id) === "missions" && <span className={cx("chip", "is-on")} title={t("sk.byMissions")}><Icon name="checkCircle" size={14} />{t("sk.p.missions")}</span>}
                {proof.get(p.id) === "document" && <span className="chip is-on"><Icon name="shield" size={14} />{t("sk.p.document")}</span>}
              </span>
              <Select aria-label={t("sk.level")} value={p.level} onChange={(e) => setPicked((x) => x!.map((y) => (y.id === p.id ? { ...y, level: e.target.value as SkillLevel } : y)))}>
                {SKILL_LEVELS.map((l) => <option key={l} value={l}>{t(`sk.l.${l}`)}</option>)}
              </Select>
              <Button size="sm" variant="ghost" icon="x" iconOnly aria-label={t("a.remove")} onClick={() => toggle(p.id)} />
            </li>
          ))}
        </ul>
      )}
      {q.data.other.length > 0 && <p className="t-small muted">{t("sk.other")}: {q.data.other.join(", ")}</p>}
      {q.data.minor ? <Notice tone="info">{t("sk.minor")}</Notice> : (
        <Checkbox checked={disc} onChange={setDisc}>{t("sk.discoverable")}<span className="t-small muted" style={{ display: "block" }}>{t("sk.discoverableHint")}</span></Checkbox>
      )}
      <div className="stack g8">
        <span className="t-small secondary">{t("fp.mode")}</span>
        <Segmented value={mode} onChange={setMode} label={t("fp.mode")} items={[{ value: "walk", label: t("fp.mode.walk") }, { value: "assisted", label: t("fp.mode.assisted") }]} />
        <span className="t-small muted">{t("fp.modeHint")}</span>
      </div>
      <Button variant="primary" loading={busy} onClick={save} style={{ width: "fit-content" }}>{t("a.save")}</Button>
    </div>
  );
}

export function NotifySettings() {
  const { t } = useI18n();
  const { me, reload } = useMe();
  const toast = useToast();
  const errText = useErrorText();
  if (!me) return null;
  const prefs = { nearby: true, deadline: true, mine: true, proof: true, emergency: true, ...(me.notifyPrefs ?? {}) };
  const set = async (k: keyof typeof prefs, v: boolean) => {
    try { await api6.setNotifyPrefs({ [k]: v }); reload(); } catch (e) { toast(errText(e), "error"); }
  };
  const keys = (me.role === "volunteer" ? ["mine", "proof", "nearby", "deadline", "emergency"] : ["emergency"]) as (keyof typeof prefs)[];
  return (
    <div className="stack g12">
      {keys.map((k) => (
        <Checkbox key={k} checked={prefs[k]} onChange={(v) => void set(k, v)}>
          {t(`rem.p.${k}`)}<span className="t-small muted" style={{ display: "block" }}>{t(`rem.ph.${k}`)}</span>
        </Checkbox>
      ))}
      <p className="t-small muted">{t("rem.quiet")}</p>
    </div>
  );
}
