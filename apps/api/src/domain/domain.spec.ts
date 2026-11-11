// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { computeDueAt, deadlineStatus, planReminders, selectRule, RuleLike } from "./deadline.engine";
import { assertTransition, canTransition } from "./request.state";
import { renderLetter, validateFields, LetterValidationError } from "./letter";
import { RIGHTS } from "./rights.catalog";

const d = (s: string) => new Date(s);
const rule = (o: Partial<RuleLike> = {}): RuleLike => ({ id: "r1", ruleKey: "ACCESS", version: 1, rightCode: "ACCESS", durationHours: 72,
  calcMethod: "CALENDAR_HOURS", status: "VERIFIED", effectiveFrom: d("2022-10-17"), supersededAt: null, ...o });

describe("deadline engine", () => {
  it("menambah 72 jam kalender", () => expect(computeDueAt(rule(), d("2026-11-11T10:00:00Z"))).toEqual(d("2026-11-14T10:00:00Z")));
  it("tidak menghitung bila belum terverifikasi", () => expect(computeDueAt(rule({ status: "NOT_VERIFIED" }), d("2026-11-11"))).toBeNull());
  it("tidak menghitung bila tanpa durasi", () => expect(computeDueAt(rule({ durationHours: null }), d("2026-11-11"))).toBeNull());
  it("menolak calcMethod asing", () => expect(() => computeDueAt(rule({ calcMethod: "BUSINESS_DAYS" }), d("2026-11-11"))).toThrow());
  it("memilih versi tertinggi yang sudah efektif dan belum digantikan", () => {
    const v1 = rule({ id: "a", version: 1, supersededAt: d("2027-01-16") });
    const v2 = rule({ id: "b", version: 2, effectiveFrom: d("2027-01-16"), durationHours: 48 });
    expect(selectRule([v1, v2], "ACCESS", d("2026-12-01"))?.id).toBe("a");
    expect(selectRule([v1, v2], "ACCESS", d("2027-02-01"))?.id).toBe("b");
    expect(selectRule([v1, v2], "DELETE", d("2027-02-01"))).toBeUndefined();
  });
  it("status tenggat", () => {
    const due = d("2026-11-14T10:00:00Z"); const base = { dueAt: due, completedAt: null, ruleStatus: "VERIFIED" as const };
    expect(deadlineStatus(base, d("2026-11-11T10:00:00Z"))).toBe("COUNTDOWN_ACTIVE");
    expect(deadlineStatus(base, d("2026-11-13T12:00:00Z"))).toBe("APPROACHING_DEADLINE");
    expect(deadlineStatus(base, d("2026-11-14T10:00:00Z"))).toBe("DEADLINE_PASSED");
    expect(deadlineStatus({ ...base, completedAt: d("2026-11-12") }, d("2026-11-20"))).toBe("COMPLETED");
    expect(deadlineStatus({ ...base, dueAt: null, ruleStatus: "NOT_VERIFIED" }, d("2026-11-11"))).toBe("RULE_NOT_VERIFIED");
    expect(deadlineStatus({ ...base, ruleStatus: "NEEDS_CONFIRMATION" }, d("2026-11-11"))).toBe("NEEDS_CONFIRMATION");
  });
  it("jadwal pengingat: verified punya 3, tanpa tenggat hanya follow-up", () => {
    const sent = d("2026-11-11T10:00:00Z");
    expect(planReminders(sent, d("2026-11-14T10:00:00Z"), 14).map((p) => p.kind).sort()).toEqual(["APPROACHING", "FOLLOW_UP", "PASSED"]);
    expect(planReminders(sent, null, 7)).toEqual([{ kind: "FOLLOW_UP", fireAt: d("2026-11-18T10:00:00Z") }]);
  });
});

describe("state machine", () => {
  it("alur normal", () => { ["DRAFT>REVIEWED", "REVIEWED>SENT", "SENT>RESPONDED", "RESPONDED>COMPLETED", "COMPLETED>CLOSED"].forEach((p) => { const [a, b] = p.split(">"); expect(canTransition(a as never, b as never)).toBe(true); }); });
  it("menolak lompatan", () => { expect(canTransition("DRAFT", "SENT")).toBe(false); expect(() => assertTransition("CLOSED", "DRAFT")).toThrow(); });
});

describe("generator surat", () => {
  it("setiap hak punya template yang semua placeholdernya terpenuhi", () => {
    for (const r of RIGHTS) {
      const vals: Record<string, string> = { companyName: "PT Demo", subject: "x", city: "Jakarta", date: "1 Januari 2026" };
      r.fields.forEach((f) => (vals[f.key] = f.required ? "isi" : ""));
      const out = renderLetter(r.templateBody, vals);
      expect(out).not.toMatch(/\{\{/);
      expect(out).toMatch(/UU No\. 27 Tahun 2022|Undang-Undang Nomor 27 Tahun 2022/);
    }
  });
  it("tidak ada bahasa mengancam", () => RIGHTS.forEach((r) => expect(r.templateBody.toLowerCase()).not.toMatch(/gugat|somasi|pidana|ancam/)));
  it("validasi kolom wajib", () => expect(() => validateFields(RIGHTS[0].fields, { fullName: "A" })).toThrow(LetterValidationError));
  it("placeholder tak dikenal gagal", () => expect(() => renderLetter("{{x}}", {})).toThrow());
});
