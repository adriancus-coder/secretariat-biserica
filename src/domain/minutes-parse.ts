/**
 * Old minutes typed in Word → a minutes draft. Pure: no I/O. The file is read with mammoth as HTML
 * (src/server/minutes-import.ts) and turned into paragraphs by htmlParas(), so Word's numbered lists and
 * tables keep their structure; plain text (parseMinutesText) works too, one paragraph per line. The
 * church's template:
 *
 *   Proces verbal nr. 16
 *   Încheiat azi, 11.09.2026, cu ocazia ședinței de comitet.
 *   La ședință au fost prezenți: 5 membri.
 *   Dumitru Ciobanu,   Ovidiu Haidemak,  Nelu Gaju, …
 *   În cadrul ședinței s-au discutat și aprobat următoarele:
 *   <one paragraph per point, numbered or not>
 *   Toate punctele au fost votate în unanimitate de membrii prezenți.
 *   Secretar, Adrian Cușniriuc,     Păstor, Dumitru Ciobanu
 *
 * MINUTES-IMPORT-ROBUST: tolerant to other structures — points numbered by Word (lists), by hand („1.”,
 * „1)”, „a)”, „Pct. 1”, a dash or a bullet) or in a table (one column, or nr | text); section headings
 * in many forms („Ordinea de zi”, „S-au discutat”, „S-a hotărât”, „Hotărâri”, …, with or without
 * diacritics); „Votat: pentru X, contra Y, abțineri Z” belongs to the point before it; a paragraph
 * without a number continues the point before it. Nothing is lost: every paragraph is accounted for in
 * `parts`, and the ones no field took are `nerecunoscut` (they go to „Observații”).
 */
import { isIsoDate } from "@/lib/dates";

/** A vote read from a „Votat: …” line. */
export interface DraftVote {
  pentru: number;
  contra: number;
  abtineri: number;
  secret: boolean;
}

/** A minutes draft read from a Word file, before the names are matched to the register. */
export interface MinutesDraft {
  nr: number | null;
  data: string | null;
  tip: string | null;
  prezenti: string[];
  /** ATTENDANCE-COUNT: „prezenți: 23 de membri” — the number written, when the text has one. */
  numarPrezenti: number | null;
  absenti: string[];
  invitati: string[];
  /** „Ordinea de zi” when the document also has a separate section of points. */
  ordine: string[];
  puncte: string[];
  /** Aligned with `puncte`: the vote under each point, when written with numbers. */
  voturi: (DraftVote | null)[];
  formulaIncheiere: string | null;
  secretar: string | null;
  pastor: string | null;
  /** The text after an „Observații:” heading (the minutes the app prints have one). */
  observatii: string[];
  /** Paragraphs no field took, in order (they go to „Observații”). */
  nerecunoscut: string[];
}

/** What each paragraph of the document became. */
export type PartKind = "antet" | "numar" | "data" | "prezenti" | "absenti" | "invitati" | "titlu" | "ordine" | "punct" | "vot" | "observatii" | "incheiere" | "semnaturi" | "nerecunoscut";

export interface ParsedMinutes {
  draft: MinutesDraft;
  warnings: string[];
  /** Every non-empty paragraph of the document, in order, with the field that took it. */
  parts: { kind: PartKind; text: string }[];
}

/** A paragraph of the document: a list item (Word numbering) or a table row (its cells). */
export interface DocPara {
  text: string;
  list?: "ol" | "ul";
  cells?: string[];
}

/** The line that starts the unrecognized text in „Observații”. */
export const UNRECOGNIZED_HEADING = "Text importat nerecunoscut:";

/** Lower case without diacritics, one character for one character (indexes stay valid). */
export function fold(s: string): string {
  return s.toLowerCase().replace(/[ăâàáä]/g, "a").replace(/[îí]/g, "i").replace(/[șş]/g, "s").replace(/[țţ]/g, "t");
}

const clean = (s: string) => s.replace(/[\t ]+/g, " ").trim();

/** A hand-written marker at the start of a point: „1.”, „1)”, „a)”, „Pct. 1”, „Punctul 2:”, a dash or a bullet (not a date like „11.09.2026”). */
const MARKER = /^\s*(?:(?:pct\.?|punctul)\s*\d{1,3}\s*[.):\-–]?|\d{1,3}\s*[.)](?!\d)|[a-z]\s*\)|[-–•*●▪◦])\s*/i;
const stripMarker = (s: string) => s.replace(MARKER, "");

