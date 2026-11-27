"use client";
/** v7 game UI: daily chest, quests, quiz, season pass, looks, mahalla battle, duels, badges, impact. */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Action } from "@/lib/game/engine";
import type { QuizAsk } from "@/lib/game/quiz";
import { cosmetic, FLAG_ICON, type Cosmetic, type LookSlot } from "@/lib/game/season";
import type { DuelMetric } from "@/lib/game/league";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api7, type GameView, type PlayResult } from "@/lib/store/api7";
import { Avatar, Button, ButtonLink, Coins, Dialog, Progress, Select, Status, useToast } from "./ui";
import { Icon, type IconName } from "./icons";

type Lang = "uz" | "ru" | "en";

/* ── art ── */
const CHEST_TONE: Record<string, string> = { common: "var(--sun)", quiz: "var(--sky)", rare: "var(--berry)", legendary: "var(--flame)", boost: "var(--leaf, #2f9e44)", flash: "var(--sky)" };
export function ChestArt({ kind = "common", size = 40, open = false }: { kind?: string; size?: number; open?: boolean }) {
  const c = CHEST_TONE[kind] ?? CHEST_TONE.common;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="chest-art" data-kind={kind} data-open={open || undefined}>
      <rect x="6" y="20" width="36" height="20" rx="4" fill={c} stroke="rgb(0 0 0 / .35)" strokeWidth="2" />
      <path d={open ? "M6 20 L10 8 H38 L42 20 Z" : "M6 21 C6 12 12 9 24 9 C36 9 42 12 42 21 Z"} fill={c} stroke="rgb(0 0 0 / .35)" strokeWidth="2" style={{ filter: "brightness(1.12)" }} />
      <rect x="21" y="18" width="6" height="9" rx="1.5" fill="#fff" stroke="rgb(0 0 0 / .35)" strokeWidth="1.5" />
      {kind === "quiz" && <text x="24" y="37" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">?</text>}
      {kind === "legendary" && <path d="M24 30 l2 4 4 .5 -3 3 .8 4 -3.8-2 -3.8 2 .8-4 -3-3 4-.5z" fill="#fff" />}
    </svg>
  );
}

export function LookAvatar({ name, src, size = 40, frame }: { name: string; src: string | null; size?: number; frame?: string | null }) {
  return <span className="look-avatar" data-frame={frame ?? undefined} style={{ ["--s" as string]: `${size}px` }}><Avatar name={name} src={src} size={size} /></span>;
}
export function LookTitle({ id }: { id?: string | null }) {
  const { t } = useI18n();
  if (!id) return null;
  return <span className="look-title" data-rarity={cosmetic(id)?.rarity}>{t(`cos.${id}`)}</span>;
}

/* ── doing an action with a toast ── */
export function useAct() {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, a: Action, after?: (r: PlayResult) => void) => {
    setBusy(key);
    try {
      const r = await api7.act(a);
      if (r.coins > 0 || r.xp > 0) toast([r.xp > 0 ? `+${r.xp} XP` : "", r.coins > 0 ? `+${r.coins} Fixcoin` : ""].filter(Boolean).join(" · "));
      else if (r.coins < 0) toast(t("g.spent", { coins: -r.coins }));
      after?.(r);
      return r;
    } catch (e) { toast(errText(e), "error"); return null; } finally { setBusy(null); }
  };
  return { run, busy };
}

