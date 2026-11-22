import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WORFIX",
    short_name: "WORFIX",
    description: "Atrofingizdagi ko'ngillilik missiyalari: bajaring, isbotlang, sertifikat oling.",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "uz",
    background_color: "#141310",
    theme_color: "#141310",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Xarita", url: "/app/map" },
      { name: "Xabarlar", url: "/app/chat" },
    ],
  };
}
