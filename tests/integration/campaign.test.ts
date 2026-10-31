import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMissingLinks, privacyVersionOf } from "@/server/campaigns";
import { adultChildren, resolvePersonalLink, selfSnapshot, writeOnlineConsents } from "@/server/data-update";
import { selfChanges } from "@/lib/data-update-review";
import { applyDecision } from "@/server/review";
import { importBackup } from "@/server/backup";
import { buildExportJson, parseImportJson } from "@/server/backup-json";
import { hashToken, linkToken } from "@/server/campaign-tokens";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";
import { expectNoLeak } from "../helpers/no-leak";

vi.mock("@/server/session", () => ({ ActionError: class ActionError extends Error {} }));
vi.mock("@/server/db", async () => ({ prisma: (await import("./helpers")).testPrisma() }));

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

  it("names the notice version: the model's number for the model, a hash for a church's own text", () => {
    expect(privacyVersionOf({ privacyText: "" })).toBe("1.0");
    expect(privacyVersionOf({ privacyText: "  " })).toBe("1.0");
    expect(privacyVersionOf({ privacyText: "Nota noastră" })).toMatch(/^text-[0-9a-f]{16}$/);
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

  it("closes a personal link once the secretariat accepted the answer (fully or partly), not before or after a rejection", async () => {
    const link = await ctx.db.dataUpdateLink.findFirstOrThrow({ where: { personId: ids.adult } });
    const token = linkToken(link.id, link.nonce);
    expect((await resolvePersonalLink(token)).state).toBe("ok");
    const sub = await ctx.db.dataUpdateSubmission.create({ data: { campaignId: link.campaignId, linkId: link.id, personId: ids.adult, via: "PERSONAL", proposed: {} } as never });
    expect((await resolvePersonalLink(token)).state).toBe("ok");
    await ctx.db.dataUpdateSubmission.update({ where: { id: sub.id }, data: { status: "REJECTED" } });
    expect((await resolvePersonalLink(token)).state).toBe("ok");
    for (const status of ["PARTIAL", "ACCEPTED"] as const) {
      await ctx.db.dataUpdateSubmission.update({ where: { id: sub.id }, data: { status } });
      expect((await resolvePersonalLink(token)).state).toBe("accepted");
    }
    // The other adult's link stays open.
    const other = await ctx.db.dataUpdateLink.findFirstOrThrow({ where: { personId: ids["fara-data"] } });
    expect((await resolvePersonalLink(linkToken(other.id, other.nonce))).state).toBe("ok");
    await ctx.db.dataUpdateSubmission.delete({ where: { id: sub.id } });
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

  describe("the secretary's decision (De verificat)", () => {
    const consents = { PHOTOS: true, BIRTHDAY: true, CONTACT: false, DIRECTORY: false };
    const childConsents = { PHOTOS: false, BIRTHDAY: true, CONTACT: false, DIRECTORY: false };
    const self = (over: Record<string, unknown> = {}) => ({
      nume: "Vlad",
      prenume: "Maria",
      gen: "F",
      dataNasterii: "1985-03-03",
      dataCasatoriei: null,
      necasatorit: false,
      telefon: "+47 911 11 111",
      email: "",
      adresa: "",
      codPostal: "",
      localitate: "",
      dataBotez: "2003-06-01",
      botezAn: 2003,
      botezBiserica: "",
      botezLocalitate: "",
      botezOficiant: "",
      numeTata: "",
      numeMama: "",
      ...over,
    });
    let mother = "";
    let campaignId = "";
    const submit = async (proposed: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      (await ctx.db.dataUpdateSubmission.create({ data: { campaignId, personId: mother, via: "PERSONAL", proposed, ...extra } as never })).id;

    beforeAll(async () => {
      const churchId = ctx.user.churchId;
      mother = (
        await prisma.person.create({
          data: { churchId, nume: "Vlad", prenume: "Maria", gen: "F", statut: "MEMBRU", sortKey: "vlad maria", searchText: "x", dataNasterii: new Date("1985-03-03"), telefon: "+47 900 00 000", dataBotez: new Date("2003-06-01"), botezAn: 2003 },
        })
      ).id;
      campaignId = (await ctx.db.dataCampaign.findFirstOrThrow()).id;
    });

    it("accepting only the phone updates the person and creates no child", async () => {
      const id = await submit({ self: self(), children: [{ id: null, nume: "Vlad", prenume: "Ioan", gen: "M", dataNasterii: "2019-01-01", dataBinecuvantare: null, consents: childConsents }], consents, nota: true });
      await applyDecision(ctx, id, { decizie: "selectate", nota: "", chosen: new Set(["s:telefon"]) });
      const p = await ctx.db.person.findUniqueOrThrow({ where: { id: mother } });
      expect(p.telefon).toBe("+47 911 11 111");
      expect(p.searchText).toContain("4791111111");
      expect(await ctx.db.person.count({ where: { prenume: "Ioan" } })).toBe(0);
      expect((await ctx.db.dataUpdateSubmission.findUniqueOrThrow({ where: { id } })).status).toBe("PARTIAL");
      const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { entity: "PERSON", entityId: mother }, orderBy: { createdAt: "desc" } });
      expect(JSON.stringify(audit.changes)).toContain("Actualizare date");
    });

    it("a proposed postal code shows as its own change and, once approved, reaches the register (and the audit log)", async () => {
      const proposed = self({ telefon: "+47 911 11 111", adresa: "Ulveveien 20", codPostal: "4323", localitate: "Sandnes" });
      const id = await submit({ self: proposed, children: [], consents, nota: true });
      const register = selfSnapshot(await ctx.db.person.findUniqueOrThrow({ where: { id: mother } }));
      expect(selfChanges(register, proposed as never).find((c) => c.field === "codPostal")).toMatchObject({ label: "Cod poștal", before: "—", after: "4323" });
      await applyDecision(ctx, id, { decizie: "selectate", nota: "", chosen: new Set(["s:codPostal", "s:localitate"]) });
      const p = await ctx.db.person.findUniqueOrThrow({ where: { id: mother } });
      expect([p.adresa, p.codPostal, p.localitate]).toEqual(["", "4323", "Sandnes"]);
      const audit = await ctx.db.auditLog.findFirstOrThrow({ where: { entity: "PERSON", entityId: mother }, orderBy: { createdAt: "desc" } });
      expect(JSON.stringify(audit.changes)).toContain("codPostal");
    });

    it("consents of an answer that did not record the notice keep the campaign's version", async () => {
      const id = await submit({ self: self(), children: [{ id: null, nume: "Vlad", prenume: "Ana", gen: "F", dataNasterii: "2020-01-01", dataBinecuvantare: null, consents: childConsents }], consents, nota: true });
      await applyDecision(ctx, id, { decizie: "toate", nota: "", chosen: new Set() });
      const versions = (await ctx.db.consent.findMany({ where: { submissionId: id } })).map((c) => c.textVersion);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions.every((v) => v === "v")).toBe(true);
    });

    it("accepting everything creates the child in the mother's family, as an aparținător, with the parent's consents", async () => {
      const id = await submit({ self: self({ adresa: "Stavanger" }), children: [{ id: null, nume: "Vlad", prenume: "Ioan", gen: "M", dataNasterii: "2019-01-01", dataBinecuvantare: null, consents: childConsents }], consents, nota: true });
      await applyDecision(ctx, id, { decizie: "toate", nota: "", chosen: new Set() });
      const m = await ctx.db.person.findUniqueOrThrow({ where: { id: mother } });
      const child = await ctx.db.person.findFirstOrThrow({ where: { prenume: "Ioan" } });
      expect(m.adresa).toBe("Stavanger");
      expect(child.familyId).toBe(m.familyId);
      expect(m.familyId).not.toBeNull();
      expect([child.statut, child.rudenie]).toEqual(["APARTINATOR", "Fiu"]);
      const family = await ctx.db.family.findUniqueOrThrow({ where: { id: m.familyId! } });
      expect(family.headId).toBe(mother);
      const cs = await ctx.db.consent.findMany({ where: { personId: child.id } });
      expect(cs.map((c) => c.kind).sort()).toEqual(["BIRTHDAY", "CONTACT", "DIRECTORY", "PHOTOS"]);
      expect(cs.every((c) => c.givenByPersonId === mother)).toBe(true);
      expect((await ctx.db.dataUpdateSubmission.findUniqueOrThrow({ where: { id } })).status).toBe("ACCEPTED");
    });

    it("an unmatched general submission is linked to the chosen person and its consents are written then", async () => {
      const id = (
        await ctx.db.dataUpdateSubmission.create({
          data: { campaignId, personId: null, via: "GENERAL", proposed: { self: self({ email: "maria@x.no" }), children: [], consents, nota: true, typed: { nume: "Maria V", telefon: "1" }, versiuneNota: "1.0" } } as never,
        })
      ).id;
      const before = await ctx.db.consent.count({ where: { personId: mother } });
      await applyDecision(ctx, id, { decizie: "toate", nota: "", chosen: new Set(), persoana: mother });
      expect((await ctx.db.person.findUniqueOrThrow({ where: { id: mother } })).email).toBe("maria@x.no");
      expect(await ctx.db.consent.count({ where: { personId: mother } })).toBe(before + 5);
      // The consents refer to the notice the person saw when answering (1.0), not the campaign's start.
      expect(new Set((await ctx.db.consent.findMany({ where: { submissionId: id } })).map((c) => c.textVersion))).toEqual(new Set(["1.0"]));
      expect((await ctx.db.dataUpdateSubmission.findUniqueOrThrow({ where: { id } })).personId).toBe(mother);
    });

    it("the unmarried flag is proposed, enters the register only on approval, and a date replaces it", async () => {
      const id = await submit({ self: self({ necasatorit: true }), children: [], consents, nota: true });
      expect((await ctx.db.person.findUniqueOrThrow({ where: { id: mother } })).necasatorit).toBe(false);
      await applyDecision(ctx, id, { decizie: "selectate", nota: "", chosen: new Set(["s:dataCasatoriei"]) });
      const flagged = await ctx.db.person.findUniqueOrThrow({ where: { id: mother } });
      expect([flagged.necasatorit, flagged.dataCasatoriei]).toEqual([true, null]);
      const next = await submit({ self: self({ necasatorit: false, dataCasatoriei: "2010-05-01" }), children: [], consents, nota: true });
      await applyDecision(ctx, next, { decizie: "selectate", nota: "", chosen: new Set(["s:dataCasatoriei"]) });
      const back = await ctx.db.person.findUniqueOrThrow({ where: { id: mother } });
      expect([back.necasatorit, back.dataCasatoriei?.toISOString().slice(0, 10)]).toEqual([false, "2010-05-01"]);
    });

    it("a rejection changes nothing and keeps the note; a decided submission cannot be decided again", async () => {
      const id = await submit({ self: self({ telefon: "+47 999 99 999" }), children: [], consents, nota: true });
      await applyDecision(ctx, id, { decizie: "respinge", nota: "număr greșit", chosen: new Set() });
      expect((await ctx.db.person.findUniqueOrThrow({ where: { id: mother } })).telefon).toBe("+47 911 11 111");
      expect(await ctx.db.dataUpdateSubmission.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "REJECTED", note: "număr greșit" });
      await expect(applyDecision(ctx, id, { decizie: "toate", nota: "", chosen: new Set() })).rejects.toThrow("deja verificat");
    });
  });

  it("exports campaigns (never their tokens) and consents, and imports them into another church", async () => {
    const json = JSON.parse(JSON.stringify((await buildExportJson(ctx)).data));
    expect(json.campaigns.length).toBeGreaterThan(0);
    expectNoLeak(json.campaigns, [/nonce|tokenHash|generalTokenHash/]);
    expect(json).not.toHaveProperty("links");
    expect(json.consents.length).toBe(await ctx.db.consent.count());
    const other = await prisma.church.create({ data: { nume: "Alta", slug: "alta-campanie" } });
    const user = await prisma.user.create({ data: { churchId: other.id, email: "o@x.ro", name: "O", passwordHash: "x", role: "ADMIN" } });
    const otherCtx = { user: { id: user.id, name: "O", email: "o@x.ro", role: "ADMIN", churchId: other.id, churchName: "Alta" }, db: scopeToChurch(prisma, other.id) } as Ctx;
    const parsed = parseImportJson(json);
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    await importBackup(otherCtx, parsed.backup, "merge", parsed.extras);
    expect(await otherCtx.db.consent.count()).toBe(json.consents.length);
    const c = await otherCtx.db.dataCampaign.findFirstOrThrow();
    expect([c.churchId, c.generalLinkEnabled, c.generalTokenHash]).toEqual([other.id, false, null]);
    // Importing a church's own file again (merge) does not duplicate its answers.
    await importBackup(ctx, parsed.backup, "merge", parsed.extras);
    expect(await ctx.db.consent.count()).toBe(json.consents.length);
  });
});
