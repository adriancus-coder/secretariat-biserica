import { createHash } from "node:crypto";
import { AlignmentType, Document, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow } from "docx";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, actionCtx: async () => current, requireCtx: async () => current }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { importDocxMinutesAction } = await import("@/server/actions/minutes-import");
const { saveMeetingAction } = await import("@/server/actions/meetings");
const { lockMeetingAction, markAllPaperAction, signMeetingAction } = await import("@/server/actions/signatures");
const { listMeetings } = await import("@/server/queries/meetings");
const { getMeeting } = await import("@/server/queries/meetings");
const { getChurch } = await import("@/server/queries/church");
const { meetingSpec } = await import("@/server/pdf/meeting");
const { printToText } = await import("@/domain/print");
const { GET: originalRoute } = await import("@/app/api/procese-verbale/[id]/original/route");

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** A synthetic old minutes: the points in a table (nr | text | vote), a paragraph nobody recognizes. */
async function oldMinutes(nr: number): Promise<File> {
  const p = (t: string) => new Paragraph(t);
  const doc = new Document({
    numbering: { config: [{ reference: "x", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT }] }] },
    sections: [
      {
        children: [
          p(`Proces verbal nr. ${nr}`),
          p("Încheiat azi, 12.03.2025, cu ocazia ședinței de comitet."),
          p("La ședință au fost prezenți: Ana Pop, Ion Rusu, Maria Dan"),
          p("Fratele moderator a deschis cu rugăciune."),
          p("Hotărâri:"),
          new Table({
            rows: [
              ["Nr.", "Punct", "Vot"],
              ["1", "Bugetul pe 2025", "pentru 3, contra 0, abțineri 0"],
              ["2", "Reparația acoperișului", "pentru 2, contra 1, abțineri 0"],
            ].map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [p(c)] })) })),
          }),
          p("Toate punctele au fost votate în unanimitate de membrii prezenți."),
          p("Întocmit,"),
          p("Secretar, Ion Rusu"),
        ],
      },
    ],
  });
  return new File([new Uint8Array(await Packer.toBuffer(doc))], `pv-${nr}.docx`, { type: DOCX });
}

