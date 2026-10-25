"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { memberName } from "@/lib/format";
import { personDerived } from "@/lib/person-derived";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { expiredContactWhere } from "../retention";
import { actionCtx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/** Setări → Date, "Statute ajustate": the administrator has reviewed the list; it is hidden for good. */
export async function dismissStatusAdjustmentsAction(): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    await ctx.db.$transaction(async (tx) => {
      const { count } = await tx.person.updateMany({ where: { statutAjustat: { not: null } }, data: { statutAjustat: null } });
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: "Statute ajustate (Statut art. 28)",
        action: "UPDATE",
        fields: [],
        extra: { observatie: `lista verificată și ascunsă (${count} persoane)` },
      });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath("/setari/date");
  redirect("/setari/date?salvat=1");
}

/** "S-a întors": a temporarily absent person is back (Statut art. 23 alin. 4–5). */
export async function returnedAction(personId: string): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    await ctx.db.$transaction(async (tx) => {
      const before = await tx.person.findUnique({ where: { id: personId } });
      if (!before) return;
      const after = await tx.person.update({ where: { id: personId }, data: { plecatDin: null, plecatUnde: "" } });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: personId,
        entityLabel: memberName(after),
        action: "UPDATE",
        fields: PERSON_FIELDS,
        before,
        after,
        extra: { observatie: "s-a întors" },
      });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath("/", "layout");
  redirect(`/persoane/${personId}?salvat=1`);
}

/** "Șterge acum": deletes those contact data in one transaction; audited with the count only. Register data stay. */
export async function deleteExpiredContactsAction(): Promise<void> {
  let done = false;
  await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    const where = expiredContactWhere();
    await ctx.db.$transaction(async (tx) => {
      const rows = await tx.person.findMany({ where, select: { id: true, nume: true, prenume: true, botezBiserica: true, botezOficiant: true, numeTata: true, numeMama: true } });
      for (const p of rows) {
        await tx.person.update({ where: { id: p.id }, data: { telefon: "", email: "", adresa: "", ...personDerived({ ...p, telefon: "", email: "" }) } });
      }
      await writeAudit(tx, ctx.user, {
        entity: "SECURITY",
        entityId: ctx.user.churchId,
        entityLabel: "Ștergerea datelor de contact (ieșiți de peste 12 luni)",
        action: "DELETE",
        fields: [],
        extra: { persoane: rows.length },
      });
    });
    done = true;
  });
  if (!done) return;
  revalidatePath("/", "layout");
  redirect("/?sters=1");
}
