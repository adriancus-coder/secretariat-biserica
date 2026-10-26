import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getAsset } from "@/server/queries/assets";
import { getChurch } from "@/server/queries/church";
import { personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { AssetForm } from "../../asset-form";

export const metadata: Metadata = { title: "Editează bunul" };

export default async function EditAssetPage({ params }: PageProps<"/patrimoniu/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const a = await getAsset(ctx, id);
  if (!a) notFound();
  if (a.stare === "SCOS_DIN_UZ") redirect(`/patrimoniu/${id}`);
  const [church, people] = await Promise.all([getChurch(ctx), personOptions(ctx)]);
  return (
    <>
      <BackLink href={`/patrimoniu/${id}`}>Bunul</BackLink>
      <PageHead title={`Editează nr. inv. ${a.nrInventar}`} />
      <section className="card">
        <AssetForm
          id={id}
          initial={{
            nrInventar: String(a.nrInventar),
            denumire: a.denumire,
            categorie: a.categorie,
            cantitate: String(a.cantitate),
            valoare: a.valoare === null ? "" : String(a.valoare),
            dataIntrarii: a.dataIntrarii ?? "",
            provenienta: a.provenienta,
            loc: a.loc,
            stare: a.stare,
            observatii: a.observatii,
            responsabil: a.responsabilId ? "" : a.responsabil,
            responsabilId: a.responsabilId ?? "",
          }}
          nextNr={String(a.nrInventar)}
          categories={church.nomen.categoriiPatrimoniu}
          people={people.filter((p) => !p.exited || p.id === a.responsabilId).map((p) => ({ id: p.id, name: p.name }))}
          cancelHref={`/patrimoniu/${id}`}
        />
      </section>
    </>
  );
}
