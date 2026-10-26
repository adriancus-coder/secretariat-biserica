import "server-only";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { fromDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { familyLinks, linkParents, linkViolations, kinGraph, neamOf, neamuri, relativeName, relatives, RELATIVE_GROUP_TITLE, RELATIVE_GROUPS, type KinGraph, type KinLink, type Neam, type RelativeGroup } from "@/lib/kinship";
import { compareRo } from "@/lib/text";
import type { Ctx } from "./session";

type Db = Ctx["db"];

/**
 * KINSHIP on the server: the church's graph (persons, parent-child links, the families' couples) for
 * the person page, the family page and Statistici. Reads go through the church's scoped client; the
 * anonymised persons are left out.
 */
export interface KinData {
  graph: KinGraph;
  links: (KinLink & { id: string; source: string })[];
  neamuri: Neam[];
  families: Map<string, string>;
}

const PERSON_SELECT = { id: true, nume: true, prenume: true, gen: true, familyId: true, statut: true, dataIesire: true, dataNasterii: true, dataCasatoriei: true, rudenie: true } as const;

export async function loadKinship(db: Db): Promise<KinData> {
  const [persons, links, families] = await Promise.all([
    db.person.findMany({ where: { nume: { not: ANONYMOUS_NAME } }, select: PERSON_SELECT }),
    db.personParent.findMany({ select: { id: true, parentId: true, childId: true, source: true } }),
    db.family.findMany({ select: { id: true, nume: true, headId: true } }),
  ]);
  const heads = new Set(families.map((f) => f.headId).filter(Boolean));
  const byFamily = new Map<string, typeof persons>();
  for (const x of persons) if (x.familyId) byFamily.set(x.familyId, [...(byFamily.get(x.familyId) ?? []), x]);
  // The couples of the families: the head and Soț / Soție, never a member with a child's relation (linkParents).
  const couples: [string, string][] = [];
  for (const f of families) {
    const parents = linkParents((byFamily.get(f.id) ?? []).map((m) => ({ id: m.id, rudenie: m.rudenie, dataNasterii: fromDbDate(m.dataNasterii) })), f.headId);
    if (parents.length === 2) couples.push([parents[0].id, parents[1].id]);
  }
  const graph = kinGraph(
    persons.map((x) => ({
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
    links,
    couples,
  );
  return { graph, links, neamuri: neamuri(graph), families: new Map(families.map((f) => [f.id, f.nume])) };
}

/** The links every family suggests (FAMILIE): Fiu / Fiică / Copil as children of the head and Soț / Soție. */
export async function suggestedFamilyLinks(db: Db): Promise<KinLink[]> {
  const families = await db.family.findMany({
    select: { headId: true, members: { where: { nume: { not: ANONYMOUS_NAME } }, select: { id: true, rudenie: true, dataNasterii: true } } },
  });
  return families.flatMap((f) => familyLinks(f.members.map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii) })), f.headId));
}

/** What the checks of the stored links need: every person's birth date, family and relation, each family's head, the links. */
export async function loadLinkCheck(db: Db) {
  const [persons, families, links] = await Promise.all([
    db.person.findMany({ select: { id: true, nume: true, prenume: true, dataNasterii: true, familyId: true, rudenie: true } }),
    db.family.findMany({ select: { id: true, headId: true } }),
    db.personParent.findMany({ select: { id: true, parentId: true, childId: true, source: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const byId = new Map(persons.map((p) => [p.id, { ...p, dataNasterii: fromDbDate(p.dataNasterii) }]));
  return { persons: byId, heads: new Map(families.map((f) => [f.id, f.headId])), links, born: (id: string) => byId.get(id)?.dataNasterii ?? null };
}

/**
 * De verificat → "Legături de rudenie de verificat": the links added by hand that break the rules
 * (they are never deleted automatically), with the reason and both persons. Write roles only.
 */
export async function manualLinksToReview(db: Db) {
  const c = await loadLinkCheck(db);
  return linkViolations(c.links, c.persons, c.heads)
    .filter((v) => v.link.source !== "FAMILIE")
    .map((v) => {
      const p = c.persons.get(v.link.parentId)!;
      const ch = c.persons.get(v.link.childId)!;
      return { id: v.link.id, parent: { id: p.id, name: memberName(p) }, child: { id: ch.id, name: memberName(ch) }, reason: v.reason };
    });
}

export const KIN_SOURCE_LABEL: Record<string, string> = { FAMILIE: "din familie", MANUAL: "adăugată manual", CAMPANIE: "din campanie" };

/** "Popescu Ion" for the audit and the art. 15 copy. */
export const kinName = (p: { nume: string; prenume: string }) => memberName(p);

export interface KinEntry {
  id: string;
  name: string;
  /** "tată", "soră", "văr" … by the relative's gender. */
  label: string;
  family: { id: string; name: string } | null;
  active: boolean;
  /** The PersonParent row, for parents and children (to remove the link). */
  linkId?: string;
  /** Where the link came from (shown to write roles): "din familie" / "adăugată manual" / "din campanie". */
  source?: string;
}

/**
 * "Rude în biserică" for one person: parents and children (editable), the deduced relatives by group,
 * the neam. Persons no longer in the register only for write roles (marked); `people` (the picker's
 * list: every person of the register but this one) only for write roles too.
 */
export async function personKinship(ctx: Ctx, personId: string, canWrite: boolean) {
  const kin = await loadKinship(ctx.db);
  const { graph } = kin;
  if (!graph.person.has(personId)) return null;
  const entry = (group: RelativeGroup, id: string): KinEntry | null => {
    const p = graph.person.get(id);
    if (!p || (!p.active && !canWrite)) return null;
    const link =
      group === "parinti"
        ? kin.links.find((l) => l.parentId === id && l.childId === personId)
        : group === "copii"
          ? kin.links.find((l) => l.parentId === personId && l.childId === id)
          : undefined;
    return {
      id,
      name: memberName(p),
      label: relativeName(group, p.gen),
      family: p.familyId && kin.families.has(p.familyId) ? { id: p.familyId, name: kin.families.get(p.familyId)! } : null,
      active: p.active,
      linkId: link?.id,
      source: link && canWrite ? KIN_SOURCE_LABEL[link.source] : undefined,
    };
  };
  const r = relatives(graph, personId);
  const groups = RELATIVE_GROUPS.map((g) => ({ key: g, title: RELATIVE_GROUP_TITLE[g], entries: r[g].map((id) => entry(g, id)).filter((e): e is KinEntry => Boolean(e)) }));
  const neam = neamOf(kin.neamuri, personId);
  const people = canWrite
    ? [...graph.person.values()]
        .filter((p) => p.id !== personId)
        .map((p) => ({ id: p.id, name: memberName(p), note: [p.familyId ? kin.families.get(p.familyId) : null, p.active ? null : "nu mai este în evidență"].filter(Boolean).join(" · ") || undefined }))
        .sort((a, b) => compareRo(a.name, b.name))
    : [];
  return { groups, neam: neam ? { id: neam.id, name: neam.name } : null, people };
}
