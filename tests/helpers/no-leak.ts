import { expect } from "vitest";

/*
 * TEST-FLAKY-IDS: the checks that some data never reaches a page, a log or an export search the
 * serialized data for text that must be absent. The data also carries random ids (cuid), so a short
 * fragment („900”, „2016”) could appear inside an id by chance and fail a correct test. Every such
 * check goes through expectNoLeak(): ids are replaced with "<id>" first, and each forbidden text is
 * matched as a whole word (never inside a longer word or number).
 */

const ID_KEY = /^(id|key|ids|keys)$|Ids?$/;
/** A cuid (25 characters starting with „c”), alone or inside a longer string („f:cmv…”, a link). */
const CUID = /\bc[a-z0-9]{20,32}\b/g;

/** The value with every id replaced by "<id>": fields named id / key / …Id(s), and any cuid inside a string. */
export function stripIds(value: unknown): unknown {
  if (typeof value === "string") return value.replace(CUID, "<id>");
  if (Array.isArray(value)) return value.map(stripIds);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, ID_KEY.test(k) && (typeof v === "string" || Array.isArray(v)) ? "<id>" : stripIds(v)]),
    );
  }
  return value;
}

/** The text searched: the value without its ids, as JSON (a string is searched as it is, ids removed). */
export function leakText(value: unknown): string {
  return typeof value === "string" ? value.replace(CUID, "<id>") : JSON.stringify(stripIds(value));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A forbidden text as a whole word: a text that ends in a letter is not followed by a letter or a digit
 * („Ana” is not in „Anastasia”), one that ends in a digit is not followed by a digit („2016” is not in
 * „20161”, but „2016-01-01” is in „2016-01-01T00:00”); the same at its start.
 */
export function wholeWord(text: string, flags = ""): RegExp {
  const side = (ch: string | undefined) => (ch === undefined ? "" : /\p{N}/u.test(ch) ? "\\p{N}" : /\p{L}/u.test(ch) ? "\\p{L}\\p{N}" : "");
  const before = side(text[0]);
  const after = side(text[text.length - 1]);
  return new RegExp(`${before ? `(?<![${before}])` : ""}${escape(text)}${after ? `(?![${after}])` : ""}`, `u${flags}`);
}

/** The forbidden texts (whole words) or patterns that the data must not contain, ids aside. */
export function findLeaks(data: unknown, forbidden: readonly (string | RegExp)[]): string[] {
  const text = leakText(data);
  return forbidden.filter((f) => (typeof f === "string" ? wholeWord(f) : f).test(text)).map(String);
}

/** Fails, naming what leaked, when the data (without its ids) contains a forbidden text or pattern. */
export function expectNoLeak(data: unknown, forbidden: readonly (string | RegExp)[], label?: string): void {
  expect(findLeaks(data, forbidden), label).toEqual([]);
}
