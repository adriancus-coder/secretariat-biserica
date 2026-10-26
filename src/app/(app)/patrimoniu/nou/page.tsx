import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { todayIso } from "@/lib/dates";
import { nextInventoryNumber } from "@/server/queries/assets";
import { getChurch } from "@/server/queries/church";
import { personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { AssetForm } from "../asset-form";

export const metadata: Metadata = { title: "Bun nou" };

export default async function NewAssetPage() {
  const ctx = await requireCtx("write");
  const [church, people, nextNr] = await Promise.all([getChurch(ctx), personOptions(ctx), nextInventoryNumber(ctx.db)]);
  const cats = church.nomen.categoriiPatrimoniu;
  return (
    <>
      <BackLink href="/patrimoniu">Patrimoniu</BackLink>
      <PageHead title="Bun nou" />
      <section className="card">
        <AssetForm
          id={null}
          initial={{ nrInventar: "", denumire: "", categorie: cats[0] ?? "", cantitate: "1", valoare: "", dataIntrarii: todayIso(), provenienta: "CUMPARARE", loc: "", stare: "BUN", observatii: "", responsabil: "", responsabilId: "" }}
          nextNr={String(nextNr)}
          categories={cats}
          people={people.filter((p) => !p.exited).map((p) => ({ id: p.id, name: p.name }))}
          cancelHref="/patrimoniu"
        />
      </section>
    </>
  );
}