/** Section headings before the points (or the agenda). */
const HEADING = /(puncte(le)? discutate|ordinea de zi|s-au discutat|s-a(u)? hotarat|hotarar(i|ile|ea)\b|aprobat(e)? urmatoarele|discutat si aprobat|au fost discutate)/;
const AGENDA = /ordinea de zi/;
const CLOSING = /unanimitate|au fost votate|s-au votat|nemaifiind alte|sedinta s-a (incheiat|inchis)|drept pentru care|s-a incheiat prezentul/;
const SIGNATURE = /^\s*(intocmit|secretar\w*\s*[,:]|past\w*\s*[,:]|semnatura|presedinte\w*\s*[,:])/;
const VOTE = /^\s*(votat|vot\b|s-a votat|rezultatul votului)|pentru\s*:?\s*\d+.*contra/;

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
function signer(lines: string[], re: RegExp): string | null {
  for (const line of lines) {
    const m = re.exec(fold(line));
    if (!m) continue;
    // Up to the next comma, tab or a wide gap (the second column of the signature line).
    const name = clean(line.slice(m.index + m[0].length).split(/,|\t| {3,}/)[0]);
    if (name && /\p{L}/u.test(name)) return name.slice(0, 120);
  }
  return null;
}

/** „Votat: pentru 7, contra 0, abțineri 1” → the numbers (null without „pentru N”). */
export function parseVote(line: string): DraftVote | null {
  const f = fold(line);
  const n = (word: string) => {
    const m = new RegExp(`${word}\\w*\\s*:?\\s*(\\d{1,5})`).exec(f);
    return m ? Number(m[1]) : null;
  };
  const pentru = n("pentru");
  if (pentru === null) return null;
  return { pentru, contra: n("contra") ?? 0, abtineri: n("abtine") ?? 0, secret: /secret/.test(f) };
}

/** Plain text, one paragraph per line (the template read as raw text). */
export function parseMinutesText(text: string): ParsedMinutes {
  return parseMinutesParas(text.replace(/\r\n?/g, "\n").split("\n").map((t) => ({ text: t })));
}

