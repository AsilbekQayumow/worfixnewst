"use client";
/**
 * "My tree": a small tree that grows with verified missions (seed → sprout → sapling → tree → blossom)
 * and droops when its owner has not done a mission for a while. Purely drawn from verified data.
 */
import { useI18n } from "@/lib/i18n";

export const TREE_STAGES = [0, 1, 3, 10, 25] as const;

export function treeOf(count: number, last: string | null | undefined, now = Date.now()) {
  let stage = 0;
  TREE_STAGES.forEach((min, i) => { if (count >= min) stage = i; });
  const days = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;
  const thirst = count === 0 || days === null ? 0 : days >= 21 ? 2 : days >= 7 ? 1 : 0;
  const next = TREE_STAGES[stage + 1] ?? null;
  return { stage, thirst, next, toNext: next === null ? 0 : next - count };
}

const LEAF = ["#4ea35c", "#7d9a4a", "#a39a5a"];
const DEEP = ["#3e8f4c", "#6f8a40", "#8f8650"];

function Art({ stage, thirst }: { stage: number; thirst: number }) {
  const leaf = LEAF[thirst], deep = DEEP[thirst];
  const droop = thirst * 6;
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden className="tree-art" data-stage={stage}>
      <ellipse cx="60" cy="104" rx="38" ry="7" fill="#8a6a4a" opacity=".22" />
      <path d="M34 104C38 94 50 90 60 90S82 94 86 104Z" fill="#9a7350" />
      {stage === 0 && <ellipse cx="60" cy="88" rx="5" ry="3.5" fill="#6a4a2e" />}
      {stage === 1 && (
        <g className="tree-sway">
          <path d="M60 92V74" stroke={deep} strokeWidth="3" strokeLinecap="round" />
          <path d={`M60 78C52 ${70 + droop} 44 ${72 + droop} 42 ${78 + droop}C50 ${82 + droop} 56 81 60 78Z`} fill={leaf} />
          <path d={`M60 76C68 ${68 + droop} 76 ${70 + droop} 78 ${76 + droop}C70 ${80 + droop} 64 79 60 76Z`} fill={leaf} />
        </g>
      )}
      {stage === 2 && (
        <g className="tree-sway">
          <path d="M60 92V56" stroke="#8a5a36" strokeWidth="4" strokeLinecap="round" />
          <path d="M60 74 48 66M60 66 72 58" stroke="#8a5a36" strokeWidth="3" strokeLinecap="round" />
          <circle cx="47" cy={64 + droop / 2} r="10" fill={leaf} /><circle cx="73" cy={56 + droop / 2} r="11" fill={leaf} /><circle cx="60" cy={50 + droop / 3} r="12" fill={deep} />
        </g>
      )}
      {stage >= 3 && (
        <g className="tree-sway">
          <path d="M56 92 58 52H62L64 92Z" fill="#8a5a36" />
          <path d="M60 70 44 58M60 62 77 50" stroke="#8a5a36" strokeWidth="4" strokeLinecap="round" />
          <circle cx="60" cy={40 + droop / 3} r="24" fill={deep} />
          <circle cx="40" cy={54 + droop / 2} r="15" fill={leaf} /><circle cx="80" cy={52 + droop / 2} r="16" fill={leaf} /><circle cx="60" cy={32 + droop / 3} r="16" fill={leaf} />
          {stage === 4 && thirst === 0 && [[46, 40], [70, 30], [82, 50], [38, 56], [60, 52], [56, 26]].map(([x, y], i) => (
            <g key={i} className="tree-bloom" style={{ ["--i" as string]: i }}>
              <circle cx={x} cy={y} r="3.4" fill="#f4a3b8" /><circle cx={x} cy={y} r="1.3" fill="#f5c84a" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

export function MyTree({ count, last, own = true }: { count: number; last: string | null | undefined; own?: boolean }) {
  const { t } = useI18n();
  const tr = treeOf(count, last);
  return (
    <section className="card pad row g16 my-tree" data-thirst={tr.thirst}>
      <div className="tree-box"><Art stage={tr.stage} thirst={tr.thirst} /></div>
      <div className="stack g4 grow" style={{ minWidth: 180 }}>
        <span className="t-small secondary">{t(own ? "tree.title" : "tree.titleOther")}</span>
        <span className="t-h3">{t(`tree.s${tr.stage}`)}</span>
        <span className="t-small secondary">
          {tr.thirst === 2 ? t(own ? "tree.dry" : "tree.dryOther") : tr.thirst === 1 ? t(own ? "tree.thirsty" : "tree.thirstyOther")
            : tr.next === null ? t("tree.max") : t("tree.next", { n: tr.toNext })}
        </span>
      </div>
    </section>
  );
}
