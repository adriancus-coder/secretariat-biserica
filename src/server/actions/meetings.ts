"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { absentees, attendanceText, votesOverPresent } from "@/lib/attendance";
import { minutesFormatting, pointsText } from "@/lib/minutes";
import { Prisma } from "@/generated/prisma/client";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { MEETING_FIELDS, meetingFormInput, meetingSchema } from "@/lib/schemas/meeting";
import { compareRo } from "@/lib/text";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { rememberAliases } from "../person-aliases";
import { pickedNamesInput, pickedNamesSchema } from "@/lib/schemas/person-alias";
import { lockMeetingRegister, nextFreeMeetingNumber } from "../doc-numbering";
import { checkedDocx, DOCX_MIME, DocxError } from "../minutes-import";
import { plainToRich } from "@/lib/rich-text";
import { expectedAttendees } from "../queries/attendance";
import { getChurch } from "../queries/church";
import { assertPersonsInChurch } from "../queries/persons";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

const LOCKED = "Procesul-verbal este închis. Doar administratorul îl poate redeschide.";

/** Instantaneu pentru jurnal: câmpurile ședinței + prezenții și absenții (număr și nume). */
async function auditView(tx: Tx, id: string) {
  const m = await tx.meeting.findUnique({
    where: { id },
    include: { prezenti: { include: { person: { select: { nume: true, prenume: true } } } } },
  });
  if (!m) return null;
  const names = (status: "PRESENT" | "ABSENT") =>
    attendanceText(m.prezenti.filter((p) => p.status === status).map((p) => memberName(p.person)).sort(compareRo));
  const votes = Array.isArray(m.voturi) ? (m.voturi as ({ pentru: number; contra: number; abtineri: number; secret?: boolean } | null)[]) : [];
  return {
    ...m,
    prezenti: names("PRESENT"),
    absenti: names("ABSENT"),
    puncte: pointsText(m.puncte),
    formatare: minutesFormatting(m),
    voturi: votes.map((v, i) => (v ? `${i + 1}: ${v.pentru}/${v.contra}/${v.abtineri}${v.secret ? " secret" : ""}` : "")).filter(Boolean).join("; "),
  };
}

/**
 * Attendance rows: the persons present, plus the expected ones (by the type's rule) who are not;
 * `asteptati` is how many the rule expected (null for a manual type).
 */
async function attendance(ctx: Ctx, tip: string, date: string, present: string[], byNumber: boolean) {
  const church = await getChurch(ctx);
  const rule = church.attendanceRules[tip] ?? "MANUAL";
  const expected = await expectedAttendees(ctx.db, rule, date);
  // ATTENDANCE-COUNT: recorded only as a number, there are no attendee rows (no names, no absentees).
  const absent = byNumber ? [] : absentees(expected, present);
  return {
    asteptati: rule === "MANUAL" ? null : expected.length,
    rows: [
      ...present.map((personId) => ({ personId, status: "PRESENT" as const })),
      ...absent.map((personId) => ({ personId, status: "ABSENT" as const })),
    ],
  };
}

const label = (m: { titlu: string; tip: string; data: Date; nr?: number | null; anRegistru?: number | null }) =>
  `${m.nr != null ? `PV nr. ${m.nr}/${m.anRegistru} — ` : ""}${m.titlu || m.tip} (${m.data.toISOString().slice(0, 10)})`;

export interface MeetingFormState extends FormState {
  /** Import review only: the saved meeting (the form stays on the page for "Următorul"). */
  savedId?: string;
}

