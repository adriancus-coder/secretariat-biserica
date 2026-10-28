import { ageAt } from "./dates";
import { fmt, memberName } from "./format";
import { STATUS_LABEL } from "./labels";
import { roleKey } from "./roles";

/*
 * EVENT-PERSONS: the persons a calendar event is about, by the event's type, and the register changes the
 * event proposes once it has taken place („Trece în registru”). Nothing is written without „Aplică
 * selecția”; a field already filled with another value is proposed unticked. Pure.
 */

export type EventPersonRole = "COPIL" | "BOTEZAT" | "MIRE" | "MIREASA" | "DECEDAT";
export type EventKind = "binecuvantare" | "botez" | "nunta" | "inmormantare";

export const EVENT_ROLE_LABEL: Record<EventPersonRole, string> = { COPIL: "Copil", BOTEZAT: "Botezat", MIRE: "Mirele", MIREASA: "Mireasa", DECEDAT: "Decedatul" };

const KINDS: [EventKind, string][] = [
  ["binecuvantare", "Binecuvântare copil"],
  ["botez", "Botez"],
  ["nunta", "Nuntă"],
  ["inmormantare", "Înmormântare"],
];

/** The kind of an event type (case and diacritics ignored), or null for the other types (only „Familia”, optional). */
export function eventKind(tip: string): EventKind | null {
  return KINDS.find(([, t]) => roleKey(t) === roleKey(tip))?.[0] ?? null;
}

/** The roles the form asks for, by kind. */
export const KIND_ROLES: Record<EventKind, EventPersonRole[]> = {
  binecuvantare: ["COPIL"],
  botez: ["BOTEZAT"],
  nunta: ["MIRE", "MIREASA"],
  inmormantare: ["DECEDAT"],
};

export interface EventPersonInput {
  personId: string | null;
  numeLiber: string;
  rol: EventPersonRole;
}

/**
 * The form's persons, checked: the roles of the kind only, a free name only for the bride and groom,
 * nobody twice, at least one child for a blessing, the children in the chosen family. Returns the
 * error, or null.
 */
export function eventPersonsError(kind: EventKind | null, persons: EventPersonInput[], familyOf: (personId: string) => string | null, familyId: string | null): string | null {
  const allowed = kind ? KIND_ROLES[kind] : [];
  if (persons.some((p) => !allowed.includes(p.rol))) return "Persoanele nu se potrivesc cu tipul evenimentului.";
  if (persons.some((p) => p.numeLiber && (p.personId || (p.rol !== "MIRE" && p.rol !== "MIREASA")))) return "Un nume scris liber se poate trece doar la miri.";
  if (persons.some((p) => !p.personId && !p.numeLiber.trim())) return "Alegeți persoana din registru.";
  const ids = persons.map((p) => p.personId).filter((x): x is string => Boolean(x));
  if (new Set(ids).size !== ids.length) return "O persoană a fost aleasă de două ori.";
  if (kind === "binecuvantare") {
    if (!persons.length) return "Alegeți cel puțin un copil.";
    if (familyId && persons.some((p) => p.personId && familyOf(p.personId) !== familyId)) return "Copiii aleși trebuie să fie în familia aleasă.";
  }
  if (kind === "nunta" && persons.filter((p) => p.rol === "MIRE").length > 1) return "Un singur mire.";
  if (kind === "nunta" && persons.filter((p) => p.rol === "MIREASA").length > 1) return "O singură mireasă.";
  if (kind === "inmormantare" && persons.length > 1) return "Un singur decedat.";
  return null;
}

/** „Binecuvântarea copilului Ana, familia Pop”, or with several children „copiilor Ana și Ion”. */
export function suggestedTitle(kind: EventKind | null, names: { prenume: string; nume: string }[], familyName: string): string {
  const first = names.map((n) => n.prenume || n.nume).filter(Boolean);
  const list = first.length > 1 ? `${first.slice(0, -1).join(", ")} și ${first[first.length - 1]}` : (first[0] ?? "");
  const fam = familyName.replace(/^Fam\.\s*/, "");
  switch (kind) {
    case "binecuvantare":
      return list ? `Binecuvântarea ${first.length > 1 ? "copiilor" : "copilului"} ${list}${fam ? `, familia ${fam}` : ""}` : "";
    case "botez":
      return list ? `Botezul lui ${list}` : "";
    case "nunta":
      return first.length === 2 ? `Nunta lui ${first[0]} și ${first[1]}` : "";
    case "inmormantare":
      return names[0] ? `Înmormântarea lui ${memberName(names[0])}` : "";
    default:
      return "";
  }
}

export interface FamilyMemberLite {
  id: string;
  nume: string;
  prenume: string;
  dataNasterii: string | null;
}

/** The family's minors (an unknown birth date counts as a child too), those under 2 first, then the youngest first. */
export function familyMinors<T extends FamilyMemberLite>(members: T[], today: string): T[] {
  const age = (m: T) => (m.dataNasterii ? ageAt(m.dataNasterii, today) : null);
  return members
    .filter((m) => {
      const a = age(m);
      return a === null || a < 18;
    })
    .sort((x, y) => {
      const ax = age(x) ?? 99;
      const ay = age(y) ?? 99;
      const under2 = Number(ay < 2) - Number(ax < 2);
      return under2 || (y.dataNasterii ?? "").localeCompare(x.dataNasterii ?? "");
    });
}

