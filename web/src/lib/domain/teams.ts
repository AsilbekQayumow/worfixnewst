/**
 * v6 · Feature 2: team missions. Friends or a group sign up together; each member checks in and sends their own
 * evidence. When at least two members are approved and checked in within 30 minutes of each other, every approved
 * member gets +10% XP (rounded) once. At most three team bonuses a week per person (against XP inflation).
 */
export const TEAM = {
  maxSize: 5,
  minForBonus: 2,
  bonusRate: 0.1,
  checkInWindowMin: 30,
  perWeek: 3,
  /** an invited friend's place is held this long */
  holdHours: 12,
} as const;

export interface TeamMember { userId: string; approved: boolean; startedAt: string | null | undefined; bonusAt?: string | null }

/** Members who get the bonus now (approved, checked in near the others, not yet given, under the weekly cap). */
export function teamBonusFor(members: TeamMember[], weeklyBonuses: (userId: string) => number): string[] {
  if (members.length < TEAM.minForBonus || members.length > TEAM.maxSize) return [];
  const ready = members.filter((m) => m.approved && m.startedAt);
  if (ready.length < TEAM.minForBonus) return [];
  const times = ready.map((m) => Date.parse(m.startedAt!)).sort((a, b) => a - b);
  // the largest group of check-ins that fits in the window
  let best = 0, bestFrom = 0;
  for (let i = 0, j = 0; j < times.length; j++) {
    while (times[j] - times[i] > TEAM.checkInWindowMin * 60_000) i++;
    if (j - i + 1 > best) { best = j - i + 1; bestFrom = times[i]; }
  }
  if (best < TEAM.minForBonus) return [];
  const inWindow = (m: TeamMember) => { const t = Date.parse(m.startedAt!); return t >= bestFrom && t - bestFrom <= TEAM.checkInWindowMin * 60_000; };
  return ready.filter((m) => inWindow(m) && !m.bonusAt && weeklyBonuses(m.userId) < TEAM.perWeek).map((m) => m.userId);
}

export const teamBonusXp = (missionXp: number) => Math.round(missionXp * TEAM.bonusRate);

/** Size of a team that may still form on a mission with these free places. */
export const teamRoom = (capacity: number, taken: number) => Math.max(0, Math.min(TEAM.maxSize, capacity - taken));

/** The new leader when the leader leaves: the member who joined first. */
export function nextLeader(members: { userId: string; joinedAt: string }[], leaving: string) {
  return members.filter((m) => m.userId !== leaving).sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt))[0]?.userId ?? null;
}
