import "server-only";
import { documentPrint, type PrintSpec } from "@/domain/print";
import type { DocumentTypeKey } from "@/lib/labels";
import type { RichDoc } from "@/lib/rich-text";
import type { ChurchInfo } from "@/domain/types";

/** A registered document as a print spec, shared by its PDF (/pdf/document/[id]) and Word (/word) routes. */
export function documentSpec(
  doc: { tip: DocumentTypeKey; nr: number; data: string; text: string; textRich: RichDoc | null; titlu: string },
  church: ChurchInfo,
): PrintSpec {
  return documentPrint({ tip: doc.tip, nr: doc.nr, data: doc.data, text: doc.text, textRich: doc.textRich, titlu: doc.titlu }, church);
}

/** `<titlu or type>-nr-<nr>-<year>` (without extension). */
export function documentFileBase(doc: { titlu: string; tip: string; nr: number; anRegistru: number }): string {
  return `${doc.titlu || doc.tip}-nr-${doc.nr}-${doc.anRegistru}`;
}
