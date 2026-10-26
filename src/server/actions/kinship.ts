"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { parentLinkError } from "@/lib/kinship";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { kinName, suggestedFamilyLinks } from "../kinship";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof actionCtx>>["db"]["$transaction"]>[0]>[0];
type Who = { id: string; nume: string; prenume: string };

/** Both persons of the church (the scoped client finds no other church's), never an anonymised one. */
async function twoPersons(tx: Tx, parentId: string, childId: string): Promise<[Who, Who]> {
  const found = await tx.person.findMany({ where: { id: { in: [parentId, childId] }, nume: { not: ANONYMOUS_NAME } }, select: { id: true, nume: true, prenume: true } });
  const parent = found.find((p) => p.id === parentId);
  const child = found.find((p) => p.id === childId);
  if (!parent || !child) throw new ActionError("Persoana nu există în registru.");
  return [parent, child];
}

/** The link on both persons' history, with both names. */
async function auditLink(tx: Tx, user: Awaited<ReturnType<typeof actionCtx>>["user"], parent: Who, child: Who, what: "adăugată" | "ștearsă") {
  const text = `${kinName(parent)} este părintele lui ${kinName(child)}`;
  for (const p of [child, parent]) {
    await writeAudit(tx, user, { entity: "PERSON", entityId: p.id, entityLabel: kinName(p), action: "UPDATE", fields: [], extra: { rudenie: `legătură ${what}: ${text}` } });
  }
}

/**
 * "Rude în biserică" → adds a parent (`kind` "parinte": `otherId` is the parent of `personId`) or a
 * child ("copil"). Refused for oneself, a third parent, a cycle, a duplicate or another church's
 * person (parentLinkError); write roles; audited on both persons.
 */
export async function addKinLinkAction(personId: string, kind: "parinte" | "copil", otherId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    parseOrThrow(idSchema, otherId);
    if (kind !== "parinte" && kind !== "copil") throw new ActionError("Legătură necunoscută.");
    const [parentId, childId] = kind === "parinte" ? [otherId, personId] : [personId, otherId];
    await ctx.db.$transaction(async (tx) => {
      const [parent, child] = await twoPersons(tx, parentId, childId);
      const links = await tx.personParent.findMany({ select: { parentId: true, childId: true } });
      const error = parentLinkError(links, parentId, childId);
      if (error) throw new ActionError(error);
      await tx.personParent.create({ data: { churchId: ctx.user.churchId, parentId, childId, source: "MANUAL", createdById: ctx.user.id } });
      await auditLink(tx, ctx.user, parent, child, "adăugată");
    });
    return { ok: true, message: kind === "parinte" ? "Părintele a fost adăugat." : "Copilul a fost adăugat." };
  });
  revalidatePath("/", "layout");
  return state;
}

/** Removes a parent-child link (write roles), audited on both persons. */
export async function removeKinLinkAction(linkId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, linkId);
    await ctx.db.$transaction(async (tx) => {
      const link = await tx.personParent.findUnique({ where: { id: linkId }, select: { id: true, parentId: true, childId: true } });
      if (!link) throw new ActionError("Legătura nu mai există.");
      const [parent, child] = await twoPersons(tx, link.parentId, link.childId);
      await tx.personParent.delete({ where: { id: link.id } });
      await auditLink(tx, ctx.user, parent, child, "ștearsă");
    });
    return { ok: true, message: "Legătura a fost ștearsă." };
  });
  revalidatePath("/", "layout");
  return state;
}

/**
 * Setări → Date → "Creează legăturile din familii" (administrators): in every family, Fiu / Fiică / Copil
 * become children of the head and the spouse (source FAMILIE). Idempotent: existing links stay, a link
 * the rules refuse (a third parent, a cycle) is skipped. Reports the counts, never names.
 */
export async function createFamilyLinksAction(): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    const suggested = await suggestedFamilyLinks(ctx.db);
    let created = 0;
    let skipped = 0;
    await ctx.db.$transaction(async (tx) => {
      const links = await tx.personParent.findMany({ select: { parentId: true, childId: true } });
      for (const l of suggested) {
        if (links.some((x) => x.parentId === l.parentId && x.childId === l.childId)) continue;
        if (parentLinkError(links, l.parentId, l.childId)) {
          skipped++;
          continue;
        }
        await tx.personParent.create({ data: { churchId: ctx.user.churchId, parentId: l.parentId, childId: l.childId, source: "FAMILIE", createdById: ctx.user.id } });
        links.push(l);
        created++;
      }
      await writeAudit(tx, ctx.user, {
        entity: "SETTINGS",
        entityId: ctx.user.churchId,
        entityLabel: "Legături de rudenie",
        action: "CREATE",
        fields: [],
        extra: { observatie: `legături create din familii: ${created}${skipped ? `, sărite: ${skipped}` : ""}` },
      });
    });
    return { ok: true, message: created ? `Au fost create ${created} legături părinte–copil${skipped ? ` (${skipped} sărite: ar fi depășit regulile)` : ""}.` : "Nu era nicio legătură nouă de creat." };
  });
  revalidatePath("/", "layout");
  return state;
}