/** The register's current values of a person the proposals look at. */
export interface RegisterPerson {
  id: string;
  nume: string;
  prenume: string;
  statut: string;
  dataNasterii: string | null;
  dataBinecuvantare: string | null;
  dataBotez: string | null;
  botezBiserica: string;
  botezLocalitate: string;
  botezOficiant: string;
  dataMembru: string | null;
  dataCasatoriei: string | null;
  necasatorit: boolean;
  dataIesire: string | null;
  modIesire: string | null;
}

export interface RegisterChange {
  /** "<personId>:<field>": the checkbox's value. */
  key: string;
  personId: string;
  person: string;
  field: "dataBinecuvantare" | "dataBotez" | "botezBiserica" | "botezLocalitate" | "botezOficiant" | "statut" | "dataCasatoriei" | "deces";
  label: string;
  current: string;
  proposed: string;
  /** Ticked by default: an empty field; a field holding another value (or a minor's membership) is not. */
  checked: boolean;
}

const show = (v: string | null | undefined) => (v ? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt(v) : v) : "—");

/**
 * The register changes an event proposes for its persons in the register (already equal values are not
 * proposed). `church` gives the baptism's church and locality, `oficiant` the event's officiant.
 */
export function registerChanges(
  kind: EventKind | null,
  event: { data: string; oficiant: string },
  persons: { rol: EventPersonRole; person: RegisterPerson | null }[],
  church: { nume: string; localitate: string },
): RegisterChange[] {
  const out: RegisterChange[] = [];
  const add = (p: RegisterPerson, field: RegisterChange["field"], label: string, current: string | null, proposed: string, opts: { checked?: boolean; same?: boolean } = {}) => {
    if (!proposed || opts.same || current === proposed) return;
    out.push({ key: `${p.id}:${field}`, personId: p.id, person: memberName(p), field, label, current: show(current), proposed: show(proposed), checked: opts.checked ?? !current });
  };
  for (const { rol, person: p } of persons) {
    if (!p) continue;
    if (kind === "binecuvantare" && rol === "COPIL") add(p, "dataBinecuvantare", "Data binecuvântării", p.dataBinecuvantare, event.data);
    if (kind === "botez" && rol === "BOTEZAT") {
      add(p, "dataBotez", "Data botezului", p.dataBotez, event.data);
      add(p, "botezBiserica", "Biserica botezului", p.botezBiserica, church.nume);
      add(p, "botezLocalitate", "Localitatea botezului", p.botezLocalitate, church.localitate);
      add(p, "botezOficiant", "Oficiat de", p.botezOficiant, event.oficiant);
      // Statut art. 22 alin. 3: a member from the baptism's date; never ticked for a minor.
      const minor = p.dataNasterii ? ageAt(p.dataNasterii, event.data) < 18 : false;
      if (p.statut !== "MEMBRU")
        out.push({ key: `${p.id}:statut`, personId: p.id, person: memberName(p), field: "statut", label: "Statut", current: show(statusText(p.statut)), proposed: `Membru de la ${fmt(event.data)} (Statut art. 22 alin. 3)`, checked: !minor });
    }
    if (kind === "nunta" && (rol === "MIRE" || rol === "MIREASA")) add(p, "dataCasatoriei", "Data căsătoriei", p.necasatorit && !p.dataCasatoriei ? "Necăsătorit(ă)" : p.dataCasatoriei, event.data, { checked: !p.dataCasatoriei });
    if (kind === "inmormantare" && rol === "DECEDAT") {
      const current = p.dataIesire ? `${fmt(p.dataIesire)}${p.modIesire === "DECES" ? " (deces)" : ""}` : null;
      if (!(p.dataIesire === event.data && p.modIesire === "DECES"))
        out.push({ key: `${p.id}:deces`, personId: p.id, person: memberName(p), field: "deces", label: "Ieșire din evidență", current: current ?? "—", proposed: `Decedat(ă) la ${fmt(event.data)}`, checked: !p.dataIesire });
    }
  }
  return out;
}

const statusText = (s: string) => (STATUS_LABEL as Record<string, string>)[s] ?? s;

/** The person's columns a chosen change writes (dates as ISO strings; the caller converts them). */
export function changeData(c: Pick<RegisterChange, "field">, event: { data: string; oficiant: string }, church: { nume: string; localitate: string }): Record<string, string | number | boolean | null> {
  switch (c.field) {
    case "dataBinecuvantare":
      return { dataBinecuvantare: event.data };
    case "dataBotez":
      return { dataBotez: event.data, botezAn: Number(event.data.slice(0, 4)) };
    case "botezBiserica":
      return { botezBiserica: church.nume };
    case "botezLocalitate":
      return { botezLocalitate: church.localitate };
    case "botezOficiant":
      return { botezOficiant: event.oficiant };
    case "statut":
      return { statut: "MEMBRU", dataMembru: event.data, modIntrare: "BOTEZ" };
    case "dataCasatoriei":
      return { dataCasatoriei: event.data, necasatorit: false };
    case "deces":
      return { dataIesire: event.data, modIesire: "DECES" };
  }
}

/** The events waiting on Acasă: taken place, with persons in the register not yet applied, not ignored. */
export function waitsForRegister(e: { data: string; registruIgnoratLa: unknown; persoane: { personId: string | null; aplicatInRegistruLa: unknown }[] }, today: string): boolean {
  return e.data <= today && !e.registruIgnoratLa && e.persoane.some((p) => p.personId && !p.aplicatInRegistruLa);
}
