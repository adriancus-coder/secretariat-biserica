import { roleKey } from "./roles";

/*
 * EVENT-FIELDS-BY-TYPE: which fields the event form shows for each type of the events nomenclature.
 * Title, type and date are always there, and so is „Alt loc decât biserica” (an empty place = at the
 * church). A type not listed here (a church's own type) shows every field. A field the type hides is
 * still shown when the saved event has a value in it, so nothing is lost. Pure.
 */

/** `persoane`: the family and persons of EVENT-PERSONS (for the other types, the optional family). */
export type EventField = "persoane" | "ora" | "invitat" | "responsabil" | "oficiant" | "descriere" | "agapa";

export const ALL_EVENT_FIELDS: readonly EventField[] = ["persoane", "ora", "invitat", "responsabil", "oficiant", "descriere", "agapa"];

const CEREMONY: readonly EventField[] = ["persoane", "ora", "oficiant", "descriere"];
const WITH_SPEAKERS: readonly EventField[] = ["ora", "invitat", "responsabil", "descriere", "agapa"];
const MEAL: readonly EventField[] = ["ora", "responsabil", "agapa"];

/** The configuration, by type name (compared with roleKey: case and diacritics ignored). */
export const EVENT_TYPE_FIELDS: Readonly<Record<string, readonly EventField[]>> = {
  "Binecuvântare copil": CEREMONY,
  Botez: CEREMONY,
  Nuntă: [...CEREMONY, "agapa"],
  Înmormântare: CEREMONY,
  "Cina Domnului": ["ora", "oficiant"],
  Evanghelizare: WITH_SPEAKERS,
  Conferință: WITH_SPEAKERS,
  Concert: WITH_SPEAKERS,
  "Serviciu special": WITH_SPEAKERS,
  Agapă: MEAL,
  "Masă comună": MEAL,
  // Default types without a narrower list: every field, as before.
  "Serviciu divin": ALL_EVENT_FIELDS,
  Ordinare: ALL_EVENT_FIELDS,
  Tineret: ALL_EVENT_FIELDS,
  Altele: ALL_EVENT_FIELDS,
};

/** The fields a type shows; every field for a type the configuration does not know. */
export function eventFieldsFor(tip: string): readonly EventField[] {
  const key = roleKey(tip);
  const hit = Object.entries(EVENT_TYPE_FIELDS).find(([t]) => roleKey(t) === key);
  return hit ? hit[1] : ALL_EVENT_FIELDS;
}

export interface EventFieldValues {
  ora?: string | null;
  invitat?: string | null;
  responsabil?: string | null;
  oficiant?: string | null;
  descriere?: string | null;
  agapaActiva?: boolean;
  agapaResponsabil?: string | null;
  agapaPersoane?: number | string | null;
  contributii?: number;
  familyId?: string | null;
  persoane?: number;
}

/** A field holding a saved value. */
export function eventFieldHasValue(f: EventField, v: EventFieldValues): boolean {
  switch (f) {
    case "persoane":
      return Boolean(v.familyId) || (v.persoane ?? 0) > 0;
    case "agapa":
      return Boolean(v.agapaActiva || v.agapaResponsabil || (v.agapaPersoane !== null && v.agapaPersoane !== undefined && v.agapaPersoane !== "") || (v.contributii ?? 0) > 0);
    default:
      return Boolean(v[f]?.trim());
  }
}

/** The fields the form shows: the type's, plus every field the saved event has a value in. */
export function visibleEventFields(tip: string, saved: EventFieldValues): Set<EventField> {
  const shown = new Set(eventFieldsFor(tip));
  for (const f of ALL_EVENT_FIELDS) if (eventFieldHasValue(f, saved)) shown.add(f);
  return shown;
}

/** The place as shown: the typed one, or „la biserică” (with the church's address where useful). */
export const AT_CHURCH = "la biserică";
export function eventPlace(loc: string, churchAddress = ""): string {
  return loc.trim() || (churchAddress ? `${AT_CHURCH}, ${churchAddress}` : AT_CHURCH);
}
