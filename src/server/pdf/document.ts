import "server-only";
import { documentPrint, type PrintSpec } from "@/domain/print";
import type { DocumentTypeKey } from "@/lib/labels";
import { resolveLayout, type PageLayout } from "@/lib/page-layout";
import type { RichDoc } from "@/lib/rich-text";
import type { ChurchSettings } from "../queries/church";

/**
 * A registered document as a print spec, shared by its PDF (/pdf/document/[id]) and Word (/word)
 * routes, in its page layout (its own, else the church's default); `layout` previews unsaved changes.
 */
export function documentSpec(
  doc: { tip: DocumentTypeKey; nr: number; data: string; text: string; textRich: RichDoc | null; titlu: string; layout: unknown },
  church: ChurchSettings,
  layout?: PageLayout,
): PrintSpec {
  const spec = documentPrint({ tip: doc.tip, nr: doc.nr, data: doc.data, text: doc.text, textRich: doc.textRich, titlu: doc.titlu }, church);
  return { ...spec, layout: layout ?? resolveLayout(church.docLayout, doc.layout) };
}

/** `<titlu or type>-nr-<nr>-<year>` (without extension). */
export function documentFileBase(doc: { titlu: string; tip: string; nr: number; anRegistru: number }): string {
  return `${doc.titlu || doc.tip}-nr-${doc.nr}-${doc.anRegistru}`;
}
