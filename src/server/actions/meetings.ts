"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toDbDate } from "@/lib/dates";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { MEETING_FIELDS, meetingFormInput, meetingSchema } from "@/lib/schemas/meeting";
import { compareRo } from "@/lib/text";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { assertPersonsInChurch } from "../queries/persons";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** Instantaneu pentru jurnal: câmpurile ședinței + numele prezenților. */
async function auditView(tx: Tx, id: string) {
  const m = await tx.meeting.findUnique({
    where: { id },
    include: { prezenti: { include: { person: { select: { nume: true, prenume: true } } } } },
  });
  if (!m) return null;
  return { ...m, prezenti: m.prezenti.map((p) => memberName(p.person)).sort(compareRo) };
}

const label = (m: { titlu: string; tip: string; data: Date }) => `${m.titlu || m.tip} (${m.data.toISOString().slice(0, 10)})`;

export async function saveMeetingAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  let savedId: string | undefined;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    if (id !== null) parseOrThrow(idSchema, id);
    const { prezenti: ids, ...fields } = parseOrThrow(meetingSchema, meetingFormInput(formData));
    const prezenti = await assertPersonsInChurch(ctx.db, ids);
    const data = { ...fields, data: toDbDate(fields.data)! };

    savedId = await ctx.db.$transaction(async (tx) => {
      if (id) {
        const before = await auditView(tx, id);
        if (!before) throw new ActionError("Procesul-verbal nu mai există.");
        await tx.meeting.update({
          where: { id },
          data: { ...data, prezenti: { deleteMany: {}, create: prezenti.map((personId) => ({ personId })) } },
        });
        const after = await auditView(tx, id);
        await writeAudit(tx, ctx.user, {
          entity: "MEETING",
          entityId: id,
          entityLabel: label(after!),
          action: "UPDATE",
          fields: MEETING_FIELDS,
          before,
          after,
        });
        return id;
      }
      const created = await tx.meeting.create({
        data: { ...data, churchId: ctx.user.churchId, prezenti: { create: prezenti.map((personId) => ({ personId })) } },
      });
      await writeAudit(tx, ctx.user, {
        entity: "MEETING",
        entityId: created.id,
        entityLabel: label(created),
        action: "CREATE",
        fields: MEETING_FIELDS,
        after: await auditView(tx, created.id),
      });
      return created.id;
    });
  });
  if (!savedId) return state;
  revalidatePath("/", "layout");
  redirect(`/procese-verbale/${savedId}?salvat=1`);
}

export async function deleteMeetingAction(id: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const before = await auditView(tx, id);
      if (!before) throw new ActionError("Procesul-verbal nu mai există.");
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
