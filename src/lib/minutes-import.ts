import type { RichDoc } from "./rich-text";

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
  how: "partial" | "alias";
}

/** A "Nepotrivit" name the secretary matched to a person: remembered as an alias when the meeting is saved. */
export interface PickedName {
  name: string;
  personId: string;
}

/** The picks among the choices (a name kept as a guest is not remembered). */
export function pickedNames(draft: ImportDraft, choices: Readonly<Record<string, string>>): PickedName[] {
  return draft.unmatched.filter((u) => choices[u.name]).map((u) => ({ name: u.name, personId: choices[u.name] }));
}

/** The vote under a point, as the meeting form takes it. */
export interface DraftVoteValue {
  pentru: number;
  contra: number;
  abtineri: number;
  secret: boolean;
}

export interface ImportDraft {
  fileName: string;
  /** MINUTES-IMPORT-ROBUST: the votes under the points (aligned with `points`). */
  votes?: (DraftVoteValue | null)[];
  /** The old number is already taken in the register of its year. */
  conflict?: { nr: number; an: number; titlu: string } | null;
  /** „Ce am recunoscut”: what each part of the document became. */
  recognized?: { ordine: string[]; unrecognized: string[]; numarPrezenti: number | null; prezenti: string[] };
  /** Meeting form values; `invitati` holds only the guests written as such. */
  initial: Record<string, string>;
  points: string[];
  /** The same content as rich documents for the editor (plainToRich of the parsed text). */
  rich?: { puncte: RichDoc[]; observatii: RichDoc | null; formula: RichDoc | null };
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
