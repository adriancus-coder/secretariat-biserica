/** The data-update campaign: link statuses, the share message, who gets a personal link. Pure. */
import { churchOf } from "@/lib/church-name";
import { ageAt } from "./dates";
import { fmtL } from "./format";

export const LINK_STATUSES = ["NETRIMIS", "TRIMIS", "DESCHIS", "VERIFICAT", "COMPLETAT", "BLOCAT", "APROBAT"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];
export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  NETRIMIS: "Netrimis",
  TRIMIS: "Trimis",
  DESCHIS: "Deschis",
  VERIFICAT: "Verificat",
  COMPLETAT: "Completat",
  BLOCAT: "Blocat",
  APROBAT: "Aprobat",
};

export interface LinkState {
  sentAt: Date | null;
  openedAt: Date | null;
  verifiedAt: Date | null;
  submittedAt: Date | null;
  lockedAt: Date | null;
  /** The person's submission in this campaign was approved (fully or partly). */
  approved?: boolean;
}

/** The furthest step a link reached (a locked link is "Blocat" until a new one is generated). */
export function linkStatus(l: LinkState): LinkStatus {
  if (l.lockedAt) return "BLOCAT";
  if (l.approved) return "APROBAT";
  if (l.submittedAt) return "COMPLETAT";
  if (l.verifiedAt) return "VERIFICAT";
  if (l.openedAt) return "DESCHIS";
  if (l.sentAt) return "TRIMIS";
  return "NETRIMIS";
}

/** An adult for the campaign: 18 or older on `today`, or without a birth date (Statut art. 28: no "Copil" status). */
export function isCampaignAdult(p: { dataNasterii: string | null }, today: string): boolean {
  return p.dataNasterii === null || ageAt(p.dataNasterii, today) >= 18;
}

/** Why the personal link asks for the name and the phone (the last lines of the message). */
export const CAMPAIGN_IDENTITY_REASON =
  "La deschidere vi se cer numele complet și numărul de telefon. Le cerem ca să ne asigurăm că doar dumneavoastră vedeți și modificați aceste date, chiar dacă linkul ajunge din greșeală la altcineva.";

/** „Pace, frate Denis!” / „Pace, sora Dana!” by the gender in the register; without one, the name alone. */
export function campaignGreeting(prenume: string, gen: string | null | undefined): string {
  const name = prenume.trim();
  if (!name) return gen === "F" ? "Pace, soră!" : gen === "M" ? "Pace, frate!" : "Pace!";
  return gen === "F" ? `Pace, sora ${name}!` : gen === "M" ? `Pace, frate ${name}!` : `Pace, ${name}!`;
}

/** The ready message of "Partajează" / "Copiază mesajul" / WhatsApp. */
export function campaignMessage(prenume: string, gen: string | null | undefined, church: string, deadline: string, link: string): string {
  return `${campaignGreeting(prenume, gen)} Vă rugăm să verificați datele dumneavoastră din evidența ${churchOf(church)} până la ${fmtL(deadline)}: ${link}\n\n${CAMPAIGN_IDENTITY_REASON}`;
}

/** Is the campaign still open on `today` (active and not past its deadline)? */
export function campaignOpen(c: { status: "ACTIVE" | "CLOSED"; deadline: string }, today: string): boolean {
  return c.status === "ACTIVE" && today <= c.deadline;
}
