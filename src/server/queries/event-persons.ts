import "server-only";
import { fromDbDate, todayIso } from "@/lib/dates";
import { eventKind, registerChanges, waitsForRegister, type EventPersonRole, type RegisterChange, type RegisterPerson } from "@/lib/event-persons";
import { isChurchFamily } from "@/lib/families";
import { memberName } from "@/lib/format";
import { familyParents } from "@/lib/kinship";
import { compareRo } from "@/lib/text";
import type { Ctx } from "../session";
import { getChurch } from "./church";

/*
 * EVENT-PERSONS: what the event form, the event page, Acasă and the person / family pages read. Every read
 * goes through the church's scoped client.
 */

export interface EventFamilyOption {
  id: string;
  name: string;
  /** A family of the church (at least one active member): listed first. */
  church: boolean;
  parents: string[];
  members: { id: string; nume: string; prenume: string; dataNasterii: string | null; gen: string | null }[];
}
export interface EventPersonOption {
  id: string;
  name: string;
  nume: string;
  prenume: string;
  familyId: string | null;
  dataNasterii: string | null;
  gen: string | null;
}

/** The families (with their members and parents) and the persons the event form offers. */
export async function eventFormOptions(ctx: Ctx): Promise<{ families: EventFamilyOption[]; persons: EventPersonOption[] }> {
  const today = todayIso();
  const [families, persons] = await Promise.all([
    ctx.db.family.findMany({
      select: {
        id: true,
        nume: true,
        headId: true,
        members: { where: { nume: { not: "Persoană ștearsă" } }, select: { id: true, nume: true, prenume: true, statut: true, dataIesire: true, dataNasterii: true, gen: true, rudenie: true, dataCasatoriei: true } },
      },
    }),
    ctx.db.person.findMany({
      where: { nume: { not: "Persoană ștearsă" } },
      orderBy: [{ sortKey: "asc" }, { id: "asc" }],
      select: { id: true, nume: true, prenume: true, familyId: true, dataNasterii: true, gen: true },
    }),
  ]);
  return {
    families: families
      .map((f) => {
        const members = f.members.map((m) => ({ ...m, dataNasterii: fromDbDate(m.dataNasterii), dataCasatoriei: fromDbDate(m.dataCasatoriei) }));
        return {
          id: f.id,
          name: f.nume,
          church: isChurchFamily(f.members),
          parents: familyParents(members, f.headId, today).map(memberName),
          members: members.map((m) => ({ id: m.id, nume: m.nume, prenume: m.prenume, dataNasterii: m.dataNasterii, gen: m.gen })),
        };
      })
      .sort((a, b) => Number(b.church) - Number(a.church) || compareRo(a.name, b.name)),
    persons: persons.map((p) => ({ id: p.id, name: memberName(p), nume: p.nume, prenume: p.prenume, familyId: p.familyId, dataNasterii: fromDbDate(p.dataNasterii), gen: p.gen })),
  };
}

const REGISTER_SELECT = {
  id: true,
  nume: true,
  prenume: true,
  statut: true,
  dataNasterii: true,
  dataBinecuvantare: true,
  dataBotez: true,
  botezBiserica: true,
  botezLocalitate: true,
  botezOficiant: true,
  dataMembru: true,
  dataCasatoriei: true,
  necasatorit: true,
  dataIesire: true,
  modIesire: true,
} as const;

export function toRegisterPerson(p: {
  id: string;
  nume: string;
  prenume: string;
  statut: string;
  dataNasterii: Date | null;
  dataBinecuvantare: Date | null;
  dataBotez: Date | null;
  botezBiserica: string;
  botezLocalitate: string;
  botezOficiant: string;
  dataMembru: Date | null;
  dataCasatoriei: Date | null;
  necasatorit: boolean;
  dataIesire: Date | null;
  modIesire: string | null;
}): RegisterPerson {
  return {
    ...p,
    dataNasterii: fromDbDate(p.dataNasterii),
    dataBinecuvantare: fromDbDate(p.dataBinecuvantare),
    dataBotez: fromDbDate(p.dataBotez),
    dataMembru: fromDbDate(p.dataMembru),
    dataCasatoriei: fromDbDate(p.dataCasatoriei),
    dataIesire: fromDbDate(p.dataIesire),
  };
}

/** An event with its persons (as the page shows them) and the register changes it proposes. */
export async function eventWithPersons(ctx: Ctx, id: string) {
  const e = await ctx.db.event.findUnique({
    where: { id },
    select: {
      id: true,
      titlu: true,
      tip: true,
      data: true,
      oficiant: true,
      registruIgnoratLa: true,
      family: { select: { id: true, nume: true } },
      persoane: { orderBy: { ordine: "asc" }, select: { id: true, rol: true, numeLiber: true, aplicatInRegistruLa: true, person: { select: { ...REGISTER_SELECT, familyId: true, gen: true } } } },
    },
  });
  if (!e) return null;
  const church = await getChurch(ctx);
  const data = fromDbDate(e.data)!;
  const kind = eventKind(e.tip);
  const changes: RegisterChange[] = registerChanges(
    kind,
    { data, oficiant: e.oficiant },
    e.persoane.map((p) => ({ rol: p.rol as EventPersonRole, person: p.person ? toRegisterPerson(p.person) : null })),
    { nume: church.nume, localitate: church.localitate },
  );
  return {
    ...e,
    data,
    kind,
    persons: e.persoane.map((p) => ({ id: p.id, rol: p.rol as EventPersonRole, name: p.person ? memberName(p.person) : p.numeLiber, personId: p.person?.id ?? null, familyId: p.person?.familyId ?? null, applied: p.aplicatInRegistruLa })),
    changes,
    taken: data <= todayIso(),
  };
}

/** Acasă (write roles): the events taken place whose persons' register data wait („Trece în registru”). */
export async function eventsWaitingForRegister(ctx: Ctx) {
  const today = todayIso();
  const rows = await ctx.db.event.findMany({
    where: { registruIgnoratLa: null, data: { lte: new Date(`${today}T00:00:00Z`) }, persoane: { some: { personId: { not: null }, aplicatInRegistruLa: null } } },
    orderBy: { data: "desc" },
    take: 20,
    select: { id: true, titlu: true, data: true, registruIgnoratLa: true, persoane: { select: { personId: true, aplicatInRegistruLa: true } } },
  });
  return rows.filter((e) => waitsForRegister({ ...e, data: fromDbDate(e.data)! }, today)).map((e) => ({ id: e.id, titlu: e.titlu, data: fromDbDate(e.data)! }));
}

/** „Istoric”: the events of a person (by role) or of a family (its own, and its members'), newest first. */
export async function historyEvents(ctx: Ctx, by: { personId?: string; familyId?: string }) {
  const rows = await ctx.db.event.findMany({
    where: by.personId
      ? { persoane: { some: { personId: by.personId } } }
      : { OR: [{ familyId: by.familyId }, { persoane: { some: { person: { familyId: by.familyId } } } }] },
    orderBy: { data: "desc" },
    take: 50,
    select: { id: true, titlu: true, tip: true, data: true, persoane: { select: { rol: true, personId: true, person: { select: { nume: true, prenume: true } } } } },
  });
  return rows.map((e) => ({
    id: e.id,
    titlu: e.titlu,
    tip: e.tip,
    data: fromDbDate(e.data)!,
    persons: e.persoane.filter((p) => p.person).map((p) => ({ rol: p.rol as EventPersonRole, name: memberName(p.person!), personId: p.personId! })),
  }));
}