/** MINUTES-IMPORT-ROBUST on the database: read → „Ce am recunoscut” → import as a record copy. */
describe.skipIf(!hasTestDb)("importing old minutes", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let churchId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Biserica Exemplu", slug: "exemplu", pastor: "Ana Pop", secretar: "Ion Rusu" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "s@x.ro", name: "Secretar", passwordHash: "x", role: "SECRETAR" } });
    ctx = { user: { id: u.id, name: "Secretar", email: "s@x.ro", role: "SECRETAR", isPastor: false, accesDisciplina: false, churchId, churchName: "E" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    current = ctx;
    for (const [k, nume, prenume] of [
      ["ana", "Pop", "Ana"],
      ["ion", "Rusu", "Ion"],
      ["maria", "Dan", "Maria"],
    ]) ids[k] = (await prisma.person.create({ data: { churchId, nume, prenume, statut: "MEMBRU", sortKey: `${nume} ${prenume}`.toLowerCase() } })).id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  const read = async (file: File) => {
    const fd = new FormData();
    fd.append("fisiere", file);
    const r = await importDocxMinutesAction({}, fd);
    return r.drafts![0];
  };

  /** The import's save: the form as „Ce am recunoscut” fills it, with the original file. */
  const save = async (draft: Awaited<ReturnType<typeof read>>, file: File, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("import", "1");
    for (const [k, v] of Object.entries(draft.initial)) fd.set(k, v);
    for (const id of draft.selected) fd.append("prezenti", id);
    fd.set("puncte", JSON.stringify(draft.points));
    fd.set("voturi", JSON.stringify(draft.votes));
    fd.set("original", file);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return saveMeetingAction(null, {}, fd);
  };

  it("„Ce am recunoscut”: the points of the table with their votes, the attendees, the unrecognized text for „Observații”", async () => {
    const draft = await read(await oldMinutes(40));
    expect(draft.initial).toMatchObject({ nr: "40", data: "2025-03-12", tip: "Comitet" });
    expect(draft.points).toEqual(["Bugetul pe 2025", "Reparația acoperișului"]);
    expect(draft.votes).toEqual([
      { pentru: 3, contra: 0, abtineri: 0, secret: false },
      { pentru: 2, contra: 1, abtineri: 0, secret: false },
    ]);
    expect(draft.selected.sort()).toEqual([ids.ana, ids.ion, ids.maria].sort());
    expect(draft.recognized?.unrecognized).toEqual(["Fratele moderator a deschis cu rugăciune."]);
    expect(draft.initial.observatii).toBe("Text importat nerecunoscut:\nFratele moderator a deschis cu rugăciune.");
    expect(draft.conflict).toBeNull();
  });

  it("imports a record copy with its old number, its votes and its original (downloaded byte for byte)", async () => {
    const file = await oldMinutes(40);
    const r = await save(await read(file), file);
    expect(r).toMatchObject({ ok: true, message: "Procesul-verbal nr. 40/2025 a fost importat." });
    const m = await prisma.meeting.findUniqueOrThrow({ where: { id: r.savedId! }, include: { sourceFile: true } });
    expect([m.importat, m.nr, m.anRegistru, m.puncte.length, m.observatii]).toEqual([true, 40, 2025, 2, "Text importat nerecunoscut:\nFratele moderator a deschis cu rugăciune."]);
    expect(m.sourceFile?.numeFisier).toBe("pv-40.docx");
    const res = await originalRoute(new Request("http://x"), { params: Promise.resolve({ id: m.id }) } as never);
    expect(res.headers.get("Content-Type")).toBe(DOCX);
    expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(sha(new Uint8Array(await file.arrayBuffer())));
    // The PDF says it is a copy; the attendees count.
    const text = printToText(meetingSpec((await getMeeting(ctx, m.id))!, await getChurch(ctx)));
    expect(text).toContain("Copie de evidență — originalul pe hârtie");
    expect(text).toContain("Votat: pentru 3, contra 0, abțineri 0");
    ids.imported = m.id;
  });

  it("a new minutes of the same year continues after the highest number", async () => {
    const fd = new FormData();
    fd.set("tip", "Comitet");
    fd.set("data", "2025-04-01");
    await expect(saveMeetingAction(null, {}, fd)).rejects.toThrow(/REDIRECT:\/procese-verbale\//);
    const created = await prisma.meeting.findFirstOrThrow({ where: { churchId, data: new Date("2025-04-01T00:00:00Z") } });
    expect(created.nr).toBe(41);
    expect(created.importat).toBe(false);
  });

  it("a taken old number: the conflict is shown, nothing is renumbered, and the choice decides", async () => {
    const file = await oldMinutes(40);
    const draft = await read(file);
    expect(draft.conflict).toMatchObject({ nr: 40, an: 2025 });
    const refused = await save(draft, file);
    expect(refused.ok).toBeFalsy();
    expect(refused.errors?.nr).toContain("Numărul 40/2025 este deja folosit");
    const dublu = await save(draft, file, { nrConflict: "dublu" });
    const d = await prisma.meeting.findUniqueOrThrow({ where: { id: dublu.savedId! } });
    expect([d.nr, d.nrVechi]).toEqual([null, 40]);
    const { minutesNumber } = await import("@/lib/minutes");
    expect(minutesNumber(d)).toBe("PV nr. 40/2025 (număr dublu în evidența veche)");
    const fara = await save(draft, file, { nrConflict: "fara" });
    const f = await prisma.meeting.findUniqueOrThrow({ where: { id: fara.savedId! } });
    expect([f.nr, f.nrVechi]).toEqual([null, null]);
    expect(f.observatii.startsWith("Număr în evidența veche: 40/2025.")).toBe(true);
    // The register's sequence is unchanged.
    expect(await prisma.meeting.count({ where: { churchId, anRegistru: 2025, nr: 40 } })).toBe(1);
    // Editing an imported minutes without a number keeps it without one.
    await prisma.meeting.deleteMany({ where: { id: { in: [d.id, f.id] } } });
  });

  it("signatures: not digital, „semnături nemarcate” in the list, „Toți au semnat pe hârtie”, then it closes", async () => {
    const id = ids.imported;
    const listed = await listMeetings(ctx, 1, "nemarcate");
    expect(listed.items.map((m) => m.id)).toEqual([id]);
    expect(listed.items[0]).toMatchObject({ importat: true, unmarked: true });
    expect((await listMeetings(ctx, 1, "importate")).total).toBe(1);
    const sharp = (await import("sharp")).default;
    const png = `data:image/png;base64,${(await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.6 } } }).png().toBuffer()).toString("base64")}`;
    const digital = await signMeetingAction(id, ids.maria, png);
    expect(digital.ok).toBeFalsy();
    expect(digital.message).toContain("copie de evidență");
    expect(await prisma.meetingSignature.count({ where: { meetingId: id } })).toBe(0);
    expect((await lockMeetingAction(id, false)).ok).toBeFalsy();
    expect((await markAllPaperAction(id)).ok).toBe(true);
    expect((await listMeetings(ctx, 1, "nemarcate")).total).toBe(0);
    expect((await lockMeetingAction(id, false)).ok).toBe(true);
  });

  it("the backup keeps the record copy; the original only with „Include fișierele originale”", async () => {
    const { buildExportJson } = await import("@/server/backup-json");
    const meetingOf = (data: Record<string, unknown>) => (data.meetings as Record<string, Record<string, unknown>>)[ids.imported];
    const without = meetingOf((await buildExportJson(ctx)).data);
    expect(without.importat).toBe(true);
    expect(without.original).toBeUndefined();
    const withFile = meetingOf((await buildExportJson(ctx, { originals: true })).data) as { original: { nume: string; date: string } };
    const stored = await prisma.meetingSourceFile.findFirstOrThrow({ where: { meetingId: ids.imported } });
    expect(withFile.original.nume).toBe("pv-40.docx");
    expect(sha(Buffer.from(withFile.original.date, "base64"))).toBe(sha(stored.data));
  });

  it("„Semnează” on a new, unsaved minutes saves it and opens the signature", async () => {
    const fd = new FormData();
    fd.set("tip", "Comitet");
    fd.set("data", "2025-05-02");
    fd.set("dupa", "semneaza");
    await expect(saveMeetingAction(null, {}, fd)).rejects.toThrow(/REDIRECT:\/procese-verbale\/\w+\?salvat=1&semneaza=1#semnaturi/);
    expect(await prisma.meeting.count({ where: { churchId, data: new Date("2025-05-02T00:00:00Z") } })).toBe(1);
  });
});
