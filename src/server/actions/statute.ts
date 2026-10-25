"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "../audit";
import { actionCtx } from "../session";
import { runFormAction } from "./run";

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
