"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { homeForRole } from "@/lib/domain/permissions";
import { useI18n } from "@/lib/i18n";
import { Logo } from "./brand";
import { Icon } from "./icons";
import { LangSwitch } from "./lang-switch";
import { useMe, useTheme } from "./providers";
import { DemoBanner } from "./demo-banner";

export function SiteHeader() {
  const { t } = useI18n();
  const { me } = useMe();
  const { theme, toggle } = useTheme();
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links = [
    { href: "/missions", label: t("site.missions") },
    { href: "/organizations", label: t("site.orgs") },
    { href: "/verify", label: t("site.verify") },
  ];
  return (
    <header className="site-head" data-scrolled={scrolled}>
      <div className="container">
        <Logo />
        <nav className="site-nav" aria-label={t("nav.main")}>
          {links.map((l) => <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>{l.label}</Link>)}
        </nav>
        <div className="row g8" style={{ marginLeft: "auto" }}>
          <LangSwitch />
          <button type="button" className="btn btn-ghost btn-sm btn-icon hide-sm" onClick={toggle} aria-label={theme === "dark" ? t("a.lightMode") : t("a.darkMode")}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
          </button>
          {me ? (
            <Link href={homeForRole(me.role)} className="btn btn-ink btn-sm">{t("site.openApp")}</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm hide-sm">{t("site.login")}</Link>
              <Link href="/register" className="btn btn-ink btn-sm">{t("site.join")}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="site-foot">
      <div className="container row between wrap g24">
        <div className="stack g8">
          <Logo />
          <p className="t-small" style={{ maxWidth: 360 }}>{t("site.footer")}</p>
        </div>
        <div className="row g24 wrap t-small">
          <Link href="/missions" className="link">{t("site.missions")}</Link>
          <Link href="/organizations" className="link">{t("site.orgs")}</Link>
          <Link href="/verify" className="link">{t("site.verify")}</Link>
          <Link href="/register?type=organization" className="link">{t("site.forOrgs")}</Link>
        </div>
      </div>
    </footer>
  );
}

export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <DemoBanner />
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
