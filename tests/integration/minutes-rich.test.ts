import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parsePrototypeJson, toPrototypeJson } from "@/domain/backup";
import { addMeetingExtras, parseMeetingExtras } from "@/lib/meeting-backup";
import type { RichDoc } from "@/lib/rich-text";
import { importBackup, loadBackup, loadMeetingExtras } from "@/server/backup";
import type { Ctx } from "@/server/session";
import { scopeToChurch } from "@/server/tenant-scope";
import { hasTestDb, resetDatabase, testPrisma } from "./helpers";

const bold = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "bold" }] }] }] }) as RichDoc;

describe.skipIf(!hasTestDb)("rich minutes in the JSON backup", () => {
  const prisma = hasTestDb ? testPrisma() : (undefined as never);
  const ctxFor = (churchId: string, userId: string): Ctx =>
    ({ user: { id: userId, name: "A", email: `${userId}@x.ro`, role: "ADMIN", churchId, churchName: "X" }, db: scopeToChurch(prisma, churchId) }) as Ctx;
  let source: Ctx;
  let target: Ctx;

  beforeAll(async () => {
    await resetDatabase(prisma);
    const [a, b] = await Promise.all(["sursa-r", "destinatie-r"].map((slug) => prisma.church.create({ data: { nume: slug, slug } })));
    const [ua, ub] = await Promise.all(
      [a, b].map((c, i) => prisma.user.create({ data: { churchId: c.id, email: `r${i}@x.ro`, name: "U", passwordHash: "x", role: "ADMIN" } })),
    );
    source = ctxFor(a.id, ua.id);
    target = ctxFor(b.id, ub.id);
    await prisma.meeting.create({
      data: {
        churchId: a.id,
        tip: "Comitet",
        data: new Date("2026-09-11T00:00:00Z"),
        puncte: ["Ziua Recoltei", "Evanghelizare"],
        puncteRich: [bold("Ziua Recoltei"), bold("Evanghelizare")],
        observatii: "Obs",
        observatiiRich: bold("Obs"),
        formulaIncheiere: "Gata.",
        formulaRich: bold("Gata."),
      },
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await prisma.$disconnect();
  });

  it("export → import keeps the rich documents and their plain projection", async () => {
    const data = toPrototypeJson(await loadBackup(source));
    addMeetingExtras(data.meetings as Record<string, Record<string, unknown>>, await loadMeetingExtras(source));
    const json = JSON.parse(JSON.stringify(data));
    const exported = Object.values(json.meetings)[0] as Record<string, unknown>;
    expect(exported.puncteRich).toEqual([bold("Ziua Recoltei"), bold("Evanghelizare")]);
    const parsed = parsePrototypeJson(json);
    if (!parsed.ok) throw new Error("parse");
    await importBackup(target, parsed.backup, "merge", { meetings: parseMeetingExtras(json) });
    const m = await target.db.meeting.findFirstOrThrow();
    expect([m.puncte, m.puncteRich, m.observatii, m.observatiiRich, m.formulaIncheiere, m.formulaRich]).toEqual([
      ["Ziua Recoltei", "Evanghelizare"],
      [bold("Ziua Recoltei"), bold("Evanghelizare")],
      "Obs",
      bold("Obs"),
      "Gata.",
      bold("Gata."),
    ]);
  });
});
