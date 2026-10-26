/*
 * PATRIMONY-SUBCATEGORIES: one level of subcategories under each category of goods. The categories are
 * the nomenclature Church.categoriiPatrimoniu (text lines), so a subcategory is keyed by its category's
 * name. Pure.
 */

export const SUBCATEGORY_NAME_MAX = 80;

/**
 * The defaults, created by the `asset_subcategories` migration and at signup, only under categories that
 * keep their default name (keep the two in sync). "Altele" has none.
 */
export const DEFAULT_ASSET_SUBCATEGORIES: Readonly<Record<string, readonly string[]>> = {
  "Clădiri și terenuri": ["Clădire", "Teren", "Anexe"],
  Mobilier: ["Scaune și bănci", "Mese", "Dulapuri și rafturi", "Amvon"],
  "Instrumente muzicale": ["Clape și pian", "Chitare", "Tobe și percuție", "Suflători", "Corzi"],
  "Sonorizare și video": ["Mixere", "Microfoane", "Boxe și monitoare", "Amplificatoare", "Camere video", "Proiectoare și ecrane", "Cabluri și accesorii"],
  "Echipamente IT": ["Calculatoare", "Imprimante", "Rețea", "Tablete și telefoane"],
  Bucătărie: ["Electrocasnice", "Veselă și tacâmuri", "Mobilier de bucătărie"],
};

/** Rows for a church's default subcategories, under the given categories that keep their default name. */
export function defaultSubcategoriesData(churchId: string, categories: readonly string[]) {
  return categories.flatMap((categorie) => (DEFAULT_ASSET_SUBCATEGORIES[categorie] ?? []).map((nume, ordine) => ({ churchId, categorie, nume, ordine })));
}

export interface Subcategory {
  id: string;
  categorie: string;
  nume: string;
  ordine: number;
}

/** The server's check: a subcategory is optional, and when given it belongs to the chosen category. */
export function subcategoryError(sub: Pick<Subcategory, "categorie"> | null | undefined, categorie: string, given: boolean): string | null {
  if (!given) return null;
  if (!sub) return "Subcategoria nu mai există.";
  return sub.categorie === categorie ? null : "Subcategoria nu aparține categoriei alese.";
}

/** A category's subcategories in their order. */
export function subcategoriesOf(all: readonly Subcategory[], categorie: string): Subcategory[] {
  return all.filter((s) => s.categorie === categorie).sort((a, b) => a.ordine - b.ordine || a.nume.localeCompare(b.nume, "ro"));
}

/** „Folosită la 1 bun” / „Folosită la N bunuri”; null when unused. */
export function usedText(n: number): string | null {
  return n === 0 ? null : `Folosită la ${n} ${n === 1 ? "bun" : "bunuri"}`;
}
