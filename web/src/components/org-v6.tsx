"use client";
/** v6: organization-side pieces — skills a mission needs (11), followers (12), emergency partner tools (19). */
import Link from "next/link";
import { useState } from "react";
import { SKILL_GROUPS, SKILLS, skillName, type SkillWanted } from "@/lib/domain/skills";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";
import { DeclareEmergency } from "./admin-v6";
import { Icon } from "./icons";
import { Button, Checkbox, Segmented, Stat, useToast } from "./ui";

export function MissionSkillsEditor({ missionId, initial }: { missionId: string; initial: SkillWanted[] }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [wanted, setWanted] = useState<SkillWanted[]>(initial);
  const [group, setGroup] = useState<(typeof SKILL_GROUPS)[number]>("medical");
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setWanted((w) => (w.some((x) => x.skillId === id) ? w.filter((x) => x.skillId !== id) : w.length >= 8 ? w : [...w, { skillId: id, required: false }]));
  return (
    <section className="card pad stack g12">
      <div className="stack g4"><h2 className="t-h3">{t("sk.wanted")}</h2><p className="t-small secondary">{t("sk.wantedHint")}</p></div>
      <Segmented value={group} onChange={setGroup} label={t("sk.groups")} items={SKILL_GROUPS.map((g) => ({ value: g, label: t(`sk.g.${g}`) }))} />
      <div className="row g8 wrap">
        {SKILLS.filter((s) => s.group === group).map((s) => {
          const on = wanted.some((w) => w.skillId === s.id);
          return <button key={s.id} type="button" className="chip" aria-pressed={on} onClick={() => toggle(s.id)}>{skillName(s.id, lang)}</button>;
        })}
      </div>
      {wanted.length > 0 && (
        <ul className="stack g8">
          {wanted.map((w) => (
            <li key={w.skillId} className="row g12 wrap">
              <span className="grow">{skillName(w.skillId, lang)}</span>
              <Checkbox checked={w.required} onChange={(v) => setWanted((x) => x.map((y) => (y.skillId === w.skillId ? { ...y, required: v } : y)))}>{t("sk.required")}</Checkbox>
            </li>
          ))}
        </ul>
      )}
      <Button variant="primary" loading={busy} style={{ width: "fit-content" }} onClick={async () => {
        setBusy(true);
        try { await api6.setMissionSkills(missionId, wanted); toast(t("set.saved")); } catch (e) { toast(errText(e), "error"); } finally { setBusy(false); }
      }}>{t("a.save")}</Button>
    </section>
  );
}

/** Organization dashboard: followers (never their names) and, for emergency partners, the declare button. */
export function OrgV6Panel({ partner }: { partner: boolean }) {
  const { t, } = useI18n();
  const q = useApi(() => api6.orgFollowerStats(), []);
  const [declare, setDeclare] = useState(false);
  const max = Math.max(1, ...(q.data?.months.map((m) => m.n) ?? [1]));
  return (
    <section className="grid cols-2">
      <div className="card pad stack g12">
        <Stat label={t("fo.followersTitle")} value={<span className="num">{q.data?.total ?? 0}</span>} sub={t("fo.namesHidden")} />
        <div className="di-bars di-bars-sm" aria-hidden>
          {(q.data?.months ?? []).map((m) => <span key={m.month} className="di-bar" data-on={m.n > 0 || undefined}><span style={{ height: `${Math.max(4, (m.n / max) * 100)}%` }} /><span className="t-meta">{m.month.slice(5)}</span></span>)}
        </div>
      </div>
      <div className="card pad stack g12">
        <h3 className="t-h3 row g8"><Icon name="search" size={18} />{t("sk.find")}</h3>
        <p className="t-small secondary">{t("sk.findSub")}</p>
        <Link href="/org/volunteers" className="btn btn-secondary" style={{ width: "fit-content" }}>{t("sk.findGo")}</Link>
        {partner && <Button variant="danger" icon="alert" style={{ width: "fit-content" }} onClick={() => setDeclare(true)}>{t("em.declare")}</Button>}
      </div>
      {declare && <DeclareEmergency onClose={() => setDeclare(false)} />}
    </section>
  );
}
