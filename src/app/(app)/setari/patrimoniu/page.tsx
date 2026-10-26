import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { subcategoriesOf } from "@/lib/asset-subcategories";
import { permissions } from "@/lib/permissions";
import { listSubcategoriesWithUse } from "@/server/queries/asset-subcategories";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";
import { CategoryCard } from "./subcategory-controls";

export const metadata: Metadata = { title: "Categorii de patrimoniu" };

/**
 * PATRIMONY-SUBCATEGORIES: Setări → Nomenclatoare → Categorii de patrimoniu. The categories are the
 * nomenclature's lines (edited in Setări); each has its subcategories here (admin edits).
 */
export default async function AssetCategoriesPage() {
  const ctx = await requireCtx();
  const [church, subs] = await Promise.all([getChurch(ctx), listSubcategoriesWithUse(ctx.db)]);
  const canEdit = permissions.admin(ctx.user.role);
  const cats = church.nomen.categoriiPatrimoniu;
  // Subcategories of a category no longer in the list (renamed or removed in the nomenclature).
  const orphan = [...new Set(subs.map((s) => s.categorie))].filter((c) => !cats.includes(c));
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title="Categorii de patrimoniu" sub={`${cats.length} categorii · ${subs.length} subcategorii`} />
      <p className="hint mb-4">
        Categoriile se scriu în Setări → Nomenclatoare („Categorii de bunuri”). Aici fiecare categorie are subcategoriile ei, alese opțional pe fișa
        bunului. O subcategorie folosită la bunuri nu se șterge până nu mutați bunurile în altă subcategorie.
      </p>
      {cats.map((c) => (
        <CategoryCard key={c} categorie={c} subs={subcategoriesOf(subs, c).map((s) => ({ ...s, used: subs.find((x) => x.id === s.id)!.used }))} canEdit={canEdit} />
      ))}
      {orphan.map((c) => (
        <CategoryCard key={c} categorie={c} orphan subs={subcategoriesOf(subs, c).map((s) => ({ ...s, used: subs.find((x) => x.id === s.id)!.used }))} canEdit={canEdit} />
      ))}
      {!canEdit ? <p className="hint mt-4">Doar administratorul poate modifica subcategoriile.</p> : null}
      <p className="hint mt-4">
        <Link href="/patrimoniu">Deschide patrimoniul</Link>
      </p>
    </>
  );
}
