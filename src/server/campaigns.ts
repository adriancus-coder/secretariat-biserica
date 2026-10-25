import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { isCampaignAdult } from "@/lib/campaign";
import { fromDbDate, todayIso } from "@/lib/dates";
import { privacyTemplate, publicPrivacyText } from "@/lib/privacy";
import { generalToken, hashToken, linkToken, newNonce } from "./campaign-tokens";
import type { ChurchSettings } from "./queries/church";
import type { Ctx } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** The notice as published now, hashed: the textVersion of the consents given during the campaign. */
export function privacyVersionOf(church: ChurchSettings): string {
  const text = publicPrivacyText(church.privacyText.trim() || privacyTemplate(church), church.extractEnabled);
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** A fresh nonce and token hash for a personal link with this id. */
export function linkSecret(linkId: string) {
  const nonce = newNonce();
  return { nonce, tokenHash: hashToken(linkToken(linkId, nonce)) };
}

export function generalSecret(campaignId: string) {
  const generalNonce = newNonce();
  return { generalNonce, generalTokenHash: hashToken(generalToken(campaignId, generalNonce)) };
}

/** End of the deadline day (UTC; the deadline itself is compared with todayIso()). */
export const deadlineEnd = (deadline: Date) => new Date(`${fromDbDate(deadline)}T23:59:59.999Z`);

/**
 * Creates the missing personal links of a campaign: one per adult in the record (no exit, not Fost
 * membru, not anonymised; 18 or older, or without a birth date). Returns how many were created.
 */
export async function createMissingLinks(tx: Tx, churchId: string, campaign: { id: string; deadline: Date }): Promise<number> {
  const today = todayIso();
  const [persons, existing] = await Promise.all([
    tx.person.findMany({
      where: { dataIesire: null, statut: { not: "FOST_MEMBRU" }, nume: { not: "Persoană ștearsă" } },
      select: { id: true, dataNasterii: true },
    }),
    tx.dataUpdateLink.findMany({ where: { campaignId: campaign.id }, select: { personId: true } }),
  ]);
  const have = new Set(existing.map((l) => l.personId));
  const adults = persons.filter((p) => !have.has(p.id) && isCampaignAdult({ dataNasterii: fromDbDate(p.dataNasterii) }, today));
  const rows = adults.map((p) => {
    const id = randomUUID();
    return { id, churchId, campaignId: campaign.id, personId: p.id, ...linkSecret(id), expiresAt: deadlineEnd(campaign.deadline) };
  });
  if (rows.length) await tx.dataUpdateLink.createMany({ data: rows });
  return rows.length;
}
