import { describe, expect, it } from "vitest";
import { permissions } from "./permissions";

describe("permissions with the pastor flag (Statut art. 38–39)", () => {
  it("discipline: pastor or administrator; pastoral: pastors only", () => {
    expect(permissions.disciplina("ADMIN")).toBe(true);
    expect(permissions.disciplina("SECRETAR")).toBe(false);
    expect(permissions.disciplina({ role: "SECRETAR", isPastor: true })).toBe(true);
    expect(permissions.disciplina({ role: "VIZUALIZARE", isPastor: true })).toBe(true);
    expect(permissions.pastoral({ role: "ADMIN", isPastor: false })).toBe(false);
    expect(permissions.pastoral({ role: "VIZUALIZARE", isPastor: true })).toBe(true);
    expect(permissions.pastor("ADMIN")).toBe(false);
  });
  it("the base role still decides the rest", () => {
    expect(permissions.write({ role: "VIZUALIZARE", isPastor: true })).toBe(false);
    expect(permissions.admin({ role: "ADMIN", isPastor: true })).toBe(true);
  });
});
