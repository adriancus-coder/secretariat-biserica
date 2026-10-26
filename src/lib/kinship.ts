import { ageAt } from "./dates";
import { compareRo } from "./text";

/** The order of kinship degrees (the church's nomenclature): rank of a degree, unknown last. Pure. */
export const kinshipRank = (rudenieOrder: string[]) => (r: string) => {
  const i = rudenieOrder.indexOf(r);
  return i < 0 ? 99 : i;
};

/*
 * KINSHIP: parent-child links between persons of the register (PersonParent) and everything deduced
 * from them — siblings, grandparents, grandchildren, uncles and aunts, cousins, in-laws — plus the
 * "neam" (the connected kin group). Spouses come from the families (head + Soț / Soție), never from a
 * link. Nothing deduced is stored. Pure.
 */

/** A spouse is always a parent of the family's children (whatever the birth date says). */
export const SPOUSE_RELATIONS = ["Soț", "Soție"];
/** The relations of a child of the family (Nepot / Nepoată: a grandchild living with the family). */
export const CHILD_RELATIONS = ["Fiu", "Fiică", "Copil", "Nepot", "Nepoată"];
/** The relations that make a member a child of the head and the spouse (the initial links). */
export const OWN_CHILD_RELATIONS = ["Fiu", "Fiică", "Copil"];
/** Relations that never make a member the head's spouse (the head's own parents). */
const NOT_SPOUSE = ["Părinte"];

export interface FamilyMember {
  id: string;
  rudenie: string;
  dataNasterii: string | null;
  dataCasatoriei?: string | null;
}

const adult = (m: FamilyMember, today: string) => !m.dataNasterii || ageAt(m.dataNasterii, today) >= 18;
const isSpouse = (m: FamilyMember) => SPOUSE_RELATIONS.includes(m.rudenie.trim());
const hasChildRelation = (m: FamilyMember) => CHILD_RELATIONS.includes(m.rudenie.trim());

/**
 * The parents of a family among `members` (PRAYER-FAMILY-ROLES): the head and every Soț / Soție; with a
 * married head (dataCasatoriei) and no Soț / Soție, the single adult without a child's relation (and not
 * "Părinte") is taken as the spouse; with several such adults none is. The head comes first.
 */
export function familyParents<T extends FamilyMember>(members: T[], headId: string | null, today: string): T[] {
  const head = members.find((m) => m.id === headId);
  const spouses = members.filter((m) => m !== head && isSpouse(m));
  const parents = head ? [head, ...spouses] : spouses;
  if (head?.dataCasatoriei && !spouses.length) {
    const candidates = members.filter((m) => m !== head && adult(m, today) && !hasChildRelation(m) && !NOT_SPOUSE.includes(m.rudenie.trim()));
    if (candidates.length === 1) return [...parents, candidates[0]];
  }
  return parents;
}

export interface KinLink {
  parentId: string;
  childId: string;
}

const HEAD_RELATION = "Cap de familie";

/**
 * Who may be a parent in the links created from a family (KINSHIP-FIX-SIBLINGS): only the head (the
 * family's head, or the member whose relation is "Cap de familie") and Soț / Soție, whatever their age —
 * never "all adults", and never a member with a child's relation (an adult Fiu stays a son even when
 * the app chose him as the family's head).
 */
export function isLinkParent(m: FamilyMember, headId: string | null): boolean {
  return !hasChildRelation(m) && (m.id === headId || m.rudenie.trim() === HEAD_RELATION || isSpouse(m));
}

/** The parents of the links of one family: at most two; with more, the "Cap de familie" (or the head) alone. */
export function linkParents<T extends FamilyMember>(members: T[], headId: string | null): T[] {
  const parents = members.filter((m) => isLinkParent(m, headId));
  if (parents.length <= MAX_PARENTS) return parents;
  const byRelation = parents.filter((m) => m.rudenie.trim() === HEAD_RELATION);
  if (byRelation.length === 1) return byRelation;
  return parents.filter((m) => m.id === headId);
}

/**
 * The links a family suggests (source FAMILIE): every member with the relation Fiu / Fiică / Copil is a
 * child of the head and of Soț / Soție (linkParents); without Soț / Soție, of the head only.
 */
export function familyLinks(members: FamilyMember[], headId: string | null): KinLink[] {
  const parents = linkParents(members, headId);
  return members
    .filter((m) => !parents.includes(m) && OWN_CHILD_RELATIONS.includes(m.rudenie.trim()))
    .flatMap((child) => parents.map((p) => ({ parentId: p.id, childId: child.id })));
}

