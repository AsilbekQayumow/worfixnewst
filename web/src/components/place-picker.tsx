"use client";
/**
 * v7: viloyat → tuman → mahalla, picked from the official lists (no typing). A mahalla that is missing can be
 * sent to the admins; until it is added the person keeps the typed name without an id.
 */
import { useEffect, useMemo, useState } from "react";
import { DISTRICTS, districtById, loadMahallas, placeName, REGIONS, regionByProvince, type Mahalla } from "@/lib/game/places";
import { useI18n } from "@/lib/i18n";
import { api7 } from "@/lib/store/api7";
import { Button, Select, TextInput } from "./ui";
import { Icon } from "./icons";

export interface PlaceValue { province: string; districtId: number | null; district: string; mahallaId: string | null; mahalla: string; missing?: boolean }
export const emptyPlace = (): PlaceValue => ({ province: "", districtId: null, district: "", mahallaId: null, mahalla: "" });

export function PlacePicker({ value, onChange, errors = {}, signedIn = true }: { value: PlaceValue; onChange: (v: PlaceValue) => void; errors?: Record<string, string | undefined>; signedIn?: boolean }) {
  const { t, lang } = useI18n();
  const region = regionByProvince(value.province);
  const districts = useMemo(() => (region ? DISTRICTS.filter((d) => d.r === region.id) : []), [region]);
  const [list, setList] = useState<Mahalla[] | null>(null);
  const [needle, setNeedle] = useState("");
  const [missing, setMissing] = useState(Boolean(value.missing));
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const did = value.districtId;

  useEffect(() => {
    let live = true;
    setList(null); setNeedle("");
    if (!did) return;
    void Promise.all([loadMahallas(did), signedIn ? api7.customPlaces(did).catch(() => []) : Promise.resolve([])]).then(([a, b]) => {
      if (live) setList([...a, ...b].sort((x, y) => x[1].localeCompare(y[1], "uz")));
    });
    return () => { live = false; };
  }, [did, signedIn]);

  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase().replace(/[‘’'`ʻʼ]/g, "");
    const all = list ?? [];
    return n ? all.filter(([, name]) => name.toLowerCase().replace(/[‘’'`ʻʼ]/g, "").includes(n)) : all;
  }, [list, needle]);

  const setRegion = (id: string) => {
    const r = REGIONS.find((x) => String(x.id) === id);
    setMissing(false);
    onChange({ province: r?.p ?? "", districtId: null, district: "", mahallaId: null, mahalla: "" });
  };
  const setDistrict = (id: string) => {
    const d = districtById(id);
    setMissing(false);
    onChange({ ...value, districtId: d?.id ?? null, district: d?.uz ?? "", mahallaId: null, mahalla: "" });
  };
  const setMahalla = (id: string) => {
    const m = (list ?? []).find(([x]) => x === id);
    onChange({ ...value, mahallaId: m?.[0] ?? null, mahalla: m?.[1] ?? "", missing: false });
  };

  return (
    <div className="stack g12 place-picker">
      <div className="grid cols-2">
        <Select label={t("pl.region")} value={region ? String(region.id) : ""} onChange={(e) => setRegion(e.target.value)} error={errors.province}>
          <option value="">{t("pl.choose")}</option>
          {[...REGIONS].sort((a, b) => placeName(a, lang).localeCompare(placeName(b, lang))).map((r) => <option key={r.id} value={r.id}>{placeName(r, lang)}</option>)}
        </Select>
        <Select label={t("pl.district")} value={did ? String(did) : ""} onChange={(e) => setDistrict(e.target.value)} disabled={!region} error={errors.district}>
          <option value="">{region ? t("pl.choose") : t("pl.regionFirst")}</option>
          {districts.map((d) => <option key={d.id} value={d.id}>{placeName(d, lang)}</option>)}
        </Select>
      </div>

      {did && !missing && (
        <div className="stack g8">
          {list && list.length > 12 && (
            <TextInput label={t("pl.mahalla")} placeholder={t("pl.search")} value={needle} onChange={(e) => setNeedle(e.target.value)} aria-label={t("pl.search")} />
          )}
          <Select label={list && list.length > 12 ? undefined : t("pl.mahalla")} aria-label={t("pl.mahalla")} value={value.mahallaId ?? ""} onChange={(e) => setMahalla(e.target.value)} disabled={!list}
            error={errors.mahalla} hint={list ? t("pl.count", { n: list.length }) : t("pl.loading")}>
            <option value="">{list && !list.length ? t("pl.none") : t("pl.choose")}</option>
            {shown.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
          <button type="button" className="link t-small" style={{ alignSelf: "flex-start" }} onClick={() => { setMissing(true); onChange({ ...value, mahallaId: null, mahalla: "", missing: true }); }}>
            {t("pl.notListed")}
          </button>
        </div>
      )}

      {did && missing && (
        <div className="stack g8 card pad-s">
          <TextInput label={t("pl.typeName")} value={value.mahalla} maxLength={80} onChange={(e) => onChange({ ...value, mahallaId: null, mahalla: e.target.value, missing: true })}
            error={errors.mahalla} hint={signedIn ? t("pl.typeHint") : t("pl.typeHintReg")} />
          <div className="row g8 wrap">
            {signedIn && (
              <Button size="sm" variant="secondary" icon="send" loading={busy} disabled={sent || value.mahalla.trim().length < 2} onClick={async () => {
                setBusy(true);
                try { await api7.requestPlace(did, value.mahalla); setSent(true); } finally { setBusy(false); }
              }}>{sent ? t("pl.sent") : t("pl.send")}</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setMissing(false); onChange({ ...value, mahalla: "", mahallaId: null, missing: false }); }}>{t("pl.backToList")}</Button>
          </div>
          {sent && <p className="t-small secondary row g4"><Icon name="checkCircle" size={14} />{t("pl.sentBody")}</p>}
        </div>
      )}
    </div>
  );
}