export async function saveMeetingAction(id: string | null, _prev: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  let savedId: string | undefined;
  // Import review (hidden field "import", MINUTES-IMPORT-ROBUST): a record copy of an old paper minutes; it
  // keeps the old document's number (never renumbered: a taken one is kept as „număr dublu” or left out, as chosen).
  const importing = id === null && formData.get("import") === "1";
  const conflictChoice = String(formData.get("nrConflict") ?? "");
  let savedNr = "";
  let notice = "";
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const { prezenti: ids, nr: wantedNr, puncteRich, observatiiRich, formulaRich, voturi, convocatLa, ...fields } = parseOrThrow(meetingSchema, meetingFormInput(formData));
    // The editor's documents (null clears the column: the plain text is then all there is).
    const rich = {
      puncteRich: puncteRich ? (puncteRich as unknown as Prisma.InputJsonArray) : Prisma.DbNull,
      observatiiRich: observatiiRich ? (observatiiRich as unknown as Prisma.InputJsonObject) : Prisma.DbNull,
      formulaRich: formulaRich ? (formulaRich as unknown as Prisma.InputJsonObject) : Prisma.DbNull,
      // Votes aligned with the points (only as many as there are points).
      voturi: voturi ? (voturi.slice(0, fields.puncte.length) as unknown as Prisma.InputJsonArray) : Prisma.DbNull,
      convocatLa: toDbDate(convocatLa),
    };
    const prezenti = await assertPersonsInChurch(ctx.db, ids);
    // Import review: the "Nepotriviți" names matched by hand are remembered as aliases of the attendees.
    const picks = importing ? parseOrThrow(pickedNamesSchema, pickedNamesInput(formData)).filter((p) => prezenti.includes(p.personId)) : [];
    const byNumber = fields.numarPrezenti !== null;
    const voteError = votesOverPresent(voturi, byNumber ? fields.numarPrezenti! : prezenti.length, byNumber || prezenti.length > 0);
    if (voteError) throw new ValidationError({ voturi: voteError });
    const { asteptati, rows } = await attendance(ctx, fields.tip, fields.data, prezenti, byNumber);
    // Excused absences ticked in the form (only absentees count); without the field the saved ones stay.
    const excusedInForm = formData.get("motivatiForm") === "1" ? new Set(formData.getAll("motivati").map(String)) : null;
    const year = Number(fields.data.slice(0, 4));
    // The original Word file of an imported minutes, kept with it (the import's limits).
    const original = importing ? formData.get("original") : null;
    let originalFile: { name: string; data: Buffer } | null = null;
    if (original instanceof File && original.size > 0) {
      try {
        originalFile = { name: original.name.slice(0, 200), data: await checkedDocx(original) };
      } catch (e) {
        if (e instanceof DocxError) throw new ActionError(e.message);
        throw e;
      }
    }

    savedId = await ctx.db.$transaction(async (tx) => {
      // Like the document register: the year of the meeting date, numbers serialized per (church, year).
      await lockMeetingRegister(tx, ctx.user.churchId, year);
      const previous = id ? await tx.meeting.findUnique({ where: { id }, select: { nr: true, anRegistru: true, locked: true, importat: true } }) : null;
      if (id && !previous) throw new ActionError("Procesul-verbal nu mai există.");
      if (previous?.locked) throw new ActionError(LOCKED);
      let nr: number | null;
      let nrVechi: number | null | undefined;
      if (wantedNr !== null) {
        const clash = await tx.meeting.findFirst({
          where: { anRegistru: year, nr: wantedNr, ...(id ? { id: { not: id } } : {}) },
          select: { id: true },
        });
        if (clash && importing && conflictChoice === "dublu") {
          // „Păstrează numărul (număr dublu în evidența veche)”: shown, but not in the register's sequence.
          nr = null;
          nrVechi = wantedNr;
          notice = `Procesul-verbal a fost importat cu numărul ${wantedNr}/${year} (număr dublu în evidența veche).`;
        } else if (clash && importing && conflictChoice === "fara") {
          // „Fără număr”: the old number goes to the observations.
          nr = null;
          const line = `Număr în evidența veche: ${wantedNr}/${year}.`;
          fields.observatii = `${line}\n${fields.observatii}`.trim();
          rich.observatiiRich = plainToRich(fields.observatii) as unknown as Prisma.InputJsonObject;
          notice = `Procesul-verbal a fost importat fără număr; numărul vechi ${wantedNr}/${year} este trecut la Observații.`;
        } else if (clash && importing) {
          throw new ValidationError({ nr: `Numărul ${wantedNr}/${year} este deja folosit. Alegeți mai sus: păstrați numărul ca „număr dublu” sau importați fără număr.` });
        } else if (clash) throw new ValidationError({ nr: `Numărul ${wantedNr}/${year} este deja folosit de alt proces-verbal.` });
        else nr = wantedNr;
      } else if (previous?.nr != null && previous.anRegistru === year) nr = previous.nr;
      // An imported minutes without a number keeps none (never numbered automatically).
      else if (importing || (previous?.importat && previous.nr === null)) nr = null;
      else nr = await nextFreeMeetingNumber(tx, ctx.user.churchId, year);
      savedNr = nr !== null ? `${nr}/${year}` : "";
      const data = { ...fields, ...rich, data: toDbDate(fields.data)!, asteptati, nr, anRegistru: year, ...(nrVechi !== undefined ? { nrVechi } : {}) };

      if (id) {
        const before = await auditView(tx, id);
        if (!before) throw new ActionError("Procesul-verbal nu mai există.");
        // An excused absence stays excused while the person is still absent (unless the form says otherwise).
        const excused = excusedInForm ?? new Set((await tx.meetingAttendee.findMany({ where: { meetingId: id, motivat: true }, select: { personId: true } })).map((r) => r.personId));
        await tx.meeting.update({
          where: { id },
          data: { ...data, prezenti: { deleteMany: {}, create: rows.map((r) => ({ ...r, motivat: r.status === "ABSENT" && excused.has(r.personId) })) } },
        });
        // A signature belongs to someone present: removing a person from the list removes it.
        await tx.meetingSignature.deleteMany({ where: { meetingId: id, personId: { notIn: prezenti } } });
        const after = await auditView(tx, id);
        // The ticks were removed: the log says why.
        const toNumber = byNumber && before.numarPrezenti === null && (before.prezenti || before.absenti);
        await writeAudit(tx, ctx.user, {
          entity: "MEETING",
          entityId: id,
          entityLabel: label(after!),
          action: "UPDATE",
          fields: MEETING_FIELDS,
          before,
          after,
          ...(toNumber ? { extra: { observatie: `prezența consemnată ca număr: ${fields.numarPrezenti}` } } : {}),
        });
        return id;
      }
      const created = await tx.meeting.create({
        data: {
          ...data,
          churchId: ctx.user.churchId,
          ...(importing ? { importat: true } : {}),
          prezenti: { create: rows.map((r) => ({ ...r, motivat: r.status === "ABSENT" && Boolean(excusedInForm?.has(r.personId)) })) },
        },
      });
      if (originalFile) {
        await tx.meetingSourceFile.create({
          data: { churchId: ctx.user.churchId, meetingId: created.id, numeFisier: originalFile.name, mime: DOCX_MIME, bytes: originalFile.data.length, data: new Uint8Array(originalFile.data) },
        });
      }
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: created.id,
        entityLabel: label(created),
        action: "CREATE",
        fields: MEETING_FIELDS,
        after: await auditView(tx, created.id),
      });
      await rememberAliases(tx, ctx.user, picks);
      return created.id;
    });
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  if (importing) return { ok: true, savedId, message: notice || (savedNr ? `Procesul-verbal nr. ${savedNr} a fost importat.` : "Procesul-verbal a fost importat fără număr.") };
  // „Semnează” on a new minutes: saved first, then the page opens the signature.
  if (formData.get("dupa") === "semneaza") redirect(`/procese-verbale/${savedId}?salvat=1&semneaza=1#semnaturi`);
  redirect(`/procese-verbale/${savedId}?salvat=1`);
}