/* ── daily chest ── */
export function DailyChest({ g, compact }: { g: GameView; compact?: boolean }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const d = g.daily;
  return (
    <div className="daily7" data-done={d.done || undefined}>
      <div className="daily7-art"><ChestArt kind={d.next.week ? "legendary" : "common"} size={compact ? 52 : 64} open={d.done} /></div>
      <div className="stack g4 grow" style={{ minWidth: 0 }}>
        <strong>{d.done ? t("g.daily.done") : t("g.daily.title")}</strong>
        <span className="t-small secondary">
          {d.streak > 0 ? t("g.daily.streak", { n: d.streak }) : t("g.daily.start")}
          {!d.done && <> · {t("g.daily.next", { xp: d.next.xp, coins: d.next.coins })}</>}
        </span>
        <StreakDots n={d.streak} />
      </div>
      {d.canSave && !d.done ? (
        <div className="stack g4" style={{ alignItems: "flex-end" }}>
          <Button size="sm" variant="primary" icon="flame" loading={busy === "save"} onClick={() => run("save", { t: "save" })}>{t("g.save", { n: d.saveCost })}</Button>
          <span className="t-small muted">{t("g.saveHint", { n: d.lost })}</span>
        </div>
      ) : (
        <Button size={compact ? "sm" : "md"} variant="primary" disabled={d.done} loading={busy === "daily"} onClick={() => run("daily", { t: "daily" })}>{d.done ? t("g.daily.tomorrow") : t("g.daily.open")}</Button>
      )}
    </div>
  );
}
function StreakDots({ n }: { n: number }) {
  const shown = n % 7 === 0 && n > 0 ? 7 : n % 7;
  return <span className="streak-dots" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} data-on={i < shown || undefined} data-big={i === 6 || undefined} />)}</span>;
}

/* ── quests ── */
const METRIC_ICON: Record<string, IconName> = { walkKm: "footprints", areaM2: "map", joined: "userPlus", done: "checkCircle", chests: "bag", quizRight: "book", events: "zap", daily: "flame" };
export function QuestList({ g, which = "both" }: { g: GameView; which?: "daily" | "weekly" | "both" }) {
  const { t } = useI18n();
  const f = useFmt();
  const { run, busy } = useAct();
  const row = (q: GameView["quests"]["daily"][number]) => (
    <div key={q.id} className="quest7" data-done={q.claimed || undefined}>
      <span className="quest7-ic"><Icon name={METRIC_ICON[q.metric] ?? "target"} size={18} /></span>
      <span className="stack g4 grow" style={{ minWidth: 0 }}>
        <span className="row between g8" style={{ alignItems: "flex-start" }}><span className="quest7-t">{t(`q.${q.metric}`, { n: f.num(q.goal) })}</span><span className="t-small num secondary">{f.num(Math.min(q.value, q.goal))}/{f.num(q.goal)}</span></span>
        <Progress value={Math.min(1, q.value / q.goal)} />
      </span>
      {q.claimed ? <Status tone="ok">{t("q.claimed")}</Status>
        : <Button size="sm" variant={q.done ? "primary" : "ghost"} disabled={!q.done} loading={busy === q.id} onClick={() => run(q.id, { t: "quest", id: q.id })}>+{q.xp} XP</Button>}
    </div>
  );
  return (
    <div className="stack g12">
      {which !== "weekly" && <div className="stack g8"><div className="row between"><h3 className="t-h3">{t("q.dailyH")}</h3><Countdown to={g.quests.dayEnds} /></div>{g.quests.daily.map(row)}</div>}
      {which !== "daily" && <div className="stack g8"><div className="row between"><h3 className="t-h3">{t("q.weeklyH")}</h3><Countdown to={g.quests.weekEnds} /></div>{g.quests.weekly.map(row)}</div>}
    </div>
  );
}
export function Countdown({ to, short }: { to: number; short?: boolean }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id); }, []);
  const left = Math.max(0, to - now);
  const h = Math.floor(left / 3_600_000), m = Math.floor((left % 3_600_000) / 60_000);
  const d = Math.floor(h / 24);
  const txt = d > 0 ? t("g.leftD", { d, h: h % 24 }) : t("g.leftH", { h, m });
  return <span className="t-small muted num">{short ? txt : t("g.left", { t: txt })}</span>;
}

