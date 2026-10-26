import "server-only";
import { DIRECTION_LABEL } from "@/lib/correspondence";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { CORRESPONDENCE_FIELDS } from "@/lib/schemas/correspondence";
import { writeAudit } from "./audit";
import { lockCorrespondenceRegister, nextFreeCorrespondenceNumber } from "./doc-numbering";
import type { Ctx, CurrentUser } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** The audit view of a register row (CORRESPONDENCE): names and numbers instead of ids. */
export async function correspondenceView(tx: Tx, id: string) {
  const r = await tx.correspondence.findUnique({
    where: { id },
    include: { document: { select: { nr: true, anRegistru: true } }, raspunsLa: { select: { nr: true, an: true } }, person: { select: { nume: true, prenume: true } } },
  });
  if (!r) return null;
  return {
    nr: `${r.nr}/${r.an}`,
    data: fromDbDate(r.data),
    directie: DIRECTION_LABEL[r.directie],
    dela: r.dela,
    catre: r.catre,
    subiect: r.subiect,
    rezolvare: r.rezolvare,
    document: r.document ? `${r.document.nr}/${r.document.anRegistru}` : "",
    raspunsLa: r.raspunsLa ? `${r.raspunsLa.nr}/${r.raspunsLa.an}` : "",
    persoana: r.person ? memberName(r.person) : "",
  };
}
export const correspondenceLabel = (v: { nr: string; directie: string }) => `${v.directie} nr. ${v.nr}`;

/** An entry answered: its resolution becomes „Răspuns cu …” when it was empty or „În lucru”; audited. */
export async function markAnswered(tx: Tx, user: CurrentUser, entry: { id: string; rezolvare: string }, text: string): Promise<void> {
  if (entry.rezolvare && entry.rezolvare !== "În lucru") return;
  const before = await correspondenceView(tx, entry.id);
  await tx.correspondence.update({ where: { id: entry.id }, data: { rezolvare: text } });
  await writeAudit(tx, user, { entity: "CORRESPONDENCE", entityId: entry.id, entityLabel: correspondenceLabel(before!), action: "UPDATE", fields: CORRESPONDENCE_FIELDS, before, after: await correspondenceView(tx, entry.id) });
}

/**
 * „Scrie scrisoarea de răspuns”: a document issued in the app as the answer to an entry of the register
 * becomes an exit of the register (its own register number, the document's number in „Nr. document”),
 * linked to the entry, which is marked answered. In the document's transaction; audited.
 */
export async function registerDocumentReply(
  tx: Tx,
  user: CurrentUser,
  entryId: string,
  doc: { id: string; nr: number; anRegistru: number; data: string; catre: string; subiect: string; personId: string | null },
): Promise<void> {
  const entry = await tx.correspondence.findUnique({ where: { id: entryId }, select: { id: true, directie: true, rezolvare: true } });
  if (!entry || entry.directie !== "INTRARE") return;
  const an = Number(doc.data.slice(0, 4));
  await lockCorrespondenceRegister(tx, user.churchId, an);
  const nr = await nextFreeCorrespondenceNumber(tx, user.churchId, an);
  const row = await tx.correspondence.create({
    data: { churchId: user.churchId, nr, an, data: toDbDate(doc.data)!, directie: "IESIRE", catre: doc.catre, subiect: doc.subiect, documentId: doc.id, raspunsLaId: entry.id, personId: doc.personId, createdById: user.id },
  });
  const after = await correspondenceView(tx, row.id);
  await writeAudit(tx, user, { entity: "CORRESPONDENCE", entityId: row.id, entityLabel: correspondenceLabel(after!), action: "CREATE", fields: CORRESPONDENCE_FIELDS, after });
  await markAnswered(tx, user, entry, `Răspuns cu documentul nr. ${doc.nr}/${doc.anRegistru}`);
}
