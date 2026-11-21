"use client";
import { useRef, useState } from "react";
import type { Lang, Order, ShopItem } from "@/lib/domain/types";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api, ValidationError, type ShopItemInput } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Icon } from "./icons";
import { ShopArt } from "./shop-art";
import { Button, Checkbox, Coins, Dialog, Empty, Segmented, Select, Skeleton, Status, Tabs, TextArea, TextInput, useToast } from "./ui";

const KINDS: ShopItem["kind"][] = ["merch", "experience", "donation", "digital"];
const ARTS: ShopItem["art"][] = ["bottle", "tote", "tree", "cap", "badge", "ticket", "kit", "frame"];
const LANGS: Lang[] = ["uz", "ru", "en"];
const blank = (): ShopItemInput => ({
  title: { uz: "", ru: "", en: "" }, description: { uz: "", ru: "", en: "" }, price: 100, stock: 10, kind: "merch", art: "badge", active: true, image: null,
});

/** Shrinks a product photo to a small JPEG data URL (kept inside the Firestore document, no Storage needed). */
export async function productPhoto(file: File, W = 600, H = 510): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("sh.v.imageType");
  if (file.size > 12 * 1024 * 1024) throw new Error("e.photoBig");
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  // Cropped to the centre (shop tiles 600×510, news covers 960×540).
  canvas.width = W; canvas.height = H;
  const scale = Math.max(W / bmp.width, H / bmp.height);
  const w = bmp.width * scale, h = bmp.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  bmp.close();
  for (const q of [0.78, 0.66, 0.54, 0.42]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length < 280_000) return url;
  }
  throw new Error("sh.v.image");
}

function ItemDialog({ item, onClose }: { item: (ShopItemInput & { id?: string }) | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [v, setV] = useState<ShopItemInput & { id?: string }>(() => item ?? blank());
  const [lang, setLang] = useState<Lang>("uz");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const save = async () => {
    setBusy(true);
    setFields({});
    try {
      const { id, ...input } = v;
      await api.saveShopItem(input, id);
      toast(t(id ? "sh.saved" : "sh.created"));
      onClose();
    } catch (e) {
      if (e instanceof ValidationError) { setFields(e.fields); if (e.fields.titleUz) setLang("uz"); }
      else toast(errText(e), "error");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} wide title={v.id ? t("sh.editTitle") : t("sh.newTitle")} footer={<>
      <Button variant="ghost" onClick={onClose}>{t("a.cancel")}</Button>
      <Button variant="primary" loading={busy} onClick={save}>{t("a.save")}</Button>
    </>}>
      <div className="shop-form">
        <div className="stack g8">
          <ShopArt art={v.art} image={v.image} />
          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try { const url = await productPhoto(f); setV((s) => ({ ...s, image: url })); } catch (err) { toast(t((err as Error).message), "error"); }
          }} />
          <div className="row g8 wrap">
            <Button size="sm" icon="upload" onClick={() => file.current?.click()}>{v.image ? t("sh.changePhoto") : t("sh.addPhoto")}</Button>
            {v.image && <Button size="sm" variant="ghost" icon="trash" onClick={() => setV((s) => ({ ...s, image: null }))}>{t("sh.removePhoto")}</Button>}
          </div>
          {fields.image && <span className="error-text">{t(fields.image)}</span>}
          {!v.image && (
            <Select label={t("sh.art")} value={v.art} onChange={(e) => setV((s) => ({ ...s, art: e.target.value as ShopItem["art"] }))}>
              {ARTS.map((a) => <option key={a} value={a}>{t(`sh.art.${a}`)}</option>)}
            </Select>
          )}
        </div>
        <div className="stack g16">
          <Segmented label={t("sh.lang")} value={lang} onChange={setLang} items={LANGS.map((l) => ({ value: l, label: l === "uz" ? "O‘z" : l === "ru" ? "Ру" : "En" }))} />
          <TextInput label={`${t("sh.name")}${lang === "uz" ? " *" : ""}`} value={v.title[lang]} maxLength={80}
            onChange={(e) => setV((s) => ({ ...s, title: { ...s.title, [lang]: e.target.value } }))} error={lang === "uz" ? fields.titleUz : undefined}
            hint={lang !== "uz" ? t("sh.fallback") : undefined} />
          <TextArea label={t("sh.desc")} rows={3} value={v.description[lang]} maxLength={400}
            onChange={(e) => setV((s) => ({ ...s, description: { ...s.description, [lang]: e.target.value } }))} />
          <div className="grid cols-2">
            <TextInput label={t("sh.price")} inputMode="numeric" value={String(v.price)} onChange={(e) => setV((s) => ({ ...s, price: Number(e.target.value.replace(/\D/g, "")) || 0 }))} error={fields.price} />
            <TextInput label={t("sh.stock")} inputMode="numeric" value={String(v.stock)} disabled={v.delivery === "promo"} hint={v.delivery === "promo" ? t("sh.stockPromo") : undefined}
              onChange={(e) => setV((s) => ({ ...s, stock: Number(e.target.value.replace(/\D/g, "")) || 0 }))} error={fields.stock} />
          </div>
          <Select label={t("sh.delivery")} value={v.delivery ?? "pickup"} onChange={(e) => setV((s) => ({ ...s, delivery: e.target.value as "pickup" | "promo" }))} hint={v.delivery === "promo" ? t("sh.deliveryPromoHint") : t("sh.deliveryPickupHint")}>
            <option value="pickup">{t("sh.delivery.pickup")}</option>
            <option value="promo">{t("sh.delivery.promo")}</option>
          </Select>
          <Select label={t("sh.kind")} value={v.kind} onChange={(e) => setV((s) => ({ ...s, kind: e.target.value as ShopItem["kind"] }))}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`sh.kind.${k}`)}</option>)}
          </Select>
          <Checkbox checked={v.active} onChange={(x) => setV((s) => ({ ...s, active: x }))}>{t("sh.active")}</Checkbox>
        </div>
      </div>
    </Dialog>
  );
}

