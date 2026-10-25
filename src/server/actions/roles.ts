"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { ROLE_FIELDS, roleSchema } from "@/lib/schemas/roles";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** The roles in display order (sortOrder, then name). */
async function orderedRoles(tx: Tx) {
  return tx.churchRole.findMany({ orderBy: [{ sortOrder: "asc" }, { nume: "asc" }] });
}

/** Comparable audit view of a role. */
function roleView(r: { nume: string; inCommittee: boolean; active: boolean }, position: number) {
  return { nume: r.nume, comitet: r.inCommittee, activ: r.active, pozitie: position + 1 };
}

async function assertNameFree(tx: Tx, nume: string, exceptId: string | null) {
  const clash = await tx.churchRole.findFirst({
    where: { nume: { equals: nume, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ValidationError({ nume: "Există deja o funcție cu această denumire." });
}

/** Adds (id = null) or renames a role and sets whether it belongs to the committee. Admin only. */
export async function saveRoleAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(roleSchema, Object.fromEntries(formData));
    await ctx.db.$transaction(async (tx) => {
      await assertNameFree(tx, input.nume, id);
      const roles = await orderedRoles(tx);
      if (id) {
        const index = roles.findIndex((r) => r.id === id);
        if (index < 0) throw new ActionError("Funcția nu mai există.");
        const after = await tx.churchRole.update({ where: { id }, data: input });
        await writeAudit(tx, ctx.user, {
          entity: "CHURCH_ROLE",
          entityId: id,
          entityLabel: after.nume,
          action: "UPDATE",
          fields: ROLE_FIELDS,
          before: roleView(roles[index], index),
          after: roleView(after, index),
        });
        return;
      }
      const sortOrder = roles.length ? Math.max(...roles.map((r) => r.sortOrder)) + 1 : 0;
      const created = await tx.churchRole.create({ data: { ...input, sortOrder, churchId: ctx.user.churchId } });
      await writeAudit(tx, ctx.user, {
        entity: "CHURCH_ROLE",
        entityId: created.id,
        entityLabel: created.nume,
        action: "CREATE",
        fields: ROLE_FIELDS,
        after: roleView(created, roles.length),
      });
    });
    return { ok: true, message: id ? "Funcția a fost salvată." : "Funcția a fost adăugată." };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** Moves a role one place up or down in the list. Admin only. */
export async function moveRoleAction(id: string, direction: "up" | "down"): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    if (direction !== "up" && direction !== "down") throw new ActionError("Direcție invalidă.");
    await ctx.db.$transaction(async (tx) => {
      const roles = await orderedRoles(tx);
      const from = roles.findIndex((r) => r.id === id);
      if (from < 0) throw new ActionError("Funcția nu mai există.");
      const to = direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= roles.length) return;
      const next = [...roles];
      [next[from], next[to]] = [next[to], next[from]];
      // Renumber the whole list 0..n-1 so that equal or sparse sort orders cannot block a move.
      for (const [i, r] of next.entries()) {
        if (r.sortOrder !== i) await tx.churchRole.update({ where: { id: r.id }, data: { sortOrder: i } });
      }
      await writeAudit(tx, ctx.user, {
        entity: "CHURCH_ROLE",
        entityId: id,
        entityLabel: roles[from].nume,
        action: "UPDATE",
        fields: ROLE_FIELDS,
        before: roleView(roles[from], from),
        after: roleView(roles[from], to),
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/**
 * Deactivates or reactivates a role. A role still held by someone cannot be deactivated:
 * the message gives the number of holders. Admin only.
 */
export async function setRoleActiveAction(id: string, active: boolean): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const roles = await orderedRoles(tx);
      const index = roles.findIndex((r) => r.id === id);
      if (index < 0) throw new ActionError("Funcția nu mai există.");
      const role = roles[index];
      if (!active) {
        const holders = await tx.personRole.count({ where: { roleId: id } });
        if (holders > 0) {
          throw new ActionError(
            holders === 1
              ? `Funcția „${role.nume}” este atribuită unei persoane. Scoateți-o de pe fișa persoanei înainte de a o dezactiva.`
              : `Funcția „${role.nume}” este atribuită la ${holders} persoane. Scoateți-o de pe fișele lor înainte de a o dezactiva.`,
          );
        }
      }
      const after = await tx.churchRole.update({ where: { id }, data: { active } });
      await writeAudit(tx, ctx.user, {
        entity: "CHURCH_ROLE",
        entityId: id,
        entityLabel: role.nume,
        action: "UPDATE",
        fields: ROLE_FIELDS,
        before: roleView(role, index),
        after: roleView(after, index),
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}
