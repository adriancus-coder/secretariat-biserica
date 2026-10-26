import { isExternalKey, type ParentRole } from "./kinship-parents";
import { nameKey } from "./name-match";

/*
 * KINSHIP-CARD-SIBLINGS: "+ Adaugă frate / soră" on the person page. Two persons are siblings when they
 * have a parent in common, so adding a brother means giving both the same parents: the parents in the
 * register of one of them, or the parents outside the register named on their files (Statut art. 14:
 * Numele tatălui / Numele mamei). The plan is computed here (pure) and again on the server before
 * anything is written; the links are always checked by parentLinkError. Never a new kind of link.
 */

export interface SiblingSide {
  id: string;
  /** "Popescu Ion" */
  name: string;
  gen: string | null;
  numeTata: string;
  numeMama: string;
  /** The graph keys of the person's parents (a person's id, or "x:<id>" for a parent outside the register). */
  parents: string[];
}

/** A parent outside the register already linked to one of the two (reused for both). */
export interface KnownExternal {
  key: string;
  nume: string;
  gen: "M" | "F";
}

export type SiblingPlan =
  | { kind: "already"; message: string }
  | { kind: "refuse"; message: string }
  /** b) One has parents in the register, the other no parent at all: link the other to the same parents. */
  | { kind: "adopt"; childId: string; parents: string[]; text: string }
  /** c) No parent in the register: parents outside it, by the names on the files (copied where missing). */
  | {
      kind: "names";
      tata: string;
      mama: string;
      /** The names written on a file where they were empty. */
      fills: { personId: string; field: "numeTata" | "numeMama"; value: string }[];
      /** A parent outside the register already linked to one of them, reused for the role. */
      reuse: Partial<Record<ParentRole, string>>;
      text: string;
    }
  /** c) Neither file has the parents' names: ask for them (Statut art. 14). */
  | { kind: "ask"; text: string };

export const ALREADY_SIBLINGS = "Sunt deja frați.";
export const NAMES_DIFFER = "Numele părinților diferă pe cele două fișe. Corectați-le întâi.";
export const DIFFERENT_PARENTS = "Au părinți diferiți. Verificați întâi părinții fiecăruia.";

const childWord = (gen: string | null) => (gen === "M" ? "fiu" : gen === "F" ? "fiică" : "fiu/fiică");

/** "Ion și Ana", "Ion, Ana și Maria". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} și ${names[names.length - 1]}`;
}

/** The same name on both files (nameKey), one of them, or a conflict. */
function mergeName(a: string, b: string): string | null {
  const x = a.trim();
  const y = b.trim();
  if (x && y) return nameKey(x) === nameKey(y) ? x : null;
  return x || y;
}

/**
 * What "+ Adaugă frate / soră" does for persons `a` and `b`, with `names` = the names typed in the
 * dialog (only used when neither file has them) and `parentName` / `externals` to word the plan.
 */
export function siblingPlan(
  a: SiblingSide,
  b: SiblingSide,
  parentName: (key: string) => string,
  externals: KnownExternal[],
  names?: { tata: string; mama: string },
): SiblingPlan {
  if (a.id === b.id) return { kind: "refuse", message: "O persoană nu poate fi propriul frate." };
  if (a.parents.some((p) => b.parents.includes(p))) return { kind: "already", message: ALREADY_SIBLINGS };
  const inRegister = (s: SiblingSide) => s.parents.filter((p) => !isExternalKey(p));
  for (const [from, to] of [
    [a, b],
    [b, a],
  ] as const) {
    if (inRegister(from).length && !to.parents.length) {
      return {
        kind: "adopt",
        childId: to.id,
        parents: from.parents,
        text: `Leagă pe ${to.name} ca ${childWord(to.gen)} a lui ${joinNames(from.parents.map(parentName))}?`,
      };
    }
  }
  if (inRegister(a).length || inRegister(b).length || (a.parents.length && b.parents.length)) return { kind: "refuse", message: DIFFERENT_PARENTS };

  let tata = mergeName(a.numeTata, b.numeTata);
  let mama = mergeName(a.numeMama, b.numeMama);
  if (tata === null || mama === null) return { kind: "refuse", message: NAMES_DIFFER };
  if (!tata && !mama) {
    if (!names || !(names.tata.trim() || names.mama.trim())) return { kind: "ask", text: `Nicio fișă nu are numele părinților. Scrieți-le o dată; se completează pe fișele lui ${a.name} și ${b.name}.` };
    tata = names.tata.trim();
    mama = names.mama.trim();
  }
  const fills: { personId: string; field: "numeTata" | "numeMama"; value: string }[] = [];
  for (const s of [a, b]) {
    if (tata && !s.numeTata.trim()) fills.push({ personId: s.id, field: "numeTata", value: tata });
    if (mama && !s.numeMama.trim()) fills.push({ personId: s.id, field: "numeMama", value: mama });
  }
  // A parent outside the register already linked to one of them, with the same name, is reused (the third brother).
  const linked = new Set([...a.parents, ...b.parents]);
  const reuse: Partial<Record<ParentRole, string>> = {};
  for (const [role, name, gen] of [
    ["tata", tata, "M"],
    ["mama", mama, "F"],
  ] as const) {
    if (!name) continue;
    const ofRole = externals.filter((e) => linked.has(e.key) && e.gen === gen);
    const known = ofRole.find((e) => nameKey(e.nume) === nameKey(name));
    if (known) reuse[role] = known.key;
    else if (ofRole.length) return { kind: "refuse", message: NAMES_DIFFER };
  }
  const parents = joinNames([tata, mama].filter(Boolean));
  const who = [...new Set(fills.map((f) => (f.personId === a.id ? a.name : b.name)))];
  const what = [...new Set(fills.map((f) => `${f.field === "numeTata" ? "Numele tatălui" : "Numele mamei"} „${f.value}”`))];
  const filled = fills.length ? ` Se completează pe ${who.length === 1 ? "fișa" : "fișele"} lui ${joinNames(who)}: ${what.join(", ")}.` : "";
  return {
    kind: "names",
    tata,
    mama,
    fills,
    reuse,
    text: `${a.name} și ${b.name} devin frați, copii ai lui ${parents} (în afara registrului).${filled}`,
  };
}
