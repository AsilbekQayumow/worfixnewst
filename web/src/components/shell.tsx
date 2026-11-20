"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, type ReactNode } from "react";
import { homeForRole, canEnterArea, type Area } from "@/lib/domain/permissions";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Logo } from "./brand";
import { Icon, type IconName } from "./icons";
import { useMe, useTheme } from "./providers";
import { Avatar, Coins, Skeleton } from "./ui";
import { LangSwitch } from "./lang-switch";
import { DemoBanner } from "./demo-banner";

interface NavItem { href: string; label: string; icon: IconName; badge?: number; mobile?: boolean; exact?: boolean }

function useNav(area: Area): { main: NavItem[]; extra: NavItem[]; b?: { messages: number } } {
  const { t } = useI18n();
  const b = useApi(() => api.badges()).data;
  return withBadges(area, t, b);
}

function withBadges(area: Area, t: (k: string) => string, b: { notifications: number; messages: number; friends: number } | undefined) {
  return { ...navItems(area, t, b), b };
}

function navItems(area: Area, t: (k: string) => string, b: { notifications: number; messages: number; friends: number } | undefined): { main: NavItem[]; extra: NavItem[] } {
  if (area === "volunteer") return {
    main: [
      { href: "/app", label: t("nav.home"), icon: "home", mobile: true, exact: true },
      { href: "/app/explore", label: t("nav.explore"), icon: "compass", mobile: true },
      { href: "/app/missions", label: t("nav.myMissions"), icon: "flag", mobile: true },
      { href: "/app/friends", label: t("nav.friends"), icon: "users", badge: b?.friends },
      { href: "/app/chat", label: t("nav.chat"), icon: "message", badge: b?.messages, mobile: true },
      { href: "/app/shop", label: t("nav.shop"), icon: "bag" },
      { href: "/app/profile", label: t("nav.profile"), icon: "user", mobile: true },
    ],
    extra: [
      { href: "/app/notifications", label: t("nav.notifications"), icon: "bell", badge: b?.notifications },
      { href: "/app/settings", label: t("nav.settings"), icon: "settings" },
    ],
  };
  if (area === "organization") return {
    main: [
      { href: "/org", label: t("nav.overview"), icon: "home", mobile: true, exact: true },
      { href: "/org/missions", label: t("nav.orgMissions"), icon: "flag", mobile: true },
      { href: "/org/missions/new", label: t("nav.newMission"), icon: "plus", mobile: true, exact: true },
      { href: "/org/review", label: t("nav.review"), icon: "shield", mobile: true },
      { href: "/org/profile", label: t("nav.orgProfile"), icon: "building", mobile: true },
    ],
    extra: [
      { href: "/org/notifications", label: t("nav.notifications"), icon: "bell", badge: b?.notifications },
      { href: "/org/settings", label: t("nav.settings"), icon: "settings" },
      { href: "/org/chat", label: t("nav.chat"), icon: "message", badge: b?.messages },
    ],
  };
  return {
    main: [
      { href: "/admin", label: t("nav.overview"), icon: "home", mobile: true, exact: true },
      { href: "/admin?tab=organizations", label: t("nav.organizations"), icon: "building", mobile: true },
      { href: "/admin?tab=review", label: t("nav.review"), icon: "shield", mobile: true },
      { href: "/admin?tab=users", label: t("nav.users"), icon: "users", mobile: true },
      { href: "/admin?tab=missions", label: t("nav.missions"), icon: "flag" },
      { href: "/admin?tab=comms", label: t("nav.comms"), icon: "send", mobile: true },
      { href: "/admin/chat", label: t("nav.chat"), icon: "message", badge: b?.messages },
      { href: "/admin?tab=shop", label: t("nav.shop"), icon: "bag" },
      { href: "/admin?tab=audit", label: t("nav.audit"), icon: "list" },
    ],
    extra: [
      { href: "/admin/notifications", label: t("nav.notifications"), icon: "bell", badge: b?.notifications },
      { href: "/admin/settings", label: t("nav.settings"), icon: "settings" },
    ],
  };
}

function isCurrent(item: NavItem, path: string, tab: string | null) {
  const [p, q] = item.href.split("?");
  if (q) return path === p && `tab=${tab}` === q;
  if (item.href === "/admin") return path === "/admin" && !tab;
  return item.exact ? path === p : path === p || path.startsWith(`${p}/`);
}

