"use client";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { Suspense, useEffect, useState, type CSSProperties } from "react";
import { Icon } from "@/components/icons";
import { useMe } from "@/components/providers";
import { PageHead } from "@/components/shell";
import { ShopArt } from "@/components/shop-art";
import { Button, Coins, Dialog, Empty, Notice, Skeleton, Status, Tabs, TweenNumber, useToast } from "@/components/ui";
import { DIFFICULTY_REWARD } from "@/lib/domain/rewards";
import type { ShopItem } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

function Shop() {
  const { t, lang } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const { reload } = useMe();
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<"items" | "orders" | "codes">(initialTab === "orders" || initialTab === "codes" ? initialTab : "items");
  const codes = useApi(() => api.myPromoCodes());
  const q = useApi(() => api.shop());
  const [confirm, setConfirm] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ waiting: boolean; code: string | null } | null>(null);

  const buy = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const r = await api.buy(confirm.id);
      setCode(r.code);
      if (r.promo) {
        const mine = (await api.myPromoCodes()).find((c) => c.orderId === r.orderId);
        setPromo({ waiting: !mine, code: mine?.code ?? null });
      } else setPromo(null);
      reload();
    } catch (e) { toast(errText(e), "error"); setConfirm(null); } finally { setBusy(false); }
  };

  return (
    <div className="stack g24 enter">
      <PageHead title={t("nav.shop")} sub={t("shop.sub")} actions={q.data && (
        <div className="card row g12" style={{ padding: "10px 16px" }}>
          <span className="t-small secondary">{t("coin.balance")}</span>
          <span className="coins t-h2"><span className="coin" style={{ "--size": "22px" } as CSSProperties} aria-hidden /><TweenNumber value={q.data.balance} format={f.num} /></span>
        </div>
      )} />

      <div className="inset row g16 wrap t-small" style={{ padding: "12px 16px" }}>
        <span className="secondary">{t("shop.earn")}</span>
        {(["easy", "medium", "hard"] as const).map((d) => (
          <span key={d} className="row g8"><span>{t(`diff.${d}`)}</span><Coins value={`+${DIFFICULTY_REWARD[d].coins}`} size={14} /></span>
        ))}
        <span className="muted">{t("shop.bonus")}</span>
      </div>

      <Tabs value={tab} onChange={setTab} items={[
        { value: "items", label: t("shop.items") }, { value: "orders", label: t("shop.orders"), count: q.data?.orders.length },
        { value: "codes", label: t("shop.codes"), count: codes.data?.length || undefined },
      ]} />

      {tab === "codes" ? (
        !codes.data ? <Skeleton rows={2} /> : codes.data.length === 0 ? <div className="card"><Empty icon="ticket" title={t("shop.noCodes")} body={t("shop.noCodesBody")} /></div> : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {codes.data.map((c) => <PromoCard key={c.orderId} title={q.data?.items.find((i) => i.id === c.itemId)?.title[lang] ?? c.title} code={c.code} at={c.at} />)}
          </div>
        )
      ) : !q.data ? <Skeleton rows={2} height={220} /> : tab === "items" ? (
        q.data.items.length === 0 ? (
          <div className="card"><Empty icon="bag" title={t("shop.empty")} action={q.data.canPublish ? <Button variant="primary" onClick={() => api.publishCatalog()}>{t("shop.publish")}</Button> : undefined} /></div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {q.data.items.map((it) => {
              const short = q.data!.balance < it.price;
              return (
                <article key={it.id} className="card stack g12" style={{ padding: 12 }}>
                  <ShopArt art={it.art} image={it.image} />
                  <div className="stack g4" style={{ padding: "0 4px" }}>
                    <h3 className="t-h3">{it.title[lang]}</h3>
                    {it.delivery === "promo" && <span className="t-small accent-text row g4"><Icon name="ticket" size={14} />{t("shop.promoItem")}</span>}
                    <p className="t-small secondary">{it.description[lang]}</p>
                  </div>
                  <div className="row between g8" style={{ marginTop: "auto", padding: "0 4px 4px" }}>
                    <Coins value={f.num(it.price)} size={18} className="t-h3" />
                    {it.stock <= 0 ? <Status tone="neutral">{t("shop.out")}</Status> : (
                      <Button size="sm" variant={short ? "ghost" : "primary"} disabled={short} onClick={() => { setCode(null); setConfirm(it); }}>
                        {short ? t("shop.need", { n: it.price - q.data!.balance }) : t("shop.buy")}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : q.data.orders.length === 0 ? <div className="card"><Empty icon="ticket" title={t("shop.noOrders")} /></div> : (
        <div className="card rows">
          {q.data.orders.map((o) => {
            const item = q.data!.items.find((i) => i.id === o.itemId);
            return (
              <div key={o.id} className="row-item">
                <Icon name="ticket" className="muted" />
                <span className="stack grow"><span style={{ fontWeight: 500 }}>{item?.title[lang] ?? o.itemTitle}</span><span className="t-small secondary">{f.date(o.createdAt)}</span>{o.note && <span className="t-small secondary">{o.note}</span>}
                  {o.promoCode && <button type="button" className="t-small link row g4" style={{ background: "none", border: 0, padding: 0, width: "fit-content" }} onClick={() => setTab("codes")}><Icon name="ticket" size={14} />{t("shop.seeCode")}</button>}
                </span>
                <span className="t-meta">{o.code}</span>
                <Coins value={`−${o.price}`} size={14} />
                <Status tone={o.status === "fulfilled" ? "ok" : o.status === "cancelled" ? "bad" : o.status === "processing" ? "info" : "warn"}>{t(`shop.st.${o.status}`)}</Status>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} title={code ? t("shop.doneTitle") : t("shop.confirm")}
        footer={code ? <Button variant="primary" onClick={() => { setConfirm(null); setTab(promo?.code ? "codes" : "orders"); }}>{promo?.code ? t("shop.toCodes") : t("shop.toOrders")}</Button> : <>
          <Button variant="ghost" onClick={() => setConfirm(null)}>{t("a.cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={buy}>{t("shop.pay", { n: confirm?.price ?? 0 })}</Button>
        </>}>
        {confirm && (code ? (
          <div className="stack g12">
            <Notice tone="ok">{t("shop.done", { item: confirm.title[lang] })}</Notice>
            {promo?.code ? <PromoCard title={confirm.title[lang]} code={promo.code} at={new Date().toISOString()} /> : (<>
              {promo?.waiting && <Notice tone="info">{t("shop.promoWaiting")}</Notice>}
              <span className="t-small secondary">{t("shop.code")}</span>
              <span className="t-h2" style={{ fontFamily: "var(--font-mono)" }}>{code}</span>
            </>)}
          </div>
        ) : (
          <div className="row g16">
            <div style={{ width: 120, flex: "none" }}><ShopArt art={confirm.art} image={confirm.image} /></div>
            <div className="stack g8">
              <span style={{ fontWeight: 500 }}>{confirm.title[lang]}</span>
              <Coins value={f.num(confirm.price)} size={18} />
              <span className="t-small secondary">{t("shop.after", { n: f.num((q.data?.balance ?? 0) - confirm.price) })}</span>
            </div>
          </div>
        ))}
      </Dialog>
    </div>
  );
}

/** A delivered partner promo code with a QR to scan at the partner. */
function PromoCard({ title, code, at }: { title: string; code: string; at: string }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { void QRCode.toDataURL(code, { margin: 1, width: 240 }).then(setQr); }, [code]);
  return (
    <div className="card pad row g16 promo-card">
      {qr ? <img src={qr} alt={t("shop.qrAlt")} width={96} height={96} className="qr" /> : <span className="qr" style={{ width: 96, height: 96 }} />}
      <div className="stack g4" style={{ minWidth: 0 }}>
        <span className="t-small secondary">{t("shop.promoCode")}</span>
        <span className="group-code num">{code}</span>
        <span className="t-small secondary truncate">{title} · {f.date(at)}</span>
        <Button size="sm" icon="copy" onClick={async () => { await navigator.clipboard?.writeText(code); toast(t("gr.codeCopied")); }}>{t("gr.copyCode")}</Button>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return <Suspense fallback={null}><Shop /></Suspense>;
}
