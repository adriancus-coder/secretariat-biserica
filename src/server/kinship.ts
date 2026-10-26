import "server-only";
import { ANONYMOUS_NAME } from "@/lib/anonymous";
import { fromDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { familyLinks, familyParents, kinGraph, neamOf, neamuri, relativeName, relatives, RELATIVE_GROUP_TITLE, RELATIVE_GROUPS, type KinGraph, type KinLink, type Neam, type RelativeGroup } from "@/lib/kinship";
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
  links: (KinLink & { id: string })[];
  neamuri: Neam[];
  families: Map<string, string>;
}

const PERSON_SELECT = { id: true, nume: true, prenume: true, gen: true, familyId: true, statut: true, dataIesire: true, dataNasterii: true, dataCasatoriei: true, rudenie: true } as const;

export async function loadKinship(db: Db): Promise<KinData> {
  const today = todayIso();
  const [persons, links, families] = await Promise.all([
    db.person.findMany({ where: { nume: { not: ANONYMOUS_NAME } }, select: PERSON_SELECT }),
    db.personParent.findMany({ select: { id: true, parentId: true, childId: true } }),
    db.family.findMany({ select: { id: true, nume: true, headId: true } }),
  ]);
  const heads = new Set(families.map((f) => f.headId).filter(Boolean));
  const byFamily = new Map<string, typeof persons>();
  for (const x of persons) if (x.familyId) byFamily.set(x.familyId, [...(byFamily.get(x.familyId) ?? []), x]);
  // The couples of the families (head + Soț / Soție), by the same rule as the weekly prayer.
  const couples: [string, string][] = [];
  for (const f of families) {
    const members = (byFamily.get(f.id) ?? []).map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii), dataCasatoriei: fromDbDate(m.dataCasatoriei) }));
    const parents = familyParents(members, f.headId, today);
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

/** The links every family suggests (FAMILIE): Fiu / Fiică / Copil as children of the head and the spouse. */
export async function suggestedFamilyLinks(db: Db): Promise<KinLink[]> {
  const today = todayIso();
  const families = await db.family.findMany({
    select: { headId: true, members: { where: { nume: { not: ANONYMOUS_NAME } }, select: { id: true, rudenie: true, dataNasterii: true, dataCasatoriei: true } } },
  });
  return families.flatMap((f) =>
    familyLinks(
      f.members.map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii), dataCasatoriei: fromDbDate(m.dataCasatoriei) })),
      f.headId,
      today,
    ),
  );
}

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
    const linkId =
      group === "parinti"
        ? kin.links.find((l) => l.parentId === id && l.childId === personId)?.id
        : group === "copii"
          ? kin.links.find((l) => l.parentId === personId && l.childId === id)?.id
          : undefined;
    return {
      id,
      name: memberName(p),
      label: relativeName(group, p.gen),
      family: p.familyId && kin.families.has(p.familyId) ? { id: p.familyId, name: kin.families.get(p.familyId)! } : null,
      active: p.active,
      linkId,
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
