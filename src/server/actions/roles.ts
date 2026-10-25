"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { roleKey } from "@/lib/roles";
import { GROUP_FIELDS, ROLE_FIELDS, roleGroupSchema, roleSchema } from "@/lib/schemas/roles";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { actionCtx, ActionError, type Ctx } from "../session";
import { parseOrThrow, runFormAction, ValidationError } from "./run";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

// ---------- Groups ("Funcții", "Slujiri", …) ----------

async function orderedGroups(tx: Tx) {
  return tx.roleGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { nume: "asc" }] });
}

/** Comparable audit view of a group. */
function groupView(g: { nume: string; active: boolean }, position: number) {
  return { grup: g.nume, activ: g.active, pozitie: position + 1 };
}

const groupLabel = (nume: string) => `Grupul „${nume}”`;

/** Adds (id = null) or renames a role group. Admin only. */
export async function saveRoleGroupAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(roleGroupSchema, Object.fromEntries(formData));
    await ctx.db.$transaction(async (tx) => {
      const groups = await orderedGroups(tx);
      if (groups.some((g) => g.id !== id && roleKey(g.nume) === roleKey(input.nume))) {
        throw new ValidationError({ nume: "Există deja un grup cu această denumire." });
      }
      if (id) {
        const index = groups.findIndex((g) => g.id === id);
        if (index < 0) throw new ActionError("Grupul nu mai există.");
        const after = await tx.roleGroup.update({ where: { id }, data: { nume: input.nume } });
        await writeAudit(tx, ctx.user, {
          entity: "CHURCH_ROLE",
          entityId: id,
          entityLabel: groupLabel(after.nume),
          action: "UPDATE",
          fields: GROUP_FIELDS,
          before: groupView(groups[index], index),
          after: groupView(after, index),
        });
        return;
      }
      const sortOrder = groups.length ? Math.max(...groups.map((g) => g.sortOrder)) + 1 : 0;
      const created = await tx.roleGroup.create({ data: { nume: input.nume, sortOrder, churchId: ctx.user.churchId } });
      await writeAudit(tx, ctx.user, {
        entity: "CHURCH_ROLE",
        entityId: created.id,
        entityLabel: groupLabel(created.nume),
        action: "CREATE",
        fields: GROUP_FIELDS,
        after: groupView(created, groups.length),
      });
    });
    return { ok: true, message: id ? "Grupul a fost salvat." : "Grupul a fost adăugat." };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** Moves a group one place up or down. Admin only. */
