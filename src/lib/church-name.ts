/*
 * MINUTES-SIGNATURES: the church's name in a letterhead, a title or a sentence. The name in Setări may
 * already start with „Biserica” („Biserica Penticostală Maranata Stavanger”): then it is written as it
 * is, never „Biserica Biserica …”. Every generator (PDF, Word, Excel, e-mail, documents) goes through
 * churchTitle(); church-name.test.ts scans src/ for a hand-written prefix. Pure.
 */

/** „Maranata Stavanger” → „Biserica Maranata Stavanger”; „Biserica Penticostală X” stays; "" → „Biserica”. */
export function churchTitle(name: string | null | undefined): string {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "Biserica";
  return /^biseric/i.test(n) ? n : `Biserica ${n}`;
}
