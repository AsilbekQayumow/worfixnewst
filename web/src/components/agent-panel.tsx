"use client";
import { useState } from "react";
import { postAi } from "@/lib/ai/client";
import { nearbyPlaces } from "@/lib/ai/osm";
import type { AgentPlan } from "@/lib/ai/missions";
import { CATEGORIES, type Category } from "@/lib/domain/types";
import { DIFFICULTY_REWARD } from "@/lib/domain/rewards";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { getPosition } from "@/lib/store/media";
import { CATEGORY_ICON, Icon } from "./icons";
import { useMe } from "./providers";
import { TileMap } from "./tile-map";
import { Button, CategoryTag, Coins, DifficultyTag, Notice, Segmented, Status, TextInput, useToast } from "./ui";

type Phase = "idle" | "locating" | "places" | "thinking" | "done";

/**
 * GPS mission agent: reads the volunteer's position, the server looks up real places around them in
 * OpenStreetMap and Gemini designs missions for those places, ordered by the volunteer's interests.
 */
export function AgentPanel({ onSaved, onClose }: { onSaved: (ids: string[]) => void; onClose: () => void }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const errText = useErrorText();
  const toast = useToast();
  const { me } = useMe();
  const [interests, setInterests] = useState<Category[]>(me?.interests ?? []);
  const [count, setCount] = useState<"3" | "4" | "6">("4");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  const scan = async () => {
    setError(null);
    setPlan(null);
    setPhase("locating");
    try {
      const pos = await getPosition(12_000);
      setOrigin(pos);
      // Look up nearby places from the browser: no server time limit applies here.
      setPhase("places");
      const places = await nearbyPlaces(pos.lat, pos.lng, 1500, 12_000);
      setPhase("thinking");
      const r = await postAi("missions", { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, interests, language: lang, count: Number(count), notes: note, places });
      const j = (await r.json().catch(() => ({ error: "ai.unavailable" }))) as AgentPlan & { error?: string };
      if (!r.ok || j.error) throw new Error(j.error ?? "ai.unavailable");
      setPlan(j);
      setPicked(j.missions.map((_, i) => i).filter((i) => j.missions[i].matchesInterest || j.missions.length <= 3));
      setPhase("done");
    } catch (e) {
      setError(errText(e));
      setPhase("idle");
    }
  };

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const r = await api.saveAgentMissions(picked.map((i) => plan.missions[i]), plan.areaName);
      toast(t("ag.saved", { n: r.ids.length }));
      onSaved(r.ids);
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const ordered = plan ? plan.missions.map((m, i) => ({ m, i })).sort((a, b) => Number(b.m.matchesInterest) - Number(a.m.matchesInterest)) : [];

  return (
    <section className="panel" style={{ padding: 24 }} aria-labelledby="agent-h">
      <div className="row between g12 wrap" style={{ marginBottom: 16 }}>
        <div className="row g12">
          <span className="avatar" style={{ width: 40, height: 40, background: "var(--accent-soft)", color: "var(--on-accent-soft)" }}><Icon name="radar" /></span>
          <div className="stack">
            <h2 id="agent-h" className="t-h2">{t("ag.title")}</h2>
            <span className="t-small secondary">{t("ag.sub")}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" icon="x" onClick={onClose}>{t("a.close")}</Button>
      </div>

      {phase !== "done" && (
        <div className="stack g16">
          <div className="field">
            <span className="label">{t("ag.interests")}</span>
            <div className="row g8 wrap">
              {CATEGORIES.map((c) => {
                const on = interests.includes(c);
                return (
                  <button key={c} type="button" className="chip" aria-pressed={on} onClick={() => setInterests(on ? interests.filter((x) => x !== c) : [...interests, c])}>
                    <Icon name={CATEGORY_ICON[c]} size={16} />{t(`cat.${c}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="row g16 wrap" style={{ alignItems: "flex-end" }}>
            <div className="field">
              <span className="label">{t("ag.count")}</span>
              <Segmented value={count} onChange={setCount} items={[{ value: "3", label: "3" }, { value: "4", label: "4" }, { value: "6", label: "6" }]} />
            </div>
            <div className="grow" style={{ minWidth: 240 }}>
              <TextInput label={t("ag.note")} placeholder={t("ag.notePh")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </div>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="row g12 wrap">
            <Button variant="primary" size="lg" icon="crosshair" onClick={scan} loading={phase !== "idle"}>{t("ag.scan")}</Button>
            {phase !== "idle" && <span className="t-small secondary">{t(phase === "locating" ? "ag.locating" : phase === "places" ? "ag.places.find" : "ag.thinking")}</span>}
          </div>
          <p className="t-small muted">{t("ag.privacy")}</p>
        </div>
      )}

      {phase === "done" && plan && (
        <div className="stack g16">
          <div className="stack g4">
            {plan.areaName && <span className="row g8 t-small secondary"><Icon name="pin" size={16} />{plan.areaName}</span>}
            {plan.areaSummary && <p className="secondary" style={{ maxWidth: 760 }}>{plan.areaSummary}</p>}
          </div>
          <TileMap
            height={300}
            animateRoute={false}
            markers={[
              ...(origin ? [{ ...origin, kind: "me" as const }] : []),
              ...plan.places.map((p) => ({ lat: p.lat, lng: p.lng, kind: "place" as const })),
              ...plan.missions.map((m, i) => ({ lat: m.lat, lng: m.lng, kind: (focus === i ? "target" : "place") as "target" | "place", active: picked.includes(i) })),
            ]}
          />
          <span className="t-meta">{t("ag.places", { n: plan.places.length })}</span>
          <div className="grid cols-2">
            {ordered.map(({ m, i }) => {
              const on = picked.includes(i);
              return (
                <label key={i} className="radio-card" data-on={on} style={{ position: "relative", flexDirection: "column", gap: 10 }}
                  onMouseEnter={() => setFocus(i)} onFocus={() => setFocus(i)}>
                  <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== i) : [...picked, i])} />
                  <div className="row between g8">
                    <CategoryTag category={m.category} />
                    <span className="row g8">
                      {m.matchesInterest && <Status tone="ok">{t("ag.match")}</Status>}
                      <Icon name={on ? "checkCircle" : "plus"} size={18} style={{ color: on ? "var(--accent)" : "var(--muted)" }} />
                    </span>
                  </div>
                  <span style={{ fontWeight: 500 }}>{m.title}</span>
                  <span className="t-small secondary">{m.description}</span>
                  <span className="t-small muted row g8" style={{ alignItems: "flex-start" }}><Icon name="radar" size={14} style={{ marginTop: 3 }} />{m.whyHere}</span>
                  <div className="row between g8 wrap" style={{ borderTop: "1px dashed var(--line-strong)", paddingTop: 10 }}>
                    <span className="row g12 t-small"><DifficultyTag difficulty={m.difficulty} /><span className="muted">{f.distance(m.distanceM)} · {f.duration(m.durationMinutes)}</span></span>
                    <span className="row g12 t-small num"><span style={{ fontWeight: 500 }}>+{DIFFICULTY_REWARD[m.difficulty].xp} XP</span><Coins value={`+${DIFFICULTY_REWARD[m.difficulty].coins}`} size={14} /></span>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="row g12 wrap">
            <Button variant="primary" onClick={save} loading={saving} disabled={!picked.length}>{t("ag.add", { n: picked.length })}</Button>
            <Button variant="ghost" icon="refresh" onClick={() => { setPhase("idle"); setPlan(null); }}>{t("ag.again")}</Button>
          </div>
          <p className="t-small muted">{t("ag.reviewNote")}</p>
        </div>
      )}
    </section>
  );
}