/** "Atribuie număr": the next free number of the meeting's year, for a meeting saved without one. */
export async function assignMeetingNumberAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const m = await tx.meeting.findUnique({ where: { id }, select: { data: true, nr: true, locked: true } });
      if (!m) throw new ActionError("Procesul-verbal nu mai există.");
      if (m.locked) throw new ActionError(LOCKED);
      if (m.nr !== null) return;
      const year = m.data.getUTCFullYear();
      await lockMeetingRegister(tx, ctx.user.churchId, year);
      const before = await auditView(tx, id);
      await tx.meeting.update({ where: { id }, data: { nr: await nextFreeMeetingNumber(tx, ctx.user.churchId, year), anRegistru: year } });
      const after = await auditView(tx, id);
      await writeAudit(tx, ctx.user, { entity: "MEETING", entityId: id, entityLabel: label(after!), action: "UPDATE", fields: MEETING_FIELDS, before, after });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect(`/procese-verbale/${id}?salvat=1&mesaj=${encodeURIComponent("Numărul a fost atribuit.")}`);
}

export async function deleteMeetingAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await auditView(tx, id);
      if (!before) throw new ActionError("Procesul-verbal nu mai există.");
      if (before.locked) throw new ActionError(LOCKED);
      await tx.meeting.delete({ where: { id } });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: id,
        entityLabel: label(before),
        action: "DELETE",
        fields: MEETING_FIELDS,
        before,
      });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/procese-verbale?sters=1");
}
