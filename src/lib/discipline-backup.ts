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
  /** The procedure (Statut art. 27, 271, 272); absent in older files. */
  audiereLa?: string | null;
  audiereOra?: string;
  audiereLoc?: string;
  abatere?: string;
  raspuns?: string;
  nuSaPrezentat?: boolean;
  incadrare?: string;
  temei?: string;
  comunicatLa?: string | null;
  contestatieLa?: string | null;
  contestatieRezultat?: "ADMISA" | "RESPINSA" | null;
  cerereRepunereLa?: string | null;
  /** The reinstatement's minutes: meeting id as in the file. */
  pvRepunere?: string | null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const pick = <T extends string>(values: readonly T[], v: unknown): T | null => (values as readonly unknown[]).includes(v) ? (v as T) : null;

const date = (v: unknown) => (typeof v === "string" && isIsoDate(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

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
      audiereLa: date(r.audiereLa),
      audiereOra: typeof r.audiereOra === "string" && /^\d{2}:\d{2}$/.test(r.audiereOra) ? r.audiereOra : "",
      audiereLoc: str(r.audiereLoc, 200),
      abatere: str(r.abatere, 4000),
      raspuns: str(r.raspuns, 4000),
      nuSaPrezentat: r.nuSaPrezentat === true,
      incadrare: str(r.incadrare, 300),
      temei: str(r.temei, 300),
      comunicatLa: date(r.comunicatLa),
      contestatieLa: date(r.contestatieLa),
      contestatieRezultat: r.contestatieRezultat === "ADMISA" || r.contestatieRezultat === "RESPINSA" ? r.contestatieRezultat : null,
      cerereRepunereLa: date(r.cerereRepunereLa),
      pvRepunere: typeof r.pvRepunere === "string" && ID.test(r.pvRepunere) ? r.pvRepunere : null,
    });
  }
  return out;
}
