import "server-only";
import { memberName } from "@/lib/format";
import { nameKey } from "@/lib/name-match";
import type { PickedName } from "@/lib/minutes-import";
import { writeAudit } from "./audit";
import type { Ctx, CurrentUser } from "./session";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

/**
 * Other written forms of persons' names ("Nepotriviți" matched by hand), used by the name matcher:
 * normalized name → person id.
 */
export async function loadAliasMap(ctx: Ctx): Promise<Map<string, string>> {
  const rows = await ctx.db.personAlias.findMany({ select: { alias: true, personId: true } });
  return new Map(rows.map((r) => [r.alias, r.personId]));
}

/**
 * Remembers each pick as an alias of the chosen person (the latest choice wins for a name), audited
 * on the person. Runs inside the transaction that saves the meeting; the person ids must already be
 * checked against the church. A name that is already exactly the person's name is not stored.
 */
export async function rememberAliases(tx: Tx, user: CurrentUser, picks: readonly PickedName[]): Promise<void> {
  const seen = new Set<string>();
  for (const pick of picks) {
    const alias = nameKey(pick.name);
    if (!alias || seen.has(alias)) continue;
    seen.add(alias);
    const person = await tx.person.findUnique({ where: { id: pick.personId }, select: { id: true, nume: true, prenume: true } });
    if (!person || nameKey(`${person.prenume} ${person.nume}`) === alias) continue;
    const existing = await tx.personAlias.findFirst({ where: { alias } });
    if (existing?.personId === person.id) continue;
    if (existing) await tx.personAlias.update({ where: { id: existing.id }, data: { personId: person.id, createdById: user.id, createdAt: new Date() } });
    else await tx.personAlias.create({ data: { alias, personId: person.id, createdById: user.id } as never });
    await writeAudit(tx, user, {
      entity: "PERSON",
      entityId: person.id,
      entityLabel: memberName(person),
      action: "UPDATE",
      fields: [],
      extra: { formaNumelui: `adăugată: ${alias}` },
    });
  }
}
