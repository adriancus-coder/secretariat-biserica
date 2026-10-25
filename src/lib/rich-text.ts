/**
 * Rich text of the minutes and documents: the editor's JSON document (Tiptap / ProseMirror) with a
 * deliberately small vocabulary — paragraphs (aligned), numbered and bulleted lists, line breaks,
 * and the marks bold, italic, underline and text size. No colours, fonts, images, links or HTML.
 * The plain-text projection (`richToPlain`) is stored next to it for search, exports and the
 * parity-tested domain functions. Pure.
 */

export const TEXT_SIZES = ["mic", "normal", "mare", "foarteMare"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const TEXT_SIZE_LABEL: Record<TextSize, string> = { mic: "Mic", normal: "Normal", mare: "Mare", foarteMare: "Foarte mare" };
/** Points added to the page layout's base size. */
export const TEXT_SIZE_DELTA: Record<TextSize, number> = { mic: -2, normal: 0, mare: 3, foarteMare: 6 };

export const ALIGNS = ["left", "center", "right", "justify"] as const;
export type Align = (typeof ALIGNS)[number];
export const ALIGN_LABEL: Record<Align, string> = { left: "stânga", center: "centru", right: "dreapta", justify: "stânga-dreapta" };

export type RichMark = { type: "bold" } | { type: "italic" } | { type: "underline" } | { type: "textSize"; attrs: { size: TextSize } };
export type RichText = { type: "text"; text: string; marks?: RichMark[] };
export type RichHardBreak = { type: "hardBreak" };
export type RichInline = RichText | RichHardBreak;
export type RichParagraph = { type: "paragraph"; attrs?: { align?: Align | null }; content?: RichInline[] };
export type RichListItem = { type: "listItem"; content: (RichParagraph | RichList)[] };
export type RichList =
  | { type: "orderedList"; attrs?: { start?: number; type?: string | null }; content: RichListItem[] }
  | { type: "bulletList"; content: RichListItem[] };
export type RichBlock = RichParagraph | RichList;
export type RichDoc = { type: "doc"; content: RichBlock[] };

/** Most bytes one stored document may take (its JSON). */
export const RICH_MAX_BYTES = 200 * 1024;
/** Deepest list nesting accepted (a list inside a list inside a list…). */
export const RICH_MAX_DEPTH = 6;

export const emptyRich = (): RichDoc => ({ type: "doc", content: [{ type: "paragraph" }] });

/** One printed line: its runs, alignment and, inside a list, the marker and nesting level. */
export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: TextSize;
}
export interface RichLine {
  runs: RichRun[];
  align: Align | null;
  /** "1." / "•" on the first paragraph of a list item, "" on its later paragraphs. */
  marker?: string;
  /** 0 outside lists, 1 inside a list, 2 inside a nested list… */
  level: number;
}

function inlineRuns(content: RichInline[] | undefined): RichRun[] {
  const runs: RichRun[] = [];
  for (const node of content ?? []) {
    if (node.type === "hardBreak") {
      runs.push({ text: "\n" });
      continue;
    }
    const run: RichRun = { text: node.text };
    for (const m of node.marks ?? []) {
      if (m.type === "bold") run.bold = true;
      else if (m.type === "italic") run.italic = true;
      else if (m.type === "underline") run.underline = true;
      else if (m.type === "textSize" && m.attrs.size !== "normal") run.size = m.attrs.size;
    }
    runs.push(run);
  }
  return runs;
}

/** The document as printable lines (paragraphs, list items with their markers), in order. */
export function richLines(doc: RichDoc): RichLine[] {
  const out: RichLine[] = [];
  const walk = (blocks: RichBlock[], level: number) => {
    for (const block of blocks) {
      if (block.type === "paragraph") {
        out.push({ runs: inlineRuns(block.content), align: block.attrs?.align ?? null, level });
        continue;
      }
      const start = block.type === "orderedList" ? (block.attrs?.start ?? 1) : 1;
      block.content.forEach((item, i) => {
        let first = true;
        for (const child of item.content) {
          if (child.type === "paragraph") {
            out.push({
              runs: inlineRuns(child.content),
              align: child.attrs?.align ?? null,
              marker: first ? (block.type === "orderedList" ? `${start + i}.` : "•") : "",
              level: level + 1,
            });
            first = false;
          } else walk([child], level + 1);
        }
      });
    }
  };
  walk(doc.content, 0);
  return out;
}

