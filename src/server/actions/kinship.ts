"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { parentLinkError } from "@/lib/kinship";
import { externalKey, isExternalKey } from "@/lib/kinship-parents";
import { siblingPlan, type SiblingSide } from "@/lib/kinship-siblings";
import { personDerived } from "@/lib/person-derived";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { deleteOrphanExternals, kinName, kinProposals, loadLinkCheck, nodeName, siblingLinksToRemove } from "../kinship";
import { checkWholeRegister } from "../kinship-sync";
import { actionCtx, ActionError } from "../session";
import { parseOrThrow, runFormAction } from "./run";

type ActionCtx = Awaited<ReturnType<typeof actionCtx>>;
type Tx = Parameters<Parameters<ActionCtx["db"]["$transaction"]>[0]>[0];
type Who = { id: string; nume: string; prenume: string };

/** A proposal's key: what nameProposals builds ("p:", "e:", "s:"), bounded. */
const proposalKeySchema = z.string().min(3).max(2000).regex(/^[pes]:[A-Za-z0-9_:,|x ă-ț-]+$/u);

/** Both persons of the church (the scoped client finds no other church's), never an anonymised one. */
async function twoPersons(tx: Tx, parentId: string, childId: string): Promise<[Who, Who]> {
  const found = await tx.person.findMany({ where: { id: { in: [parentId, childId] }, nume: { not: ANONYMOUS_NAME } }, select: { id: true, nume: true, prenume: true } });
  const parent = found.find((p) => p.id === parentId);
  const child = found.find((p) => p.id === childId);
  if (!parent || !child) throw new ActionError("Persoana nu există în registru.");
  return [parent, child];
}

/** The link on the persons' history (both, or only the child for a parent outside the register), with the names. */
async function auditLink(tx: Tx, user: ActionCtx["user"], parentName: string, child: Who, what: string, parent?: Who) {
  const text = `${parentName}${parent ? "" : " (nu e în registru)"} este părintele lui ${kinName(child)}`;
  for (const p of parent ? [child, parent] : [child]) {
    await writeAudit(tx, user, { entity: "PERSON", entityId: p.id, entityLabel: kinName(p), action: "UPDATE", fields: [], extra: { rudenie: `legătură ${what}: ${text}` } });
  }
}

/**
 * "Rude în biserică" → adds a parent (`kind` "parinte": `otherId` is the parent of `personId`) or a
 * child ("copil"). Refused for oneself, siblings, a too small age gap, a third parent, a cycle, a
 * duplicate or another church's person (parentLinkError); write roles; audited on both persons.
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
      const c = await loadLinkCheck(tx as never);
      const error = parentLinkError(c.links, parentId, childId, c.born);
      if (error) throw new ActionError(error);
      await tx.personParent.create({ data: { churchId: ctx.user.churchId, parentId, childId, source: "MANUAL", createdById: ctx.user.id } });
      await auditLink(tx, ctx.user, kinName(parent), child, "adăugată", parent);
    });
    return { ok: true, message: kind === "parinte" ? "Părintele a fost adăugat." : "Copilul a fost adăugat." };
  });
  revalidatePath("/", "layout");
  return state;
}

/** Removes a parent-child link (write roles), audited; a parent outside the register left without children goes too. */
export async function removeKinLinkAction(linkId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, linkId);
    await ctx.db.$transaction(async (tx) => {
      const row = await tx.personParent.findUnique({ where: { id: linkId }, select: { id: true, parentId: true, externalParentId: true, childId: true, source: true } });
      if (!row) throw new ActionError("Legătura nu mai există.");
      const child = await tx.person.findFirst({ where: { id: row.childId }, select: { id: true, nume: true, prenume: true } });
      if (!child) throw new ActionError("Persoana nu există în registru.");
      const parent = row.parentId ? await tx.person.findFirst({ where: { id: row.parentId }, select: { id: true, nume: true, prenume: true } }) : null;
      const ext = row.externalParentId ? await tx.kinExternalParent.findFirst({ where: { id: row.externalParentId }, select: { nume: true } }) : null;
      await tx.personParent.delete({ where: { id: row.id } });
      await auditLink(tx, ctx.user, parent ? kinName(parent) : (ext?.nume ?? ""), child, "ștearsă", parent ?? undefined);
      await deleteOrphanExternals(tx as never);
    });
    return { ok: true, message: "Legătura a fost ștearsă." };
  });
  revalidatePath("/", "layout");
  return state;
}

