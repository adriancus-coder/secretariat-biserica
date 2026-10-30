import { meetingPrint } from "@/domain/print";
import { absentees } from "@/lib/attendance";
import { minutesAttendance } from "@/lib/general-assembly";
import { resolveLayout } from "@/lib/page-layout";
import { meetingFormInput, meetingSchema } from "@/lib/schemas/meeting";
import { idSchema } from "@/lib/validation";
import { minutesSignatures } from "@/server/pdf/meeting";
import { pdfResponse, renderPdf } from "@/server/pdf/render";
import { expectedAttendees } from "@/server/queries/attendance";
import { getChurch } from "@/server/queries/church";
import { getMeeting } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";

const badRequest = (message: string) => new Response(message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** The minutes as the form holds them now (unsaved): "Previzualizează" on the minutes form. */
export async function POST(req: Request) {
  const ctx = await requireCtx("write");
  const form = await req.formData();
  const parsed = meetingSchema.safeParse(meetingFormInput(form));
  if (!parsed.success) return badRequest("Date incomplete pentru previzualizare: completați tipul, data și conținutul.");
  const m = parsed.data;
  const church = await getChurch(ctx);
  // An existing meeting keeps its number, signatures and page layout in the preview.
  const previewId = idSchema.safeParse(form.get("previewId"));
  const existing = previewId.success ? await getMeeting(ctx, previewId.data) : null;
  const rule = church.attendanceRules[m.tip] ?? "MANUAL";
  const expected = await expectedAttendees(ctx.db, rule, m.data);
  // ATTENDANCE-COUNT: by number there are no names and no absentees (the schema already emptied prezenti).
  const absentIds = m.numarPrezenti !== null ? [] : absentees(expected, m.prezenti);
  // Names through the church-scoped client: ids of another church simply find nobody.
  const people = await ctx.db.person.findMany({
    where: { id: { in: [...m.prezenti, ...absentIds] } },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
    select: { id: true, nume: true, prenume: true },
  });
  const present = people.filter((p) => m.prezenti.includes(p.id));
  const signed = new Map((existing?.prezenti ?? []).filter((p) => p.signature).map((p) => [p.id, p.signature!]));
  const signatures = minutesSignatures(
    present.map((p) => ({ ...p, signature: signed.get(p.id) ?? null })),
    existing?.roleSignatures ?? {},
    church,
  );
  const spec = meetingPrint(
    {
      nr: m.nr ?? existing?.nr ?? null,
      tip: m.tip,
      data: m.data,
      prezenti: present,
      absenti: people.filter((p) => absentIds.includes(p.id)),
      numarPrezenti: m.numarPrezenti,
      invitati: m.invitati,
      ordine: m.ordine,
      puncte: m.puncte,
      puncteRich: m.puncteRich,
      observatii: m.observatii,
      observatiiRich: m.observatiiRich,
      formulaIncheiere: m.formulaIncheiere,
      formulaRich: m.formulaRich,
      ...minutesAttendance(
        {
          tip: m.tip,
          data: m.data,
          asteptati: rule === "MANUAL" ? null : expected.length,
          present: present.length,
          absent: absentIds.length,
          numarPrezenti: m.numarPrezenti,
          convocatLa: m.convocatLa ?? null,
          voturi: m.voturi ?? null,
        },
        church,
      ),
      sedintaInchisa: existing?.sedintaInchisa ?? false,
      ...signatures,
    },
    church,
  );
  const pdf = await renderPdf({ ...spec, layout: resolveLayout(church.pvLayout, existing?.layout) });
  return pdfResponse(pdf, "previzualizare.pdf");
}
