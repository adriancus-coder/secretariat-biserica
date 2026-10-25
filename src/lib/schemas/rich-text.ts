import { z } from "zod";
import {
  ALIGNS,
  RICH_MAX_BYTES,
  RICH_MAX_DEPTH,
  TEXT_SIZES,
  type RichBlock,
  type RichDoc,
  type RichInline,
  type RichListItem,
  type RichMark,
} from "../rich-text";

/**
 * The stored rich-text document, checked on the server: only the node types doc, paragraph, text,
 * orderedList, bulletList, listItem and hardBreak, the marks bold, italic, underline and textSize,
 * and the paragraph's `align`. Any other node, mark or attribute (images, links, HTML, styles) is
 * refused, as is a document above 200 KB or nested deeper than RICH_MAX_DEPTH lists.
 */

const markSchema: z.ZodType<RichMark> = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("bold") }),
  z.strictObject({ type: z.literal("italic") }),
  z.strictObject({ type: z.literal("underline") }),
  z.strictObject({ type: z.literal("textSize"), attrs: z.strictObject({ size: z.enum(TEXT_SIZES) }) }),
]);

const inlineSchema: z.ZodType<RichInline> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("text"),
    // ProseMirror never stores an empty text node; control characters other than tab are refused.
    text: z.string().min(1).refine((t) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(t), "Caractere nepermise în text."),
    marks: z.array(markSchema).max(4).optional(),
  }),
  z.strictObject({ type: z.literal("hardBreak") }),
]);

const paragraphSchema = z.strictObject({
  type: z.literal("paragraph"),
  attrs: z.strictObject({ align: z.enum(ALIGNS).nullable().optional() }).optional(),
  content: z.array(inlineSchema).optional(),
});

function listSchemas(depth: number): z.ZodType<RichBlock> {
  if (depth > RICH_MAX_DEPTH) return paragraphSchema;
  const item: z.ZodType<RichListItem> = z.strictObject({
    type: z.literal("listItem"),
    content: z.array(z.lazy(() => listSchemas(depth + 1))).min(1),
  }) as z.ZodType<RichListItem>;
  return z.discriminatedUnion("type", [
    paragraphSchema,
    z.strictObject({
      type: z.literal("orderedList"),
      attrs: z.strictObject({ start: z.number().int().min(0).max(9999).optional(), type: z.string().max(4).nullable().optional() }).optional(),
      content: z.array(item).min(1),
    }),
    z.strictObject({ type: z.literal("bulletList"), content: z.array(item).min(1) }),
  ]) as z.ZodType<RichBlock>;
}

const docShape = z.strictObject({ type: z.literal("doc"), content: z.array(listSchemas(1)).min(1) }) as z.ZodType<RichDoc>;

export const RICH_TOO_BIG = "Textul este prea lung (cel mult 200 KB).";
export const RICH_INVALID = "Textul conține elemente nepermise (sunt permise doar îngroșat, înclinat, subliniat, mărime, aliniere și liste).";

const bytes = (text: string) => new TextEncoder().encode(text).length;

/** A rich document given as an already parsed value (export files); null when absent. */
export const richDocSchema = z.unknown().transform((v, ctx) => {
  if (v === null || v === undefined) return null;
  const r = checkRich(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.message });
    return z.NEVER;
  }
  return r.doc;
});

/** Parses a rich document sent as JSON text (a hidden form field). */
export function parseRichJson(text: string): { ok: true; doc: RichDoc } | { ok: false; message: string } {
  if (bytes(text) > RICH_MAX_BYTES) return { ok: false, message: RICH_TOO_BIG };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, message: RICH_INVALID };
  }
  return checkRich(value);
}

/** Checks a parsed value against the rich document schema. */
export function checkRich(value: unknown): { ok: true; doc: RichDoc } | { ok: false; message: string } {
  if (bytes(JSON.stringify(value ?? null)) > RICH_MAX_BYTES) return { ok: false, message: RICH_TOO_BIG };
  const parsed = docShape.safeParse(value);
  return parsed.success ? { ok: true, doc: parsed.data } : { ok: false, message: RICH_INVALID };
}

/** Zod field for a hidden input holding the JSON (empty → null). */
export const richField = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s?.trim()) return null;
    const r = parseRichJson(s);
    if (!r.ok) {
      ctx.addIssue({ code: "custom", message: r.message });
      return z.NEVER;
    }
    return r.doc;
  });
