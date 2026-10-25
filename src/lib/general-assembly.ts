/**
 * The General Assembly (Statut art. 46) and votes per point. Pure.
 * - Announced at least two weeks before, with its scope (art. 46 alin. 1); when the Comunitate convenes
 *   it, one week (art. 461). A late or missing announcement is a warning, never a block.
 * - Statutory whatever the attendance if properly convened: the minutes show the members with full
 *   rights, those present and the announcement, never a quorum.
 * - Decisions by half plus one of the members present (art. 46 alin. 2); the committee decides by a
 *   majority of those present; other meetings by more votes for than against.
 * - The ordinary AG takes place every year (art. 46 alin. 3).
 */
import { z } from "zod";
import { daysBetween } from "./dates";
import { fmtL } from "./format";
import { roleKey } from "./roles";

export const DEFAULT_AG_TYPE = "Adunare generală";
export const AG_KIND_LABEL = { ORDINARA: "ordinară", EXTRAORDINARA: "extraordinară" } as const;
export type AgKind = keyof typeof AG_KIND_LABEL;

/** Is this meeting type a General Assembly? `tipuriAG` empty = the type named "Adunare generală". */
export function isGeneralAssembly(tip: string, tipuriAG: readonly string[]): boolean {
  return tipuriAG.length ? tipuriAG.includes(tip) : roleKey(tip) === roleKey(DEFAULT_AG_TYPE);
}

/** The announcement's warning, or null when it was made in time. */
export function convocationWarning(date: string, convocatLa: string | null, byCommunity: boolean): string | null {
  const need = byCommunity ? 7 : 14;
  const rule = byCommunity
    ? "Statut art. 461: Adunarea Generală convocată de Comunitate se anunță cu cel puțin o săptămână înainte."
    : "Statut art. 46 alin. 1: Adunarea Generală se anunță cu cel puțin două săptămâni înainte, precizându-se scopul.";
  if (!convocatLa) return `${rule} Data convocării nu este completată.`;
  const days = daysBetween(convocatLa, date);
  return days < need ? `${rule} A fost anunțată cu ${days} ${days === 1 ? "zi" : "zile"} înainte.` : null;
}

/** "Membri cu drepturi depline: 40 · prezenți: 23 · convocată la 1 noiembrie 2026 (15 zile înainte)". */
export function assemblyLine(fullMembers: number | null, present: number, convocatLa: string | null, date: string): string {
  const parts = [...(fullMembers !== null ? [`Membri cu drepturi depline: ${fullMembers}`] : []), `prezenți: ${present}`];
  if (convocatLa) {
    const days = daysBetween(convocatLa, date);
    parts.push(`convocată la ${fmtL(convocatLa)} (${days} ${days === 1 ? "zi" : "zile"} înainte)`);
  }
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

export const voteSchema = z
  .object({
    pentru: z.number().int().min(0).max(10000),
    contra: z.number().int().min(0).max(10000),
    abtineri: z.number().int().min(0).max(10000),
    secret: z.boolean().default(false),
  })
  .nullable();
export type Vote = NonNullable<z.output<typeof voteSchema>>;

/** The votes' hidden field `voturi`: a JSON array aligned with the points (null = no vote recorded). */
export const votesField = z
  .string()
  .optional()
  .transform((s, ctx): (Vote | null)[] | null => {
    if (!s?.trim()) return null;
    let list: unknown;
    try {
      list = JSON.parse(s);
    } catch {
      list = null;
    }
    const r = z.array(voteSchema).max(200).safeParse(list);
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: "Voturile nu sunt valide (numere întregi, cel mult 10000)." });
      return z.NEVER;
    }
    return r.data.some(Boolean) ? r.data : null;
  });

export type VoteRule = "AG" | "COMITET" | "SIMPLA";

/** Adopted? AG and committee: more than half of those present; otherwise more votes for than against. */
export function voteAdopted(v: Vote, present: number, rule: VoteRule): boolean {
  return rule === "SIMPLA" ? v.pentru > v.contra : v.pentru > present / 2;
}

/** "Votat: pentru 12, contra 3, abțineri 1 — adoptat (vot secret)". */
export function voteLine(v: Vote, present: number, rule: VoteRule): string {
  return `Votat: pentru ${v.pentru}, contra ${v.contra}, abțineri ${v.abtineri} — ${voteAdopted(v, present, rule) ? "adoptat" : "respins"}${v.secret ? " (vot secret)" : ""}`;
}

/** The minutes' attendance lines: the AG line, or the quorum for types that show it, or nothing. */
export function attendanceLines(x: {
  tip: string;
  tipuriAG: readonly string[];
  tipuriCvorum: readonly string[];
  asteptati: number | null;
  present: number;
  absent: number;
  convocatLa: string | null;
  date: string;
}): { adunare: string | null; cvorum: string | null } {
  if (isGeneralAssembly(x.tip, x.tipuriAG)) return { adunare: assemblyLine(x.asteptati, x.present, x.convocatLa, x.date), cvorum: null };
  if (!x.tipuriCvorum.includes(x.tip) || !x.asteptati) return { adunare: null, cvorum: null };
  const present = Math.max(0, x.asteptati - x.absent);
  return { adunare: null, cvorum: `Prezenți ${present} din ${x.asteptati} (${Math.round((present / x.asteptati) * 100)} %)` };
}

/** Is the year's ordinary AG missing (shown from 1 October, art. 46 alin. 3)? */
export function ordinaryAssemblyMissing(today: string, held: number): boolean {
  return Number(today.slice(5, 7)) >= 10 && held === 0;
}

/** The stored `Meeting.voturi` (JSON column), dropped when it does not pass the schema. */
export function storedVotes(raw: unknown): (Vote | null)[] | null {
  const r = z.array(voteSchema).max(200).safeParse(raw);
  return r.success && r.data.some(Boolean) ? r.data : null;
}

/** The minutes' attendance and vote lines, as the PDF, the Word file, the page and the preview show them. */
export function minutesAttendance(
  m: { tip: string; data: string; asteptati: number | null; present: number; absent: number; convocatLa: string | null; voturi: (Vote | null)[] | null },
  church: { tipuriAG: readonly string[]; tipuriCvorum: readonly string[]; attendanceRules: Record<string, string> },
): { adunare: string | null; cvorum: string | null; voturi: (string | null)[] | null } {
  const ag = isGeneralAssembly(m.tip, church.tipuriAG);
  const rule: VoteRule = ag ? "AG" : church.attendanceRules[m.tip] === "COMITET" ? "COMITET" : "SIMPLA";
  return {
    ...attendanceLines({ ...m, tipuriAG: church.tipuriAG, tipuriCvorum: church.tipuriCvorum, date: m.data }),
    voturi: m.voturi ? m.voturi.map((v) => (v ? voteLine(v, m.present, rule) : null)) : null,
  };
}
