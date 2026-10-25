/**
 * Disciplinary measures in the JSON backup (`discipline` collection), written only into an
 * administrator's export (permission `disciplina`); a secretary's export never contains it. Files
 * without the collection import unchanged.
 */
import { isIsoDate } from "./dates";
import { DISCIPLINARY_FORMS, DISCIPLINARY_FORUMS, DISCIPLINARY_STATES, type DisciplinaryFormKey, type DisciplinaryForumKey, type DisciplinaryStateKey } from "./labels";

export interface BDiscipline {
  id: string;
  /** Member id as in the file. */
  membru: string;
  forma: DisciplinaryFormKey;
  stare: DisciplinaryStateKey;
  dataInceput: string;
  dataSfarsit: string | null;
  /** Meeting id as in the file. */
  pv: string | null;
  motiv: string;
  forul: DisciplinaryForumKey;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const pick = <T extends string>(values: readonly T[], v: unknown): T | null => (values as readonly unknown[]).includes(v) ? (v as T) : null;

export function disciplineToJson(rows: BDiscipline[]): BDiscipline[] {
  return rows;
}

/** The collection from a file: null when absent; invalid entries are skipped. */
export function parseDisciplineJson(root: unknown): BDiscipline[] | null {
  const list = typeof root === "object" && root !== null ? (root as Record<string, unknown>).discipline : undefined;
  if (!Array.isArray(list)) return null;
  const out: BDiscipline[] = [];
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const forma = pick(DISCIPLINARY_FORMS, r.forma);
    const stare = pick(DISCIPLINARY_STATES, r.stare);
    const dataInceput = typeof r.dataInceput === "string" && isIsoDate(r.dataInceput) ? r.dataInceput : null;
    if (typeof r.id !== "string" || !ID.test(r.id) || typeof r.membru !== "string" || !ID.test(r.membru) || !forma || !stare || !dataInceput) continue;
    out.push({
      id: r.id,
      membru: r.membru,
      forma,
      stare,
      dataInceput,
      dataSfarsit: typeof r.dataSfarsit === "string" && isIsoDate(r.dataSfarsit) ? r.dataSfarsit : null,
      pv: typeof r.pv === "string" && ID.test(r.pv) ? r.pv : null,
      motiv: typeof r.motiv === "string" ? r.motiv.slice(0, 4000) : "",
      forul: pick(DISCIPLINARY_FORUMS, r.forul) ?? "LOCAL",
    });
  }
  return out;
}
