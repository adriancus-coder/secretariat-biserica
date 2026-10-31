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

/** An adjective after „Biserica” in the genitive: „Penticostală” → „Penticostale”, „Românească” → „Românești”. */
function genitiveAdjective(word: string): string | null {
  if (/ească$/.test(word)) return word.replace(/ească$/, "ești");
  if (/ă$/.test(word)) return word.replace(/ă$/, "e");
  return null;
}

/**
 * The church's name after a noun („din evidența …”, „comitetul …”, „secretariatul …”): „Maranata Stavanger”
 * → „Bisericii Maranata Stavanger”; „Biserica Penticostală Maranata Stavanger” → „Bisericii Penticostale
 * Maranata Stavanger” (never „Bisericii Biserica …”); "" → „bisericii”.
 */
export function churchOf(name: string | null | undefined): string {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "bisericii";
  if (!/^biseric/i.test(n)) return `Bisericii ${n}`;
  const words = n.split(" ").slice(1);
  let i = 0;
  for (; i < words.length; i++) {
    const g = genitiveAdjective(words[i]);
    if (g === null) break;
    words[i] = g;
  }
  return ["Bisericii", ...words].join(" ");
}
