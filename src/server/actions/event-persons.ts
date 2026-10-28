"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toDbDate, todayIso } from "@/lib/dates";
import { changeData } from "@/lib/event-persons";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { BELIEVER_RELATIONS, GENDERS } from "@/lib/labels";
import { personDerived } from "@/lib/person-derived";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { idSchema, optionalDate, optionalEnum, requiredText } from "@/lib/validation";
import { writeAudit } from "../audit";
import { markEdited, settleFamily } from "../families";
import { syncKinship } from "../kinship-sync";
import { getChurch } from "../queries/church";
import { eventWithPersons } from "../queries/event-persons";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/*
 * EVENT-PERSONS actions: a new child in the event's family (from the event form), and the event's register
 * changes („Trece în registru”: only the ticked ones, in one transaction, each field audited „din
 * evenimentul <titlu>”) or „Ignoră”. Write roles.
 */

const childSchema = z.object({
  prenume: requiredText(100, "Scrieți prenumele copilului.", "Prenumele"),
  nume: requiredText(100, "Scrieți numele de familie.", "Numele"),
  gen: optionalEnum(GENDERS),
  dataNasterii: optionalDate,
});

export interface NewChildState extends FormState {
  child?: { id: string; nume: string; prenume: string; dataNasterii: string | null; gen: string | null };
}

/**
 * „+ Copil nou în familie”: the child joins the chosen family with the campaign's rules (Statut art. 28:
 * an aparținător in a believers' family, else a prieten; rudenie Fiu / Fiică), audited.
 */
export async function addChildToFamilyAction(familyId: string, input: { prenume: string; nume: string; gen: string; dataNasterii: string }): Promise<NewChildState> {
  let child: NewChildState["child"];
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, familyId);
    const c = parseOrThrow(childSchema, input);
    if (c.dataNasterii && c.dataNasterii > todayIso()) throw new ActionError("Data nașterii nu poate fi în viitor.");
    await ctx.db.$transaction(async (tx) => {
      const family = await tx.family.findUnique({ where: { id: familyId }, select: { id: true, headId: true, nume: true } });
      if (!family) throw new ActionError("Familia nu mai există.");
      const believers = await tx.person.count({
        where: { familyId, statut: "MEMBRU", dataIesire: null, OR: [{ rudenie: { in: BELIEVER_RELATIONS } }, ...(family.headId ? [{ id: family.headId }] : [])] },
      });
      const created = await tx.person.create({
        data: {
          churchId: ctx.user.churchId,
          familyId,
          nume: c.nume,
          prenume: c.prenume,
          gen: c.gen,
          dataNasterii: toDbDate(c.dataNasterii),
          rudenie: c.gen === "F" ? "Fiică" : c.gen === "M" ? "Fiu" : "",
          statut: believers ? "APARTINATOR" : "PRIETEN",
          ...personDerived({ nume: c.nume, prenume: c.prenume, telefon: "", email: "", botezBiserica: "", botezOficiant: "" }),
        },
      });
      await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: created.id, entityLabel: memberName(created), action: "CREATE", fields: PERSON_FIELDS, after: created, extra: { sursa: `copil nou în familia ${family.nume}, din formularul evenimentului` } });
      await markEdited(tx, familyId);
      await settleFamily(tx, ctx.user, familyId);
      await syncKinship(tx as never, ctx.user, { personIds: [created.id], familyIds: [familyId] });
      child = { id: created.id, nume: created.nume, prenume: created.prenume, dataNasterii: c.dataNasterii, gen: c.gen };
    });
    return { ok: true, message: "Copilul a fost adăugat în familie." };
  });
  return child ? { ...state, child } : state;
}

/**
 * „Aplică selecția”: the ticked register changes of a past event (recomputed on the server, so a stale
 * form cannot write anything else), each person audited with the changed fields „din evenimentul
 * <titlu>”; the event's persons are marked as applied.
 */
export async function applyEventRegisterAction(eventId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let message = "";
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, eventId);
    const e = await eventWithPersons(ctx, eventId);
    if (!e) throw new ActionError("Evenimentul nu mai există.");
    if (!e.taken) throw new ActionError("Datele se trec în registru după data evenimentului.");
    const chosen = new Set(formData.getAll("schimbare").map(String));
    const changes = e.changes.filter((c) => chosen.has(c.key));
    const church = await getChurch(ctx);
    const ev = { data: e.data, oficiant: e.oficiant };
    const sursa = `din evenimentul ${e.titlu}`;
    await ctx.db.$transaction(async (tx) => {
      for (const personId of [...new Set(changes.map((c) => c.personId))]) {
        const before = await tx.person.findUnique({ where: { id: personId } });
        if (!before) continue;
        const values: Record<string, unknown> = {};
        for (const c of changes.filter((x) => x.personId === personId)) Object.assign(values, changeData(c, ev, { nume: church.nume, localitate: church.localitate }));
        const dates = ["dataBinecuvantare", "dataBotez", "dataMembru", "dataCasatoriei", "dataIesire"];
        const data: Record<string, unknown> = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, dates.includes(k) ? toDbDate(v as string) : v]));
        if ("botezBiserica" in values || "botezOficiant" in values)
          Object.assign(data, personDerived({ ...before, botezBiserica: (values.botezBiserica as string) ?? before.botezBiserica, botezOficiant: (values.botezOficiant as string) ?? before.botezOficiant }));
        const after = await tx.person.update({ where: { id: personId }, data });
        await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: personId, entityLabel: memberName(after), action: "UPDATE", fields: PERSON_FIELDS, before, after, extra: { sursa } });
      }
      await tx.eventPerson.updateMany({ where: { eventId, personId: { not: null }, aplicatInRegistruLa: null }, data: { aplicatInRegistruLa: new Date() } });
      await writeAudit(tx, ctx.user, {
        entity: "EVENT",
        entityId: eventId,
        entityLabel: e.titlu,
        action: "UPDATE",
        fields: [],
        extra: { observatie: `trecut în registru: ${changes.length} ${changes.length === 1 ? "schimbare" : "schimbări"}` },
      });
    });
    message = changes.length ? "Datele au fost trecute în registru." : "Nimic de trecut în registru; evenimentul a fost marcat.";
  });
  if (!message) return state;
  revalidatePath("/", "layout");
  // The card goes once applied: the confirmation travels as a toast.
  redirect(`/calendar/${eventId}?salvat=1&mesaj=${encodeURIComponent(message)}`);
}

/** „Ignoră” (Acasă / the event page): the event no longer asks for its register changes. */
export async function ignoreEventRegisterAction(eventId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, eventId);
    await ctx.db.$transaction(async (tx) => {
      const e = await tx.event.findUnique({ where: { id: eventId }, select: { titlu: true } });
      if (!e) throw new ActionError("Evenimentul nu mai există.");
      await tx.event.update({ where: { id: eventId }, data: { registruIgnoratLa: new Date() } });
      await writeAudit(tx, ctx.user, { entity: "EVENT", entityId: eventId, entityLabel: e.titlu, action: "UPDATE", fields: [], extra: { observatie: "datele pentru registru au fost ignorate" } });
    });
    return { ok: true, message: "Evenimentul nu mai apare la „Trece în registru”." };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

