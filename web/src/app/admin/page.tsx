"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AdminComms, ContactDialog } from "@/components/admin-comms";
import { AdminCommsTabs, AdminNews } from "@/components/admin-news";
import { AiAudit } from "@/components/ai-audit";
import { monthShort } from "@/components/report";
import { AdminShop } from "@/components/admin-shop";
import { Icon } from "@/components/icons";
import { ReviewQueue } from "@/components/review-queue";
import { PageHead } from "@/components/shell";
import { ShopArt } from "@/components/shop-art";
import {
  Avatar, Button, Coins, Dialog, Empty, MISSION_STATUS_TONE, Notice, Skeleton, Stat, Status, Tabs, TextArea, TextInput, useToast,
} from "@/components/ui";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

function MiniBars({ data, label }: { data: { month: string; n: number }[]; label: string }) {
  const { locale, lang } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="stack g8">
      <span className="t-small secondary">{label}</span>
      <div className="mini-bars" role="img" aria-label={`${label}: ${data.map((d) => d.n).join(", ")}`}>
        {data.map((d, i) => (
          <span key={d.month} className="mini-bar" title={`${d.month}: ${d.n}`}>
            <span style={{ height: `${Math.max(d.n ? 6 : 2, (d.n / max) * 100)}%` }} data-now={i === data.length - 1 || undefined} />
            <em>{monthShort(d.month, lang, locale)}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

function Overview() {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api.adminOverview());
  const [showLog, setShowLog] = useState(false);
  if (!q.data) return <Skeleton rows={3} />;
  const d = q.data;
  const todo = [
    { n: d.aiAudit, label: t("ad.todo.ai"), href: "/admin?tab=review&sub=ai", icon: "scan" as const },
    { n: d.adminQueue, label: t("ad.todo.queue"), href: "/admin?tab=review&sub=admin", icon: "shield" as const },
    { n: d.pendingOrganizations, label: t("ad.todo.orgs"), href: "/admin?tab=moderation", icon: "building" as const },
    { n: d.ordersOpen, label: t("ad.todo.orders"), href: "/admin?tab=shop", icon: "bag" as const },
  ];
  return (
    <div className="stack g24">
      <section className="stack g12">
        <h2 className="t-h2">{t("ad.todo")}</h2>
        <div className="grid cols-4">
          {todo.map((x) => (
            <Link key={x.href} href={x.href} className="card pad stack g8 todo-tile" data-hot={x.n > 0 || undefined}>
              <span className="row between"><Icon name={x.icon} size={20} />{x.n > 0 && <span className="count-badge">{x.n}</span>}</span>
              <span className="stat-value num">{x.n}</span>
              <span className="t-small secondary">{x.label}</span>
            </Link>
          ))}
        </div>
      </section>
      <div className="grid cols-4">
        <Stat label={t("ad.users")} value={d.users} sub={t("ad.volunteers", { n: d.volunteers })} />
        <Stat label={t("ad.orgs")} value={d.organizations} sub={t("ad.pendingOrgs", { n: d.pendingOrganizations })} />
        <Stat label={t("ad.missions")} value={d.missions} sub={t("ad.agentMissions", { n: d.agentMissions })} />
        <Stat label={t("ad.groupsNews")} value={d.groups} sub={t("ad.newsLive", { n: d.news })} />
      </div>
      <div className="grid cols-2">
        <div className="card pad"><MiniBars data={d.volunteersByMonth} label={t("ad.newVolunteers")} /></div>
        <div className="card pad"><MiniBars data={d.approvalsByMonth} label={t("ad.approvals")} /></div>
      </div>
      <section className="stack g12">
        <div className="section-title"><h2 className="t-h2">{t("ad.activity")}</h2><button type="button" className="t-small link" style={{ background: "none", border: 0 }} onClick={() => setShowLog((x) => !x)}>{showLog ? t("ad.logLess") : t("ad.logAll")}</button></div>
        {showLog ? <Audit /> : (
          <div className="card rows">
            {d.recentActivity.map((a) => (
              <div key={a.id} className="row-item t-small">
                <span className="t-meta" style={{ width: 120, flex: "none" }}>{f.relative(a.timestamp)}</span>
                <span className="grow" title={a.action}>{actionLabel(t, a.action)}</span>
                <span className="secondary truncate" style={{ maxWidth: 320 }}>{a.detail}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewSection() {
  const { t } = useI18n();
  const router = useRouter();
  const raw = useSearchParams().get("sub");
  const sub = raw === "admin" || raw === "orgs" || raw === "history" ? raw : "ai";
  const b = useApi(() => api.badges()).data;
  const q = useApi(() => api.adminQueues());
  return (
    <div className="stack g16">
      <Tabs value={sub} onChange={(v) => router.replace(`/admin?tab=review&sub=${v}`, { scroll: false })} items={[
        { value: "ai", label: t("ad.rv.ai"), count: b?.aiAudit || undefined },
        { value: "admin", label: t("ad.rv.admin"), count: b?.adminQueue || undefined },
        { value: "orgs", label: t("ad.rv.orgs"), count: q.data?.orgs.length || undefined },
        { value: "history", label: t("ad.rv.history") },
      ]} />
      {sub === "ai" && <AiAudit />}
      {sub === "admin" && (<><p className="t-small secondary">{t("ad.rv.adminNote")}</p>{q.data ? <ReviewQueue scope="admin" items={q.data.admin} /> : <Skeleton rows={3} />}</>)}
      {sub === "orgs" && (<>
        <p className="t-small secondary">{t("ad.rv.orgsNote")}</p>
        {q.data && q.data.orgsStale > 0 && <Notice tone="warn">{t("ad.rv.stale", { n: q.data.orgsStale })}</Notice>}
        {q.data ? <ReviewQueue scope="admin" items={q.data.orgs} /> : <Skeleton rows={3} />}
      </>)}
      {sub === "history" && (q.data ? <ReviewQueue scope="admin" items={q.data.history} /> : <Skeleton rows={3} />)}
    </div>
  );
}

function Moderation() {
  const { t } = useI18n();
  const router = useRouter();
  const sub = useSearchParams().get("sub") === "missions" ? "missions" : "organizations";
  return (
    <div className="stack g16">
      <Tabs value={sub} onChange={(v) => router.replace(`/admin?tab=moderation&sub=${v}`, { scroll: false })} items={[
        { value: "organizations", label: t("nav.organizations") }, { value: "missions", label: t("nav.missions") },
      ]} />
      {sub === "organizations" ? <Organizations /> : <Missions />}
    </div>
  );
}

function Comms() {
  const sub = useSearchParams().get("sub") === "announce" ? "announce" : "news";
  return (
    <div className="stack g16">
      <AdminCommsTabs current={sub} />
      {sub === "news" ? <AdminNews /> : <AdminComms />}
    </div>
  );
}

function Organizations() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.adminOrganizations());
  const [reject, setReject] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); } catch (e) { toast(errText(e), "error"); } };
  if (!q.data) return <Skeleton rows={3} />;
  return (
    <>
      {q.data.length === 0 ? <div className="card"><Empty icon="building" title={t("orgs.none")} /></div> : (
        <div className="stack g12">
          {q.data.map((o) => (
            <article key={o.id} className="card pad stack g12">
              <div className="row between wrap g12">
                <div className="stack g4">
                  <h3 className="t-h3">{o.name}</h3>
                  <span className="t-small secondary">{o.organizationType} · {o.city}, {o.country} · {t("ad.owner", { name: o.ownerName })} · {f.date(o.createdAt)}</span>
                </div>
                <Status tone={o.verificationStatus === "approved" ? "ok" : o.verificationStatus === "pending" ? "warn" : "bad"}>{t(`os.${o.verificationStatus}`)}</Status>
              </div>
              <p className="t-small secondary">{o.description}</p>
              <span className="t-small muted">{o.email}{o.phone ? ` · ${o.phone}` : ""}{o.website ? ` · ${o.website}` : ""}</span>
              {o.verificationStatus !== "approved" && (
                <div className="row g8">
                  <Button size="sm" variant="primary" icon="check" onClick={() => run(() => api.decideOrganization(o.id, "approved"), t("ad.approved"))}>{t("ad.approve")}</Button>
                  {o.verificationStatus === "pending" && <Button size="sm" variant="danger" onClick={() => { setReject(o.id); setNote(""); }}>{t("ad.reject")}</Button>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <Dialog open={Boolean(reject)} onClose={() => setReject(null)} title={t("ad.rejectTitle")} footer={<>
        <Button variant="ghost" onClick={() => setReject(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={async () => { await run(() => api.decideOrganization(reject!, "rejected", note), t("ad.rejected")); setReject(null); }}>{t("ad.reject")}</Button>
      </>}>
        <TextArea label={t("ad.reason")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </Dialog>
    </>
  );
}

function Users() {
  const { t } = useI18n();
  const toast = useToast();
  const errText = useErrorText();
  const [q, setQ] = useState("");
  const users = useApi(() => api.adminUsers());
  const [suspend, setSuspend] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState<{ id: string; fullName: string; email: string } | null>(null);
  const list = (users.data ?? []).filter((u) => `${u.fullName} ${u.email} ${u.username} ${u.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack g16">
      <TextInput placeholder={t("ad.searchUsers")} aria-label={t("ad.searchUsers")} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
      {!users.data ? <Skeleton rows={5} /> : (
        <div className="card rows">
          {list.map((u) => (
            <div key={u.id} className="row-item">
              <Avatar name={u.fullName} src={u.avatar} size={32} />
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="truncate" style={{ fontWeight: 500 }}>{u.fullName}</span>
                <span className="t-small secondary truncate">{u.email || u.phone || (u.telegramId ? "Telegram" : "—")} · {t(`role.${u.role}`)} · {t("lvl.short", { n: u.level })}</span>
              </span>
              <Status tone={u.status === "active" ? "ok" : u.status === "suspended" ? "bad" : "neutral"}>{t(`us.${u.status}`)}</Status>
              <Button size="sm" variant="ghost" icon="send" iconOnly aria-label={t("ad.write")} onClick={() => setContact(u)} />
              {u.status === "active" && u.role !== "admin" && u.role !== "super_admin" && <Button size="sm" variant="ghost" onClick={() => { setSuspend(u.id); setReason(""); }}>{t("ad.suspend")}</Button>}
              {u.status === "suspended" && <Button size="sm" onClick={async () => { try { await api.setUserStatus(u.id, "active"); toast(t("ad.reactivated")); } catch (e) { toast(errText(e), "error"); } }}>{t("ad.reactivate")}</Button>}
            </div>
          ))}
        </div>
      )}
      <Dialog open={Boolean(suspend)} onClose={() => setSuspend(null)} title={t("ad.suspendTitle")} footer={<>
        <Button variant="ghost" onClick={() => setSuspend(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={async () => { try { await api.setUserStatus(suspend!, "suspended", reason); toast(t("ad.suspended")); setSuspend(null); } catch (e) { toast(errText(e), "error"); } }}>{t("ad.suspend")}</Button>
      </>}>
        <TextArea label={t("ad.reason")} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </Dialog>
      <ContactDialog user={contact} onClose={() => setContact(null)} />
    </div>
  );
}

function Missions() {
  const { t } = useI18n();
  const f = useFmt();
  const toast = useToast();
  const errText = useErrorText();
  const q = useApi(() => api.listMissions({ scope: "all" }));
  const [cancel, setCancel] = useState<string | null>(null);
  const [note, setNote] = useState("");
  if (!q.data) return <Skeleton rows={5} />;
  return (
    <>
      <div className="card rows">
        {q.data.map((m) => (
          <div key={m.id} className="row-item">
            <span className={`cat-${m.category}`}><span className="cat-dot" /></span>
            <span className="stack grow" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ fontWeight: 500 }}>{m.title}</span>
              <span className="t-small secondary truncate">{m.source === "agent" ? t("md.agentMission") : m.organizationName} · {f.date(m.date)}</span>
            </span>
            {m.featured && <Status tone="info">{t("ad.featured")}</Status>}
            <Status tone={MISSION_STATUS_TONE[m.status]}>{t(`ms.${m.status}`)}</Status>
            {m.status === "published" && m.source !== "agent" && (
              <>
                <Button size="sm" variant="ghost" onClick={() => api.moderateMission(m.id, m.featured ? "unfeature" : "feature").catch((e) => toast(errText(e), "error"))}>{m.featured ? t("ad.unfeature") : t("ad.feature")}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setCancel(m.id); setNote(""); }}>{t("ad.cancelMission")}</Button>
              </>
            )}
          </div>
        ))}
      </div>
      <Dialog open={Boolean(cancel)} onClose={() => setCancel(null)} title={t("ad.cancelMission")} footer={<>
        <Button variant="ghost" onClick={() => setCancel(null)}>{t("a.cancel")}</Button>
        <Button variant="danger" onClick={async () => { try { await api.moderateMission(cancel!, "cancel", note); setCancel(null); } catch (e) { toast(errText(e), "error"); } }}>{t("ad.cancelMission")}</Button>
      </>}>
        <TextArea label={t("ad.reason")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </Dialog>
    </>
  );
}

function Audit() {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api.adminAudit());
  if (!q.data) return <Skeleton rows={6} />;
  return (
    <div className="card rows">
      {q.data.map((a) => (
        <div key={a.id} className="row-item t-small">
          <span className="t-meta" style={{ width: 150, flex: "none" }}>{f.dayTime(a.timestamp)}</span>
          <span style={{ width: 220, flex: "none" }} title={a.action}>{actionLabel(t, a.action)}</span>
          <span className="secondary grow truncate">{t(`role.${a.actorRole}`)} · {a.detail || a.resourceId}</span>
        </div>
      ))}
    </div>
  );
}

/** Readable name for an audit action ("user.login" → "Signed in"); unknown actions fall back to the raw key. */
function actionLabel(t: (k: string) => string, action: string) {
  const k = `audit.${action}`;
  const s = t(k);
  return s === k ? action : s;
}

const TABS = ["overview", "review", "moderation", "users", "comms", "shop"] as const;
/** Old links (?tab=organizations, missions, audit) still land in the right section. */
const OLD: Record<string, Tab> = { organizations: "moderation", missions: "moderation", audit: "overview" };
type Tab = (typeof TABS)[number];

function Admin() {
  const { t } = useI18n();
  const raw = useSearchParams().get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : OLD[raw ?? ""] ?? "overview";
  const title: Record<Tab, string> = {
    overview: t("nav.dashboard"), review: t("nav.review"), moderation: t("nav.moderation"), users: t("nav.users"), comms: t("nav.comms"), shop: t("nav.shop"),
  };
  const sub: Partial<Record<Tab, string>> = { review: t("ad.rv.sub"), moderation: t("ad.mod.sub"), comms: t("ad.comms.sub") };
  return (
    <div className="stack g24 enter" key={tab}>
      <PageHead title={title[tab]} sub={sub[tab]} />
      {tab === "overview" && <Overview />}
      {tab === "review" && <ReviewSection />}
      {tab === "moderation" && <Moderation />}
      {tab === "users" && <Users />}
      {tab === "comms" && <Comms />}
      {tab === "shop" && <AdminShop />}
    </div>
  );
}

export default function AdminPage() {
  return <Suspense fallback={null}><Admin /></Suspense>;
}
