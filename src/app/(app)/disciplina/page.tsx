import type { Metadata } from "next";
import Link from "next/link";
import { StepUpGate } from "@/components/passkey/step-up-gate";
import { EmptyState, PageHead } from "@/components/ui/page-head";
import { fromDbDate } from "@/lib/dates";
import { appealDeadline } from "@/lib/discipline-print";
import { fmt, memberName } from "@/lib/format";
import { DISCIPLINARY_FORM_LABEL, DISCIPLINARY_STATE_LABEL } from "@/lib/labels";
import { requireCtx } from "@/server/session";
import { hasStepUp, stepUpMethod } from "@/server/step-up";

export const metadata: Metadata = { title: "Măsuri disciplinare deschise" };

/**
 * Measures under investigation or applied, with their appeal deadlines (Statut art. 27 alin. 11).
 * Pastors and administrators only (`disciplina`), after the step-up, like the person's page.
 */
export default async function OpenMeasuresPage() {
  const ctx = await requireCtx("disciplina");
  const head = <PageHead title="Măsuri disciplinare deschise" sub="În cercetare sau aplicate — vizibil doar pastorilor și celor cărora un pastor le-a dat acces (Statut art. 44 lit. d)" />;
  if (!(await hasStepUp(ctx.user))) {
    return (
      <>
        {head}
        <StepUpGate method={await stepUpMethod(ctx.user.id)} what="Datele disciplinare sunt confidențiale." />
      </>
    );
  }
  const rows = await ctx.db.disciplinaryMeasure.findMany({
    where: { stare: { in: ["CERCETARE", "APLICATA"] } },
    orderBy: [{ dataInceput: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      personId: true,
      forma: true,
      stare: true,
      dataInceput: true,
      comunicatLa: true,
      contestatieLa: true,
      contestatieRezultat: true,
      person: { select: { nume: true, prenume: true } },
    },
  });
  return (
    <>
      {head}
      {rows.length === 0 ? (
        <EmptyState title="Nicio măsură deschisă" />
      ) : (
        <div className="list">
          {rows.map((m) => {
            const comunicat = fromDbDate(m.comunicatLa);
            const appeal =
              m.contestatieLa && !m.contestatieRezultat
                ? `contestație depusă la ${fmt(fromDbDate(m.contestatieLa)!)}, fără rezultat`
                : comunicat && !m.contestatieRezultat
                  ? `contestare până la ${fmt(appealDeadline(comunicat))}`
                  : "";
            return (
              <Link key={m.id} href={`/persoane/${m.personId}/disciplina`} className="item">
                <div className="body">
                  <div className="t">{memberName(m.person)}</div>
                  <div className="m">
                    {DISCIPLINARY_FORM_LABEL[m.forma]} · din {fmt(fromDbDate(m.dataInceput)!)}
                    {appeal ? ` · ${appeal}` : ""}
                  </div>
                </div>
                <span className={`tag ${m.stare === "APLICATA" ? "tag-warn" : "tag-gold"}`}>{DISCIPLINARY_STATE_LABEL[m.stare]}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
