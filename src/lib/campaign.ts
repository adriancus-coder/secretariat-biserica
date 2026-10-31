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
  "La deschidere vi se cer numele complet și numărul de telefon. Le cerem ca să ne asigurăm că doar dumneavoastră vedeți și modificați aceste date.";

/** „Pace, frate Denis!” / „Pace, sora Dana!” by the gender in the register; without one only „Pace!”. */
export function campaignGreeting(prenume: string, gen: string | null | undefined): string {
  const name = prenume.trim();
  if (gen === "F") return name ? `Pace, sora ${name}!` : "Pace, soră!";
  if (gen === "M") return name ? `Pace, frate ${name}!` : "Pace, frate!";
  return "Pace!";
}

/** The secretary in Setări → Organizația (each part optional). */
export interface SecretaryContact {
  nume?: string | null;
  telefon?: string | null;
  email?: string | null;
}

/** „Pentru întrebări vă puteți adresa secretariatului bisericii: Ana Pop, tel. 900 11 222, ana@x.no.” */
export function secretaryLine(c: SecretaryContact = {}): string {
  const parts = [c.nume?.trim(), c.telefon?.trim() ? `tel. ${c.telefon.trim()}` : "", c.email?.trim()].filter(Boolean);
  return parts.length ? `Pentru întrebări vă puteți adresa secretariatului bisericii: ${parts.join(", ")}.` : "Pentru întrebări vă puteți adresa secretariatului bisericii.";
}

/** The ready message of "Partajează" / "Copiază mesajul" / WhatsApp, sent by the secretariat. */
export function campaignMessage(prenume: string, gen: string | null | undefined, church: string, deadline: string, link: string, secretary: SecretaryContact = {}): string {
  return [
    `${campaignGreeting(prenume, gen)} Vă rugăm să verificați datele dumneavoastră din evidența ${churchOf(church)} până la ${fmtL(deadline)}: ${link}`,
    CAMPAIGN_IDENTITY_REASON,
    secretaryLine(secretary),
    "Secretariatul bisericii",
  ].join("\n\n");
}

/** Is the campaign still open on `today` (active and not past its deadline)? */
export function campaignOpen(c: { status: "ACTIVE" | "CLOSED"; deadline: string }, today: string): boolean {
  return c.status === "ACTIVE" && today <= c.deadline;
}