export function parseMinutesParas(input: readonly DocPara[]): ParsedMinutes {
  const paras = input.map((p) => ({ ...p, text: clean(p.text) })).filter((p) => p.text !== "" || p.cells?.some((c) => clean(c)));
  const lines = paras.map((p) => p.text);
  const folded = lines.map(fold);
  const kind: (PartKind | null)[] = paras.map(() => null);
  const warnings: string[] = [];
  const take = (i: number, k: PartKind) => {
    if (i >= 0 && i < kind.length && kind[i] === null) kind[i] = k;
  };

  // The title with the number; anything before it is the letterhead.
  const titleIdx = folded.findIndex((l) => /proces[\s-]*verbal/.test(l));
  for (let i = 0; i < titleIdx; i++) take(i, "antet");
  const nrMatch = titleIdx >= 0 ? /proces[\s-]*verbal\w*\s*(?:nr\.?|numarul)?\s*(\d{1,4})\b/.exec(folded[titleIdx]) : null;
  const nr = nrMatch && Number(nrMatch[1]) >= 1 ? Number(nrMatch[1]) : null;
  take(titleIdx, "numar");

  // The first date, preferably on the "Încheiat azi" line.
  const dateRe = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/;
  let dateIdx = folded.findIndex((l) => l.includes("incheiat") && dateRe.test(l));
  if (dateIdx < 0) dateIdx = folded.findIndex((l, i) => i >= titleIdx && dateRe.test(l) && !MARKER.test(l));
  const dm = dateIdx >= 0 ? dateRe.exec(folded[dateIdx]) : null;
  const data = dm ? isoDate(dm[1], dm[2], dm[3]) : null;
  if (!data) warnings.push("Data ședinței nu a putut fi citită; verificați-o.");
  if (dateIdx >= 0 && kind[dateIdx] === null) take(dateIdx, "data");
  const tipIdx = folded.findIndex((l) => /cu ocazia sedintei de\s+/.test(l));
  let tip: string | null = null;
  if (tipIdx >= 0) {
    const m = /cu ocazia sedintei de\s+([^.\n]+)/.exec(folded[tipIdx])!;
    const end = m.index + m[0].length;
    tip = clean(lines[tipIdx].slice(end - m[1].length, end)) || null;
    if (kind[tipIdx] === null || kind[tipIdx] === "numar") take(tipIdx, "data");
  }

  const isHeading = (i: number) => HEADING.test(folded[i]) && lines[i].length <= 160 && !paras[i].list && !MARKER.test(lines[i]);

  // Attendees: the names after "prezenți:" on the same line, else the next paragraph.
  let prezenti: string[] = [];
  let numarPrezenti: number | null = null;
  const pi = folded.findIndex((l) => /\bprezenti\b/.test(l) && !/\babsenti\b/.test(l.split("prezenti")[0]));
  if (pi >= 0) {
    take(pi, "prezenti");
    const after = clean(lines[pi].slice(folded[pi].indexOf("prezenti") + "prezenti".length).replace(/^\s*:/, ""));
    const counted = /^(\d{1,5})\b/.exec(after);
    if (counted) numarPrezenti = Number(counted[1]);
    const inline = after.replace(/^\d+\s*(?:de\s*)?(?:membri|persoane|frati)?\.?/i, "").trim();
    if (names(inline).length) prezenti = names(inline);
    else if (pi + 1 < paras.length && kind[pi + 1] === null && !isHeading(pi + 1) && !SIGNATURE.test(folded[pi + 1]) && !MARKER.test(lines[pi + 1]) && !/^(absenti|invitati)/.test(folded[pi + 1])) {
      prezenti = names(lines[pi + 1]);
      if (prezenti.length) take(pi + 1, "prezenti");
    }
  }
  if (!prezenti.length) warnings.push("Lista celor prezenți nu a putut fi citită.");
  const listAfter = (label: RegExp, k: PartKind): string[] => {
    const i = folded.findIndex((l, j) => kind[j] === null && label.test(l));
    if (i < 0) return [];
    take(i, k);
    return names(lines[i].replace(/^[^:]*:/, ""));
  };
  const absenti = listAfter(/^absenti\b/, "absenti");
  const invitati = listAfter(/^invitati\b/, "invitati");

  // The points' section: from the first heading to the closing sentence or the signatures.
  const headings = paras.map((_, i) => i).filter((i) => kind[i] === null && isHeading(i));
  const start = headings.length ? headings[0] : -1;
  let end = paras.length;
  if (start >= 0) {
    for (let i = start + 1; i < paras.length; i++) {
      const voteLike = VOTE.test(folded[i]);
      if ((!voteLike && CLOSING.test(folded[i]) && !paras[i].list && !paras[i].cells) || SIGNATURE.test(folded[i])) {
        end = i;
        break;
      }
    }
  }
  // „Observații:” ends the points; its text, up to the closing, is the observations.
  const obsIdx = start >= 0 ? folded.findIndex((l, i) => i > start && i < end && /^observatii\s*:?\s*$/.test(l)) : -1;
  const pointsEnd = obsIdx >= 0 ? obsIdx : end;
  // Agenda and points: an „Ordinea de zi” followed by another heading is the agenda, the rest the points.
  const agendaHeading = headings.find((h) => AGENDA.test(folded[h]));
  const pointsHeading = headings.find((h) => !AGENDA.test(folded[h]) && (agendaHeading === undefined || h > agendaHeading));
  const agendaEnd = agendaHeading !== undefined && pointsHeading !== undefined ? pointsHeading : -1;

  const ordine: string[] = [];
  const puncte: string[] = [];
  const voturi: (DraftVote | null)[] = [];
  if (start >= 0) {
    take(start, "titlu");
    // Numbered style (lists, markers, tables): a plain paragraph continues the point before it.
    const region = paras.map((_, i) => i).filter((i) => i > start && i < pointsEnd);
    const numbered = region.some((i) => paras[i].list || paras[i].cells || MARKER.test(lines[i]));
    const addPoint = (text: string, target: string[]) => {
      if (target.length >= 100) return false;
      target.push(text.slice(0, 2000));
      if (target === puncte) voturi.push(null);
      return true;
    };
    for (const i of region) {
      if (kind[i] !== null) continue;
      const p = paras[i];
      const f = folded[i];
      const inAgenda = agendaEnd > 0 && i < agendaEnd;
      const target = inAgenda ? ordine : puncte;
      if (isHeading(i)) {
        take(i, "titlu");
        continue;
      }
      if (/^semnatura/.test(f)) {
        take(i, "semnaturi");
        continue;
      }
      // A vote under the point before it.
      if (VOTE.test(f) && !inAgenda && puncte.length && !p.list && !p.cells) {
        const v = parseVote(lines[i]);
        if (v && !voturi[voturi.length - 1]) voturi[voturi.length - 1] = v;
        else puncte[puncte.length - 1] = `${puncte[puncte.length - 1]}\n${lines[i]}`.slice(0, 2000);
        take(i, "vot");
        continue;
      }
      if (p.cells) {
        const cells = p.cells.map(clean).filter(Boolean);
        const headerRow = /^(nr\.?|crt\.?|nr\.? ?crt\.?)$/.test(fold(cells[0] ?? "")) || (cells.length > 1 && /^(punct|puncte|hotarar|descriere|subiect|vot)/.test(fold(cells[1])));
        if (headerRow) {
          take(i, "titlu");
          continue;
        }
        const numberCell = cells.length > 1 && /^\d{1,3}[.)]?$/.test(cells[0]);
        const body = (numberCell ? cells.slice(1) : cells).filter((c) => !(VOTE.test(fold(c)) && parseVote(c)));
        const voteCell = cells.find((c) => VOTE.test(fold(c)) && parseVote(c));
        if (body.length && addPoint(stripMarker(body.join(" ")), target)) {
          if (voteCell && target === puncte) voturi[voturi.length - 1] = parseVote(voteCell);
          take(i, inAgenda ? "ordine" : "punct");
        }
        continue;
      }
      if (p.list || MARKER.test(lines[i]) || !numbered) {
        if (addPoint(stripMarker(lines[i]), target)) take(i, inAgenda ? "ordine" : "punct");
        continue;
      }
      // A paragraph without a number: the rest of the point before it.
      if (target.length) {
        target[target.length - 1] = `${target[target.length - 1]}\n${lines[i]}`.slice(0, 2000);
        take(i, inAgenda ? "ordine" : "punct");
      }
    }
  }

  const observatii: string[] = [];
  if (obsIdx >= 0) {
    take(obsIdx, "titlu");
    for (let i = obsIdx + 1; i < end; i++) {
      if (kind[i] !== null) continue;
      observatii.push(lines[i]);
      take(i, "observatii");
    }
  }
  // The closing sentence (after the points, or anywhere when there is no section) and the signatures.
  const closingIdx = folded.findIndex((l, i) => kind[i] === null && i >= Math.max(0, start) && !VOTE.test(l) && CLOSING.test(l));
  const formulaIncheiere = closingIdx >= 0 ? lines[closingIdx].slice(0, 500) || null : null;
  take(closingIdx, "incheiere");
  folded.forEach((l, i) => {
    if (SIGNATURE.test(l)) take(i, "semnaturi");
  });

  const parts = paras.map((p, i) => ({ kind: kind[i] ?? ("nerecunoscut" as const), text: p.text }));
  return {
    draft: {
      nr,
      data,
      tip,
      prezenti,
      numarPrezenti,
      absenti,
      invitati,
      ordine,
      puncte,
      voturi,
      formulaIncheiere,
      secretar: signer(lines, /\bsecretar\w*\s*[,:]\s*/),
      pastor: signer(lines, /\bpast\w*\s*[,:]\s*/),
      observatii,
      nerecunoscut: parts.filter((p) => p.kind === "nerecunoscut").map((p) => p.text),
    },
    warnings,
    parts,
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );

