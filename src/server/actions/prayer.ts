"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { parsePrayerKey, PRAYER_SOURCE_LABEL, type PrayerSourceKey } from "@/lib/prayer";
import { templateError } from "@/lib/prayer-message";
import { idSchema } from "@/lib/validation";
import { fromDbDate } from "@/lib/dates";
import { fmt, memberName } from "@/lib/format";
import { writeAudit } from "../audit";
import { prayerUnitLabel, thisWeek } from "../queries/prayer";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

/**
 * The weekly prayer. Marking, cancelling and copying are audited as PRAYER with the week only, never
 * the family's name (the history on /rugaciune shows who it was to those who may see it).
 */

const weekLabel = (week: Date) => `Rugăciunea săptămânii ${fmt(fromDbDate(week))}`;

/** "Marchează ca anunțată": one row per week, for a unit that is in the rotation now. */
export async function markPrayerWeekAction(key: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("rugaciune");
    const target = parsePrayerKey(String(key));
    if (!target || !(await prayerUnitLabel(ctx, String(key)))) throw new ActionError("Familia nu mai este în rotație. Reîncărcați pagina.");
    const week = thisWeek();
    if (await ctx.db.prayerWeek.findFirst({ where: { weekStart: week }, select: { id: true } })) throw new ActionError("Săptămâna aceasta este deja marcată.");
    await ctx.db.$transaction(async (tx) => {
      const row = await tx.prayerWeek.create({ data: { ...target, weekStart: week, createdById: ctx.user.id } as never });
      await writeAudit(tx, ctx.user, { entity: "PRAYER", entityId: row.id, entityLabel: weekLabel(week), action: "CREATE", fields: [], extra: { observatie: "familia săptămânii marcată ca anunțată" } });
    });
    return { ok: true, message: "Marcată ca anunțată." };
  });
  revalidatePath("/rugaciune");
  return state;
}

/** "Anulează": only this week's mark. */
export async function cancelPrayerWeekAction(): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("rugaciune");
    const week = thisWeek();
    const row = await ctx.db.prayerWeek.findFirst({ where: { weekStart: week }, select: { id: true } });
    if (!row) throw new ActionError("Săptămâna aceasta nu este marcată.");
    await ctx.db.$transaction(async (tx) => {
      await tx.prayerWeek.delete({ where: { id: row.id } });
      await writeAudit(tx, ctx.user, { entity: "PRAYER", entityId: row.id, entityLabel: weekLabel(week), action: "DELETE", fields: [], extra: { observatie: "marcarea anulată" } });
    });
    return { ok: true, message: "Marcarea a fost anulată." };
  });
  revalidatePath("/rugaciune");
  return state;
}

const SHARE_CHANNELS = ["whatsapp", "share", "copy"] as const;
export type PrayerShareChannel = (typeof SHARE_CHANNELS)[number];

/**
 * "Trimite pe WhatsApp" / "Partajează" / "Copiază mesajul": only the channel is audited ("PRAYER
 * shared: whatsapp"); the text (which the user may have edited) and the family's name never reach
 * the server.
 */
export async function prayerSharedAction(channel: PrayerShareChannel): Promise<FormState> {
  return runFormAction(null, async () => {
    const ctx = await actionCtx("rugaciune");
    if (!(SHARE_CHANNELS as readonly string[]).includes(String(channel))) throw new ActionError("Canal necunoscut.");
    const week = thisWeek();
    await writeAudit(ctx.db, ctx.user, { entity: "PRAYER", entityId: fromDbDate(week)!, entityLabel: weekLabel(week), action: "CREATE", fields: [], extra: { observatie: `PRAYER shared: ${channel}` } });
  });
}

/**
 * Setări → the two messages (src/lib/prayer-message.ts): for families ({parinti} or {familia}) and for
 * a person without a family ({persoana}); "" = the default. Administrators, checked here, audited.
 */
