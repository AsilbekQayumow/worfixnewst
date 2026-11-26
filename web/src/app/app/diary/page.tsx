"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHead } from "@/components/shell";
import { Icon } from "@/components/icons";
import { Button, CategoryTag, Empty, Segmented, Select, Skeleton, Stat, TextArea, useToast } from "@/components/ui";
import { CATEGORIES, type Category } from "@/lib/domain/types";
import { DIARY } from "@/lib/domain/diary";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api6 } from "@/lib/store/api6";
import { useApi } from "@/lib/store/hooks";

/** v6 · feature 5: the personal diary — private by default, built from verified results only. */
export default function DiaryPage() {
  const { t } = useI18n();
  const f = useFmt();
  const [year, setYear] = useState(new Date().getFullYear());
  const [cat, setCat] = useState<Category | "">("");
  const [mode, setMode] = useState<"all" | "solo" | "team">("all");
  const q = useApi(() => api6.diary(year), [year]);
  const d = q.data;
  const monthShort = (i: number) => f.month(new Date(Date.UTC(2026, i, 15))).slice(0, 3);
  const max = Math.max(1, ...(d?.summary.months ?? [0]));
  const months = (d?.months ?? []).map((g) => ({ ...g, items: g.items.filter((e) => (!cat || e.category === cat) && (mode === "all" || (mode === "team") === e.team)) })).filter((g) => g.items.length);
  return (
    <div className="stack g24 enter print-area diary">
      <PageHead title={t("di.title")} sub={t("di.sub")} actions={<Button icon="printer" onClick={() => window.print()} className="no-print">{t("di.pdf")}</Button>} />
      {!d ? <Skeleton rows={3} height={100} /> : (
        <>
          <p className="print-only t-h2">{t("di.printTitle", { name: d.name, year })}</p>
          <section className="grid cols-4">
            <Stat label={t("di.hours")} value={<span className="num">{f.num(d.summary.hours)}</span>} />
            <Stat label={t("di.missions")} value={<span className="num">{d.summary.missions}</span>} />
            <Stat label={t("di.impact")} value={<span className="num">{f.num(d.summary.impact)}</span>} />
            <Stat label={t("di.streak")} value={<span className="num">{d.streak}</span>} sub={t("di.days")} />
          </section>
          <section className="card pad stack g12" aria-label={t("di.byMonth")}>
            <div className="row between g8"><h2 className="t-h3">{t("di.byMonth")}</h2><span className="t-meta">{t("di.walks", { n: d.walks })}</span></div>
            <div className="di-bars" role="img" aria-label={d.summary.months.map((h, i) => `${monthShort(i)}: ${h}`).join(", ")}>
              {d.summary.months.map((h, i) => (
                <span key={i} className="di-bar" data-on={h > 0 || undefined}>
                  <span style={{ height: `${Math.max(4, (h / max) * 100)}%` }} />
                  <span className="t-meta">{monthShort(i)}</span>
                </span>
              ))}
            </div>
          </section>
          <div className="row g12 wrap no-print">
            <Select aria-label={t("di.year")} value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
              {d.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
            <Select aria-label={t("di.category")} value={cat} onChange={(e) => setCat(e.target.value as Category | "")}>
              <option value="">{t("di.allCategories")}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
            </Select>
            <Segmented value={mode} onChange={setMode} label={t("di.mode")} items={[{ value: "all", label: t("di.all") }, { value: "solo", label: t("di.solo") }, { value: "team", label: t("di.team") }]} />
          </div>
          {months.length === 0 ? (
            <div className="card"><Empty icon="book" title={t("di.empty")} body={t("di.emptyBody")} action={<Link className="btn btn-primary" href="/app/map?view=list&tab=explore">{t("di.find")}</Link>} /></div>
          ) : months.map((g) => (
            <section key={g.month} className="stack g12">
              <h2 className="t-h3">{f.month(new Date(`${g.month}-15T12:00:00Z`))} {g.month.slice(0, 4)}</h2>
              {g.items.map((e) => <Entry key={e.id} e={e} />)}
            </section>
          ))}
          <p className="t-small muted row g8 no-print"><Icon name="lock" size={14} />{t("di.private")}</p>
        </>
      )}
    </div>
  );
}

function Entry({ e }: { e: Awaited<ReturnType<typeof api6.diary>>["months"][number]["items"][number] }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(e.note);
  const [busy, setBusy] = useState(false);
  return (
    <article className="card pad row g16 di-entry" style={{ alignItems: "flex-start" }}>
      {e.photo ? <img src={e.photo} alt="" className="di-thumb no-print" loading="lazy" /> : <span className="di-thumb di-thumb-empty no-print"><Icon name="leaf" size={20} /></span>}
      <div className="stack g8 grow" style={{ minWidth: 0 }}>
        <div className="row between g8 wrap">
          <Link href={`/app/missions/${e.missionId}`} className="t-h3">{e.title}</Link>
          <CategoryTag category={e.category} />
        </div>
        <span className="t-small secondary row g12 wrap">
          <span>{f.date(e.at)}</span><span>{e.location}</span><span className="num">{t("u.hours", { n: e.hours })}</span>
          {e.mates.length > 0 && <span className="row g4"><Icon name="users" size={14} />{e.mates.join(", ")}</span>}
        </span>
        {edit ? (
          <div className="stack g8 no-print">
            <TextArea aria-label={t("di.note")} value={note} maxLength={DIARY.noteMax} rows={2} onChange={(x) => setNote(x.target.value)} hint={`${note.length}/${DIARY.noteMax}`} />
            <div className="row g8">
              <Button size="sm" variant="primary" loading={busy} onClick={async () => {
                setBusy(true);
                try { await api6.saveDiaryNote(e.id, note); setEdit(false); } catch (x) { toast(errText(x), "error"); } finally { setBusy(false); }
              }}>{t("a.save")}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNote(e.note); setEdit(false); }}>{t("a.cancel")}</Button>
            </div>
          </div>
        ) : e.note ? (
          <button type="button" className="di-note" onClick={() => setEdit(true)}>{e.note}</button>
        ) : (
          <button type="button" className="link t-small no-print" style={{ width: "fit-content" }} onClick={() => setEdit(true)}>{t("di.addNote")}</button>
        )}
      </div>
    </article>
  );
}
