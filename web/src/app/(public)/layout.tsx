import { SiteFrame } from "@/components/site";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
