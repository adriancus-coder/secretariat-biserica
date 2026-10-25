/** Water baptism details as one sentence. Pure. */

export interface BaptismDetails {
  /** Already formatted for display ("15 iun. 2008"), or empty. */
  data: string;
  /** The year, used when only the year is known (no date): "în anul 2010". */
  botezAn?: number | null;
  botezBiserica: string;
  botezLocalitate: string;
  botezOficiant: string;
}

/** "Biserica Betel" stays as written; "Betel" becomes "Biserica Betel". */
export function churchName(name: string): string {
  const n = name.trim();
  return /^biseric/i.test(n) ? n : `Biserica ${n}`;
}

/**
 * "Botezat la 15 iun. 2008, în Biserica Betel, Oslo, de Ioan Pop"; missing parts are left out
 * (no dangling commas); "" when nothing is known.
 */
export function baptismSentence(b: BaptismDetails, verb = "Botezat"): string {
  const church = b.botezBiserica.trim();
  const place = b.botezLocalitate.trim();
  const parts = [
    b.data ? `la ${b.data}` : b.botezAn ? `în anul ${b.botezAn}` : "",
    church ? `în ${churchName(church)}` : "",
    place ? (church ? place : `în ${place}`) : "",
    b.botezOficiant.trim() ? `de ${b.botezOficiant.trim()}` : "",
  ].filter(Boolean);
  return parts.length ? `${verb} ${parts.join(", ")}` : "";
}
