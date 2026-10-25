import { describe, expect, it } from "vitest";
import { parseApplicationsJson } from "./application-backup";

const app = {
  id: "app1",
  status: "ACCEPTED",
  kind: "TRANSFER",
  nume: "Munteanu",
  prenume: "Andrei",
  gen: "M",
  dataNasterii: "1990-04-12",
  consent: true,
  createdAt: "2026-10-20T08:00:00.000Z",
  decidedAt: "2026-10-21T08:00:00.000Z",
  membruId: "p1",
  motiv: "",
};

describe("parseApplicationsJson", () => {
  it("returns null for files without the collection (older backups)", () => {
    expect(parseApplicationsJson({ members: {} }, new Set())).toEqual({ applications: null, errors: [], warnings: [] });
  });

  it("parses entries keyed by id and keeps valid person links", () => {
    const r = parseApplicationsJson({ applications: { app1: app } }, new Set(["p1"]));
    expect(r.errors).toEqual([]);
    expect(r.applications).toHaveLength(1);
    expect(r.applications![0]).toMatchObject({ id: "app1", status: "ACCEPTED", membruId: "p1", dataNasterii: "1990-04-12", telefon: "" });
  });

  it("drops links to unknown or already linked persons with a warning", () => {
    const r = parseApplicationsJson({ applications: [app, { ...app, id: "app2" }, { ...app, id: "app3", membruId: "nobody" }] }, new Set(["p1"]));
    expect(r.applications!.map((a) => a.membruId)).toEqual(["p1", null, null]);
    expect(r.warnings).toHaveLength(2);
  });

  it("reports invalid entries as errors", () => {
    const r = parseApplicationsJson({ applications: { x: { ...app, status: "MAYBE" }, y: { ...app, nume: "" } } }, new Set());
    expect(r.errors).toHaveLength(2);
  });
});
