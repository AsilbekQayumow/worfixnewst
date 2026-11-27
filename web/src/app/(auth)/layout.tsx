"use client";
import { Logo } from "@/components/brand";
import { DemoBanner } from "@/components/demo-banner";
import { LangSwitch } from "@/components/lang-switch";
import { TopoMap } from "@/components/topo";
import { WinterScene } from "@/components/winter/scene";
import { useSeason } from "@/components/winter/season";
import { MusicButton } from "@/components/shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { winter } = useSeason();
  return (
    <>
      <DemoBanner />
      <div className="auth" data-winter={winter ? "" : undefined}>
        <div className="auth-form">
          <div className="row between" style={{ marginBottom: 40 }}>
            <Logo />
            <div className="row g8">{winter && <MusicButton />}<LangSwitch /></div>
          </div>
          <div className="enter" style={{ width: "100%", maxWidth: 420 }}>{children}</div>
        </div>
        <div className="auth-art" aria-hidden>{winter ? <WinterScene /> : <TopoMap />}</div>
      </div>
    </>
  );
}
