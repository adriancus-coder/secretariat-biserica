import { describe, expect, it } from "vitest";
import { seedRefusal } from "./seed-guard";

describe("seed guard", () => {
  it("allows only local databases outside production, unless SEED_ALLOW=true", () => {
    expect(seedRefusal({ DATABASE_URL: "postgresql://u:p@localhost:5432/db" })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: "postgresql://u:p@127.0.0.1/db?schema=public" })).toBeNull();
    expect(seedRefusal({ DATABASE_URL: "postgresql://u:p@dpg-x.frankfurt-postgres.render.com/db" })).toMatch(/not local/);
    expect(seedRefusal({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@localhost/db" })).toBe("NODE_ENV=production");
    expect(seedRefusal({ DATABASE_URL: "" })).toMatch(/missing/);
    expect(seedRefusal({ SEED_ALLOW: "true", NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@remote/db" })).toBeNull();
  });
});