/** Partner promo codes of one item: add (one per line), see which were issued, delete unused ones. */
function PromoCodesDialog({ item, onClose }: { item: { id: string; title: string }; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.adminPromoCodes(item.id), [item.id]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const free = (q.data ?? []).filter((c) => !c.orderId).length;
  return (
    <Dialog open onClose={onClose} wide title={t("sh.codesTitle", { title: item.title })}>
      <div className="stack g16">
        <p className="t-small secondary">{t("sh.codesBody")}</p>
        <TextArea label={t("sh.codesAdd")} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"WRFX-7Q2K-BOOK\nWRFX-9M4D-BOOK"} error={err ?? undefined} spellCheck={false} />
        <div className="row g8">
          <Button variant="primary" icon="plus" loading={busy} disabled={!text.trim()} onClick={async () => {
            setBusy(true); setErr(null);
            try { const r = await api.addPromoCodes(item.id, text); setText(""); toast(t("sh.codesAdded", { n: r.added, skipped: r.skipped })); }
            catch (e) { setErr(e instanceof ValidationError ? Object.values(e.fields)[0] : errText(e)); } finally { setBusy(false); }
          }}>{t("sh.codesSave")}</Button>
          <span className="t-small secondary">{t("sh.codesFree", { n: free, total: q.data?.length ?? 0 })}</span>
        </div>
        {!q.data ? <Skeleton rows={2} /> : q.data.length > 0 && (
          <div className="card rows" style={{ maxHeight: 300, overflow: "auto" }}>
            {q.data.map((c) => (
              <div key={c.id} className="row-item t-small">
                <code className="grow">{c.code}</code>
                {c.orderId ? <span className="secondary">{c.buyer} · {c.issuedAt ? f.date(c.issuedAt) : ""}</span> : <Status tone="ok">{t("sh.codeFree")}</Status>}
                {!c.orderId && <Button size="sm" variant="ghost" iconOnly icon="trash" aria-label={t("a.delete")} onClick={async () => { try { await api.deletePromoCode(c.id); } catch (e) { toast(errText(e), "error"); } }} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

const NEXT: Record<Order["status"], Order["status"][]> = { placed: ["processing", "fulfilled", "cancelled"], processing: ["fulfilled", "cancelled"], fulfilled: [], cancelled: [] };
const TONE: Record<Order["status"], "ok" | "bad" | "info" | "warn"> = { placed: "warn", processing: "info", fulfilled: "ok", cancelled: "bad" };

export function AdminShop() {
  const { t, lang } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.adminShop());
  const [tab, setTab] = useState<"items" | "orders">("items");
  const [edit, setEdit] = useState<(ShopItemInput & { id?: string }) | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [change, setChange] = useState<{ id: string; code: string; status: Order["status"] } | null>(null);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [codes, setCodes] = useState<{ id: string; title: string } | null>(null);

  if (!q.data) return <Skeleton rows={4} />;
  const { items, orders } = q.data;
  const open = orders.filter((o) => o.status === "placed" || o.status === "processing");
  const shown = filter === "open" ? open : orders;

  return (
    <div className="stack g20">
      <Tabs value={tab} onChange={setTab} items={[{ value: "items", label: t("sh.items"), count: items.length }, { value: "orders", label: t("sh.orders"), count: open.length }]} />

      {tab === "items" && (
        <>
          <div className="row between wrap g12">
            <p className="t-small secondary">{t("ad.shopSub")}</p>
            <div className="row g8 wrap">
              <Button icon="upload" onClick={async () => { try { await api.publishCatalog(); toast(t("ad.catalogPublished")); } catch (e) { toast(errText(e), "error"); } }}>{t("shop.publish")}</Button>
              <Button variant="primary" icon="plus" onClick={() => setEdit(blank())}>{t("sh.add")}</Button>
            </div>
          </div>
          {items.length === 0 ? <div className="card"><Empty icon="bag" title={t("shop.empty")} /></div> : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
              {items.map((i) => (
                <article key={i.id} className="card stack g8" style={{ padding: 12, opacity: i.active ? 1 : 0.6 }}>
                  <ShopArt art={i.art} image={i.image} />
                  <span style={{ fontWeight: 500 }}>{i.title[lang] || i.title.uz}</span>
                  <span className="row between t-small"><Coins value={i.price} size={14} /><span className={i.stock ? "muted" : "danger-text"}>{t("ad.stock", { n: i.stock })}</span></span>
                  <span className="row between t-small secondary"><span>{t("sh.sold", { n: i.sold })}</span>{!i.active ? <Status tone="neutral">{t("sh.hidden")}</Status> : i.delivery === "promo" ? <Status tone="info">{t("sh.delivery.promo")}</Status> : null}</span>
                  <div className="row g8">
                    <Button size="sm" icon="edit" onClick={() => setEdit({ id: i.id, title: i.title, description: i.description, price: i.price, stock: i.stock, kind: i.kind, art: i.art, active: i.active, image: i.image ?? null, delivery: i.delivery ?? "pickup" })}>{t("chat.edit")}</Button>
                    {i.delivery === "promo" && <Button size="sm" icon="ticket" onClick={() => setCodes({ id: i.id, title: i.title[lang] || i.title.uz })}>{t("sh.codes")}</Button>}
                    <Button size="sm" variant="ghost" icon="trash" iconOnly aria-label={t("chat.delete")} onClick={() => setDel(i.id)} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "orders" && (
        <>
          <div className="row between g12 wrap">
            <Segmented label={t("sh.filter")} value={filter} onChange={setFilter} items={[{ value: "open", label: t("sh.open") }, { value: "all", label: t("sh.all") }]} />
            {open.some((o) => items.find((i) => i.id === o.itemId)?.delivery === "promo") && (
              <Button icon="ticket" onClick={async () => { try { const r = await api.issueWaitingCodes(); toast(t("sh.issued", { n: r.issued })); } catch (e) { toast(errText(e), "error"); } }}>{t("sh.issueWaiting")}</Button>
            )}
          </div>
          {shown.length === 0 ? <div className="card"><Empty icon="bag" title={t("shop.noOrders")} /></div> : (
            <div className="card rows">
              {shown.map((o) => (
                <div key={o.id} className="row-item wrap" style={{ rowGap: 8 }}>
                  <span className="stack grow" style={{ minWidth: 180 }}>
                    <span style={{ fontWeight: 500 }}>{o.itemTitle}</span>
                    <span className="t-small secondary">{o.buyer} · {o.buyerEmail} · {f.dayTime(o.createdAt)}</span>
                    {o.note && <span className="t-small secondary">{o.note}</span>}
                    {o.promoCode && <span className="t-small row g4"><Icon name="ticket" size={14} /><code>{o.promoCode}</code></span>}
                  </span>
                  <span className="t-meta">{o.code}</span>
                  <Coins value={o.price} size={14} />
                  <Status tone={TONE[o.status]}>{t(`shop.st.${o.status}`)}</Status>
                  {NEXT[o.status].length > 0 && (
                    <Select aria-label={t("sh.changeStatus")} value="" onChange={(e) => { const st = e.target.value as Order["status"]; if (st) { setNote(""); setChange({ id: o.id, code: o.code, status: st }); } }} style={{ width: "auto" }}>
                      <option value="">{t("sh.changeStatus")}</option>
                      {NEXT[o.status].map((s) => <option key={s} value={s}>{t(`shop.st.${s}`)}</option>)}
                    </Select>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {edit && <ItemDialog key={edit.id ?? "new"} item={edit} onClose={() => setEdit(null)} />}
      {codes && <PromoCodesDialog item={codes} onClose={() => setCodes(null)} />}
      <Dialog open={Boolean(del)} onClose={() => setDel(null)} title={t("sh.deleteTitle")} footer={<>
        <Button variant="ghost" onClick={() => setDel(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={async () => { const id = del!; setDel(null); try { await api.deleteShopItem(id); toast(t("sh.deleted")); } catch (e) { toast(errText(e), "error"); } }}>{t("chat.delete")}</Button>
      </>}>
        <p className="t-small secondary">{t("sh.deleteBody")}</p>
      </Dialog>
      <Dialog open={Boolean(change)} onClose={() => setChange(null)} title={change ? t("sh.statusTitle", { code: change.code, status: t(`shop.st.${change.status}`) }) : ""} footer={<>
        <Button variant="ghost" onClick={() => setChange(null)}>{t("a.cancel")}</Button>
        <Button variant={change?.status === "cancelled" ? "danger" : "primary"} onClick={async () => {
          const c = change!; setChange(null);
          try { await api.setOrderStatus(c.id, c.status, note); toast(t("sh.statusSaved")); } catch (e) { toast(errText(e), "error"); }
        }}>{t("a.save")}</Button>
      </>}>
        <div className="stack g12">
          {change?.status === "cancelled" && <p className="t-small secondary row g8"><Icon name="info" size={16} />{t("sh.refundNote")}</p>}
          <TextArea label={t("sh.note")} hint={t("sh.noteHint")} rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}
