import { describe, expect, it, vi } from "vitest";
import { logError } from "./log";

describe("logError", () => {
  it("logs only the id, name, code and a short masked message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("Unique constraint failed for ana@example.org\n  at secret stack line"), { code: "P2002", meta: { target: "Ion Popescu" } });
    const id = logError("action", err);
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    const [scope, payload] = spy.mock.calls[0];
    expect(scope).toBe("[action]");
    expect(payload).toEqual({ id, name: "Error", code: "P2002", message: "Unique constraint failed for <e-mail>" });
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/Ion Popescu|stack|ana@example/);
    spy.mockRestore();
  });
});
