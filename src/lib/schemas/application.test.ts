import { describe, expect, it } from "vitest";
import { applicationSchema } from "./application";

const base = { kind: "TRANSFER", nume: "Munteanu", prenume: "Andrei", telefon: "+47 412 34 567", consent: "on" };

describe("applicationSchema", () => {
  it("accepts a complete transfer and keeps its transfer details", () => {
    const r = applicationSchema.parse({ ...base, bisericaProvenienta: "Elim Timișoara", dataBotez: "2008-07-20", botezLocalitate: "Timișoara", botezOficiant: "Ioan Pop", dataNasterii: "1990-04-12" });
    expect(r).toMatchObject({ kind: "TRANSFER", consent: true, bisericaProvenienta: "Elim Timișoara", dataBotez: "2008-07-20" });
  });

  it("drops transfer details for other kinds", () => {
    const r = applicationSchema.parse({ ...base, kind: "BOTEZ", bisericaProvenienta: "X", dataBotez: "2008-07-20", botezBiserica: "Y", botezLocalitate: "Z", botezOficiant: "W" });
    expect(r).toMatchObject({ bisericaProvenienta: "", dataBotez: null, botezBiserica: "", botezLocalitate: "", botezOficiant: "" });
  });

  it("requires consent, a kind and names, reported together", () => {
    const r = applicationSchema.safeParse({ nume: "", prenume: "", telefon: "", email: "" });
    expect(r.success).toBe(false);
    const paths = new Set(r.error!.issues.map((i) => i.path[0]));
    for (const p of ["kind", "nume", "prenume", "consent"]) expect(paths.has(p)).toBe(true);
  });

  it("requires a phone number or an e-mail", () => {
    const r = applicationSchema.safeParse({ ...base, telefon: "", email: "" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toEqual(["telefon"]);
  });

  it("checks dates and the message length", () => {
    const r = applicationSchema.safeParse({ ...base, dataNasterii: "2099-01-01", dataBotez: "1980-01-01", mesaj: "x".repeat(2001) });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["dataNasterii", "mesaj"]));
  });
});
