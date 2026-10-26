import { dotDateTime, todayIso } from "@/lib/dates";
import { fmtDot } from "@/domain/print";
import { memberName } from "@/lib/format";
import { pastoralNotesPrint } from "@/lib/pastoral-print";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "@/server/audit";
import { decryptNote } from "@/server/pastoral-notes";
import { pdfFileName, pdfResponse, renderPdf } from "@/server/pdf/render";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";
import { hasStepUp } from "@/server/step-up";

/**
 * "Exportă notele pastorale" (pastors only, after the step-up): one person's notes (`?persoana=`) or
 * all of the church's. Audited without any content: the count and the scope only.
 */
export async function GET(req: Request) {
  const ctx = await requireCtx("pastoral");
  if (!(await hasStepUp(ctx.user))) {
    return new Response("Confirmați identitatea pe pagina persoanei, apoi încercați din nou.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const param = new URL(req.url).searchParams.get("persoana");
  const personId = param && idSchema.safeParse(param).success ? param : null;
  const rows = await ctx.db.pastoralNote.findMany({
    where: personId ? { personId } : {},
    orderBy: [{ person: { sortKey: "asc" } }, { createdAt: "asc" }],
    select: { personId: true, textEnc: true, updatedAt: true, createdBy: { select: { name: true } }, person: { select: { nume: true, prenume: true } } },
  });
  const persons = new Map<string, { name: string; notes: { author: string; when: string; text: string | null }[] }>();
  for (const r of rows) {
    const p = persons.get(r.personId) ?? { name: memberName(r.person), notes: [] };
    p.notes.push({ author: r.createdBy?.name ?? "utilizator șters", when: dotDateTime(r.updatedAt), text: decryptNote(r.textEnc) });
    persons.set(r.personId, p);
  }
  const church = await getChurch(ctx);
  const pdf = await renderPdf(pastoralNotesPrint([...persons.values()], fmtDot(todayIso()), church));
  await writeAudit(ctx.db, ctx.user, {
    entity: "PASTORAL",
    entityId: personId ?? ctx.user.churchId,
    entityLabel: personId ? ([...persons.values()][0]?.name ?? "persoană") : "toate persoanele",
    action: "CREATE",
    fields: [],
    extra: { observatie: "note pastorale exportate (PDF)", note: rows.length },
  });
  return pdfResponse(pdf, pdfFileName(personId ? `note-pastorale-${[...persons.values()][0]?.name ?? "persoana"}` : "note-pastorale"), true);
}
