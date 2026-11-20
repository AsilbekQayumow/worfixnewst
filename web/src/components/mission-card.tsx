"use client";
import Link from "next/link";
import type { Category, Difficulty, GeoPoint } from "@/lib/domain/types";
import { useFmt, useI18n } from "@/lib/i18n";
import { Icon } from "./icons";
import { CategoryTag, Coins, DifficultyTag } from "./ui";

export interface MissionCardData {
  id: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  location: string;
  coordinates: GeoPoint | null;
  date: string;
  duration: number;
  rewardXP: number;
  rewardPoints: number;
  capacity: number;
  participantsCount: number;
  organizationName?: string;
  source?: "organization" | "agent";
}

export function MissionCard({ m, href, aside }: { m: MissionCardData; href: string; aside?: React.ReactNode }) {
  const { t } = useI18n();
  const f = useFmt();
  const left = Math.max(0, m.capacity - m.participantsCount);
  return (
    <Link href={href} className="mcard">
      <div className="row between g8">
        <CategoryTag category={m.category} />
        <DifficultyTag difficulty={m.difficulty} />
      </div>
      <div className="stack g8">
        <h3 className="mcard-title">{m.title}</h3>
        <span className="row g8 t-small secondary"><Icon name="pin" size={16} /><span className="truncate">{m.location}</span></span>
        <span className="row g8 t-small secondary"><Icon name="calendar" size={16} /><span>{f.dayTime(m.date)} · {f.duration(m.duration)}</span></span>
      </div>
      {m.coordinates && <span className="t-meta">{f.coords(m.coordinates.lat, m.coordinates.lng)}</span>}
      <div className="mcard-foot">
        <span className="reward">
          <span className="xp num">+{m.rewardXP} XP</span>
          <Coins value={`+${m.rewardPoints}`} size={14} />
        </span>
        {aside ?? (
          <span className="t-small muted">
            {m.source === "agent" ? t("m.yours") : left > 0 ? t("m.spotsLeft", { n: left }) : t("m.full")}
          </span>
        )}
      </div>
    </Link>
  );
}
