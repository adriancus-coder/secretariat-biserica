import { categoryDef } from "@/domain/categories";

/**
 * The category part of a Persoane URL: `?categorie=<key>` (several = any of them) `&an=YYYY`
 * `&functie=<role id>` (for "cu-functie"). Pure.
 */
export interface CategorySelection {
  keys: string[];
  /** The year as the statistics had it (undefined = the situation today). */
  year?: number;
  /** A role id for "cu-functie" ("" = any role). */
  functie: string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseCategorySelection(get: (k: string) => string | string[] | undefined | null, currentYear: number): CategorySelection {
  const raw = get("categorie");
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  const keys = [...new Set(list.map((k) => k.trim()).filter((k) => categoryDef(k)))].slice(0, 20);
  const anRaw = get("an");
  const an = Number(Array.isArray(anRaw) ? anRaw[0] : anRaw);
  const year = Number.isInteger(an) && an > 1800 && an <= currentYear + 1 ? an : undefined;
  const fRaw = get("functie");
  const f = Array.isArray(fRaw) ? fRaw[0] : fRaw;
  return { keys, year, functie: f && ID.test(f) ? f : "" };
}

/** "Aparținători", or "Copii minori + Copii ai aparținătorilor". */
export function selectionLabel(sel: CategorySelection, joiner = " + "): string {
  return sel.keys.map((k) => categoryDef(k)?.label ?? k).join(joiner);
}

/** The URL of a category list (`an` only when the statistics had an explicit year). */
export function categoryHref(keys: string | string[], year?: number, extra: Record<string, string> = {}): string {
  const sp = new URLSearchParams();
  for (const k of Array.isArray(keys) ? keys : [keys]) sp.append("categorie", k);
  if (year) sp.set("an", String(year));
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  return `/persoane?${sp.toString()}`;
}
