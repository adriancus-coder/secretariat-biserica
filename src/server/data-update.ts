import "server-only";
import { cookies } from "next/headers";
import { campaignOpen } from "@/lib/campaign";
import { ageAt, fromDbDate, todayIso } from "@/lib/dates";
import { BELIEVER_RELATIONS, OPTIONAL_CONSENTS } from "@/lib/labels";
import type { ChildData, ConsentAnswers, SelfData } from "@/lib/schemas/data-update";
import { hasPersonalIdentity, hashToken, identityCookieName, isTokenShape, openGeneralIdentity, type GeneralIdentity } from "./campaign-tokens";
import { prisma } from "./db";
import type { Ctx } from "./session";

/**
 * The public side of the data-update campaign (no session). The church comes only from the link's
 * row (found by the token's hash), never from the request; writes go through tenantDb(churchId).
 */

export const IDENTITY_FAILED = "Datele nu corespund. Verificați și încercați din nou.";
export const LINK_LOCKED = "Linkul a fost blocat. Cereți un link nou de la secretariat.";
export const MAX_FAILED_CHECKS = 5;

const campaignSelect = { id: true, nume: true, deadline: true, status: true, privacyTextVersion: true, generalLinkEnabled: true, churchId: true } as const;

export type PersonalLink =
  | { state: "invalid" }
  | { state: "locked" }
  | {
      state: "ok";
      link: { id: string; nonce: string; personId: string; churchId: string; failedChecks: number; openedAt: Date | null };
      campaign: { id: string; nume: string; deadline: string; privacyTextVersion: string; churchId: string };
    };

/** A personal link by its token: unknown, revoked (a new nonce), expired and closed are all "invalid". */
export async function resolvePersonalLink(token: string): Promise<PersonalLink> {
  if (!isTokenShape(token)) return { state: "invalid" };
  const link = await prisma.dataUpdateLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { campaign: { select: campaignSelect } } });
  if (!link || link.revokedAt) return { state: "invalid" };
  const deadline = fromDbDate(link.campaign.deadline)!;
  if (!campaignOpen({ status: link.campaign.status, deadline }, todayIso())) return { state: "invalid" };
  if (link.lockedAt) return { state: "locked" };
  return { state: "ok", link, campaign: { ...link.campaign, deadline } };
}

export type GeneralLink = { state: "invalid" } | { state: "ok"; campaign: { id: string; nume: string; deadline: string; privacyTextVersion: string; churchId: string } };

export async function resolveGeneralLink(token: string): Promise<GeneralLink> {
  if (!isTokenShape(token)) return { state: "invalid" };
  const c = await prisma.dataCampaign.findUnique({ where: { generalTokenHash: hashToken(token) }, select: campaignSelect });
  if (!c || !c.generalLinkEnabled) return { state: "invalid" };
  const deadline = fromDbDate(c.deadline)!;
  if (!campaignOpen({ status: c.status, deadline }, todayIso())) return { state: "invalid" };
  return { state: "ok", campaign: { ...c, deadline } };
}

export async function personalIdentityOk(link: { id: string; nonce: string }): Promise<boolean> {
  return hasPersonalIdentity((await cookies()).get(identityCookieName("p", link.id))?.value, link.id, link.nonce);
}

export async function generalIdentity(campaignId: string): Promise<GeneralIdentity | null> {
  return openGeneralIdentity((await cookies()).get(identityCookieName("g", campaignId))?.value, campaignId);
}

type Db = Pick<Ctx["db"], "person">;

/**
 * The adult's own minor children: the minors of the adult's family when the adult is its head or a
 * spouse / parent by rudenie. Never other relatives.
 */
export async function adultChildren(db: Db, adult: { id: string; familyId: string | null; rudenie: string; family: { headId: string | null } | null }) {
  if (!adult.familyId || !(adult.family?.headId === adult.id || BELIEVER_RELATIONS.includes(adult.rudenie))) return [];
  const today = todayIso();
  const rows = await db.person.findMany({
    where: { familyId: adult.familyId, id: { not: adult.id }, dataIesire: null },
    orderBy: [{ dataNasterii: "asc" }, { sortKey: "asc" }],
    select: { id: true, nume: true, prenume: true, gen: true, dataNasterii: true, dataBinecuvantare: true, familyId: true },
  });
  return rows.filter((c) => c.dataNasterii && ageAt(fromDbDate(c.dataNasterii)!, today) < 18);
}

/** The form's starting values from the register (personal link only). */
export function selfSnapshot(p: {
  nume: string;
  prenume: string;
  gen: "M" | "F" | null;
  dataNasterii: Date | null;
  dataCasatoriei: Date | null;
  telefon: string;
  email: string;
  adresa: string;
  dataBotez: Date | null;
  botezAn: number | null;
  botezBiserica: string;
  botezLocalitate: string;
  botezOficiant: string;
  numeTata: string;
  numeMama: string;
}): SelfData {
  return {
    nume: p.nume,
    prenume: p.prenume,
    gen: p.gen,
    dataNasterii: fromDbDate(p.dataNasterii),
    dataCasatoriei: fromDbDate(p.dataCasatoriei),
    telefon: p.telefon,
    email: p.email,
    adresa: p.adresa,
    dataBotez: fromDbDate(p.dataBotez),
    botezAn: p.dataBotez ? null : p.botezAn,
    botezBiserica: p.botezBiserica,
    botezLocalitate: p.botezLocalitate,
    botezOficiant: p.botezOficiant,
    numeTata: p.numeTata,
    numeMama: p.numeMama,
  };
}

export function childSnapshot(c: { id: string; nume: string; prenume: string; gen: "M" | "F" | null; dataNasterii: Date | null; dataBinecuvantare: Date | null }): Omit<ChildData, "consents"> {
  return { id: c.id, nume: c.nume, prenume: c.prenume, gen: c.gen, dataNasterii: fromDbDate(c.dataNasterii), dataBinecuvantare: fromDbDate(c.dataBinecuvantare) };
}

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** Consent rows of one person, answered online now (the notice confirmation when `nota`). */
export async function writeOnlineConsents(
  tx: Tx,
  x: { churchId: string; personId: string; submissionId: string; textVersion: string; answers: ConsentAnswers; nota: boolean; givenByPersonId?: string | null },
) {
  const givenAt = new Date();
  const rows = [
    ...(x.nota ? [{ kind: "INFO_NOTE" as const, granted: true }] : []),
    ...OPTIONAL_CONSENTS.map((kind) => ({ kind, granted: x.answers[kind] })),
  ];
  await tx.consent.createMany({
    data: rows.map((r) => ({
      ...r,
      churchId: x.churchId,
      personId: x.personId,
      textVersion: x.textVersion,
      givenAt,
      source: "ONLINE" as const,
      givenByPersonId: x.givenByPersonId ?? null,
      submissionId: x.submissionId,
    })),
  });
}
