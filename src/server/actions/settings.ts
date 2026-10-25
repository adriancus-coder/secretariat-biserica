"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIso, toDbDate } from "@/lib/dates";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";
import type { FormState } from "@/lib/form-state";
import { attendanceRulesInput, churchSettingsSchema, SETTINGS_FIELDS } from "@/lib/schemas/settings";
import { attendanceRulesText, resolveAttendanceRules } from "@/lib/attendance";
import { NOMEN_DEFAULTS } from "@/lib/labels";
import { privacyTemplate } from "@/lib/privacy";
import { writeAudit } from "../audit";
import { importBackup, type ImportMode } from "../backup";
import { parseImportJson } from "../backup-json";
import { prisma } from "../db";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/** Datele organizației și nomenclatoarele (doar administratorul). */
export async function saveChurchSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    const input = parseOrThrow(churchSettingsSchema, Object.fromEntries(formData));
    // Rules only for the meeting types being saved (an empty list means the default types).
    const tipuri = input.tipuriSedinte.length ? input.tipuriSedinte : NOMEN_DEFAULTS.tipuriSedinte;
    const regulaPrezenta = attendanceRulesInput(formData, tipuri);
    await prisma.$transaction(async (tx) => {
      // The slug is the public address of the application form: unique across all churches.
      const clash = await tx.church.findFirst({ where: { slug: input.slug, id: { not: ctx.user.churchId } }, select: { id: true } });
      if (clash) throw new ValidationError({ slug: "Această adresă este deja folosită de altă biserică. Alegeți alta." });
      const before = await tx.church.findUniqueOrThrow({ where: { id: ctx.user.churchId } });
      // The template itself is not stored: the notice then follows changes of the church's details.
      const template = privacyTemplate({ ...input, privacyAdoptedAt: before.privacyAdoptedAt?.toISOString().slice(0, 10) ?? null }).trim();
      const privacyText = input.privacyText.trim() === template ? "" : input.privacyText;
      const after = await tx.church.update({ where: { id: ctx.user.churchId }, data: { ...input, privacyText, regulaPrezenta } });
      const rulesView = (c: typeof before) =>
        attendanceRulesText(resolveAttendanceRules(c.tipuriSedinte.length ? c.tipuriSedinte : NOMEN_DEFAULTS.tipuriSedinte, c.regulaPrezenta));
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: after.nume,
        action: "UPDATE",
        fields: SETTINGS_FIELDS,
        before: { ...before, regulaPrezenta: rulesView(before) },
        after: { ...after, regulaPrezenta: rulesView(after) },
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
    const parsed = parseImportJson(raw);
    if (!parsed.ok) {
      details = parsed.errors;
      throw new ActionError(`Importul a fost oprit: ${parsed.errors.length} probleme în fișier. Nicio modificare nu a fost făcută.`);
    }
    const summary = await importBackup(ctx, parsed.backup, mode, { ...parsed.extras, textFamilies: formData.get("faraFamiliiText") !== "on" });
    details = [...parsed.warnings, ...summary.avertismente];
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Importate: ${summary.persoane} persoane, ${summary.sedinte} ședințe, ${summary.evenimente} evenimente, ${summary.documente} documente, ${summary.grupuri} grupuri, ${summary.mentiuni} mențiuni, ${summary.cereri} cereri, ${summary.familii} familii, ${summary.functii} funcții atribuite${summary.setari ? " și setările bisericii" : ""}.`,
    };
  });
  return { ...state, details };
}

/**
 * "Folosește modelul nou": the church publishes the model notice (version 1.1) filled with its
 * settings, from today ("[data]"). Its own edited text is replaced only by this explicit choice.
 */
export async function adoptPrivacyModelAction(): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    await prisma.$transaction(async (tx) => {
      const before = await tx.church.findUniqueOrThrow({ where: { id: ctx.user.churchId } });
      const after = await tx.church.update({
        where: { id: ctx.user.churchId },
        data: { privacyText: "", privacyVersion: PRIVACY_NOTICE_VERSION, privacyAdoptedAt: toDbDate(todayIso()) },
      });
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: after.nume,
        action: "UPDATE",
        fields: ["privacyText"],
        before,
        after,
        extra: { observatie: `nota de informare: modelul ${PRIVACY_NOTICE_VERSION}` },
      });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath("/", "layout");
  redirect("/setari?salvat=1");
}
