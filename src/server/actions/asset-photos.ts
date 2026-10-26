"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { mb, PHOTOS_CHURCH_QUOTA, PHOTOS_PER_ASSET } from "@/lib/asset-photos";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { PhotoError, processAssetPhoto } from "../asset-photo";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const label = (a: { nrInventar: number; denumire: string }) => `Nr. inv. ${a.nrInventar} — ${a.denumire}`;
const audit = (tx: Tx, ctx: Ctx, asset: { id: string; nrInventar: number; denumire: string }, text: string) =>
  writeAudit(tx, ctx.user, { entity: "ASSET", entityId: asset.id, entityLabel: label(asset), action: "UPDATE", fields: [], extra: { observatie: `${text} la bunul nr. ${asset.nrInventar}` } });

/**
 * "+ Adaugă poză" (write roles): the file is re-encoded on the server (processAssetPhoto: type by content,
 * 15 MB, 120 MP, EXIF rotation then no metadata, 1600 px JPEG + 400 px thumbnail). At most 4 photos per
 * good and 100 MB per church; the first photo is the main one. Audited without the content.
 */
export async function addAssetPhotoAction(assetId: string, formData: FormData): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, assetId);
    const file = formData.get("poza");
    if (!(file instanceof File) || !file.size) throw new ActionError("Alegeți o poză.");
    const asset = await ctx.db.asset.findUnique({ where: { id: assetId }, select: { id: true, nrInventar: true, denumire: true, stare: true } });
    if (!asset) throw new ActionError("Bunul nu mai există în inventar.");
    if (asset.stare === "SCOS_DIN_UZ") throw new ActionError("Bunul a fost scos din uz și nu se mai modifică.");
    if ((await ctx.db.assetPhoto.count({ where: { assetId } })) >= PHOTOS_PER_ASSET) throw new ActionError(`Un bun poate avea cel mult ${PHOTOS_PER_ASSET} poze. Ștergeți una înainte.`);
    let photo;
    try {
      photo = await processAssetPhoto(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      throw e instanceof PhotoError ? new ActionError(e.message) : e;
    }
    const bytes = photo.data.length + photo.thumb.length;
    await ctx.db.$transaction(async (tx) => {
      // Counted again inside the transaction: two uploads at once cannot pass the limits together.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-photos:${ctx.user.churchId}`}))`;
      const [count, used] = await Promise.all([tx.assetPhoto.count({ where: { assetId } }), tx.assetPhoto.aggregate({ _sum: { bytes: true } })]);
      if (count >= PHOTOS_PER_ASSET) throw new ActionError(`Un bun poate avea cel mult ${PHOTOS_PER_ASSET} poze. Ștergeți una înainte.`);
      if ((used._sum.bytes ?? 0) + bytes > PHOTOS_CHURCH_QUOTA) {
        throw new ActionError(`Pozele patrimoniului au ajuns la ${mb(used._sum.bytes ?? 0)} MB din ${mb(PHOTOS_CHURCH_QUOTA)} MB. Ștergeți poze vechi înainte de a adăuga altele.`);
      }
      await tx.assetPhoto.create({
        data: { churchId: ctx.user.churchId, assetId, ordine: count, mime: "image/jpeg", width: photo.width, height: photo.height, bytes, data: new Uint8Array(photo.data), thumb: new Uint8Array(photo.thumb), createdById: ctx.user.id },
      });
      await audit(tx, ctx, asset, "poză adăugată");
    });
    return { ok: true, message: "Poza a fost adăugată." };
  });
  revalidatePath("/patrimoniu", "layout");
  return state;
}

/** Renumbers the photos of a good 0, 1, 2 … in the given order. */
async function reorder(tx: Tx, ids: string[]) {
  for (const [i, id] of ids.entries()) await tx.assetPhoto.update({ where: { id }, data: { ordine: i } });
}

/** "Șterge poza" (write roles, confirmed in the app); the next photo becomes the main one. Audited. */
export async function deleteAssetPhotoAction(photoId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, photoId);
    await ctx.db.$transaction(async (tx) => {
      const p = await tx.assetPhoto.findUnique({ where: { id: photoId }, select: { assetId: true, asset: { select: { id: true, nrInventar: true, denumire: true } } } });
      if (!p) throw new ActionError("Poza nu mai există.");
      await tx.assetPhoto.delete({ where: { id: photoId } });
      await reorder(tx, (await tx.assetPhoto.findMany({ where: { assetId: p.assetId }, orderBy: [{ ordine: "asc" }, { createdAt: "asc" }], select: { id: true } })).map((x) => x.id));
      await audit(tx, ctx, p.asset, "poză ștearsă");
    });
    return { ok: true, message: "Poza a fost ștearsă." };
  });
  revalidatePath("/patrimoniu", "layout");
  return state;
}

/** "Fă poză principală": the photo moves first (ordine 0), the others keep their order. Audited. */
export async function makeMainAssetPhotoAction(photoId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, photoId);
    await ctx.db.$transaction(async (tx) => {
      const p = await tx.assetPhoto.findUnique({ where: { id: photoId }, select: { assetId: true, asset: { select: { id: true, nrInventar: true, denumire: true } } } });
      if (!p) throw new ActionError("Poza nu mai există.");
      const others = await tx.assetPhoto.findMany({ where: { assetId: p.assetId, id: { not: photoId } }, orderBy: [{ ordine: "asc" }, { createdAt: "asc" }], select: { id: true } });
      await reorder(tx, [photoId, ...others.map((x) => x.id)]);
      await audit(tx, ctx, p.asset, "poză principală schimbată");
    });
    return { ok: true, message: "Poza principală a fost schimbată." };
  });
  revalidatePath("/patrimoniu", "layout");
  return state;
}
