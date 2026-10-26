import { addDays, ageAt, dotDateTime } from "./dates";
import { ANONYMOUS_NAME } from "./anonymous";
import { compareRo } from "./text";
import { CHILD_RELATIONS, familyParents, SPOUSE_RELATIONS } from "./kinship";

/**
 * The weekly prayer for families: who is in the rotation, in what order, and the only text shown
 * about them ("Familia Popescu: Ion și Maria", the children's first names only with the parents'
 * consent). Pure. The data it receives are already reduced to what it needs (src/server/queries/prayer.ts).
 */

/** The statuses of an active adult (Statut art. 28); Fost membru and anyone with an exit (death included) are out. */
export const PRAYER_STATUSES = ["MEMBRU", "APARTINATOR", "BOTEZAT_FARA_TRANSFER", "PRIETEN"] as const;
/** Who counts as a parent in the family's line: the head and the spouse. */
export const PRAYER_PARENT_RELATIONS = ["Cap de familie", "Soț", "Soție"];
/** A spouse is always a parent in the message (whatever the birth date says); the rule is shared with KINSHIP. */
export const PRAYER_SPOUSE_RELATIONS = SPOUSE_RELATIONS;
/** Only these relations can make a member a child of the family (and only while a minor or without a birth date). */
export const PRAYER_CHILD_RELATIONS = CHILD_RELATIONS;

/** The week's message as edited on /rugaciune before sending (never stored on the server). */
export const PRAYER_SHARE_MAX = 1000;
export const PRAYER_SHARE_HINT = "Nu scrieți probleme de sănătate sau alte detalii personale fără acordul familiei.";

/** "Trimite pe WhatsApp": no phone number, so the user picks the group. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The children's consent, the same words on the family card, in the campaign and on the paper form. */
export const PRAYER_CHILDREN_LABEL = "Copiii pot fi pomeniți cu numele";
export const PRAYER_CHILDREN_HELP = "Altfel, mesajul spune doar „și pentru copiii lor”.";

export const PRAYER_SOURCE_LABEL = { CAMPANIE: "campania de actualizare a datelor", HARTIE: "formular pe hârtie", SECRETARIAT: "secretariat" } as const;
export type PrayerSourceKey = keyof typeof PRAYER_SOURCE_LABEL;

export interface PrayerMember {
  id: string;
  nume: string;
  prenume: string;
  statut: string;
  /** ISO; only to tell adults from minors (never shown). */
  dataNasterii: string | null;
  dataIesire: string | null;
  rudenie: string;
  /** "M" / "F" / null: only for the message's wording ("micuțul / micuța", "fratele / sora"). */
  gen?: string | null;
  /** ISO; only to tell whether the head is married (never shown). */
  dataCasatoriei?: string | null;
}

/** A family, or a person without a family ("p:<id>"), with its prayer settings and last announcement. */
export interface PrayerUnit {
  key: string;
  headId: string | null;
  members: PrayerMember[];
  optOut: boolean;
  includeChildren: boolean;
  /** Monday of the last week it was announced, or null. */
  lastWeek: string | null;
}

const active = (m: PrayerMember) => (PRAYER_STATUSES as readonly string[]).includes(m.statut) && !m.dataIesire && m.nume !== ANONYMOUS_NAME;
const adult = (m: PrayerMember, today: string) => !m.dataNasterii || ageAt(m.dataNasterii, today) >= 18;
const isSpouse = (m: PrayerMember) => PRAYER_SPOUSE_RELATIONS.includes(m.rudenie.trim());
const hasChildRelation = (m: PrayerMember) => PRAYER_CHILD_RELATIONS.includes(m.rudenie.trim());

/** A child of the family: a child's relation AND a minor by the birth date (or no birth date). */
export function isPrayerChild(m: PrayerMember, today: string): boolean {
  return hasChildRelation(m) && (!m.dataNasterii || ageAt(m.dataNasterii, today) < 18);
}

/** At least one active adult and no objection. */
export function inRotation(u: PrayerUnit, today: string): boolean {
  return !u.optOut && u.members.some((m) => active(m) && adult(m, today));
}

