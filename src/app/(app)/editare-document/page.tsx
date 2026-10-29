import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StepUpGate } from "@/components/passkey/step-up-gate";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { dotDateTime } from "@/lib/dates";
import { fixedLabel, toStored } from "@/lib/generated-blocks";
import { canSaveGenerated, GENERATED, isGeneratedKind, kindParams } from "@/lib/generated-kinds";
import { DOCUMENT_STATE_LABEL } from "@/lib/labels";
import { DEFAULT_LAYOUT, storedLayout } from "@/lib/page-layout";
import { loadSource, savedVersion, sourceHash, upgradeHash } from "@/server/generated";
import { requireCtx } from "@/server/session";
import { hasStepUp, stepUpMethod } from "@/server/step-up";
import { GeneratedEditor } from "./generated-editor";

export const metadata: Metadata = { title: "Previzualizează și editează" };

/**
 * GENERATED-EDIT: the preview and the editor of a document the app generates (`?sursa=<kind>&…` with
 * the source's parameters). The source's permission; the disciplinary acts also the step-up.
 */
export default async function GeneratedEditPage({ searchParams }: PageProps<"/editare-document">) {
  const raw = await searchParams;
  const kind = raw.sursa;
  if (!isGeneratedKind(kind)) notFound();
  const meta = GENERATED[kind];
  const ctx = await requireCtx(meta.permission);
  const sp = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const params = kindParams(kind, sp);
  const src = await loadSource(ctx, kind, params);
  if (!src) notFound();
  const head = (
    <>
      <BackLink href={src.backHref}>Înapoi</BackLink>
      <PageHead title={meta.label} sub="Previzualizare și editare înainte de tipărire" />
    </>
  );
  if (meta.discipline && !(await hasStepUp(ctx.user))) {
    return (
      <>
        {head}
        <StepUpGate method={await stepUpMethod(ctx.user.id)} what="Datele disciplinare sunt confidențiale." />
      </>
    );
  }
  if (!src.key) {
    return (
      <>
        {head}
        <p className="alert">Inventarul cu poze se tipărește direct din date; pentru editare deschideți inventarul fără poze.</p>
      </>
    );
  }
  const saved = await savedVersion(ctx, src.key);
  const blocks = saved ? saved.blocks : toStored(src.spec.blocks);
  // The fixed blocks (signatures, charts, pictures) are shown by name; they come from the data.
  const labels: Record<string, string> = {};
  const byType = new Map<string, number>();
  for (const b of src.spec.blocks) {
    const n = byType.get(b.type) ?? 0;
    byType.set(b.type, n + 1);
    labels[`${b.type}:${n}`] = fixedLabel(b);
  }
  const registered = saved?.document ?? null;
  return (
    <>
      {head}
      {saved ? (
        <p className="hint mb-2">
          Versiune editată salvată {dotDateTime(saved.updatedAt)}
          {saved.updatedBy ? ` de ${saved.updatedBy.name}` : ""}.
        </p>
      ) : null}
      {saved && (await upgradeHash(ctx, src, saved)) !== sourceHash(src) && !registered ? (
        <div className="alert mb-3" role="status">
          Datele s-au schimbat de la editare. Reface din date?
        </div>
      ) : null}
      {registered ? (
        <div className="alert alert-ok mb-3" role="status">
          Înregistrat cu nr. {registered.nr}/{registered.anRegistru} ({DOCUMENT_STATE_LABEL[registered.stare]}). Textul se modifică de acum din documentul înregistrat.{" "}
          <Link href={`/documente/${registered.id}`}>Deschide documentul</Link>
        </div>
      ) : null}
      <GeneratedEditor
        kind={kind}
        query={params.toString()}
        initial={blocks}
        labels={labels}
        layout={saved?.layout ? storedLayout(saved.layout) : null}
        defaultLayout={src.spec.layout ?? { ...DEFAULT_LAYOUT, format: src.spec.size ?? DEFAULT_LAYOUT.format }}
        hasSaved={Boolean(saved)}
        readOnly={Boolean(registered)}
        canSave={canSaveGenerated(kind, ctx.user) && !registered}
        official={Boolean(meta.official) && !registered}
      />
    </>
  );
}
