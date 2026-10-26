/**
 * The correspondence register in the JSON backup (CORRESPONDENCE-REGISTER): `corespondenta` = one entry
 * per row with the file's ids for the document, the answered entry and the member. Metadata only.
 * Files without it import unchanged.
 */
export interface BCorrespondence {
  id: string;
  nr: number;
  an: number;
  data: string;
  directie: "INTRARE" | "IESIRE";
  dela: string;
  catre: string;
  subiect: string;
  rezolvare: string;
  document: string | null;
  raspunsLa: string | null;
  membru: string | null;
}

export function correspondenceToJson(
  rows: readonly { id: string; nr: number; an: number; data: string; directie: string; dela: string; catre: string; subiect: string; rezolvare: string; documentId: string | null; raspunsLaId: string | null; personId: string | null }[],
): BCorrespondence[] {
  return rows.map((r) => ({
    id: r.id,
    nr: r.nr,
    an: r.an,
    data: r.data,
    directie: r.directie === "IESIRE" ? "IESIRE" : "INTRARE",
    dela: r.dela,
    catre: r.catre,
    subiect: r.subiect,
    rezolvare: r.rezolvare,
    document: r.documentId,
    raspunsLa: r.raspunsLaId,
    membru: r.personId,
  }));
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ref = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 64) : null);

/** null when the file has no `corespondenta`; entries without a subject, a date or a number are dropped. */
export function parseCorrespondenceJson(root: unknown): BCorrespondence[] | null {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).corespondenta : undefined;
  if (!Array.isArray(raw)) return null;
  const out: BCorrespondence[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const data = str(r.data, 10);
    const nr = Number(r.nr);
    const id = str(r.id, 64);
    const subiect = str(r.subiect, 300);
    if (!id || !subiect || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isInteger(nr) || nr < 1) continue;
    out.push({
      id,
      nr,
      an: Number(data.slice(0, 4)),
      data,
      directie: r.directie === "IESIRE" ? "IESIRE" : "INTRARE",
      dela: str(r.dela, 200),
      catre: str(r.catre, 200),
      subiect,
      rezolvare: str(r.rezolvare, 200),
      document: ref(r.document),
      raspunsLa: ref(r.raspunsLa),
      membru: ref(r.membru),
    });
  }
  return out;
}
