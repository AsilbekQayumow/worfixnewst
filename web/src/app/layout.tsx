import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Onest, Unbounded } from "next/font/google";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa";
import "./globals.css";

const onest = Onest({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--font-onest", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin", "latin-ext", "cyrillic"], weight: ["400", "500"], variable: "--font-unbounded", display: "swap" });
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
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f3ec" }, { media: "(prefers-color-scheme: dark)", color: "#141310" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning className={`${onest.variable} ${unbounded.variable} ${mono.variable}`}>
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
