import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { documentPrint, meetingPrint, type PrintSpec } from "@/domain/print";
import { FIT_MIN_FONT, fitSteps } from "@/lib/fit-layout";
import { DEFAULT_LAYOUT } from "@/lib/page-layout";
import { blockGroups, docxKeeps, tailStart } from "@/lib/pagination";
import { fitToFewerPages, pageInfo } from "./fit";
import { renderPdfInfo } from "./render";

const church = { nume: "Maranata Stavanger", adresa: "Kongsgårdbakken 1", codPostal: "", localitate: "", orgNr: "", telefon: "", email: "", pastor: "Daniel Mureșan", secretar: "Ioana Pop" };

/** A committee minutes with `n` points, each with its vote line. */
function minutes(n: number, words = 40): PrintSpec {
  const point = (i: number) => `Punctul ${i + 1}: ${"se discută bugetul, programul și lucrările bisericii ".repeat(Math.ceil(words / 7)).trim()}.`;
  return meetingPrint(
    {
      nr: 555,
      tip: "Comitet",
      data: "2026-10-29",
      prezenti: [{ nume: "Pop", prenume: "Ana" }],
      absenti: [],
      invitati: "",
      ordine: "",
      puncte: Array.from({ length: n }, (_, i) => point(i)),
      observatii: "",
      formulaIncheiere: "Ședința s-a încheiat la ora 20.",
      voturi: Array.from({ length: n }, () => "Votat: pentru 7, contra 0, abțineri 0 — adoptat"),
    },
    church,
  );
}

describe("FIT-TO-PAGE: the closing never sits alone on a page", () => {
  it("the minutes' groups: each point with its vote line, the closing (formula, „Întocmit,”, signatures) as one", () => {
    const spec = minutes(3);
    const groups = blockGroups(spec);
    const tail = tailStart(spec)!;
    expect(spec.blocks.slice(tail).map((b) => b.type)).toEqual(["para", "para", "signed"]);
    expect(groups.at(-1)).toEqual([tail, spec.blocks.length - 1]);
    // „1.” + „Votat: …” are one group.
    const firstPoint = spec.blocks.findIndex((b) => b.type === "list");
    expect(groups.some(([a, z]) => a <= firstPoint && z >= firstPoint + 1)).toBe(true);
    // Word: the point keeps with its vote; the last vote line keeps with the closing.
    const keeps = docxKeeps(spec);
    expect(keeps[firstPoint]).toBe("all");
    expect(keeps[tail - 1]).toBe("last");
  });

  it("a minutes laid out exactly at the limit: without the rule the last page has only the closing; with it, a point comes along", async () => {
    let found: PrintSpec | null = null;
    for (let words = 20; words <= 80 && !found; words += 2) {
      const spec = { ...minutes(8, words), layout: DEFAULT_LAYOUT };
      if ((await renderPdfInfo(spec, { measure: true, keep: false })).onlyTailOnLast) found = spec;
    }
    expect(found, "no case at the limit").not.toBeNull();
    const r = await renderPdfInfo(found!, { measure: true });
    expect(r.onlyTailOnLast).toBe(false);
    const last = r.pages - 1;
    const tail = tailStart(found!)!;
    // The closing is on the last page, not split, with at least one point (and its vote line) before it.
    expect(r.boxes.slice(tail).every((b) => b.sp === last && b.ep === last)).toBe(true);
    const points = found!.blocks.map((b, i) => (b.type === "list" ? i : -1)).filter((i) => i >= 0);
    const lastPoint = points.at(-1)!;
    expect(r.boxes[lastPoint].sp).toBe(last);
    expect(r.boxes[lastPoint + 1].sp).toBe(last);
  });

  it("on every length, no point is split from its vote line and the closing is never alone", async () => {
    for (let words = 10; words <= 70; words += 6) {
      const spec = { ...minutes(8, words), layout: DEFAULT_LAYOUT };
      const r = await renderPdfInfo(spec, { measure: true });
      expect(r.onlyTailOnLast, `words ${words}`).toBe(false);
      spec.blocks.forEach((b, i) => {
        if (b.type === "list") expect(r.boxes[i + 1].sp, `words ${words}, block ${i}`).toBe(r.boxes[i].ep);
      });
    }
  });
});

