import { ageAt } from "./dates";
import { MIN_PARENT_AGE_GAP, parentLinkError, type KinLink } from "./kinship";
import { nameKey } from "./name-match";

/*
 * KINSHIP-STATUTE-PARENTS: kinship proposed from the parents' names the Statut asks for in the register
 * (art. 14 alin. 3 lit. a: Person.numeTata / numeMama). Names are compared without diacritics, case,
 * word order or extra spaces (nameKey). Nothing is ever linked automatically: every proposal waits in
 * De verificat for "Confirmă" or "Ignoră", and a confirmed one still passes parentLinkError. Pure.
 */

/** A parent outside the register is a node of the graph with this key prefix ("x:<id>"). */
export const EXTERNAL_PREFIX = "x:";
export const externalKey = (id: string) => `${EXTERNAL_PREFIX}${id}`;
export const isExternalKey = (key: string) => key.startsWith(EXTERNAL_PREFIX);

export interface NamedKin {
  id: string;
  nume: string;
  prenume: string;
  gen: string | null;
  dataNasterii: string | null;
  numeTata: string;
  numeMama: string;
}

export interface ExternalParent {
  /** The graph key, "x:<id>". */
  key: string;
  nume: string;
  gen: "M" | "F";
}

export type ParentRole = "tata" | "mama";
const ROLE_GEN: Record<ParentRole, "M" | "F"> = { tata: "M", mama: "F" };
const ROLE_WORD: Record<ParentRole, string> = { tata: "tatăl", mama: "mama" };

export type KinProposal =
  /** a) The name matches exactly one person of the register: "X este tatăl lui Y". */
  | { kind: "parinte"; key: string; parentId: string; childId: string; role: ParentRole; text: string }
  /** The name matches a parent outside the register already known (a brother or sister was linked to it). */
  | { kind: "extern"; key: string; externalKey: string; childId: string; role: ParentRole; text: string }
  /** b) Several persons with the same parents' names: siblings, the parent(s) outside the register. */
  | { kind: "frati"; key: string; childIds: string[]; tata: string | null; mama: string | null; text: string };

const nameOf = (p: Pick<NamedKin, "nume" | "prenume">) => `${p.nume.trim()} ${p.prenume.trim()}`.trim();
const fieldOf = (p: NamedKin, role: ParentRole) => (role === "tata" ? p.numeTata : p.numeMama).trim();

/**
 * The proposals for the whole register, never one that is ignored, already linked or refused by the
 * rules (siblings, age gap, two parents, cycle). `links` use the graph keys (a parent outside the
 * register as "x:<id>"); `externals` are the parents outside the register already stored.
 */
