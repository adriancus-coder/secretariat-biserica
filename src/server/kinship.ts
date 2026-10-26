import "server-only";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { fromDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import {
  familyLinks,
  kinGraph,
  linkParents,
  linkViolations,
  neamOf,
  neamuri,
  parentLinkError,
  relativeName,
  relatives,
  RELATIVE_GROUP_TITLE,
  RELATIVE_GROUPS,
  type CheckPerson,
  type KinGraph,
  type KinLink,
  type KinPerson,
  type Neam,
  type RelativeGroup,
} from "@/lib/kinship";
import { externalKey, nameLinkStillValid, nameProposals, type ExternalParent, type KinProposal, type NamedKin } from "@/lib/kinship-parents";
import { compareRo } from "@/lib/text";
import type { Ctx } from "./session";

type Db = Ctx["db"];

/**
 * KINSHIP on the server: the church's graph (persons, parent-child links, parents outside the register,
 * the families' couples) for the person page, the family page, Statistici and De verificat. Reads go
 * through the church's scoped client; the anonymised persons are left out. A parent outside the
 * register is a node "x:<id>" (externalKey), so every rule and deduction treats it like a parent.
 */

/** A stored link with the graph keys: `parentId` is the person's id or "x:<external id>". */
export interface StoredLink extends KinLink {
  id: string;
  source: string;
  external: boolean;
}

type LinkRow = { id: string; parentId: string | null; externalParentId: string | null; childId: string; source: string };
const LINK_SELECT = { id: true, parentId: true, externalParentId: true, childId: true, source: true } as const;
export const toStoredLink = (l: LinkRow): StoredLink => ({
  id: l.id,
  parentId: l.parentId ?? externalKey(l.externalParentId!),
  childId: l.childId,
  source: l.source,
  external: !l.parentId,
});

export interface KinData {
  graph: KinGraph;
  links: StoredLink[];
  neamuri: Neam[];
  families: Map<string, string>;
}

const PERSON_SELECT = { id: true, nume: true, prenume: true, gen: true, familyId: true, statut: true, dataIesire: true, dataNasterii: true, rudenie: true } as const;

export async function loadKinship(db: Db): Promise<KinData> {
  const [persons, rows, families, externals] = await Promise.all([
    db.person.findMany({ where: { nume: { not: ANONYMOUS_NAME } }, select: PERSON_SELECT }),
    db.personParent.findMany({ select: LINK_SELECT }),
    db.family.findMany({ select: { id: true, nume: true, headId: true } }),
    db.kinExternalParent.findMany({ select: { id: true, nume: true, gen: true } }),
  ]);
  const links = rows.map(toStoredLink);
  const heads = new Set(families.map((f) => f.headId).filter(Boolean));
  const byFamily = new Map<string, typeof persons>();
  for (const x of persons) if (x.familyId) byFamily.set(x.familyId, [...(byFamily.get(x.familyId) ?? []), x]);
  // The couples of the families: the head and Soț / Soție, never a member with a child's relation (linkParents).
  const couples: [string, string][] = [];
  for (const f of families) {
    const parents = linkParents((byFamily.get(f.id) ?? []).map((m) => ({ id: m.id, rudenie: m.rudenie, dataNasterii: fromDbDate(m.dataNasterii) })), f.headId);
    if (parents.length === 2) couples.push([parents[0].id, parents[1].id]);
  }
  // Two parents outside the register of the same child are a couple (they have no family to say so).
  const byChild = new Map<string, string[]>();
  for (const l of links) if (l.external) byChild.set(l.childId, [...(byChild.get(l.childId) ?? []), l.parentId]);
  for (const ps of byChild.values()) if (ps.length === 2) couples.push([ps[0], ps[1]]);
  const nodes: KinPerson[] = [
    ...persons.map((x) => ({
      id: x.id,
      nume: x.nume,
      prenume: x.prenume,
      gen: x.gen,
      familyId: x.familyId,
      dataNasterii: fromDbDate(x.dataNasterii),
      active: !x.dataIesire && x.statut !== "FOST_MEMBRU",
      isHead: heads.has(x.id),
      statut: x.statut,
    })),
    // Parents outside the register: only the name as the children's file writes it.
    ...externals.map((e) => ({ id: externalKey(e.id), nume: e.nume, prenume: "", gen: e.gen, familyId: null, dataNasterii: null, active: false, external: true })),
  ];
  const graph = kinGraph(nodes, links, couples);
  return { graph, links, neamuri: neamuri(graph), families: new Map(families.map((f) => [f.id, f.nume])) };
}

/** The links every family suggests (FAMILIE): Fiu / Fiică / Copil as children of the head and Soț / Soție. */
export async function suggestedFamilyLinks(db: Db): Promise<KinLink[]> {
  const families = await db.family.findMany({
    select: { headId: true, members: { where: { nume: { not: ANONYMOUS_NAME } }, select: { id: true, rudenie: true, dataNasterii: true } } },
  });
  return families.flatMap((f) => familyLinks(f.members.map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii) })), f.headId));
}

