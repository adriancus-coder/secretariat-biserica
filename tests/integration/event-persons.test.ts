import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, actionCtx: async () => current, requireCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<object>()), redirect: () => {} }));

const { saveEventAction } = await import("@/server/actions/events");
const { addChildToFamilyAction, applyEventRegisterAction, ignoreEventRegisterAction } = await import("@/server/actions/event-persons");
const { eventFormOptions, eventWithPersons, eventsWaitingForRegister, historyEvents } = await import("@/server/queries/event-persons");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");
const { importBackup } = await import("@/server/backup");
const { anonymizePerson } = await import("@/server/anonymize");

/** EVENT-PERSONS on the database: the form's choices, „Trece în registru”, Acasă, backup, anonymising. */
describe.skipIf(!hasTestDb)("event persons", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let churchId: string;
  let familyId: string;
  let father: string;
  let mother: string;
  let baby: string;
  let teen: string;
  let groom: string;
  let bride: string;
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };
  const save = async (fields: Record<string, string>, persoane: unknown[], id: string | null = null) =>
    saveEventAction(id, {}, form({ data: "2026-05-03", ...fields, persoane: JSON.stringify(persoane) }));
  const eventByTitle = async (titlu: string) => (await prisma.event.findFirstOrThrow({ where: { churchId, titlu } })).id;

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Biserica Maranata", slug: "maranata", localitate: "Stavanger" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "s@x.ro", name: "Secretar", passwordHash: "x", role: "SECRETAR" } });
    ctx = { user: { id: u.id, name: "Secretar", email: "s@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId, churchName: "M" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    current = ctx;
    const p = (data: Record<string, unknown>) => prisma.person.create({ data: { churchId, ...data } as never }).then((x) => x.id);
    father = await p({ nume: "Pop", prenume: "Ion", gen: "M", statut: "MEMBRU", dataNasterii: d("1985-01-01"), dataBotez: d("2005-01-01"), sortKey: "pop ion" });
    mother = await p({ nume: "Pop", prenume: "Ana", gen: "F", statut: "MEMBRU", dataNasterii: d("1987-01-01"), sortKey: "pop ana", rudenie: "Soție" });
    baby = await p({ nume: "Pop", prenume: "Mia", gen: "F", statut: "APARTINATOR", dataNasterii: d("2026-01-10"), rudenie: "Fiică", sortKey: "pop mia" });
    teen = await p({ nume: "Pop", prenume: "Dan", gen: "M", statut: "APARTINATOR", dataNasterii: d("2011-02-01"), rudenie: "Fiu", sortKey: "pop dan", dataBinecuvantare: d("2011-06-01") });
    groom = await p({ nume: "Rusu", prenume: "Vlad", gen: "M", statut: "PRIETEN", dataNasterii: d("1999-01-01"), necasatorit: true, sortKey: "rusu vlad" });
    bride = await p({ nume: "Lazăr", prenume: "Ema", gen: "F", statut: "MEMBRU", dataNasterii: d("2000-01-01"), dataCasatoriei: d("2020-01-01"), sortKey: "lazar ema" });
    familyId = (await prisma.family.create({ data: { churchId, nume: "Fam. Pop Ion", headId: father } })).id;
    await prisma.person.updateMany({ where: { id: { in: [father, mother, baby, teen] } }, data: { familyId } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("choosing the family offers its parents and its minors (the baby first)", async () => {
    const { families, persons } = await eventFormOptions(ctx);
    const fam = families.find((f) => f.id === familyId)!;
    expect(fam.church).toBe(true);
    expect(fam.parents).toEqual(["Pop Ion", "Pop Ana"]);
    const { familyMinors } = await import("@/lib/event-persons");
    expect(familyMinors(fam.members, "2026-05-01").map((m) => m.prenume)).toEqual(["Mia", "Dan"]);
    // Choosing the child by name gives the family.
    expect(persons.find((x) => x.id === baby)?.familyId).toBe(familyId);
  });

  it("„+ Copil nou în familie” creates the child in the family (aparținător, Fiu) and audits it", async () => {
    const r = await addChildToFamilyAction(familyId, { prenume: "Luca", nume: "Pop", gen: "M", dataNasterii: "2026-03-01" });
    expect(r.child?.prenume).toBe("Luca");
    const c = await prisma.person.findUniqueOrThrow({ where: { id: r.child!.id } });
    expect([c.familyId, c.statut, c.rudenie, c.churchId]).toEqual([familyId, "APARTINATOR", "Fiu", churchId]);
    expect(await prisma.auditLog.count({ where: { entityId: c.id, action: "CREATE" } })).toBe(1);
    expect((await addChildToFamilyAction(familyId, { prenume: "", nume: "Pop", gen: "", dataNasterii: "" })).child).toBeUndefined();
  });

  it("validations: a child outside the family, twice, none, a free name for a child", async () => {
    const t = { titlu: "B", tip: "Binecuvântare copil", familyId };
    expect((await save(t, [{ personId: groom, numeLiber: "", rol: "COPIL" }])).errors?.persoane).toBe("Copiii aleși trebuie să fie în familia aleasă.");
    expect((await save(t, [{ personId: baby, numeLiber: "", rol: "COPIL" }, { personId: baby, numeLiber: "", rol: "COPIL" }])).errors?.persoane).toBe("O persoană a fost aleasă de două ori.");
    expect((await save(t, [])).errors?.persoane).toBe("Alegeți cel puțin un copil.");
    expect((await save(t, [{ personId: null, numeLiber: "Cineva", rol: "COPIL" }])).errors?.persoane).toBe("Un nume scris liber se poate trece doar la miri.");
    expect(await prisma.event.count({ where: { churchId } })).toBe(0);
  });

  it("a blessing: nothing written before „Aplică selecția”; then the date, the field already filled unticked", async () => {
    await save({ titlu: "Binecuvântarea copiilor Mia și Dan", tip: "Binecuvântare copil", familyId }, [
      { personId: baby, numeLiber: "", rol: "COPIL" },
      { personId: teen, numeLiber: "", rol: "COPIL" },
    ]);
    const id = await eventByTitle("Binecuvântarea copiilor Mia și Dan");
    const e = (await eventWithPersons(ctx, id))!;
    expect(e.taken).toBe(true);
    const babyChange = e.changes.find((c) => c.personId === baby)!;
    const teenChange = e.changes.find((c) => c.personId === teen)!;
    expect([babyChange.checked, babyChange.current]).toEqual([true, "—"]);
    expect(teenChange.checked).toBe(false);
    expect(teenChange.current).not.toBe("—");
    // Nothing written yet; Acasă lists it.
    expect((await prisma.person.findUniqueOrThrow({ where: { id: baby } })).dataBinecuvantare).toBeNull();
    expect((await eventsWaitingForRegister(ctx)).map((x) => x.id)).toContain(id);
    // Only the ticked change is applied, audited „din evenimentul …”.
    expect(await applyEventRegisterAction(id, {}, form({ schimbare: babyChange.key }))).toBeUndefined(); // redirected
    expect((await prisma.person.findUniqueOrThrow({ where: { id: baby } })).dataBinecuvantare?.toISOString().slice(0, 10)).toBe("2026-05-03");
    expect((await prisma.person.findUniqueOrThrow({ where: { id: teen } })).dataBinecuvantare?.toISOString().slice(0, 10)).toBe("2011-06-01");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: baby, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(audit.changes)).toContain("din evenimentul Binecuvântarea copiilor Mia și Dan");
    expect(await prisma.eventPerson.count({ where: { eventId: id, aplicatInRegistruLa: null } })).toBe(0);
    expect((await eventsWaitingForRegister(ctx)).map((x) => x.id)).not.toContain(id);
    // „Istoric” on the person and the family.
    expect((await historyEvents(ctx, { personId: baby })).map((x) => x.id)).toEqual([id]);
    expect((await historyEvents(ctx, { familyId })).map((x) => x.id)).toContain(id);
  });

  it("a baptism proposes the church, the locality and the status (unticked for a minor)", async () => {
    await save({ titlu: "Botez", tip: "Botez", oficiant: "Pastor Ionescu" }, [
      { personId: teen, numeLiber: "", rol: "BOTEZAT" },
      { personId: groom, numeLiber: "", rol: "BOTEZAT" },
    ]);
    const e = (await eventWithPersons(ctx, await eventByTitle("Botez")))!;
    const of = (pid: string, f: string) => e.changes.find((c) => c.personId === pid && c.field === f)!;
    expect(of(teen, "botezBiserica").proposed).toBe("Biserica Maranata");
    expect(of(teen, "botezLocalitate").proposed).toBe("Stavanger");
    expect(of(teen, "statut").checked).toBe(false);
    expect(of(groom, "statut").checked).toBe(true);
    await applyEventRegisterAction(e.id, {}, form({ schimbare: of(groom, "statut").key }));
    const g = await prisma.person.findUniqueOrThrow({ where: { id: groom } });
    expect([g.statut, g.modIntrare, g.dataMembru?.toISOString().slice(0, 10)]).toEqual(["MEMBRU", "BOTEZ", "2026-05-03"]);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: teen } })).statut).toBe("APARTINATOR");
  });

  it("a wedding sets the date on both (a different date unticked), a free name allowed", async () => {
    await save({ titlu: "Nunta", tip: "Nuntă" }, [
      { personId: groom, numeLiber: "", rol: "MIRE" },
      { personId: bride, numeLiber: "", rol: "MIREASA" },
    ]);
    const e = (await eventWithPersons(ctx, await eventByTitle("Nunta")))!;
    const ch = e.changes.filter((c) => c.field === "dataCasatoriei");
    expect(ch.map((c) => [c.personId, c.checked])).toEqual([
      [groom, true],
      [bride, false],
    ]);
    await applyEventRegisterAction(e.id, {}, form({ schimbare: ch[0].key }));
    await applyEventRegisterAction(e.id, {}, form({})); // nothing else is written
    const g = await prisma.person.findUniqueOrThrow({ where: { id: groom } });
    expect([g.dataCasatoriei?.toISOString().slice(0, 10), g.necasatorit]).toEqual(["2026-05-03", false]);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: bride } })).dataCasatoriei?.toISOString().slice(0, 10)).toBe("2020-01-01");
    // Applying both.
    const both = (await eventWithPersons(ctx, e.id))!.changes.map((c) => c.key);
    await applyEventRegisterAction(e.id, {}, form({ schimbare: both[0] }));
    expect((await prisma.person.findUniqueOrThrow({ where: { id: bride } })).dataCasatoriei?.toISOString().slice(0, 10)).toBe("2026-05-03");
    expect((await save({ titlu: "Nunta 2", tip: "Nuntă" }, [{ personId: null, numeLiber: "Maria din Bergen", rol: "MIREASA" }]))?.errors).toBeUndefined();
    expect(await prisma.event.count({ where: { churchId, titlu: "Nunta 2" } })).toBe(1);
  });

  it("a future event is not applied; „Ignoră” takes it off Acasă", async () => {
    await save({ titlu: "Viitor", tip: "Binecuvântare copil", familyId, data: "2099-01-01" }, [{ personId: baby, numeLiber: "", rol: "COPIL" }]);
    const fut = await eventByTitle("Viitor");
    expect((await applyEventRegisterAction(fut, {}, form({}))).ok).toBeFalsy();
    await save({ titlu: "Ignorat", tip: "Înmormântare" }, [{ personId: mother, numeLiber: "", rol: "DECEDAT" }]);
    const ign = await eventByTitle("Ignorat");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ign } })).familyId).toBe(familyId); // the family fills itself
    expect((await eventsWaitingForRegister(ctx)).map((x) => x.id)).toContain(ign);
    await ignoreEventRegisterAction(ign);
    expect((await eventsWaitingForRegister(ctx)).map((x) => x.id)).not.toContain(ign);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: mother } })).dataIesire).toBeNull();
  });

  it("the backup keeps the family and the persons; anonymising unlinks and empties the free name", async () => {
    const { data } = await buildExportJson(ctx);
    const parsed = parseImportJson(JSON.parse(JSON.stringify(data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await prisma.eventPerson.deleteMany({ where: { churchId } });
    await importBackup(ctx, parsed.backup, "merge", parsed.extras);
    expect(await prisma.eventPerson.count({ where: { churchId, personId: baby } })).toBe(2);
    expect(await prisma.eventPerson.count({ where: { churchId, numeLiber: "Maria din Bergen" } })).toBe(1);
    const free = await prisma.eventPerson.findFirstOrThrow({ where: { churchId, numeLiber: "Maria din Bergen" } });
    expect(free.personId).toBeNull();
    await anonymizePerson(ctx, baby);
    expect(await prisma.eventPerson.count({ where: { personId: baby } })).toBe(0);
  });
});
