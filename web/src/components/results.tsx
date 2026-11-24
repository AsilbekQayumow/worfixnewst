"use client";
/**
 * v4: verified results people can see and share.
 *  • BeforeAfter — the "before" and "after" photos of one result with a drag handle.
 *  • ResultsStrip — the newest verified results (Home).
 *  • PulseCounter — what the whole platform did this week (Home).
 *  • ShareCard — my results as a 4:5 picture to send to Telegram or Instagram.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useFmt, useI18n } from "@/lib/i18n";
import { personColor, shade } from "@/lib/map-colors";
import { api, type WorkResult } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { isPreset, PresetArt } from "./avatar-presets";
import { Icon } from "./icons";
import { Avatar, Button, CategoryTag, Dialog, Skeleton } from "./ui";

export function BeforeAfter({ before, after, label, hint = false }: { before: string; after: string; label: string; hint?: boolean }) {
  const { t } = useI18n();
  const [x, setX] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  // A short nudge the first time it is seen, so people know it slides.
  useEffect(() => {
    if (!hint || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      let raf = 0;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 1400);
        setX(50 + Math.sin(k * Math.PI * 2) * 18 * (1 - k));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [hint]);
  return (
    <div ref={box} className="ba" style={{ ["--x" as string]: `${x}%` }}>
      <img src={after} alt={`${label} — ${t("ev.stage.after")}`} draggable={false} />
      <img src={before} alt={`${label} — ${t("ev.stage.before")}`} draggable={false} className="ba-before" />
      <span className="ba-tag b">{t("ev.stage.before")}</span>
      <span className="ba-tag a">{t("ev.stage.after")}</span>
      <span className="ba-handle" aria-hidden><span><Icon name="chevronLeft" size={14} /><Icon name="chevronRight" size={14} /></span></span>
      <input type="range" min={0} max={100} value={Math.round(x)} onChange={(e) => setX(Number(e.target.value))} aria-label={t("ba.slider")} />
    </div>
  );
}

export function ResultCard({ r, hint }: { r: WorkResult; hint?: boolean }) {
  const f = useFmt();
  return (
    <article className="card result-card">
      <BeforeAfter before={r.before} after={r.after} label={r.title} hint={hint} />
      <div className="stack g8" style={{ padding: "12px 14px 14px" }}>
        <Link href={`/app/missions/${r.missionId}`} className="truncate" style={{ fontWeight: 500 }}>{r.title}</Link>
        <div className="row between g8">
          <Link href={`/app/people/${r.person.id}`} className="row g8 t-small secondary" style={{ minWidth: 0 }}>
            <Avatar name={r.person.name} src={r.person.avatar} size={22} /><span className="truncate">{r.person.name}</span>
          </Link>
          <span className="t-meta">{f.date(r.at)}</span>
        </div>
        <CategoryTag category={r.category} />
      </div>
    </article>
  );
}

export function ResultsStrip() {
  const { t } = useI18n();
  const q = useApi(() => api.recentResults(8));
  if (q.data && q.data.length === 0) return null;
  return (
    <section>
      <div className="section-title"><h2 className="t-h2">{t("rs.title")}</h2><Link href="/app/map" className="t-small link">{t("rs.onMap")}</Link></div>
      {!q.data ? <Skeleton rows={1} height={260} /> : (
        <div className="results-strip">{q.data.map((r, i) => <ResultCard key={r.id} r={r} hint={i === 0} />)}</div>
      )}
    </section>
  );
}

/** Counts up once when it comes into view. */
function CountUp({ value }: { value: number }) {
  const f = useFmt();
  const [n, setN] = useState(0);
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 1100);
        setN(value * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    if (el.current) io.observe(el.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value]);
  const shown = Number.isInteger(value) ? Math.round(n) : Math.round(n * 10) / 10;
  return <span ref={el} className="num">{f.num(shown)}</span>;
}

export function PulseCounter() {
  const { t } = useI18n();
  const q = useApi(() => api.communityPulse());
  const d = q.data;
  if (!d) return <Skeleton rows={1} height={96} />;
  if (d.missions === 0) return null;
  return (
    <section className="card pad pulse">
      <div className="row g8 t-small secondary"><span className="pulse-dot" aria-hidden />{t("pc.title")}</div>
      <div className="pulse-grid">
        <div><span className="t-h2"><CountUp value={d.missions} /></span><span className="t-small secondary">{t("pc.missions")}</span></div>
        <div><span className="t-h2"><CountUp value={d.people} /></span><span className="t-small secondary">{t("pc.people")}</span></div>
        <div><span className="t-h2"><CountUp value={d.hours} /></span><span className="t-small secondary">{t("pc.hours")}</span></div>
        {d.impact.map((x) => <div key={x.label}><span className="t-h2"><CountUp value={x.amount} /></span><span className="t-small secondary">{x.label}</span></div>)}
      </div>
    </section>
  );
}

/* ───────── share card ───────── */

