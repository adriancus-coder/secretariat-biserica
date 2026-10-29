import { fmtDot } from "@/domain/print";
import { fmt, fmtL } from "./format";

/*
 * GENERATED-HASH-STABLE: the fingerprint of a generated document is taken from the DATA its source
 * read from the database (event, rows, persons…), never from the printed text, so the date of
 * printing, „Situația la …” or a page number never makes a saved version look outdated. Pure.
 */

/**
 * A stable JSON text of a value: object keys sorted, Maps as their entries sorted by key, Sets
 * sorted, Dates as ISO strings, bytes as hex; `undefined` fields left out. Equal data → equal text,
 * whatever the order the database returned the keys or the map entries in.
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return `hex:${Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [normalize(k), normalize(x)] as const).sort((a, b) => (JSON.stringify(a[0]) < JSON.stringify(b[0]) ? -1 : 1));
  if (v instanceof Set) return [...v].map(normalize).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined && typeof x !== "function") out[k] = normalize(x);
    }
    return out;
  }
  if (typeof v === "bigint") return v.toString();
  return v;
}

/**
 * The versions saved before this change kept a fingerprint of the printed text, the day's date
 * included. To tell whether such a version is still current, today's date (in every form the
 * documents print it) is written back as the day it was saved, then the text is compared.
 */
export function asOfDay(text: string, today: string, savedDay: string): string {
  if (today === savedDay) return text;
  const forms = (d: string) => [fmtL(d), fmt(d), fmtDot(d), d];
  const from = forms(today);
  const to = forms(savedDay);
  let out = text;
  from.forEach((f, i) => {
    if (f) out = out.split(f).join(to[i]);
  });
  return out;
}
