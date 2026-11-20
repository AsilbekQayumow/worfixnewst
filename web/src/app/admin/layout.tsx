"use client";
import { AppShell } from "@/components/shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="admin">{children}</AppShell>;
}
