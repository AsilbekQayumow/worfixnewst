"use client";
import { OfflineBar, QueryErrorBar } from "./offline-bar";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { homeForRole, canEnterArea, type Area } from "@/lib/domain/permissions";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/store/api";
import { useApi } from "@/lib/store/hooks";
import { Logo } from "./brand";
import { Icon, type IconName } from "./icons";
import { useMe, useTheme } from "./providers";
import { Avatar, Coins, Skeleton, useToast } from "./ui";
import { LangSwitch } from "./lang-switch";
import { DemoBanner } from "./demo-banner";
import { LevelUp } from "./level-up";
import { levelForXp, levelTitleKey } from "@/lib/domain/rewards";
import { Garland } from "./winter/garland";
import { useSeason } from "./winter/season";

interface NavItem { href: string; label: string; icon: IconName; badge?: number; mobile?: boolean; exact?: boolean; also?: string[] }
type Badges = Awaited<ReturnType<typeof api.badges>>;

function useNav(area: Area): { main: NavItem[]; extra: NavItem[]; b?: Badges } {
  const { t } = useI18n();
  const { winter } = useSeason();
  const b = useApi(() => api.badges()).data;
  const items = navItems(area, t, b);
  // v8: the New Year hub, right after Home, while the season lasts
  if (winter && area === "volunteer") items.main.splice(1, 0, { href: "/app/newyear", label: t("nav.newyear"), icon: "tree" });
  return { ...items, b };
}

function navItems(area: Area, t: (k: string) => string, b: Badges | undefined): { main: NavItem[]; extra: NavItem[] } {
  if (area === "volunteer") return {
    main: [
      { href: "/app", label: t("nav.home"), icon: "home", mobile: true, exact: true, badge: b?.signals },
      { href: "/app/map", label: t("nav.map"), icon: "map", mobile: true, also: ["/app/missions", "/app/explore"] },
      { href: "/app/chat", label: t("nav.chat"), icon: "message", badge: b?.messages, mobile: true, also: ["/app/friends", "/app/groups", "/app/people", "/app/join"] },
      { href: "/app/play", label: t("nav.play"), icon: "target", also: ["/app/wrapped"] },
      { href: "/app/rating", label: t("nav.rating"), icon: "trophy", mobile: true },
      { href: "/app/shop", label: t("nav.shop"), icon: "bag" },
      { href: "/app/profile", label: t("nav.profile"), icon: "user", mobile: true },
    ],
    extra: [
      { href: "/app/notifications", label: t("nav.notifications"), icon: "bell", badge: b?.notifications },
      { href: "/app/settings", label: t("nav.settings"), icon: "settings" },
      { href: "/app/diary", label: t("di.title"), icon: "book" },
    ],
  };
  if (area === "organization") return {
    main: [
      { href: "/org", label: t("nav.overview"), icon: "home", mobile: true, exact: true },
      { href: "/org/missions", label: t("nav.orgMissions"), icon: "flag", mobile: true },
      { href: "/org/review", label: t("nav.review"), icon: "shield", mobile: true, badge: b?.reviews },
      { href: "/org/chat", label: t("nav.chat"), icon: "message", badge: b?.messages, mobile: true },
      { href: "/org/profile", label: t("nav.orgProfile"), icon: "building", mobile: true },
      { href: "/org/volunteers", label: t("sk.find"), icon: "search" },
    ],
    extra: [
      { href: "/org/notifications", label: t("nav.notifications"), icon: "bell", badge: b?.notifications },
      { href: "/org/settings", label: t("nav.settings"), icon: "settings" },
    ],
  };
  return {
    main: [
      { href: "/admin", label: t("nav.dashboard"), icon: "home", mobile: true, exact: true },
      { href: "/admin?tab=review", label: t("nav.review"), icon: "shield", mobile: true, badge: (b?.adminQueue ?? 0) + (b?.aiAudit ?? 0) },
      { href: "/admin?tab=moderation", label: t("nav.moderation"), icon: "building", mobile: true },
      { href: "/admin?tab=users", label: t("nav.users"), icon: "users" },
      { href: "/admin?tab=comms", label: t("nav.comms"), icon: "send", mobile: true, badge: b?.messages, also: ["/admin/chat"] },
      { href: "/admin?tab=shop", label: t("nav.shop"), icon: "bag", mobile: true },
    ],
    extra: [
      { href: "/admin/notifications", label: t("nav.notifications"), icon: "bell", badge: b?.notifications },
      { href: "/admin/settings", label: t("nav.settings"), icon: "settings" },
    ],
  };
}

function isCurrent(item: NavItem, path: string, tab: string | null) {
  if (item.also?.some((x) => path === x || path.startsWith(`${x}/`))) return true;
  const [p, q] = item.href.split("?");
  if (q) return path === p && `tab=${tab}` === q;
  if (item.href === "/admin") return path === "/admin" && !tab;
  return item.exact ? path === p : path === p || path.startsWith(`${p}/`);
}

/** v5: each section keeps one colour, in the sidebar and the tab bar. */
const TONE: Partial<Record<IconName, string>> = {
  home: "var(--accent)", map: "var(--sky)", message: "var(--berry)", trophy: "var(--sun)", bag: "var(--flame)", user: "var(--sea)",
  bell: "var(--coral)", settings: "var(--muted)", tree: "var(--xmas-red, var(--coral))", flag: "var(--sky)", shield: "var(--sea)", building: "var(--flame)", users: "var(--berry)", send: "var(--sky)",
};
const tone = (i: IconName) => ({ ["--tone" as string]: TONE[i] ?? "var(--accent)" });

