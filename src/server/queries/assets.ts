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
} as const;

type Row = { dataIntrarii: Date | null; dataIesirii: Date | null; responsabil: string; responsabilP: { nume: string; prenume: string } | null };
const toRow = <T extends Row>({ responsabilP, ...a }: T) => ({
  ...a,
  dataIntrarii: fromDbDate(a.dataIntrarii),
  dataIesirii: fromDbDate(a.dataIesirii),
  responsabil: responsabilP ? `${responsabilP.nume} ${responsabilP.prenume}`.trim() : a.responsabil,
});

/** Every good of the inventory (PATRIMONY), in use or not. */
export async function loadAssets(ctx: Ctx): Promise<AssetRow[]> {
  return (await ctx.db.asset.findMany({ select: SELECT })).map(toRow);
}

export async function getAsset(ctx: Ctx, id: string) {
  const a = await ctx.db.asset.findUnique({ where: { id }, select: { ...SELECT, observatii: true, responsabilId: true } });
  return a ? toRow(a) : null;
}

export async function nextInventoryNumber(db: Ctx["db"]): Promise<number> {
  return ((await db.asset.aggregate({ _max: { nrInventar: true } }))._max.nrInventar ?? 0) + 1;
}
