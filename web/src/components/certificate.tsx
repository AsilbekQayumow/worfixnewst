"use client";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { levelTitleKey } from "@/lib/domain/rewards";
import { useFmt, useI18n } from "@/lib/i18n";
import { Button } from "./ui";

export interface CertificateView {
  verificationCode: string;
  holderName: string;
  certificateType: "mission" | "level";
  level: number | null;
  missionTitle: string;
  organizationName: string;
  issuedAt: string;
  hours: number;
  xp: number;
}

const W = 1754;
const H = 1240;

function cssFont(v: string, fallback: string) {
  const s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return s || fallback;
}

/** Draws the certificate onto a canvas (A4 landscape at 150 dpi). Shared by the preview, PNG download and print. */
async function draw(canvas: HTMLCanvasElement, c: CertificateView, text: (k: string, v?: Record<string, string | number>) => string, date: (iso: string) => string) {
  await document.fonts.ready.catch(() => undefined);
  const display = cssFont("--font-unbounded", "sans-serif");
  const body = cssFont("--font-onest", "sans-serif");
  const mono = cssFont("--font-jetbrains", "monospace");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;

  g.fillStyle = "#fbf8f1";
  g.fillRect(0, 0, W, H);

  // contour lines in the right half — the field-map signature
  g.save();
  g.strokeStyle = "rgba(90, 82, 70, 0.13)";
  g.lineWidth = 2;
  for (let k = 0; k < 14; k++) {
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
      const r = 60 + k * 46 + Math.sin(a * 3 + k * 0.6) * 18 + Math.cos(a * 5 - k) * 9;
      const x = W * 0.83 + Math.cos(a) * r * 1.25;
      const y = H * 0.38 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();

  // frame
  g.strokeStyle = "#1d1a15";
  g.lineWidth = 3;
  g.strokeRect(60, 60, W - 120, H - 120);
  g.lineWidth = 1;
  g.strokeRect(76, 76, W - 152, H - 152);

  // logo
  const logo = new Image();
  logo.src = "/worfix-logo.svg";
  await logo.decode().catch(() => undefined);
  if (logo.naturalWidth) g.drawImage(logo, 140, 136, 150, 80);
  g.fillStyle = "#1d1a15";
  g.font = `500 34px ${display}`;
  g.fillText("WORFIX", 310, 192);

  g.fillStyle = "#5a5246";
  g.font = `400 30px ${body}`;
  g.fillText(text("cert.kicker"), 140, 330);

  g.fillStyle = "#1d1a15";
  g.font = `500 92px ${display}`;
  const name = c.holderName.length > 28 ? `${c.holderName.slice(0, 27)}…` : c.holderName;
  g.fillText(name, 140, 450);

  g.fillStyle = "#0a6a2c";
  g.font = `500 48px ${display}`;
  const headline = c.certificateType === "level" && c.level
    ? text("cert.reached", { n: c.level, rank: text(levelTitleKey(c.level)) })
    : c.missionTitle;
  g.fillText(headline, 140, 560);

  g.fillStyle = "#5a5246";
  g.font = `400 30px ${body}`;
  const desc = c.certificateType === "level" ? text("cert.body") : text("cert.bodyMission", { org: c.organizationName });
  wrap(g, desc, 140, 640, 980, 44);

  // facts row
  const facts: [string, string][] = [
    [text("cert.hours"), String(Math.round(c.hours * 10) / 10)],
    [text("cert.xp"), String(c.xp)],
    [text("cert.issued"), date(c.issuedAt)],
  ];
  facts.forEach(([k, v], i) => {
    const x = 140 + i * 330;
    g.fillStyle = "#6f665a";
    g.font = `400 24px ${body}`;
    g.fillText(k, x, 900);
    g.fillStyle = "#1d1a15";
    g.font = `500 40px ${body}`;
    g.fillText(v, x, 952);
  });

  // dashed trail + code
  g.strokeStyle = "#1d1a15";
  g.setLineDash([2, 14]);
  g.lineCap = "round";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(140, 1030);
  g.bezierCurveTo(500, 990, 800, 1080, 1180, 1030);
  g.stroke();
  g.setLineDash([]);

  g.fillStyle = "#6f665a";
  g.font = `400 24px ${mono}`;
  g.fillText(`${text("cert.code")}  ${c.verificationCode}`, 140, 1100);

  const url = `${window.location.origin}/verify/${c.verificationCode}`;
  const qr = new Image();
  qr.src = await QRCode.toDataURL(url, { margin: 0, width: 300, color: { dark: "#1d1a15", light: "#fbf8f1" } });
  await qr.decode().catch(() => undefined);
  g.drawImage(qr, W - 140 - 260, H - 140 - 300, 260, 260);
  g.fillStyle = "#6f665a";
  g.font = `400 20px ${body}`;
  g.textAlign = "right";
  g.fillText(text("cert.scan"), W - 140, H - 140 - 8);
  g.textAlign = "left";
}

function wrap(g: CanvasRenderingContext2D, s: string, x: number, y: number, max: number, lh: number) {
  const words = s.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > max && line) { g.fillText(line, x, y); line = w; y += lh; } else line = test;
  }
  if (line) g.fillText(line, x, y);
}

export function CertificateCanvas({ c, actions = true }: { c: CertificateView; actions?: boolean }) {
  const { t, lang } = useI18n();
  const f = useFmt();
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    if (ref.current) void draw(ref.current, c, t, f.date).then(() => alive && setReady(true));
    return () => { alive = false; };
  }, [c, t, f.date, lang]);

  const download = () => {
    if (!ref.current) return;
    const a = document.createElement("a");
    a.href = ref.current.toDataURL("image/png");
    a.download = `WORFIX-${c.verificationCode}.png`;
    a.click();
  };

  const print = () => {
    if (!ref.current) return;
    const img = ref.current.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><title>WORFIX ${c.verificationCode}</title><style>@page{size:A4 landscape;margin:0}html,body{margin:0}img{width:100%;height:auto;display:block}</style><img src="${img}" onload="setTimeout(()=>{print()},50)">`);
    w.document.close();
  };

  return (
    <div className="stack g12">
      <div className="cert-frame">
        <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} aria-label={t("cert.aria", { name: c.holderName, code: c.verificationCode })} role="img" />
      </div>
      {actions && (
        <div className="row g8 wrap">
          <Button variant="primary" icon="download" onClick={download} disabled={!ready}>{t("cert.png")}</Button>
          <Button icon="printer" onClick={print} disabled={!ready}>{t("cert.pdf")}</Button>
          <a className="btn btn-ghost" href={`/verify/${c.verificationCode}`} target="_blank" rel="noreferrer">{t("cert.open")}</a>
        </div>
      )}
    </div>
  );
}
