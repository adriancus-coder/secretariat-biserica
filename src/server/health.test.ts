import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseReachable } from "./health";

// Hoisted above the imports by Vitest: the health module sees the mocked client.
const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ prisma: { $queryRaw: queryRaw } }));

describe("databaseReachable", () => {
  afterEach(() => {
    queryRaw.mockReset();
    vi.restoreAllMocks();
  });

  it("is true when SELECT 1 answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    await expect(databaseReachable()).resolves.toBe(true);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("is false (and logs) when the query fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error("\nInvalid `prisma.$queryRaw()` invocation:\n\n\nCan't reach database server"));
    await expect(databaseReachable()).resolves.toBe(false);
    expect(log).toHaveBeenCalledWith(
      "[health] database check failed:",
      "Invalid `prisma.$queryRaw()` invocation: Can't reach database server",
    );
  });

  it("is false when the database does not answer in time", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockReturnValue(new Promise(() => {}));
    const started = Date.now();
    await expect(databaseReachable(30)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
