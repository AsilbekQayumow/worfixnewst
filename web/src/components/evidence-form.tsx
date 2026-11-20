"use client";
import { useRef, useState } from "react";
import { postAi } from "@/lib/ai/client";
import type { VerifyResult } from "@/lib/ai/missions";
import { distanceM } from "@/lib/domain/checks";
import type { Category, Evidence, GeoPoint, GpsFix } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { getPosition, prepareImage, thumbForAi } from "@/lib/store/media";
import { Icon } from "./icons";
import { Button, Checkbox, Notice, TextArea, useToast } from "./ui";

type Step = "idle" | "gps" | "ai" | "save";

interface MissionLite {
  id: string;
  title: string;
  description: string;
  category: Category;
  difficulty: "easy" | "medium" | "hard";
  coordinates: GeoPoint | null;
  radiusM?: number;
  checklist?: string[];
}

/**
 * Evidence capture: before/after photos (camera preferred, EXIF read for library photos), the mission checklist,
 * a GPS fix at submission and a photo check by the vision model. The reviewer sees every signal.
 */
export function EvidenceForm({ mission, resubmission, lastFix }: { mission: MissionLite; resubmission?: boolean; lastFix?: GpsFix | null }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const errText = useErrorText();
  const toast = useToast();
  const [photos, setPhotos] = useState<Evidence[]>([]);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [gpsConsent, setGpsConsent] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<VerifyResult | null>(null);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const stage = useRef<Evidence["stage"]>("before");
  const checklist = mission.checklist ?? [];
  const needs = mission.difficulty === "hard" ? 2 : 1;

  const add = async (files: FileList | null, source: "camera" | "library") => {
    if (!files?.length) return;
    setBusyPhoto(true);
    setError(null);
    try {
      const next: Evidence[] = [];
      for (const file of Array.from(files).slice(0, 6 - photos.length)) next.push(await prepareImage(file, source, stage.current));
      setPhotos((p) => [...p, ...next].slice(0, 6));
      stage.current = "after";
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusyPhoto(false);
      if (cam.current) cam.current.value = "";
      if (lib.current) lib.current.value = "";
    }
  };

  const submit = async () => {
    setError(null);
    if (!photos.length) { setError(t("e.photoNeeded")); return; }
    let gps: GpsFix | null = null;
    if (gpsConsent) {
      setStep("gps");
      gps = await getPosition(10_000).catch(() => lastFix ?? null);
    }
    setStep("ai");
    let aiConfidence: number | null = null;
    let aiNotes = "";
    try {
      const images = await Promise.all(photos.slice(0, 4).map((p) => thumbForAi(p.dataUrl)));
      const r = await postAi("verify", { title: mission.title, description: mission.description, category: mission.category, checklist, images, language: lang });
      if (r.ok) {
        const v = (await r.json()) as VerifyResult;
        setAi(v);
        aiConfidence = v.confidence;
        aiNotes = [v.summary, ...v.concerns].filter(Boolean).join(" · ");
      }
    } catch { /* the photo check is optional; reviewers still decide */ }
    setStep("save");
    try {
      await api.submitEvidence(mission.id, { notes, gpsConsent, gps, images: photos, checklistDone: done, aiConfidence, aiNotes });
      toast(t("ev.sent"));
      setPhotos([]);
      setNotes("");
    } catch (e) {
      setError(errText(e));
    } finally {
      setStep("idle");
    }
  };

  const busy = step !== "idle";
  const dist = lastFix && mission.coordinates ? distanceM(lastFix, mission.coordinates) : null;

  return (
    <div className="stack g20">
      <div className="stack g8">
        <div className="row between wrap g8">
          <h3 className="t-h3">{resubmission ? t("ev.addMore") : t("ev.photos")}</h3>
          <span className="t-small muted">{t("ev.photosHint", { n: needs })}</span>
        </div>
        {photos.length > 0 && (
          <div className="thumbs">
            {photos.map((p, i) => (
              <div key={p.sha256 + i} className="thumb">
                <img src={p.dataUrl} alt={t("ev.photoAlt", { n: i + 1 })} />
                <span className="t-meta">{t(`ev.stage.${p.stage ?? "proof"}`)}{p.capturedAt ? ` · ${f.time(p.capturedAt)}` : ""}</span>
                <button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label={t("ev.remove")}><Icon name="x" size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="row g8 wrap">
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void add(e.target.files, "camera")} />
          <input ref={lib} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void add(e.target.files, "library")} />
          <Button variant="ink" icon="camera" onClick={() => cam.current?.click()} disabled={busy || photos.length >= 6} loading={busyPhoto}>
            {photos.length === 0 ? t("ev.before") : t("ev.after")}
          </Button>
          <Button variant="ghost" icon="image" onClick={() => lib.current?.click()} disabled={busy || photos.length >= 6}>{t("ev.gallery")}</Button>
        </div>
        <p className="t-small muted">{t("ev.cameraTip")}</p>
      </div>

      {checklist.length > 0 && (
        <fieldset className="stack g8" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="t-h3" style={{ marginBottom: 8 }}>{t("ev.checklist")}</legend>
          {checklist.map((c) => (
            <Checkbox key={c} checked={done.includes(c)} onChange={(v) => setDone((d) => (v ? [...d, c] : d.filter((x) => x !== c)))}>{c}</Checkbox>
          ))}
        </fieldset>
      )}

      <TextArea label={t("ev.notes")} hint={t("ev.notesHint")} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} />

      <div className="stack g8">
        <Checkbox checked={gpsConsent} onChange={setGpsConsent}>{t("ev.gpsConsent")}</Checkbox>
        {gpsConsent && dist !== null && <span className="t-small secondary" style={{ paddingLeft: 28 }}>{t("ev.distanceNow", { d: f.distance(dist) })}</span>}
      </div>

      {error && <Notice tone="bad">{error}</Notice>}
      {ai && (
        <Notice tone={ai.confidence >= 0.7 ? "ok" : ai.confidence >= 0.4 ? "warn" : "bad"} icon="scan">
          <strong>{t("ev.aiResult", { p: Math.round(ai.confidence * 100) })}</strong> {ai.summary}
        </Notice>
      )}

      <div className="row g12 wrap">
        <Button variant="primary" size="lg" onClick={submit} loading={busy} disabled={!photos.length}>{resubmission ? t("ev.resubmit") : t("ev.submit")}</Button>
        {busy && <span className="t-small secondary">{t(`ev.step.${step}`)}</span>}
      </div>
    </div>
  );
}
