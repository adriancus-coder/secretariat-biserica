import "server-only";
import { parentLinkError, staleFamilyLinks } from "@/lib/kinship";
import { writeAudit } from "./audit";
import { prisma } from "./db";
import { autoDeletable, deleteOrphanExternals, loadLinkCheck, suggestedFamilyLinks, toStoredLink, violations, type StoredLink } from "./kinship";
import type { Ctx, CurrentUser } from "./session";
import { tenantDb } from "./tenant-db";

type Db = Ctx["db"];

/**
 * KINSHIP-AUTO: the links from the families kept in step with the families, without a button.
 * Deleted automatically: FAMILIE links that break the rules or that the families no longer support
 * (staleFamilyLinks), and links confirmed from the names whose name the file no longer carries.
 * Links added by hand, from the campaign or confirmed from the names that break the rules are only
 * listed in De verificat. Then the links the families suggest are added when the rules allow.
 */

/** Everything ("all": the first run, "Verifică din nou tot registrul") or the persons and families touched by a change. */
export type KinScope = "all" | { personIds?: (string | null | undefined)[]; familyIds?: (string | null | undefined)[] };

export interface KinSyncResult {
  deleted: number;
  created: number;
  /** Links added by hand / from the campaign / from the names that break the rules (De verificat). */
  flagged: number;
}

/**
 * Runs the check in the caller's transaction (`db` = the church's scoped client or its transaction).
 * A scoped run looks at the given persons and every member of their families and of the given
 * families; links touching one of them are checked, suggestions for them added. Audited (SETTINGS,
 * counts only) when something changed, or always with `auditAlways` (the full runs).
 */
export async function syncKinship(db: Db, user: CurrentUser, scope: KinScope, opts: { auditAlways?: boolean; label?: string } = {}): Promise<KinSyncResult> {
  const c = await loadLinkCheck(db);
  const suggestedAll = await suggestedFamilyLinks(db);
  let inScope: (id: string) => boolean = () => true;
  if (scope !== "all") {
    const ids = new Set((scope.personIds ?? []).filter((x): x is string => Boolean(x)));
    const families = new Set((scope.familyIds ?? []).filter((x): x is string => Boolean(x)));
    for (const id of ids) {
      const f = c.named.get(id)?.familyId;
      if (f) families.add(f);
    }
    for (const p of c.named.values()) if (p.familyId && families.has(p.familyId)) ids.add(p.id);
    if (!ids.size) return { deleted: 0, created: 0, flagged: 0 };
    inScope = (id) => ids.has(id);
  }
  const touches = (l: { parentId: string; childId: string }) => inScope(l.childId) || inScope(l.parentId);
  const suggested = suggestedAll.filter((l) => inScope(l.childId));
  const links = c.links.map((l) => ({ ...l }));
  let deleted = 0;
  let created = 0;
  for (let round = 0; round < 5; round++) {
    let changed = false;
    const wrong = new Set<StoredLink>([
      ...violations(c, links)
        .filter(autoDeletable)
        .map((v) => v.link),
      ...staleFamilyLinks(links, suggestedAll, c.persons),
    ]);
    for (const l of wrong) {
      if (!touches(l)) continue;
      await db.personParent.delete({ where: { id: l.id } });
      links.splice(links.indexOf(l), 1);
      deleted++;
      changed = true;
    }
    for (const l of suggested) {
      if (links.some((x) => x.parentId === l.parentId && x.childId === l.childId)) continue;
      if (parentLinkError(links, l.parentId, l.childId, c.born)) continue;
      const row = await db.personParent.create({
        data: { churchId: user.churchId, parentId: l.parentId, childId: l.childId, source: "FAMILIE", createdById: user.id },
        select: { id: true, parentId: true, externalParentId: true, childId: true, source: true },
      });
      links.push(toStoredLink(row));
      created++;
      changed = true;
    }
    if (!changed) break;
  }
  if (deleted) await deleteOrphanExternals(db);
  const flagged = violations(c, links).filter((v) => !autoDeletable(v)).length;
  if (opts.auditAlways || deleted || created) {
    await writeAudit(db, user, {
      entity: "SETTINGS",
      entityId: user.churchId,
      entityLabel: "Legături de rudenie",
      action: "UPDATE",
      fields: [],
      extra: { observatie: `${opts.label ?? "actualizare după modificarea familiei"}: ${deleted} legături șterse, ${created} adăugate din familii, ${flagged} de verificat` },
    });
  }
  return { deleted, created, flagged };
}

/** The full check of the church's register, marked with Church.kinshipCheckedAt (the button and the first run). */
export async function checkWholeRegister(db: Db, user: CurrentUser, label: string): Promise<KinSyncResult> {
  const r = await syncKinship(db, user, "all", { auditAlways: true, label });
  await db.church.update({ where: { id: user.churchId }, data: { kinshipCheckedAt: new Date() } });
  return r;
}

/** Churches known to have had their first run, in this process (no query on every page after that). */
const checkedChurches = new Set<string>();

/**
 * KINSHIP-AUTO, the first run after the deploy: once per church, started in the background (`after()`)
 * by the first page a write user loads. The church is claimed first (kinshipCheckedAt set), so two
 * requests never both run it; a failure releases the claim for the next page. Never throws.
 */
export async function runFirstKinshipCheck(user: CurrentUser): Promise<void> {
  if (checkedChurches.has(user.churchId)) return;
  const claimed = await prisma.church.updateMany({ where: { id: user.churchId, kinshipCheckedAt: null }, data: { kinshipCheckedAt: new Date() } }).catch(() => ({ count: 0 }));
  checkedChurches.add(user.churchId);
  if (!claimed.count) return;
  try {
    const db = tenantDb(user.churchId) as unknown as Db;
    await db.$transaction((tx) => checkWholeRegister(tx as unknown as Db, user, "prima verificare automată a registrului"), { timeout: 120_000 });
  } catch {
    checkedChurches.delete(user.churchId);
    await prisma.church.update({ where: { id: user.churchId }, data: { kinshipCheckedAt: null } }).catch(() => undefined);
  }
}
