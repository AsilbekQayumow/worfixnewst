"use client";
import { useParams } from "next/navigation";
import { MissionDetail } from "@/components/mission-detail";

export default function PublicMission() {
  const { id } = useParams<{ id: string }>();
  return <div className="container" style={{ paddingTop: 32 }}><MissionDetail id={id} inApp={false} /></div>;
}
