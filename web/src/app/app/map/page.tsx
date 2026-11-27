"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ICON, Icon } from "@/components/icons";
import { MissionsBoard } from "@/components/missions-board";
import { useMe } from "@/components/providers";
import { TerritoryMap, type MapArea, type MapMission, type MapSpawn } from "@/components/territory-map";
import { Avatar, Button, Dialog, Segmented, Skeleton, useToast } from "@/components/ui";
import { GroupMark } from "@/components/group-bits";
import { buzz, celebrate } from "@/lib/fx";
import { personColor } from "@/lib/map-colors";
import { distanceM, overlapShape, TERRITORY, type Shape } from "@/lib/domain/territory";
import { SeasonReplay } from "@/components/season-replay";
import type { GeoPoint } from "@/lib/domain/types";
import { useTracker } from "@/lib/geo/tracker";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { FIREBASE } from "@/lib/store/db";
import { useApi } from "@/lib/store/hooks";
import { api7 } from "@/lib/store/api7";
import { BoostBar, ChestArt, QuizDialog, useAct } from "@/components/game";
import { HeroPicker } from "@/components/winter/hero-picker";
import type { QuizAsk } from "@/lib/game/quiz";
import { SPAWN } from "@/lib/game/spawn";

type Data = NonNullable<Awaited<ReturnType<typeof api.territoryMap>>>;
type Capture = Awaited<ReturnType<typeof api.captureTerritory>>;
const INTRO_KEY = "worfix.map.intro";

/** v3.2: the Map menu — the territory game, with the mission lists one tap away. */
function MapMenu() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") === "list" ? "list" : "map";
  const setView = (v: "map" | "list") => router.replace(v === "list" ? "/app/map?view=list" : "/app/map", { scroll: false });
  if (view === "list") {
    return (
      <div className="stack g24 enter">
        <div className="page-head">
          <h1 className="t-h1">{t("tm.viewList")}</h1>
          <Segmented value={view} onChange={setView} label={t("tm.title")} items={[{ value: "map", label: <span className="row g8"><Icon name="map" size={16} />{t("tm.viewMap")}</span> }, { value: "list", label: <span className="row g8"><Icon name="list" size={16} />{t("tm.viewList")}</span> }]} />
        </div>
        <MissionsBoard embedded />
      </div>
    );
  }
  return <TerritoryGame onList={() => setView("list")} />;
}

