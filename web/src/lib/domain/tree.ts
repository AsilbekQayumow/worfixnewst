/** "My tree": grows with verified missions, gets thirsty when there are none for a while. Shared by the app and the widget endpoint. */
export const TREE_STAGES = [0, 1, 3, 10, 25] as const;

export function treeOf(count: number, last: string | null | undefined, now = Date.now()) {
  let stage = 0;
  TREE_STAGES.forEach((min, i) => { if (count >= min) stage = i; });
  const days = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;
  const thirst = count === 0 || days === null ? 0 : days >= 21 ? 2 : days >= 7 ? 1 : 0;
  const next = TREE_STAGES[stage + 1] ?? null;
  return { stage, thirst, next, toNext: next === null ? 0 : next - count };
}
