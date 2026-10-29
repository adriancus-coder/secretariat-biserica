import { storedBlocksOf, type StoredBlock } from "./generated-blocks";
import { GENERATED, isGeneratedKind, type GeneratedKind } from "./generated-kinds";
import { storedLayout, type PageLayout } from "./page-layout";

/**
 * GENERATED-EDIT in the JSON backup: `documenteGenerate`, one entry per saved version (`cheie` = the
 * source's key, `blocuri` = the editor's model without any picture or signature, `amprenta` = the data's
 * fingerprint, `document` = the registered act's id). The disciplinary kinds only in the files of users
 * with `disciplina`. Files without it import unchanged. Pure.
 */
export interface BGenerated {
  tip: GeneratedKind;
  cheie: string;
  titlu: string;
  blocuri: StoredBlock[];
  asezare: PageLayout | null;
  amprenta: string;
  /** GENERATED-HASH-STABLE: 2 = the fingerprint of the source's data; absent (older files) = 1, of the printed text. */
  versiuneAmprenta: number;
  document: string | null;
}

export function generatedToJson(rows: readonly { kind: string; sourceKey: string; titlu: string; blocks: unknown; layout: unknown; sourceHash: string; hashVersion: number; documentId: string | null }[]): BGenerated[] {
  return rows.flatMap((r) => {
    const blocuri = storedBlocksOf(r.blocks);
    return isGeneratedKind(r.kind) && blocuri
      ? [{ tip: r.kind, cheie: r.sourceKey, titlu: r.titlu, blocuri, asezare: r.layout ? storedLayout(r.layout) : null, amprenta: r.sourceHash, versiuneAmprenta: r.hashVersion, document: r.documentId }]
      : [];
  });
}

/** null when the file has no `documenteGenerate`; invalid entries are dropped. */
export function parseGeneratedJson(root: unknown): BGenerated[] | null {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).documenteGenerate : undefined;
  if (!Array.isArray(raw)) return null;
  const out: BGenerated[] = [];
  for (const x of raw.slice(0, 5000)) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const blocuri = storedBlocksOf(r.blocuri);
    const cheie = typeof r.cheie === "string" ? r.cheie.slice(0, 400) : "";
    if (!isGeneratedKind(r.tip) || !blocuri || !cheie.startsWith(`${r.tip}:`)) continue;
    out.push({
      tip: r.tip,
      cheie,
      titlu: typeof r.titlu === "string" ? r.titlu.slice(0, 300) : "",
      blocuri,
      asezare: typeof r.asezare === "object" && r.asezare !== null ? storedLayout(r.asezare) : null,
      amprenta: typeof r.amprenta === "string" ? r.amprenta.slice(0, 128) : "",
      versiuneAmprenta: r.versiuneAmprenta === 2 ? 2 : 1,
      document: typeof r.document === "string" ? r.document.slice(0, 64) : null,
    });
  }
  return out;
}

/** The kinds whose key carries a record's id (remapped on import), by the record's collection. */
export const GENERATED_ID_SOURCE: Partial<Record<GeneratedKind, "events" | "groups" | "campaigns" | "discipline">> = {
  eveniment: "events",
  grup: "groups",
  "afis-actualizare": "campaigns",
  "disciplina-convocare": "discipline",
  "disciplina-comunicare": "discipline",
  "disciplina-informare": "discipline",
  "disciplina-proces-verbal": "discipline",
};

/** The key with the record's id replaced (null = the record is not in this church after the import). */
export function remapGeneratedKey(g: BGenerated, idOf: (collection: "events" | "groups" | "campaigns" | "discipline", id: string) => string | null): string | null {
  const collection = GENERATED_ID_SOURCE[g.tip];
  if (!collection) return g.cheie;
  const [, id] = g.cheie.split(":");
  const mapped = id ? idOf(collection, id) : null;
  return mapped ? `${g.tip}:${mapped}` : null;
}

/** Disciplinary versions only for users who may see discipline. */
export const isDisciplineKind = (kind: GeneratedKind) => GENERATED[kind].discipline === true;
