/** The "an" parameter of Statistici: a plausible year, else undefined (the current year). */
export function requestedYear(raw: string | string[] | null | undefined): number | undefined {
  const n = Number(typeof raw === "string" ? raw : NaN);
  return Number.isInteger(n) && n > 1800 && n < 3000 ? n : undefined;
}
