import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importBackup } from "@/server/backup";
import { buildExportJson, parseImportJson } from "@/server/backup-json";
import { printToText } from "@/domain/print";
import { expectedAttendees } from "@/server/queries/attendance";
import { getMeeting } from "@/server/queries/meetings";
import { meetingSpec } from "@/server/pdf/meeting";
import type { ChurchSettings } from "@/server/queries/church";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {} }));

/** Statut art. 27: disciplinary measures reach administrators only. */
describe.skipIf(!hasTestDb)("disciplinary measures", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string, role: "ADMIN" | "SECRETAR"): Ctx =>
    ({ user: { id: userId, name: role, email: `${userId}@x.ro`, role, churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) }) as Ctx;
  let admin: Ctx;
  let secretar: Ctx;
  let other: Ctx;
  let suspended = "";
  let member = "";

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [ca, cb] = await Promise.all(["disc-a", "disc-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const ua = await prisma.user.create({ data: { churchId: ca.id, email: "a@x.ro", name: "A", passwordHash: "x", role: "ADMIN" } });
    const us = await prisma.user.create({ data: { churchId: ca.id, email: "s@x.ro", name: "S", passwordHash: "x", role: "SECRETAR" } });
    const ub = await prisma.user.create({ data: { churchId: cb.id, email: "b@x.ro", name: "B", passwordHash: "x", role: "ADMIN" } });
    admin = ctxFor(ca.id, ua.id, "ADMIN");
    secretar = ctxFor(ca.id, us.id, "SECRETAR");
    other = ctxFor(cb.id, ub.id, "ADMIN");
    const mk = async (prenume: string) => (await prisma.person.create({ data: { churchId: ca.id, nume: "Pop", prenume, sortKey: `pop ${prenume}`, searchText: prenume } })).id;
    suspended = await mk("Suspendat");
    member = await mk("Membru");
    await prisma.disciplinaryMeasure.create({ data: { churchId: ca.id, personId: suspended, forma: "SUSPENDARE", stare: "APLICATA", dataInceput: new Date("2026-03-01"), motiv: "motiv intern" } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("a suspended member is not expected at a „Toți membrii” meeting", async () => {
    const ids = await expectedAttendees(admin.db, "TOTI", "2026-10-01");
    expect(ids).toContain(member);
    expect(ids).not.toContain(suspended);
  });

  it("the ordinary minutes of a disciplinary decision say only „Punct tratat în ședință închisă”", async () => {
    const meeting = await prisma.meeting.create({ data: { churchId: admin.user.churchId, tip: "Comitet", data: new Date("2026-03-01"), puncte: ["Planificare"] } });
    const m = await prisma.disciplinaryMeasure.create({
      data: { churchId: admin.user.churchId, personId: member, forma: "MUSTRARE_COMITET", stare: "CERCETARE", dataInceput: new Date("2026-02-01"), meetingId: meeting.id, abatere: "abatere secretă", temei: "art. 27" },
    });
    expect((await getMeeting(secretar, meeting.id))!.sedintaInchisa).toBe(false);
    await prisma.disciplinaryMeasure.update({ where: { id: m.id }, data: { stare: "APLICATA" } });
    const record = (await getMeeting(secretar, meeting.id))!;
    expect(record.sedintaInchisa).toBe(true);
    // The church settings by hand: getChurch reads through the app's global client.
    const church = { nume: "disc-a", pastor: "", secretar: "", tipuriAG: [], tipuriCvorum: [], attendanceRules: { Comitet: "COMITET" }, pvLayout: DEFAULT_LAYOUT } as unknown as ChurchSettings;
    const text = printToText(meetingSpec(record, church));
    expect(text).toContain("Punct tratat în ședință închisă.");
    expect(text).not.toMatch(/abatere secretă|disciplin|sancțiun/i);
    await prisma.disciplinaryMeasure.delete({ where: { id: m.id } });
    await prisma.meeting.delete({ where: { id: meeting.id } });
  });

  it("only an administrator's export carries the measures; a secretary's has no trace", async () => {
    const asAdmin = JSON.stringify((await buildExportJson(admin)).data);
    const asSecretar = JSON.stringify((await buildExportJson(secretar)).data);
    expect(asAdmin).toContain("motiv intern");
    expect(asAdmin).toContain('"discipline"');
    expect(asSecretar).not.toMatch(/disciplin|SUSPENDARE|motiv intern/i);
  });

  it("an administrator's file imports the measures into another church, linked to the imported person", async () => {
    const parsed = parseImportJson(JSON.parse(JSON.stringify((await buildExportJson(admin)).data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(other, parsed.backup, "merge", parsed.extras);
    const m = await other.db.disciplinaryMeasure.findFirstOrThrow({ include: { person: true } });
    expect([m.forma, m.stare, m.person.prenume, m.churchId]).toEqual(["SUSPENDARE", "APLICATA", "Suspendat", other.user.churchId]);
  });
});