/** "Ion", "Ion și Maria", "Ana, Matei și Ioan". */
function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} și ${names.at(-1)}`;
}

/**
 * Who the message names, from the active members:
 * - the head, and every member with the relation Soț / Soție (always a parent, even with a wrong
 *   birth date);
 * - when the head has a marriage date and no member is Soț / Soție: the one adult without a child's
 *   relation (and not the head's parent) is taken as the spouse; with several such adults none is;
 * - children: only a child's relation (Fiu, Fiică, Copil, Nepot, Nepoată) and a minor or no birth date.
 * Anyone else is left out of the message (familyRelationIssues says why, for the secretariat).
 */
export function prayerParts(u: PrayerUnit, today: string): { parents: PrayerMember[]; children: PrayerMember[] } {
  const live = u.members.filter(active);
  let parents = familyParents(live, u.headId, today);
  // A person without a family, or a family whose head left: the active adults who are not children.
  if (!parents.length) parents = live.filter((m) => adult(m, today) && !hasChildRelation(m));
  return { parents, children: live.filter((m) => !parents.includes(m) && isPrayerChild(m, today)) };
}

/**
 * Why a family's relations need checking (secretariat only, never the "Rugăciune" role): nothing is
 * changed automatically. Empty when the relations are consistent.
 */
export function familyRelationIssues(u: PrayerUnit, today: string): string[] {
  const live = u.members.filter(active);
  const head = live.find((m) => m.id === u.headId);
  const spouses = live.filter((m) => m !== head && isSpouse(m));
  const name = (m: PrayerMember) => `${m.nume.trim()} ${m.prenume.trim()}`.trim();
  const out: string[] = [];
  for (const m of live) {
    if (m === head) continue;
    if (!m.rudenie.trim()) out.push(`${name(m)}: membru fără rudenie`);
    else if (hasChildRelation(m) && adult(m, today) && m.dataCasatoriei) out.push(`${name(m)}: adult cu rudenia „${m.rudenie.trim()}”, dar cu dată de căsătorie`);
    else if (isSpouse(m) && !adult(m, today)) out.push(`${name(m)}: „${m.rudenie.trim()}” sub 18 ani`);
  }
  if (head?.dataCasatoriei && !spouses.length) out.push("Capul familiei are dată de căsătorie, dar familia nu are soț / soție");
  if (spouses.length > 1) out.push(`Doi membri cu rudenia Soț / Soție: ${spouses.map(name).join(", ")}`);
  return out;
}

/**
 * "Familia Popescu: Ion și Maria" (+ ", cu copiii Ana și Matei" only with includeChildren). Nothing
 * else: no ages, dates, status, roles or contact data.
 */
export function prayerLabel(u: PrayerUnit, today: string): string {
  const { parents, children } = prayerParts(u, today);
  const surname = (parents[0] ?? u.members[0])?.nume.trim() ?? "";
  const first = (ms: PrayerMember[]) => joinNames(ms.map((m) => m.prenume.trim()).filter(Boolean));
  const kids = u.includeChildren && children.length ? `, cu ${children.length === 1 ? "copilul" : "copiii"} ${first(children)}` : "";
  const names = first(parents);
  return `Familia ${surname}${names ? `: ${names}` : ""}${kids}`;
}

/** The rotation: never announced first, then the longest ago; ties alphabetically by the shown name. */
export function prayerRotation(units: PrayerUnit[], today: string): { key: string; label: string }[] {
  return units
    .filter((u) => inRotation(u, today))
    .map((u) => ({ key: u.key, label: prayerLabel(u, today), last: u.lastWeek }))
    .sort((a, b) => (a.last === b.last ? compareRo(a.label, b.label) : a.last === null ? -1 : b.last === null ? 1 : a.last < b.last ? -1 : 1))
    .map(({ key, label }) => ({ key, label }));
}

/** The place in the rotation as shown in "Toate familiile": "Urmează", "a 2-a", "a 3-a" … */
export function rotationOrderLabel(index: number): string {
  return index === 0 ? "Urmează" : `a ${index + 1}-a`;
}

/** Monday of the week holding `iso`. */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((d + 6) % 7));
}

/** The unit key of a family or a person: "f:<id>" / "p:<id>". */
export const prayerKey = (kind: "f" | "p", id: string) => `${kind}:${id}`;
export function parsePrayerKey(key: string): { familyId: string } | { personId: string } | null {
  const m = /^([fp]):([A-Za-z0-9_-]{1,64})$/.exec(key);
  if (!m) return null;
  return m[1] === "f" ? { familyId: m[2] } : { personId: m[2] };
}

/** "12.10.2026, 10:30 · formular pe hârtie" for the family / person card; null when never changed. */
export function prayerChangeText(at: Date | null, source: PrayerSourceKey | null): string | null {
  return at ? `${dotDateTime(at)}${source ? ` · ${PRAYER_SOURCE_LABEL[source]}` : ""}` : null;
}

/** An adult's answer in the data-update campaign: the objection and the children's consent. */
export interface PrayerAnswer {
  optOut: boolean;
  includeChildren: boolean;
}

/** Who answers for the family in the campaign: its head or a spouse, or an adult without a family. */
export function answersForFamily(a: { id: string; familyId: string | null; rudenie: string; family: { headId: string | null } | null }): boolean {
  return !a.familyId || a.family?.headId === a.id || a.rudenie === "Soț" || a.rudenie === "Soție";
}

/**
 * The parents' answers together, the more restrictive winning: one objection is enough to leave the
 * family out, and the children are named only when every parent who answered agreed.
 */
export function restrictivePrayer(answers: Partial<PrayerAnswer>[]): Partial<PrayerAnswer> {
  const opt = answers.map((a) => a.optOut).filter((v): v is boolean => v !== undefined);
  const kids = answers.map((a) => a.includeChildren).filter((v): v is boolean => v !== undefined);
  return {
    ...(opt.length ? { optOut: opt.some(Boolean) } : {}),
    ...(kids.length ? { includeChildren: kids.every(Boolean) } : {}),
  };
}

export const PRAYER_FIELD_LABEL = {
  optOut: "Rugăciunea săptămânală: nu doresc ca familia să fie pomenită",
  includeChildren: "Rugăciunea săptămânală: copiii pot fi pomeniți cu numele",
} as const;
