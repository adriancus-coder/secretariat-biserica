import { describe, expect, it } from "vitest";
import { canGrantDiscipline, permissions } from "./permissions";

describe("permissions with the pastor flag (Statut art. 38–39)", () => {
  it("discipline: a pastor, or an Administrator / Secretar given access by a pastor (art. 44 lit. d); pastoral: pastors only", () => {
    // The administrator's role alone gives nothing (art. 14 alin. 3 lit. d).
    expect(permissions.disciplina("ADMIN")).toBe(false);
    expect(permissions.disciplina({ role: "ADMIN", isPastor: false })).toBe(false);
    expect(permissions.disciplina({ role: "ADMIN", accesDisciplina: true })).toBe(true);
    expect(permissions.disciplina({ role: "SECRETAR", accesDisciplina: true })).toBe(true);
    expect(permissions.disciplina({ role: "VIZUALIZARE", accesDisciplina: true })).toBe(false);
    expect(permissions.disciplina({ role: "RUGACIUNE", accesDisciplina: true })).toBe(false);
    expect(permissions.disciplina({ role: "RUGACIUNE", isPastor: true })).toBe(false);
    expect(permissions.disciplina("SECRETAR")).toBe(false);
    expect(permissions.disciplina({ role: "SECRETAR", isPastor: true })).toBe(true);
    expect(permissions.disciplina({ role: "VIZUALIZARE", isPastor: true })).toBe(true);
    expect(permissions.pastoral({ role: "ADMIN", isPastor: false })).toBe(false);
    expect(permissions.pastoral({ role: "VIZUALIZARE", isPastor: true })).toBe(true);
    expect(permissions.pastor("ADMIN")).toBe(false);
    expect(permissions.pastoral({ role: "ADMIN", accesDisciplina: true })).toBe(false);
  });
  it("who gives the access: a pastor; without a pastor in the church, an Administrator who has it", () => {
    expect(canGrantDiscipline({ role: "SECRETAR", isPastor: true }, true)).toBe(true);
    expect(canGrantDiscipline({ role: "ADMIN", accesDisciplina: true }, true)).toBe(false);
    expect(canGrantDiscipline({ role: "ADMIN", accesDisciplina: true }, false)).toBe(true);
    expect(canGrantDiscipline({ role: "ADMIN" }, false)).toBe(false);
    expect(canGrantDiscipline({ role: "SECRETAR", accesDisciplina: true }, false)).toBe(false);
  });
  it("the base role still decides the rest", () => {
    expect(permissions.write({ role: "VIZUALIZARE", isPastor: true })).toBe(false);
    expect(permissions.admin({ role: "ADMIN", isPastor: true })).toBe(true);
  });
});
