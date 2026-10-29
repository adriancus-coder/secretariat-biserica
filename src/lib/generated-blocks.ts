import { z } from "zod";
import type { Block } from "@/domain/print";
import type { RichBlock, RichDoc, RichInline, RichListItem } from "./rich-text";
import { checkRich } from "./schemas/rich-text";

/*
 * GENERATED-EDIT: the blocks of a generated document (PrintSpec, src/domain/print.ts) as they are
 * edited and saved. Text blocks travel and are stored as they are (a paragraph becomes `rich` only when
 * the editor changed it); blocks built from data that cannot be edited here — signatures, charts,
 * pictures (QR codes), tables with photos — are stored as references (`fixed`: the n-th block of that
 * type) and taken from the freshly generated document when it is rendered, so no picture or drawn
 * signature is ever stored or accepted from a form. An unedited model gives back exactly the generated
 * blocks, so its PDF is the same. Pure.
 */

export type FixedBlock = { type: "fixed"; of: Block["type"]; nth: number };
export type StoredBlock = Exclude<Block, { type: "signatures" | "signed" | "signatureTable" | "chart" | "image" }> | FixedBlock;

const FIXED_TYPES: readonly Block["type"][] = ["signatures", "signed", "signatureTable", "chart", "image"];

/** A block the editor does not change: taken from the data each time. */
export function isFixed(block: Block): boolean {
  return FIXED_TYPES.includes(block.type) || (block.type === "table" && Boolean(block.images?.length));
}

/** The generated blocks as the editor's (and the database's) model. */
export function toStored(blocks: readonly Block[]): StoredBlock[] {
  const seen = new Map<Block["type"], number>();
  return blocks.map((block) => {
    const nth = seen.get(block.type) ?? 0;
    seen.set(block.type, nth + 1);
    if (isFixed(block)) return { type: "fixed", of: block.type, nth };
    if (block.type === "table") {
      const rest: Extract<StoredBlock, { type: "table" }> = { type: "table", columns: block.columns, rows: block.rows };
      if (block.bold) rest.bold = block.bold;
      return rest;
    }
    return block as StoredBlock;
  });
}

/** The blocks to render: the stored ones, the references taken from the fresh document (a missing one is left out). */
export function resolveStored(stored: readonly StoredBlock[], fresh: readonly Block[]): Block[] {
  const byType = new Map<Block["type"], Block[]>();
  for (const b of fresh) byType.set(b.type, [...(byType.get(b.type) ?? []), b]);
  const out: Block[] = [];
  for (const s of stored) {
    if (s.type !== "fixed") out.push(s);
    else {
      const hit = byType.get(s.of)?.[s.nth];
      if (hit) out.push(hit);
    }
  }
  return out;
}

/** What a fixed block shows in the editor (it cannot be edited there). */
export function fixedLabel(block: Block | undefined): string {
  if (!block) return "Element care nu mai există în date";
  switch (block.type) {
    case "signatures":
    case "signed":
      return `Semnături: ${[block.left, block.right].map((s) => `${s.label}${s.name ? ` ${s.name}` : ""}`).join(" · ")}`;
    case "signatureTable":
      return `Tabel de semnături (${block.rows.length} ${block.rows.length === 1 ? "persoană" : "persoane"})`;
    case "chart":
      return `Grafic: ${block.title}`;
    case "image":
      return `Imagine: ${block.alt}`;
    case "table":
      return `Tabel cu poze (${block.rows.length} rânduri)`;
    default:
      return "Element generat din date";
  }
}

// ---------- rich text for the editor ----------

const inline = (text: string, bold?: boolean): RichInline[] =>
  text.split("\n").flatMap((part, i) => [
    ...(i ? [{ type: "hardBreak" } as const] : []),
    ...(part ? [{ type: "text" as const, text: part, ...(bold ? { marks: [{ type: "bold" as const }] } : {}) }] : []),
  ]);

/** A text block as a rich document (the editor's starting point). */
export function blockToRich(block: StoredBlock): RichDoc | null {
  switch (block.type) {
    case "rich":
      return block.doc;
    case "para": {
      if (block.pre) {
        const content: RichBlock[] = block.runs
          .map((r) => r.text)
          .join("")
          .split("\n")
          .map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }));
        return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
      }
      const content = block.runs.flatMap((r) => inline(r.text, r.bold));
      return { type: "doc", content: [content.length ? { type: "paragraph", content } : { type: "paragraph" }] };
    }
    case "list": {
      const items: RichListItem[] = block.items.map((t) => ({ type: "listItem", content: [t ? { type: "paragraph", content: inline(t) } : { type: "paragraph" }] }));
      const list: RichBlock = block.ordered ? { type: "orderedList", attrs: { start: block.start ?? 1 }, content: items } : { type: "bulletList", content: items };
      return { type: "doc", content: items.length ? [list] : [{ type: "paragraph" }] };
    }
    default:
      return null;
  }
}

