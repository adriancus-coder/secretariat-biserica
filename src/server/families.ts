import "server-only";
import { canBeHead, defaultFamilyName, pickHead } from "@/lib/families";
import { fromDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { compareRo } from "@/lib/text";
import { ValidationError } from "./actions/run";
import { writeAudit } from "./audit";
import type { Ctx, CurrentUser } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/** Fields of a family tracked by the audit log. */
export const FAMILY_FIELDS = ["nume", "cap", "adresa", "note", "membri"] as const;

/** Comparable audit view of a family: names instead of ids. */
export async function familyView(tx: Tx, id: string) {
  const f = await tx.family.findUnique({
    where: { id },
    include: { head: { select: { nume: true, prenume: true } }, members: { select: { nume: true, prenume: true } } },
  });
  if (!f) return null;
  return {
    id: f.id,
    nume: f.nume,
    headId: f.headId,
    cap: f.head ? memberName(f.head) : "",
    adresa: f.adresa,
    note: f.note,
    membri: f.members.map(memberName).sort(compareRo),
  };
}

/** Creates a family headed by the person (default name and the person's address). */
export async function createFamilyFor(tx: Tx, user: CurrentUser, person: { id: string; nume: string; prenume: string; adresa: string }) {
  const family = await tx.family.create({
    data: { churchId: user.churchId, nume: defaultFamilyName(person), headId: person.id, adresa: person.adresa },
  });
  await tx.person.update({ where: { id: person.id }, data: { familyId: family.id } });
  await writeAudit(tx, user, {
    entity: "FAMILY",
    entityId: family.id,
    entityLabel: family.nume,
    action: "CREATE",
    fields: FAMILY_FIELDS,
    after: await familyView(tx, family.id),
  });
  return family.id;
}

/**
 * Keeps a family consistent after someone left it (moved, deleted): an empty family is deleted;
 * a family whose head is gone gets a new head chosen with pickHead, and a family still named after
 * its former head (`formerHead`) takes the new head's name.
 */
export async function settleFamily(
  tx: Tx,
  user: CurrentUser,
  familyId: string,
  formerHead?: { nume: string; prenume: string },
): Promise<void> {
  const before = await familyView(tx, familyId);
  if (!before) return;
  const members = await tx.person.findMany({
    where: { familyId },
    select: { id: true, nume: true, prenume: true, statut: true, rudenie: true, gen: true, dataNasterii: true, createdAt: true },
  });
  if (!members.length) {
    await tx.family.delete({ where: { id: familyId } });
    await writeAudit(tx, user, { entity: "FAMILY", entityId: familyId, entityLabel: before.nume, action: "DELETE", fields: FAMILY_FIELDS, before });
    return;
  }
  if (before.headId && members.some((m) => m.id === before.headId)) return;
  const head = pickHead(
    members.map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii), createdAt: m.createdAt.toISOString() })),
    todayIso(),
  );
  // Only children left: the family stays without a head until an adult joins.
  if (!head) {
    if (before.headId) await tx.family.update({ where: { id: familyId }, data: { headId: null } });
    return;
  }
  const renamed = formerHead && before.nume === defaultFamilyName(formerHead) ? defaultFamilyName(head) : before.nume;
  await tx.family.update({ where: { id: familyId }, data: { headId: head.id, nume: renamed } });
  await writeAudit(tx, user, {
    entity: "FAMILY",
    entityId: familyId,
    entityLabel: renamed,
    action: "UPDATE",
    fields: FAMILY_FIELDS,
    before,
    after: await familyView(tx, familyId),
    extra: { observatie: "capul familiei a fost ales automat" },
  });
}

/** A family edited by hand is no longer "created automatically". */
export async function markEdited(tx: Tx, familyId: string): Promise<void> {
  await tx.family.updateMany({ where: { id: familyId, autoCreated: true }, data: { autoCreated: false } });
}

/** Refuses a person who cannot head a family (statut Copil or under 18). */
export async function assertCanBeHead(tx: Tx, personId: string, field = "headId"): Promise<void> {
  const p = await tx.person.findUnique({ where: { id: personId }, select: { statut: true, dataNasterii: true, nume: true, prenume: true } });
  if (!p) throw new ValidationError({ [field]: "Persoana nu mai există." });
  if (!canBeHead({ statut: p.statut, dataNasterii: fromDbDate(p.dataNasterii) }, todayIso())) {
    throw new ValidationError({ [field]: `${memberName(p)} nu poate fi cap de familie: este copil sau nu a împlinit 18 ani.` });
  }
}

/** Members leave the family (without family) and the family is deleted; audited. */
export async function dissolveFamily(tx: Tx, user: CurrentUser, familyId: string, reason?: string): Promise<number> {
  const before = await familyView(tx, familyId);
  if (!before) return 0;
  const members = await tx.person.findMany({ where: { familyId }, select: { id: true, nume: true, prenume: true } });
  await tx.family.update({ where: { id: familyId }, data: { headId: null } });
  await tx.person.updateMany({ where: { familyId }, data: { familyId: null } });
  await tx.family.delete({ where: { id: familyId } });
  await writeAudit(tx, user, {
    entity: "FAMILY",
    entityId: familyId,
    entityLabel: before.nume,
    action: "DELETE",
    fields: FAMILY_FIELDS,
    before,
    ...(reason ? { extra: { observatie: reason } } : {}),
  });
  for (const m of members) {
    await writeAudit(tx, user, {
      entity: "PERSON",
      entityId: m.id,
      entityLabel: memberName(m),
      action: "UPDATE",
      fields: ["familie"],
      before: { familie: before.nume },
      after: { familie: "" },
    });
  }
  return members.length;
}
