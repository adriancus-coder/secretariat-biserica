/**
 * Conținutul documentelor tipărite (PDF), ca listă de blocuri — portarea funcțiilor
 * printMeeting, printEvent, printGroup și docHtml din prototip. Funcții pure, testabile;
 * randarea efectivă se face în src/server/pdf/render.ts.
 */
import { fmtL, memberName } from "@/lib/format";
import { DEFAULT_CLOSING } from "@/lib/minutes";
import { DOCUMENT_HEADING, type DocumentTypeKey } from "@/lib/labels";
import type { PageLayout } from "@/lib/page-layout";
import { ALIGN_LABEL, richLines, type RichDoc, type RichLine } from "@/lib/rich-text";
import type { ChurchInfo } from "./types";

export type Run = { text: string; bold?: boolean };

export interface Signature {
  label: string;
  name: string;
}

export type Block =
  | { type: "nr"; text: string }
  /** Centered heading, in capitals unless `asWritten` (the minutes keep "Proces verbal nr. 16"). */
  | { type: "title"; text: string; asWritten?: boolean }
  | { type: "para"; runs: Run[]; pre?: boolean }
  | { type: "list"; items: string[]; ordered?: boolean; start?: number }
  | { type: "signatures"; left: Signature; right: Signature }
  /** "Secretar, Ioana Pop" with "Semnătura" and a line under it, in two columns (the minutes). */
  | { type: "signed"; left: Signature; right: Signature }
  /** "Nume | Semnătura": one row per person, with the drawn signature (PNG) or an empty line to sign on paper. */
  | { type: "signatureTable"; rows: SignatureCell[] }
  /** A centered line (the application poster), `size` in points. */
  | { type: "centered"; text: string; size?: number; bold?: boolean }
  /**
   * Rich text from the editor (bold, italic, underline, sizes, alignment, lists); `marker` ("1.") hangs
   * it as one numbered point of the minutes. Paragraphs follow each other like lines of a text.
   */
  | { type: "rich"; doc: RichDoc; marker?: string }
  /** A table with a header row (person lists); repeated header on every page. */
  | { type: "table"; columns: string[]; rows: string[][] }
  /**
   * A vector chart (Statistici): a line per series, stacked bars, or the age pyramid (series[0] men to
   * the left, series[1] women to the right). Word and printToText show it as a table.
   */
  | { type: "chart"; kind: "line" | "bars" | "pyramid"; title: string; labels: string[]; series: { name: string; values: number[] }[] }
  /** A centered PNG (the application QR code), `width` in points; `alt` stands for it in printToText. */
  | { type: "image"; png: Uint8Array; width: number; alt: string };

export interface SignatureCell {
  name: string;
  /** PNG bytes of the drawn signature, or null for a line to sign by hand. */
  image: Uint8Array | null;
  /** "11.09.2026 14:03", shown under the image. */
  signedAt: string | null;
}

export interface PrintSpec {
  title: string;
  church: ChurchInfo;
  blocks: Block[];
  /** A line at the bottom of every page (e.g. "Proces-verbal închis la …"). */
  footer?: string;
  /** Page size; A4 by default (ignored when `layout` is given). */
  size?: "A4" | "A5";
  /** Margins, text size, line height, alignment, letterhead (the minutes); defaults otherwise. */
  layout?: PageLayout;
  /** Landscape page (wide tables). */
  landscape?: boolean;
}

export const b = (text: string): Run => ({ text, bold: true });

export function para(...runs: (Run | string)[]): Block {
  return { type: "para", runs: runs.map((r) => (typeof r === "string" ? { text: r } : r)) };
}

export function pre(text: string): Block {
  return { type: "para", runs: [{ text }], pre: true };
}

/** Semnăturile standard: pastor și secretar (la darea de seamă, ordinea e inversată). */
export function pastorSecretarySignatures(c: ChurchInfo, secretaryFirst = false): Block {
  const pastor = { label: "Pastor", name: c.pastor };
  const secretar = { label: "Secretar", name: c.secretar };
  return secretaryFirst
    ? { type: "signatures", left: secretar, right: pastor }
    : { type: "signatures", left: pastor, right: secretar };
}

/** The ordinary minutes' line for a disciplinary matter (its content is only in the administrators' "PV disciplinar"). */
export const CLOSED_SESSION_LINE = "Punct tratat în ședință închisă.";