export const MAX_PARENTS = 2;

/** The ancestors of `id` through `links` (not `id` itself). */
function ancestors(links: KinLink[], id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const l of links) {
      if (l.childId !== cur || seen.has(l.parentId)) continue;
      seen.add(l.parentId);
      stack.push(l.parentId);
    }
  }
  return seen;
}

/** A parent is at least this many years older than the child, when both birth dates are known. */
export const MIN_PARENT_AGE_GAP = 12;
export const SIBLINGS_ERROR = "Persoanele sunt frați; nu pot fi părinte și copil.";
export const AGE_GAP_ERROR = "Diferența de vârstă e prea mică.";

/** The birth date of a person, when known (for the age gap). */
export type BirthOf = (id: string) => string | null | undefined;

/** Siblings (a parent in common) or too close in age: the two checks shared by new links and the review of stored ones. */
function pairError(links: KinLink[], parentId: string, childId: string, born: BirthOf): string | null {
  const parentsOf = (id: string) => links.filter((l) => l.childId === id).map((l) => l.parentId);
  const childParents = new Set(parentsOf(childId));
  if (parentsOf(parentId).some((p) => childParents.has(p))) return SIBLINGS_ERROR;
  const bp = born(parentId);
  const bc = born(childId);
  if (bp && bc && ageAt(bp, bc) < MIN_PARENT_AGE_GAP) return AGE_GAP_ERROR;
  return null;
}

/**
 * Why a new parent-child link is refused (shown to the user), or null: never oneself, not twice, not
 * between siblings, the parent at least 12 years older (when both birth dates are known), at most two
 * parents, and no cycle (a person cannot be an ancestor of their own parent). The church is checked by
 * the caller (both persons found through the church's scoped client).
 */
export function parentLinkError(links: KinLink[], parentId: string, childId: string, born: BirthOf = () => null): string | null {
  if (parentId === childId) return "O persoană nu poate fi propriul părinte.";
  if (links.some((l) => l.parentId === parentId && l.childId === childId)) return "Legătura există deja.";
  const pair = pairError(links, parentId, childId, born);
  if (pair) return pair;
  if (links.filter((l) => l.childId === childId).length >= MAX_PARENTS) return "Persoana are deja doi părinți în registru.";
  if (ancestors(links, parentId).has(childId)) return "Legătura ar face din persoană strămoșul propriului părinte.";
  return null;
}

export interface CheckPerson {
  id: string;
  dataNasterii: string | null;
  familyId: string | null;
  rudenie: string;
}
export const SAME_FAMILY_ERROR = "În familia comună, părintele nu este capul familiei sau soțul / soția.";

/**
 * The stored links that break the rules (Setări → Date "Verifică legăturile de rudenie", De verificat):
 * siblings, too close in age, or — both in the same family — a parent who is not the head or Soț /
 * Soție there (an adult Fiu "parent" of his brothers). Each link with the first reason found.
 */
export function linkViolations<L extends KinLink>(links: L[], persons: Map<string, CheckPerson>, heads: Map<string, string | null>): { link: L; reason: string }[] {
  const born: BirthOf = (id) => persons.get(id)?.dataNasterii;
  const out: { link: L; reason: string }[] = [];
  for (const link of links) {
    const others = links.filter((l) => l !== link);
    const p = persons.get(link.parentId);
    const c = persons.get(link.childId);
    if (!p || !c) continue;
    const pair = pairError(others, link.parentId, link.childId, born);
    if (pair) out.push({ link, reason: pair });
    else if (p.familyId && p.familyId === c.familyId && !isLinkParent(p, heads.get(p.familyId) ?? null)) out.push({ link, reason: SAME_FAMILY_ERROR });
  }
  return out;
}

export interface KinPerson {
  id: string;
  nume: string;
  prenume: string;
  gen: string | null;
  familyId: string | null;
  dataNasterii: string | null;
  /** In the register now (not Fost membru, no exit). */
  active: boolean;
  /** Heads a family (used to name a neam when two ancestors tie). */
  isHead?: boolean;
  /** A parent outside the register (KINSHIP-STATUTE-PARENTS): the name as written, counted nowhere but in the tree. */
  external?: boolean;
  statut?: string;
}

export interface KinGraph {
  person: Map<string, KinPerson>;
  parents: Map<string, string[]>;
  children: Map<string, string[]>;
  spouses: Map<string, string[]>;
}

