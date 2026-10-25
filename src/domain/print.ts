/**
 * Conținutul documentelor tipărite (PDF), ca listă de blocuri — portarea funcțiilor
 * printMeeting, printEvent, printGroup și docHtml din prototip. Funcții pure, testabile;
 * randarea efectivă se face în src/server/pdf/render.ts.
 */
import { fmtL, memberName } from "@/lib/format";
import { DOCUMENT_HEADING, type DocumentTypeKey } from "@/lib/labels";
import type { PageLayout } from "@/lib/page-layout";
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
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "signatures"; left: Signature; right: Signature }
  /** "Secretar, Ioana Pop" with "Semnătura" and a line under it, in two columns (the minutes). */
  | { type: "signed"; left: Signature; right: Signature }
  /** "Nume | Semnătura": one row per person, with the drawn signature (PNG) or an empty line to sign on paper. */
  | { type: "signatureTable"; rows: SignatureCell[] }
  /** A centered line (the application poster), `size` in points. */
  | { type: "centered"; text: string; size?: number; bold?: boolean }
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
  /** "Prezenți n din m (p %)" for meeting types with an attendance rule; omitted otherwise. */
  cvorum?: string | null;
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
  if (x.cvorum) blocks.push(para(`Cvorum: ${x.cvorum.replace(/^Prezenți/, "prezenți")}`));
  if (x.invitati) blocks.push(para(`Invitați: ${x.invitati}`));
  if (x.ordine) blocks.push(para("Ordinea de zi:"), pre(x.ordine));
  blocks.push(para("În cadrul ședinței s-au discutat și aprobat următoarele:"));
  if (x.puncte.length) blocks.push({ type: "list", items: x.puncte, ordered: true });
  if (x.observatii) blocks.push(para("Observații:"), pre(x.observatii));
  blocks.push(para(x.formulaIncheiere));
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
  titlu?: string;
}

/** Documentul din registru (docHtml din prototip). */
export function documentPrint(x: DocumentPrint, church: ChurchInfo): PrintSpec {
  const heading = DOCUMENT_HEADING[x.tip];
  const blocks: Block[] = [{ type: "nr", text: `Nr. ${x.nr} din ${fmtL(x.data)}` }];
  if (heading) blocks.push({ type: "title", text: heading });
  blocks.push(pre(x.text));
  blocks.push(pastorSecretarySignatures(church, x.tip === "raport"));
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

/** Textul simplu al unui document tipărit (pentru teste și previzualizare). */
/** The A5 poster for the public membership application: the church, the QR code and the link as text. */
export function printApplicationPoster(church: ChurchInfo, url: string, qrPng: Uint8Array): PrintSpec {
  return {
    title: "Cerere de membru online",
    church,
    size: "A5",
    blocks: [
      { type: "centered", text: "Cerere de membru online", size: 22, bold: true },
      { type: "centered", text: "Scanați codul cu telefonul pentru a completa cererea.", size: 12 },
      { type: "image", png: qrPng, width: 220, alt: `[cod QR: ${url}]` },
      { type: "centered", text: url, size: 11 },
    ],
  };
}

export function printToText(spec: PrintSpec): string {
  const lines: string[] = [`Biserica ${spec.church.nume}`.trim()];
  for (const blk of spec.blocks) {
    if (blk.type === "nr" || blk.type === "title") lines.push(blk.text);
    else if (blk.type === "para") lines.push(blk.runs.map((r) => r.text).join(""));
    else if (blk.type === "centered") lines.push(blk.text);
    else if (blk.type === "image") lines.push(blk.alt);
    else if (blk.type === "list") blk.items.forEach((it, i) => lines.push(`${blk.ordered ? `${i + 1}.` : "•"} ${it}`));
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