export interface MeetingPrint {
  nr: number | null;
  tip: string;
  data: string;
  /** Present persons, already in register order (by surname). */
  prezenti: { nume: string; prenume: string }[];
  absenti: { nume: string; prenume: string }[];
  invitati: string;
  ordine: string;
  puncte: string[];
  observatii: string;
  formulaIncheiere: string;
  /** The rich versions from the editor, used instead of the plain text when present. */
  puncteRich?: (RichDoc | null)[] | null;
  observatiiRich?: RichDoc | null;
  formulaRich?: RichDoc | null;
  /** "Prezenți n din m (p %)" for meeting types with an attendance rule; omitted otherwise. */
  cvorum?: string | null;
  /** The General Assembly's line (members with full rights, present, announcement) instead of a quorum. */
  adunare?: string | null;
  /** "Votat: pentru …" under each point (aligned with `puncte`, null = no vote recorded). */
  voturi?: (string | null)[] | null;
  /** A disciplinary matter was handled in closed session: only this line, never its content (Statut art. 272). */
  sedintaInchisa?: boolean;
  /** The signature table, one row per person present (in the order of `prezenti`). */
  semnaturi?: SignatureCell[];
  /** "11.09.2026 14:03" when the minutes were closed. */
  inchisLa?: string | null;
}

/** "Ioana Pop": the minutes write names first name first. */
const firstLast = (p: { nume: string; prenume: string }) => `${p.prenume} ${p.nume}`.trim();

