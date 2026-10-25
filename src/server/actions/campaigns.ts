"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIso, toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { CAMPAIGN_FIELDS, campaignSchema } from "@/lib/schemas/campaign";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { createMissingLinks, generalSecret, linkSecret, privacyVersionOf } from "../campaigns";
import { getChurch } from "../queries/church";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

const view = (c: { nume: string; deadline: Date; generalLinkEnabled: boolean; status: string }) => ({
  nume: c.nume,
  deadline: c.deadline.toISOString().slice(0, 10),
  generalLinkEnabled: c.generalLinkEnabled ? "da" : "nu",
  stare: c.status === "ACTIVE" ? "activă" : "închisă",
});

/** Starts a campaign (administrators): one personal link per adult, and the general link if chosen. */
export async function createCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let id: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    const input = parseOrThrow(campaignSchema, Object.fromEntries(formData));
    if (input.deadline < todayIso()) throw new ValidationError({ deadline: "Data limită nu poate fi în trecut." });
    const church = await getChurch(ctx);
    const campaignId = randomUUID();
    id = await ctx.db.$transaction(async (tx) => {
      const c = await tx.dataCampaign.create({
        data: {
          id: campaignId,
          churchId: ctx.user.churchId,
          nume: input.nume,
          deadline: toDbDate(input.deadline)!,
          generalLinkEnabled: input.generalLinkEnabled,
          ...(input.generalLinkEnabled ? generalSecret(campaignId) : {}),
          privacyTextVersion: privacyVersionOf(church),
          createdById: ctx.user.id,
        },
      });
      const links = await createMissingLinks(tx, ctx.user.churchId, c);
      await writeAudit(tx, ctx.user, { entity: "CAMPAIGN", entityId: c.id, entityLabel: c.nume, action: "CREATE", fields: CAMPAIGN_FIELDS, after: view(c), extra: { linkuri: links } });
      return c.id;
    });
  });
  if (!id) return state;
  revalidatePath("/setari/actualizare-date");
  redirect(`/setari/actualizare-date/${id}?salvat=1`);
}

async function updateCampaign(campaignId: string, permission: "admin" | "write", change: (c: { id: string; generalLinkEnabled: boolean; status: string }) => object, note: string) {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx(permission);
    parseOrThrow(idSchema, campaignId);
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.dataCampaign.findUnique({ where: { id: campaignId } });
      if (!before) throw new ActionError("Campania nu mai există.");
      const after = await tx.dataCampaign.update({ where: { id: campaignId }, data: change(before) });
      await writeAudit(tx, ctx.user, { entity: "CAMPAIGN", entityId: campaignId, entityLabel: after.nume, action: "UPDATE", fields: CAMPAIGN_FIELDS, before: view(before), after: view(after), extra: { observatie: note } });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath("/setari/actualizare-date");
  redirect(`/setari/actualizare-date/${campaignId}?salvat=1`);
}

/** Closes a campaign (administrators): every link stops working. */
export async function closeCampaignAction(campaignId: string): Promise<void> {
  await updateCampaign(campaignId, "admin", () => ({ status: "CLOSED", closedAt: new Date() }), "campanie închisă");
}

/** Turns the general link on (with a new token) or off (administrators). */
export async function toggleGeneralLinkAction(campaignId: string): Promise<void> {
  await updateCampaign(
    campaignId,
    "admin",
    (c) => (c.generalLinkEnabled ? { generalLinkEnabled: false, generalNonce: null, generalTokenHash: null } : { generalLinkEnabled: true, ...generalSecret(c.id) }),
    "link general",
  );
}

/** Personal links that adults added since the start are created (secretariat). */
export async function addMissingLinksAction(campaignId: string): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, campaignId);
    await ctx.db.$transaction(async (tx) => {
      const c = await tx.dataCampaign.findUnique({ where: { id: campaignId } });
      if (!c || c.status !== "ACTIVE") throw new ActionError("Campania este închisă.");
      const n = await createMissingLinks(tx, ctx.user.churchId, c);
      if (n) await writeAudit(tx, ctx.user, { entity: "CAMPAIGN", entityId: c.id, entityLabel: c.nume, action: "UPDATE", fields: [], extra: { linkuriNoi: n } });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath(`/setari/actualizare-date/${campaignId}`);
  redirect(`/setari/actualizare-date/${campaignId}?salvat=1`);
}

async function updateLink(linkId: string, data: (link: { id: string }) => object, note: string) {
  let campaignId = "";
  await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, linkId);
    await ctx.db.$transaction(async (tx) => {
      const link = await tx.dataUpdateLink.findUnique({ where: { id: linkId }, include: { person: { select: { nume: true, prenume: true } }, campaign: { select: { nume: true } } } });
      if (!link) throw new ActionError("Linkul nu mai există.");
      await tx.dataUpdateLink.update({ where: { id: linkId }, data: data(link) });
      // Audited by the person's name only (never the link).
      await writeAudit(tx, ctx.user, { entity: "CAMPAIGN", entityId: link.campaignId, entityLabel: link.campaign.nume, action: "UPDATE", fields: [], extra: { persoana: memberName(link.person), observatie: note } });
      campaignId = link.campaignId;
    });
  });
  if (!campaignId) return;
  revalidatePath(`/setari/actualizare-date/${campaignId}`);
  redirect(`/setari/actualizare-date/${campaignId}?salvat=1`);
}

/** "Marchează ca trimis". */
export async function markLinkSentAction(linkId: string): Promise<void> {
  await updateLink(linkId, () => ({ sentAt: new Date() }), "link trimis");
}

/** "Deblochează / generează link nou": the old link stops working, the counters start again. */
export async function renewLinkAction(linkId: string): Promise<void> {
  await updateLink(linkId, (l) => ({ ...linkSecret(l.id), failedChecks: 0, lockedAt: null, sentAt: null, openedAt: null, verifiedAt: null, revokedAt: null }), "link nou generat");
}
