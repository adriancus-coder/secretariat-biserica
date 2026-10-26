import { addDays, ageAt, dotDateTime } from "./dates";
import { ANONYMOUS_NAME } from "./anonymous";
import { compareRo } from "./text";

/**
 * The weekly prayer for families: who is in the rotation, in what order, and the only text shown
 * about them ("Familia Popescu: Ion și Maria", the children's first names only with the parents'
 * consent). Pure. The data it receives are already reduced to what it needs (src/server/queries/prayer.ts).
 */

/** The statuses of an active adult (Statut art. 28); Fost membru and anyone with an exit (death included) are out. */
export const PRAYER_STATUSES = ["MEMBRU", "APARTINATOR", "BOTEZAT_FARA_TRANSFER", "PRIETEN"] as const;
/** Who counts as a parent in the family's line: the head and the spouse. */
export const PRAYER_PARENT_RELATIONS = ["Cap de familie", "Soț", "Soție"];

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

/** At least one active adult and no objection. */
export function inRotation(u: PrayerUnit, today: string): boolean {
  return !u.optOut && u.members.some((m) => active(m) && adult(m, today));
}

/** "Ion", "Ion și Maria", "Ana, Matei și Ioan". */
function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} și ${names.at(-1)}`;
}

/** The parents (head and spouse, else the active adults) and the other active members. */
export function prayerParts(u: PrayerUnit, today: string): { parents: PrayerMember[]; children: PrayerMember[] } {
  const live = u.members.filter(active);
  const isParent = (m: PrayerMember) => adult(m, today) && (m.id === u.headId || PRAYER_PARENT_RELATIONS.includes(m.rudenie));
  let parents = live.filter(isParent);
  if (!parents.length) parents = live.filter((m) => adult(m, today));
  const head = parents.find((m) => m.id === u.headId) ?? parents[0];
  parents = head ? [head, ...parents.filter((m) => m !== head)] : parents;
  return { parents, children: live.filter((m) => !parents.includes(m)) };
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
