"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { EVENT_FIELDS, eventFormInput, eventSchema } from "@/lib/schemas/event";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

async function auditView(tx: Tx, id: string) {
  const e = await tx.event.findUnique({ where: { id }, include: { contributii: { orderBy: { pozitie: "asc" } } } });
  if (!e) return null;
  return { ...e, contributii: e.contributii.map((c) => `${c.cine}: ${c.ce}`).join("; ") };
}

const label = (e: { titlu: string; data: Date }) => `${e.titlu} (${e.data.toISOString().slice(0, 10)})`;

export async function saveEventAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const { contributii, ...fields } = parseOrThrow(eventSchema, eventFormInput(formData));
    const data = { ...fields, data: toDbDate(fields.data)! };
    const rows = contributii.map((c, pozitie) => ({ ...c, pozitie }));

    savedId = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await auditView(tx, id);
        if (!before) throw new ActionError("Evenimentul nu mai există.");
        await tx.event.update({ where: { id }, data: { ...data, contributii: { deleteMany: {}, create: rows } } });
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
