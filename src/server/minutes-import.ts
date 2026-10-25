import "server-only";
import mammoth from "mammoth";
import { todayIso } from "@/lib/dates";
import type { ImportDraft } from "@/lib/minutes-import";
import { DEFAULT_CLOSING } from "@/lib/minutes";
import { matchMeetingType, matchPersonName } from "@/lib/name-match";
import type { MinutesDraft } from "@/lib/schemas/extract";
import { loadAliasMap } from "./person-aliases";
import { getChurch } from "./queries/church";
import { zipUncompressedSize } from "./zip-size";
import type { Ctx } from "./session";

export const DOCX_MAX_BYTES = 5 * 1024 * 1024;
/** What the Word file may expand to (all its parts together). */
export const DOCX_MAX_UNCOMPRESSED = 50 * 1024 * 1024;
export const DOCX_MAX_FILES = 30;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export class DocxError extends Error {}

/** The raw text of a .docx, read in memory (nothing is written to disk, no network). */
export async function docxText(file: File): Promise<string> {
  if (!/\.docx$/i.test(file.name) || (file.type && file.type !== DOCX_TYPE && file.type !== "application/octet-stream")) {
    throw new DocxError(`„${file.name}” nu este un document Word (.docx).`);
  }
  if (file.size > DOCX_MAX_BYTES) throw new DocxError(`„${file.name}” depășește 5 MB.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  // A small ZIP can expand to gigabytes: its declared size is checked before anything is unpacked.
  const expanded = zipUncompressedSize(buffer);
  if (expanded === null) throw new DocxError(`„${file.name}” nu este un document Word valid. Salvați-l din nou ca .docx și reîncercați.`);
  if (expanded > DOCX_MAX_UNCOMPRESSED) throw new DocxError(`„${file.name}” este prea mare după despachetare (peste 50 MB).`);
  try {
    return (await mammoth.extractRawText({ buffer })).value;
  } catch {
    throw new DocxError(`„${file.name}” nu a putut fi citit. Salvați-l din nou ca .docx și reîncercați.`);
  }
}

/**
 * A parsed or extracted minutes draft → the review draft: names matched to the church's
 * register (exact name, then a remembered alias, then the partial rule; unique → attendee, else
 * "Nepotriviți"), the type matched to the church's list
 * (default "Comitet").
 */
export async function reviewDraft(ctx: Ctx, fileName: string, draft: MinutesDraft, warnings: string[]): Promise<ImportDraft> {
  const [church, aliases, persons] = await Promise.all([getChurch(ctx), loadAliasMap(ctx), ctx.db.person.findMany({ select: { id: true, nume: true, prenume: true, statut: true } })]);
  // Former members are matched only by their exact name.
  const named = persons.map((p) => ({ ...p, active: p.statut !== "FOST_MEMBRU" }));
  const selected = new Set<string>();
  const approx: ImportDraft["approx"] = [];
  const unmatched: ImportDraft["unmatched"] = [];
  for (const name of draft.prezenti) {
    const m = matchPersonName(name, named, aliases);
    if (m.status === "unique") {
      selected.add(m.id);
      if (m.how !== "exact" && !approx.some((a) => a.name === name)) approx.push({ name, personId: m.id, how: m.how });
    }
    else if (!unmatched.some((u) => u.name === name)) unmatched.push({ name, candidates: m.status === "ambiguous" ? m.ids : [] });
  }
  const tipuri = church.nomen.tipuriSedinte;
  const fallbackType = tipuri.find((t) => t === "Comitet") ?? tipuri[0] ?? "Comitet";
  return {
    fileName,
    initial: {
      nr: draft.nr ? String(draft.nr) : "",
      tip: matchMeetingType(draft.tip, tipuri, fallbackType),
      data: draft.data ?? todayIso(),
      presedinte: draft.pastor ?? church.pastor,
      invitati: draft.invitati.join(", "),
      formulaIncheiere: draft.formulaIncheiere ?? DEFAULT_CLOSING,
    },
    points: draft.puncte,
    selected: [...selected],
    approx,
    unmatched,
    warnings: [...warnings, ...(unmatched.length ? [`${unmatched.length === 1 ? "Un nume nu a fost găsit" : `${unmatched.length} nume nu au fost găsite`} în registru: alegeți persoana la „Nepotriviți”.`] : [])],
  };
}
