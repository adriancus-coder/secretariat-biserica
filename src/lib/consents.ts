/** The current answer per consent kind: the latest row (a withdrawn one counts as withdrawn). Pure. */
import type { ConsentKindKey } from "./labels";

export interface ConsentRow {
  kind: ConsentKindKey;
  granted: boolean;
  givenAt: Date;
  createdAt: Date;
  source: "ONLINE" | "PAPER" | "STAFF";
  withdrawnAt: Date | null;
  givenBy?: { nume: string; prenume: string } | null;
}

export type ConsentState = "DA" | "NU" | "RETRAS" | "NEEXPRIMAT";

export function currentConsents<R extends ConsentRow>(rows: readonly R[]): Partial<Record<ConsentKindKey, R>> {
  const out: Partial<Record<ConsentKindKey, R>> = {};
  for (const r of rows) {
    const cur = out[r.kind];
    if (!cur || r.givenAt > cur.givenAt || (r.givenAt.getTime() === cur.givenAt.getTime() && r.createdAt > cur.createdAt)) out[r.kind] = r;
  }
  return out;
}

export function consentState(row: ConsentRow | undefined): ConsentState {
  if (!row) return "NEEXPRIMAT";
  if (row.withdrawnAt) return "RETRAS";
  return row.granted ? "DA" : "NU";
}

export const CONSENT_STATE_LABEL: Record<ConsentState, string> = { DA: "Da", NU: "Nu", RETRAS: "Retras", NEEXPRIMAT: "Neexprimat" };