/**
 * De verificat → "Verifică din nou tot registrul" (administrators; idempotent; the same check runs by
 * itself after every change to a family, KINSHIP-AUTO): links from the families that break the rules
 * or that the families no longer support are deleted, like a link from the names whose name the file
 * no longer carries; the links the families suggest are added when the rules allow, repeated until
 * nothing changes; links added by hand, from the campaign or from the names are never deleted, they
 * are listed in De verificat, like the proposals from the parents' names. Marks
 * Church.kinshipCheckedAt. The answer and the audit give counts only, never names.
 */
export async function checkKinLinksAction(): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("admin");
    let r = { deleted: 0, created: 0, flagged: 0 };
    await ctx.db.$transaction(
      async (tx) => {
        r = await checkWholeRegister(tx as never, ctx.user, "verificare a întregului registru");
      },
      { timeout: 60_000 },
    );
    const proposals = (await kinProposals(ctx.db)).length;
    const parts = [`${r.deleted} ${r.deleted === 1 ? "legătură greșită ștearsă" : "legături greșite șterse"}`, `${r.created} ${r.created === 1 ? "legătură adăugată" : "legături adăugate"} din familii`];
    if (r.flagged) parts.push(`${r.flagged} ${r.flagged === 1 ? "legătură adăugată manual este" : "legături adăugate manual sunt"} în „De verificat”`);
    if (proposals) parts.push(`${proposals} ${proposals === 1 ? "propunere" : "propuneri"} după numele părinților în „De verificat”`);
    return { ok: true, message: `Verificare încheiată: ${parts.join(" · ")}.` };
  });
  revalidatePath("/", "layout");
  return state;
}

/**
 * De verificat → "Rudenie propusă după numele părinților" → "Confirmă": the proposal is computed again
 * on the server (never taken from the page) and its links created with the source NUME_PARINTI, each
 * through parentLinkError; parents outside the register get only the name written on the file and the
 * gender. Write roles; audited with the names.
 */
export async function confirmKinProposalAction(key: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(proposalKeySchema, key);
    let made = 0;
    await ctx.db.$transaction(async (tx) => {
      const proposal = (await kinProposals(tx as never)).find((p) => p.key === key);
      if (!proposal) throw new ActionError("Propunerea nu mai este valabilă. Reîncărcați pagina.");
      const c = await loadLinkCheck(tx as never);
      const links = c.links.map((l) => ({ ...l }));
      const child = (id: string) => ({ id, nume: c.named.get(id)!.nume, prenume: c.named.get(id)!.prenume });
      const link = async (parentKey: string, childId: string) => {
        if (parentLinkError(links, parentKey, childId, c.born)) return;
        const ext = isExternalKey(parentKey);
        await tx.personParent.create({
          data: { churchId: ctx.user.churchId, ...(ext ? { externalParentId: parentKey.slice(2) } : { parentId: parentKey }), childId, source: "NUME_PARINTI", createdById: ctx.user.id },
        });
        links.push({ id: "", parentId: parentKey, childId, source: "NUME_PARINTI", external: ext });
        const parent = ext ? undefined : child(parentKey);
        await auditLink(tx, ctx.user, ext ? nodeName(c, parentKey) || (await tx.kinExternalParent.findFirstOrThrow({ where: { id: parentKey.slice(2) } })).nume : kinName(parent!), child(childId), "confirmată după numele părinților", parent);
        made++;
      };
      if (proposal.kind === "parinte") await link(proposal.parentId, proposal.childId);
      else if (proposal.kind === "extern") await link(proposal.externalKey, proposal.childId);
      else {
        for (const [nume, gen] of [
          [proposal.tata, "M"],
          [proposal.mama, "F"],
        ] as const) {
          if (!nume) continue;
          const ext = await tx.kinExternalParent.create({ data: { churchId: ctx.user.churchId, nume, gen, createdById: ctx.user.id } });
          for (const id of proposal.childIds) await link(externalKey(ext.id), id);
        }
        await deleteOrphanExternals(tx as never);
      }
      if (!made) throw new ActionError("Legătura nu respectă regulile (frați, diferența de vârstă sau doi părinți).");
    });
    return { ok: true, message: made === 1 ? "Legătura a fost creată." : `Au fost create ${made} legături.` };
  });
  revalidatePath("/", "layout");
  return state;
}

