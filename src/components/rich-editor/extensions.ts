import { Mark, mergeAttributes } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import { UndoRedo } from "@tiptap/extensions";
import { ALIGNS, TEXT_SIZES, type Align, type TextSize } from "@/lib/rich-text";

/**
 * The editor's whole vocabulary — the same nodes and marks the server accepts
 * (src/lib/schemas/rich-text.ts). Anything pasted outside it (links, images, colours, fonts) is
 * dropped by the editor's schema.
 */

/** Paragraph with an optional alignment, stored as `align` (rendered as a class, no inline style). */
const AlignedParagraph = Paragraph.extend({
  addAttributes() {
    return {
      align: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const a = el.getAttribute("data-align") ?? el.style.textAlign;
          return (ALIGNS as readonly string[]).includes(a) ? (a as Align) : null;
        },
        renderHTML: (attrs: { align?: Align | null }) => (attrs.align ? { "data-align": attrs.align } : {}),
      },
    };
  },
});

/** Text size relative to the page's base size: mic, normal, mare, foarte mare. */
export const TextSizeMark = Mark.create({
  name: "textSize",
  addAttributes() {
    return {
      size: {
        default: "normal",
        parseHTML: (el: HTMLElement) => {
          const s = el.getAttribute("data-size") ?? "";
          return (TEXT_SIZES as readonly string[]).includes(s) ? (s as TextSize) : "normal";
        },
        renderHTML: (attrs: { size: TextSize }) => ({ "data-size": attrs.size }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-size]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

export const richExtensions = [
  Document,
  AlignedParagraph,
  Text,
  Bold,
  Italic,
  Underline,
  TextSizeMark,
  OrderedList,
  BulletList,
  ListItem,
  ListKeymap,
  HardBreak,
  UndoRedo,
];
