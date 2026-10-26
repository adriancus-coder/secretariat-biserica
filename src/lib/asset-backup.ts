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

/**
 * PATRIMONY-PHOTOS: `patrimoniuPoze` only when the export asks for it ("Include pozele patrimoniului"):
 * the full image of each photo in base64 (the thumbnail is made again on import). Never in the art. 15
 * copy: the photos of the goods are not personal data.
 */
export interface BAssetPhoto {
  id: string;
  bun: string;
  ordine: number;
  data: string;
}

export function assetPhotosToJson(rows: readonly { id: string; assetId: string; ordine: number; data: Uint8Array }[]): BAssetPhoto[] {
  return rows.map((p) => ({ id: p.id, bun: p.assetId, ordine: p.ordine, data: Buffer.from(p.data).toString("base64") }));
}

/** null when the file has no `patrimoniuPoze`; malformed entries are dropped (the server checks each image again). */
export function parseAssetPhotosJson(root: unknown): BAssetPhoto[] | null {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).patrimoniuPoze : undefined;
  if (!Array.isArray(raw)) return null;
  const out: BAssetPhoto[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.slice(0, 64) : "";
    const bun = typeof r.bun === "string" ? r.bun.slice(0, 64) : "";
    const data = typeof r.data === "string" && /^[A-Za-z0-9+/=]+$/.test(r.data) ? r.data : "";
    const ordine = Number(r.ordine);
    if (!id || !bun || !data) continue;
    out.push({ id, bun, ordine: Number.isInteger(ordine) && ordine >= 0 ? ordine : 99, data });
  }
  return out;
}