/** "Ignoră": the proposal is remembered as ignored (like the name matches) and no longer shown. Write roles. */
export async function ignoreKinProposalAction(key: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(proposalKeySchema, key);
    const known = (await kinProposals(ctx.db)).some((p) => p.key === key);
    if (!known) throw new ActionError("Propunerea nu mai este valabilă. Reîncărcați pagina.");
    await ctx.db.kinProposalIgnore.upsert({
      where: { churchId_key: { churchId: ctx.user.churchId, key } },
      create: { churchId: ctx.user.churchId, key, createdById: ctx.user.id },
      update: {},
    });
    return { ok: true, message: "Propunerea a fost ignorată." };
  });
  revalidatePath("/de-verificat");
  return state;
}

const siblingNamesSchema = z.object({
  tata: z.string().trim().max(200, "Numele este prea lung."),
  mama: z.string().trim().max(200, "Numele este prea lung."),
});

export interface SiblingState extends FormState {
  /** The step waiting for a confirmation: "adopt" / "names" (text to confirm), "ask" (the parents' names first). */
  plan?: { kind: "adopt" | "names" | "ask"; text: string };
}

const SIBLING_SELECT = { id: true, nume: true, prenume: true, gen: true, numeTata: true, numeMama: true, telefon: true, email: true, botezBiserica: true, botezOficiant: true } as const;

/** The plan for two persons of the church (never an anonymised one), computed from the stored links. */
async function planSiblings(tx: Tx, personId: string, otherId: string, names?: { tata: string; mama: string }) {
  const found = await tx.person.findMany({ where: { id: { in: [personId, otherId] }, nume: { not: ANONYMOUS_NAME } }, select: SIBLING_SELECT });
  const a = found.find((p) => p.id === personId);
  const b = found.find((p) => p.id === otherId);
  if (!a || !b) throw new ActionError("Persoana nu există în registru.");
  const c = await loadLinkCheck(tx as never);
  const side = (p: typeof a): SiblingSide => ({ id: p.id, name: kinName(p), gen: p.gen, numeTata: p.numeTata, numeMama: p.numeMama, parents: c.links.filter((l) => l.childId === p.id).map((l) => l.parentId) });
  const plan = siblingPlan(side(a), side(b), (k) => nodeName(c, k), c.externals, names);
  return { a, b, c, plan };
}

/**
 * "Rude în biserică" → "+ Adaugă frate / soră" (write roles). Without `confirm` it only answers with
 * the plan to confirm (or why not); with `confirm` the plan is computed again here and applied:
 * b) the person without parents is linked to the other's parents; c) parents outside the register by
 * the names on the files (the missing names written on both files, each field audited, `names` from the
 * dialog when neither file had them). Links MANUAL, each through parentLinkError; audited on both
 * persons ("legătură de frați: X și Y").
 */
