"use client";
import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "@/lib/domain/types";
import { useI18n } from "@/lib/i18n";
import { searchPlaces, type PlaceHit } from "@/lib/map/geo";
import { Icon } from "./icons";

/** Search box for places; runs the search 400 ms after typing stops, so the daily quota lasts. */
export function PlaceSearch({ near, onPick }: { near: GeoPoint | null; onPick: (h: PlaceHit) => void }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const skip = useRef<string | null>(null);
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    const text = q.trim();
    if (text.length < 3) { setHits(null); return; }
    if (skip.current === text) return;
    skip.current = null;
    const ac = new AbortController();
    const id = setTimeout(() => {
      setBusy(true);
      searchPlaces(text, nearRef.current, lang === "ru" ? "ru" : "en", ac.signal)
        .then((h) => { setHits(h); setOpen(true); })
        .catch(() => undefined)
        .finally(() => setBusy(false));
    }, 400);
    return () => { clearTimeout(id); ac.abort(); };
  }, [q, lang]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={wrap} className="place-search">
      <label className="field">
        <span className="label">{t("mf.search")}</span>
        <span style={{ position: "relative", display: "block" }}>
          <input className="input" type="search" style={{ paddingRight: 40 }} value={q} placeholder={t("mf.searchPh")} onChange={(e) => setQ(e.target.value)} onFocus={() => hits && setOpen(true)}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter") { e.preventDefault(); if (hits?.[0]) { onPick(hits[0]); setOpen(false); skip.current = hits[0].name.trim(); setQ(hits[0].name); } } }}
            aria-autocomplete="list" aria-expanded={open} />
          <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }} className="muted" aria-hidden>
            {busy ? <span className="spinner" /> : <Icon name="search" size={16} />}
          </span>
        </span>
      </label>
      {open && hits && (
        <div className="place-hits" role="listbox">
          {hits.length === 0 ? <p className="t-small muted" style={{ padding: 12 }}>{t("mf.noHits")}</p> : hits.map((h, i) => (
            <button key={`${h.lat},${h.lng},${i}`} type="button" role="option" aria-selected={false} onClick={() => { onPick(h); setOpen(false); skip.current = h.name.trim(); setQ(h.name); }}>
              <span style={{ fontWeight: 500 }}>{h.name}</span>
              <span className="t-small secondary">{h.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
