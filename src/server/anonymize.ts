import "server-only";
import { defaultFamilyName } from "@/lib/families";
import { personDerived } from "@/lib/person-derived";
import { writeAudit } from "./audit";
import type { Ctx } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** What an anonymised person is called everywhere. */
export const ANONYMOUS_NAME = "Persoană ștearsă";

/**
 * The strings to remove when a person is anonymised: the name in both orders ("Ion Popescu" in the
 * minutes, "Popescu Ion" in lists), the phone number and the e-mail address. Short values are left
 * out so that common words are never rewritten.
 */
export function anonymisationNeedles(p: { nume: string; prenume: string; telefon: string; email: string }): string[] {
  const nume = p.nume.trim();
  const prenume = p.prenume.trim();
  const names = prenume ? [`${prenume} ${nume}`, `${nume} ${prenume}`] : [nume];
  return [...new Set([...names.filter((n) => n.length >= 5), ...(p.telefon.trim().length >= 6 ? [p.telefon.trim()] : []), ...(p.email.trim().length >= 6 ? [p.email.trim()] : [])])];
}

/**
 * Replaces the needles in the church's free texts and audit entries (raw SQL: the churchId condition
 * is written by hand). Documents in the outgoing register are an official record and stay unchanged.
 */
export async function scrubPersonTraces(tx: Tx, churchId: string, needles: readonly string[]): Promise<void> {
  for (const n of needles) {
    const r = n.includes("@") || /^[+\d\s()-]+$/.test(n) ? "" : ANONYMOUS_NAME;
    await tx.$executeRaw`UPDATE "meetings" SET
        "presedinte" = replace("presedinte", ${n}, ${r}), "invitati" = replace("invitati", ${n}, ${r}),
        "ordine" = replace("ordine", ${n}, ${r}), "observatii" = replace("observatii", ${n}, ${r}),
        "titlu" = replace("titlu", ${n}, ${r}),
        "puncte" = ARRAY(SELECT replace(x, ${n}, ${r}) FROM unnest("puncte") AS x)
      WHERE "churchId" = ${churchId} AND (strpos("presedinte" || "invitati" || "ordine" || "observatii" || "titlu" || array_to_string("puncte", ' '), ${n}) > 0)`;
    await tx.$executeRaw`UPDATE "meeting_sends" s SET "to" = array_remove(s."to", ${n.toLowerCase()})
      FROM "meetings" m WHERE m."id" = s."meetingId" AND m."churchId" = ${churchId} AND ${n.toLowerCase()} = ANY(s."to")`;
    await tx.$executeRaw`UPDATE "events" SET
        "responsabil" = replace("responsabil", ${n}, ${r}), "agapaResponsabil" = replace("agapaResponsabil", ${n}, ${r}),
        "invitat" = replace("invitat", ${n}, ${r}), "descriere" = replace("descriere", ${n}, ${r}), "titlu" = replace("titlu", ${n}, ${r})
      WHERE "churchId" = ${churchId} AND strpos("responsabil" || "agapaResponsabil" || "invitat" || "descriere" || "titlu", ${n}) > 0`;
    await tx.$executeRaw`UPDATE "event_contributions" c SET "cine" = replace(c."cine", ${n}, ${r}), "ce" = replace(c."ce", ${n}, ${r})
      FROM "events" e WHERE e."id" = c."eventId" AND e."churchId" = ${churchId} AND strpos(c."cine" || c."ce", ${n}) > 0`;
    await tx.$executeRaw`UPDATE "groups" SET "responsabil" = replace("responsabil", ${n}, ${r}), "descriere" = replace("descriere", ${n}, ${r})
      WHERE "churchId" = ${churchId} AND strpos("responsabil" || "descriere", ${n}) > 0`;
    await tx.$executeRaw`UPDATE "notes" SET "text" = replace("text", ${n}, ${r}), "familie" = replace("familie", ${n}, ${r}),
        "searchText" = replace("searchText", lower(${n}), '')
      WHERE "churchId" = ${churchId} AND strpos("text" || "familie", ${n}) > 0`;
    await tx.$executeRaw`UPDATE "families" SET "nume" = replace("nume", ${n}, ${r}), "note" = replace("note", ${n}, ${r})
      WHERE "churchId" = ${churchId} AND strpos("nume" || "note", ${n}) > 0`;
    // Audit entries of every entity (meetings, groups, families, notes, applications, documents' log…):
    // the label and the recorded values. A needle with JSON escapes is replaced in the label only.
    await tx.$executeRaw`UPDATE "audit_logs" SET "entityLabel" = replace("entityLabel", ${n}, ${r})
      WHERE "churchId" = ${churchId} AND strpos("entityLabel", ${n}) > 0`;
    if (!/["\\]/.test(n)) {
      await tx.$executeRaw`UPDATE "audit_logs" SET "changes" = replace("changes"::text, ${n}, ${r})::jsonb
        WHERE "churchId" = ${churchId} AND "changes" IS NOT NULL AND strpos("changes"::text, ${n}) > 0`;
    }
  }
}

/**
 * Anonymisation: the personal data go, the record stays for the statistics (statut, gender, dates of
 * birth, entry, baptism and exit, family). Notes about the person, roles, group memberships, aliases
 * and drawn signatures are deleted; the linked membership application is blanked and unlinked;
 * earlier audit entries of the person lose their details, and the name, phone and e-mail are replaced
 * in the church's other texts and audit entries. Documents in the outgoing register keep the name:
 * they are an official record. False when the person is not (or no longer) in the church's register.
 */
export async function anonymizePerson(ctx: Ctx, id: string): Promise<boolean> {
  return ctx.db.$transaction(async (tx) => {
    const before = await tx.person.findUnique({ where: { id }, include: { family: { select: { id: true, nume: true } } } });
    if (!before) return false;
    const application = await tx.application.findFirst({ where: { personId: id } });
    const needles = anonymisationNeedles(before);
    if (application) needles.push(...anonymisationNeedles(application).filter((n) => !needles.includes(n)));
    const blank = { nume: ANONYMOUS_NAME, prenume: "", telefon: "", email: "", adresa: "", note: "", botezBiserica: "", botezLocalitate: "", botezOficiant: "" };
    await tx.person.update({
      where: { id },
      data: {
        ...blank,
        bisericaProvenienta: "",
        bisericaDestinatie: "",
        slujire: "",
        familieVeche: "",
        inComitet: false,
        ...personDerived(blank),
      },
    });
    await tx.personRole.deleteMany({ where: { personId: id } });
    await tx.personAlias.deleteMany({ where: { personId: id } });
    await tx.groupMember.deleteMany({ where: { personId: id } });
    await tx.note.deleteMany({ where: { personId: id } });
    // MeetingSignature has no churchId: the person was just found in this church.
    await tx.meetingSignature.deleteMany({ where: { personId: id } });
    if (application) {
      await tx.application.update({
        where: { id: application.id },
        data: { personId: null, nume: ANONYMOUS_NAME, prenume: "", telefon: "", email: "", adresa: "", mesaj: "", familie: "", rudenie: "", bisericaProvenienta: "", botezBiserica: "", botezLocalitate: "", botezOficiant: "" },
      });
    }
    // A family named after the person loses that name.
    if (before.family && before.family.nume === defaultFamilyName(before)) {
      await tx.family.update({ where: { id: before.family.id }, data: { nume: "Familie (nume șters)" } });
    }
    // Earlier audit entries of the person and of its application keep when and who, not the data.
    await tx.auditLog.updateMany({ where: { entity: "PERSON", entityId: id }, data: { entityLabel: ANONYMOUS_NAME, changes: {} } });
    if (application) {
      await tx.auditLog.updateMany({ where: { entity: "APPLICATION", entityId: application.id }, data: { entityLabel: ANONYMOUS_NAME, changes: {} } });
    }
    await scrubPersonTraces(tx, ctx.user.churchId, needles);
    await writeAudit(tx, ctx.user, {
      entity: "PERSON",
      entityId: id,
      entityLabel: ANONYMOUS_NAME,
      action: "UPDATE",
      fields: [],
      extra: { anonimizare: "datele personale au fost șterse; statistica rămâne" },
    });
    return true;
  });
}
