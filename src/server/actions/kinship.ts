"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { linkViolations, parentLinkError } from "@/lib/kinship";
import { fromDbDate } from "@/lib/dates";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { kinName, loadLinkCheck, suggestedFamilyLinks } from "../kinship";
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
      const births = await tx.person.findMany({ where: { id: { in: [parentId, childId] } }, select: { id: true, dataNasterii: true } });
      const born = (id: string) => fromDbDate(births.find((b) => b.id === id)?.dataNasterii);
      const error = parentLinkError(links, parentId, childId, born);
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
 * Setări → Date → "Verifică legăturile de rudenie" (administrators; idempotent): links created from the
 * families (FAMILIE) that break the rules — siblings, too close in age, a son "parent" in the common
 * family — are deleted; the links the families suggest (Fiu / Fiică / Copil → the head and Soț / Soție)
 * are added when the rules allow, repeated until nothing changes. Links added by hand are never deleted:
 * they are counted and listed in De verificat. The answer and the audit give counts only, never names.
 */
export async function checkKinLinksAction(): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    let deleted = 0;
    let created = 0;
    let flagged = 0;
    await ctx.db.$transaction(
      async (tx) => {
        const check = await loadLinkCheck(tx as never);
        const suggested = await suggestedFamilyLinks(tx as never);
        const links = check.links.map((l) => ({ ...l }));
        for (let round = 0; round < 5; round++) {
          let changed = false;
          const wrong = linkViolations(links, check.persons, check.heads).filter((v) => v.link.source === "FAMILIE");
          for (const v of wrong) {
            await tx.personParent.delete({ where: { id: v.link.id } });
            links.splice(links.indexOf(v.link), 1);
            deleted++;
            changed = true;
          }
          for (const l of suggested) {
            if (links.some((x) => x.parentId === l.parentId && x.childId === l.childId)) continue;
            if (parentLinkError(links, l.parentId, l.childId, check.born)) continue;
            const row = await tx.personParent.create({ data: { churchId: ctx.user.churchId, parentId: l.parentId, childId: l.childId, source: "FAMILIE", createdById: ctx.user.id }, select: { id: true, parentId: true, childId: true, source: true } });
            links.push(row);
            created++;
            changed = true;
          }
          if (!changed) break;
        }
        flagged = linkViolations(links, check.persons, check.heads).filter((v) => v.link.source !== "FAMILIE").length;
        await writeAudit(tx, ctx.user, {
          entity: "SETTINGS",
          entityId: ctx.user.churchId,
          entityLabel: "Legături de rudenie",
          action: "UPDATE",
          fields: [],
          extra: { observatie: `verificare: ${deleted} legături din familii șterse, ${created} adăugate, ${flagged} adăugate manual de verificat` },
        });
      },
      { timeout: 60_000 },
    );
    const parts = [`${deleted} ${deleted === 1 ? "legătură greșită ștearsă" : "legături greșite șterse"}`, `${created} ${created === 1 ? "legătură adăugată" : "legături adăugate"} din familii`];
    if (flagged) parts.push(`${flagged} ${flagged === 1 ? "legătură adăugată manual este" : "legături adăugate manual sunt"} în „De verificat”`);
    return { ok: true, message: `Verificare încheiată: ${parts.join(" · ")}.` };
  });
  revalidatePath("/", "layout");
  return state;
}