export async function savePrayerMessageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    const family = String(formData.get("prayerMessage") ?? "").trim();
    const person = String(formData.get("prayerMessagePerson") ?? "").trim();
    const errors: Record<string, string> = {};
    const fe = templateError(family, "family");
    const pe = templateError(person, "person");
    if (fe) errors.prayerMessage = fe;
    if (pe) errors.prayerMessagePerson = pe;
    if (fe || pe) throw new ValidationError(errors);
    const before = await ctx.db.church.findUniqueOrThrow({ where: { id: ctx.user.churchId }, select: { nume: true, prayerMessage: true, prayerMessagePerson: true } });
    await ctx.db.$transaction(async (tx) => {
      await tx.church.update({ where: { id: ctx.user.churchId }, data: { prayerMessage: family, prayerMessagePerson: person } });
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: before.nume,
        action: "UPDATE",
        fields: ["mesajRugaciune", "mesajRugaciunePersoana"],
        before: { mesajRugaciune: before.prayerMessage, mesajRugaciunePersoana: before.prayerMessagePerson },
        after: { mesajRugaciune: family, mesajRugaciunePersoana: person },
      });
    });
    return { ok: true, message: "Mesajele au fost salvate." };
  });
  revalidatePath("/setari");
  return state;
}

const SOURCES = ["HARTIE", "SECRETARIAT"] as const satisfies readonly PrayerSourceKey[];
const yesNo = (b: boolean) => (b ? "da" : "nu");

/**
 * The family card (or, for a person without a family, the person page): "Nu doresc să fie pomenită la
 * rugăciunea săptămânală" (objection) and "Copiii pot fi pomeniți cu numele" (consent), with the source.
 * Write roles; audited on the family / person.
 */
export async function setPrayerPrefsAction(target: { familyId?: string; personId?: string }, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    const optOut = formData.get("prayerOptOut") === "on";
    const includeChildren = formData.get("prayerIncludeChildren") === "on";
    const source = String(formData.get("prayerSource") ?? "");
    if (!(SOURCES as readonly string[]).includes(source)) throw new ValidationError({ prayerSource: "Alegeți sursa." }, "Alegeți sursa.");
    const data = { prayerOptOut: optOut, prayerIncludeChildren: includeChildren, prayerChangedAt: new Date(), prayerSource: source as PrayerSourceKey };
    const after = { rugaciuneNepomenita: yesNo(optOut), rugaciuneCopii: yesNo(includeChildren), sursaRugaciune: PRAYER_SOURCE_LABEL[data.prayerSource] };
    const fields = ["rugaciuneNepomenita", "rugaciuneCopii", "sursaRugaciune"];
    if (target.familyId) {
      parseOrThrow(idSchema, target.familyId);
      const f = await ctx.db.family.findUnique({ where: { id: target.familyId }, select: { nume: true, prayerOptOut: true, prayerIncludeChildren: true, prayerSource: true } });
      if (!f) throw new ActionError("Familia nu există.");
      await ctx.db.$transaction(async (tx) => {
        await tx.family.update({ where: { id: target.familyId }, data });
        const before = { rugaciuneNepomenita: yesNo(f.prayerOptOut), rugaciuneCopii: yesNo(f.prayerIncludeChildren), sursaRugaciune: f.prayerSource ? PRAYER_SOURCE_LABEL[f.prayerSource] : "" };
        await writeAudit(tx, ctx.user, { entity: "FAMILY", entityId: target.familyId!, entityLabel: f.nume, action: "UPDATE", fields, before, after });
      });
    } else if (target.personId) {
      parseOrThrow(idSchema, target.personId);
      const p = await ctx.db.person.findUnique({ where: { id: target.personId }, select: { nume: true, prenume: true, familyId: true, prayerOptOut: true, prayerIncludeChildren: true, prayerSource: true } });
      if (!p) throw new ActionError("Persoana nu există.");
      if (p.familyId) throw new ActionError("Persoana face parte dintr-o familie: alegerea se face pe pagina familiei.");
      await ctx.db.$transaction(async (tx) => {
        await tx.person.update({ where: { id: target.personId }, data });
        const before = { rugaciuneNepomenita: yesNo(p.prayerOptOut), rugaciuneCopii: yesNo(p.prayerIncludeChildren), sursaRugaciune: p.prayerSource ? PRAYER_SOURCE_LABEL[p.prayerSource] : "" };
        await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: target.personId!, entityLabel: memberName(p), action: "UPDATE", fields, before, after });
      });
    } else throw new ActionError("Lipsește familia.");
    return { ok: true, message: "Alegerea pentru rugăciunea săptămânală a fost salvată." };
  });
  revalidatePath(target.familyId ? `/familii/${target.familyId}` : `/persoane/${target.personId}`);
  return state;
}
