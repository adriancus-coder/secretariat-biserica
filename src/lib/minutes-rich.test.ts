import { describe, expect, it } from "vitest";
import { parseMeetingExtras } from "./meeting-backup";
import { DEFAULT_CLOSING, minutesFormatting } from "./minutes";
import { plainToRich, type RichDoc } from "./rich-text";
import { meetingSchema } from "./schemas/meeting";

const bold = (t: string): RichDoc => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "bold" }, { type: "textSize", attrs: { size: "foarteMare" } }] }] }] });
const centred = (t: string): RichDoc => ({ type: "doc", content: [{ type: "paragraph", attrs: { align: "center" }, content: [{ type: "text", text: t }] }] });

const form = (extra: Record<string, string>) => ({ tip: "Comitet", data: "2026-09-11", prezenti: [], ...extra });

describe("minutes with rich text", () => {
  it("the plain fields become the projection of the rich ones; empty points are dropped", () => {
    const r = meetingSchema.parse(
      form({
        puncte: JSON.stringify(["ignored"]),
        puncteRich: JSON.stringify([bold("Ziua Recoltei"), plainToRich(""), plainToRich("1. unu\n2. doi")]),
        observatiiRich: JSON.stringify(centred("Observație centrată")),
        formulaRich: JSON.stringify(plainToRich("  ")),
      }),
    );
    expect(r.puncte).toEqual(["Ziua Recoltei", "1. unu\n2. doi"]);
    expect(r.puncteRich).toHaveLength(2);
    expect(r.observatii).toBe("Observație centrată");
    expect([r.formulaIncheiere, r.formulaRich]).toEqual([DEFAULT_CLOSING, null]);
    expect(minutesFormatting(r)).toBe("puncte: îngroșat, foarte mare, listă numerotată; observații: centru");
  });

  it("refuses disallowed nodes and oversized documents, naming the field", () => {
    const image = { type: "doc", content: [{ type: "image", attrs: { src: "https://x/y.png" } }] };
    const bad = meetingSchema.safeParse(form({ puncteRich: JSON.stringify([bold("a"), image]) }));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]).toMatchObject({ path: ["puncteRich"], message: expect.stringContaining("Punctul 2") });
    const link = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:1" } }] }] }] };
    expect(meetingSchema.safeParse(form({ observatiiRich: JSON.stringify(link) })).error?.issues[0].path).toEqual(["observatiiRich"]);
    const big = JSON.stringify(plainToRich("x".repeat(300 * 1024)));
    expect(meetingSchema.safeParse(form({ observatiiRich: big })).error?.issues[0].message).toBe("Textul este prea lung (cel mult 200 KB).");
  });

  it("without rich fields the plain ones work as before", () => {
    const r = meetingSchema.parse(form({ puncte: JSON.stringify(["Unu", " "]), observatii: "Obs", formulaIncheiere: "" }));
    expect([r.puncte, r.puncteRich, r.observatii, r.formulaIncheiere]).toEqual([["Unu"], null, "Obs", DEFAULT_CLOSING]);
  });

  it("backup: valid rich documents are read (and decide the plain text), invalid ones are ignored", () => {
    const x = parseMeetingExtras({
      meetings: {
        m1: { id: "m1", puncte: ["vechi"], puncteRich: [bold("Nou")], observatiiRich: centred("Obs"), formulaRich: { type: "doc", content: [{ type: "html", value: "<b>x</b>" }] }, formulaIncheiere: "Gata." },
      },
    }).get("m1")!;
    expect([x.puncte, x.puncteRich, x.observatii, x.observatiiRich, x.formulaIncheiere, x.formulaRich]).toEqual([["Nou"], [bold("Nou")], "Obs", centred("Obs"), "Gata.", undefined]);
  });
});
