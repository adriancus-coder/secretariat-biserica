import { richToPlain, type RichDoc } from "./rich-text";
import { storedRich } from "./schemas/rich-text";

/**
 * Document fields beyond the prototype's JSON, on each document next to `text`: `textRich` (the
 * editor's document). Files without it import unchanged. Pure.
 */

export interface DocumentExtra {
  textRich?: RichDoc;
}

/** Adds the extra fields to the exported documents (in place). */
export function addDocumentExtras(documents: Record<string, Record<string, unknown>>, extra: ReadonlyMap<string, DocumentExtra>) {
  for (const [id, x] of extra) {
    const d = documents[id];
    if (!d) continue;
    if (x.textRich) d.textRich = x.textRich;
  }
}

/**
 * Document id (as in the file) → its extra fields. Only documents that pass the editor's schema are
 * kept, and only when their plain projection is not empty; they then decide the plain text.
 */
export function parseDocumentExtras(root: unknown): Map<string, DocumentExtra> {
  const out = new Map<string, DocumentExtra>();
  const c = typeof root === "object" && root !== null ? (root as Record<string, unknown>).documents : undefined;
  if (!c || typeof c !== "object") return out;
  const entries: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  for (const [key, raw] of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const d = raw as Record<string, unknown>;
    const doc = storedRich(d.textRich);
    const plain = doc ? richToPlain(doc) : "";
    if (doc && plain.trim() && plain.length <= 100000) out.set(String(d.id ?? key).trim(), { textRich: doc });
  }
  return out;
}
