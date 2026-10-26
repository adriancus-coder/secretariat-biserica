"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { matchingPersons, identityMatches } from "@/lib/identity-match";
import { memberName } from "@/lib/format";
import { parseProposal, type DataUpdateProposal } from "@/lib/schemas/data-update";
import { personalIdentityValue, sealGeneralIdentity, identityCookieName, IDENTITY_SECONDS } from "../campaign-tokens";
import {
  adultChildren,
  generalIdentity,
  IDENTITY_FAILED,
  LINK_LOCKED,
  MAX_FAILED_CHECKS,
  personalIdentityOk,
  resolveGeneralLink,
  resolvePersonalLink,
  writeOnlineConsents,
} from "../data-update";
import { currentPrivacyVersion } from "../campaigns";
import { prisma } from "../db";
import { clientIp, IP_LIMIT_MESSAGE } from "../ip-limits";
import { sharedRateLimiter } from "../rate-limit";
import { ActionError } from "../session";
import { tenantDb } from "../tenant-db";
import { runFormAction, ValidationError } from "./run";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Public actions of the data-update campaign (no session). The church and the person come only from
 * the link found by the token's hash. Nothing personal is logged; the person is never told which part
 * of the identity check failed.
 */

/** 20 identity checks per hour per visitor (IP address), across every link. */
const checks = sharedRateLimiter("campaign-identity", { limit: 20, windowMs: 3_600_000 });
const LINK_INVALID = "Linkul nu mai este valabil. Cereți un link nou de la secretariat.";
const SESSION_EXPIRED = "Au trecut mai mult de 30 de minute. Confirmați din nou identitatea.";

async function setIdentityCookie(name: string, value: string) {
  (await cookies()).set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/actualizare",
    maxAge: IDENTITY_SECONDS,
  });
}

const typedIdentity = (formData: FormData) => ({
  nume: String(formData.get("nume") ?? "").trim().slice(0, 160),
  telefon: String(formData.get("telefon") ?? "").trim().slice(0, 60),
});

const auditOnline = (churchId: string, campaign: { id: string; nume: string }, changes: Record<string, string>) =>
  ({ churchId, userName: "Formular online", entity: "CAMPAIGN", entityId: campaign.id, entityLabel: campaign.nume, action: "UPDATE", changes }) as const;

/** Step 1 of a personal link: the full name and the phone must match the link's person. */
export async function verifyPersonalIdentityAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let verified = false;
  const state = await runFormAction(formData, async () => {
    const r = await resolvePersonalLink(token);
    if (r.state === "invalid") throw new ActionError(LINK_INVALID);
    if (r.state === "locked") throw new ActionError(LINK_LOCKED);
    if (!checks.hit(await clientIp())) throw new ActionError(IP_LIMIT_MESSAGE);
    const typed = typedIdentity(formData);
    const person = await prisma.person.findUniqueOrThrow({ where: { id: r.link.personId }, select: { nume: true, prenume: true, telefon: true } });
    // Honeypot: a filled hidden field is treated like a wrong answer.
    if (!String(formData.get("website") ?? "").trim() && typed.nume && identityMatches(typed, person)) {
      await prisma.dataUpdateLink.update({ where: { id: r.link.id }, data: { verifiedAt: new Date(), openedAt: r.link.openedAt ?? new Date() } });
      await setIdentityCookie(identityCookieName("p", r.link.id), personalIdentityValue(r.link.id, r.link.nonce));
      verified = true;
      return;
    }
    const failed = r.link.failedChecks + 1;
    const locked = failed >= MAX_FAILED_CHECKS;
    await prisma.$transaction(async (tx) => {
      await tx.dataUpdateLink.update({ where: { id: r.link.id }, data: { failedChecks: failed, ...(locked ? { lockedAt: new Date() } : {}) } });
      if (locked) await tx.auditLog.create({ data: auditOnline(r.link.churchId, r.campaign, { persoana: memberName(person), observatie: "link blocat după 5 încercări greșite" }) });
    });
    throw new ActionError(locked ? LINK_LOCKED : IDENTITY_FAILED);
  });
  if (!verified) return state;
  redirect(`/actualizare/${token}`);
}

