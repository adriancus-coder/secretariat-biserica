import { normalizeSearch, personSortKey } from "./text";

/**
 * Câmpurile derivate ale unei persoane: textul de căutare și cheia de ordonare alfabetică.
 * The family is a record now and is searched on /familii; rows saved earlier still contain the old family text.
 */
export function personDerived(p: { nume: string; prenume: string; telefon: string; email: string; botezBiserica: string; botezOficiant: string }) {
  const phoneDigits = p.telefon.replace(/\D/g, "");
  return {
    // The baptism church and officiant are searchable too ("cine a fost botezat de …").
    searchText: normalizeSearch([p.nume, p.prenume, p.telefon, phoneDigits, p.email, p.botezBiserica, p.botezOficiant].join(" ")),
    sortKey: personSortKey(p.nume, p.prenume),
  };
}

/** Textul de căutare al unei mențiuni (text, tip, familie — fără diacritice). */
export function noteSearchText(n: { text: string; tip: string; familie: string }): string {
  return normalizeSearch([n.text, n.tip, n.familie].join(" "));
}