function NavLinks({ items, path, tab }: { items: NavItem[]; path: string; tab: string | null }) {
  return (
    <>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={isCurrent(i, path, tab) ? "page" : undefined} style={tone(i.icon)}>
          <span className="nav-ico"><Icon name={i.icon} size={18} /></span>
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
  const search = useSearchParams();
  const tab = search.get("tab");
  // v3.2: the map runs edge to edge
  const bleed = path === "/app/map" && search.get("view") !== "list";
  const nav = useNav(area);
  const b = nav.b;
  const season = useSeason();

  // v3.2: a group that approved my join request takes me in on my next visit.
  const toast = useToast();
  const claimed = useRef(false);
  useEffect(() => {
    if (!me || me.role !== "volunteer" || claimed.current) return;
    claimed.current = true;
    void api.claimApprovedJoins().then((g) => { if (g) toast(t("jr.joinedToast", { group: g.name })); }).catch(() => {});
  }, [me, t, toast]);

  // v4: success moments: a verified mission (XP went up) or a new level since my last visit.
  useEffect(() => {
    if (!me || me.role !== "volunteer") return;
    const key = `worfix.moments.${me.id}`;
    let seen: { xp: number; level: number } | null = null;
    try { seen = JSON.parse(localStorage.getItem(key) ?? "null"); } catch { /* ignore */ }
    try { localStorage.setItem(key, JSON.stringify({ xp: me.xp, level: me.level })); } catch { /* ignore */ }
    if (!seen || me.xp <= seen.xp) return;
    const gained = me.xp - seen.xp, levelled = me.level > seen.level;
    const id = window.setTimeout(() => {
      void import("@/lib/fx").then(({ celebrate, buzz }) => { celebrate(null, levelled ? 140 : 80); buzz(levelled ? 60 : 30); });
      toast(levelled ? t("mo.level", { n: me.level }) : t("mo.approved", { n: gained }));
    }, 600);
    return () => window.clearTimeout(id);
  }, [me?.id, me?.xp, me?.level]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) { router.replace(`/login?next=${encodeURIComponent(path)}`); return; }
    if (!canEnterArea(me.role, area)) { router.replace(homeForRole(me.role)); return; }
    if (area === "volunteer" && !me.onboarded && path !== "/app/onboarding") router.replace("/app/onboarding");
  }, [me, area, path, router]);

  if (!me || !canEnterArea(me.role, area)) {
    return <div className="container" style={{ paddingTop: 80, maxWidth: 560 }}><Skeleton rows={4} /></div>;
  }

  // A full navigation: the shell must not redirect to /login while the session ends.
  const logout = async () => { await api.logout(); window.location.replace("/"); };
  const profileHref = area === "volunteer" ? "/app/profile" : area === "organization" ? "/org/settings" : "/admin/settings";

  return (
    <div className="shell">
      <aside className="side">
        <Garland count={5} className="side-garland" />
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
            {season.winter && <MusicButton />}
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={logout} aria-label={t("a.logout")} style={{ marginLeft: "auto" }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
          <Link href={profileHref} className="me-card">
            <Avatar name={me.fullName} src={me.avatar} size={36} />
            <span className="stack grow" style={{ minWidth: 0 }}>
              <span className="truncate" style={{ fontSize: 14, fontWeight: 500 }}>{me.fullName}</span>
              {area === "volunteer"
                ? <span className="row g8 t-small secondary"><span className="num">{t("lvl.short", { n: levelForXp(me.xp) })} · {t(levelTitleKey(levelForXp(me.xp)))}</span><Coins value={me.points} size={12} /></span>
                : <span className="t-small secondary">{t(`role.${me.role}`)}</span>}
            </span>
          </Link>
        </div>
      </aside>

      <div className="shell-col" style={{ minWidth: 0 }}>
        <header className="topbar">
          <Garland count={8} className="top-garland" />
          <Logo href={homeForRole(me.role)} compact />
          <div className="row g4">
            {season.winter && <MusicButton />}
            {area === "volunteer" && (
              <span className="hud-chips">
                <Link href="/app/profile" className="hud-chip flame" data-off={me.streak ? undefined : ""} aria-label={t("home.app.streak")}><Icon name="flame" size={17} />{me.streak}</Link>
                <Link href="/app/shop" className="hud-chip" aria-label={t("nav.shop")}><Coins value={me.points} size={15} /></Link>
              </span>
            )}
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
        <OfflineBar />
        <QueryErrorBar />
        {area === "volunteer" && <LevelUp />}
        <main className={bleed ? "main main-bleed" : "main"} id="main">
          <div className="main-inner">{children}</div>
        </main>
        <nav className="tabbar" aria-label={t("nav.main")}>
          {nav.main.filter((i) => i.mobile).map((i) => (
            <Link key={i.href} href={i.href} aria-current={isCurrent(i, path, tab) ? "page" : undefined} style={tone(i.icon)}>
              <span className="nav-ico"><Icon name={i.icon} size={19} /></span>
              <span className="truncate" style={{ maxWidth: "100%", padding: "0 2px" }}>{i.label}</span>
              {i.badge ? <span className="count-badge">{i.badge}</span> : null}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** v8: New Year music on and off. */
export function MusicButton() {
  const { t } = useI18n();
  const { music, toggleMusic } = useSeason();
  return (
    <button type="button" className="btn btn-ghost btn-sm btn-icon season-btn" data-on={music ? "" : undefined} onClick={toggleMusic}
      aria-pressed={music} aria-label={music ? t("ny.musicOff") : t("ny.musicOn")} title={music ? t("ny.musicOff") : t("ny.musicOn")}>
      <Icon name={music ? "music" : "musicOff"} size={17} />
    </button>
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
