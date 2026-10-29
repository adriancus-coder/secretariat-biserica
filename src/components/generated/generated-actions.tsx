import { DownloadLink } from "@/components/ui/download";
import { dotDateTime } from "@/lib/dates";
import { MIME } from "@/lib/download";
import { canSaveGenerated, GENERATED, generatedEditorUrl, generatedFileUrl, generatedKey, kindParams, type GeneratedKind } from "@/lib/generated-kinds";
import { pdfFileName } from "@/server/pdf/render";
import type { Ctx } from "@/server/session";
import { GeneratedEditLink, ResetGeneratedButton } from "./generated-links";
import Link from "next/link";

/**
 * GENERATED-EDIT on a source page: „Previzualizează și editează” and, when an edited version is saved,
 * „Versiune editată salvată <data> — Deschide · Descarcă PDF · Word · Reface din date”. The downloads
 * go through the source's route, which serves the saved version (downloadFile, PWA-DOWNLOADS).
 */
export async function GeneratedActions({
  ctx,
  kind,
  params,
  fileName,
  className,
  label,
}: {
  ctx: Ctx;
  kind: GeneratedKind;
  /** The source's parameters (id, an, filters). */
  params: Record<string, string | undefined>;
  /** The download's file name without extension. */
  fileName: string;
  className?: string;
  label?: string;
}) {
  const meta = GENERATED[kind];
  const q = kindParams(kind, new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (v ? [[k, v]] : []))));
  const saved = await ctx.db.generatedDocument.findFirst({ where: { sourceKey: generatedKey(kind, params) }, select: { updatedAt: true, documentId: true } });
  const pdf = pdfFileName(fileName);
  return (
    <>
      <GeneratedEditLink kind={kind} params={params} className={className}>
        {label ?? "Previzualizează și editează"}
      </GeneratedEditLink>
      {saved ? (
        <span className="generated-saved hint block w-full">
          Versiune editată salvată {dotDateTime(saved.updatedAt)} — <Link href={generatedEditorUrl(kind, q)}>Deschide</Link> ·{" "}
          <DownloadLink file={generatedFileUrl(kind, q)} filename={pdf} mime={MIME.pdf} inline personal={meta.discipline} className="link-inline">
            Descarcă PDF
          </DownloadLink>{" "}
          ·{" "}
          <DownloadLink file={generatedFileUrl(kind, q, { format: "word" })} filename={pdf.replace(/\.pdf$/, ".docx")} mime={MIME.docx} personal={meta.discipline} className="link-inline">
            Word
          </DownloadLink>
          {!saved.documentId && canSaveGenerated(kind, ctx.user) ? (
            <>
              {" "}
              · <ResetGeneratedButton kind={kind} query={q.toString()} />
            </>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
