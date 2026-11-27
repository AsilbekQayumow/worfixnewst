import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa";
// Self-hosted (not next/font/google): a build in a sandboxed CI runner can't always reach
// fonts.googleapis.com, and next/font/google's build-time fetch has no graceful fallback for that.
// These npm packages bundle the actual woff2 files, so the build never touches the network for fonts.
import "@fontsource-variable/nunito/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./globals.css";
import "./theme-play.css";
import "./theme-winter.css";
import { SEASON_SCRIPT } from "@/lib/season/winter";

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
    <html lang="uz" suppressHydrationWarning>
      <head>
        <script
          // Set the theme before paint so dark-mode users don't see a light flash.
          dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("worfix.theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;var l=localStorage.getItem("worfix.lang");if(l)document.documentElement.lang=l}catch(e){}${SEASON_SCRIPT}` }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
