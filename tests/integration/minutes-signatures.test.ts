import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, actionCtx: async () => current, requireCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { deleteRoleSignatureAction, deleteSignatureAction, lockMeetingAction, markAllPaperAction, markPaperAction, signMeetingAction, signRoleAction } = await import(
  "@/server/actions/signatures"
);
const { getMeeting } = await import("@/server/queries/meetings");
const { getChurch } = await import("@/server/queries/church");
const { meetingSpec } = await import("@/server/pdf/meeting");
const { printToText } = await import("@/domain/print");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");
const { importBackup } = await import("@/server/backup");

/** MINUTES-SIGNATURES on the database: the table without the Secretar / Pastor, paper marks, closing, backup. */
describe.skipIf(!hasTestDb)("minutes signatures", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let churchId: string;
  let meetingId: string;
  let png: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Biserica Penticostală Maranata Stavanger", slug: "maranata", pastor: "Dumitru Ciobanu", secretar: "Adrian Emanuel Cusniriuc" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "s@x.ro", name: "Ana Secretar", passwordHash: "x", role: "SECRETAR" } });
    ctx = { user: { id: u.id, name: "Ana Secretar", email: "s@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId, churchName: "M" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    current = ctx;
    const people: [string, string, string][] = [
      ["pastor", "Ciobanu", "Dumitru"],
      ["secretar", "Cușniriuc", "Adrian Emanuel"],
      ["ana", "Pop", "Ana"],
      ["ion", "Rusu", "Ion"],
      ["maria", "Vlad", "Maria"],
    ];
    for (const [k, nume, prenume] of people) ids[k] = (await prisma.person.create({ data: { churchId, nume, prenume, statut: "MEMBRU", sortKey: `${nume} ${prenume}`.toLowerCase() } })).id;
    meetingId = (
      await prisma.meeting.create({
        data: { churchId, tip: "Comitet", nr: 555, anRegistru: 2026, data: new Date("2026-10-30T00:00:00Z"), prezenti: { create: Object.values(ids).map((personId) => ({ personId })) } },
      })
    ).id;
    png = `data:image/png;base64,${(await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.6 } } }).png().toBuffer()).toString("base64")}`;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  const text = async () => printToText(meetingSpec((await getMeeting(ctx, meetingId))!, await getChurch(ctx)));

  it("the pastor and the secretary are among those present, not in the signature table; the letterhead names the church once", async () => {
    const lines = (await text()).split("\n");
    expect(lines[0]).toBe("Biserica Penticostală Maranata Stavanger");
    expect(lines).toContain("La ședință au fost prezenți: 5 membri.");
    expect(lines).toContain("Ciobanu Dumitru, Cușniriuc Adrian Emanuel, Pop Ana, Rusu Ion, Vlad Maria");
    const at = lines.indexOf("Nume | Semnătura");
    expect(lines.slice(at + 1, at + 4)).toEqual(["Pop Ana | ________________", "Rusu Ion | ________________", "Vlad Maria | ________________"]);
    expect(lines.filter((l) => l.startsWith("Ciobanu Dumitru |") || l.startsWith("Cușniriuc"))).toEqual([]);
    expect(lines.slice(-4)).toEqual(["Întocmit,", "Secretar | Pastor", "Adrian Emanuel Cusniriuc | Dumitru Ciobanu", "Semnătura | Semnătura"]);
  });

  it("closing is refused while a place is unsigned, naming what is missing", async () => {
    const r = await lockMeetingAction(meetingId, false);
    expect(r.ok).toBeFalsy();
    expect(r.message).toBe("Lipsesc: Pop Ana, Rusu Ion, Vlad Maria, Secretar Adrian Emanuel Cusniriuc, Pastor Dumitru Ciobanu. Marcați „Semnat pe hârtie” sau confirmați închiderea.");
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } })).locked).toBe(false);
  });

  it("„Semnat pe hârtie” on one row (audited, undoable), a drawn one, then „Toți au semnat pe hârtie” → closing allowed", async () => {
    expect((await markPaperAction(meetingId, `p:${ids.ana}`)).ok).toBe(true);
    const ana = await prisma.meetingSignature.findUniqueOrThrow({ where: { meetingId_personId: { meetingId, personId: ids.ana } } });
    expect([ana.peHartie, ana.imagePng, ana.signedByUserId]).toEqual([true, null, ctx.user.id]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: meetingId }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(audit.changes)).toContain("semnat pe hârtie: Pop Ana");
    // Undo, then mark again.
    expect((await deleteSignatureAction(meetingId, ids.ana)).ok).toBe(true);
    expect(await prisma.meetingSignature.count({ where: { meetingId } })).toBe(0);
    expect((await markPaperAction(meetingId, `p:${ids.ana}`)).ok).toBe(true);
    // An unknown place is refused.
    expect((await markPaperAction(meetingId, "r:CASIER")).ok).toBeFalsy();
    expect((await signMeetingAction(meetingId, ids.ion, png)).ok).toBe(true);
    expect((await signRoleAction(meetingId, "SECRETAR", png)).ok).toBe(true);
    expect((await lockMeetingAction(meetingId, false)).message).toBe("Lipsesc: Vlad Maria, Pastor Dumitru Ciobanu. Marcați „Semnat pe hârtie” sau confirmați închiderea.");
    expect((await markAllPaperAction(meetingId)).ok).toBe(true);
    expect((await markAllPaperAction(meetingId)).message).toBe("Toate locurile sunt deja semnate.");
    const lines = (await text()).split("\n");
    expect(lines.some((l) => /^Rusu Ion \| semnat \d\d\.\d\d\.2026 \d\d:\d\d$/.test(l))).toBe(true);
    expect(lines).toContain("Pop Ana | ________________");
    expect(lines).toContain("Semnat pe hârtie de: Pop Ana, Vlad Maria.");
    expect(lines.at(-1)).toMatch(/^\[semnătură\] semnat \d\d\.\d\d\.2026 \d\d:\d\d \| semnat pe hârtie$/);
    // The pastor's paper mark can still be undone before closing.
    expect((await deleteRoleSignatureAction(meetingId, "PASTOR")).ok).toBe(true);
    expect((await lockMeetingAction(meetingId, false)).ok).toBeFalsy();
    expect((await markPaperAction(meetingId, "r:PASTOR")).ok).toBe(true);
    expect((await lockMeetingAction(meetingId, false)).ok).toBe(true);
    expect((await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } })).locked).toBe(true);
    // Closed: nothing changes any more.
    expect((await deleteSignatureAction(meetingId, ids.ana)).ok).toBeFalsy();
    expect((await markPaperAction(meetingId, `p:${ids.maria}`)).ok).toBeFalsy();
  });

  it("the JSON backup keeps the paper marks and the bottom signatures", async () => {
    const json = JSON.parse(JSON.stringify((await buildExportJson(ctx)).data));
    const exported = Object.values(json.meetings as Record<string, { semnaturi: { peHartie?: true }[]; semnaturiRol: { rol: string; peHartie?: true; imagine: string }[] }>)[0];
    expect(exported.semnaturi.filter((s) => s.peHartie)).toHaveLength(2);
    expect(exported.semnaturiRol.map((s) => [s.rol, Boolean(s.peHartie), s.imagine.length > 0]).sort()).toEqual([
      ["PASTOR", true, false],
      ["SECRETAR", false, true],
    ]);
    const other = await prisma.church.create({ data: { nume: "Alta", slug: "alta", pastor: "Dumitru Ciobanu", secretar: "Adrian Emanuel Cusniriuc" } });
    const u = await prisma.user.create({ data: { churchId: other.id, email: "o@x.ro", name: "O", passwordHash: "x", role: "ADMIN" } });
    const target = { user: { ...ctx.user, id: u.id, role: "ADMIN", churchId: other.id }, db: scopeToChurch(prisma, other.id) } as Ctx;
    const parsed = parseImportJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(target, parsed.backup, "replace", parsed.extras);
    const m = await target.db.meeting.findFirstOrThrow({ include: { signatures: true, roleSignatures: true } });
    expect(m.signatures.filter((s) => s.peHartie && s.imagePng === null)).toHaveLength(2);
    expect(m.roleSignatures.map((s) => [s.rol, s.peHartie, s.imagePng !== null]).sort()).toEqual([
      ["PASTOR", true, false],
      ["SECRETAR", false, true],
    ]);
  });
});
