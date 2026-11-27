"use client";
import { useEffect, useRef, useState } from "react";
import { Button, TextArea, TextInput, useToast } from "../ui";
import { useMe } from "../providers";
import { useErrorText, useI18n } from "@/lib/i18n";
import { comingYear } from "@/lib/season/winter";

type Theme = "night" | "snow" | "gold";
const THEMES: Record<Theme, { sky: [string, string]; ink: string; accent: string; snow: string }> = {
  night: { sky: ["#0b1c38", "#1d4a86"], ink: "#ffffff", accent: "#ffd76a", snow: "rgba(255,255,255,.85)" },
  snow: { sky: ["#eaf3fb", "#cfe2f4"], ink: "#12202f", accent: "#d6262f", snow: "rgba(255,255,255,1)" },
  gold: { sky: ["#5a0e14", "#a51b23"], ink: "#fff6e0", accent: "#ffc93c", snow: "rgba(255,236,190,.8)" },
};

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }

/** Draws the card (1080×1350) on a canvas. */
function draw(c: HTMLCanvasElement, o: { theme: Theme; to: string; text: string; from: string; year: number; title: string }) {
  const W = 1080, H = 1350;
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const th = THEMES[o.theme];
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  const r = rng(42);
  // snowflakes
  x.fillStyle = th.snow;
  for (let i = 0; i < 160; i++) { x.beginPath(); x.arc(r() * W, r() * H * 0.8, 1.5 + r() * 4.5, 0, Math.PI * 2); x.fill(); }
  // hills
  x.fillStyle = o.theme === "snow" ? "#ffffff" : "#e8f2fb";
  x.beginPath(); x.moveTo(0, 1080); x.bezierCurveTo(300, 980, 600, 1040, 1080, 960); x.lineTo(1080, H); x.lineTo(0, H); x.fill();
  x.fillStyle = "#ffffff";
  x.beginPath(); x.moveTo(0, 1180); x.bezierCurveTo(360, 1110, 700, 1160, 1080, 1100); x.lineTo(1080, H); x.lineTo(0, H); x.fill();
  // the tree
  const tx = 820, ty = 600;
  const layers: [number, number, number][] = [[0, 150, 170], [120, 210, 210], [260, 270, 250]];
  for (const [dy, half, h] of layers) {
    x.fillStyle = "#14803f";
    x.beginPath(); x.moveTo(tx, ty + dy); x.lineTo(tx - half, ty + dy + h); x.lineTo(tx + half, ty + dy + h); x.closePath(); x.fill();
    x.fillStyle = "rgba(255,255,255,.85)";
    x.beginPath(); x.ellipse(tx, ty + dy + h - 6, half * 0.9, 12, 0, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = "#7a4a26"; x.fillRect(tx - 26, ty + 510, 52, 60);
  const balls = ["#ff4d5a", "#ffc93c", "#4fb4ff", "#ff7ad9"];
  for (let i = 0; i < 18; i++) {
    const lvl = layers[i % 3], t = r();
    const yy = ty + lvl[0] + 40 + t * (lvl[2] - 60);
    const spread = ((yy - ty - lvl[0]) / lvl[2]) * lvl[1] * 0.8;
    x.fillStyle = balls[i % balls.length];
    x.beginPath(); x.arc(tx + (r() * 2 - 1) * spread, yy, 12, 0, Math.PI * 2); x.fill();
  }
  // the star
  x.fillStyle = "#ffd23f";
  x.beginPath();
  for (let k = 0; k < 10; k++) { const a = (k * Math.PI) / 5 - Math.PI / 2, rr = k % 2 ? 22 : 52; x.lineTo(tx + Math.cos(a) * rr, ty - 10 + Math.sin(a) * rr); }
  x.closePath(); x.fill();
  // gifts
  [[150, 1150, 120, "#d6262f", "#ffc93c"], [290, 1180, 90, "#1d9a4a", "#ffffff"], [600, 1170, 100, "#2f7fd6", "#ffc93c"]].forEach(([gx, gy, s, b, rib]) => {
    const n = (v: string | number) => Number(v);
    x.fillStyle = String(b); x.fillRect(n(gx), n(gy) - n(s), n(s), n(s));
    x.fillStyle = String(rib); x.fillRect(n(gx) + n(s) / 2 - 8, n(gy) - n(s), 16, n(s)); x.fillRect(n(gx), n(gy) - n(s) * 0.6, n(s), 14);
  });
  // words
  const pad = 80;
  x.fillStyle = th.accent;
  x.font = "800 40px Nunito, system-ui, sans-serif";
  x.fillText(o.to ? `${o.to},` : "", pad, 150);
  x.fillStyle = th.ink;
  x.font = "900 112px Nunito, system-ui, sans-serif";
  const words = o.title.split(" ");
  let line = "", y = 280;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (x.measureText(test).width > W - pad * 2 - 300 && line) { x.fillText(line, pad, y); line = w; y += 118; } else line = test;
  }
  x.fillText(line, pad, y);
  x.fillStyle = th.accent;
  x.font = "900 150px Nunito, system-ui, sans-serif";
  x.fillText(String(o.year), pad, y + 170);
  x.fillStyle = th.ink;
  x.font = "600 40px Nunito, system-ui, sans-serif";
  let l2 = "", y2 = y + 270;
  for (const w of o.text.split(/\s+/)) {
    const test = l2 ? `${l2} ${w}` : w;
    if (x.measureText(test).width > 440 && l2) { x.fillText(l2, pad, y2); l2 = w; y2 += 54; if (y2 > 980) break; } else l2 = test;
  }
  if (y2 <= 980) x.fillText(l2, pad, y2);
  x.font = "800 38px Nunito, system-ui, sans-serif";
  x.fillStyle = "#12202f";
  if (o.from) x.fillText(`— ${o.from}`, pad, 1270);
  x.globalAlpha = 0.65; x.font = "700 30px Nunito, system-ui, sans-serif"; x.fillText("worfix.site", W - 250, 1290); x.globalAlpha = 1;
}

/** v8: a New Year card to send to friends — written here, shared as a picture. */
export function GreetingCard() {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const { me } = useMe();
  const ref = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<Theme>("night");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const year = comingYear();
  const opts = { theme, to: to.trim().slice(0, 40), text: (text.trim() || t("gc.default")).slice(0, 160), from: me?.fullName ?? "", year, title: t("gc.title") };
  useEffect(() => { if (ref.current) draw(ref.current, opts); }); // redraw on every change (cheap)

  const share = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((res, rej) => ref.current!.toBlob((b) => (b ? res(b) : rej(new Error("e.generic"))), "image/png"));
      const file = new File([blob], `worfix-${year}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (x: unknown) => boolean };
      if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: t("gc.title"), text: t("gc.shareText") });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast(t("gc.saved")); }
    } catch (e) { if ((e as Error).name !== "AbortError") toast(errText(e), "error"); } finally { setBusy(false); }
  };

  return (
    <section className="card pad gc" aria-labelledby="gc-h">
      <div className="stack g16 gc-form">
        <div className="stack g4">
          <h2 id="gc-h" className="t-h2">{t("gc.h")}</h2>
          <p className="t-small secondary">{t("gc.sub")}</p>
        </div>
        <div className="row g8 wrap" role="radiogroup" aria-label={t("gc.theme")}>
          {(Object.keys(THEMES) as Theme[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={theme === k} className="gc-swatch" data-on={theme === k ? "" : undefined} data-theme={k} onClick={() => setTheme(k)}>
              <span aria-hidden />{t(`gc.th.${k}`)}
            </button>
          ))}
        </div>
        <TextInput label={t("gc.to")} value={to} maxLength={40} onChange={(e) => setTo(e.target.value)} placeholder={t("gc.toPh")} />
        <TextArea label={t("gc.text")} value={text} maxLength={160} rows={3} onChange={(e) => setText(e.target.value)} placeholder={t("gc.default")} hint={`${text.length}/160`} />
        <Button variant="primary" icon="share" loading={busy} onClick={() => void share()}>{t("gc.share")}</Button>
      </div>
      <canvas ref={ref} className="gc-canvas" aria-label={t("gc.preview")} role="img" />
    </section>
  );
}
