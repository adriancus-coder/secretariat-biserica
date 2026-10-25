/** The review draft of an imported minutes file (Word or scan), shared by the server and the review screen. Pure. */

export interface UnmatchedName {
  /** The name as written in the document. */
  name: string;
  /** Ids of the register persons it could be (ambiguous match); empty when nobody matched. */
  candidates: string[];
}

/** An attendee matched automatically but not by the exact name: shown with a hint so it can be checked. */
export interface ApproxMatch {
  name: string;
  personId: string;
  how: "partial";
}

export interface ImportDraft {
  fileName: string;
  /** Meeting form values; `invitati` holds only the guests written as such. */
  initial: Record<string, string>;
  points: string[];
  /** Attendees matched to exactly one person. */
  selected: string[];
  /** The ones among `selected` matched approximately ("potrivit aproximativ"). */
  approx: ApproxMatch[];
  /** "Nepotriviți": names to pick a person for, or to keep as guests. */
  unmatched: UnmatchedName[];
  warnings: string[];
}

/**
 * Applies the "Nepotriviți" choices: a picked person joins the attendees; a name without a
 * choice ("Adaugă ca invitat") is appended to the guests.
 */
export function resolveImport(draft: ImportDraft, choices: Readonly<Record<string, string>>): { selected: string[]; invitati: string } {
  const selected = new Set(draft.selected);
  const guests = draft.initial.invitati ? [draft.initial.invitati] : [];
  for (const u of draft.unmatched) {
    const id = choices[u.name];
    if (id) selected.add(id);
    else guests.push(u.name);
  }
  return { selected: [...selected], invitati: guests.join(", ") };
}
