import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Nunito } from "next/font/google";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa";
import "./globals.css";
import "./theme-play.css";

const nunito = Nunito({ subsets: ["latin", "latin-ext", "cyrillic"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-nunito", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "WORFIX — ko'ngillilik, tasdiqlangan natija bilan", template: "%s · WORFIX" },
  description: "Atrofingizdagi haqiqiy ko'ngillilik missiyalari: bajaring, surat va GPS bilan isbotlang, XP, Fixcoin va sertifikat oling.",
  icons: { icon: "/worfix-logo.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "WORFIX", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f8f1" }, { media: "(prefers-color-scheme: dark)", color: "#0e1915" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning className={`${nunito.variable} ${mono.variable}`}>
      <head>
        <script
          // Set the theme before paint so dark-mode users don't see a light flash.
          dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("worfix.theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;var l=localStorage.getItem("worfix.lang");if(l)document.documentElement.lang=l}catch(e){}` }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