/** Step 2 of a personal link: stores (or replaces) the pending submission and the consents. */
export async function submitPersonalUpdateAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let sent = false;
  const state = await runFormAction(formData, async () => {
    const r = await resolvePersonalLink(token);
    if (r.state === "invalid") throw new ActionError(LINK_INVALID);
    if (r.state === "locked") throw new ActionError(LINK_LOCKED);
    if (!(await personalIdentityOk(r.link))) throw new ActionError(SESSION_EXPIRED);
    if (String(formData.get("website") ?? "").trim()) {
      sent = true;
      return;
    }
    const parsed = parseProposal(Object.fromEntries(formData));
    if (!parsed.ok) throw new ValidationError(parsed.errors, "Verificați câmpurile marcate.");
    const db = tenantDb(r.link.churchId);
    const adult = await db.person.findUniqueOrThrow({ where: { id: r.link.personId }, include: { family: { select: { headId: true } } } });
    const own = new Set((await adultChildren(db, adult)).map((c) => c.id));
    // Only the adult's own minor children can be changed; anything else becomes a new child.
    const versiuneNota = await currentPrivacyVersion(r.link.churchId);
    const proposal: DataUpdateProposal = { ...parsed.value, children: parsed.value.children.map((c) => (c.id && own.has(c.id) ? c : { ...c, id: null })), versiuneNota };
    await db.$transaction(async (tx) => {
      const pending = await tx.dataUpdateSubmission.findFirst({ where: { linkId: r.link.id, status: "PENDING" }, select: { id: true } });
      const json = proposal as unknown as Prisma.InputJsonObject;
      const submission = pending
        ? await tx.dataUpdateSubmission.update({ where: { id: pending.id }, data: { proposed: json } })
        : await tx.dataUpdateSubmission.create({
            data: { churchId: r.link.churchId, campaignId: r.campaign.id, linkId: r.link.id, personId: adult.id, via: "PERSONAL", proposed: json },
          });
      const base = { churchId: r.link.churchId, submissionId: submission.id, textVersion: versiuneNota };
      await writeOnlineConsents(tx, { ...base, personId: adult.id, answers: proposal.consents, nota: true });
      for (const c of proposal.children) {
        if (c.id) await writeOnlineConsents(tx, { ...base, personId: c.id, answers: c.consents, nota: false, givenByPersonId: adult.id });
      }
      await tx.dataUpdateLink.update({ where: { id: r.link.id }, data: { submittedAt: new Date() } });
      await tx.auditLog.create({ data: auditOnline(r.link.churchId, r.campaign, { persoana: memberName(adult), observatie: pending ? "date trimise din nou" : "date trimise" }) });
    });
    sent = true;
  });
  if (!sent) return state;
  redirect(`/actualizare/${token}/trimis`);
}

/** Step 1 of the general link: the typed name and phone are kept (encrypted) and matched only on submit. */
export async function verifyGeneralIdentityAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let ok = false;
  const state = await runFormAction(formData, async () => {
    const r = await resolveGeneralLink(token);
    if (r.state === "invalid") throw new ActionError(LINK_INVALID);
    if (!checks.hit(await clientIp())) throw new ActionError(IP_LIMIT_MESSAGE);
    const typed = typedIdentity(formData);
    const errors: Record<string, string> = {};
    if (!typed.nume) errors.nume = "Completați numele complet.";
    if (typed.telefon.replace(/\D/g, "").length < 8) errors.telefon = "Completați numărul de telefon.";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    // The page always proceeds the same way, whether or not the person exists in the register.
    await setIdentityCookie(identityCookieName("g", r.campaign.id), sealGeneralIdentity(r.campaign.id, typed.nume, typed.telefon));
    ok = true;
  });
  if (!ok) return state;
  redirect(`/actualizare/g/${token}`);
}

/**
 * Step 2 of the general link: stored for the secretary with the matched person (exactly one active
 * adult with that name and phone) or unmatched; the consents wait for the approval.
 */
export async function submitGeneralUpdateAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let sent = false;
  const state = await runFormAction(formData, async () => {
    const r = await resolveGeneralLink(token);
    if (r.state === "invalid") throw new ActionError(LINK_INVALID);
    const identity = await generalIdentity(r.campaign.id);
    if (!identity) throw new ActionError(SESSION_EXPIRED);
    if (String(formData.get("website") ?? "").trim()) {
      sent = true;
      return;
    }
    const parsed = parseProposal(Object.fromEntries(formData));
    if (!parsed.ok) throw new ValidationError(parsed.errors, "Verificați câmpurile marcate.");
    const db = tenantDb(r.campaign.churchId);
    const candidates = await db.person.findMany({
      where: { dataIesire: null, statut: { not: "FOST_MEMBRU" }, telefon: { not: "" } },
      select: { id: true, nume: true, prenume: true, telefon: true },
    });
    const matches = matchingPersons(identity, candidates);
    const proposal: DataUpdateProposal = {
      ...parsed.value,
      children: parsed.value.children.map((c) => ({ ...c, id: null })),
      typed: { nume: identity.nume, telefon: identity.telefon },
      versiuneNota: await currentPrivacyVersion(r.campaign.churchId),
    };
    await db.$transaction(async (tx) => {
      await tx.dataUpdateSubmission.create({
        data: {
          churchId: r.campaign.churchId,
          campaignId: r.campaign.id,
          via: "GENERAL",
          personId: matches.length === 1 ? matches[0].id : null,
          proposed: proposal as unknown as Prisma.InputJsonObject,
        },
      });
      await tx.auditLog.create({
        data: auditOnline(r.campaign.churchId, r.campaign, { observatie: `răspuns prin linkul general (${matches.length === 1 ? "potrivit" : "nepotrivit"})` }),
      });
    });
    (await cookies()).delete({ name: identityCookieName("g", r.campaign.id), path: "/actualizare" });
    sent = true;
  });
  if (!sent) return state;
  redirect(`/actualizare/g/${token}/trimis`);
}
