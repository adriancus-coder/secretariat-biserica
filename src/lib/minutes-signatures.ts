/*
 * MINUTES-SIGNATURES: who signs the minutes, and where. Those present sign in the table „Nume /
 * Semnătura”; the Secretar and the Pastor named in Setări (the „Întocmit” block, as printed) sign at the
 * bottom and are left out of the table (they stay among those present and in the count). Each place is
 * signed digitally (the pad) or marked „Semnat pe hârtie”; closing asks for every place signed. Pure.
 */
import { memberName } from "./format";
import { nameKey } from "./name-match";
import { roleKey } from "./roles";

export type MinutesRole = "SECRETAR" | "PASTOR";

export const MINUTES_ROLE_LABEL: Record<MinutesRole, string> = { SECRETAR: "Secretar", PASTOR: "Pastor" };
export const MINUTES_ROLES: readonly MinutesRole[] = ["SECRETAR", "PASTOR"];

/** Titles a name in Setări may carry („Pastor Dumitru Ciobanu”), ignored when matching a person. */
const TITLES = new Set(["pastor", "pastorul", "prezbiter", "prezbiterul", "diacon", "diaconul", "fratele", "sora", "fr", "sr", "secretar", "secretarul"]);

/** The comparable key of a name typed in Setări: any word order, no diacritics, titles left out. */
export function signerKey(name: string): string {
  return nameKey(
    name
      .split(/\s+/)
      .filter((w) => !TITLES.has(roleKey(w).replace(/\.$/, "")))
      .join(" "),
  );
}

/** The names that sign at the bottom (Setări → Secretar / Pastor), as keys. */
export function drafterKeys(church: { secretar: string; pastor: string }): Set<string> {
  // The pastor's place may name several pastors („A, B” when Setări leaves it to the pastor users).
  return new Set(
    [church.secretar, church.pastor]
      .flatMap((n) => n.split(/,|\s+și\s+/))
      .map(signerKey)
      .filter(Boolean),
  );
}

/** Whether a person present signs at the bottom (as Secretar or Pastor) instead of in the table. */
export function signsAtBottom(p: { nume: string; prenume: string }, keys: Set<string>): boolean {
  return keys.has(nameKey(memberName(p)));
}

/** Those present who sign in the table: everyone but the Secretar and the Pastor of the „Întocmit” block. */
export function tableSigners<T extends { nume: string; prenume: string }>(present: readonly T[], church: { secretar: string; pastor: string }): T[] {
  const keys = drafterKeys(church);
  return present.filter((p) => !signsAtBottom(p, keys));
}

/** The bottom places with a name in Setări (an empty one has nobody to sign it). */
export function roleSigners(church: { secretar: string; pastor: string }): { rol: MinutesRole; label: string; name: string }[] {
  return MINUTES_ROLES.map((rol) => ({ rol, label: MINUTES_ROLE_LABEL[rol], name: (rol === "SECRETAR" ? church.secretar : church.pastor).trim() })).filter((r) => r.name);
}

/** „Secretar Ioana Pop” for a bottom place, the person's name for a row of the table. */
export function placeLabel(p: { rol?: MinutesRole; name: string }): string {
  return p.rol ? `${MINUTES_ROLE_LABEL[p.rol]} ${p.name}`.trim() : p.name;
}

/** The closing refusal: „Lipsesc: Ionescu Mihai, Pastor Dumitru Ciobanu.” */
export function missingLine(names: readonly string[]): string {
  return `Lipsesc: ${names.join(", ")}.`;
}

/** Under the table of a printed copy: „Semnat pe hârtie de: Ionescu Mihai, Pop Ana.” */
export function paperNote(names: readonly string[]): string {
  return `Semnat pe hârtie de: ${names.join(", ")}.`;
}

/** The state shown on a row: „semnat 11.09.2026 19:42”, „semnat pe hârtie 11.09.2026 · marcat de Ana Pop”, „nesemnat”. */
export function signatureState(s: { paper: boolean; at: string; by?: string | null } | null): string {
  if (!s) return "nesemnat";
  if (s.paper) return `semnat pe hârtie ${s.at}${s.by ? ` · marcat de ${s.by}` : ""}`;
  return `semnat ${s.at}`;
}

/**
 * MINUTES-IMPORT-ROBUST: the places still unsigned (neither drawn nor marked on paper) — those present who
 * sign in the table and the bottom places named in Setări. An imported minutes with any is listed as
 * „semnături nemarcate”.
 */
export function unsignedPlaces(
  present: readonly { id: string; nume: string; prenume: string }[],
  signed: ReadonlySet<string>,
  signedRoles: ReadonlySet<string>,
  church: { secretar: string; pastor: string },
): string[] {
  return [...tableSigners(present, church).filter((p) => !signed.has(p.id)).map(memberName), ...roleSigners(church).filter((r) => !signedRoles.has(r.rol)).map(placeLabel)];
}