function NavLinks({ items, path, tab }: { items: NavItem[]; path: string; tab: string | null }) {
  return (
    <>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isCurrent(i, path, tab) ? "page" : undefined}>
          <Icon name={i.icon} />
          <span className="grow truncate">{i.label}</span>
          {i.badge ? <span className="count-badge">{i.badge}</span> : null}
        </Link>
      ))}
    </>
  );
}

function ShellInner({ area, children }: { area: Area; children: ReactNode }) {
  const { me } = useMe();
  const { t } = useI18n();
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const nav = useNav(area);
  const b = nav.b;

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) { router.replace(`/login?next=${encodeURIComponent(path)}`); return; }
    if (!canEnterArea(me.role, area)) { router.replace(homeForRole(me.role)); return; }
    if (area === "volunteer" && !me.onboarded && path !== "/app/onboarding") router.replace("/app/onboarding");
  }, [me, area, path, router]);

  if (!me || !canEnterArea(me.role, area)) {
    return <div className="container" style={{ paddingTop: 80, maxWidth: 560 }}><Skeleton rows={4} /></div>;
  }

  const logout = async () => { await api.logout(); router.replace("/"); };
  const profileHref = area === "volunteer" ? "/app/profile" : area === "organization" ? "/org/settings" : "/admin/settings";

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand"><Logo href={homeForRole(me.role)} /></div>
        <nav className="nav" aria-label={t("nav.main")}>
          <NavLinks items={nav.main} path={path} tab={tab} />
          <div className="nav-label">{t("nav.account")}</div>
          <NavLinks items={nav.extra} path={path} tab={tab} />
        </nav>
        <div className="side-foot">
          <div className="row g8" style={{ padding: "0 4px" }}>
            <LangSwitch />
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={toggle} aria-label={theme === "dark" ? t("a.lightMode") : t("a.darkMode")}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={logout} aria-label={t("a.logout")} style={{ marginLeft: "auto" }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
          <Link href={profileHref} className="me-card">
            <Avatar name={me.fullName} src={me.avatar} size={36} />
            <span className="stack grow" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>{me.fullName}</span>
              {area === "volunteer"
                ? <span className="row g8 t-small secondary"><span className="num">{t("lvl.short", { n: me.level })}</span><Coins value={me.points} size={12} /></span>
                : <span className="t-small secondary">{t(`role.${me.role}`)}</span>}
            </span>
          </Link>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <Logo href={homeForRole(me.role)} compact />
          <div className="row g4">
            {area === "volunteer" && <Link href="/app/shop" className="btn btn-ghost btn-sm" aria-label={t("nav.shop")}><Coins value={me.points} size={14} /></Link>}
            {area !== "volunteer" && (
              <Link href={area === "admin" ? "/admin/chat" : "/org/chat"} className="btn btn-ghost btn-sm btn-icon" aria-label={t("nav.chat")} style={{ position: "relative" }}>
                <Icon name="message" size={18} />
                {b?.messages ? <span className="count-badge" style={{ position: "absolute", top: 0, right: -2 }}>{b.messages}</span> : null}
              </Link>
            )}
            <Link href={nav.extra[0].href} className="btn btn-ghost btn-sm btn-icon" aria-label={t("nav.notifications")} style={{ position: "relative" }}>
              <Icon name="bell" size={18} />
              {nav.extra[0].badge ? <span className="count-badge" style={{ position: "absolute", top: 0, right: -2 }}>{nav.extra[0].badge}</span> : null}
            </Link>
            <Link href={nav.extra[1].href} className="btn btn-ghost btn-sm btn-icon" aria-label={t("nav.settings")}><Icon name="settings" size={18} /></Link>
          </div>
        </header>
        <DemoBanner />
        <main className="main" id="main">
          <div className="main-inner">{children}</div>
        </main>
        <nav className="tabbar" aria-label={t("nav.main")}>
          {nav.main.filter((i) => i.mobile).map((i) => (
            <Link key={i.href} href={i.href} aria-current={isCurrent(i, path, tab) ? "page" : undefined}>
              <Icon name={i.icon} size={20} />
              <span className="truncate" style={{ maxWidth: "100%", padding: "0 2px" }}>{i.label}</span>
              {i.badge ? <span className="count-badge">{i.badge}</span> : null}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function AppShell({ area, children }: { area: Area; children: ReactNode }) {
  return <Suspense fallback={null}><ShellInner area={area}>{children}</ShellInner></Suspense>;
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="stack g8" style={{ minWidth: 0 }}>
        <h1 className="t-h1">{title}</h1>
        {sub && <p className="secondary" style={{ maxWidth: 640 }}>{sub}</p>}
      </div>
      {actions && <div className="row g8 wrap">{actions}</div>}
    </div>
  );
}
