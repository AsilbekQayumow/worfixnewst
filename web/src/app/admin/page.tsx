"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AdminComms, ContactDialog } from "@/components/admin-comms";
import { AdminShop } from "@/components/admin-shop";
import { Icon } from "@/components/icons";
import { ReviewQueue } from "@/components/review-queue";
import { PageHead } from "@/components/shell";
import { ShopArt } from "@/components/shop-art";
import {
  Avatar, Button, Coins, Dialog, Empty, MISSION_STATUS_TONE, Skeleton, Stat, Status, TextArea, TextInput, useToast,
} from "@/components/ui";
import { useErrorText, useFmt, useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";

function Overview() {
  const { t } = useI18n();
  const f = useFmt();
  const q = useApi(() => api.adminOverview());
  if (!q.data) return <Skeleton rows={3} />;
  const d = q.data;
  return (
    <div className="stack g24">
      <div className="grid cols-4">
        <Stat label={t("ad.users")} value={d.users} sub={t("ad.volunteers", { n: d.volunteers })} />
        <Stat label={t("ad.orgs")} value={d.organizations} sub={d.pendingOrganizations ? <Link className="link" href="/admin?tab=organizations">{t("ad.pendingOrgs", { n: d.pendingOrganizations })}</Link> : undefined} />
        <Stat label={t("ad.toReview")} value={d.pendingSubmissions} sub={t("ad.flagged", { n: d.flagged })} />
        <Stat label={t("ad.missions")} value={d.missions} sub={t("ad.agentMissions", { n: d.agentMissions })} />
      </div>
      <nav className="mobile-only grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} aria-label={t("nav.main")}>
        {([["missions", "flag", t("nav.missions")], ["shop", "bag", t("nav.shop")], ["audit", "list", t("nav.audit")]] as const).map(([tab, icon, label]) => (
          <Link key={tab} href={`/admin?tab=${tab}`} className="card pad stack g8" style={{ alignItems: "flex-start" }}><Icon name={icon} />{label}</Link>
        ))}
      </nav>
      <section className="stack g12">
        <h2 className="t-h2">{t("ad.activity")}</h2>
        <div className="card rows">
          {d.recentActivity.map((a) => (
            <div key={a.id} className="row-item t-small">
              <span className="t-meta" style={{ width: 120, flex: "none" }}>{f.relative(a.timestamp)}</span>
              <span className="grow" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{a.action}</span>
              <span className="secondary truncate" style={{ maxWidth: 320 }}>{a.detail}</span>
            </div>
          ))}
        </div>
      </section>
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
  const list = (users.data ?? []).filter((u) => `${u.fullName} ${u.email} ${u.username}`.toLowerCase().includes(q.toLowerCase()));
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
                <span className="t-small secondary truncate">{u.email} · {t(`role.${u.role}`)} · {t("lvl.short", { n: u.level })}</span>
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
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: 200, flex: "none" }}>{a.action}</span>
          <span className="secondary grow truncate">{t(`role.${a.actorRole}`)} · {a.detail || a.resourceId}</span>
        </div>
      ))}
    </div>
  );
}

const TABS = ["overview", "organizations", "review", "users", "missions", "comms", "shop", "audit"] as const;
type Tab = (typeof TABS)[number];

function Admin() {
  const { t } = useI18n();
  const raw = useSearchParams().get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "overview";
  const title: Record<Tab, string> = {
    overview: t("nav.overview"), organizations: t("nav.organizations"), review: t("nav.review"), users: t("nav.users"),
    missions: t("nav.missions"), comms: t("nav.comms"), shop: t("nav.shop"), audit: t("nav.audit"),
  };
  return (
    <div className="stack g24 enter" key={tab}>
      <PageHead title={title[tab]} sub={tab === "review" ? t("rv.subAdmin") : undefined} />
      {tab === "overview" && <Overview />}
      {tab === "organizations" && <Organizations />}
      {tab === "review" && <ReviewQueue scope="admin" />}
      {tab === "users" && <Users />}
      {tab === "missions" && <Missions />}
      {tab === "comms" && <AdminComms />}
      {tab === "shop" && <AdminShop />}
      {tab === "audit" && <Audit />}
    </div>
  );
}

export default function AdminPage() {
  return <Suspense fallback={null}><Admin /></Suspense>;
}
