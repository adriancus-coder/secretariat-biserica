import { storedLayout, type PageLayout } from "./page-layout";
import { richToPlain, type RichDoc } from "./rich-text";
import { storedRich } from "./schemas/rich-text";

/**
 * Document fields beyond the prototype's JSON, on each document next to `text`: `textRich` (the
 * editor's document), `asezare` (its own page layout) and, for a document not approved by the
 * pastor, `stare` (+ `motivRespingere`). Files without them import unchanged (an absent state is an
 * issued, approved document). Signatures are never exported. Pure.
 */

export interface DocumentExtra {
  textRich?: RichDoc;
  /** The document's own page layout; absent = the church's default. */
  asezare?: PageLayout;
  /** Only a document not yet approved; a sent one comes back as a draft (to be sent again). */
  stare?: "CIORNA" | "RESPINS";
  motivRespingere?: string;
  /** GENERATED-EDIT: a registered disciplinary act; only in the files (and imports) of users with `disciplina`. */
  confidential?: true;
}

/** The exported state of a document: nothing for an approved one. */
export function exportedState(stare: string, motiv: string | null): Pick<DocumentExtra, "stare" | "motivRespingere"> {
  if (stare === "APROBAT") return {};
  if (stare === "RESPINS") return { stare: "RESPINS", ...(motiv ? { motivRespingere: motiv } : {}) };
  return { stare: "CIORNA" };
}

/** Adds the extra fields to the exported documents (in place). */
export function addDocumentExtras(documents: Record<string, Record<string, unknown>>, extra: ReadonlyMap<string, DocumentExtra>) {
  for (const [id, x] of extra) {
    const d = documents[id];
    if (!d) continue;
    if (x.textRich) d.textRich = x.textRich;
    if (x.asezare) d.asezare = x.asezare;
    if (x.stare) d.stare = x.stare;
    if (x.motivRespingere) d.motivRespingere = x.motivRespingere;
    if (x.confidential) d.confidential = true;
  }
}

/**
 * Document id (as in the file) → its extra fields. Only rich documents that pass the editor's schema
 * are kept, and only when their plain projection is not empty; they then decide the plain text.
 */
export function parseDocumentExtras(root: unknown): Map<string, DocumentExtra> {
  const out = new Map<string, DocumentExtra>();
  const c = typeof root === "object" && root !== null ? (root as Record<string, unknown>).documents : undefined;
  if (!c || typeof c !== "object") return out;
  const entries: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  for (const [key, raw] of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const d = raw as Record<string, unknown>;
    const x: DocumentExtra = {};
    const doc = storedRich(d.textRich);
    const plain = doc ? richToPlain(doc) : "";
    if (doc && plain.trim() && plain.length <= 100000) x.textRich = doc;
    if (typeof d.asezare === "object" && d.asezare !== null) x.asezare = storedLayout(d.asezare);
    if (d.stare === "CIORNA" || d.stare === "DE_SEMNAT") x.stare = "CIORNA";
    if (d.stare === "RESPINS") {
      x.stare = "RESPINS";
      if (typeof d.motivRespingere === "string" && d.motivRespingere.trim()) x.motivRespingere = d.motivRespingere.trim().slice(0, 1000);
    }
    if (d.confidential === true) x.confidential = true;
    if (x.textRich || x.asezare || x.stare || x.confidential) out.set(String(d.id ?? key).trim(), x);
  }
  return out;
}
