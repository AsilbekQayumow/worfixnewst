"use client";
import { AppShell } from "@/components/shell";

export default function VolunteerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="volunteer">{children}</AppShell>;
}
