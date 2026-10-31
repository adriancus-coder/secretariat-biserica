import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { permissions, type Permission } from "@/lib/permissions";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";
import { expectNoLeak } from "../helpers/no-leak";

let current: Ctx;
let stepUp = true;
class ActionError extends Error {}
const guard = (p: Permission = "read") => {
  if (!permissions[p](current.user)) throw new Error(`FORBIDDEN:${p}`);
  return current;
};
vi.mock("@/server/session", () => ({
  ActionError,
  requireCtx: async (p?: Permission) => guard(p),
  actionCtx: async (p?: Permission) => {
    try {
      return guard(p);
    } catch {
      throw new ActionError("Nu aveți dreptul.");
    }
  },
}));
vi.mock("@/server/step-up", () => ({ hasStepUp: async () => stepUp, stepUpMethod: async () => "password" }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  redirect: (to: string) => {
    throw Object.assign(new Error(`REDIRECT:${to}`), { digest: `NEXT_REDIRECT;replace;${to};307;` });
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const { printToText } = await import("@/domain/print");
const { resolveStored, toStored } = await import("@/lib/generated-blocks");
const { GENERATED_KINDS, generatedKey } = await import("@/lib/generated-kinds");
const { applyStored, generatedRoute, loadSource, savedVersion, sourceHash } = await import("@/server/generated");
const { saveGeneratedAction, resetGeneratedAction } = await import("@/server/actions/generated");
const { listDocuments, getDocument } = await import("@/server/queries/documents");
const { loadRegister } = await import("@/server/queries/correspondence");
const { searchData } = await import("@/server/global-search");
const { buildExportJson, parseImportJson } = await import("@/server/backup-json");
const { importBackup } = await import("@/server/backup");
const { anonymizePerson } = await import("@/server/anonymize");

/** GENERATED-EDIT on the database: every kind's document, saving, the data's fingerprint, registration, permissions. */
describe.skipIf(!hasTestDb)("generated documents", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let churchId: string;
  let secretar: Ctx;
  let viewer: Ctx;
  let pastor: Ctx;
  const ids: Record<string, string> = {};
  const ctxOf = (userId: string, role: "ADMIN" | "SECRETAR" | "VIZUALIZARE" | "RUGACIUNE", extra: Partial<Ctx["user"]> = {}) =>
    ({ user: { id: userId, name: role, email: `${userId}@x.ro`, role, isPastor: false, accesDisciplina: false, churchId, churchName: "M", ...extra }, db: scopeToChurch(prisma, churchId) }) as Ctx;
  const paramsOf = (kind: (typeof GENERATED_KINDS)[number]) => {
    const p = new URLSearchParams();
    const id = { eveniment: ids.event, grup: ids.group, "afis-actualizare": ids.campaign }[kind as string] ?? (kind.startsWith("disciplina") ? ids[kind] : undefined);
    if (id) p.set("id", id);
    if (kind === "statistici" || kind === "dare-de-seama" || kind === "corespondenta") p.set("an", "2026");
    return p;
  };
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };
  const redirectOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
      if (m) return m[1];
      throw e;
    }
    return null;
  };

  beforeAll(async () => {
    await resetDatabase(prisma);
    churchId = (await prisma.church.create({ data: { nume: "Maranata", slug: "maranata", localitate: "Stavanger", comunitate: "Comunitatea Nord" } })).id;
    const mk = async (email: string, role: "ADMIN" | "SECRETAR" | "VIZUALIZARE" | "RUGACIUNE", isPastor = false) =>
      (await prisma.user.create({ data: { churchId, email, name: email, passwordHash: "x", role, isPastor } })).id;
    secretar = ctxOf(await mk("s@x.ro", "SECRETAR"), "SECRETAR");
    viewer = ctxOf(await mk("v@x.ro", "VIZUALIZARE"), "VIZUALIZARE");
    pastor = ctxOf(await mk("p@x.ro", "ADMIN", true), "ADMIN", { isPastor: true });
    const person = await prisma.person.create({ data: { churchId, nume: "Pop", prenume: "Ion", gen: "M", statut: "MEMBRU", sortKey: "pop ion", searchText: "pop ion" } });
    ids.person = person.id;
    ids.event = (await prisma.event.create({ data: { churchId, titlu: "Ziua mulțumirii", tip: "Serviciu divin", data: new Date("2026-10-04T00:00:00Z"), descriere: "Program de laudă" } })).id;
    ids.group = (await prisma.group.create({ data: { churchId, nume: "Corul", membri: { create: [{ personId: person.id }] } } })).id;
    ids.campaign = (await prisma.dataCampaign.create({ data: { churchId, nume: "2026", deadline: new Date("2026-12-31T00:00:00Z"), generalLinkEnabled: true, generalNonce: "n1", privacyTextVersion: "1.0" } })).id;
    const meeting = await prisma.meeting.create({ data: { churchId, tip: "Comitet", data: new Date("2026-09-01T00:00:00Z"), nr: 3, anRegistru: 2026 } });
    const measure = (data: Record<string, unknown>) => prisma.disciplinaryMeasure.create({ data: { churchId, personId: person.id, dataInceput: new Date("2026-09-01T00:00:00Z"), motiv: "m", ...data } as never }).then((m) => m.id);
    ids["disciplina-convocare"] = await measure({ forma: "MUSTRARE_PERSONALA", stare: "CERCETARE", audiereLa: new Date("2026-11-10T00:00:00Z"), audiereOra: "18:00", audiereLoc: "Sala mică" });
    ids["disciplina-comunicare"] = await measure({ forma: "SUSPENDARE", stare: "APLICATA", meetingId: meeting.id, abatere: "a", temei: "art. 27" });
    ids["disciplina-proces-verbal"] = ids["disciplina-comunicare"];
    ids["disciplina-informare"] = await measure({ forma: "EXCLUDERE", stare: "APLICATA", meetingId: meeting.id });
    await prisma.asset.create({ data: { churchId, nrInventar: 1, denumire: "Pian", categorie: "Instrumente muzicale" } });
    await prisma.correspondence.create({ data: { churchId, nr: 1, an: 2026, data: new Date("2026-03-01T00:00:00Z"), directie: "INTRARE", dela: "Comunitatea", subiect: "Adresă" } });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it.each(GENERATED_KINDS.map((k) => [k] as const))("%s: the unedited model renders the same document as before", async (kind) => {
    current = pastor;
    const src = (await loadSource(pastor, kind, paramsOf(kind)))!;
    expect(src, kind).not.toBeNull();
    const back = resolveStored(JSON.parse(JSON.stringify(toStored(src.spec.blocks))), src.spec.blocks);
    expect(printToText({ ...src.spec, blocks: back })).toBe(printToText(src.spec));
    // The route answers with the PDF.
    const id = paramsOf(kind).get("id") ?? undefined;
    const res = await generatedRoute(kind, new Request(`http://localhost/x?${paramsOf(kind)}`), id);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(500);
  });

  it("MINUTES-SIGNATURES: a church named „Biserica …” is written once in every generated document", async () => {
    current = pastor;
    await prisma.church.update({ where: { id: churchId }, data: { nume: "Biserica Penticostală Maranata" } });
    try {
      for (const kind of GENERATED_KINDS) {
        const text = printToText((await loadSource(pastor, kind, paramsOf(kind)))!.spec);
        expect(text.split("\n")[0], kind).toBe("Biserica Penticostală Maranata");
        expect(text, kind).not.toMatch(/biserica\s+biserica/i);
      }
    } finally {
      await prisma.church.update({ where: { id: churchId }, data: { nume: "Maranata" } });
    }
  });

  it("an event: save an edited paragraph, reopen it, the route serves it; changed data shows; remake from data", async () => {
    current = secretar;
    const p = paramsOf("eveniment");
    const src = (await loadSource(secretar, "eveniment", p))!;
    const blocks = toStored(src.spec.blocks).map((b) => (b.type === "para" && b.pre ? { type: "rich" as const, doc: { type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Program nou, editat" }] }] } } : b));
    const target = await redirectOf(saveGeneratedAction("eveniment", p.toString(), {}, form({ blocks: JSON.stringify(blocks), scop: "salvare" })));
    expect(target).toContain("/editare-document?");
    const saved = (await savedVersion(secretar, generatedKey("eveniment", { id: ids.event })))!;
    expect([saved.sourceHash, saved.hashVersion]).toEqual([sourceHash(src), 2]);
    expect(printToText(applyStored(src.spec, saved.blocks, saved.layout))).toContain("Program nou, editat");
    // The data change: the fingerprint differs (the page shows „Datele s-au schimbat”), nothing is overwritten.
    await prisma.event.update({ where: { id: ids.event }, data: { invitat: "Pastor Ionescu" } });
    const fresh = (await loadSource(secretar, "eveniment", p))!;
    expect(sourceHash(fresh)).not.toBe(saved.sourceHash);
    expect(printToText(applyStored(fresh.spec, (await savedVersion(secretar, saved.sourceKey))!.blocks, null))).toContain("Program nou, editat");
    // A viewer previews but does not save.
    current = viewer;
    expect((await saveGeneratedAction("eveniment", p.toString(), {}, form({ blocks: JSON.stringify(blocks) })))?.message).toBeTruthy();
    // „Reface din date”.
    current = secretar;
    expect(await redirectOf(resetGeneratedAction("eveniment", p.toString()))).toContain("mesaj=");
    expect(await savedVersion(secretar, saved.sourceKey)).toBeNull();
  });

  it("statistics: an edited cell is saved; a picture or a bad table from the form is refused", async () => {
    current = secretar;
    const p = paramsOf("statistici");
    const src = (await loadSource(secretar, "statistici", p))!;
    const stored = toStored(src.spec.blocks);
    const t = stored.findIndex((b) => b.type === "table");
    const table = stored[t] as Extract<(typeof stored)[number], { type: "table" }>;
    stored[t] = { ...table, rows: table.rows.map((r, i) => (i === 0 ? [r[0], "999", ...r.slice(2)] : r)) };
    await redirectOf(saveGeneratedAction("statistici", p.toString(), {}, form({ blocks: JSON.stringify(stored) })));
    const saved = (await savedVersion(secretar, generatedKey("statistici", { an: 2026 })))!;
    expect(printToText(applyStored(src.spec, saved.blocks, null))).toContain("999");
    const bad = await saveGeneratedAction("statistici", p.toString(), {}, form({ blocks: JSON.stringify([{ type: "image", png: [1], width: 9, alt: "x" }]) }));
    expect(bad?.errors?.blocks).toBeTruthy();
  });

  it("disciplinary acts: without `disciplina` refused on opening, preview, saving and download; with it, registered as a confidential document", async () => {
    const p = paramsOf("disciplina-convocare");
    current = secretar;
    await expect(generatedRoute("disciplina-convocare", new Request("http://localhost/x"), ids["disciplina-convocare"])).rejects.toThrow("FORBIDDEN:disciplina");
    const { POST } = await import("@/app/pdf/editare-document/previzualizare/route");
    await expect(POST(new Request("http://localhost/x", { method: "POST", body: form({ sursa: "disciplina-convocare", parametri: p.toString(), blocks: "[]" }) }))).rejects.toThrow("FORBIDDEN:disciplina");
    expect((await saveGeneratedAction("disciplina-convocare", p.toString(), {}, form({ blocks: "[]" })))?.message).toBe("Nu aveți dreptul.");
    // Without the step-up, even a pastor is sent back.
    current = pastor;
    stepUp = false;
    await expect(generatedRoute("disciplina-convocare", new Request("http://localhost/x"), ids["disciplina-convocare"])).rejects.toThrow(/REDIRECT:\/persoane\/.*\/disciplina/);
    stepUp = true;
    // „Înregistrează”: a number in the register, CIORNA (the church has a pastor), confidential.
    const src = (await loadSource(pastor, "disciplina-convocare", p))!;
    const target = await redirectOf(saveGeneratedAction("disciplina-convocare", p.toString(), {}, form({ blocks: JSON.stringify(toStored(src.spec.blocks)), scop: "inregistrare" })));
    const docId = /\/documente\/([^?]+)/.exec(target!)![1];
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
    expect([doc.nr, doc.anRegistru, doc.stare, doc.confidential, doc.tip]).toEqual([1, Number(doc.data.toISOString().slice(0, 4)), "CIORNA", true, "scrisoare"]);
    expect(doc.text).toContain("CONVOCARE LA AUDIERE");
    // The version is read-only now.
    expect((await saveGeneratedAction("disciplina-convocare", p.toString(), {}, form({ blocks: "[]" })))?.message).toMatch(/înregistrat/);
    // The register's exit and the document: only with `disciplina`.
    const year = doc.anRegistru;
    expect((await loadRegister(pastor, year)).some((r) => r.documentId === docId)).toBe(true);
    expect((await loadRegister(secretar, year)).some((r) => r.documentId === docId)).toBe(false);
    expect((await listDocuments(secretar, { page: 1, year: null })).items.map((d) => d.id)).not.toContain(docId);
    expect(await getDocument(secretar, docId)).toBeNull();
    expect(await getDocument(pastor, docId)).not.toBeNull();
    const search = await searchData(secretar, "convocare", 5, "documente");
    expect(JSON.stringify(search)).not.toContain(docId);
    // The backup of a user without `disciplina` carries neither the act nor the disciplinary versions.
    current = secretar;
    const { data } = await buildExportJson(secretar);
    expect(JSON.stringify(data)).not.toContain(docId);
    expectNoLeak(data.documenteGenerate, [/disciplina-/]);
  });

  it("the backup keeps the saved versions; anonymising deletes the unregistered ones naming the person", async () => {
    current = secretar;
    const p = paramsOf("grup");
    const src = (await loadSource(secretar, "grup", p))!;
    await redirectOf(saveGeneratedAction("grup", p.toString(), {}, form({ blocks: JSON.stringify(toStored(src.spec.blocks)) })));
    current = pastor;
    const { data } = await buildExportJson(pastor);
    const parsed = parseImportJson(JSON.parse(JSON.stringify(data)));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    expect(parsed.extras.generated?.map((g) => g.tip)).toEqual(expect.arrayContaining(["grup", "statistici", "disciplina-convocare"]));
    await prisma.generatedDocument.deleteMany({ where: { churchId, kind: "grup" } });
    await importBackup(pastor, parsed.backup, "merge", parsed.extras);
    expect(await prisma.generatedDocument.count({ where: { churchId, kind: "grup" } })).toBe(1);
    await anonymizePerson(pastor, ids.person);
    expect(await prisma.generatedDocument.count({ where: { churchId, kind: "grup" } })).toBe(0);
    // The registered act stays (an official record, like the documents).
    expect(await prisma.generatedDocument.count({ where: { churchId, kind: "disciplina-convocare", documentId: { not: null } } })).toBe(1);
  });

  it("the Rugăciune role reaches nothing", async () => {
    current = ctxOf((await prisma.user.create({ data: { churchId, email: "r@x.ro", name: "R", passwordHash: "x", role: "RUGACIUNE" } })).id, "RUGACIUNE");
    await expect(generatedRoute("statistici", new Request("http://localhost/x"))).rejects.toThrow("FORBIDDEN:read");
    expect((await saveGeneratedAction("statistici", "", {}, form({ blocks: "[]" })))?.message).toBe("Nu aveți dreptul.");
  });
});