/**
 * mammoth's HTML → paragraphs: <p> / <h1…6> (a line break inside one starts a new paragraph), list items
 * of <ol> / <ul> (a nested list's items are items too), table rows with their cells.
 */
export function htmlParas(html: string): DocPara[] {
  const out: DocPara[] = [];
  const lists: ("ol" | "ul")[] = [];
  let buf = "";
  /** Open list items (a nested list sits inside its parent's item). */
  let itemDepth = 0;
  let row: string[] | null = null;
  let cell: string | null = null;
  const flushItem = () => {
    if (itemDepth > 0 && clean(buf)) out.push({ text: clean(decode(buf)), list: lists[lists.length - 1] ?? "ul" });
    buf = "";
  };
  const flushPara = () => {
    for (const line of decode(buf).split("\n")) if (clean(line)) out.push({ text: clean(line) });
    buf = "";
  };
  for (const m of html.matchAll(/<(\/?)([a-z0-9]+)[^>]*?(\/?)>|([^<]+)/gi)) {
    if (m[4] !== undefined) {
      if (cell !== null) cell += m[4];
      else buf += m[4];
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (cell !== null && tag !== "td" && tag !== "th" && tag !== "tr" && tag !== "table") {
      // Inside a cell: paragraphs and breaks become spaces between its lines.
      if (tag === "p" || tag === "br" || tag === "li") cell += " ";
      continue;
    }
    if (tag === "br") {
      buf += itemDepth > 0 ? " " : "\n";
    } else if (tag === "ol" || tag === "ul") {
      if (!closing) {
        flushItem();
        lists.push(tag);
      } else {
        flushItem();
        lists.pop();
      }
    } else if (tag === "li") {
      flushItem();
      itemDepth = Math.max(0, itemDepth + (closing ? -1 : 1));
    } else if (tag === "tr") {
      if (!closing) row = [];
      else if (row) {
        const cells = row.map((c) => clean(decode(c)));
        if (cells.some(Boolean)) out.push({ text: cells.filter(Boolean).join(" "), cells });
        row = null;
      }
    } else if (tag === "td" || tag === "th") {
      if (!closing) cell = "";
      else if (cell !== null) {
        row?.push(cell);
        cell = null;
      }
    } else if (/^(p|h[1-6])$/.test(tag) && closing && itemDepth === 0) {
      flushPara();
    }
  }
  if (itemDepth > 0) flushItem();
  else flushPara();
  return out;
}