export async function moveRoleGroupAction(id: string, direction: "up" | "down"): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    if (direction !== "up" && direction !== "down") throw new ActionError("Direcție invalidă.");
    await ctx.db.$transaction(async (tx) => {
      const groups = await orderedGroups(tx);
      const from = groups.findIndex((g) => g.id === id);
      if (from < 0) throw new ActionError("Grupul nu mai există.");
      const to = direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= groups.length) return;
      const next = [...groups];
      [next[from], next[to]] = [next[to], next[from]];
      for (const [i, g] of next.entries()) {
        if (g.sortOrder !== i) await tx.roleGroup.update({ where: { id: g.id }, data: { sortOrder: i } });
      }
      await writeAudit(tx, ctx.user, {
        entity: "CHURCH_ROLE",
        entityId: id,
        entityLabel: groupLabel(groups[from].nume),
        action: "UPDATE",
        fields: GROUP_FIELDS,
        before: groupView(groups[from], from),
        after: groupView(groups[from], to),
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** Deactivates or reactivates a group; a group with active entries cannot be deactivated. Admin only. */
export async function setRoleGroupActiveAction(id: string, active: boolean): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const groups = await orderedGroups(tx);
      const index = groups.findIndex((g) => g.id === id);
      if (index < 0) throw new ActionError("Grupul nu mai există.");
      const group = groups[index];
      if (!active) {
        const activeRoles = await tx.churchRole.count({ where: { groupId: id, active: true } });
        if (activeRoles > 0) {
          throw new ActionError(
            `Grupul „${group.nume}” are ${activeRoles === 1 ? "o intrare activă" : `${activeRoles} intrări active`}. Dezactivați-le întâi.`,
          );
        }
      }
      const after = await tx.roleGroup.update({ where: { id }, data: { active } });
      await writeAudit(tx, ctx.user, {
        entity: "CHURCH_ROLE",
        entityId: id,
        entityLabel: groupLabel(group.nume),
        action: "UPDATE",
        fields: GROUP_FIELDS,
        before: groupView(group, index),
        after: groupView(after, index),
      });
    });
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

// ---------- Entries (roles inside a group) ----------

/** The roles of a group in display order. */
async function groupRoles(tx: Tx, groupId: string) {
  return tx.churchRole.findMany({ where: { groupId }, orderBy: [{ sortOrder: "asc" }, { nume: "asc" }], include: { group: { select: { nume: true } } } });
}

/** Comparable audit view of a role. */
function roleView(r: { nume: string; active: boolean; group: { nume: string } }, position: number) {
  return { nume: r.nume, grup: r.group.nume, activ: r.active, pozitie: position + 1 };
}

/** A role with this name (case and diacritics ignored), anywhere in the church's nomenclature. */
async function findByName(tx: Tx, nume: string, exceptId: string | null = null) {
  const all = await tx.churchRole.findMany({ select: { id: true, nume: true, active: true, groupId: true } });
  return all.find((r) => r.id !== exceptId && roleKey(r.nume) === roleKey(nume)) ?? null;
}

/** Checks the group id (it belongs to the church: the scoped client finds only the church's groups). */
async function assertGroup(tx: Tx, groupId: string) {
  parseOrThrow(idSchema, groupId);
  const group = await tx.roleGroup.findUnique({ where: { id: groupId }, select: { id: true, nume: true, active: true } });
  if (!group) throw new ActionError("Grupul nu mai există.");
  return group;
}

async function createRole(tx: Tx, ctx: Ctx, groupId: string, nume: string) {
  const roles = await groupRoles(tx, groupId);
  const sortOrder = roles.length ? Math.max(...roles.map((r) => r.sortOrder)) + 1 : 0;
  const created = await tx.churchRole.create({
    data: { nume, groupId, sortOrder, churchId: ctx.user.churchId },
    include: { group: { select: { nume: true } } },
  });
  await writeAudit(tx, ctx.user, {
    entity: "CHURCH_ROLE",
    entityId: created.id,
    entityLabel: created.nume,
    action: "CREATE",
    fields: ROLE_FIELDS,
    after: roleView(created, roles.length),
  });
  return created;
}

/** Adds an entry to a group (groupId) or renames one (id). Admin only. */
export async function saveRoleAction(id: string | null, groupId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("admin");
    if (id !== null) parseOrThrow(idSchema, id);
    const input = parseOrThrow(roleSchema, Object.fromEntries(formData));
    await ctx.db.$transaction(async (tx) => {
      if (await findByName(tx, input.nume, id)) throw new ValidationError({ nume: "Există deja o funcție sau slujire cu această denumire." });
      if (id) {
        const role = await tx.churchRole.findUnique({ where: { id }, select: { groupId: true } });
        if (!role) throw new ActionError("Intrarea nu mai există.");
        const roles = await groupRoles(tx, role.groupId);
        const index = roles.findIndex((r) => r.id === id);
        const after = await tx.churchRole.update({ where: { id }, data: { nume: input.nume }, include: { group: { select: { nume: true } } } });
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
      await createRole(tx, ctx, (await assertGroup(tx, groupId ?? "")).id, input.nume);
    });
    return { ok: true, message: id ? "Intrarea a fost salvată." : "Intrarea a fost adăugată." };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

export interface InlineRoleState extends FormState {
  role?: { id: string; nume: string; groupId: string };
}

/**
 * "+ Adaugă" on the person form (write roles): creates the entry in the group and returns it to be
 * selected; an existing name (case and diacritics ignored) returns the existing entry instead.
 */
export async function addRoleInlineAction(groupId: string, nume: string): Promise<InlineRoleState> {
  let role: InlineRoleState["role"];
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    const input = parseOrThrow(roleSchema, { nume });
    role = await ctx.db.$transaction(async (tx) => {
      const group = await assertGroup(tx, groupId);
      const existing = await findByName(tx, input.nume);
      if (existing) {
        if (!existing.active) throw new ActionError(`„${existing.nume}” există, dar este dezactivată. Administratorul o poate reactiva din Setări.`);
        return { id: existing.id, nume: existing.nume, groupId: existing.groupId };
      }
      if (!group.active) throw new ActionError("Grupul este dezactivat.");
      const created = await createRole(tx, ctx, group.id, input.nume);
      return { id: created.id, nume: created.nume, groupId: created.groupId };
    });
  });
  if (!role) return state;
  revalidatePath("/setari/functii");
  return { ok: true, role };
}

/** Moves an entry one place up or down within its group. Admin only. */
export async function moveRoleAction(id: string, direction: "up" | "down"): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    if (direction !== "up" && direction !== "down") throw new ActionError("Direcție invalidă.");
    await ctx.db.$transaction(async (tx) => {
      const role = await tx.churchRole.findUnique({ where: { id }, select: { groupId: true } });
      if (!role) throw new ActionError("Intrarea nu mai există.");
      const roles = await groupRoles(tx, role.groupId);
      const from = roles.findIndex((r) => r.id === id);
      const to = direction === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= roles.length) return;
      const next = [...roles];
      [next[from], next[to]] = [next[to], next[from]];
      // Renumber the group 0..n-1 so that equal or sparse sort orders cannot block a move.
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
 * Deactivates or reactivates an entry. One still held by someone cannot be deactivated: the
 * message gives the number of holders. Admin only.
 */
export async function setRoleActiveAction(id: string, active: boolean): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    parseOrThrow(idSchema, id);
    await ctx.db.$transaction(async (tx) => {
      const found = await tx.churchRole.findUnique({ where: { id }, select: { groupId: true } });
      if (!found) throw new ActionError("Intrarea nu mai există.");
      const roles = await groupRoles(tx, found.groupId);
      const index = roles.findIndex((r) => r.id === id);
      const role = roles[index];
      if (!active) {
        const holders = await tx.personRole.count({ where: { roleId: id } });
        if (holders > 0) {
          throw new ActionError(
            holders === 1
              ? `„${role.nume}” este atribuită unei persoane. Scoateți-o de pe fișa persoanei înainte de a o dezactiva.`
              : `„${role.nume}” este atribuită la ${holders} persoane. Scoateți-o de pe fișele lor înainte de a o dezactiva.`,
          );
        }
      } else {
        const group = await tx.roleGroup.findUnique({ where: { id: found.groupId }, select: { active: true } });
        if (!group?.active) throw new ActionError("Reactivați întâi grupul.");
      }
      const after = await tx.churchRole.update({ where: { id }, data: { active }, include: { group: { select: { nume: true } } } });
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
