"use client";
import { useParams } from "next/navigation";
import { MissionDetail } from "@/components/mission-detail";

export default function AppMission() {
  const { id } = useParams<{ id: string }>();
  return <MissionDetail id={id} inApp />;
}
