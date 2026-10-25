"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentConsents } from "@/lib/consents";
import { todayIso, toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { CONSENT_KINDS, CONSENT_LABEL, OPTIONAL_CONSENTS, type ConsentKindKey } from "@/lib/labels";
import { idSchema, optionalId, requiredDate } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

const answer = z.enum(["da", "nu", ""]).catch("");

/**
 * "Înregistrează acord pe hârtie": the answers written on paper (source PAPER) with their date; an
 * unanswered consent is left as it is. For a minor, the parent who signed. Audited on the person.
 */
export async function recordPaperConsentAction(personId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let done = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    const date = parseOrThrow(requiredDate("Completați data formularului."), formData.get("data") ?? "");
    if (date > todayIso()) throw new ValidationError({ data: "Data nu poate fi în viitor." });
    const givenBy = parseOrThrow(optionalId, formData.get("datDe") ?? "");
    const rows: { kind: ConsentKindKey; granted: boolean }[] = [];
    if (formData.get("INFO_NOTE") === "on") rows.push({ kind: "INFO_NOTE", granted: true });
    for (const k of OPTIONAL_CONSENTS) {
      const a = answer.parse(formData.get(k) ?? "");
      if (a) rows.push({ kind: k, granted: a === "da" });
    }
    if (!rows.length) throw new ActionError("Bifați nota de informare sau alegeți cel puțin un răspuns.");
    await ctx.db.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId }, select: { nume: true, prenume: true } });
      if (!person) throw new ActionError("Persoana nu mai există în registru.");
      if (givenBy && !(await tx.person.findUnique({ where: { id: givenBy }, select: { id: true } }))) throw new ValidationError({ datDe: "Persoana aleasă nu mai există." });
      await tx.consent.createMany({
        data: rows.map((r) => ({
          ...r,
          churchId: ctx.user.churchId,
          personId,
          givenAt: toDbDate(date)!,
          source: "PAPER" as const,
          textVersion: "hârtie",
          givenByPersonId: givenBy,
          createdById: ctx.user.id,
        })),
      });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: personId,
        entityLabel: memberName(person),
        action: "UPDATE",
        fields: [],
        extra: { acorduri: rows.map((r) => `${CONSENT_LABEL[r.kind]}: ${r.granted ? "Da" : "Nu"}`).join("; "), sursa: `formular pe hârtie din ${date}` },
      });
    });
    done = true;
  });
  if (!done) return state;
  revalidatePath(`/persoane/${personId}`);
  redirect(`/persoane/${personId}/acorduri?salvat=1`);
}

/** "Retrage acordul": the current answer of that kind is marked withdrawn (audited). */
export async function withdrawConsentAction(personId: string, kind: string): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    const k = parseOrThrow(z.enum(CONSENT_KINDS), kind);
    await ctx.db.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId }, select: { nume: true, prenume: true } });
      if (!person) throw new ActionError("Persoana nu mai există în registru.");
      const cur = currentConsents(await tx.consent.findMany({ where: { personId, kind: k } }))[k];
      if (!cur || cur.withdrawnAt) throw new ActionError("Nu există un acord de retras.");
      await tx.consent.update({ where: { id: cur.id }, data: { withdrawnAt: new Date() } });
      await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: personId, entityLabel: memberName(person), action: "UPDATE", fields: [], extra: { acord: CONSENT_LABEL[k], observatie: "acord retras" } });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath(`/persoane/${personId}`);
  redirect(`/persoane/${personId}/acorduri?salvat=1`);
}