export function nameProposals(persons: NamedKin[], links: KinLink[], externals: ExternalParent[], ignored: ReadonlySet<string>): KinProposal[] {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const born = (id: string) => byId.get(id)?.dataNasterii ?? null;
  const byName = new Map<string, NamedKin[]>();
  for (const p of persons) {
    const k = nameKey(nameOf(p));
    if (k) byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const extByName = new Map<string, ExternalParent[]>();
  for (const e of externals) extByName.set(`${e.gen}:${nameKey(e.nume)}`, [...(extByName.get(`${e.gen}:${nameKey(e.nume)}`) ?? []), e]);
  const extNames = new Map(externals.map((e) => [e.key, e.nume]));
  const parentsOf = (id: string) => links.filter((l) => l.childId === id).map((l) => l.parentId);
  /** The child already has a parent with this name (in the register or outside it). */
  const linkedByName = (child: NamedKin, key: string) =>
    parentsOf(child.id).some((pid) => nameKey(byId.has(pid) ? nameOf(byId.get(pid)!) : (extNames.get(pid) ?? "")) === key);

  const out: KinProposal[] = [];
  const resolved = new Set<string>(); // "<childId>:<role>" answered by a) or by an existing external
  const push = (p: KinProposal) => {
    if (!ignored.has(p.key)) out.push(p);
  };

  for (const child of persons) {
    for (const role of ["tata", "mama"] as const) {
      const key = nameKey(fieldOf(child, role));
      if (!key) continue;
      if (linkedByName(child, key)) {
        resolved.add(`${child.id}:${role}`);
        continue;
      }
      // a) exactly one person of the register, of the right gender, old enough.
      const candidates = (byName.get(key) ?? []).filter(
        (c) => c.id !== child.id && c.gen === ROLE_GEN[role] && !(c.dataNasterii && child.dataNasterii && ageAt(c.dataNasterii, child.dataNasterii) < MIN_PARENT_AGE_GAP),
      );
      if (candidates.length === 1) {
        resolved.add(`${child.id}:${role}`);
        const parent = candidates[0];
        if (!parentLinkError(links, parent.id, child.id, born))
          push({ kind: "parinte", key: `p:${parent.id}:${child.id}`, parentId: parent.id, childId: child.id, role, text: `${nameOf(parent)} este ${ROLE_WORD[role]} lui ${nameOf(child)}` });
        continue;
      }
      if (candidates.length > 1) {
        resolved.add(`${child.id}:${role}`); // ambiguous: never guessed
        continue;
      }
      // A parent outside the register with this name is already known (from a brother or sister).
      const ext = extByName.get(`${ROLE_GEN[role]}:${key}`) ?? [];
      if (ext.length === 1) {
        resolved.add(`${child.id}:${role}`);
        if (!parentLinkError(links, ext[0].key, child.id, born))
          push({
            kind: "extern",
            key: `e:${ext[0].key}:${child.id}`,
            externalKey: ext[0].key,
            childId: child.id,
            role,
            text: `${nameOf(child)} este copilul lui ${ext[0].nume} (nu e în registru), ca frații săi`,
          });
      }
    }
  }

  // b) Siblings with the parent(s) outside the register: the same father's name and, when every one
  //    of them has it, the same mother's name; with the mother's name missing for some, the persons'
  //    surname must be in the father's name. A mother's name that differs between two of them: no proposal.
  const groups = (role: ParentRole) => {
    const other: ParentRole = role === "tata" ? "mama" : "tata";
    const by = new Map<string, NamedKin[]>();
    for (const p of persons) {
      const key = nameKey(fieldOf(p, role));
      if (!key || resolved.has(`${p.id}:${role}`)) continue;
      // The mother-only groups take only persons without a father's name (the father groups cover the rest).
      if (role === "mama" && fieldOf(p, "tata")) continue;
      by.set(key, [...(by.get(key) ?? []), p]);
    }
    for (const [key, members] of by) {
      if (members.length < 2) continue;
      const others = new Set(members.map((m) => nameKey(fieldOf(m, other))).filter(Boolean));
      if (others.size > 1) continue;
      const allBoth = members.every((m) => fieldOf(m, other));
      const surnameIn = (m: NamedKin) => nameKey(m.nume).split(" ").every((w) => key.split(" ").includes(w));
      if (!allBoth && !members.every(surnameIn)) continue;
      // Already siblings two by two: nothing to propose.
      const share = (a: string, b: string) => parentsOf(a).some((x) => parentsOf(b).includes(x));
      if (members.every((a, i) => members.slice(i + 1).every((b) => share(a.id, b.id)))) continue;
      const ids = members.map((m) => m.id).sort();
      const father = role === "tata" ? fieldOf(members[0], "tata") : allBoth ? fieldOf(members[0], "tata") : null;
      const mother = role === "mama" ? fieldOf(members[0], "mama") : allBoth ? fieldOf(members[0], "mama") : null;
      const names = members.map(nameOf);
      const parents = [father, mother].filter(Boolean).join(" și ");
      push({
        kind: "frati",
        key: `s:${ids.join(",")}:${nameKey(father ?? "")}|${nameKey(mother ?? "")}`,
        childIds: ids,
        tata: father,
        mama: mother,
        text: `${names.slice(0, -1).join(", ")} și ${names.at(-1)} sunt frați, cu ${father && mother ? "părinții" : "părintele"} în afara registrului ${parents}`,
      });
    }
  };
  groups("tata");
  groups("mama");
  return out;
}

/** The name a link from the names expects for a parent (the child's numeTata / numeMama), or null when the field was cleared. */
export function expectedParentName(child: NamedKin, gen: string | null): string | null {
  const v = gen === "F" ? child.numeMama : gen === "M" ? child.numeTata : "";
  return v.trim() ? v.trim() : null;
}

/** A link confirmed from the names still matches the child's file (the name may have been changed since). */
export function nameLinkStillValid(child: NamedKin, parent: { nume: string; prenume?: string; gen: string | null }): boolean {
  const expected = expectedParentName(child, parent.gen);
  return expected !== null && nameKey(expected) === nameKey(`${parent.nume} ${parent.prenume ?? ""}`);
}
