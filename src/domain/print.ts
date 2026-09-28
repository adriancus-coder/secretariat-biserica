/**
 * Conținutul documentelor tipărite (PDF), ca listă de blocuri — portarea funcțiilor
 * printMeeting, printEvent, printGroup și docHtml din prototip. Funcții pure, testabile;
 * randarea efectivă se face în src/server/pdf/render.ts.
 */
import { fmtL, memberName } from "@/lib/format";
import { DOCUMENT_HEADING, type DocumentTypeKey } from "@/lib/labels";
import type { ChurchInfo } from "./types";

export type Run = { text: string; bold?: boolean };

export interface Signature {
  label: string;
  name: string;
}

export type Block =
  | { type: "nr"; text: string }
  | { type: "title"; text: string }
  | { type: "para"; runs: Run[]; pre?: boolean }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "signatures"; left: Signature; right: Signature };

export interface PrintSpec {
  title: string;
  church: ChurchInfo;
  blocks: Block[];
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
  titlu: string;
  tip: string;
  data: string;
  ora: string;
  loc: string;
  presedinte: string;
  invitati: string;
  ordine: string;
  discutii: string;
  hotarari: string;
  /** Numele prezenților, în ordine alfabetică. */
  prezenti: string[];
}

/** Procesul-verbal în formatul oficial (printMeeting din prototip). */
export function meetingPrint(x: MeetingPrint, church: ChurchInfo): PrintSpec {
  const blocks: Block[] = [
    { type: "title", text: "Proces-verbal" },
    para(
      `Încheiat astăzi, ${fmtL(x.data)}${x.ora ? `, ora ${x.ora}` : ""}, ${x.loc ? `la ${x.loc}, ` : ""}cu ocazia ședinței de tip „${x.tip}”${x.titlu ? ` — ${x.titlu}` : ""}${x.presedinte ? `, prezidată de ${x.presedinte}` : ""}.`,
    ),
    para(
      b(`Prezenți (${x.prezenti.length}):`),
      ` ${x.prezenti.join(", ") || "—"}.`,
      ...(x.invitati ? [b(" Invitați:"), ` ${x.invitati}.`] : []),
    ),
  ];
  if (x.ordine) blocks.push(para(b("Ordinea de zi:")), pre(x.ordine));
  if (x.discutii) blocks.push(para(b("Discuții:")), pre(x.discutii));
  if (x.hotarari) blocks.push(para(b("Hotărâri:")), pre(x.hotarari));
  blocks.push(para("Drept care s-a încheiat prezentul proces-verbal."));
  blocks.push({
    type: "signatures",
    left: { label: "Președinte de ședință", name: x.presedinte || church.pastor },
    right: { label: "Secretar", name: church.secretar },
  });
  return { title: `Proces-verbal ${x.data}${x.titlu ? ` — ${x.titlu}` : ""}`, church, blocks };
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
export function printToText(spec: PrintSpec): string {
  const lines: string[] = [`Biserica ${spec.church.nume}`.trim()];
  for (const blk of spec.blocks) {
    if (blk.type === "nr" || blk.type === "title") lines.push(blk.text);
    else if (blk.type === "para") lines.push(blk.runs.map((r) => r.text).join(""));
    else if (blk.type === "list") blk.items.forEach((it, i) => lines.push(`${blk.ordered ? `${i + 1}.` : "•"} ${it}`));
    else lines.push(`${blk.left.label}: ${blk.left.name} | ${blk.right.label}: ${blk.right.name}`);
  }
  return lines.join("\n");
}
