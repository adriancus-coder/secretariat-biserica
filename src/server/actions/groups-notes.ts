"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { noteSearchText } from "@/lib/person-derived";
import { GROUP_FIELDS, groupFormInput, groupSchema, NOTE_FIELDS, noteSchema } from "@/lib/schemas/group-note";
import { compareRo } from "@/lib/text";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { assertPersonsInChurch } from "../queries/persons";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

// ---------- Grupuri ----------

async function groupView(tx: Tx, id: string) {
  const g = await tx.group.findUnique({
    where: { id },
    include: { membri: { include: { person: { select: { nume: true, prenume: true } } } } },
  });
  if (!g) return null;
  return { ...g, membri: g.membri.map((m) => memberName(m.person)).sort(compareRo) };
}

export async function saveGroupAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const { membri: ids, ...fields } = parseOrThrow(groupSchema, groupFormInput(formData));
    const membri = await assertPersonsInChurch(ctx.db, ids);
    savedId = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await groupView(tx, id);
        if (!before) throw new ActionError("Grupul nu mai există.");
        await tx.group.update({
          where: { id },
          data: { ...fields, membri: { deleteMany: {}, create: membri.map((personId) => ({ personId })) } },
        });
        const after = await groupView(tx, id);
        await writeAudit(tx, ctx.user, { entity: "GROUP", entityId: id, entityLabel: after!.nume, action: "UPDATE", fields: GROUP_FIELDS, before, after });
        return id;
      }
      const created = await tx.group.create({
        data: { ...fields, churchId: ctx.user.churchId, membri: { create: membri.map((personId) => ({ personId })) } },
      });
      await writeAudit(tx, ctx.user, {
        entity: "GROUP",
        entityId: created.id,
        entityLabel: created.nume,
        action: "CREATE",
        fields: GROUP_FIELDS,
        after: await groupView(tx, created.id),
      });
      return created.id;
    });
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  redirect(`/grupuri/${savedId}?salvat=1`);
}

export async function deleteGroupAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await groupView(tx, id);
      if (!before) throw new ActionError("Grupul nu mai există.");
      await tx.group.delete({ where: { id } });
      await writeAudit(tx, ctx.user, { entity: "GROUP", entityId: id, entityLabel: before.nume, action: "DELETE", fields: GROUP_FIELDS, before });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/grupuri?sters=1");
}

// ---------- Mențiuni ----------

async function noteView(tx: Tx, id: string) {
  const n = await tx.note.findUnique({ where: { id }, include: { person: { select: { nume: true, prenume: true } } } });
  if (!n) return null;
  return { ...n, persoana: n.person ? memberName(n.person) : "" };
}

const noteLabel = (n: { persoana: string; familie: string; tip: string }) =>
  `${n.tip} — ${n.persoana || (n.familie ? `Familia ${n.familie}` : "General")}`;

export async function saveNoteAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let saved: { id: string; personId: string | null } | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(noteSchema, Object.fromEntries(formData));
    if (input.personId && !(await ctx.db.person.findUnique({ where: { id: input.personId }, select: { id: true } }))) {
      throw new ValidationError({ personId: "Persoana nu mai există în registru." });
    }
    const data = { ...input, data: toDbDate(input.data)!, searchText: noteSearchText(input) };
    saved = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await noteView(tx, id);
        if (!before) throw new ActionError("Mențiunea nu mai există.");
        await tx.note.update({ where: { id }, data });
        const after = await noteView(tx, id);
        await writeAudit(tx, ctx.user, { entity: "NOTE", entityId: id, entityLabel: noteLabel(after!), action: "UPDATE", fields: NOTE_FIELDS, before, after });
        return { id, personId: data.personId };
      }
      const created = await tx.note.create({ data: { ...data, churchId: ctx.user.churchId } });
      const after = await noteView(tx, created.id);
      await writeAudit(tx, ctx.user, { entity: "NOTE", entityId: created.id, entityLabel: noteLabel(after!), action: "CREATE", fields: NOTE_FIELDS, after });
      return { id: created.id, personId: data.personId };
    });
  });
  if (!saved) return state;
  revalidatePath("/", "layout");
  // Adăugată de pe fișa persoanei → înapoi la fișă, ca în prototip.
  redirect(formData.get("inapoi") === "persoana" && saved.personId ? `/persoane/${saved.personId}?salvat=1` : `/mentiuni/${saved.id}?salvat=1`);
}

export async function deleteNoteAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await noteView(tx, id);
      if (!before) throw new ActionError("Mențiunea nu mai există.");
      await tx.note.delete({ where: { id } });
      await writeAudit(tx, ctx.user, { entity: "NOTE", entityId: id, entityLabel: noteLabel(before), action: "DELETE", fields: NOTE_FIELDS, before });
    });
  });
  if (!state.ok) return state;
  revalidatePath("/", "layout");
  redirect("/mentiuni?sters=1");
}
