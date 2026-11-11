// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
export type RuleStatus = "VERIFIED" | "NEEDS_CONFIRMATION" | "NOT_VERIFIED";
export type DeadlineStatus =
  "COUNTDOWN_ACTIVE" | "APPROACHING_DEADLINE" | "DEADLINE_PASSED" | "NEEDS_CONFIRMATION" | "RULE_NOT_VERIFIED" | "COMPLETED";

export interface RuleLike {
  id: string;
  ruleKey: string;
  version: number;
  rightCode: string;
  durationHours: number | null;
  calcMethod: string;
  status: RuleStatus;
  effectiveFrom: Date;
  supersededAt: Date | null;
}

const HOUR = 3_600_000;
export const APPROACHING_WINDOW_HOURS = 24; // default murni; nilai runtime dari REMINDER_APPROACHING_HOURS (deadlines/deadline.clock.ts)

/** Pilih aturan yang berlaku pada waktu `at`: versi tertinggi yang sudah efektif dan belum digantikan. */
export function selectRule<T extends RuleLike>(rules: T[], rightCode: string, at: Date): T | undefined {
  return rules
    .filter((r) => r.rightCode === rightCode && r.effectiveFrom <= at && (!r.supersededAt || r.supersededAt > at))
    .sort((a, b) => b.version - a.version)[0];
}

/** Hitung target waktu. Aturan tanpa durasi atau BELUM TERVERIFIKASI tidak menghasilkan hitung mundur. */
export function computeDueAt(rule: Pick<RuleLike, "durationHours" | "calcMethod" | "status">, startedAt: Date, scale = 1): Date | null {
  if (rule.status === "NOT_VERIFIED" || rule.durationHours == null) return null;
  if (rule.calcMethod !== "CALENDAR_HOURS") throw new Error(`calcMethod tidak didukung: ${rule.calcMethod}`);
  return new Date(startedAt.getTime() + Math.round((rule.durationHours * HOUR) / scale)); // scale > 1 hanya untuk demo
}

export function deadlineStatus(
  d: { dueAt: Date | null; completedAt: Date | null; ruleStatus: RuleStatus },
  now: Date,
  approachingMs = APPROACHING_WINDOW_HOURS * HOUR,
): DeadlineStatus {
  if (d.completedAt) return "COMPLETED";
  if (d.dueAt == null || d.ruleStatus === "NOT_VERIFIED") return "RULE_NOT_VERIFIED";
  if (d.ruleStatus === "NEEDS_CONFIRMATION") return "NEEDS_CONFIRMATION";
  const left = d.dueAt.getTime() - now.getTime();
  if (left <= 0) return "DEADLINE_PASSED";
  return left <= approachingMs ? "APPROACHING_DEADLINE" : "COUNTDOWN_ACTIVE";
}

export type ReminderPlan = { kind: "APPROACHING" | "PASSED" | "FOLLOW_UP"; fireAt: Date };
/** Jadwal pengingat. FOLLOW_UP adalah pengingat pribadi, bukan tenggat hukum. `scale` > 1 hanya untuk demo. */
export function planReminders(
  sentAt: Date,
  dueAt: Date | null,
  followUpDays: number,
  o: { scale?: number; approachingHours?: number } = {},
): ReminderPlan[] {
  const { scale = 1, approachingHours = APPROACHING_WINDOW_HOURS } = o;
  const at = (from: Date, ms: number) => new Date(from.getTime() + Math.round(ms / scale));
  const plans: ReminderPlan[] = [{ kind: "FOLLOW_UP", fireAt: at(sentAt, followUpDays * 24 * HOUR) }];
  if (dueAt) {
    const approaching = new Date(dueAt.getTime() - Math.round((approachingHours * HOUR) / scale));
    plans.push({ kind: "APPROACHING", fireAt: approaching > sentAt ? approaching : sentAt });
    plans.push({ kind: "PASSED", fireAt: dueAt });
  }
  return plans;
}
