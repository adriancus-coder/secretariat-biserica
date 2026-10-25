import { hasStepUp, stepUpMethod } from "@/server/step-up";
import { StepUpGate } from "@/components/passkey/step-up-gate";
import { ReinstateForm } from "./reinstate-form";
import { appealDeadline } from "@/lib/discipline-print";
import { APPEAL_RESULT_LABEL } from "@/lib/schemas/discipline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fmt, memberName } from "@/lib/format";
import { fromDbDate } from "@/lib/dates";
import { DISCIPLINARY_FORM_LABEL, DISCIPLINARY_FORUM_LABEL, DISCIPLINARY_STATE_LABEL } from "@/lib/labels";
import { idSchema } from "@/lib/validation";
import { deleteDisciplineAction, removeFromCommitteeAction } from "@/server/actions/discipline";
import { meetingChoices } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";
import { DisciplineForm } from "./discipline-form";

export const metadata: Metadata = { title: "Disciplină" };

/** Disciplinary measures of a person (Statut art. 27, 271, 272). Administrators only (`disciplina`). */
export default async function DisciplinePage({ params, searchParams }: PageProps<"/persoane/[id]/disciplina">) {
  const ctx = await requireCtx("disciplina");
  const { id } = await params;
  const sp = await searchParams;
  if (!idSchema.safeParse(id).success) notFound();
  const person = await ctx.db.person.findUnique({ where: { id }, select: { id: true, nume: true, prenume: true, inComitet: true } });
  if (!person) notFound();
  // Step-up: the device unlock (or the password) once per 15 minutes before discipline data is shown.
  if (!(await hasStepUp(ctx.user))) {
    return (
      <>
        <BackLink href={`/persoane/${id}`}>{memberName(person)}</BackLink>
        <PageHead title="Disciplină" sub="Vizibil doar pastorilor și administratorilor (Statut art. 27)" />
        <StepUpGate method={await stepUpMethod(ctx.user.id)} what="Datele disciplinare sunt confidențiale." />
      </>
    );
  }
  const [measures, meetings] = await Promise.all([
    ctx.db.disciplinaryMeasure.findMany({
      where: { personId: id },
      orderBy: [{ dataInceput: "desc" }, { createdAt: "desc" }],
      include: { meeting: { select: { id: true, nr: true, anRegistru: true, tip: true, data: true } } },
    }),
    meetingChoices(ctx),
  ]);
  const editing = typeof sp.masura === "string" ? measures.find((m) => m.id === sp.masura) : undefined;
  const meetingOptions = meetings.map((m) => ({ value: m.id, label: m.label }));
  const suspended = measures.some((m) => m.forma === "SUSPENDARE" && m.stare === "APLICATA");
  const excluded = measures.find((m) => m.forma === "EXCLUDERE" && m.stare === "APLICATA");
  return (
    <>
      <BackLink href={`/persoane/${id}`}>{memberName(person)}</BackLink>
      <PageHead title="Disciplină" sub="Vizibil doar pastorilor și administratorilor (Statut art. 27)" />
      {suspended && person.inComitet ? (
        <div className="alert mb-3" role="status">
          Este suspendat — fără drept de vot — și încă membru în comitet.
          <form action={removeFromCommitteeAction.bind(null, id)} className="inline ml-2">
            <button type="submit" className="btn btn-sm">
              Scoate din comitet
            </button>
          </form>
        </div>
      ) : null}
      {excluded ? (
        <p className="hint mb-3">
          Excluderea produce efecte după informarea scrisă a Comunității (art. 27 alin. 5):{" "}
          <a href={`/pdf/disciplina/${excluded.id}/informare`} target="_blank" rel="noopener">
            Informare privind excluderea (PDF)
          </a>
          .
        </p>
      ) : null}
      {measures.length ? (
        <ul className="list mb-4">
          {measures.map((m) => (
            <li key={m.id} className="item">
              <div className="grow">
                <b>{DISCIPLINARY_FORM_LABEL[m.forma]}</b> — {DISCIPLINARY_STATE_LABEL[m.stare]}, din {fmt(fromDbDate(m.dataInceput)!)}
                {m.dataSfarsit ? ` până la ${fmt(fromDbDate(m.dataSfarsit)!)}` : ""} · {DISCIPLINARY_FORUM_LABEL[m.decisByForum]}
                {m.meeting ? (
                  <>
                    {" · "}
                    <Link href={`/procese-verbale/${m.meeting.id}`}>
                      {m.meeting.nr !== null ? `PV nr. ${m.meeting.nr}/${m.meeting.anRegistru}` : m.meeting.tip}
                    </Link>
                  </>
                ) : null}
                {m.motiv ? <div className="hint whitespace-pre-wrap">{m.motiv}</div> : null}
                {m.comunicatLa ? (
                  <div className="hint">
                    Comunicată la {fmt(fromDbDate(m.comunicatLa)!)} · termen de contestare {fmt(appealDeadline(fromDbDate(m.comunicatLa)!))}
                    {m.contestatieLa ? ` · contestație din ${fmt(fromDbDate(m.contestatieLa)!)}` : ""}
                    {m.contestatieRezultat ? ` (${APPEAL_RESULT_LABEL[m.contestatieRezultat]})` : ""}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-3 text-sm mt-1">
                  {m.audiereLa ? (
                    <a href={`/pdf/disciplina/${m.id}/convocare`} target="_blank" rel="noopener">
                      Convocare la audiere (PDF)
                    </a>
                  ) : null}
                  {m.stare !== "CERCETARE" && m.meetingId && m.abatere ? (
                    <a href={`/pdf/disciplina/${m.id}/proces-verbal`} target="_blank" rel="noopener">
                      PV disciplinar (PDF)
                    </a>
                  ) : null}
                  {m.stare === "APLICATA" ? (
                    <a href={`/pdf/disciplina/${m.id}/comunicare`} target="_blank" rel="noopener">
                      Comunicarea sancțiunii (PDF)
                    </a>
                  ) : null}
                </div>
                {m.stare === "APLICATA" && ["SUSPENDARE", "RETRAGERE_DREPTURI", "EXCLUDERE"].includes(m.forma) ? (
                  <ReinstateForm personId={id} measureId={m.id} exclusion={m.forma === "EXCLUDERE"} meetings={meetingOptions} />
                ) : null}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link href={`/persoane/${id}/disciplina?masura=${m.id}`} className="btn btn-sm">
                  Modifică
                </Link>
                <form action={deleteDisciplineAction.bind(null, id, m.id)}>
                  <button type="submit" className="btn btn-sm">
                    Șterge
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint mb-4">Nicio măsură disciplinară.</p>
      )}
      <div className="card">
        <h3>{editing ? "Modifică măsura" : "Adaugă măsură"}</h3>
        <DisciplineForm
          key={editing?.id ?? "nou"}
          personId={id}
          measureId={editing?.id ?? null}
          meetings={meetingOptions}
          initial={
            editing
              ? {
                  forma: editing.forma,
                  stare: editing.stare,
                  dataInceput: fromDbDate(editing.dataInceput)!,
                  dataSfarsit: fromDbDate(editing.dataSfarsit) ?? "",
                  meetingId: editing.meetingId ?? "",
                  motiv: editing.motiv,
                  decisByForum: editing.decisByForum,
                  audiereLa: fromDbDate(editing.audiereLa) ?? "",
                  audiereOra: editing.audiereOra,
                  audiereLoc: editing.audiereLoc,
                  abatere: editing.abatere,
                  raspuns: editing.raspuns,
                  nuSaPrezentat: editing.nuSaPrezentat ? "on" : "",
                  incadrare: editing.incadrare,
                  temei: editing.temei,
                  comunicatLa: fromDbDate(editing.comunicatLa) ?? "",
                  contestatieLa: fromDbDate(editing.contestatieLa) ?? "",
                  contestatieRezultat: editing.contestatieRezultat ?? "",
                }
              : {}
          }
        />
      </div>
    </>
  );
}
