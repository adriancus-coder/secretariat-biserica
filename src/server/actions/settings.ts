"use server";

import { revalidatePath } from "next/cache";
import { parsePrototypeJson } from "@/domain/backup";
import type { FormState } from "@/lib/form-state";
import { churchSettingsSchema, SETTINGS_FIELDS } from "@/lib/schemas/settings";
import { writeAudit } from "../audit";
import { importBackup, type ImportMode } from "../backup";
import { prisma } from "../db";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/** Datele organizației și nomenclatoarele (doar administratorul). */
export async function saveChurchSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    const input = parseOrThrow(churchSettingsSchema, Object.fromEntries(formData));
    await prisma.$transaction(async (tx) => {
      const before = await tx.church.findUniqueOrThrow({ where: { id: ctx.user.churchId } });
      const after = await tx.church.update({ where: { id: ctx.user.churchId }, data: input });
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: after.nume,
        action: "UPDATE",
        fields: SETTINGS_FIELDS,
        before,
        after,
      });
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Setările au fost salvate." };
  });
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export interface ImportState extends FormState {
  details?: string[];
}

/** Importul unei copii de siguranță JSON (format prototip sau export al aplicației). */
export async function importDataAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  let details: string[] | undefined;
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    const file = formData.get("fisier");
    const mode: ImportMode = formData.get("mod") === "replace" ? "replace" : "merge";
    if (!(file instanceof File) || file.size === 0) throw new ActionError("Alegeți fișierul JSON de importat.");
    if (file.size > MAX_IMPORT_BYTES) throw new ActionError("Fișierul depășește 20 MB.");
    if (mode === "replace" && formData.get("confirmare") !== "on") {
      throw new ActionError("Pentru înlocuirea datelor, bifați confirmarea.");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      throw new ActionError("Fișier invalid: conținutul nu este JSON.");
    }
    const parsed = parsePrototypeJson(raw);
    if (!parsed.ok) {
      details = parsed.errors;
      throw new ActionError(`Importul a fost oprit: ${parsed.errors.length} probleme în fișier. Nicio modificare nu a fost făcută.`);
    }
    const summary = await importBackup(ctx, parsed.backup, mode);
    details = [...parsed.warnings, ...summary.avertismente];
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Importate: ${summary.persoane} persoane, ${summary.sedinte} ședințe, ${summary.evenimente} evenimente, ${summary.documente} documente, ${summary.grupuri} grupuri, ${summary.mentiuni} mențiuni${summary.setari ? " și setările bisericii" : ""}.`,
    };
  });
  return { ...state, details };
}
