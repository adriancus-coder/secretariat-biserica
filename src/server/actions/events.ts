"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { EVENT_FIELDS, eventFormInput, eventSchema } from "@/lib/schemas/event";
import { idSchema } from "@/lib/validation";
import { EVENT_ROLE_LABEL, eventKind, eventPersonsError, type EventPersonRole } from "@/lib/event-persons";
import { memberName } from "@/lib/format";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

async function auditView(tx: Tx, id: string) {
  const e = await tx.event.findUnique({
    where: { id },
    include: {
      contributii: { orderBy: { pozitie: "asc" } },
      family: { select: { nume: true } },
      persoane: { orderBy: { ordine: "asc" }, select: { rol: true, numeLiber: true, person: { select: { nume: true, prenume: true } } } },
    },
  });
  if (!e) return null;
  const { family, persoane, ...rest } = e;
  return {
    ...rest,
    contributii: e.contributii.map((c) => `${c.cine}: ${c.ce}`).join("; "),
    familie: family?.nume ?? "",
    // EVENT-PERSONS: by name, never ids.
    persoane: persoane.map((p) => `${EVENT_ROLE_LABEL[p.rol as EventPersonRole]}: ${p.person ? memberName(p.person) : p.numeLiber}`).join("; "),
  };
}

const label = (e: { titlu: string; data: Date }) => `${e.titlu} (${e.data.toISOString().slice(0, 10)})`;

export async function saveEventAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const { contributii, persoane: wanted, familyId: wantedFamily, ...fields } = parseOrThrow(eventSchema, eventFormInput(formData));
    const rows = contributii.map((c, pozitie) => ({ ...c, pozitie }));
    // EVENT-PERSONS: the family and the persons, found through the church's scoped client.
    const kind = eventKind(fields.tip);
    const persoane = kind ? wanted : [];
    const ids = persoane.map((p) => p.personId).filter((x): x is string => Boolean(x));
    const found = ids.length ? await ctx.db.person.findMany({ where: { id: { in: ids } }, select: { id: true, familyId: true } }) : [];
    if (found.length !== new Set(ids).size) throw new ValidationError({ persoane: "Una sau mai multe persoane alese nu mai sunt în registru." });
    const familyOf = new Map(found.map((p) => [p.id, p.familyId]));
    let familyId = wantedFamily;
    // A blessing whose children are chosen by name, or a funeral: the family follows the persons.
    if (!familyId && (kind === "binecuvantare" || kind === "inmormantare")) {
      const fams = [...new Set(found.map((p) => p.familyId).filter(Boolean))];
      if (fams.length === 1) familyId = fams[0]!;
    }
    if (familyId && !(await ctx.db.family.findUnique({ where: { id: familyId }, select: { id: true } }))) throw new ValidationError({ familyId: "Familia nu mai există." });
    const personsError = eventPersonsError(kind, persoane, (pid) => familyOf.get(pid) ?? null, familyId);
    if (personsError) throw new ValidationError({ persoane: personsError });
    const data = { ...fields, familyId, data: toDbDate(fields.data)! };
    const personRows = (applied: Map<string, Date | null>) =>
      persoane.map((p, ordine) => ({
        churchId: ctx.user.churchId,
        personId: p.personId,
        numeLiber: p.personId ? "" : p.numeLiber,
        rol: p.rol,
        ordine,
        aplicatInRegistruLa: p.personId ? (applied.get(`${p.personId}:${p.rol}`) ?? null) : null,
      }));

    savedId = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await auditView(tx, id);
        if (!before) throw new ActionError("Evenimentul nu mai există.");
        // A person already applied to the register keeps that mark.
        const applied = new Map(
          (await tx.eventPerson.findMany({ where: { eventId: id, personId: { not: null } }, select: { personId: true, rol: true, aplicatInRegistruLa: true } })).map((p) => [`${p.personId}:${p.rol}`, p.aplicatInRegistruLa]),
        );
        await tx.event.update({ where: { id }, data: { ...data, contributii: { deleteMany: {}, create: rows } } });
        await tx.eventPerson.deleteMany({ where: { eventId: id } });
        if (persoane.length) await tx.eventPerson.createMany({ data: personRows(applied).map((r) => ({ ...r, eventId: id })) });
        const after = await auditView(tx, id);
        await writeAudit(tx, ctx.user, {
          entity: "EVENT",
          entityId: id,
          entityLabel: label(after!),
          action: "UPDATE",
          fields: EVENT_FIELDS,
          before,
          after,
        });
        return id;
      }
      const created = await tx.event.create({
        data: { ...data, churchId: ctx.user.churchId, contributii: { create: rows } },
      });
      if (persoane.length) await tx.eventPerson.createMany({ data: personRows(new Map()).map((r) => ({ ...r, eventId: created.id })) });
      await writeAudit(tx, ctx.user, {
        entity: "EVENT",
        entityId: created.id,
        entityLabel: label(created),
        action: "CREATE",
        fields: EVENT_FIELDS,
        after: await auditView(tx, created.id),
      });
      return created.id;
    });
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  redirect(`/calendar/${savedId}?salvat=1`);
}

export async function deleteEventAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await auditView(tx, id);
      if (!before) throw new ActionError("Evenimentul nu mai există.");
      await tx.event.delete({ where: { id } });
      await writeAudit(tx, ctx.user, {
        entity: "EVENT",
        entityId: id,
        entityLabel: label(before),
        action: "DELETE",
        fields: EVENT_FIELDS,
        before,
      });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/calendar?sters=1");
}
