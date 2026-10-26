/**
 * The inventory in the JSON backup (PATRIMONY): `patrimoniu` = one entry per good, the responsible
 * person by the file's member id. Files without it import unchanged.
 */
export interface BAsset {
  id: string;
  nrInventar: number;
  denumire: string;
  categorie: string;
  cantitate: number;
  valoare: number | null;
  dataIntrarii: string | null;
  provenienta: "CUMPARARE" | "DONATIE" | "ALTELE";
  loc: string;
  stare: "BUN" | "NECESITA_REPARATII" | "SCOS_DIN_UZ";
  dataIesirii: string | null;
  motivIesirii: string;
  observatii: string;
  responsabil: string;
  membru: string | null;
}

export function assetsToJson(rows: readonly (Omit<BAsset, "membru"> & { responsabilId: string | null })[]): BAsset[] {
  return rows.map(({ responsabilId, ...a }) => ({ ...a, membru: responsabilId }));
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const ORIGINS = ["CUMPARARE", "DONATIE", "ALTELE"] as const;
const STATES = ["BUN", "NECESITA_REPARATII", "SCOS_DIN_UZ"] as const;

/** null when the file has no `patrimoniu`; goods without a name or an inventory number are dropped. */
export function parseAssetsJson(root: unknown): BAsset[] | null {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).patrimoniu : undefined;
  if (!Array.isArray(raw)) return null;
  const out: BAsset[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const id = str(r.id, 64);
    const nr = Number(r.nrInventar);
    const denumire = str(r.denumire, 200);
    if (!id || !denumire || !Number.isInteger(nr) || nr < 1) continue;
    const cantitate = Number(r.cantitate);
    const valoare = r.valoare === null || r.valoare === undefined ? null : Number(r.valoare);
    const stare = (STATES as readonly unknown[]).includes(r.stare) ? (r.stare as BAsset["stare"]) : "BUN";
    out.push({
      id,
      nrInventar: nr,
      denumire,
      categorie: str(r.categorie, 80) || "Altele",
      cantitate: Number.isInteger(cantitate) && cantitate > 0 ? cantitate : 1,
      valoare: valoare !== null && Number.isInteger(valoare) && valoare >= 0 ? valoare : null,
      dataIntrarii: date(r.dataIntrarii),
      provenienta: (ORIGINS as readonly unknown[]).includes(r.provenienta) ? (r.provenienta as BAsset["provenienta"]) : "ALTELE",
      loc: str(r.loc, 200),
      stare,
      dataIesirii: stare === "SCOS_DIN_UZ" ? date(r.dataIesirii) : null,
      motivIesirii: stare === "SCOS_DIN_UZ" ? str(r.motivIesirii, 300) : "",
      observatii: str(r.observatii, 2000),
      responsabil: str(r.responsabil, 120),
      membru: typeof r.membru === "string" && r.membru ? r.membru.slice(0, 64) : null,
    });
  }
  return out;
}
