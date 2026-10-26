import "server-only";
import { fromDbDate } from "@/lib/dates";
import type { AssetRow } from "@/lib/patrimony";
import type { Ctx } from "../session";

const SELECT = {
  id: true,
  nrInventar: true,
  denumire: true,
  categorie: true,
  cantitate: true,
  valoare: true,
  dataIntrarii: true,
  provenienta: true,
  loc: true,
  stare: true,
  dataIesirii: true,
  motivIesirii: true,
  responsabil: true,
  responsabilP: { select: { nume: true, prenume: true } },
  /** PATRIMONY-PHOTOS: the main photo (ordine 0) for the list's thumbnail. */
  photos: { orderBy: { ordine: "asc" }, take: 1, select: { id: true } },
} as const;

type Row = { dataIntrarii: Date | null; dataIesirii: Date | null; responsabil: string; responsabilP: { nume: string; prenume: string } | null; photos: { id: string }[] };
function toRow<T extends Row>(row: T): Omit<T, "responsabilP" | "photos" | "dataIntrarii" | "dataIesirii"> & { dataIntrarii: string | null; dataIesirii: string | null; responsabil: string; photoId: string | null } {
  const { responsabilP, photos, ...a } = row;
  return {
    ...(a as Omit<T, "responsabilP" | "photos" | "dataIntrarii" | "dataIesirii">),
    photoId: photos[0]?.id ?? null,
    dataIntrarii: fromDbDate(a.dataIntrarii),
    dataIesirii: fromDbDate(a.dataIesirii),
    responsabil: responsabilP ? `${responsabilP.nume} ${responsabilP.prenume}`.trim() : a.responsabil,
  };
}

/** Every good of the inventory (PATRIMONY), in use or not. */
export async function loadAssets(ctx: Ctx): Promise<AssetRow[]> {
  return (await ctx.db.asset.findMany({ select: SELECT })).map(toRow);
}

export async function getAsset(ctx: Ctx, id: string) {
  const a = await ctx.db.asset.findUnique({ where: { id }, select: { ...SELECT, observatii: true, responsabilId: true } });
  if (!a) return null;
  const photos = await ctx.db.assetPhoto.findMany({ where: { assetId: id }, orderBy: [{ ordine: "asc" }, { createdAt: "asc" }], select: { id: true, width: true, height: true } });
  return { ...toRow(a), photos };
}

export async function nextInventoryNumber(db: Ctx["db"]): Promise<number> {
  return ((await db.asset.aggregate({ _max: { nrInventar: true } }))._max.nrInventar ?? 0) + 1;
}