// ---------- validation of the editor's model (the server never trusts the form) ----------

const TEXT_MAX = 20_000;
const CELL_MAX = 2_000;
export const GENERATED_MAX_BYTES = 3 * 1024 * 1024;
export const GENERATED_MAX_BLOCKS = 600;

const str = (max: number) => z.string().max(max);
const run = z.strictObject({ text: str(TEXT_MAX), bold: z.boolean().optional() });
const richDoc = z.unknown().transform((v, ctx) => {
  const r = checkRich(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.message });
    return z.NEVER;
  }
  return r.doc;
});

const storedBlockSchema: z.ZodType<StoredBlock> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("nr"), text: str(500) }),
  z.strictObject({ type: z.literal("title"), text: str(500), asWritten: z.boolean().optional() }),
  z.strictObject({ type: z.literal("para"), runs: z.array(run).max(200), pre: z.boolean().optional() }),
  z.strictObject({ type: z.literal("list"), items: z.array(str(TEXT_MAX)).max(2000), ordered: z.boolean().optional(), start: z.number().int().min(0).max(100000).optional() }),
  z.strictObject({ type: z.literal("centered"), text: str(1000), size: z.number().min(6).max(48).optional(), bold: z.boolean().optional() }),
  z.strictObject({ type: z.literal("rich"), doc: richDoc, marker: str(20).optional() }),
  z
    .strictObject({
      type: z.literal("table"),
      columns: z.array(str(200)).min(1).max(30),
      rows: z.array(z.array(str(CELL_MAX)).max(30)).max(5000),
      bold: z.array(z.boolean()).max(5000).optional(),
    })
    .refine((t) => t.rows.every((r) => r.length === t.columns.length), "Fiecare rând al tabelului trebuie să aibă toate coloanele."),
  z.strictObject({
    type: z.literal("fixed"),
    of: z.enum(["signatures", "signed", "signatureTable", "chart", "image", "table"]),
    nth: z.number().int().min(0).max(10000),
  }),
]) as z.ZodType<StoredBlock>;

export const storedBlocksSchema = z.array(storedBlockSchema).max(GENERATED_MAX_BLOCKS);

/** The editor's JSON (a hidden field), checked; the message is shown to the user. */
export function parseStoredBlocks(text: string): { ok: true; blocks: StoredBlock[] } | { ok: false; message: string } {
  if (new TextEncoder().encode(text).length > GENERATED_MAX_BYTES) return { ok: false, message: "Documentul este prea mare (cel mult 3 MB)." };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, message: "Conținutul documentului nu a putut fi citit." };
  }
  const r = storedBlocksSchema.safeParse(value);
  return r.success ? { ok: true, blocks: r.data } : { ok: false, message: r.error.issues[0]?.message ?? "Conținutul documentului nu este valid." };
}

/** A stored model (JSON column) read leniently: invalid → null (the version is then ignored). */
export function storedBlocksOf(value: unknown): StoredBlock[] | null {
  const r = storedBlocksSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** A stable text of the generated blocks (pictures by their bytes), for the data's fingerprint. */
export function blocksFingerprintText(blocks: readonly Block[]): string {
  return JSON.stringify(blocks, (_k, v: unknown) => (v instanceof Uint8Array ? `bytes:${v.length}:${Array.from(v.subarray(0, 64)).join(",")}:${v.reduce((a, x) => (a * 31 + x) >>> 0, 7)}` : v));
}

/**
 * The text of an edited act as one rich document (registered as a numbered document): headings centred
 * and bold, paragraphs and lists as they are, a table's rows as lines; signatures and pictures are left
 * out (the registered document has its own pastor / secretary signatures).
 */
export function storedToRich(blocks: readonly StoredBlock[]): RichDoc {
  const content: RichBlock[] = [];
  const line = (text: string, opts: { bold?: boolean; align?: "center" | "right" } = {}): RichBlock => ({
    type: "paragraph",
    ...(opts.align ? { attrs: { align: opts.align } } : {}),
    ...(text ? { content: inline(text, opts.bold) } : {}),
  });
  for (const b of blocks) {
    if (b.type === "fixed") continue;
    if (b.type === "title") content.push(line(b.asWritten ? b.text : b.text.toUpperCase(), { bold: true, align: "center" }));
    else if (b.type === "nr") content.push(line(b.text, { align: "right" }));
    else if (b.type === "centered") content.push(line(b.text, { bold: b.bold, align: "center" }));
    else if (b.type === "table") {
      content.push(line(b.columns.join(" — "), { bold: true }));
      b.rows.forEach((r, i) => content.push(line(r.join(" — "), { bold: b.bold?.[i] })));
    } else content.push(...(blockToRich(b)?.content ?? []));
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