describe("FIT-TO-PAGE: „Potrivește pe mai puține pagini”", () => {
  it("the steps go in order and never under 10 pt, 1,15 or 15 mm", () => {
    const steps = fitSteps(DEFAULT_LAYOUT);
    expect(steps[0].paraSpacing).toBe(0.75);
    expect(steps[1].paraSpacing).toBe(0.5);
    expect(steps.map((s) => s.lineHeight).filter((h, i, a) => a.indexOf(h) === i)).toEqual([1.55, 1.3, 1.15]);
    expect(Math.min(...steps.map((s) => s.fontSize))).toBe(FIT_MIN_FONT);
    expect(Math.min(...steps.flatMap((s) => [s.marginTop, s.marginBottom, s.marginLeft, s.marginRight]))).toBe(15);
    // The margins move only after the spacing and the line height are at their limit.
    const firstMargin = steps.findIndex((s) => s.marginTop < DEFAULT_LAYOUT.marginTop);
    expect(steps[firstMargin].lineHeight).toBe(1.15);
    expect(steps.at(-1)!.fontSize).toBe(10);
  });

  it("a 4-page minutes becomes 3 pages", async () => {
    let done = false;
    for (let n = 8; n <= 30 && !done; n++) {
      const spec = { ...minutes(n, 46), layout: DEFAULT_LAYOUT };
      if ((await pageInfo(spec, DEFAULT_LAYOUT)).pages !== 4) continue;
      const fit = await fitToFewerPages(spec, DEFAULT_LAYOUT);
      expect(fit).toMatchObject({ ok: true, from: 4, to: 3 });
      if (fit.ok) {
        expect(fit.layout.fontSize).toBeGreaterThanOrEqual(10);
        expect((await renderPdfInfo({ ...spec, layout: fit.layout })).pages).toBe(3);
      }
      done = true;
    }
    expect(done, "no 4-page case").toBe(true);
  });

  it("refuses when fewer pages would need text under 10 pt (nothing changes)", async () => {
    const png = new Uint8Array(await sharp({ create: { width: 200, height: 200, channels: 3, background: "#888" } }).png().toBuffer());
    // Two pictures of 420 pt: they never share a page, whatever the text size.
    const spec: PrintSpec = { title: "Afiș", church, blocks: [{ type: "image", png, width: 420, alt: "a" }, { type: "image", png, width: 420, alt: "b" }], layout: DEFAULT_LAYOUT };
    expect((await pageInfo(spec, DEFAULT_LAYOUT)).pages).toBe(2);
    expect(await fitToFewerPages(spec, DEFAULT_LAYOUT)).toEqual({ ok: false, from: 2 });
  });

  it("short minutes stay on one page, unchanged", async () => {
    const r = await renderPdfInfo({ ...minutes(2, 10), layout: DEFAULT_LAYOUT }, { measure: true });
    expect(r.pages).toBe(1);
    expect(await fitToFewerPages({ ...minutes(2, 10), layout: DEFAULT_LAYOUT }, DEFAULT_LAYOUT)).toEqual({ ok: false, from: 1 });
  });
});

describe("FIT-TO-PAGE: documents and the real page count", () => {
  /** The pages pdfkit wrote (page objects in the file). */
  const pdfPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

  it("a long letter: its signatures never stand alone, the last lines of the text come along", async () => {
    let checked = 0;
    for (let lines = 30; lines <= 70; lines += 2) {
      const text = Array.from({ length: lines }, (_, i) => `Rândul ${i + 1} al scrisorii, cu un text obișnuit despre activitatea bisericii.`).join("\n");
      const spec = { ...documentPrint({ tip: "scrisoare", nr: 1, data: "2026-10-29", text }, church), layout: DEFAULT_LAYOUT };
      const r = await renderPdfInfo(spec);
      expect(r.onlyTailOnLast, `lines ${lines}`).toBe(false);
      expect(pdfPages(r.pdf), `lines ${lines}`).toBe(r.pages);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("a multi-page minutes has no blank page after its footer", async () => {
    const r = await renderPdfInfo({ ...minutes(12, 40), layout: DEFAULT_LAYOUT, footer: "Proces-verbal închis la 29.10.2026 20:00" });
    expect(r.pages).toBeGreaterThan(1);
    expect(pdfPages(r.pdf)).toBe(r.pages);
  });
});
