import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

let current: Ctx;
vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {}, requireCtx: async () => current, actionCtx: async () => current }));
vi.mock("@/server/step-up", () => ({ hasStepUp: async () => true, stepUpMethod: async () => "password" }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));

const { blocksFingerprintText } = await import("@/lib/generated-blocks");
const { GENERATED_KINDS } = await import("@/lib/generated-kinds");
const { CHANGED_BEFORE, HASH_VERSION, loadSource, sourceHash, upgradeHash } = await import("@/server/generated");
const { upgradeGeneratedHashes } = await import("@/server/generated-upgrade");

type Kind = (typeof GENERATED_KINDS)[number];

/**
 * GENERATED-HASH-STABLE: a generated document's fingerprint comes from its source's data. Printed
 * today or „tomorrow” (a simulated clock): the same; after a real change of its source: another.
 */
describe.skipIf(!hasTestDb)("the fingerprint of generated documents", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchId: string;
  const ids: Record<string, string> = {};
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const paramsOf = (kind: Kind) => {
    const p = new URLSearchParams();
    const id = ({ eveniment: ids.event, grup: ids.group, "afis-actualizare": ids.campaign } as Record<string, string>)[kind] ?? (kind.startsWith("disciplina") ? ids[kind] : undefined);
    if (id) p.set("id", id);
    if (kind === "statistici" || kind === "dare-de-seama" || kind === "corespondenta") p.set("an", "2026");
    return p;
  };
  const hashOf = async (kind: Kind) => sourceHash((await loadSource(current, kind, paramsOf(kind)))!);
  const at = (iso: string) => vi.setSystemTime(new Date(`${iso}T09:00:00Z`));

  // A real change of each kind's source.
  const CHANGES: Record<Kind, () => Promise<unknown>> = {
    eveniment: () => prisma.event.update({ where: { id: ids.event }, data: { titlu: "Ziua mulțumirii (mutată)" } }),
    grup: () => prisma.group.update({ where: { id: ids.group }, data: { nume: "Corul mare" } }),
    "dare-de-seama": () => prisma.person.create({ data: { churchId, nume: "Nou", prenume: "Membru", statut: "MEMBRU", dataMembru: day("2026-05-01"), sortKey: "nou membru" } }),
    statistici: () => prisma.person.create({ data: { churchId, nume: "Altul", prenume: "Botezat", statut: "MEMBRU", dataBotez: day("2026-06-01"), botezAn: 2026, sortKey: "altul botezat" } }),
    neamuri: () => prisma.family.update({ where: { id: ids.family }, data: { nume: "Fam. Pop Ion (redenumită)" } }),
    patrimoniu: () => prisma.asset.create({ data: { churchId, nrInventar: 2, denumire: "Orgă", categorie: "Instrumente muzicale" } }),
    corespondenta: () => prisma.correspondence.create({ data: { churchId, nr: 2, an: 2026, data: day("2026-04-01"), directie: "IESIRE", catre: "Primăria", subiect: "Cerere" } }),
    "formular-acorduri": () => prisma.church.update({ where: { id: churchId }, data: { telefon: "+47 11 22 33 44" } }),
    "afis-cerere": () => prisma.church.update({ where: { id: churchId }, data: { email: "nou@biserica.no" } }),
    "afis-actualizare": () => prisma.dataCampaign.update({ where: { id: ids.campaign }, data: { generalNonce: "n2" } }),
    "disciplina-convocare": () => prisma.disciplinaryMeasure.update({ where: { id: ids["disciplina-convocare"] }, data: { audiereOra: "19:30" } }),
    "disciplina-comunicare": () => prisma.disciplinaryMeasure.update({ where: { id: ids["disciplina-comunicare"] }, data: { temei: "art. 27 alin. 3" } }),
    "disciplina-informare": () => prisma.disciplinaryMeasure.update({ where: { id: ids["disciplina-informare"] }, data: { dataInceput: day("2026-09-15") } }),
    "disciplina-proces-verbal": () => prisma.disciplinaryMeasure.update({ where: { id: ids["disciplina-proces-verbal"] }, data: { abatere: "altă abatere" } }),
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Maranata", slug: "maranata-h", localitate: "Stavanger", comunitate: "Comunitatea Nord" } })).id;
    const u = await prisma.user.create({ data: { churchId, email: "p@x.ro", name: "P", passwordHash: "x", role: "ADMIN", isPastor: true } });
    current = { user: { id: u.id, name: "P", email: "p@x.ro", role: "ADMIN", isPastor: true, accesDisciplina: true, churchId, churchName: "M" }, db: scopeToChurch(prisma, churchId) } as Ctx;
    const head = await prisma.person.create({ data: { churchId, nume: "Pop", prenume: "Ion", gen: "M", statut: "MEMBRU", dataNasterii: day("1980-01-01"), sortKey: "pop ion" } });
    const child = await prisma.person.create({ data: { churchId, nume: "Pop", prenume: "Dan", gen: "M", statut: "APARTINATOR", dataNasterii: day("2015-01-01"), rudenie: "Fiu", sortKey: "pop dan" } });
    const other = await prisma.person.create({ data: { churchId, nume: "Rusu", prenume: "Ana", gen: "F", statut: "MEMBRU", dataNasterii: day("1950-01-01"), sortKey: "rusu ana" } });
    ids.family = (await prisma.family.create({ data: { churchId, nume: "Fam. Pop Ion", headId: head.id } })).id;
    await prisma.person.updateMany({ where: { id: { in: [head.id, child.id] } }, data: { familyId: ids.family } });
    // Two families linked by a parent: a neam (Statistici → Neamuri).
    const fam2 = await prisma.family.create({ data: { churchId, nume: "Fam. Rusu Ana", headId: other.id } });
    await prisma.person.update({ where: { id: other.id }, data: { familyId: fam2.id } });
    await prisma.personParent.create({ data: { churchId, parentId: other.id, childId: head.id, source: "MANUAL" } });
    await prisma.personParent.create({ data: { churchId, parentId: head.id, childId: child.id, source: "FAMILIE" } });
    ids.event = (await prisma.event.create({ data: { churchId, titlu: "Ziua mulțumirii", tip: "Serviciu divin", data: day("2026-10-04") } })).id;
    ids.group = (await prisma.group.create({ data: { churchId, nume: "Corul", membri: { create: [{ personId: head.id }] } } })).id;
    ids.campaign = (await prisma.dataCampaign.create({ data: { churchId, nume: "2026", deadline: day("2026-12-31"), generalLinkEnabled: true, generalNonce: "n1", privacyTextVersion: "1.0" } })).id;
    const meeting = await prisma.meeting.create({ data: { churchId, tip: "Comitet", data: day("2026-09-01"), nr: 3, anRegistru: 2026 } });
    const measure = (data: Record<string, unknown>) => prisma.disciplinaryMeasure.create({ data: { churchId, personId: head.id, dataInceput: day("2026-09-01"), motiv: "m", ...data } as never }).then((m) => m.id);
    ids["disciplina-convocare"] = await measure({ forma: "MUSTRARE_PERSONALA", stare: "CERCETARE", audiereLa: day("2026-11-10"), audiereOra: "18:00", audiereLoc: "Sala mică" });
    // Not communicated yet: the notice prints today's date.
    ids["disciplina-comunicare"] = await measure({ forma: "SUSPENDARE", stare: "APLICATA", meetingId: meeting.id, abatere: "a", temei: "art. 27" });
    ids["disciplina-proces-verbal"] = await measure({ forma: "SUSPENDARE", stare: "APLICATA", meetingId: meeting.id, abatere: "b", temei: "art. 27" });
    ids["disciplina-informare"] = await measure({ forma: "EXCLUDERE", stare: "APLICATA", meetingId: meeting.id });
    await prisma.asset.create({ data: { churchId, nrInventar: 1, denumire: "Pian", categorie: "Instrumente muzicale" } });
    await prisma.correspondence.create({ data: { churchId, nr: 1, an: 2026, data: day("2026-03-01"), directie: "INTRARE", dela: "Comunitatea", subiect: "Adresă" } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it.each(GENERATED_KINDS.map((k) => [k] as const))("%s: the same today and tomorrow; another after a real change", async (kind) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-28");
    const today = await hashOf(kind);
    at("2026-10-29");
    expect(await hashOf(kind), "the next day").toBe(today);
    await CHANGES[kind]();
    expect(await hashOf(kind), "after a real change").not.toBe(today);
  });

  it("the printed text of a dated document changes with the day, its fingerprint does not", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-28");
    const a = (await loadSource(current, "statistici", paramsOf("statistici")))!;
    at("2026-10-29");
    const b = (await loadSource(current, "statistici", paramsOf("statistici")))!;
    expect(blocksFingerprintText(a.spec.blocks)).not.toBe(blocksFingerprintText(b.spec.blocks));
    expect(sourceHash(a)).toBe(sourceHash(b));
  });

  it("a version saved with the old text fingerprint is checked once: unchanged → the data's fingerprint; changed → the notice stays", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-27");
    const src = (await loadSource(current, "statistici", paramsOf("statistici")))!;
    const legacy = createHash("sha256").update(blocksFingerprintText(src.spec.blocks)).digest("hex");
    const mk = (key: string, hash: string) =>
      prisma.generatedDocument.create({ data: { churchId, kind: "statistici", sourceKey: key, blocks: [], sourceHash: hash, hashVersion: 1, updatedAt: new Date("2026-10-27T09:00:00Z") } });
    const same = await mk("statistici:2026", legacy);
    const changed = await mk("statistici:2025", "un-hash-vechi-care-nu-se-potriveste");
    at("2026-10-30");
    const now = (await loadSource(current, "statistici", paramsOf("statistici")))!;
    expect(await upgradeHash(current, now, same)).toBe(sourceHash(now));
    expect(await upgradeHash(current, now, changed)).toBe(CHANGED_BEFORE);
    const rows = await prisma.generatedDocument.findMany({ where: { churchId, kind: "statistici" }, orderBy: { sourceKey: "desc" } });
    expect(rows.map((r) => [r.sourceHash === sourceHash(now), r.hashVersion])).toEqual([
      [true, HASH_VERSION],
      [false, HASH_VERSION],
    ]);
    // Idempotent: a version already moved is not touched again.
    const again = await prisma.generatedDocument.findUniqueOrThrow({ where: { id: same.id } });
    expect(await upgradeHash(current, now, again)).toBe(again.sourceHash);
  });

  it("the start-up job moves every old version once and counts the notices before and after", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at("2026-10-27");
    const legacyOf = async (kind: Kind) => createHash("sha256").update(blocksFingerprintText((await loadSource(current, kind, paramsOf(kind)))!.spec.blocks)).digest("hex");
    const mk = async (kind: Kind, key: string, hash: string) =>
      prisma.generatedDocument.create({ data: { churchId, kind, sourceKey: key, blocks: [], sourceHash: hash, hashVersion: 1, updatedAt: new Date("2026-10-27T09:00:00Z") } });
    // The inventory prints its date: yesterday's text differs today (the old notice), its data did not change.
    await mk("patrimoniu", "patrimoniu::::", await legacyOf("patrimoniu"));
    // The event's sheet prints no date: no notice before nor after.
    await mk("eveniment", `eveniment:${ids.event}`, await legacyOf("eveniment"));
    // A group whose text had really changed: the notice stays.
    await mk("grup", `grup:${ids.group}`, "un-hash-vechi");
    at("2026-10-30");
    expect(await upgradeGeneratedHashes()).toEqual({ checked: 3, noticeBefore: 2, noticeAfter: 1, missing: 0 });
    expect(await upgradeGeneratedHashes()).toEqual({ checked: 0, noticeBefore: 0, noticeAfter: 0, missing: 0 });
  });
});
