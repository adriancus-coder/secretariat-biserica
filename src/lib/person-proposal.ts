/**
 * Pastor proposals (Statut art. 23 alin. 3): the person form saved by the secretary is kept as
 * field → value and replayed through the same save when the pastor approves. Pure.
 */

/** Form fields that steer one submission and are never part of a stored proposal. */
const CONTROL_FIELDS = new Set(["cerere", "propunere", "fortat", "din", "dupa"]);

/** The person form as stored: text fields only (Next.js's own `$ACTION_…` fields are left out). */
export function formEntries(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string" || CONTROL_FIELDS.has(k) || k.startsWith("$")) continue;
    out[k] = k in out ? `${out[k]}\n${v}` : v;
  }
  return out;
}

/** A stored proposal back as a form (for the replay on approval). */
export function entriesFormData(entries: unknown, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  if (entries && typeof entries === "object" && !Array.isArray(entries)) {
    for (const [k, v] of Object.entries(entries)) if (typeof v === "string" && !CONTROL_FIELDS.has(k) && !k.startsWith("$")) fd.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

type EntryExit = { modIntrare: string | null; dataMembru?: string | null; modIesire: string | null; dataIesire?: string | null };

/**
 * Whether a save needs the pastor's confirmation: an entry becoming Reabilitare spirituală
 * (REPRIMIRE) or an exit becoming Excludere — for a new person (`before` null) or a change.
 */
export function proposalKind(before: EntryExit | null, after: EntryExit): "REABILITARE" | "EXCLUDERE" | null {
  if (after.modIesire === "EXCLUDERE" && (before?.modIesire !== "EXCLUDERE" || (before.dataIesire ?? null) !== (after.dataIesire ?? null))) return "EXCLUDERE";
  if (after.modIntrare === "REPRIMIRE" && (before?.modIntrare !== "REPRIMIRE" || (before.dataMembru ?? null) !== (after.dataMembru ?? null))) return "REABILITARE";
  return null;
}

/** The register fields a reabilitare / excludere is about, shown first on the proposal page. */
export const PROPOSAL_KEY_FIELDS = ["statut", "modIntrare", "dataMembru", "intrareMeetingId", "modIesire", "dataIesire", "iesireMeetingId", "bisericaDestinatie"] as const;

/**
 * Current → proposed for the key fields (only those that differ, or are set for a new person), and
 * how many other fields of the form differ.
 */
export function proposalChanges(current: Record<string, string> | null, proposed: Record<string, string>) {
  const key = new Set<string>(PROPOSAL_KEY_FIELDS);
  const changes = PROPOSAL_KEY_FIELDS.map((f) => ({ field: f, before: current?.[f] ?? "", after: proposed[f] ?? "" })).filter((c) => c.before !== c.after);
  const others = current
    ? Object.keys(proposed).filter((f) => !key.has(f) && f in current && (current[f] ?? "") !== (proposed[f] ?? "")).length
    : 0;
  return { changes, others };
}