export const NAME_CHANGED = "Numele părintelui de pe fișa copilului s-a schimbat.";

/**
 * Everything the checks of the stored links need: every person's birth date, family, relation and
 * parents' names, the parents outside the register, each family's head, the links (graph keys).
 */
export async function loadLinkCheck(db: Db) {
  const [persons, families, rows, externals] = await Promise.all([
    db.person.findMany({
      where: { nume: { not: ANONYMOUS_NAME } },
      select: { id: true, nume: true, prenume: true, gen: true, dataNasterii: true, familyId: true, rudenie: true, numeTata: true, numeMama: true },
    }),
    db.family.findMany({ select: { id: true, headId: true } }),
    db.personParent.findMany({ select: LINK_SELECT, orderBy: { createdAt: "asc" } }),
    db.kinExternalParent.findMany({ select: { id: true, nume: true, gen: true } }),
  ]);
  const named = new Map<string, NamedKin & CheckPerson>(persons.map((p) => [p.id, { ...p, dataNasterii: fromDbDate(p.dataNasterii) }]));
  const ext: ExternalParent[] = externals.map((e) => ({ key: externalKey(e.id), nume: e.nume, gen: e.gen }));
  const check = new Map<string, CheckPerson>(named);
  for (const e of ext) check.set(e.key, { id: e.key, dataNasterii: null, familyId: null, rudenie: "" });
  const links = rows.map(toStoredLink);
  return {
    named,
    persons: check,
    externals: ext,
    heads: new Map(families.map((f) => [f.id, f.headId])),
    links,
    born: (id: string) => named.get(id)?.dataNasterii ?? null,
  };
}
export type LinkCheck = Awaited<ReturnType<typeof loadLinkCheck>>;

/** The display name of a graph node: a person of the register, or a parent outside it. */
export function nodeName(c: LinkCheck, key: string): string {
  const p = c.named.get(key);
  if (p) return memberName(p);
  return c.externals.find((e) => e.key === key)?.nume ?? "";
}

/**
 * The stored links that break the rules: siblings, too close in age, a son "parent" in the common
 * family (linkViolations), and a link confirmed from the names whose name the child's file no longer
 * carries (NAME_CHANGED).
 */
export function violations(c: LinkCheck, links: StoredLink[] = c.links): { link: StoredLink; reason: string }[] {
  const out = linkViolations(links, c.persons, c.heads);
  for (const l of links) {
    if (l.source !== "NUME_PARINTI" || out.some((v) => v.link === l)) continue;
    const child = c.named.get(l.childId);
    const parent = c.named.get(l.parentId) ?? c.externals.find((e) => e.key === l.parentId);
    if (child && parent && !nameLinkStillValid(child, { nume: parent.nume, prenume: "prenume" in parent ? parent.prenume : "", gen: parent.gen })) out.push({ link: l, reason: NAME_CHANGED });
  }
  return out;
}

/**
 * Deleted without asking by the automatic check (KINSHIP-AUTO): the families' own links, and a link
 * confirmed from the names whose name the file no longer carries. Everything else is only reported.
 */
export const autoDeletable = (v: { link: StoredLink; reason: string }) => v.link.source === "FAMILIE" || (v.link.source === "NUME_PARINTI" && v.reason === NAME_CHANGED);

/**
 * De verificat → "Legături de rudenie de verificat": the links added by hand, from the campaign or
 * confirmed from the names that break the rules (never deleted automatically), with the reason and
 * both persons. Write roles only.
 */
export async function manualLinksToReview(db: Db) {
  const c = await loadLinkCheck(db);
  return violations(c)
    .filter((v) => !autoDeletable(v))
    .map((v) => ({
      id: v.link.id,
      parent: { id: v.link.external ? null : v.link.parentId, name: nodeName(c, v.link.parentId) },
      child: { id: v.link.childId, name: nodeName(c, v.link.childId) },
      reason: v.reason,
    }));
}

/** De verificat → "Rudenie propusă după numele părinților": the open proposals (never linked without "Confirmă"). */
export async function kinProposals(db: Db): Promise<KinProposal[]> {
  const [c, ignored] = await Promise.all([loadLinkCheck(db), db.kinProposalIgnore.findMany({ select: { key: true } })]);
  return nameProposals([...c.named.values()], c.links, c.externals, new Set(ignored.map((i) => i.key)));
}

