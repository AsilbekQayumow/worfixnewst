"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { levelTitleKey } from "@/lib/domain/rewards";
import { useFmt, useI18n } from "@/lib/i18n";
import type { Person } from "@/lib/store/api";
import { Avatar } from "./ui";

export function PersonRow({ p, actions, sub }: { p: Person; actions?: ReactNode; sub?: ReactNode }) {
  const { t } = useI18n();
  const f = useFmt();
  return (
    <div className="row-item">
      <Link href={`/app/people/${p.id}`} className="row g12 grow" style={{ minWidth: 0 }}>
        <Avatar name={p.fullName} src={p.avatar} size={40} />
        <span className="stack" style={{ minWidth: 0 }}>
          <span className="truncate" style={{ fontWeight: 500 }}>{p.fullName}</span>
          <span className="t-small secondary truncate">
            {sub ?? <>{t("lvl.short", { n: p.level })} · {t(levelTitleKey(p.level))} · <span className="num">{f.num(p.xp)} XP</span>{p.city ? ` · ${p.city}` : ""}</>}
          </span>
        </span>
      </Link>
      {actions && <div className="row g8" style={{ flex: "none" }}>{actions}</div>}
    </div>
  );
}