const push = (m: Map<string, string[]>, k: string, v: string) => {
  const a = m.get(k);
  if (!a) m.set(k, [v]);
  else if (!a.includes(v)) a.push(v);
};

/** The graph of the register: links between known persons only, spouses from the families' couples. */
export function kinGraph(persons: KinPerson[], links: KinLink[], couples: [string, string][]): KinGraph {
  const person = new Map(persons.map((p) => [p.id, p]));
  const g: KinGraph = { person, parents: new Map(), children: new Map(), spouses: new Map() };
  for (const l of links) {
    if (!person.has(l.parentId) || !person.has(l.childId)) continue;
    push(g.parents, l.childId, l.parentId);
    push(g.children, l.parentId, l.childId);
  }
  for (const [a, b] of couples) {
    if (!person.has(a) || !person.has(b) || a === b) continue;
    push(g.spouses, a, b);
    push(g.spouses, b, a);
  }
  return g;
}

const of = (m: Map<string, string[]>, id: string) => m.get(id) ?? [];
const uniq = (ids: string[], not: Set<string>) => [...new Set(ids)].filter((x) => !not.has(x));

export const RELATIVE_GROUPS = ["parinti", "copii", "frati", "bunici", "nepoti", "unchi", "veri", "socri", "gineri"] as const;
export type RelativeGroup = (typeof RELATIVE_GROUPS)[number];
export const RELATIVE_GROUP_TITLE: Record<RelativeGroup, string> = {
  parinti: "Părinți",
  copii: "Copii",
  frati: "Frați și surori",
  bunici: "Bunici",
  nepoti: "Nepoți",
  unchi: "Unchi și mătuși",
  veri: "Veri",
  socri: "Socri",
  gineri: "Gineri și nurori",
};
const NAMES: Record<RelativeGroup, [string, string, string]> = {
  parinti: ["tată", "mamă", "părinte"],
  copii: ["fiu", "fiică", "copil"],
  frati: ["frate", "soră", "frate/soră"],
  bunici: ["bunic", "bunică", "bunic/bunică"],
  nepoti: ["nepot", "nepoată", "nepot/nepoată"],
  unchi: ["unchi", "mătușă", "unchi/mătușă"],
  veri: ["văr", "vară", "văr/vară"],
  socri: ["socru", "soacră", "socru/soacră"],
  gineri: ["ginere", "noră", "ginere/noră"],
};

/** "frate" / "soră" / "frate/soră" by the relative's gender. */
export function relativeName(group: RelativeGroup, gen: string | null): string {
  const [m, f, any] = NAMES[group];
  return gen === "M" ? m : gen === "F" ? f : any;
}

/**
 * Everyone related to `id`, by group: parents, children, siblings (at least one parent in common),
 * grandparents, grandchildren, uncles and aunts (the parents' siblings), cousins (their children),
 * parents-in-law (the spouse's parents) and children-in-law (the children's spouses). Each person once,
 * in the closest group; never `id` itself.
 */
export function relatives(g: KinGraph, id: string): Record<RelativeGroup, string[]> {
  const seen = new Set<string>([id]);
  const take = (ids: string[]) => {
    const out = uniq(ids, seen);
    out.forEach((x) => seen.add(x));
    return out;
  };
  const parents = of(g.parents, id);
  const children = of(g.children, id);
  const spouses = of(g.spouses, id);
  spouses.forEach((s) => seen.add(s));
  const r = {} as Record<RelativeGroup, string[]>;
  r.parinti = take(parents);
  r.copii = take(children);
  r.frati = take(parents.flatMap((p) => of(g.children, p)));
  r.bunici = take(parents.flatMap((p) => of(g.parents, p)));
  r.nepoti = take(children.flatMap((c) => of(g.children, c)));
  const uncles = parents.flatMap((p) => of(g.parents, p).flatMap((gp) => of(g.children, gp))).filter((u) => !parents.includes(u));
  r.unchi = take(uncles);
  r.veri = take(uncles.flatMap((u) => of(g.children, u)));
  r.socri = take(spouses.flatMap((s) => of(g.parents, s)));
  r.gineri = take(children.flatMap((c) => of(g.spouses, c)));
  return r;
}

export interface Neam {
  /** The root ancestor's id: the neam's key in links. */
  id: string;
  name: string;
  members: string[];
  /** Active persons, of them MEMBRU, and the families they belong to. */
  persons: number;
  membri: number;
  families: number;
  generations: number;
}