/* ── home card ── */
export function GameHomeCard({ g }: { g: GameView }) {
  const { t } = useI18n();
  const open = g.quests.daily.filter((q) => !q.claimed);
  return (
    <section className="card pad game-home stack g16">
      <div className="row between g8"><h2 className="t-h3 row g8"><Icon name="target" size={18} />{t("g.today")}</h2><Link href="/app/play" className="t-small link">{t("g.all")}</Link></div>
      <DailyChest g={g} compact />
      {g.boostUntil && <BoostBar until={g.boostUntil} />}
      <div className="stack g8">
        {open.slice(0, 3).map((q) => (
          <Link key={q.id} href="/app/play" className="quest7 mini">
            <span className="quest7-ic"><Icon name={METRIC_ICON[q.metric] ?? "target"} size={16} /></span>
            <span className="stack g4 grow" style={{ minWidth: 0 }}><span className="t-small truncate">{t(`q.${q.metric}`, { n: q.goal })}</span><Progress value={Math.min(1, q.value / q.goal)} /></span>
            {q.done && <Status tone="ok">{t("q.ready")}</Status>}
          </Link>
        ))}
        {!open.length && <p className="t-small secondary">{t("q.allDone")}</p>}
      </div>
      <div className="row g8 wrap">
        <ButtonLink href="/app/map" size="sm" icon="map">{t("g.findChests")}</ButtonLink>
        <ButtonLink href="/app/play?tab=season" size="sm" variant="ghost">{t("g.seasonTier", { n: g.season.tier, of: g.season.tiers })}</ButtonLink>
      </div>
    </section>
  );
}
export function BoostBar({ until }: { until: string }) {
  const { t } = useI18n();
  return <div className="boost7 row g8"><Icon name="zap" size={16} /><strong>{t("g.boost")}</strong><Countdown to={Date.parse(until)} short /></div>;
}

