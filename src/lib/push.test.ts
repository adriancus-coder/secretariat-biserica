import { describe, expect, it } from "vitest";
import { deviceLabel, PUSH_MESSAGE, pushPayload, PushCoalescer, pushTypesFor } from "./push";

describe("push notifications", () => {
  it("each role gets only the work it can act on", () => {
    expect(pushTypesFor({ role: "SECRETAR", isPastor: false })).toEqual(["DOCUMENT_DECIDED", "APPLICATION", "CAMPAIGN", "REMINDER"]);
    expect(pushTypesFor({ role: "VIZUALIZARE", isPastor: true })).toEqual(["DOCUMENT_SIGN", "PROPOSAL", "REMINDER"]);
    expect(pushTypesFor({ role: "VIZUALIZARE", isPastor: false })).toEqual([]);
    expect(pushTypesFor({ role: "ADMIN", isPastor: true })).toHaveLength(6);
  });

  it("the payload is a generic title, an address inside the app and a count", () => {
    const p = JSON.parse(pushPayload("DOCUMENT_SIGN", 3));
    expect(p).toEqual({ title: "Un document așteaptă semnătura dumneavoastră", url: "/documente/de-semnat", tag: "DOCUMENT_SIGN", badge: 3 });
    for (const m of Object.values(PUSH_MESSAGE)) expect(m.url.startsWith("/")).toBe(true);
  });

  it("coalesces to one notification per user and type in 5 minutes", () => {
    const c = new PushCoalescer();
    expect(c.hit("u1", "APPLICATION", 0)).toBe(true);
    expect(c.hit("u1", "APPLICATION", 60_000)).toBe(false);
    expect(c.hit("u1", "PROPOSAL", 60_000)).toBe(true);
    expect(c.hit("u2", "APPLICATION", 60_000)).toBe(true);
    expect(c.hit("u1", "APPLICATION", 5 * 60_000)).toBe(true);
  });

  it("names devices without keeping the whole user agent", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari pe iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("Chrome pe Android");
  });
});
