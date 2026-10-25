/**
 * Statute excerpts shown to prospective members on the application form (and, collapsed, on the
 * data-update page for members and aparținători): how one becomes a member, rights, duties and who
 * aparținători are. The church can edit them (Setări); the defaults are docs/statut-extrase.md
 * verbatim (a unit test keeps both equal). Pure.
 */
import { z } from "zod";

export interface StatuteExcerpt {
  titlu: string;
  /** "art. 25" or "art. 20 alin. 1 și art. 22 alin. 3", shown as "Statut <articol>". */
  articol: string;
  /** The page in the Cult's statute PDF, opened with #page=N; null = the first page. */
  pagina: number | null;
  /** Plain text, numbered / lettered lines preserved. */
  text: string;
}

export const DEFAULT_EXCERPTS: readonly StatuteExcerpt[] = [
  {
    titlu: "Cum devine cineva membru",
    articol: "art. 20 alin. 1 și art. 22 alin. 3",
    pagina: 11,
    text: [
      "Art. 20 (1) O persoană poate deveni membru al unei biserici locale la cerere prin:",
      "a) botezul în apă;",
      "b) transfer dintr-o altă biserică locală;",
      "c) reabilitare spirituală.",
      "(2) Botezul în apă îi este administrat credinciosului care îndeplinește următoarele condiții:",
      "a) s-a întors la Dumnezeu cu pocăință și credință, făcând dovada nașterii din nou;",
      "b) acceptă Sfânta Scriptură ca autoritate normativă a lui Dumnezeu pentru viața creștină;",
      "c) se angajează să respecte Mărturisirea de Credință și prevederile Statutului Cultului Creștin Penticostal.",
      "Art. 22 (3) Un credincios devine membru al bisericii locale începând cu data botezului în apă, a avizării cererii de transfer sau a încheierii procesului verbal de reabilitare.",
    ].join("\n"),
  },
  {
    titlu: "Drepturile membrilor",
    articol: "art. 25",
    pagina: 12,
    text: [
      "Drepturile membrilor bisericii locale sunt:",
      "a) să participe la viața spirituală a bisericii locale;",
      "b) să beneficieze de un cadru prielnic formării duhovnicești și de asistență spirituală;",
      "c) să li se ofere posibilitatea de a contribui la diferite slujiri spirituale sau administrative, potrivit cu chemarea lui Dumnezeu, cu înzestrările lor spirituale, în funcție de disponibilitatea personală și nevoile bisericii locale;",
      "d) să li se oficieze actele de cult în conformitate cu Mărturisirea de credință și cu prevederile prezentului Statut;",
      "e) să participe la adunările generale ale bisericii, cu drept de vot;",
      "f) să se poată transfera într-o altă biserică, la cerere;",
      "g) să renunțe la calitatea de membru, la cerere.",
    ].join("\n"),
  },
  {
    titlu: "Îndatoririle membrilor",
    articol: "art. 26",
    pagina: 13,
    text: [
      "Îndatoririle membrilor bisericii locale sunt:",
      "a) să trăiască în spiritul învățăturilor Sfintelor Scripturi și să respecte Mărturisirea de credință și Statutul Cultului Creștin Penticostal;",
      "b) să frecventeze cu regularitate serviciile divine și să își aducă contribuția la împlinirea menirii bisericii;",
      "c) să îi respecte pe slujitorii bisericii și pe ceilalți membri, să respecte rânduiala bisericii locale și să se supună hotărârilor conducerii acesteia;",
      "d) să contribuie cu regularitate la susținerea financiară a bisericii prin diferite forme de dărnicie creștină: zeciuială, colecte, donații etc.",
    ].join("\n"),
  },
  {
    titlu: "Aparținătorii bisericii",
    articol: "art. 28",
    pagina: 16,
    text: [
      "(1) Sunt considerați aparținători ai bisericii locale persoanele din următoarele categorii:",
      "a) minorii nebotezați din familiile în care cel puțin un părinte este credincios penticostal și frecventează serviciile divine ale bisericii;",
      "b) persoanele care frecventează în mod constant serviciile religioase și încă nu au fost botezate, dar care și-au exprimat decizia de a-L urma pe Hristos și dovedesc semnele nașterii din nou.",
      "(2) Aparținătorii beneficiază de următoarele drepturi:",
      "a) să participe la slujbele bisericii și să se implice, după caz, în anumite slujiri, cu acordul conducerii bisericii;",
      "b) să beneficieze de îndrumare spirituală din partea bisericii.",
      "(3) Aparținătorii au obligația de a se încadra în disciplina și în rânduiala bisericii locale.",
    ].join("\n"),
  }
];

/** "Drepturile membrilor" opens the statute at its page (12 by default) under the card. */
export const DEFAULT_STATUTE_PAGE = 12;

export const MAX_EXCERPTS = 12;

export const excerptSchema = z.strictObject({
  titlu: z.string().trim().min(1, "Completați titlul secțiunii.").max(120, "Titlul are cel mult 120 de caractere."),
  articol: z.string().trim().min(1, "Completați articolul (de exemplu „art. 25”).").max(120, "Articolul are cel mult 120 de caractere."),
  pagina: z.number().int().min(1).max(999).nullable(),
  text: z
    .string()
    .transform((s) => s.replace(/\r\n/g, "\n").trim())
    .pipe(z.string().min(1, "Completați textul secțiunii.").max(6000, "Textul unei secțiuni are cel mult 6000 de caractere.")),
});

/** The settings form's hidden field `extrase`: a JSON list of sections. */
export const excerptsField = z
  .string()
  .transform((s, ctx): StatuteExcerpt[] => {
    let list: unknown;
    try {
      list = JSON.parse(s);
    } catch {
      list = null;
    }
    const r = z.array(excerptSchema).min(1, "Păstrați cel puțin o secțiune.").max(MAX_EXCERPTS, `Cel mult ${MAX_EXCERPTS} secțiuni.`).safeParse(list);
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: r.error.issues[0]?.message ?? "Secțiunile nu sunt valide." });
      return z.NEVER;
    }
    return r.data;
  });

/** The stored `Church.statutExtrase` (empty or invalid = the defaults). */
export function storedExcerpts(raw: unknown): StatuteExcerpt[] {
  const r = z.array(excerptSchema).min(1).max(MAX_EXCERPTS).safeParse(raw);
  return r.success ? r.data : DEFAULT_EXCERPTS.map((x) => ({ ...x }));
}

/** Are these the defaults (then nothing is stored, so later corrections of the defaults reach the church)? */
export function isDefaultExcerpts(list: readonly StatuteExcerpt[]): boolean {
  return excerptsToMarkdown(list) === excerptsToMarkdown(DEFAULT_EXCERPTS);
}

/** The sections in the format of docs/statut-extrase.md ("## Titlu — Statut art. N (pagina P)" + text). */
export function excerptsToMarkdown(list: readonly StatuteExcerpt[]): string {
  return list.map((x) => `## ${x.titlu} — Statut ${x.articol}${x.pagina ? ` (pagina ${x.pagina})` : ""}\n${x.text}`).join("\n\n") + "\n";
}

/** The page "Textul complet: Deschide statutul (pagina N)" opens: the rights section's, else 12. */
export function rightsPage(list: readonly StatuteExcerpt[]): number {
  return list.find((x) => /drepturile membrilor/i.test(x.titlu))?.pagina ?? DEFAULT_STATUTE_PAGE;
}

/** The audit log's view: the sections as text. */
export function excerptsText(list: readonly StatuteExcerpt[]): string {
  return excerptsToMarkdown(list).trim();
}
