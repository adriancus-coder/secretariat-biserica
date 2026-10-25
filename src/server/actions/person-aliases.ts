"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { memberName } from "@/lib/format";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/** "Alte forme ale numelui": forgets a remembered form of a person's name (audited on the person). */
export async function deletePersonAliasAction(aliasId: string): Promise<FormState> {
  let personId = "";
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, aliasId);
    await ctx.db.$transaction(async (tx) => {
      const alias = await tx.personAlias.findUnique({ where: { id: aliasId }, include: { person: { select: { id: true, nume: true, prenume: true } } } });
      if (!alias) throw new ActionError("Forma numelui nu mai există.");
      await tx.personAlias.delete({ where: { id: aliasId } });
      await writeAudit(tx, ctx.user, {
        entity: "PERSON",
        entityId: alias.personId,
        entityLabel: memberName(alias.person),
        action: "UPDATE",
        fields: [],
        extra: { formaNumelui: `ștearsă: ${alias.alias}` },
      });
      personId = alias.personId;
    });
  });
  if (personId) revalidatePath(`/persoane/${personId}`);
  return state;
}
