/** Formatări de afișare, identice cu cele din prototip. */

export const MONTHS = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sept", "oct", "nov", "dec"];
export const MONTHS_L = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

/** „5 mar 2020”; „—” pentru dată lipsă. */
export function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${+dd} ${MONTHS[+m - 1]} ${y}`;
}

/** „5 martie 2020”; linie de completat pentru dată lipsă (în documente). */
export function fmtL(d: string | null | undefined): string {
  if (!d) return "____________";
  const [y, m, dd] = d.split("-");
  return `${+dd} ${MONTHS_L[+m - 1]} ${y}`;
}

/** „5 mar” (fără an). */
export function fmtShort(d: string): string {
  const [, m, dd] = d.split("-");
  return `${+dd} ${MONTHS[+m - 1]}`;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function memberName(p: { nume?: string | null; prenume?: string | null }): string {
  return `${p.nume || ""} ${p.prenume || ""}`.trim();
}

/** Inițiala folosită pentru avatar și pentru antetele alfabetice din listă. */
export function initial(s: string | null | undefined): string {
  return (s || "?")[0].toUpperCase();
}

/** Ziua și luna pentru eticheta de dată din liste (ex. { day: "5", mon: "mar 2020" }). */
export function dateBadge(d: string | null | undefined): { day: string; mon: string } {
  const [y, m, dd] = (d || "---").split("-");
  return { day: String(+dd || "?"), mon: `${MONTHS[+m - 1] || ""} ${y || ""}`.trim() };
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}