function fontOf(varName: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function drawCard(d: Awaited<ReturnType<typeof api.shareStats>>, words: { title: string; area: string; missions: string; hours: string; level: string }) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const color = personColor(d.id, d.mapColor), dark = shade(color, 0.35);
  await document.fonts.ready;
  const display = fontOf("--font-unbounded", "sans-serif"), body = fontOf("--font-onest", "sans-serif");

  g.fillStyle = "#f6f1e7"; g.fillRect(0, 0, W, H);
  // the player's area: a soft blob in their colour
  g.save();
  g.translate(880, 215); g.rotate(-0.25); g.scale(0.62, 0.62);
  g.beginPath();
  g.moveTo(-260, -40); g.bezierCurveTo(-240, -260, 120, -300, 250, -140); g.bezierCurveTo(360, 0, 260, 260, 40, 270); g.bezierCurveTo(-200, 280, -280, 120, -260, -40);
  g.fillStyle = color; g.globalAlpha = 0.28; g.fill(); g.globalAlpha = 1;
  g.setLineDash([]); g.lineWidth = 14; g.strokeStyle = dark; g.stroke();
  g.restore();

  // avatar
  const ax = 96, ay = 120, as = 150;
  g.save(); g.beginPath(); g.arc(ax + as / 2, ay + as / 2, as / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = "#e9e2d4"; g.fillRect(ax, ay, as, as);
  try {
    if (d.avatar && isPreset(d.avatar)) {
      const svg = renderToStaticMarkup(<PresetArt id={d.avatar.slice(7)} />).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"');
      g.drawImage(await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`), ax, ay, as, as);
    } else if (d.avatar) g.drawImage(await loadImage(d.avatar), ax, ay, as, as);
    else {
      g.fillStyle = "#5a5144"; g.font = `500 60px ${display}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(d.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase(), ax + as / 2, ay + as / 2 + 4);
    }
  } catch { /* keep the plain circle */ }
  g.restore();
  g.lineWidth = 8; g.strokeStyle = color; g.beginPath(); g.arc(ax + as / 2, ay + as / 2, as / 2 + 10, 0, Math.PI * 2); g.stroke();

  g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.fillStyle = "#1d1a16"; g.font = `500 52px ${display}`;
  g.fillText(d.name, 96, 360, 880);
  g.fillStyle = "#6b6357"; g.font = `400 34px ${body}`;
  g.fillText(words.level, 96, 412);

  g.fillStyle = "#1d1a16"; g.font = `500 64px ${display}`;
  const title = words.title;
  g.fillText(title, 96, 560, 900);

  const rows = ([
    [d.areaM2 >= 1e6 ? `${(d.areaM2 / 1e6).toFixed(2)} km²` : `${Math.round(d.areaM2).toLocaleString("ru-RU")} m²`, words.area],
    [String(d.missions), words.missions],
    [String(d.hours), words.hours],
    ...d.impact.map((x) => [String(x.amount), x.label]),
  ] as [string, string][]).slice(0, 5);
  let y = 690;
  for (const [n, label] of rows) {
    g.fillStyle = color; g.fillRect(96, y - 52, 10, 64);
    g.fillStyle = "#1d1a16"; g.font = `500 72px ${display}`;
    g.fillText(n, 136, y + 8);
    const w = g.measureText(n).width;
    g.fillStyle = "#4a443b"; g.font = `400 36px ${body}`;
    g.fillText(label, 136 + w + 24, y + 4, W - 136 - w - 24 - 80);
    y += 118;
  }

  g.fillStyle = "#1d1a16"; g.fillRect(0, H - 120, W, 120);
  g.fillStyle = "#f6f1e7"; g.font = `500 40px ${display}`;
  g.fillText("WORFIX", 96, H - 46);
  g.font = `400 32px ${body}`; g.textAlign = "right";
  g.fillText("worfix.site", W - 96, H - 48);
  return c;
}

export function ShareCard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const blob = useRef<Blob | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUrl(null);
    void (async () => {
      const d = await api.shareStats();
      const c = await drawCard(d, { title: t("sc.title"), area: t("sc.area"), missions: t("sc.missions"), hours: t("sc.hours"), level: t("lvl.long", { n: d.level }) });
      c.toBlob((b) => { if (!b || cancelled) return; blob.current = b; setUrl(URL.createObjectURL(b)); }, "image/png");
    })();
    return () => { cancelled = true; };
  }, [open, t]);
  const file = () => new File([blob.current!], "worfix-natija.png", { type: "image/png" });
  const canShare = typeof navigator !== "undefined" && "canShare" in navigator && url !== null && navigator.canShare({ files: [file()] });
  return (
    <>
      <Button icon="share" onClick={() => setOpen(true)}>{t("sc.open")}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("sc.open")} footer={url ? <>
        <a className="btn btn-ghost" href={url} download="worfix-natija.png"><Icon name="download" size={16} />{t("sc.download")}</a>
        {canShare && <Button variant="primary" icon="share" onClick={() => void navigator.share({ files: [file()], text: t("sc.text") }).catch(() => {})}>{t("sc.share")}</Button>}
      </> : null}>
        {url ? <img src={url} alt={t("sc.alt")} className="share-preview" /> : <Skeleton rows={1} height={420} />}
      </Dialog>
    </>
  );
}
