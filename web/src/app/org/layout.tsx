"use client";
import { AppShell } from "@/components/shell";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="organization">{children}</AppShell>;
}