/* ── quiz ── */
export function QuizDialog({ quiz, onClose }: { quiz: QuizAsk | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { run, busy } = useAct();
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<{ right: boolean; correct: number } | null>(null);
  useEffect(() => { setPicked(null); setResult(null); }, [quiz?.qid]);
  if (!quiz) return null;
  const L = (lang === "ru" || lang === "en" ? lang : "uz") as Lang;
  const answer = (i: number) => {
    setPicked(i);
    void run("answer", { t: "answer", choice: i }, (r) => setResult({ right: Boolean(r.right), correct: r.correct ?? -1 }));
  };
  return (
    <Dialog open onClose={onClose} title={t("quiz.title")} footer={result ? <Button variant="primary" onClick={onClose}>{t("quiz.close")}</Button> : <span className="t-small muted">{t("quiz.hint")}</span>}>
      <div className="stack g16 quiz7">
        <span className="t-small secondary row g8"><Icon name="book" size={14} />{t(`quiz.cat.${quiz.cat}`)}</span>
        <p className="t-h3">{quiz.q[L]}</p>
        <div className="stack g8" role="radiogroup" aria-label={quiz.q[L]}>
          {quiz.options.map((o, i) => (
            <button key={i} type="button" className="quiz7-opt" disabled={picked !== null || busy !== null} onClick={() => answer(i)}
              data-picked={picked === i || undefined} data-right={result && result.correct === i ? true : undefined} data-wrong={result && picked === i && !result.right ? true : undefined}>
              <span className="quiz7-l">{"ABCD"[i]}</span><span>{o[L]}</span>
            </button>
          ))}
        </div>
        {result && <p className="row g8" style={{ fontWeight: 700 }}><Icon name={result.right ? "checkCircle" : "xCircle"} size={18} />{result.right ? t("quiz.right") : t("quiz.wrong")}</p>}
      </div>
    </Dialog>
  );
}

/* ── season pass ── */
export function SeasonPass({ g }: { g: GameView }) {
  const { t } = useI18n();
  const f = useFmt();
  const { run, busy } = useAct();
  const s = g.season;
  const span = s.nextAt ? Math.max(1, s.nextAt - s.prevAt) : 1;
  return (
    <div className="stack g16">
      <div className="card pad stack g8 season7-head">
        <div className="row between g8 wrap"><strong className="t-h3">{t("sp.title", { m: f.month(new Date(`${s.id}-15T00:00:00Z`)).replace(/^./, (c) => c.toUpperCase()) })}</strong><span className="num">{f.num(s.xp)} XP</span></div>
        <Progress value={s.nextAt ? (s.xp - s.prevAt) / span : 1} />
        <span className="t-small secondary">{s.nextAt ? t("sp.next", { n: s.tier + 1, xp: f.num(s.nextAt - s.xp) }) : t("sp.maxed")}</span>
        <span className="t-small muted">{t("sp.how")}</span>
      </div>
      <ol className="season7">
        {s.rewards.map((r) => {
          const reached = r.tier <= s.tier, claimed = s.claimed.includes(r.tier);
          const item = r.item ? cosmetic(r.item) : null;
          return (
            <li key={r.tier} className="season7-tier" data-reached={reached || undefined} data-claimed={claimed || undefined} data-item={item ? item.rarity : undefined}>
              <span className="season7-n num">{r.tier}</span>
              <span className="season7-r">{item ? <CosmeticChip c={item} /> : <Coins value={r.coins} size={16} />}</span>
              {claimed ? <Icon name="check" size={16} /> : reached ? <Button size="sm" variant="primary" loading={busy === `t${r.tier}`} onClick={() => run(`t${r.tier}`, { t: "tier", n: r.tier })}>{t("sp.claim")}</Button> : <Icon name="lock" size={14} className="muted" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CosmeticChip({ c }: { c: Cosmetic }) {
  const { t } = useI18n();
  return <span className="cos7" data-rarity={c.rarity} data-slot={c.slot}>{c.slot === "flag" ? <Icon name={(FLAG_ICON[c.id] ?? "flag") as IconName} size={14} /> : c.slot === "frame" ? <span className="cos7-ring" data-frame={c.id} /> : c.slot === "pattern" ? <span className="cos7-line" data-pattern={c.id} /> : <Icon name="award" size={14} />}{t(`cos.${c.id}`)}</span>;
}

/* ── looks: buy and wear ── */
export function LookLocker({ g }: { g: GameView }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const slots: LookSlot[] = ["frame", "title", "pattern", "flag"];
  return (
    <div className="stack g20">
      <div className="card pad row g16 wrap look7-preview">
        <LookAvatar name={g.me.name} src={g.me.avatar} size={56} frame={g.look.frame} />
        <div className="stack g4"><LookTitle id={g.look.title} /><span className="t-small secondary">{t("lk.preview")}</span></div>
        <Coins value={g.me.points} size={18} />
      </div>
      {slots.map((slot) => (
        <section key={slot} className="stack g8">
          <h3 className="t-h3">{t(`lk.${slot}`)}</h3>
          <div className="look7-grid">
            {g.cosmetics.filter((c) => c.slot === slot).map((c) => {
              const owned = g.owned.includes(c.id), on = g.look[slot] === c.id;
              return (
                <div key={c.id} className="look7-item card" data-on={on || undefined} data-rarity={c.rarity}>
                  <CosmeticChip c={c} />
                  <span className="t-small muted">{t(`rar.${c.rarity}`)}</span>
                  {owned ? (
                    <Button size="sm" variant={on ? "ghost" : "secondary"} loading={busy === c.id} onClick={() => run(c.id, { t: "equip", slot, id: on ? null : c.id })}>{on ? t("lk.off") : t("lk.on")}</Button>
                  ) : c.price !== null ? (
                    <Button size="sm" variant="primary" disabled={g.me.points < c.price} loading={busy === c.id} onClick={() => run(c.id, { t: "buy", id: c.id })}><Coins value={c.price} size={14} /></Button>
                  ) : <span className="t-small muted row g4"><Icon name="lock" size={12} />{t("lk.tier", { n: c.tier ?? 0 })}</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── mahalla battle ── */
export function BattlePanel({ g }: { g: GameView }) {
  const { t } = useI18n();
  const f = useFmt();
  const { run, busy } = useAct();
  if (!g.me.hasPlace) return <div className="card pad stack g8"><p>{t("bt.noPlace")}</p><ButtonLink href="/app/settings" variant="primary" size="sm">{t("bt.setPlace")}</ButtonLink></div>;
  const b = g.battle, lb = g.lastBattle;
  const mine = b?.rows.find((r) => r.key === b.mine);
  const rival = mine?.rival ? b!.rows.find((r) => r.key === mine.rival) : null;
  return (
    <div className="stack g16">
      {lb?.claim && (
        <div className="card pad row between g12 wrap battle7-win"><span className="row g8"><Icon name="trophy" size={20} /><strong>{t("bt.won")}</strong></span><Button variant="primary" size="sm" loading={busy === "battle"} onClick={() => run("battle", { t: "battle", week: lb.week })}>{t("bt.claim")}</Button></div>
      )}
      <div className="card pad stack g12">
        <div className="row between g8 wrap"><h3 className="t-h3">{t("bt.title", { d: g.me.district })}</h3><Countdown to={g.quests.weekEnds} /></div>
        <p className="t-small secondary">{t("bt.how")}</p>
        {mine && (
          <div className="battle7-vs">
            <div className="stack g4"><span className="t-small muted">{t("bt.you")}</span><strong className="truncate">{mine.name}</strong><span className="t-h2 num">{f.num(mine.score)}</span></div>
            <span className="battle7-x">VS</span>
            <div className="stack g4" style={{ textAlign: "right" }}><span className="t-small muted">{t("bt.rival")}</span><strong className="truncate">{rival?.name ?? t("bt.noRival")}</strong><span className="t-h2 num">{rival ? f.num(rival.score) : "—"}</span></div>
          </div>
        )}
      </div>
      <div className="card rows">
        {(b?.rows ?? []).map((r, i) => (
          <div key={r.key} className="row-item battle7-row" data-me={r.key === b!.mine || undefined}>
            <span className="num battle7-rank">{i + 1}</span>
            <span className="stack grow" style={{ minWidth: 0 }}><span className="truncate" style={{ fontWeight: 600 }}>{r.name}</span><span className="t-small secondary">{t("bt.row", { m: r.members, a: r.active, area: f.num(r.area), h: r.hours })}</span></span>
            <span className="num" style={{ fontWeight: 700 }}>{f.num(r.score)}</span>
          </div>
        ))}
        {!b?.rows.length && <p className="pad t-small secondary">{t("bt.empty")}</p>}
      </div>
    </div>
  );
}

/* ── duels ── */
export function DuelsPanel({ g }: { g: GameView }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const { run, busy } = useAct();
  const [friend, setFriend] = useState("");
  const [metric, setMetric] = useState<DuelMetric>("area");
  const [sending, setSending] = useState(false);
  const fmt = (m: DuelMetric, v: number) => (m === "area" ? `${f.num(v)} m²` : m === "walkKm" ? `${v} km` : `${v} ${t("du.h")}`);
  return (
    <div className="stack g16">
      <div className="card pad stack g12">
        <h3 className="t-h3">{t("du.new")}</h3>
        {g.friends.length ? (
          <div className="grid cols-3 duel7-form">
            <Select label={t("du.friend")} value={friend} onChange={(e) => setFriend(e.target.value)}><option value="">{t("pl.choose")}</option>{g.friends.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
            <Select label={t("du.metric")} value={metric} onChange={(e) => setMetric(e.target.value as DuelMetric)}>{(["area", "walkKm", "hours"] as const).map((m) => <option key={m} value={m}>{t(`du.m.${m}`)}</option>)}</Select>
            <Button variant="primary" disabled={!friend} loading={sending} onClick={async () => {
              setSending(true);
              try { await api7.challenge(friend, metric); toast(t("du.sent")); setFriend(""); } catch (e) { toast(errText(e), "error"); } finally { setSending(false); }
            }}>{t("du.send")}</Button>
          </div>
        ) : <p className="t-small secondary">{t("du.noFriends")} <Link className="link" href="/app/friends">{t("du.findFriends")}</Link></p>}
        <p className="t-small muted">{t("du.how")}</p>
      </div>
      {g.duels.map((d) => {
        const me = g.me.id, them = d.other.id;
        const a = d.scores[me] ?? 0, b = d.scores[them] ?? 0;
        return (
          <div key={d.id} className="card pad stack g12 duel7" data-status={d.status}>
            <div className="row between g8 wrap">
              <span className="row g8"><Avatar name={d.other.name} src={d.other.avatar} size={32} /><strong>{d.other.name}</strong></span>
              <span className="t-small secondary">{t(`du.m.${d.metric}`)} · {t(`du.s.${d.status}`)}</span>
            </div>
            {d.status === "active" || d.status === "done" ? (
              <div className="duel7-bar">
                <span className="num">{fmt(d.metric, a)}</span>
                <span className="duel7-track"><i style={{ width: `${a + b > 0 ? (a / (a + b)) * 100 : 50}%` }} /></span>
                <span className="num">{fmt(d.metric, b)}</span>
              </div>
            ) : null}
            <div className="row g8 wrap">
              {d.status === "pending" && !d.mine && <><Button size="sm" variant="primary" onClick={() => api7.answerDuel(d.id, true).catch((e) => toast(errText(e), "error"))}>{t("du.accept")}</Button><Button size="sm" variant="ghost" onClick={() => api7.answerDuel(d.id, false).catch((e) => toast(errText(e), "error"))}>{t("du.decline")}</Button></>}
              {d.status === "pending" && d.mine && <><span className="t-small secondary">{t("du.waiting")}</span><Button size="sm" variant="ghost" onClick={() => api7.cancelDuel(d.id)}>{t("du.cancel")}</Button></>}
              {d.status === "active" && d.end && <Countdown to={Date.parse(d.end)} />}
              {d.status === "done" && <strong>{d.winner === me ? t("du.youWon") : d.winner ? t("du.youLost") : t("du.draw")}</strong>}
              {d.claim && <Button size="sm" variant="primary" loading={busy === d.id} onClick={() => run(d.id, { t: "duel", id: d.id })}>{t("du.claim")}</Button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── badges shelf ── */
export function BadgeShelf({ items, title }: { items: { id: string; rarity: string; done: boolean; value: number; goal: number; label: ReactNode }[]; title?: ReactNode }) {
  const { t } = useI18n();
  const order = ["legendary", "rare", "common"];
  return (
    <div className="stack g16">
      {title}
      {order.map((r) => {
        const list = items.filter((x) => x.rarity === r);
        if (!list.length) return null;
        const got = list.filter((x) => x.done).length;
        return (
          <section key={r} className="stack g8">
            <h3 className="t-h3 row g8"><span className="rar7-dot" data-rarity={r} />{t(`rar.${r}`)} <span className="t-small muted num">{got}/{list.length}</span></h3>
            <div className="shelf7">
              {list.map((b) => (
                <div key={b.id} className="shelf7-item" data-done={b.done || undefined} data-rarity={r} title={`${b.value}/${b.goal}`}>
                  <span className="shelf7-medal"><Icon name={b.done ? "award" : "lock"} size={20} /></span>
                  <span className="t-small shelf7-name">{b.label}</span>
                  {!b.done && <span className="shelf7-prog"><i style={{ width: `${Math.round((b.value / b.goal) * 100)}%` }} /></span>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
export function GameBadgeShelf({ g }: { g: GameView }) {
  const { t } = useI18n();
  return <BadgeShelf items={g.badges.map((b) => ({ ...b, label: t(`bd.${b.family}`, { n: b.goal }) }))} />;
}

/* ── impact ── */
export function ImpactCounter({ items, title }: { items: [string, number][]; title?: string }) {
  const { t } = useI18n();
  const f = useFmt();
  if (!items.length) return null;
  return (
    <section className="card pad stack g12 impact7">
      <h2 className="t-h3 row g8"><Icon name="leaf" size={18} />{title ?? t("im.title")}</h2>
      <div className="impact7-grid">
        {items.slice(0, 6).map(([label, n]) => <div key={label} className="impact7-cell"><b className="num">{f.num(n)}</b><span className="t-small secondary">{label}</span></div>)}
      </div>
      <p className="t-small muted">{t("im.how")}</p>
    </section>
  );
}
