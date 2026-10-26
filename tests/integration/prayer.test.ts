import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

// The actions run with the context set by each test (the real session needs a request).
let current: Ctx;
vi.mock("@/server/session", () => ({
  ActionError: class ActionError extends Error {},
  actionCtx: async () => current,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { loadPrayerPage, PRAYER_FAMILY_SELECT, PRAYER_MEMBER_SELECT, PRAYER_PERSON_SELECT } = await import("@/server/queries/prayer");
const { applyDecision } = await import("@/server/review");
const { cancelPrayerWeekAction, markPrayerWeekAction, prayerSharedAction, setPrayerPrefsAction } = await import("@/server/actions/prayer");

/** The weekly prayer: who is in the rotation, what is shown, and nothing else from the register. */
describe.skipIf(!hasTestDb)("weekly prayer", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  let ctx: Ctx;
  let other: Ctx;
  const fam: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [ca, cb] = await Promise.all(["rug-a", "rug-b"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const ua = await prisma.user.create({ data: { churchId: ca.id, email: "r@x.ro", name: "R", passwordHash: "x", role: "RUGACIUNE" } });
    const ub = await prisma.user.create({ data: { churchId: cb.id, email: "rb@x.ro", name: "RB", passwordHash: "x", role: "SECRETAR" } });
    ctx = { user: { id: ua.id, name: "R", email: "r@x.ro", role: "RUGACIUNE", isPastor: false, churchId: ca.id, churchName: "A" }, db: scopeToChurch(prisma, ca.id) } as Ctx;
    other = { user: { id: ub.id, name: "RB", email: "rb@x.ro", role: "SECRETAR", isPastor: false, churchId: cb.id, churchName: "B" }, db: scopeToChurch(prisma, cb.id) } as Ctx;
    const person = (churchId: string, nume: string, prenume: string, data: Record<string, unknown> = {}) =>
      prisma.person.create({ data: { churchId, nume, prenume, sortKey: `${nume} ${prenume}`, searchText: prenume, telefon: "+47 900 11 222", email: `${prenume}@x.no`, adresa: "Strada 1", ...data } });
    const family = async (churchId: string, key: string, nume: string, members: [string, Record<string, unknown>][], data: Record<string, unknown> = {}) => {
      const f = await prisma.family.create({ data: { churchId, nume: `Fam. ${nume}`, ...data } });
      fam[key] = f.id;
      const ids = [];
      for (const [prenume, extra] of members) ids.push((await person(churchId, nume, prenume, { familyId: f.id, ...extra })).id);
      await prisma.family.update({ where: { id: f.id }, data: { headId: ids[0] } });
    };
    await family(ca.id, "popescu", "Popescu", [
      ["Ion", { rudenie: "Cap de familie", dataNasterii: new Date("1980-01-01") }],
      ["Maria", { rudenie: "Soție", dataNasterii: new Date("1982-01-01") }],
      ["Ana", { rudenie: "Fiică", dataNasterii: new Date("2016-01-01"), statut: "APARTINATOR" }],
    ]);
    await family(ca.id, "barbu", "Barbu", [["Vasile", { rudenie: "Cap de familie" }], ["Ioana", { rudenie: "Soție" }], ["Matei", { rudenie: "Fiu", gen: "M", dataNasterii: new Date("2018-01-01"), statut: "APARTINATOR" }]], { prayerIncludeChildren: true });
    await family(ca.id, "nu", "Ciobanu", [["Petru", { rudenie: "Cap de familie" }]], { prayerOptOut: true });
    await family(ca.id, "fost", "Dobre", [["Dan", { rudenie: "Cap de familie", statut: "FOST_MEMBRU", dataIesire: new Date("2024-01-01") }]]);
    await family(cb.id, "altabiserica", "Enache", [["Eva", { rudenie: "Cap de familie" }]]);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("reads only names, status, exit, birth date and relation: no contact data, notes or roles", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(PRAYER_MEMBER_SELECT)).toEqual(["dataCasatoriei", "dataIesire", "dataNasterii", "gen", "id", "nume", "prenume", "rudenie", "statut"]);
    expect(keys(PRAYER_PERSON_SELECT)).toEqual([...keys(PRAYER_MEMBER_SELECT), "prayerIncludeChildren", "prayerOptOut"].sort());
    expect(keys(PRAYER_FAMILY_SELECT)).toEqual(["headId", "id", "members", "prayerIncludeChildren", "prayerOptOut"]);
    const all = JSON.stringify([PRAYER_MEMBER_SELECT, PRAYER_PERSON_SELECT, PRAYER_FAMILY_SELECT]);
    for (const field of ["telefon", "email", "adresa", "note", "roles", "groups", "searchText"]) expect(all).not.toContain(field);
  });

  it("shows the next family by name only; the opted-out, former members and other churches are not in the rotation", async () => {
    const d = await loadPrayerPage(ctx, 0);
    expect(d.total).toBe(2);
    expect(d.next?.label).toBe("Familia Barbu: Vasile și Ioana, cu copilul Matei");
    const popescu = await loadPrayerPage(ctx, 1);
    expect(popescu.next?.label).toBe("Familia Popescu: Ion și Maria");
    // No consent for the children: the message names none, and Ana's name is nowhere in the page data.
    expect(popescu.message).toBe(
      "Pace, frați și surori! Săptămâna aceasta ne vom ruga pentru familia Popescu Ion și Maria și pentru copilul lor, ca Domnul să-i binecuvânteze cu sănătate și cu dragoste de Domnul și să le dea înțelepciune în toate. Amin.",
    );
    expect(JSON.stringify(popescu)).not.toMatch(/Ana|2016/);
    expect(popescu.review).toBeNull();
    // With consent (Barbu), the little boy is named.
    expect(d.message).toContain("familia Barbu Vasile și Ioana și pentru micuțul Matei, ca Domnul");
    const text = JSON.stringify(d);
    for (const hidden of ["Ciobanu", "Dobre", "Enache", "900", "@x.no", "Strada", "2016", "2018"]) expect(text).not.toContain(hidden);
    // The page data is the label and the key, nothing more.
    expect(Object.keys(d.next!).sort()).toEqual(["key", "label"]);
  });

  it("marks once per week, cancels, and audits without the family's name", async () => {
    current = ctx;
    const next = (await loadPrayerPage(ctx, 0)).next!;
    expect((await markPrayerWeekAction(next.key)).ok).toBe(true);
    expect((await markPrayerWeekAction(next.key)).message).toContain("deja marcată");
    let d = await loadPrayerPage(ctx, 0);
    expect(d.marked?.label).toBe(next.label);
    expect(d.history.map((h) => h.label)).toEqual([next.label]);
    await prayerSharedAction("whatsapp");
    const log = await prisma.auditLog.findMany({ where: { entity: "PRAYER" } });
    expect(log).toHaveLength(2);
    expect(JSON.stringify(log)).not.toMatch(/Barbu|Vasile|Ioana|Matei/);
    // Sharing records the channel only.
    expect(log.map((l) => (l.changes as { observatie?: string }).observatie)).toContain("PRAYER shared: whatsapp");
    expect((await cancelPrayerWeekAction()).ok).toBe(true);
    d = await loadPrayerPage(ctx, 0);
    expect(d.marked).toBeNull();
    expect(d.history).toEqual([]);
  });

  it("refuses a family outside the rotation or from another church", async () => {
    current = ctx;
    expect((await markPrayerWeekAction(`f:${fam.nu}`)).message).toContain("nu mai este în rotație");
    expect((await markPrayerWeekAction(`f:${fam.altabiserica}`)).message).toContain("nu mai este în rotație");
    expect((await markPrayerWeekAction("f:../x")).message).toContain("nu mai este în rotație");
  });

  it("the family's choice is saved with its source and audited; another church cannot change it", async () => {
    current = { ...ctx, user: { ...ctx.user, role: "SECRETAR" } } as Ctx;
    const form = new FormData();
    form.set("prayerOptOut", "on");
    form.set("prayerSource", "HARTIE");
    expect((await setPrayerPrefsAction({ familyId: fam.popescu }, {}, form)).ok).toBe(true);
    const f = await prisma.family.findUniqueOrThrow({ where: { id: fam.popescu } });
    expect([f.prayerOptOut, f.prayerIncludeChildren, f.prayerSource]).toEqual([true, false, "HARTIE"]);
    expect((await loadPrayerPage(ctx, 0)).total).toBe(1);
    current = other;
    expect((await setPrayerPrefsAction({ familyId: fam.popescu }, {}, form)).message).toContain("nu există");
  });

  it("campaign: the parents' answers go through the review, the more restrictive winning", async () => {
    const admin = { ...ctx, user: { ...ctx.user, role: "ADMIN" } } as Ctx;
    const f = await prisma.family.findUniqueOrThrow({ where: { id: fam.barbu }, include: { members: true } });
    const father = f.members.find((m) => m.prenume === "Vasile")!;
    const mother = f.members.find((m) => m.prenume === "Ioana")!;
    const campaign = await ctx.db.dataCampaign.create({ data: { nume: "Toamnă", deadline: new Date("2026-12-31"), privacyTextVersion: "1.2" } as never });
    const self = (m: { nume: string; prenume: string }) => ({ nume: m.nume, prenume: m.prenume, gen: null, dataNasterii: null, dataCasatoriei: null, telefon: "+47 900 11 222", email: `${m.prenume}@x.no`, adresa: "Strada 1", dataBotez: null, botezAn: null, botezBiserica: "", botezLocalitate: "", botezOficiant: "", numeTata: "", numeMama: "" });
    const consents = { PHOTOS: true, BIRTHDAY: true, CONTACT: true, DIRECTORY: true };
    const submit = async (m: typeof father, prayer: { optOut: boolean; includeChildren: boolean }) =>
      (await ctx.db.dataUpdateSubmission.create({ data: { campaignId: campaign.id, personId: m.id, via: "PERSONAL", proposed: { self: self(m), children: [], consents, nota: true, prayer } } as never })).id;
    // Barbu: children included today. The father keeps them, the mother does not want them named.
    const a = await submit(father, { optOut: false, includeChildren: true });
    const b = await submit(mother, { optOut: false, includeChildren: false });
    await applyDecision(admin, a, { decizie: "toate", nota: "", chosen: new Set() });
    await applyDecision(admin, b, { decizie: "toate", nota: "", chosen: new Set() });
    let fam1 = await prisma.family.findUniqueOrThrow({ where: { id: fam.barbu } });
    expect([fam1.prayerOptOut, fam1.prayerIncludeChildren, fam1.prayerSource]).toEqual([false, false, "CAMPANIE"]);
    // Later answers cannot loosen it: the father asks again for the children, the mother's "no" stays.
    const c = await submit(father, { optOut: false, includeChildren: true });
    await applyDecision(admin, c, { decizie: "toate", nota: "", chosen: new Set() });
    fam1 = await prisma.family.findUniqueOrThrow({ where: { id: fam.barbu } });
    expect(fam1.prayerIncludeChildren).toBe(false);
    // One objection is enough.
    const d = await submit(mother, { optOut: true, includeChildren: false });
    await applyDecision(admin, d, { decizie: "toate", nota: "", chosen: new Set() });
    expect((await prisma.family.findUniqueOrThrow({ where: { id: fam.barbu } })).prayerOptOut).toBe(true);
    const log = await prisma.auditLog.findMany({ where: { entity: "FAMILY", entityId: fam.barbu } });
    expect(log.length).toBeGreaterThan(0);
  });

  it("a wife without a relation (the Ciobanu case): named as the spouse, flagged for the secretariat only", async () => {
    const { familiesToReview } = await import("@/server/queries/family-review");
    const cb = other.user.churchId;
    const f = await prisma.family.create({ data: { churchId: cb, nume: "Fam. Ciobanu Felix" } });
    const felix = await prisma.person.create({ data: { churchId: cb, nume: "Ciobanu", prenume: "Felix", sortKey: "ciobanu felix", searchText: "felix", familyId: f.id, rudenie: "Cap de familie", gen: "M", dataCasatoriei: new Date("2012-07-01") } });
    await prisma.person.create({ data: { churchId: cb, nume: "Ciobanu", prenume: "Naomi", sortKey: "ciobanu naomi", searchText: "naomi", familyId: f.id, rudenie: "", gen: "F", dataNasterii: new Date("1990-03-03") } });
    await prisma.family.update({ where: { id: f.id }, data: { headId: felix.id } });
    const secretar = other;
    const prayerRole = { ...other, user: { ...other.user, role: "RUGACIUNE" } } as Ctx;
    let skip = 0;
    while ((await loadPrayerPage(secretar, skip)).next?.label.startsWith("Familia Ciobanu") !== true) skip++;
    const page = await loadPrayerPage(secretar, skip);
    expect(page.message).toContain("pentru familia Ciobanu Felix și Naomi, ca Domnul");
    expect(page.message).not.toContain("copil");
    expect(page.review).toEqual({ href: `/familii/${f.id}` });
    const plain = await loadPrayerPage(prayerRole, skip);
    expect(plain.review).toEqual({ href: null });
    expect(JSON.stringify(plain)).not.toMatch(/rudenie|fără|1990|2012/);
    expect(await familiesToReview(secretar.db)).toEqual([
      { id: f.id, nume: "Fam. Ciobanu Felix", reasons: ["Ciobanu Naomi: membru fără rudenie", "Capul familiei are dată de căsătorie, dar familia nu are soț / soție"] },
    ]);
    // Nothing is changed automatically, and the other church sees none of it.
    expect((await prisma.person.findFirstOrThrow({ where: { prenume: "Naomi" } })).rudenie).toBe("");
    expect(await familiesToReview(ctx.db)).toEqual([]);
  });
});
