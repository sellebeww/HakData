// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { FieldDef } from "./rights.catalog";

export class LetterValidationError extends Error {
  constructor(public missing: string[]) {
    super(`Kolom wajib belum diisi: ${missing.join(", ")}`);
  }
}

export function validateFields(defs: FieldDef[], values: Record<string, string>) {
  const missing = defs.filter((d) => d.required && !String(values[d.key] ?? "").trim()).map((d) => d.label);
  if (missing.length) throw new LetterValidationError(missing);
}

/** Render {{placeholder}}. Placeholder opsional yang kosong menjadi "-". Placeholder tak dikenal = galat (template rusak). */
export function renderLetter(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    if (!(k in values)) throw new Error(`Placeholder tidak dikenal di template: ${k}`);
    return String(values[k] ?? "").trim() || "-";
  });
}
