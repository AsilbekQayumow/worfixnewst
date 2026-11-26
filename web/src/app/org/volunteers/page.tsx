"use client";
import { useState } from "react";
import { PageHead } from "@/components/shell";
import { Avatar, Button, Empty, Notice, Select, Skeleton, Status, useToast } from "@/components/ui";
import { SkillChips } from "@/components/v6-bits";
import { SKILL_GROUPS, SKILL_LEVELS, SKILLS, skillName, type SkillLevel } from "@/lib/domain/skills";
import { useErrorText, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";

/** v6 · feature 11: approved organizations find volunteers who opted in, by skill, level and province. */
export default function FindVolunteers() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [skill, setSkill] = useState("");
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [province, setProvince] = useState("");
  const q = useApi(() => api6.findVolunteers({ skillId: skill || undefined, level, province: province || undefined }), [skill, level, province]);
  const missions = useApi(() => api.listMissions({ scope: "mine" }).catch(() => []), []);
  const open = (missions.data ?? []).filter((m) => m.status === "published" && Date.parse(m.date) > Date.now());
  const [target, setTarget] = useState("");
  const missionId = target || open[0]?.id || "";
  const provinces = [...new Set((q.data ?? []).map((x) => x.person.province).filter(Boolean))];
  return (
    <div className="stack g24 enter">
      <PageHead title={t("sk.find")} sub={t("sk.findSub")} />
      <Notice tone="info">{t("sk.privacy")}</Notice>
      <div className="row g12 wrap">
        <Select aria-label={t("sk.skill")} value={skill} onChange={(e) => setSkill(e.target.value)}>
          <option value="">{t("sk.anySkill")}</option>
          {SKILL_GROUPS.map((g) => <optgroup key={g} label={t(`sk.g.${g}`)}>{SKILLS.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{skillName(s.id, lang)}</option>)}</optgroup>)}
        </Select>
        <Select aria-label={t("sk.level")} value={level} onChange={(e) => setLevel(e.target.value as SkillLevel | "")}>
          <option value="">{t("sk.anyLevel")}</option>
          {SKILL_LEVELS.map((l) => <option key={l} value={l}>{t(`sk.l.${l}`)}+</option>)}
        </Select>
        <Select aria-label={t("sk.province")} value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">{t("sk.anyProvince")}</option>
          {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        {open.length > 0 && (
          <Select aria-label={t("sk.forMission")} value={missionId} onChange={(e) => setTarget(e.target.value)}>
            {open.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </Select>
        )}
      </div>
      {q.error ? <Notice tone="warn">{errText(q.error)}</Notice> : !q.data ? <Skeleton rows={3} /> : q.data.length === 0 ? (
        <div className="card"><Empty icon="users" title={t("sk.none")} body={t("sk.noneBody")} /></div>
      ) : (
        <div className="grid cols-2">
          {q.data.map(({ person: p, skills, trusted }) => (
            <article key={p.id} className="card pad stack g12">
              <div className="row g12">
                <Avatar name={p.fullName} src={p.avatar} size={44} />
                <span className="stack grow" style={{ minWidth: 0 }}>
                  <strong className="truncate">{p.fullName}</strong>
                  <span className="t-small muted">{t("lvl.short", { n: p.level })}{p.province ? ` · ${p.province}` : ""}</span>
                </span>
                {trusted && <Status tone="ok">{t("rat.trusted")}</Status>}
              </div>
              <SkillChips ids={skills.map((s) => s.id)} verified={skills.filter((s) => s.proof !== "self").map((s) => s.id)} />
              <Button size="sm" icon="send" disabled={!missionId} onClick={async () => {
                try { await api6.inviteVolunteer(p.id, missionId); toast(t("sk.invited")); } catch (e) { toast(errText(e), "error"); }
              }}>{t("sk.invite")}</Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
