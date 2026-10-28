import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { aliasesToJson, parseAliasesJson } from "@/lib/aliases-backup";
import { pickedNames } from "@/lib/minutes-import";
import type { MinutesDraft } from "@/domain/minutes-parse";
import { importBackup, loadAliases, loadBackup } from "@/server/backup";
import { reviewDraft } from "@/server/minutes-import";
import { loadAliasMap, rememberAliases } from "@/server/person-aliases";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

// reviewDraft reads the church's meeting types through the global client; the test DB is reached through ctx.
vi.mock("@/server/queries/church", () => ({ getChurch: async () => ({ nomen: { tipuriSedinte: ["Comitet"] }, pastor: "" }) }));

const draft = (prezenti: string[]): MinutesDraft => ({
  nr: null,
  data: "2025-03-01",
  tip: "Comitet",
  prezenti,
  numarPrezenti: null,
  absenti: [],
  invitati: [],
  puncte: [],
  formulaIncheiere: null,
  secretar: null,
  pastor: null,
});

describe.skipIf(!hasTestDb)("remembered forms of names (aliases)", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({ user: { id: userId, name: "S", email: `${userId}@x.ro`, role: "SECRETAR", churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) }) as Ctx;
  let ctx: Ctx;
  let target: Ctx;
  let marius: string;
  let daniel: string;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [a, b] = await Promise.all(["sursa", "tinta"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all(
      [a, b].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `al${i}@x.ro`, name: "S", passwordHash: "x", role: "SECRETAR" } })),
    );
    ctx = ctxFor(a.id, ua.id);
    target = ctxFor(b.id, ub.id);
    marius = (await ctx.db.person.create({ data: { nume: "Pop", prenume: "Ion Marius" } as never })).id;
    daniel = (await ctx.db.person.create({ data: { nume: "Pop", prenume: "Ion Daniel" } as never })).id;
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("a name resolved once by hand matches automatically on the next import", async () => {
    const first = await reviewDraft(ctx, "pv.docx", draft(["Ion Pop"]), []);
    expect(first.selected).toEqual([]);
    expect(first.unmatched).toEqual([{ name: "Ion Pop", candidates: [marius, daniel] }]);

    // "Adaugă ca invitat" remembers nothing; picking a person does.
    expect(pickedNames(first, {})).toEqual([]);
    const picks = pickedNames(first, { "Ion Pop": daniel });
    await ctx.db.$transaction((tx) => rememberAliases(tx, ctx.user, picks));
    expect([...(await loadAliasMap(ctx))]).toEqual([["ion pop", daniel]]);
    const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { entity: "PERSON", entityId: daniel } });
    expect(audit.changes).toMatchObject({ formaNumelui: "adăugată: ion pop" });

    const second = await reviewDraft(ctx, "pv.docx", draft(["POP Ion"]), []);
    expect(second.selected).toEqual([daniel]);
    expect(second.approx).toEqual([{ name: "POP Ion", personId: daniel, how: "alias" }]);
    expect(second.unmatched).toEqual([]);
  });

  it("export → import carries the aliases to the imported persons", async () => {
    const data = toPrototypeJson(await loadBackup(ctx));
    const json = JSON.parse(JSON.stringify({ ...data, aliases: aliasesToJson(await loadAliases(ctx)) }));
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(target, parsed.backup, "replace", { aliases: parseAliasesJson(json) });
    const rows = await target.db.personAlias.findMany({ include: { person: { select: { prenume: true } } } });
    expect(rows.map((r) => [r.alias, r.person.prenume, r.churchId])).toEqual([["ion pop", "Ion Daniel", target.user.churchId]]);
    expect(parseAliasesJson({ members: {} })).toBeNull();
  });

  it("deleting the alias falls back to the partial rule", async () => {
    await ctx.db.personAlias.deleteMany({});
    const again = await reviewDraft(ctx, "pv.docx", draft(["Ion Pop"]), []);
    expect(again.unmatched).toEqual([{ name: "Ion Pop", candidates: [marius, daniel] }]);
  });
});