export async function addSiblingAction(personId: string, otherId: string, confirm: boolean, names?: { tata: string; mama: string }): Promise<SiblingState> {
  let plan: SiblingState["plan"];
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    parseOrThrow(idSchema, otherId);
    const typed = names ? parseOrThrow(siblingNamesSchema, names) : undefined;
    return ctx.db.$transaction(async (tx) => {
      const { a, b, c, plan: p } = await planSiblings(tx, personId, otherId, typed);
      if (p.kind === "already" || p.kind === "refuse") throw new ActionError(p.message);
      if (p.kind === "ask" || !confirm) {
        plan = { kind: p.kind, text: p.text };
        return { ok: true };
      }
      const links = c.links.map((l) => ({ ...l }));
      const link = async (parentKey: string, childId: string) => {
        if (links.some((l) => l.parentId === parentKey && l.childId === childId)) return;
        const error = parentLinkError(links, parentKey, childId, c.born);
        if (error) throw new ActionError(`${nodeName(c, parentKey) || "Părintele"} → ${kinName(childId === a.id ? a : b)}: ${error}`);
        const ext = isExternalKey(parentKey);
        await tx.personParent.create({ data: { churchId: ctx.user.churchId, ...(ext ? { externalParentId: parentKey.slice(2) } : { parentId: parentKey }), childId, source: "MANUAL", createdById: ctx.user.id } });
        links.push({ id: "", parentId: parentKey, childId, source: "MANUAL", external: ext });
      };
      if (p.kind === "adopt") {
        for (const parent of p.parents) await link(parent, p.childId);
      } else {
        // The names written where they were missing (Statut art. 14), searchable like any save.
        for (const person of [a, b]) {
          const mine = p.fills.filter((f) => f.personId === person.id);
          if (!mine.length) continue;
          const after = { ...person, ...Object.fromEntries(mine.map((f) => [f.field, f.value])) };
          await tx.person.update({ where: { id: person.id }, data: { numeTata: after.numeTata, numeMama: after.numeMama, ...personDerived(after) } });
          await writeAudit(tx, ctx.user, {
            entity: "PERSON",
            entityId: person.id,
            entityLabel: kinName(person),
            action: "UPDATE",
            fields: ["numeTata", "numeMama"],
            before: { numeTata: person.numeTata, numeMama: person.numeMama },
            after: { numeTata: after.numeTata, numeMama: after.numeMama },
          });
        }
        for (const [role, nume, gen] of [
          ["tata", p.tata, "M"],
          ["mama", p.mama, "F"],
        ] as const) {
          if (!nume) continue;
          const key = p.reuse[role] ?? externalKey((await tx.kinExternalParent.create({ data: { churchId: ctx.user.churchId, nume, gen, createdById: ctx.user.id } })).id);
          if (!p.reuse[role]) c.externals.push({ key, nume, gen });
          for (const person of [a, b]) await link(key, person.id);
        }
      }
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: x.id, entityLabel: kinName(x), action: "UPDATE", fields: [], extra: { rudenie: `legătură de frați: ${kinName(x)} și ${kinName(y)}` } });
      }
      return { ok: true, message: `${kinName(a)} și ${kinName(b)} sunt acum frați.` };
    });
  });
  if (confirm && state.ok) revalidatePath("/", "layout");
  return { ...state, plan };
}

/**
 * "Șterge legătura de frate" on a sibling's row (write roles): removes only the links to the parents
 * in common that were added by hand or confirmed from the names — this person's, or else the
 * sibling's — never the names written on the files, never a link from the family. Audited on both.
 */
export async function removeSiblingLinkAction(personId: string, siblingId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, personId);
    parseOrThrow(idSchema, siblingId);
    await ctx.db.$transaction(async (tx) => {
      const [x, y] = await twoPersons(tx, personId, siblingId);
      const c = await loadLinkCheck(tx as never);
      const removable = siblingLinksToRemove(c.links, personId, siblingId);
      if (!removable.length) throw new ActionError("Legătura de frați vine din familie; se schimbă din pagina familiei.");
      for (const l of removable) await tx.personParent.delete({ where: { id: l.id } });
      await deleteOrphanExternals(tx as never);
      for (const [p, q] of [
        [x, y],
        [y, x],
      ]) {
        await writeAudit(tx, ctx.user, { entity: "PERSON", entityId: p.id, entityLabel: kinName(p), action: "UPDATE", fields: [], extra: { rudenie: `legătură de frați ștearsă: ${kinName(p)} și ${kinName(q)}` } });
      }
    });
    return { ok: true, message: "Legătura de frați a fost ștearsă." };
  });
  revalidatePath("/", "layout");
  return state;
}
