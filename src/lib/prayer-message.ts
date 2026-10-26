import { ageAt } from "./dates";
import { memberName } from "./format";
import { prayerLabel, prayerParts, type PrayerMember, type PrayerUnit } from "./prayer";

/**
 * The week's message, worded like the church's own messages:
 *   "Pace, frați și surori! Săptămâna aceasta ne vom ruga pentru familia Marin Vicențiu și Rebeca Marcu
 *    și pentru micuțul Samuel, ca Domnul să-i binecuvânteze …"
 * Variables: {parinti}, {copii} (families), {persoana}, {pe}, {ii} (a person without a family) and the
 * older {familia} (the short label). The children's first names appear only with the parents' consent;
 * otherwise "și pentru copilul / copiii lor". Never an age, a date, a phone, an address or a status.
 * Pure: the server builds the text, so the page never receives what the message leaves out.
 */

export const DEFAULT_FAMILY_MESSAGE =
  "Pace, frați și surori! Săptămâna aceasta ne vom ruga pentru familia {parinti}{copii}, ca Domnul să-i binecuvânteze cu sănătate și cu dragoste de Domnul și să le dea înțelepciune în toate. Amin.";
export const DEFAULT_PERSON_MESSAGE =
  "Pace, frați și surori! Săptămâna aceasta ne vom ruga pentru {persoana}, ca Domnul {pe} binecuvânteze cu sănătate și cu dragoste de Domnul și {ii} dea înțelepciune în toate. Amin.";
/** The first default (PRAYER-ROTATION): churches still on it move to DEFAULT_FAMILY_MESSAGE. */
export const OLD_DEFAULT_MESSAGE = "Săptămâna aceasta ne rugăm pentru {familia}. Să-i purtăm în rugăciune!";

export const FAMILY_VARIABLES = ["{parinti}", "{copii}", "{familia}"] as const;
export const PERSON_VARIABLES = ["{persoana}", "{pe}", "{ii}", "{familia}"] as const;
export const MESSAGE_TEMPLATE_MAX = 500;

/** Children's relations counted as children when the birth date is missing. */
const CHILD_RELATIONS = ["Fiu", "Fiică", "Copil", "Nepot", "Nepoată"];

/** "Ana", "Ana și Matei", "Andrei, Ana și Samuel". */
function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} și ${names.at(-1)}`;
}

/** "Popescu Ion și Maria" (same surname) / "Marin Vicențiu și Marcu Rebeca" (each keeps theirs). */
export function parentsText(parents: Pick<PrayerMember, "nume" | "prenume">[]): string {
  if (parents.length === 2 && parents[0].nume.trim() && parents[0].nume.trim() === parents[1].nume.trim()) {
    return `${parents[0].nume.trim()} ${joinNames(parents.map((p) => p.prenume.trim()).filter(Boolean))}`.trim();
  }
  return joinNames(parents.map(memberName).filter(Boolean));
}

/** The minors of the family (18+ never): a birth date under 18, or no date and a child's relation. */
function minors(children: PrayerMember[], today: string): { m: PrayerMember; age: number | null }[] {
  return children
    .map((m) => ({ m, age: m.dataNasterii ? ageAt(m.dataNasterii, today) : null }))
    .filter(({ m, age }) => (age === null ? CHILD_RELATIONS.includes(m.rudenie) : age < 18));
}

/**
 * " și pentru micuțul Samuel" / " și pentru fiica lor, Maria" / " și pentru copiii lor, Andrei, Ana și
 * Samuel"; without consent " și pentru copilul lor" / " și pentru copiii lor" (a single parent: ei / lui).
 * Empty without minors.
 */
export function childrenText(parents: Pick<PrayerMember, "gen">[], kids: { m: Pick<PrayerMember, "prenume" | "gen">; age: number | null }[], consent: boolean): string {
  if (!kids.length) return "";
  const single = parents.length === 1;
  const own = single ? (parents[0].gen === "F" ? "ei" : parents[0].gen === "M" ? "lui" : null) : "lor";
  const of = (lor: string, sau: string) => (own ? `${lor} ${own}` : sau);
  if (!consent) return kids.length === 1 ? ` și pentru ${of("copilul", "copilul său")}` : ` și pentru ${of("copiii", "copiii săi")}`;
  if (kids.length > 1) return ` și pentru ${of("copiii", "copiii săi")}, ${joinNames(kids.map((k) => k.m.prenume.trim()))}`;
  const [{ m, age }] = kids;
  const name = m.prenume.trim();
  if (age !== null && m.gen && age < 13) return ` și pentru ${m.gen === "F" ? "micuța" : "micuțul"} ${name}`;
  if (age !== null && m.gen) return ` și pentru ${m.gen === "F" ? of("fiica", "fiica sa") : of("fiul", "fiul său")}, ${name}`;
  return ` și pentru ${of("copilul", "copilul său")}, ${name}`;
}

/** "fratele Ion Pop" / "sora Ana Pop" / "fratele/sora Ion Pop", the name as in the register. */
export function personText(p: Pick<PrayerMember, "nume" | "prenume" | "gen">): string {
  const title = p.gen === "M" ? "fratele" : p.gen === "F" ? "sora" : "fratele/sora";
  return `${title} ${memberName(p)}`;
}

/** No double spaces, no " ,", no space before a full stop. */
function tidy(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1").trim();
}

/** The message for a unit in the rotation (a family, or "p:<id>" for a person without a family). */
export function prayerMessageFor(u: PrayerUnit, today: string, templates: { family: string; person: string }): string {
  const isPerson = u.key.startsWith("p:");
  const { parents, children } = prayerParts(u, today);
  const vars: Record<string, string> = { "{familia}": prayerLabel(u, today) };
  if (isPerson) {
    const p = parents[0] ?? u.members[0];
    vars["{persoana}"] = p ? personText(p) : "";
    vars["{pe}"] = p?.gen === "F" ? "s-o" : p?.gen === "M" ? "să-l" : "să-l/s-o";
    vars["{ii}"] = "să-i";
  } else {
    vars["{parinti}"] = parentsText(parents);
    vars["{copii}"] = childrenText(parents, minors(children, today), u.includeChildren);
  }
  const template = (isPerson ? templates.person : templates.family).trim() || (isPerson ? DEFAULT_PERSON_MESSAGE : DEFAULT_FAMILY_MESSAGE);
  return tidy(Object.entries(vars).reduce((t, [k, v]) => t.split(k).join(v), template));
}

/** Why a template is refused (server and live check in Setări). */
export function templateError(template: string, kind: "family" | "person"): string | null {
  const t = template.trim();
  if (!t) return null;
  if (t.length > MESSAGE_TEMPLATE_MAX) return `Mesajul poate avea cel mult ${MESSAGE_TEMPLATE_MAX} de caractere.`;
  const allowed: readonly string[] = kind === "family" ? FAMILY_VARIABLES : PERSON_VARIABLES;
  const unknown = (t.match(/\{[^}]*\}/g) ?? []).find((v) => !allowed.includes(v));
  if (unknown) return `Variabila ${unknown} nu este permisă aici. Folosiți ${allowed.join(", ")}.`;
  if (kind === "family" && !t.includes("{parinti}") && !t.includes("{familia}")) return "Mesajul pentru familii trebuie să conțină {parinti} (sau {familia}).";
  if (kind === "person" && !t.includes("{persoana}")) return "Mesajul pentru o persoană singură trebuie să conțină {persoana}.";
  return null;
}
