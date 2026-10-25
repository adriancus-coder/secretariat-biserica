import "server-only";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { rolesText } from "@/lib/roles";
import type { PersonRolesInput } from "@/lib/schemas/roles";
import { ValidationError } from "./actions/run";
import type { Ctx } from "./session";

type Db = Ctx["db"];
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/**
 * Checks the roles chosen on the person form: every role must belong to the church (PersonRole has
 * no churchId, so the ids are verified here), and an inactive role can only be kept, not newly given.
 */
export async function assertPersonRoles(db: Db, personId: string | null, roles: PersonRolesInput): Promise<void> {
  if (!roles.length) return;
  const ids = roles.map((r) => r.roleId);
  const found = await db.churchRole.findMany({ where: { id: { in: ids } }, select: { id: true, nume: true, active: true } });
  if (found.length !== ids.length) throw new ValidationError({ functii: "Una dintre funcțiile alese nu mai există." });
  const inactive = found.filter((r) => !r.active);
  if (!inactive.length) return;
  const held = personId
    ? new Set(
        (await db.churchRole.findMany({ where: { id: { in: inactive.map((r) => r.id) }, holders: { some: { personId } } }, select: { id: true } })).map(
          (r) => r.id,
        ),
      )
    : new Set<string>();
  const added = inactive.find((r) => !held.has(r.id));
  if (added) throw new ValidationError({ functii: `Funcția „${added.nume}” este dezactivată și nu mai poate fi atribuită.` });
}

/**
 * Replaces the person's roles; an existing end date (`until`) of a kept role is preserved. Returns
 * every role held before or after (the groups linked to them are re-synced by the caller).
 */
export async function writePersonRoles(tx: Tx, personId: string, roles: PersonRolesInput): Promise<string[]> {
  const existing = await tx.personRole.findMany({ where: { personId }, select: { roleId: true, until: true } });
  const until = new Map(existing.map((r) => [r.roleId, r.until]));
  await tx.personRole.deleteMany({ where: { personId } });
  if (roles.length) {
    await tx.personRole.createMany({
      data: roles.map((r) => ({ personId, roleId: r.roleId, since: toDbDate(r.since), until: until.get(r.roleId) ?? null })),
    });
  }
  return [...new Set([...existing.map((r) => r.roleId), ...roles.map((r) => r.roleId)])];
}

/** The person's roles as text for the audit log ("Diacon (din …), Lider cor"), in the church's role order. */
export async function personRolesAudit(tx: Tx | Db, personId: string): Promise<string> {
  const rows = await tx.churchRole.findMany({
    where: { holders: { some: { personId } } },
    orderBy: [{ sortOrder: "asc" }, { nume: "asc" }],
    select: { nume: true, holders: { where: { personId }, select: { since: true } } },
  });
  return rolesText(rows.map((r) => ({ nume: r.nume, since: fromDbDate(r.holders[0]?.since ?? null) })));
}
