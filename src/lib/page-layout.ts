/** Page layout of the printed minutes (PDF and Word): church default, optional override per meeting. Pure. */
import { z } from "zod";

export const PAGE_FORMATS = ["A4", "A5"] as const;
export type PageFormat = (typeof PAGE_FORMATS)[number];
export const TEXT_ALIGNS = ["justify", "left"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export const LINE_HEIGHTS = [1, 1.15, 1.3, 1.55, 1.8, 2] as const;
/** FIT-TO-PAGE: the space between paragraphs and points, as a share of the usual (1 = usual, 0.5 = half). */
export const PARA_SPACINGS = [0.5, 0.75, 1] as const;
export const PARA_SPACING_LABEL: Record<(typeof PARA_SPACINGS)[number], string> = { 1: "obișnuit", 0.75: "redus", 0.5: "foarte redus (jumătate)" };

export interface PageLayout {
  format: PageFormat;
  /** Margins in millimetres. */
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Body text size in points. */
  fontSize: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  align: TextAlign;
  /** Print the church letterhead (off for paper with a printed letterhead: raise the top margin to leave its room). */
  letterhead: boolean;
  /** FIT-TO-PAGE: the space between paragraphs and points, a share of the usual one (`PARA_SPACINGS`). */
  paraSpacing: number;
}

/** The layout the minutes had before it became adjustable. */
export const DEFAULT_LAYOUT: PageLayout = {
  format: "A4",
  marginTop: 22,
  marginBottom: 22,
  marginLeft: 20,
  marginRight: 20,
  fontSize: 13,
  lineHeight: 1.55,
  align: "justify",
  letterhead: true,
  paraSpacing: 1,
};

export const MARGIN_MIN = 8;
export const MARGIN_MAX = 40;
export const FONT_MIN = 9;
export const FONT_MAX = 16;

const margin = (label: string) =>
  z.coerce
    .number({ message: `${label}: scrieți un număr.` })
    .min(MARGIN_MIN, `${label}: cel puțin ${MARGIN_MIN} mm.`)
    .max(MARGIN_MAX, `${label}: cel mult ${MARGIN_MAX} mm.`)
    .transform((n) => Math.round(n));

/** The layout form (and the preview query): strings coerced, every field required. */
export const pageLayoutSchema = z.object({
  format: z.enum(PAGE_FORMATS, { message: "Alegeți formatul paginii." }),
  marginTop: margin("Marginea de sus"),
  marginBottom: margin("Marginea de jos"),
  marginLeft: margin("Marginea din stânga"),
  marginRight: margin("Marginea din dreapta"),
  fontSize: z.coerce
    .number({ message: "Mărimea textului: scrieți un număr." })
    .min(FONT_MIN, `Mărimea textului: cel puțin ${FONT_MIN} pt.`)
    .max(FONT_MAX, `Mărimea textului: cel mult ${FONT_MAX} pt.`)
    .transform((n) => Math.round(n * 2) / 2),
  lineHeight: z.coerce
    .number()
    .refine((n) => (LINE_HEIGHTS as readonly number[]).includes(n), "Alegeți spațierea dintre rânduri."),
  align: z.enum(TEXT_ALIGNS, { message: "Alegeți alinierea." }),
  letterhead: z.preprocess((v) => v === true || v === "on" || v === "1" || v === "true", z.boolean()),
  // Older forms, links and stored layouts have no spacing: the usual one.
  paraSpacing: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? 1 : v),
    z.coerce.number().refine((n) => (PARA_SPACINGS as readonly number[]).includes(n), "Alegeți spațiul dintre paragrafe."),
  ),
});

export const PAGE_LAYOUT_FIELDS = Object.keys(DEFAULT_LAYOUT) as (keyof PageLayout)[];

export function pageLayoutInput(source: FormData | URLSearchParams): Record<string, unknown> {
  return Object.fromEntries(PAGE_LAYOUT_FIELDS.map((k) => [k, source.get(k) ?? undefined]));
}

/** A stored layout (JSON column) read leniently: invalid or missing fields fall back to `base`. */
export function storedLayout(value: unknown, base: PageLayout = DEFAULT_LAYOUT): PageLayout {
  if (typeof value !== "object" || value === null) return base;
  const out: PageLayout = { ...base };
  for (const k of PAGE_LAYOUT_FIELDS) {
    const field = pageLayoutSchema.shape[k].safeParse((value as Record<string, unknown>)[k]);
    if (field.success && (value as Record<string, unknown>)[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = field.data;
  }
  return out;
}

/** The layout of a meeting: its own, else the church's default, else DEFAULT_LAYOUT. */
export function resolveLayout(churchDefault: unknown, meetingLayout: unknown): PageLayout {
  const base = storedLayout(churchDefault);
  return meetingLayout ? storedLayout(meetingLayout, base) : base;
}

/** The layout as URL parameters (the preview of unsaved changes). */
export function layoutQuery(layout: PageLayout): string {
  return new URLSearchParams(
    Object.fromEntries(PAGE_LAYOUT_FIELDS.map((k) => [k, k === "letterhead" ? (layout.letterhead ? "1" : "0") : String(layout[k])])),
  ).toString();
}

/** "A4 · margini 22/22/20/20 mm · 13 pt · rânduri 1,55 · stânga-dreapta" — for the audit log and the page. */
export function layoutSummary(l: PageLayout): string {
  return [
    l.format,
    `margini ${l.marginTop}/${l.marginBottom}/${l.marginLeft}/${l.marginRight} mm`,
    `${String(l.fontSize).replace(".", ",")} pt`,
    `rânduri ${String(l.lineHeight).replace(".", ",")}`,
    l.align === "justify" ? "aliniat stânga-dreapta" : "aliniat la stânga",
    l.letterhead ? "cu antet" : "fără antet",
    ...(l.paraSpacing !== 1 ? [`spațiu între paragrafe ${PARA_SPACING_LABEL[l.paraSpacing as (typeof PARA_SPACINGS)[number]] ?? String(l.paraSpacing)}`] : []),
  ].join(" · ");
}
