import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMissingLinks } from "@/server/campaigns";
import { adultChildren, writeOnlineConsents } from "@/server/data-update";
import { hashToken, linkToken } from "@/server/campaign-tokens";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {} }));

describe.skipIf(!hasTestDb)("data-update campaign", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "integration-secret-for-campaign-tokens-000";
    await resetDatabase(prisma);
    const church = await prisma.church.create({ data: { nume: "Campanie", slug: "campanie" } });
    const user = await prisma.user.create({ data: { churchId: church.id, email: "c@x.ro", name: "C", passwordHash: "x", role: "ADMIN" } });
    ctx = { user: { id: user.id, name: "C", email: "c@x.ro", role: "ADMIN", churchId: church.id, churchName: "Campanie" }, db: scopeToChurch(prisma, church.id) } as Ctx;
    const mk = async (key: string, data: Record<string, unknown>) => {
      ids[key] = (await prisma.person.create({ data: { churchId: church.id, nume: "Pop", prenume: key, sortKey: `pop ${key}`, searchText: key, ...data } })).id;
    };
    await mk("adult", { dataNasterii: new Date("1980-01-01"), telefon: "+47 921 00 001" });
    await mk("fara-data", {});
    await mk("minor", { dataNasterii: new Date("2015-01-01") });
    await mk("iesit", { dataNasterii: new Date("1970-01-01"), dataIesire: new Date("2025-01-01"), statut: "FOST_MEMBRU" });
    await mk("sters", { nume: "Persoană ștearsă" });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("gives one personal link to each adult in the record, once; the token is only reproducible, never stored", async () => {
    const campaign = await ctx.db.dataCampaign.create({ data: { nume: "Toamnă", deadline: new Date("2026-12-01"), privacyTextVersion: "v" } as never });
    expect(await ctx.db.$transaction((tx) => createMissingLinks(tx, ctx.user.churchId, campaign))).toBe(2);
    expect(await ctx.db.$transaction((tx) => createMissingLinks(tx, ctx.user.churchId, campaign))).toBe(0);
    const links = await ctx.db.dataUpdateLink.findMany();
    expect(links.map((l) => l.personId).sort()).toEqual([ids.adult, ids["fara-data"]].sort());
    for (const l of links) {
      const token = linkToken(l.id, l.nonce);
      expect(l.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(l)).not.toContain(token);
    }
  });

  it("finds the adult's own minor children only, and writes the online consents (a parent's for a minor)", async () => {
    const churchId = ctx.user.churchId;
    const head = await prisma.person.create({ data: { churchId, nume: "Ene", prenume: "Tata", sortKey: "ene tata", searchText: "x", dataNasterii: new Date("1980-01-01") } });
    const family = await prisma.family.create({ data: { churchId, nume: "Fam. Ene", headId: head.id } });
    const mk = (prenume: string, data: Record<string, unknown>) =>
      prisma.person.create({ data: { churchId, nume: "Ene", prenume, sortKey: `ene ${prenume}`, searchText: "x", familyId: family.id, ...data } });
    const kid = await mk("Copil", { dataNasterii: new Date("2016-05-05"), rudenie: "Fiu" });
    await mk("Mare", { dataNasterii: new Date("2000-01-01"), rudenie: "Fiu" });
    const grandma = await mk("Bunica", { dataNasterii: new Date("1950-01-01"), rudenie: "Părinte" });
    await prisma.person.update({ where: { id: head.id }, data: { familyId: family.id } });
    const adult = await ctx.db.person.findUniqueOrThrow({ where: { id: head.id }, include: { family: { select: { headId: true } } } });
    expect((await adultChildren(ctx.db, adult)).map((c) => c.id)).toEqual([kid.id]);
    const other = await ctx.db.person.findUniqueOrThrow({ where: { id: grandma.id }, include: { family: { select: { headId: true } } } });
    expect((await adultChildren(ctx.db, other)).map((c) => c.id)).toEqual([kid.id]);
    const campaign = await ctx.db.dataCampaign.findFirstOrThrow();
    const submission = await ctx.db.dataUpdateSubmission.create({ data: { campaignId: campaign.id, personId: head.id, via: "PERSONAL", proposed: {} } as never });
    await ctx.db.$transaction(async (tx) => {
      const base = { churchId, submissionId: submission.id, textVersion: "v1" };
      await writeOnlineConsents(tx, { ...base, personId: head.id, answers: { PHOTOS: true, BIRTHDAY: false, CONTACT: true, DIRECTORY: false }, nota: true });
      await writeOnlineConsents(tx, { ...base, personId: kid.id, answers: { PHOTOS: false, BIRTHDAY: true, CONTACT: false, DIRECTORY: false }, nota: false, givenByPersonId: head.id });
    });
    const rows = await ctx.db.consent.findMany({ orderBy: { kind: "asc" } });
    expect(rows.filter((r) => r.personId === head.id).map((r) => `${r.kind}:${r.granted}`).sort()).toEqual(["BIRTHDAY:false", "CONTACT:true", "DIRECTORY:false", "INFO_NOTE:true", "PHOTOS:true"]);
    expect(rows.filter((r) => r.personId === kid.id).every((r) => r.givenByPersonId === head.id && r.source === "ONLINE" && r.textVersion === "v1")).toBe(true);
    expect(rows.filter((r) => r.personId === kid.id).map((r) => r.kind)).not.toContain("INFO_NOTE");
  });
});
