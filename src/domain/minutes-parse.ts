/**
 * Old minutes typed in Word (the church's template, read as raw text with mammoth) → a minutes
 * draft. Pure: no I/O. The template:
 *
 *   Proces verbal nr. 16
 *   Încheiat azi, 11.09.2026, cu ocazia ședinței de comitet.
 *   La ședință au fost prezenți: 5 membri.
 *   Dumitru Ciobanu,   Ovidiu Haidemak,  Nelu Gaju, …
 *   În cadrul ședinței s-au discutat și aprobat următoarele:
 *   <one paragraph per point, numbered or not>
 *   Toate punctele au fost votate în unanimitate de membrii prezenți.
 *   Secretar, Adrian Cușniriuc,     Păstor, Dumitru Ciobanu
 */
import { isIsoDate } from "@/lib/dates";

/** A minutes draft read from a Word file, before the names are matched to the register. */
export interface MinutesDraft {
  nr: number | null;
  data: string | null;
  tip: string | null;
  prezenti: string[];
  absenti: string[];
  invitati: string[];
  puncte: string[];
  formulaIncheiere: string | null;
  secretar: string | null;
  pastor: string | null;
}

export interface ParsedMinutes {
  draft: MinutesDraft;
  warnings: string[];
}

/** Lower case without diacritics, one character for one character (indexes stay valid). */
function fold(s: string): string {
  return s.toLowerCase().replace(/[ăâàáä]/g, "a").replace(/[îí]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");
}

const clean = (s: string) => s.replace(/[\t ]+/g, " ").trim();

/** "1." / "1)" / "-" / "•" at the start of a point. */
const stripMarker = (s: string) => s.replace(/^\s*(?:\d{1,3}\s*[.)]|[-–•*])\s*/, "");

function isoDate(d: string, m: string, y: string): string | null {
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** A name list: "A B,   C D; E F" → ["A B", "C D", "E F"]. */
function names(line: string): string[] {
  return line
    .split(/[,;]+/)
    .map((n) => clean(n).replace(/\.$/, ""))
    .filter((n) => /\p{L}/u.test(n) && n.length <= 120);
}

/** The name after "Secretar," / "Păstor," (also misspelled "Păstror,") on the signature line. */
function signer(lines: string[], folded: string[], re: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(folded[i]);
    if (!m) continue;
    const start = m.index + m[0].length;
    // Up to the next comma, tab or a wide gap (the second column of the signature line).
    const rest = lines[i].slice(start).split(/,|\t| {3,}/)[0];
    const name = clean(rest);
    if (name && /\p{L}/u.test(name)) return name.slice(0, 120);
  }
  return null;
}

export function parseMinutesText(text: string): ParsedMinutes {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const folded = lines.map(fold);
  // fold() keeps every index, so a match in `all` slices the same text out of `normalized`.
  const all = folded.join("\n");
  const warnings: string[] = [];

  const nrMatch = /proces[\s-]*verbal\s*(?:nr\.?|numarul)?\s*(\d{1,4})\b/.exec(all);
  const nr = nrMatch && Number(nrMatch[1]) >= 1 ? Number(nrMatch[1]) : null;

  // The first date of the text, preferably on the "Încheiat azi" line.
  const dateRe = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/;
  const dateLine = folded.find((l) => l.includes("incheiat") && dateRe.test(l)) ?? folded.find((l) => dateRe.test(l));
  const dm = dateLine ? dateRe.exec(dateLine) : null;
  const data = dm ? isoDate(dm[1], dm[2], dm[3]) : null;
  if (!data) warnings.push("Data ședinței nu a putut fi citită; verificați-o.");

  const tipMatch = /cu ocazia sedintei de\s+([^.\n]+)/.exec(all);
  const tipEnd = tipMatch ? tipMatch.index + tipMatch[0].length : 0;
  const tip = tipMatch ? clean(normalized.slice(tipEnd - tipMatch[1].length, tipEnd)) || null : null;

  // Attendees: the names after "prezenți:" on the same line, else the next non-empty line.
  let prezenti: string[] = [];
  const pi = folded.findIndex((l) => /\bprezenti\b/.test(l));
  if (pi >= 0) {
    const after = clean(lines[pi].slice(folded[pi].indexOf("prezenti") + "prezenti".length).replace(/^\s*:/, ""));
    const inline = after.replace(/^\d+\s*(?:de\s*)?(?:membri|persoane)\.?/i, "").trim();
    if (names(inline).length) prezenti = names(inline);
    else {
      const next = lines.slice(pi + 1).find((l) => clean(l) !== "");
      if (next && !/^semnatura/.test(fold(clean(next)))) prezenti = names(next);
    }
  }
  if (!prezenti.length) warnings.push("Lista celor prezenți nu a putut fi citită.");

  // Points: the paragraphs between "s-au discutat și aprobat" and the closing sentence.
  const closingIdx = folded.findIndex((l) => /unanimitate|au fost votate|s-au votat/.test(l));
  const startIdx = folded.findIndex((l) => /aprobat(e)? urmatoarele|discutat si aprobat|puncte discutate/.test(l));
  const end = [closingIdx, folded.findIndex((l, i) => i > startIdx && /intocmit|^\s*secretar\s*,/.test(l))].filter((i) => i > startIdx);
  const puncte =
    startIdx >= 0
      ? lines
          .slice(startIdx + 1, end.length ? Math.min(...end) : lines.length)
          .map((l) => clean(stripMarker(l)))
          .filter((l) => l !== "" && !/^semnatura/.test(fold(l)))
          .map((l) => l.slice(0, 2000))
          .slice(0, 100)
      : [];

  const formulaIncheiere = closingIdx >= 0 ? clean(lines[closingIdx]).slice(0, 500) || null : null;

  return {
    draft: {
      nr,
      data,
      tip,
      prezenti,
      absenti: [],
      invitati: [],
      puncte,
      formulaIncheiere,
      secretar: signer(lines, folded, /\bsecretar\s*,\s*/),
      pastor: signer(lines, folded, /\bpast\w*\s*,\s*/),
    },
    warnings,
  };
}