export const KIN_SOURCE_LABEL: Record<string, string> = {
  FAMILIE: "din familie",
  MANUAL: "adăugată manual",
  CAMPANIE: "din campanie",
  NUME_PARINTI: "după numele părinților",
};

/** "Popescu Ion" for the audit and the art. 15 copy. */
export const kinName = (p: { nume: string; prenume: string }) => memberName(p);

export interface KinEntry {
  id: string;
  name: string;
  /** "tată", "soră", "văr" … by the relative's gender. */
  label: string;
  family: { id: string; name: string } | null;
  active: boolean;
  /** A parent outside the register: the name as written, no link. */
  external: boolean;
  /** The PersonParent row, for parents and children (to remove the link). */
  linkId?: string;
  /** Where the link came from (shown to write roles), KIN_SOURCE_LABEL. */
  source?: string;
}

export interface PickerPerson {
  id: string;
  name: string;
  note?: string;
  /** Why this person cannot be chosen (the rules), shown short. */
  disabled?: string;
}

/**
 * "Rude în biserică" for one person: parents and children (editable), the deduced relatives by group,
 * the neam. Persons no longer in the register only for write roles (marked); parents outside the
 * register to everyone, by name, without a link. For write roles also the picker's lists for "+ Adaugă
 * părinte" / "+ Adaugă copil", with the persons the rules refuse disabled and the reason.
 */
export async function personKinship(ctx: Ctx, personId: string, canWrite: boolean) {
  const kin = await loadKinship(ctx.db);
  const { graph } = kin;
  if (!graph.person.has(personId)) return null;
  const entry = (group: RelativeGroup, id: string): KinEntry | null => {
    const p = graph.person.get(id);
    if (!p || (!p.active && !p.external && !canWrite)) return null;
    const link =
      group === "parinti"
        ? kin.links.find((l) => l.parentId === id && l.childId === personId)
        : group === "copii"
          ? kin.links.find((l) => l.parentId === personId && l.childId === id)
          : undefined;
    return {
      id,
      name: p.external ? p.nume : memberName(p),
      label: relativeName(group, p.gen),
      family: p.familyId && kin.families.has(p.familyId) ? { id: p.familyId, name: kin.families.get(p.familyId)! } : null,
      active: p.active,
      external: Boolean(p.external),
      linkId: link?.id,
      source: link && canWrite ? KIN_SOURCE_LABEL[link.source] : undefined,
    };
  };
  const r = relatives(graph, personId);
  const groups = RELATIVE_GROUPS.map((g) => ({ key: g, title: RELATIVE_GROUP_TITLE[g], entries: r[g].map((id) => entry(g, id)).filter((e): e is KinEntry => Boolean(e)) }));
  const neam = neamOf(kin.neamuri, personId);
  let pickParent: PickerPerson[] = [];
  let pickChild: PickerPerson[] = [];
  if (canWrite) {
    const born = (id: string) => graph.person.get(id)?.dataNasterii ?? null;
    const base = [...graph.person.values()]
      .filter((p) => p.id !== personId && !p.external)
      .map((p) => ({ id: p.id, name: memberName(p), note: [p.familyId ? kin.families.get(p.familyId) : null, p.active ? null : "nu mai este în evidență"].filter(Boolean).join(" · ") || undefined }))
      .sort((a, b) => compareRo(a.name, b.name));
    pickParent = base.map((p) => ({ ...p, disabled: parentLinkError(kin.links, p.id, personId, born) ?? undefined }));
    pickChild = base.map((p) => ({ ...p, disabled: parentLinkError(kin.links, personId, p.id, born) ?? undefined }));
  }
  return { groups, neam: neam ? { id: neam.id, name: neam.name } : null, pickParent, pickChild };
}

/**
 * After a person's file is saved: the links confirmed from the names whose parent's name the file no
 * longer carries are removed, and parents outside the register left without children are deleted.
 * Returns how many links went (the caller's audit). In the save's transaction.
 */
export async function reconcileNameLinks(db: Db, childId: string): Promise<number> {
  const c = await loadLinkCheck(db);
  const wrong = violations(c).filter((v) => v.link.childId === childId && v.link.source === "NUME_PARINTI" && v.reason === NAME_CHANGED);
  for (const v of wrong) await db.personParent.delete({ where: { id: v.link.id } });
  await deleteOrphanExternals(db);
  return wrong.length;
}

/** A parent outside the register exists only through its children: without any, it is deleted. */
export async function deleteOrphanExternals(db: Db): Promise<number> {
  const r = await db.kinExternalParent.deleteMany({ where: { children: { none: {} } } });
  return r.count;
}
