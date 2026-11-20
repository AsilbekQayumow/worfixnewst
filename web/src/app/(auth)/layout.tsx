"use client";
import { Logo } from "@/components/brand";
import { DemoBanner } from "@/components/demo-banner";
import { LangSwitch } from "@/components/lang-switch";
import { TopoMap } from "@/components/topo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DemoBanner />
      <div className="auth">
        <div className="auth-form">
          <div className="row between" style={{ marginBottom: 40 }}>
            <Logo />
            <LangSwitch />
          </div>
          <div className="enter" style={{ width: "100%", maxWidth: 420 }}>{children}</div>
        </div>
        <div className="auth-art" aria-hidden><TopoMap /></div>
      </div>
    </>
  );
}
