/** The secretary's review of a data-update submission: what changes against the register. Pure. */
import { fmt } from "./format";
import { PRAYER_FIELD_LABEL, type PrayerAnswer } from "./prayer";
import { GENDER_LABEL, type GenderKey } from "./labels";
import { unmarriedLabel } from "./marital";
import { CHILD_FIELDS, CHILD_LABEL, SELF_FIELDS, SELF_LABEL, type ChildData, type ChildField, type SelfData, type SelfField } from "./schemas/data-update";

export interface FieldChange<F extends string> {
  field: F;
  label: string;
  before: string;
  after: string;
}

const DATE_FIELDS = new Set(["dataNasterii", "dataCasatoriei", "dataBotez", "dataBinecuvantare"]);
const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** A value as shown to the secretary (dates as "1 mai 2015", gender as its label). */
export function displayValue(field: string, v: unknown): string {
  const s = norm(v);
  if (!s) return "—";
  if (DATE_FIELDS.has(field)) return fmt(s);
  if (field === "gen") return GENDER_LABEL[s as GenderKey] ?? s;
  return s;
}

/** The person's own fields that differ (spaces at the ends ignored). */
export function selfChanges(register: Partial<SelfData> | null, proposed: SelfData): FieldChange<SelfField>[] {
  // The marriage date and "Necăsătorit(ă)" are one row: "Data căsătoriei: 11 iun 2005 → Necăsătorit(ă)".
  const marital = (s: Partial<SelfData> | null) => (s?.necasatorit ? "necasatorit" : norm(s?.dataCasatoriei));
  const maritalShown = (s: Partial<SelfData> | null) => (s?.necasatorit ? unmarriedLabel(proposed.gen) : displayValue("dataCasatoriei", s?.dataCasatoriei));
  return SELF_FIELDS.filter((f) => (f === "dataCasatoriei" ? marital(register) !== marital(proposed) : norm(register?.[f]) !== norm(proposed[f]))).map((f) => ({
    field: f,
    label: SELF_LABEL[f],
    before: f === "dataCasatoriei" ? maritalShown(register) : displayValue(f, register?.[f]),
    after: f === "dataCasatoriei" ? maritalShown(proposed) : displayValue(f, proposed[f]),
  }));
}

export function childChanges(register: Partial<Omit<ChildData, "consents">>, proposed: Omit<ChildData, "consents">): FieldChange<ChildField>[] {
  return CHILD_FIELDS.filter((f) => norm(register[f]) !== norm(proposed[f])).map((f) => ({
    field: f,
    label: CHILD_LABEL[f],
    before: displayValue(f, register[f]),
    after: displayValue(f, proposed[f]),
  }));
}

/** The prayer answers that differ from the family's (or the person's) current choice. */
export function prayerChanges(current: PrayerAnswer, proposed: PrayerAnswer | undefined): FieldChange<keyof PrayerAnswer>[] {
  if (!proposed) return [];
  const yes = (b: boolean) => (b ? "Da" : "Nu");
  return (["optOut", "includeChildren"] as const)
    .filter((f) => current[f] !== proposed[f])
    .map((f) => ({ field: f, label: PRAYER_FIELD_LABEL[f], before: yes(current[f]), after: yes(proposed[f]) }));
}

/** The decision's status: everything accepted, part of it, or (rejected) nothing. */
export function decisionStatus(total: number, accepted: number): "ACCEPTED" | "PARTIAL" {
  return accepted >= total ? "ACCEPTED" : "PARTIAL";
}
