import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { formatDateTime } from "@/components/audit-trail";
import { ApproveButton } from "@/components/approve-button";
import { DataTable } from "@/components/ui/data-table";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fromDbDate } from "@/lib/dates";
import { fmt } from "@/lib/format";
import { ENTRY_LABEL, EXIT_LABEL, PERSON_PROPOSAL_LABEL, PROPOSAL_STATUS_LABEL, STATUS_LABEL } from "@/lib/labels";
import { permissions } from "@/lib/permissions";
import { proposalChanges } from "@/lib/person-proposal";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { idSchema } from "@/lib/validation";
import { approveProposalAction } from "@/server/actions/pastor-proposals";
import { meetingChoices } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";
import { RejectProposalForm } from "./reject-proposal-form";

export const metadata: Metadata = { title: "Propunere pentru pastor" };

const FIELD_LABEL: Record<string, string> = {
  statut: "Statut",
  modIntrare: "Mod intrare",
  dataMembru: "Membru din",
  intrareMeetingId: "Procesul-verbal al intrării",
  modIesire: "Mod ieșire",
  dataIesire: "Data ieșirii",
  iesireMeetingId: "Procesul-verbal al ieșirii",
  bisericaDestinatie: "Biserica de destinație",
};

/** A reabilitare / excludere waiting for the pastor's confirmation (Statut art. 23 alin. 3). */
export default async function PersonProposalPage({ params }: PageProps<"/cereri/propuneri/[id]">) {
  const { id } = await params;
  const ctx = await requireCtx();
  const isPastor = permissions.pastor(ctx.user);
  if (!isPastor && !permissions.write(ctx.user)) forbidden();
  if (!idSchema.safeParse(id).success) notFound();
  const pr = await ctx.db.personProposal.findUnique({ where: { id } });
  if (!pr) notFound();
  const proposed = (pr.formular && typeof pr.formular === "object" && !Array.isArray(pr.formular) ? pr.formular : {}) as Record<string, string>;
  const person = pr.personId ? await ctx.db.person.findUnique({ where: { id: pr.personId } }) : null;
  const current: Record<string, string> | null = person
    ? Object.fromEntries(PERSON_FIELDS.map((f) => [f, person[f] instanceof Date ? fromDbDate(person[f] as Date)! : person[f] == null ? "" : String(person[f])]))
    : null;
  if (current && person) Object.assign(current, { intrareMeetingId: person.intrareMeetingId ?? "", iesireMeetingId: person.iesireMeetingId ?? "" });
  const { changes, others } = proposalChanges(current, proposed);
  const meetings = new Map((await meetingChoices(ctx)).map((m) => [m.id, m.label]));
  const users = await ctx.db.user.findMany({ where: { id: { in: [pr.propusDeId, pr.decidedById].filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "";
  const show = (field: string, v: string) => {
    if (!v) return "—";
    if (field === "statut") return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
    if (field === "modIntrare") return ENTRY_LABEL[v as keyof typeof ENTRY_LABEL] ?? v;
    if (field === "modIesire") return EXIT_LABEL[v as keyof typeof EXIT_LABEL] ?? v;
    if (field.endsWith("MeetingId")) return meetings.get(v) ?? "proces-verbal șters";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fmt(v);
    return v;
  };

  return (
    <>
      <BackLink href={person ? `/persoane/${person.id}` : "/cereri?stare=propuse"}>{person ? pr.nume : "Cereri"}</BackLink>
      <PageHead
        title={`${PERSON_PROPOSAL_LABEL[pr.kind]}: ${pr.nume}`}
        sub={<span className={`tag ${pr.status === "REJECTED" ? "tag-warn" : pr.status === "ACCEPTED" ? "tag-ok" : "tag-gold"}`}>{PROPOSAL_STATUS_LABEL[pr.status]}</span>}
      />
      <dl className="detail mb-4">
        <div>
          <dt>Propusă</dt>
          <dd>
            {formatDateTime(pr.createdAt)}
            {pr.propusDeId ? ` de ${userName(pr.propusDeId)}` : ""}
          </dd>
        </div>
        {pr.decidedAt ? (
          <div>
            <dt>{pr.status === "REJECTED" ? "Respinsă" : "Confirmată"}</dt>
            <dd>
              {formatDateTime(pr.decidedAt)}
              {pr.decidedById ? ` de ${userName(pr.decidedById)}` : ""}
            </dd>
          </div>
        ) : null}
        {pr.motivRespingere ? (
          <div>
            <dt>Motivul respingerii</dt>
            <dd className="whitespace-pre-wrap">{pr.motivRespingere}</dd>
          </div>
        ) : null}
        <div>
          <dt>Persoana</dt>
          <dd>{person ? <Link href={`/persoane/${person.id}`}>{pr.nume}</Link> : "persoană nouă în registru"}</dd>
        </div>
      </dl>
      <div className="card">
        <h3>Ce se schimbă în registru</h3>
        <DataTable
          id="schimbari"
          caption="Ce se schimbă în registru"
          columns={[
            { key: "camp", label: "Câmp", type: "text" },
            ...(current ? [{ key: "acum", label: "Acum", type: "text" as const }] : []),
            { key: "propus", label: "Propus", type: "text" },
          ]}
          rows={changes.map((c) => ({
            key: c.field,
            sort: [FIELD_LABEL[c.field] ?? c.field, ...(current ? [show(c.field, c.before)] : []), show(c.field, c.after)],
            classes: [undefined, "text", "text"],
            cells: [FIELD_LABEL[c.field] ?? c.field, ...(current ? [show(c.field, c.before)] : []), <b key="p">{show(c.field, c.after)}</b>],
          }))}
        />
        {others ? <p className="hint">Încă {others === 1 ? "un câmp modificat" : `${others} câmpuri modificate`} în fișă (se salvează împreună).</p> : null}
      </div>
      {isPastor && pr.status === "PROPUSA" ? (
        <div className="card">
          <h3>Decizia pastorului</h3>
          <p className="hint">„Confirmă” salvează fișa exact cum a fost propusă (Statut art. 23 alin. 3).</p>
          <div className="actions flex-wrap !justify-start">
            <ApproveButton action={approveProposalAction.bind(null, pr.id)} label="Confirmă" />
            <RejectProposalForm id={pr.id} />
          </div>
        </div>
      ) : pr.status === "PROPUSA" ? (
        <p className="hint">Propunerea așteaptă confirmarea pastorului.</p>
      ) : null}
    </>
  );
}