/** "   " per nesting level below the first, then "1. " or "- ". */
const plainPrefix = (line: RichLine) => {
  if (!line.level) return "";
  const pad = "   ".repeat(line.level - 1);
  if (line.marker === undefined || line.marker === "") return `${pad}   `;
  return `${pad}${line.marker === "•" ? "-" : line.marker} `;
};

/**
 * The plain text: one line per paragraph (a line break inside a paragraph is a line too), list
 * items written "1. …" / "- …", nested ones indented by three spaces. Trailing empty lines dropped.
 */
export function richToPlain(doc: RichDoc): string {
  return richLines(doc)
    .map((l) => {
      const text = l.runs.map((r) => r.text).join("");
      const prefix = plainPrefix(l);
      return prefix ? text.split("\n").map((t, i) => (i ? " ".repeat(prefix.length) : prefix) + t).join("\n") : text;
    })
    .join("\n")
    .replace(/\s+$/, "");
}

const ORDERED = /^(\d{1,4})\. (.*)$/;
const BULLET = /^- (.*)$/;

const textParagraph = (text: string): RichParagraph => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });

/**
 * A plain text as a rich document: one paragraph per line; consecutive lines "1. …", "2. …" (in
 * sequence) become a numbered list, lines "- …" a bulleted one. richToPlain(plainToRich(t)) === t
 * for texts without trailing blank lines.
 */
export function plainToRich(text: string): RichDoc {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n");
  const content: RichBlock[] = [];
  for (const line of lines) {
    const last = content[content.length - 1];
    const o = ORDERED.exec(line);
    if (o) {
      const n = Number(o[1]);
      const item: RichListItem = { type: "listItem", content: [textParagraph(o[2])] };
      if (last?.type === "orderedList" && (last.attrs?.start ?? 1) + last.content.length === n) last.content.push(item);
      else content.push({ type: "orderedList", attrs: { start: n }, content: [item] });
      continue;
    }
    const u = BULLET.exec(line);
    if (u) {
      const item: RichListItem = { type: "listItem", content: [textParagraph(u[1])] };
      if (last?.type === "bulletList") last.content.push(item);
      else content.push({ type: "bulletList", content: [item] });
      continue;
    }
    content.push(textParagraph(line));
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** True when the document holds no text at all. */
export function isRichEmpty(doc: RichDoc): boolean {
  return richToPlain(doc).trim() === "";
}

/**
 * The formatting a document uses, in words ("îngroșat, mare, centru, listă numerotată"), "" when
 * none: the audit log's view of a formatting change that leaves the plain text unchanged.
 */
export function richFormatSummary(doc: RichDoc | null | undefined): string {
  if (!doc) return "";
  const used = new Set<string>();
  for (const line of richLines(doc)) {
    for (const r of line.runs) {
      if (r.bold) used.add("îngroșat");
      if (r.italic) used.add("înclinat");
      if (r.underline) used.add("subliniat");
      if (r.size) used.add(TEXT_SIZE_LABEL[r.size].toLowerCase());
    }
    if (line.align) used.add(ALIGN_LABEL[line.align]);
    if (line.marker === "•") used.add("listă cu puncte");
    else if (line.marker) used.add("listă numerotată");
  }
  const order = ["îngroșat", "înclinat", "subliniat", "mic", "mare", "foarte mare", ...ALIGNS.map((a) => ALIGN_LABEL[a]), "listă numerotată", "listă cu puncte"];
  return order.filter((o) => used.has(o)).join(", ");
}
