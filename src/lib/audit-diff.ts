/** Calculul diferențelor pentru jurnalul de modificări (funcții pure). */

export type AuditValue = string | number | boolean | null;
export type AuditSnapshot = Record<string, AuditValue>;
/** Pentru UPDATE: câmp → [valoarea veche, valoarea nouă]. */
export type AuditChanges = Record<string, [AuditValue, AuditValue]>;

function normalize(v: unknown): AuditValue {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.length ? v.join(", ") : null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return JSON.stringify(v);
}

/** Instantaneul câmpurilor completate (pentru CREATE / DELETE). */
export function snapshot(record: Record<string, unknown>, fields: readonly string[]): AuditSnapshot {
  const out: AuditSnapshot = {};
  for (const f of fields) {
    const v = normalize(record[f]);
    if (v !== null) out[f] = v;
  }
  return out;
}

/** Câmpurile modificate între două versiuni ale unei înregistrări. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>, fields: readonly string[]): AuditChanges {
  const out: AuditChanges = {};
  for (const f of fields) {
    const a = normalize(before[f]);
    const b = normalize(after[f]);
    if (a !== b) out[f] = [a, b];
  }
  return out;
}
