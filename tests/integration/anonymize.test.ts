import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonymizePerson } from "@/server/anonymize";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

const NUME = "Ionescuvici";
const PRENUME = "Zamfir";
const TELEFON = "+47 999 88 777";
const EMAIL = "zamfir.unic@example.org";

describe.skipIf(!hasTestDb)("anonymisation leaves no trace of the person", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let personId: string;
  let otherChurchPerson: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const church = await prisma.church.create({ data: { nume: "Betel", slug: "betel-anon" } });
    const other = await prisma.church.create({ data: { nume: "Alta", slug: "alta-anon" } });
    const admin = await prisma.user.create({ data: { churchId: church.id, email: "admin@x.ro", name: "Admin", passwordHash: "x", role: "ADMIN" } });
    ctx = { user: { id: admin.id, name: "Admin", email: "admin@x.ro", role: "ADMIN", churchId: church.id, churchName: "Betel" }, db: scopeToChurch(prisma, church.id) } as Ctx;
    const db = ctx.db;
    const full = `${PRENUME} ${NUME}`;
    const listed = `${NUME} ${PRENUME}`;
    personId = (
      await db.person.create({
        data: { nume: NUME, prenume: PRENUME, telefon: TELEFON, email: EMAIL, adresa: "Str. Secretă 9", searchText: `zamfir ionescuvici 4799988777 ${EMAIL}` } as never,
      })
    ).id;
    const witness = (await db.person.create({ data: { nume: "Martor", prenume: "Ana" } as never })).id;
    // The same name in another church must stay.
    otherChurchPerson = (await prisma.person.create({ data: { churchId: other.id, nume: NUME, prenume: PRENUME, telefon: TELEFON } })).id;

    const application = await db.application.create({
      data: { kind: "TRANSFER", status: "ACCEPTED", nume: NUME, prenume: PRENUME, telefon: TELEFON, email: EMAIL, adresa: "Str. Secretă 9", mesaj: `Sunt ${full}`, personId } as never,
    });
    const meeting = await db.meeting.create({
      data: {
        tip: "Comitet",
        data: new Date("2026-03-01"),
        presedinte: full,
        invitati: `${full}, Ana Martor`,
        puncte: [`${full} a prezentat bugetul.`, "Alt punct"],
        prezenti: { create: [{ personId }, { personId: witness }] },
        signatures: { create: [{ personId, imagePng: new Uint8Array([1, 2, 3]) }, { personId: witness, imagePng: new Uint8Array([4]) }] },
        sends: { create: [{ to: [EMAIL, "alt@example.org"], status: "SENT" }] },
      } as never,
    });
    const group = await db.group.create({ data: { nume: "Cor", responsabil: full, membri: { create: [{ personId }] } } as never });
    await db.event.create({ data: { titlu: "Agapă", tip: "Agapă", data: new Date("2026-03-02"), agapaResponsabil: full, contributii: { create: [{ pozitie: 0, cine: full, ce: "prăjituri" }] } } as never });
    await db.note.create({ data: { data: new Date("2026-03-03"), tip: "Generală", text: `Vizită la ${full} (${TELEFON})`, searchText: "x" } as never });
    await db.family.create({ data: { nume: `Fam. ${full}`, note: `Contact: ${EMAIL}` } as never });
    const campaign = await db.dataCampaign.create({ data: { nume: "Actualizare", deadline: new Date("2026-12-01"), privacyTextVersion: "v" } as never });
    await db.dataUpdateSubmission.create({ data: { campaignId: campaign.id, personId, via: "PERSONAL", proposed: { self: { nume: full, telefon: TELEFON } } } as never });
    await db.consent.create({ data: { personId, kind: "PHOTOS", granted: true, givenAt: new Date(), source: "ONLINE" } as never });
    await db.personProposal.create({ data: { kind: "REABILITARE", personId, nume: full, formular: { nume: full, telefon: TELEFON } } as never });
    await db.pastoralNote.create({ data: { personId, textEnc: "v1.a.b.c" } as never });
    await db.personParent.create({ data: { parentId: witness, childId: personId } as never });
    await db.disciplinaryMeasure.create({ data: { personId, forma: "MUSTRARE_COMITET", dataInceput: new Date("2026-03-05"), motiv: `Cercetat ${full} (${TELEFON})` } as never });
    // Audit rows of other entities that mention the person.
    const audit = (entity: string, entityId: string, entityLabel: string, changes: object) =>
      db.auditLog.create({ data: { entity, entityId, entityLabel, action: "UPDATE", userName: "Admin", changes } as never });
    await audit("MEETING", meeting.id, "PV nr. 1/2026", { prezenti: [`Ana Martor`, `${listed}, Ana Martor`] });
    await audit("GROUP", group.id, "Cor", { membri: [``, listed] });
    await audit("FAMILY", "f1", `Fam. ${full}`, { membri: listed });
    await audit("NOTE", "n1", "Mențiune", { text: [``, `Vizită la ${full}`] });
    await audit("APPLICATION", application.id, listed, { telefon: TELEFON, email: EMAIL, nume: NUME, prenume: PRENUME });
    await audit("PERSON", personId, listed, { telefon: [``, TELEFON] });
    // The outgoing register keeps the name (official record).
    await db.document.create({ data: { tip: "adeverinta", nr: 1, anRegistru: 2026, data: new Date("2026-03-04"), personId, persoana: listed, text: `Adeverim că ${full} este membru.` } as never });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("no row outside the documents still holds the surname, the phone or the e-mail", async () => {
    await anonymizePerson(ctx, personId);
    const tables = (
      await prisma.$queryRaw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    )
      .map((t) => t.table_name)
      .filter((t) => !["documents", "_prisma_migrations"].includes(t));
    const leftovers: string[] = [];
    for (const t of tables) {
      for (const needle of [NUME, TELEFON, TELEFON.replace(/\D/g, ""), EMAIL]) {
        const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "${t}" x WHERE x::text ILIKE $1 ${t === "persons" ? `AND x."id" <> $2` : t === "churches" ? "" : ""}`,
          `%${needle}%`,
          ...(t === "persons" ? [otherChurchPerson] : []),
        );
        if (Number(rows[0].n)) leftovers.push(`${t}: ${needle}`);
      }
    }
    expect(leftovers).toEqual([]);

    // What stays: the statistics record, the document, the other church's person.
    const p = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
    expect(p.nume).toBe("Persoană ștearsă");
    expect(await prisma.pastoralNote.count({ where: { personId } })).toBe(0);
    expect(await prisma.personParent.count({ where: { OR: [{ parentId: personId }, { childId: personId }] } })).toBe(0);
    expect(await prisma.personProposal.count({ where: { personId } })).toBe(0);
    expect(await prisma.meetingSignature.count({ where: { personId } })).toBe(0);
    expect(await prisma.meetingSignature.count()).toBe(1);
    expect(await prisma.meetingAttendee.count({ where: { personId } })).toBe(1);
    const app = await prisma.application.findFirstOrThrow();
    expect([app.personId, app.nume, app.telefon, app.email, app.mesaj]).toEqual([null, "Persoană ștearsă", "", "", ""]);
    const doc = await prisma.document.findFirstOrThrow();
    expect(doc.persoana).toBe(`${NUME} ${PRENUME}`);
    expect((await prisma.person.findUniqueOrThrow({ where: { id: otherChurchPerson } })).telefon).toBe(TELEFON);
    const meeting = await prisma.meeting.findFirstOrThrow({ include: { sends: true } });
    expect(meeting.puncte[0]).toBe("Persoană ștearsă a prezentat bugetul.");
    expect(meeting.sends[0].to).toEqual(["alt@example.org"]);
  });
});
