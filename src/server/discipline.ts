import "server-only";
import { fromDbDate } from "@/lib/dates";
import { permissions } from "@/lib/permissions";
import { DISCIPLINARY_FORM_LABEL, DISCIPLINARY_FORUM_LABEL, DISCIPLINARY_STATE_LABEL, type DisciplinaryFormKey, type DisciplinaryStateKey } from "@/lib/labels";
import { APPEAL_RESULT_LABEL } from "@/lib/schemas/discipline";
import { ActionError, type Ctx } from "./session";

/**
 * Disciplinary measures (Statut art. 27, 271, 272). Every caller must hold the `disciplina` permission
 * (administrators), except the two server-side effects that never show anything: the attendance rule
 * (a suspended member is not expected, src/server/queries/attendance.ts) and the recommendation
 * letter's sentence, which only an administrator can issue when a measure is open.
 */

type Db = Pick<Ctx["db"], "disciplinaryMeasure">;

export interface OpenMeasure {
  forma: DisciplinaryFormKey;
  stare: DisciplinaryStateKey;
  dataInceput: string;
}

/** The person's newest measure still under investigation or applied, or null. */
export async function openMeasure(db: Db, personId: string): Promise<OpenMeasure | null> {
  const m = await db.disciplinaryMeasure.findFirst({
    where: { personId, stare: { in: ["CERCETARE", "APLICATA"] } },
    orderBy: [{ dataInceput: "desc" }, { createdAt: "desc" }],
    select: { forma: true, stare: true, dataInceput: true },
  });
  return m ? { forma: m.forma, stare: m.stare, dataInceput: fromDbDate(m.dataInceput)! } : null;
}

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** A measure for the audit log: labels and the minutes' name instead of ids. */
export async function disciplineView(tx: Tx, id: string) {
  const m = await tx.disciplinaryMeasure.findUnique({
    where: { id },
    include: {
      meeting: { select: { nr: true, anRegistru: true, tip: true, data: true } },
      repunereMeeting: { select: { nr: true, anRegistru: true, tip: true, data: true } },
    },
  });
  if (!m) return null;
  const pv = (x: { nr: number | null; anRegistru: number | null; tip: string; data: Date } | null) =>
    x ? `${x.nr !== null ? `PV nr. ${x.nr}/${x.anRegistru} ` : ""}${x.tip} ${fromDbDate(x.data)}` : "";
  return {
    forma: DISCIPLINARY_FORM_LABEL[m.forma],
    stare: DISCIPLINARY_STATE_LABEL[m.stare],
    dataInceput: fromDbDate(m.dataInceput),
    dataSfarsit: fromDbDate(m.dataSfarsit),
    procesVerbal: pv(m.meeting),
    motivMasura: m.motiv,
    forul: DISCIPLINARY_FORUM_LABEL[m.decisByForum],
    audiere: m.audiereLa ? [fromDbDate(m.audiereLa), m.audiereOra, m.audiereLoc].filter(Boolean).join(" ") : "",
    abatere: m.abatere,
    raspuns: m.raspuns,
    nuSaPrezentat: m.nuSaPrezentat ? "da" : "",
    incadrare: m.incadrare,
    temei: m.temei,
    comunicatLa: fromDbDate(m.comunicatLa) ?? "",
    contestatieLa: fromDbDate(m.contestatieLa) ?? "",
    contestatieRezultat: m.contestatieRezultat ? APPEAL_RESULT_LABEL[m.contestatieRezultat] : "",
    cerereRepunereLa: fromDbDate(m.cerereRepunereLa) ?? "",
    repunere: pv(m.repunereMeeting),
  };
}

/**
 * A recommendation for a person with an open measure (Statut art. 27 alin. 6 and 9): only an
 * administrator may issue it; during an investigation only under the domicile exception. Returns the
 * applied measure to state in the letter (null = none).
 */
export async function recommendationDiscipline(ctx: Ctx, personId: string, exceptieDomiciliu: boolean): Promise<{ forma: string; dataInceput: string } | null> {
  const open = await openMeasure(ctx.db, personId);
  if (!open) return null;
  if (!permissions.disciplina(ctx.user.role)) throw new ActionError("Documentul poate fi emis doar de administrator.");
  if (open.stare === "CERCETARE") {
    if (!exceptieDomiciliu) {
      throw new ActionError(
        "Persoana este în cercetare disciplinară: recomandarea pentru transfer nu se poate elibera (Statut art. 27 alin. 6), decât dacă își schimbă domiciliul în altă localitate.",
      );
    }
    return null;
  }
  return { forma: DISCIPLINARY_FORM_LABEL[open.forma], dataInceput: open.dataInceput };
}