/** "11.09.2026". */
export function fmtDot(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/**
 * Procesul-verbal in the church's format (docs/samples/proces-verbal-model.md), for every meeting type:
 * number, date and type, the persons present (count and names), absentees and guests, the numbered
 * points, the closing sentence, and the Secretar / Pastor signatures from the church settings.
 */
export function meetingPrint(x: MeetingPrint, church: ChurchInfo): PrintSpec {
  const n = x.prezenti.length;
  const blocks: Block[] = [
    { type: "title", text: x.nr !== null ? `Proces verbal nr. ${x.nr}` : "Proces verbal", asWritten: true },
    para(`Încheiat azi, ${fmtDot(x.data)}, cu ocazia ședinței de ${x.tip.toLocaleLowerCase("ro-RO")}.`),
    para(`La ședință au fost prezenți: ${n} ${n === 1 ? "membru" : "membri"}.`),
    para(x.prezenti.map(firstLast).join(", ") || "—"),
  ];
  if (x.semnaturi?.length) blocks.push({ type: "signatureTable", rows: x.semnaturi });
  if (x.absenti.length) blocks.push(para(`Absenți: ${x.absenti.map(firstLast).join(", ")}`));
  if (x.adunare) blocks.push(para(x.adunare));
  if (x.cvorum) blocks.push(para(`Cvorum: ${x.cvorum.replace(/^Prezenți/, "prezenți")}`));
  if (x.invitati) blocks.push(para(`Invitați: ${x.invitati}`));
  if (x.ordine) blocks.push(para("Ordinea de zi:"), pre(x.ordine));
  blocks.push(para("În cadrul ședinței s-au discutat și aprobat următoarele:"));
  const richPoints = x.puncteRich?.length === x.puncte.length && x.puncteRich.some(Boolean) ? x.puncteRich : null;
  const votes = x.voturi?.some(Boolean) ? x.voturi : null;
  if (richPoints || votes) {
    x.puncte.forEach((p, i) => {
      const doc = richPoints?.[i];
      blocks.push(doc ? { type: "rich", doc, marker: `${i + 1}.` } : { type: "list", items: [p], ordered: true, start: i + 1 });
      const vote = votes?.[i];
      if (vote) blocks.push(para(vote));
    });
  } else if (x.puncte.length) blocks.push({ type: "list", items: x.puncte, ordered: true });
  if (x.sedintaInchisa) blocks.push(para(CLOSED_SESSION_LINE));
  if (x.observatii || x.observatiiRich) blocks.push(para("Observații:"), x.observatiiRich ? { type: "rich", doc: x.observatiiRich } : pre(x.observatii));
  // With recorded votes the default "votate în unanimitate" would contradict them: it is left out.
  if (!(votes && x.formulaIncheiere === DEFAULT_CLOSING)) blocks.push(x.formulaRich ? { type: "rich", doc: x.formulaRich } : para(x.formulaIncheiere));
  blocks.push(para("Întocmit,"));
  blocks.push({
    type: "signed",
    left: { label: "Secretar", name: church.secretar },
    right: { label: "Pastor", name: church.pastor },
  });
  return {
    title: `Proces verbal${x.nr !== null ? ` nr. ${x.nr}` : ""} ${fmtDot(x.data)}`,
    church,
    blocks,
    ...(x.inchisLa ? { footer: `Proces-verbal închis la ${x.inchisLa}` } : {}),
  };
}

export interface DocumentPrint {
  tip: DocumentTypeKey;
  nr: number | string;
  data: string;
  text: string;
  /** The rich version from the editor, used instead of `text` when present. */
  textRich?: RichDoc | null;
  titlu?: string;
}

/** Documentul din registru (docHtml din prototip). */
export function documentPrint(x: DocumentPrint, church: ChurchInfo): PrintSpec {
  const heading = DOCUMENT_HEADING[x.tip];
  const blocks: Block[] = [{ type: "nr", text: `Nr. ${x.nr} din ${fmtL(x.data)}` }];
  if (heading) blocks.push({ type: "title", text: heading });
  blocks.push(x.textRich ? { type: "rich", doc: x.textRich } : pre(x.text));
  // The General Assembly's convocation is signed by the pastor (Statut art. 46).
  blocks.push(
    x.tip === "convocare"
      ? { type: "signatures", left: { label: "", name: "" }, right: { label: "Pastor", name: church.pastor } }
      : pastorSecretarySignatures(church, x.tip === "raport"),
  );
  return { title: x.titlu || heading || "Document", church, blocks };
}

/** Darea de seamă tipărită direct, fără înregistrare (pentru rolul de vizualizare — ca în prototip). */
export function reportPrint(year: number, text: string, church: ChurchInfo): PrintSpec {
  return {
    title: `Dare de seamă ${year}`,
    church,
    blocks: [{ type: "title", text: `Dare de seamă ${year}` }, pre(text), pastorSecretarySignatures(church, true)],
  };
}

export interface GroupPrint {
  nume: string;
  responsabil: string;
  membri: { nume: string; prenume: string; telefon: string }[];
}

/** Lista unui grup (printGroup din prototip), cu semnăturile pastorului și secretarului. */
export function groupPrint(g: GroupPrint, church: ChurchInfo): PrintSpec {
  const blocks: Block[] = [{ type: "title", text: g.nume }];
  if (g.responsabil) blocks.push(para(b("Responsabil:"), ` ${g.responsabil}`));
  blocks.push({
    type: "list",
    ordered: true,
    items: g.membri.map((m) => `${memberName(m)}${m.telefon ? ` — ${m.telefon}` : ""}`),
  });
  blocks.push(pastorSecretarySignatures(church));
  return { title: g.nume, church, blocks };
}

export interface EventPrint {
  titlu: string;
  data: string;
  ora: string;
  loc: string;
  invitat: string;
  responsabil: string;
  descriere: string;
  agapaActiva: boolean;
  agapaResponsabil: string;
  agapaPersoane: number | null;
  contributii: { cine: string; ce: string }[];
}

/** Fișa unui eveniment (printEvent din prototip). */
export function eventPrint(x: EventPrint, church: ChurchInfo): PrintSpec {
  const blocks: Block[] = [
    { type: "title", text: x.titlu },
    para(b("Data:"), ` ${fmtL(x.data)}${x.ora ? `, ora ${x.ora}` : ""}`, ...(x.loc ? [" · ", b("Loc:"), ` ${x.loc}`] : [])),
  ];
  if (x.invitat) blocks.push(para(b("Invitat:"), ` ${x.invitat}`));
  if (x.responsabil) blocks.push(para(b("Responsabil:"), ` ${x.responsabil}`));
  if (x.descriere) blocks.push(pre(x.descriere));
  if (x.agapaActiva) {
    blocks.push(
      para(
        b("Agapă"),
        `${x.agapaResponsabil ? ` — responsabil: ${x.agapaResponsabil}` : ""}${x.agapaPersoane ? ` — aprox. ${x.agapaPersoane} persoane` : ""}`,
      ),
    );
    if (x.contributii.length) blocks.push({ type: "list", items: x.contributii.map((c) => `${c.cine}: ${c.ce}`) });
  }
  return { title: x.titlu, church, blocks };
}

/** The A5 poster for the public membership application: the church, the QR code and the link as text. */
export function printApplicationPoster(
  church: ChurchInfo,
  url: string,
  qrPng: Uint8Array,
  text: { title: string; line: string } = { title: "Cerere de membru online", line: "Scanați codul cu telefonul pentru a completa cererea." },
): PrintSpec {
  return {
    title: text.title,
    church,
    size: "A5",
    blocks: [
      { type: "centered", text: text.title, size: 22, bold: true },
      { type: "centered", text: text.line, size: 12 },
      { type: "image", png: qrPng, width: 220, alt: `[cod QR: ${url}]` },
      { type: "centered", text: url, size: 11 },
    ],
  };
}

/** printToText options: `marks` writes the formatting too (for the renderer tests). */
export interface PrintTextOptions {
  marks?: boolean;
}

/**
 * One rich line as text: list markers and indentation like richToPlain; with `marks`, runs as
 * **bold**, _italic_, __underline__, {mare:…}, and the alignment as "[centru] ".
 */
export function richLineText(line: RichLine, marks = false): string {
  const body = line.runs
    .map((r) => {
      if (!marks) return r.text;
      let t = r.text;
      if (r.size) t = `{${r.size}:${t}}`;
      if (r.underline) t = `__${t}__`;
      if (r.italic) t = `_${t}_`;
      if (r.bold) t = `**${t}**`;
      return t;
    })
    .join("");
  const pad = line.level > 1 ? "   ".repeat(line.level - 1) : "";
  const prefix = line.level ? (line.marker ? `${pad}${line.marker} ` : `${pad}   `) : "";
  const align = marks && line.align ? `[${ALIGN_LABEL[line.align]}] ` : "";
  return `${prefix}${align}${body}`;
}

function richToText(doc: RichDoc, marker: string | undefined, marks: boolean): string[] {
  const lines = richLines(doc).map((l) => richLineText(l, marks));
  if (!marker) return lines;
  return lines.map((l, i) => (i ? `${" ".repeat(marker.length + 1)}${l}` : `${marker} ${l}`));
}

/** A chart as table rows: header (label column, then one per series), then one row per label. */
export function chartTable(blk: Extract<Block, { type: "chart" }>): string[][] {
  return [["", ...blk.series.map((s) => s.name)], ...blk.labels.map((l, i) => [l, ...blk.series.map((s) => String(s.values[i] ?? 0))])];
}

/** Textul simplu al unui document tipărit (pentru teste și previzualizare). */
export function printToText(spec: PrintSpec, opts: PrintTextOptions = {}): string {
  const lines: string[] = [`Biserica ${spec.church.nume}`.trim()];
  for (const blk of spec.blocks) {
    if (blk.type === "nr" || blk.type === "title") lines.push(blk.text);
    else if (blk.type === "para") lines.push(blk.runs.map((r) => r.text).join(""));
    else if (blk.type === "rich") lines.push(...richToText(blk.doc, blk.marker, opts.marks ?? false));
    else if (blk.type === "table") lines.push(blk.columns.join(" | "), ...blk.rows.map((r) => r.join(" | ")));
    else if (blk.type === "chart") lines.push(blk.title, ...chartTable(blk).map((r) => r.join(" | ")));
    else if (blk.type === "centered") lines.push(blk.text);
    else if (blk.type === "image") lines.push(blk.alt);
    else if (blk.type === "list") blk.items.forEach((it, i) => lines.push(`${blk.ordered ? `${(blk.start ?? 1) + i}.` : "•"} ${it}`));
    else if (blk.type === "signatureTable") {
      lines.push("Nume | Semnătura");
      for (const r of blk.rows) lines.push(`${r.name} | ${r.image ? `semnat ${r.signedAt ?? ""}`.trim() : "________________"}`);
    } else if (blk.type === "signed") {
      lines.push(`${blk.left.label}, ${blk.left.name} | ${blk.right.label}, ${blk.right.name}`);
      lines.push("Semnătura | Semnătura");
    } else lines.push(`${blk.left.label}: ${blk.left.name} | ${blk.right.label}: ${blk.right.name}`);
  }
  if (spec.footer) lines.push(spec.footer);
  return lines.join("\n");
}