/** How many descendants `id` has (each once). */
function descendants(g: KinGraph, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    for (const c of of(g.children, stack.pop()!)) {
      if (seen.has(c)) continue;
      seen.add(c);
      stack.push(c);
    }
  }
  return seen;
}

/** Generation of each person: 0 for the oldest, a child one more than its parents, a married-in spouse (no parents) as the partner. */
function generationLevels(g: KinGraph, ids: string[]): Map<string, number> {
  const level = new Map(ids.map((id) => [id, 0]));
  const at = (id: string) => level.get(id) ?? 0;
  // Levels only grow and are bounded by the size of the group, so this settles.
  for (let round = 0; round <= ids.length; round++) {
    let changed = false;
    for (const id of ids) {
      const ps = of(g.parents, id);
      const want = ps.length ? Math.max(...ps.map(at)) + 1 : Math.max(0, ...of(g.spouses, id).map(at));
      if (want !== at(id)) {
        level.set(id, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return level;
}

/**
 * The neamuri: groups of persons joined by parent-child links and by marriage, with at least one
 * parent-child link. Each is named after its oldest known ancestor ("Neamul Ciobanu Dumitru"); with
 * several, the one with the most descendants, then a family head, then the oldest birth date, then
 * the name.
 */
export function neamuri(g: KinGraph): Neam[] {
  const done = new Set<string>();
  const out: Neam[] = [];
  for (const start of g.person.keys()) {
    if (done.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    done.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const n of [...of(g.parents, cur), ...of(g.children, cur), ...of(g.spouses, cur)]) {
        if (done.has(n)) continue;
        done.add(n);
        stack.push(n);
      }
    }
    if (!comp.some((id) => of(g.children, id).length)) continue;
    const roots = comp.filter((id) => !of(g.parents, id).length && of(g.children, id).length);
    const desc = new Map(roots.map((r) => [r, descendants(g, r).size]));
    const p = (id: string) => g.person.get(id)!;
    roots.sort(
      (a, b) =>
        desc.get(b)! - desc.get(a)! ||
        Number(Boolean(p(b).isHead)) - Number(Boolean(p(a).isHead)) ||
        (p(a).dataNasterii ?? "9999").localeCompare(p(b).dataNasterii ?? "9999") ||
        compareRo(`${p(a).nume} ${p(a).prenume}`, `${p(b).nume} ${p(b).prenume}`),
    );
    const root = p(roots[0]);
    const active = comp.map(p).filter((x) => x.active);
    const levels = generationLevels(g, comp);
    const lv = [...levels.values()];
    out.push({
      id: root.id,
      name: `Neamul ${`${root.nume} ${root.prenume}`.trim()}`,
      members: comp,
      persons: active.length,
      membri: active.filter((x) => x.statut === "MEMBRU").length,
      families: new Set(active.map((x) => x.familyId).filter(Boolean)).size,
      generations: Math.max(...lv) - Math.min(...lv) + 1,
    });
  }
  return out.sort((a, b) => b.persons - a.persons || compareRo(a.name, b.name));
}

/** The neam a person belongs to, or null. */
export function neamOf(list: Neam[], id: string): Neam | null {
  return list.find((n) => n.members.includes(id)) ?? null;
}

export interface TreeNode {
  id: string;
  spouses: string[];
  children: TreeNode[];
}

/**
 * The neam as a tree from its root: each person with their spouse(s) and their children (of either
 * spouse, oldest first), each person once. Persons of the neam not reached this way (an in-law's own
 * parents) start their own branches, after the main one.
 */
export function neamTree(g: KinGraph, neam: Neam): TreeNode[] {
  const placed = new Set<string>();
  const born = (id: string) => g.person.get(id)?.dataNasterii ?? "9999";
  const node = (id: string): TreeNode => {
    placed.add(id);
    const spouses = of(g.spouses, id).filter((s) => !placed.has(s));
    spouses.forEach((s) => placed.add(s));
    const kids = [...new Set([id, ...spouses].flatMap((x) => of(g.children, x)))].filter((c) => !placed.has(c)).sort((a, b) => born(a).localeCompare(born(b)));
    kids.forEach((c) => placed.add(c));
    return { id, spouses, children: kids.map((c) => (placed.delete(c), node(c))) };
  };
  const trees = [node(neam.id)];
  for (const id of neam.members) if (!placed.has(id) && !of(g.parents, id).length && of(g.children, id).length) trees.push(node(id));
  return trees;
}