function TerritoryGame({ onList }: { onList: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const router = useRouter();
  const { me } = useMe();
  const q = useApi(() => api.territoryMap());
  const myColor = me ? personColor(me.id, me.mapColor) : "#16a34a";
  // v5: in the app the phone records the walk itself and shows it on the lock screen.
  const walkLabels = useMemo(() => ({
    channel: t("nt.walkChannel"), title: t("nt.walkTitle"), distance: t("nt.walkDistance"), area: t("nt.walkArea"), hint: t("nt.walkHint"),
    toStart: t("nt.walkToStart", { d: "{d}" }), closed: t("nt.walkClosed"), stop: t("nt.walkStop"),
  }), [t]);
  const gps = useTracker({ color: myColor, labels: walkLabels });
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"missions" | "season">("missions");
  const [intro, setIntro] = useState(false);
  // v8: choose the 3D person you walk as
  const [heroOpen, setHeroOpen] = useState(false);
  const [flash, setFlash] = useState<Shape | null>(null);
  const [taken, setTaken] = useState<{ shape: Shape; color: string }[] | null>(null);
  const [replay, setReplay] = useState(false);
  const [focus, setFocus] = useState<{ point: GeoPoint; zoom?: number; key: string } | null>(null);
  const [result, setResult] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sheet, setSheet] = useState(false);
  // Design rec. 5: the sheet follows the finger on the grip and snaps open or closed by position and flick speed.
  const dragMoved = useRef(false);
  const drag = useRef<{ y: number; t: number; panel: HTMLElement; base: number } | null>(null);
  const sheetDrag = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      const panel = e.currentTarget.parentElement as HTMLElement;
      if (window.matchMedia("(min-width: 861px)").matches) return;
      const closed = panel.getBoundingClientRect().height - Number.parseFloat(getComputedStyle(panel).getPropertyValue("--peek") || "252");
      drag.current = { y: e.clientY, t: performance.now(), panel, base: sheet ? 0 : Math.max(0, closed) };
      dragMoved.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      panel.style.transition = "none";
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d) return;
      const dy = e.clientY - d.y;
      if (Math.abs(dy) > 4) dragMoved.current = true;
      d.panel.style.transform = `translateY(${Math.max(0, d.base + dy)}px)`;
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const dy = e.clientY - d.y;
      const v = dy / Math.max(1, performance.now() - d.t);
      d.panel.style.transition = "";
      d.panel.style.transform = "";
      if (!dragMoved.current) return;
      const open = Math.abs(v) > 0.5 ? v < 0 : d.base + dy < d.base / 2 + (sheet ? 120 : 0);
      setSheet(open);
    },
  };
  const closing = useRef(false);
  const capturing = gps.status !== "idle";

  useEffect(() => { try { if (!localStorage.getItem(INTRO_KEY)) setIntro(true); } catch { /* ignore */ } }, []);
  useEffect(() => { gps.locate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // App shortcut / widget "Walk a loop" (?walk=1): start right away.
  const params = useSearchParams();
  const autoWalk = useRef(false);
  useEffect(() => {
    if (params.get("walk") !== "1" || autoWalk.current || gps.status !== "idle" || !me) return;
    autoWalk.current = true;
    setIntro(false); // straight to the walk: no intro over it
    try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* ignore */ }
    router.replace("/app/map", { scroll: false });
    startCapture();
  }, [params, gps.status, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = q.data;
  const areas: MapArea[] = useMemo(() => (d?.areas ?? []).map((a) => ({
    id: a.id, shape: a.shape, relation: a.relation, name: a.name, color: personColor(a.userId, a.mapColor), pattern: a.pattern, flag: a.flag,
  })), [d]);
  const missions: MapMission[] = useMemo(() => (d?.missions ?? []).flatMap((m) => m.coordinates ? [{
    id: m.id, title: m.title, category: m.category, coordinates: m.coordinates, inMyArea: m.inMyArea, firstLook: Boolean(m.firstLookUntil), joined: m.joined,
  }] : []), [d]);
  const here = gps.me;
  const sorted = useMemo(() => [...(d?.missions ?? [])].sort((a, b) =>
    Number(b.inMyArea) - Number(a.inMyArea) || (here && a.coordinates && b.coordinates ? distanceM(here, a.coordinates) - distanceM(here, b.coordinates) : Date.parse(a.date) - Date.parse(b.date))), [d, here]);
  const sel = d?.missions.find((m) => m.id === selected) ?? null;

  // v7: chests and events around the person (or their area until the GPS answers); refreshed every ~200 m.
  const anchor = here ?? d?.areas.find((a) => a.relation === "mine")?.center ?? null;
  const anchorKey = anchor ? `${anchor.lat.toFixed(3)},${anchor.lng.toFixed(3)}` : "";
  const game = useApi(() => api7.game(anchor), [anchorKey]);
  const spawns: MapSpawn[] = useMemo(() => (game.data ? [
    ...game.data.chests.map((c) => ({ id: c.id, kind: c.kind, at: c.at, opened: c.opened })),
    ...game.data.events.filter((e) => !e.opened).map((e) => ({ id: e.id, kind: e.kind, at: e.at, opened: false, event: true })),
  ] : []), [game.data]);
  const [quiz, setQuiz] = useState<QuizAsk | null>(null);
  const { run: act, busy: acting } = useAct();
  const reachable = here ? spawns.filter((x) => !x.opened && distanceM(here, x.at) <= SPAWN.reachM + Math.min(here.accuracy ?? 0, 20)) : [];
  const openSpawn = async (id: string) => {
    const x = spawns.find((s) => s.id === id);
    if (!x) return;
    if (x.opened) { toast(t("cs.opened")); return; }
    if (!here) { gps.locate(); toast(t("cs.needGps"), "error"); return; }
    const dist = distanceM(here, x.at);
    if (dist > SPAWN.reachM + Math.min(here.accuracy ?? 0, 20)) { toast(t("cs.far", { d: f.distance(dist) })); setFocus({ point: x.at, zoom: 17, key: `sp${Date.now()}` }); return; }
    const r = await act(id, { t: "open", id, pos: { lat: here.lat, lng: here.lng, acc: here.accuracy ?? null, mock: gps.fairplay().mock } });
    if (!r) return;
    buzz(30);
    if (r.quiz) setQuiz(r.quiz);
    else if (r.kind === "boost") toast(t("mev.boostOn"));
  };
  // v7: "someone took part of your area" opens here with the spot
  const retake = params.get("retake");
  const retakeBy = params.get("by");
  const [retakeOpen, setRetakeOpen] = useState(Boolean(retake));
  useEffect(() => {
    if (!retake) return;
    const [lat, lng] = retake.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setFocus({ point: { lat, lng }, zoom: 16, key: `rt${retake}` });
  }, [retake]);

  // The loop closes on its own when the walker comes back to the start.
  useEffect(() => {
    if (gps.status === "tracking" && gps.loop.canAutoClose && !closing.current) void finish(false);
  }, [gps.loop.canAutoClose, gps.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCapture = () => {
    setSelected(null);
    setSheet(false);
    buzz(18);
    gps.start();
  };
  const startDemo = () => {
    // Walk next to someone else's area so the demo also shows taking ground from them.
    const other = d?.areas.find((a) => a.relation === "other")?.center;
    const c = other ?? here ?? d?.areas.find((a) => a.relation === "mine")?.center ?? { lat: 39.6542, lng: 66.9597 };
    const spot = other ? { lat: c.lat + 0.0006, lng: c.lng + 0.0036 } : { lat: c.lat + 0.0042, lng: c.lng - 0.0035 };
    setFocus({ point: spot, zoom: 15.2, key: `demo${Date.now()}` });
    setSelected(null);
    setSheet(false);
    gps.simulate(spot, 170);
  };
  async function finish(force: boolean) {
    if (closing.current) return;
    closing.current = true;
    setBusy(true);
    try {
      const before = areas.filter((a) => a.relation === "other");
      const r = await api.captureTerritory(gps.points, { forceClose: force, ...gps.fairplay() });
      setResult(r);
      if (r.ok) {
        gps.reset();
        if (r.takenFrom.length) setTaken(before.flatMap((a) => { const part = overlapShape(a.shape, r.shape); return part ? [{ shape: part, color: a.color }] : []; }));
        setFlash(r.shape);
        buzz(40);
        window.setTimeout(() => celebrate(null, 120), 350);
      } else if (r.error !== "not_closed") gps.reset();
      else gps.pause();
    } catch (e) {
      toast(errText(e), "error");
    } finally {
      setBusy(false);
      closing.current = false;
    }
  }

  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const daysLeft = Math.max(1, Math.ceil((monthEnd.getTime() - Date.now()) / 86_400_000));

  return (
    <div className="mapx" data-capturing={capturing || undefined}>
      <TerritoryMap
        areas={areas} missions={capturing ? [] : missions} me={here} trace={gps.points} flash={flash} taken={taken} myColor={myColor}
        hot={d?.hot && !capturing ? { point: d.hot.point, label: t("tm.hot", { n: d.hot.people }) } : null} focus={focus} selected={selected}
        onMission={(id) => { setSelected(id); setSheet(false); buzz(8); }}
        spawns={spawns} onSpawn={(id) => void openSpawn(id)}
      />

      {/* v7: the nearest chest or event within reach, one big button (also while walking) */}
      {reachable[0] && (
        <div className="mapx-chest" role="status">
          {reachable[0].event ? <span className="tm-spawn tm-event" data-kind={reachable[0].kind} aria-hidden="true"><Icon name="zap" size={16} /></span> : <ChestArt kind={reachable[0].kind} size={40} />}
          <span className="stack g4 grow" style={{ minWidth: 0 }}><strong>{reachable[0].event ? t(`mev.${reachable[0].kind}`) : t(`cs.${reachable[0].kind}`)}</strong><span className="t-small secondary">{t("cs.here")}</span></span>
          <Button variant="primary" loading={acting === reachable[0].id} onClick={() => void openSpawn(reachable[0].id)}>{t("cs.open")}</Button>
        </div>
      )}
      {game.data?.boostUntil && <div className="mapx-boost"><BoostBar until={game.data.boostUntil} /></div>}
      {retake && retakeOpen && !capturing && (
        <div className="mapx-retake" role="alert">
          <Icon name="flag" size={18} />
          <span className="stack g4 grow"><strong>{t("rtk.title")}</strong><span className="t-small">{t("rtk.body", { name: retakeBy ?? "—" })}</span></span>
          {d?.me.canCapture && <Button variant="primary" size="sm" icon="footprints" onClick={() => { setRetakeOpen(false); startCapture(); }}>{t("rtk.go")}</Button>}
          <button type="button" className="mapx-card-x" style={{ position: "static" }} onClick={() => setRetakeOpen(false)} aria-label={t("a.close")}><Icon name="x" size={16} /></button>
        </div>
      )}
      <QuizDialog quiz={quiz} onClose={() => setQuiz(null)} />

      {/* top bar over the map */}
      <div className="mapx-top">
        <Segmented value="map" onChange={(v) => v === "list" && onList()} label={t("tm.title")} items={[
          { value: "map", label: <span className="row g8"><Icon name="map" size={16} />{t("tm.viewMap")}</span> },
          { value: "list", label: <span className="row g8"><Icon name="list" size={16} />{t("tm.viewList")}</span> },
        ]} />
        <div className="row g8">
          <button type="button" className="mapx-fab-sm mapx-hero" onClick={() => setHeroOpen(true)} aria-label={t("hero.title")} title={t("hero.title")}><Icon name="user" size={18} /></button>
          <button type="button" className="mapx-fab-sm" onClick={() => setIntro(true)} aria-label={t("tm.how")}><Icon name="info" size={18} /></button>
          <button type="button" className="mapx-fab-sm" aria-label={t("tm.locate")} onClick={() => { gps.locate(); if (here) setFocus({ point: here, zoom: 16, key: `me${Date.now()}` }); }}><Icon name="crosshair" size={18} /></button>
        </div>
      </div>

      {gps.problem && !capturing && <div className="mapx-alert" role="status"><Icon name="alert" size={16} />{t(`tm.g.${gps.problem}`)}</div>}

      {/* the panel: my standing, the big button, missions and the season */}
      {!capturing && (
        <aside className="mapx-panel" data-open={sheet || undefined} aria-label={t("tm.myArea")}>
          <button type="button" className="mapx-grip" {...sheetDrag} onClick={() => { if (!dragMoved.current) setSheet((x) => !x); }} aria-label={t("tm.myArea")} aria-expanded={sheet}><span /></button>
          {!d ? <div style={{ padding: 16 }}><Skeleton rows={3} /></div> : (
            <>
              <div className="mapx-stat">
                <span className="t-small secondary">{t("tm.season", { month: f.month(), n: daysLeft })}</span>
                {d.me.areaM2 > 0 ? (
                  <div className="row between g12" style={{ alignItems: "flex-end" }}>
                    <span className="stack g4">
                      <span className="t-small secondary">{t("tm.myArea")}</span>
                      <strong className="mapx-area num">{f.area(d.me.areaM2)}</strong>
                    </span>
                    {d.me.rank && <span className="mapx-rank"><span className="t-meta">{t("tm.rankLabel")}</span><strong className="num">{t("tm.rank", { n: d.me.rank, of: d.me.of })}</strong></span>}
                  </div>
                ) : (
                  <span className="stack g4"><strong className="t-h3">{t("tm.noArea")}</strong><span className="t-small secondary">{t("tm.noAreaBody")}</span></span>
                )}
                {d.me.group && <Link href={`/app/groups/${d.me.group.id}`} className="row g8 t-small secondary mapx-group"><GroupMark name={d.me.group.name} color={d.me.group.color} size={20} />{t("tm.groupArea", { group: d.me.group.name, area: f.area(d.me.group.areaM2) })}{d.me.group.rank ? ` · #${d.me.group.rank}` : ""}</Link>}
              </div>

              {d.me.canCapture && (
                <div className="stack g8 mapx-cta">
                  <Button variant="primary" size="lg" block icon="footprints" className="btn-shine" disabled={d.me.capturesLeft === 0} onClick={startCapture}>{t("tm.capture")}</Button>
                  <span className="t-small muted" style={{ textAlign: "center" }}>{d.me.capturesLeft === 0 ? t("tm.noCapturesLeft") : t("tm.capturesLeft", { n: d.me.capturesLeft })}</span>
                  {!FIREBASE && d.me.capturesLeft > 0 && <Button variant="ghost" size="sm" icon="play" className="mapx-demo" onClick={startDemo} title={t("tm.c.demoHint")}>{t("tm.c.demo")}</Button>}
                </div>
              )}

              {d.me.ignored.length > 0 && (
                <div className="mapx-warn">
                  <Icon name="clock" size={16} />
                  <span className="stack g4">
                    <strong className="t-small">{t("tm.warnTitle")}</strong>
                    <span className="t-small secondary">{d.me.ignored.some((x) => Date.parse(x.dueAt) <= Date.now()) ? t("tm.warnBody", { n: d.me.ignored.length }) : t("tm.warnSoon", { n: d.me.ignored.length })}</span>
                    <span className="row g8 wrap">{d.me.ignored.slice(0, 3).map((x) => <Link key={x.id} href={`/app/missions/${x.id}`} className="chip">{x.title}</Link>)}</span>
                  </span>
                </div>
              )}

              <div className="mapx-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "missions"} onClick={() => setTab("missions")}>{t("tm.tabMissions")} <span className="t-meta">{d.missions.length}</span></button>
                <button type="button" role="tab" aria-selected={tab === "season"} onClick={() => setTab("season")}>{t("tm.tabSeason")}</button>
              </div>

              {tab === "missions" ? (
                d.missions.length === 0 ? <p className="t-small secondary" style={{ padding: "8px 4px" }}>{t("tm.noMissions")}</p> : (
                  <ul className="mapx-list">
                    {sorted.map((m, i) => (
                      <li key={m.id} style={{ ["--i" as string]: Math.min(i, 8) }}>
                        <button type="button" className="mapx-mission" data-on={m.id === selected || undefined} onClick={() => { setSelected(m.id); setSheet(false); if (m.coordinates) setFocus({ point: m.coordinates, key: m.id }); }}>
                          <span className={`mapx-cat cat-${m.category}`}><Icon name={CATEGORY_ICON[m.category]} size={16} /></span>
                          <span className="stack grow" style={{ minWidth: 0, textAlign: "left" }}>
                            <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
                            <span className="t-small secondary truncate">
                              {m.firstLookUntil ? <span className="first-look">{t("tm.firstLook", { time: f.time(m.firstLookUntil) })}</span> : m.inMyArea ? <span className="in-area">{t("tm.inYourArea")}</span> : null}
                              {(m.firstLookUntil || m.inMyArea) ? " · " : ""}{here && m.coordinates ? t("tm.away", { d: f.distance(distanceM(here, m.coordinates)) }) : f.dayTime(m.date)}
                            </span>
                          </span>
                          <span className="t-small num" style={{ fontWeight: 500 }}>+{m.rewardXP} XP</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <div className="stack g16">
                  {d.me.captures > 0 && <Button icon="play" onClick={() => setReplay(true)}>{t("tl.open")}</Button>}
                  {d.board.people.length === 0 ? <p className="t-small secondary">{t("tm.boardEmpty")}</p> : (
                    <>
                      <BoardList title={t("tm.people")} rows={d.board.people.map((p) => ({ id: p.id, name: p.name, area: p.areaM2, me: p.me, mark: <span className="map-tint" style={{ ["--tint" as string]: personColor(p.id, p.mapColor) }}><Avatar name={p.name} src={p.avatar} size={28} /></span> }))} />
                      {d.board.groups.length > 0 && <BoardList title={t("tm.groups")} rows={d.board.groups.map((g) => ({ id: g.id, name: g.name, area: g.areaM2, me: g.mine, mark: <GroupMark name={g.name} color={g.color} size={28} />, href: `/app/groups/${g.id}` }))} />}
                    </>
                  )}
                </div>
              )}

              <div className="mapx-legend t-small secondary">
                <span><i style={{ background: myColor }} />{t("tm.legendMine")}</span>
                {d.me.group && <span><i className="solid" />{t("tm.legendGroup")}</span>}
                <span><i className="dash" />{t("tm.legendOther")}</span>
              </div>
            </>
          )}
        </aside>
      )}

      {/* the selected mission */}
      {sel && !capturing && (
        <div className="mapx-card" key={sel.id}>
          <button type="button" className="mapx-card-x" onClick={() => setSelected(null)} aria-label={t("a.close")}><Icon name="x" size={16} /></button>
          <span className={`tag cat-${sel.category}`}><span className="cat-dot" />{t(`cat.${sel.category}`)}</span>
          <strong className="t-h3" style={{ paddingRight: 28 }}>{sel.title}</strong>
          <span className="t-small secondary">{f.dayTime(sel.date)} · {sel.location}</span>
          {sel.firstLookUntil ? <span className="first-look t-small">{t("tm.firstLook", { time: f.time(sel.firstLookUntil) })}</span> : sel.inMyArea ? <span className="in-area t-small">{t("tm.inYourArea")}</span> : null}
          <div className="row between g8" style={{ marginTop: 4 }}>
            <span className="t-small num" style={{ fontWeight: 500 }}>+{sel.rewardXP} XP · +{sel.rewardPoints} Fixcoin</span>
            <Button variant="primary" size="sm" onClick={() => router.push(`/app/missions/${sel.id}`)}>{sel.joined ? t("tm.joined") : t("tm.open")}<Icon name="arrowRight" size={16} /></Button>
          </div>
        </div>
      )}

      {/* while walking */}
      {capturing && (
        <CaptureHud gps={gps} busy={busy} onFinish={() => finish(true)} onCancel={() => setConfirmCancel(true)} />
      )}

      <Dialog open={heroOpen} onClose={() => setHeroOpen(false)} title={t("hero.title")}>
        {heroOpen && <HeroPicker onDone={() => setHeroOpen(false)} />}
      </Dialog>
      <Dialog open={replay} onClose={() => setReplay(false)} title={t("tl.title")} wide>
        {replay && <SeasonReplay color={myColor} />}
      </Dialog>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title={t("tm.c.cancel")} footer={<>
        <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t("tm.e.keep")}</Button>
        <Button variant="danger" onClick={() => { setConfirmCancel(false); gps.reset(); }}>{t("tm.c.cancel")}</Button>
      </>}><p className="secondary">{t("tm.c.cancelQ")}</p></Dialog>

      <Dialog open={Boolean(result)} onClose={() => setResult(null)} title={result?.ok ? t("tm.r.title") : t("tm.e.title")} footer={result?.ok ? <>
        <Button variant="ghost" onClick={() => setResult(null)}>{t("a.close")}</Button>
        <Button variant="primary" onClick={() => { setResult(null); setTab("missions"); setSheet(true); }}>{t("tm.r.see")}</Button>
      </> : <>
        {result && !result.ok && result.error === "not_closed" ? <Button variant="primary" onClick={() => { setResult(null); gps.resume(); }}>{t("tm.e.keep")}</Button> : <Button variant="primary" onClick={() => setResult(null)}>{t("a.close")}</Button>}
      </>}>
        {result?.ok ? (
          <div className="stack g12 capture-result">
            <span className="capture-big num">{t("tm.r.gained", { area: f.area(result.gainedM2) })}</span>
            <span className="secondary">{t("tm.r.total", { area: f.area(result.areaM2) })}</span>
            {result.takenFrom.map((x) => <span key={x.name} className="row g8 t-small"><Icon name="zap" size={14} style={{ color: "var(--warn)" }} />{t("tm.r.taken", { name: x.name, area: f.area(x.areaM2) })}</span>)}
            <span className="row g8 t-small"><Icon name="flag" size={14} />{result.missionsInside ? t("tm.r.missions", { n: result.missionsInside }) : t("tm.r.noMissions")}</span>
          </div>
        ) : result ? (
          <p className="secondary">{t(`tm.e.${result.error}`, { d: f.distance(result.toStartM ?? 0) })}</p>
        ) : null}
      </Dialog>

      <Dialog open={intro} onClose={() => { setIntro(false); try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* ignore */ } }} title={t("tm.h.title")} footer={
        <Button variant="primary" onClick={() => { setIntro(false); try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* ignore */ } }}>{t("tm.h.ok")}</Button>
      }>
        <ol className="how-steps">
          {(["1", "2", "3", "4"] as const).map((k, i) => (
            <li key={k} style={{ ["--i" as string]: i }}>
              <span className="how-steps-n num">{k}</span>
              <span className="stack g4"><strong>{t(`tm.h.${k}t`)}</strong><span className="t-small secondary">{t(`tm.h.${k}b`)}</span></span>
            </li>
          ))}
        </ol>
        <p className="t-small muted" style={{ marginTop: 12 }}>{t("tm.h.rules")}</p>
      </Dialog>
      {me === null && null}
    </div>
  );
}

function CaptureHud({ gps, busy, onFinish, onCancel }: { gps: ReturnType<typeof useTracker>; busy: boolean; onFinish: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const f = useFmt();
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(id); }, []);
  const secs = gps.elapsedSec();
  const { loop, stats } = gps;
  const toStart = loop.toStartM;
  const goingBack = loop.pathM >= TERRITORY.minPathM;
  const phase = gps.points.length < 2 ? "wait" : loop.canFinish ? "close" : goingBack && toStart != null ? "back" : "walk";
  const hint = phase === "wait" ? t("tm.c.waiting") : phase === "close" ? t("tm.c.hintClose") : phase === "back" ? t("tm.c.hintBack", { d: f.distance(toStart ?? 0) }) : t("tm.c.hintWalk");
  // progress: path toward the minimum, then closing the gap
  const progress = !goingBack ? Math.min(0.5, (loop.pathM / TERRITORY.minPathM) * 0.5) : toStart == null ? 0.5 : 0.5 + 0.5 * Math.max(0, Math.min(1, 1 - (toStart - TERRITORY.autoCloseM) / 400));
  return (
    <>
      <div className="hud" role="status" aria-live="polite">
        <div className="hud-ring" style={{ ["--p" as string]: progress }}>
          <svg viewBox="0 0 44 44" aria-hidden><circle cx="22" cy="22" r="19" /><circle cx="22" cy="22" r="19" pathLength={1} className="hud-ring-on" /></svg>
          <Icon name="footprints" size={18} />
        </div>
        <div className="hud-cells">
          <span><span className="t-meta">{t("tm.c.time")}</span><strong className="num">{f.clock(secs)}</strong></span>
          <span><span className="t-meta">{t("tm.c.distance")}</span><strong className="num">{f.distance(stats.distanceM)}</strong></span>
          <span><span className="t-meta">{t("tm.c.toStart")}</span><strong className="num">{toStart == null ? "—" : f.distance(toStart)}</strong></span>
        </div>
      </div>
      <div className="hud-hint" data-ready={loop.canFinish || undefined} key={phase}>{hint}</div>
      {stats.droppedFast > 2 && <div className="mapx-alert" style={{ top: 168 }}><Icon name="alert" size={16} />{t("tm.c.fast", { n: stats.droppedFast })}</div>}
      <div className="hud-bar">
        <span className="t-small secondary row g8">{gps.awake ? <><Icon name="sun" size={14} />{t("tm.c.awake")}</> : t("tm.c.keepOpen")}</span>
        <div className="row g8">
          <Button variant="ghost" onClick={onCancel}>{t("tm.c.cancel")}</Button>
          {gps.status === "tracking"
            ? <Button variant="secondary" icon="pause" onClick={gps.pause}>{t("tm.c.pause")}</Button>
            : <Button variant="secondary" icon="play" onClick={gps.resume}>{t("tm.c.resume")}</Button>}
          <Button variant="primary" icon="check" loading={busy} disabled={!loop.canFinish} onClick={onFinish} className={loop.canFinish ? "hud-go" : undefined}>{t("tm.c.finish")}</Button>
        </div>
      </div>
    </>
  );
}

function BoardList({ title, rows }: { title: string; rows: { id: string; name: string; area: number; me: boolean; mark: React.ReactNode; href?: string }[] }) {
  const f = useFmt();
  const max = Math.max(...rows.map((r) => r.area), 1);
  return (
    <section className="stack g8">
      <h3 className="t-small secondary">{title}</h3>
      <ol className="board-mini">
        {rows.map((r, i) => {
          const body = (
            <>
              <span className="num t-meta" style={{ width: 16 }}>{i + 1}</span>
              {r.mark}
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: r.me ? 600 : 500 }}>{r.name}</span>
                <span className="board-bar"><span style={{ ["--w" as string]: r.area / max, ["--i" as string]: i }} /></span>
              </span>
              <span className="t-small num">{f.area(r.area)}</span>
            </>
          );
          return <li key={r.id} data-me={r.me || undefined}>{r.href ? <Link href={r.href} className="row g12">{body}</Link> : <span className="row g12">{body}</span>}</li>;
        })}
      </ol>
    </section>
  );
}

export default function MapPage() {
  return <Suspense fallback={null}><MapMenu /></Suspense>;
}
