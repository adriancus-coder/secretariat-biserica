/** The statutes a church can publish on its application form (Setări → Organizația). Pure. */

export const STATUTE_KINDS = ["STATUT_CULT", "STATUT_INTERN"] as const;
export type StatuteKind = (typeof STATUTE_KINDS)[number];

export const STATUTE_MAX_BYTES = 10 * 1024 * 1024;

export const STATUTE: Record<
  StatuteKind,
  { slug: "cult" | "intern"; label: string; consentField: "consentStatutCult" | "consentStatutIntern"; consentLabel: string; noteName: string }
> = {
  STATUT_CULT: {
    slug: "cult",
    label: "Statutul cultului",
    consentField: "consentStatutCult",
    consentLabel: "Am citit și sunt de acord cu statutul cultului.",
    noteName: "statutul cultului",
  },
  STATUT_INTERN: {
    slug: "intern",
    label: "Statutul intern al bisericii",
    consentField: "consentStatutIntern",
    consentLabel: "Am citit și sunt de acord cu statutul intern al bisericii.",
    noteName: "statutul intern",
  },
};

/** "cult" → STATUT_CULT (the public URL /cerere/<slug>/statut/<cult|intern>). */
export function statuteKindFromSlug(slug: string): StatuteKind | null {
  return STATUTE_KINDS.find((k) => STATUTE[k].slug === slug) ?? null;
}

/** The note added to the person on accept: "A acceptat statutul cultului și statutul intern la 25.10.2026." */
export function consentNote(accepted: readonly StatuteKind[], date: string): string {
  if (!accepted.length) return "";
  const names = STATUTE_KINDS.filter((k) => accepted.includes(k)).map((k) => STATUTE[k].noteName);
  return `A acceptat ${names.join(" și ")} la ${date}.`;
}

/** A PDF file starts with "%PDF-". */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
}
