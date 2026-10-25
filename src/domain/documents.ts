import { fmtL, memberName } from "@/lib/format";
import { churchName } from "@/lib/baptism";
import { DOCUMENT_TYPE_LABEL, PARENT_RELATIONS, type DocumentTypeKey, type GenderKey } from "@/lib/labels";
import type { ChurchInfo } from "./types";

/** Datele unei persoane necesare șabloanelor de documente. */
export interface DocPerson {
  id: string;
  nume: string;
  prenume: string;
  gen: GenderKey | null;
  familyId: string | null;
  rudenie: string;
  dataNasterii: string | null;
  dataMembru: string | null;
  dataBotez: string | null;
  botezAn: number | null;
  /** The baptism locality. */
  locBotez: string;
  botezBiserica: string;
  botezOficiant: string;
  dataBinecuvantare: string | null;
  /** Parents' names when they are not persons in the register (Statut art. 14; not in the prototype). */
  numeTata?: string;
  numeMama?: string;
}

export interface DocumentTemplateInput {
  tip: DocumentTypeKey;
  person: DocPerson | null;
  /** Membrii familiei persoanei (pentru „din părinții …” în certificatul de binecuvântare). */
  family: DocPerson[];
  /** The head of the person's family, named first among the parents. */
  familyHeadId?: string | null;
  church: Pick<ChurchInfo, "nume" | "adresa">;
  catre: string;
  scop: string;
  /** Textul dării de seamă (pentru tipul „raport”), calculat separat. */
  reportText?: string;
  /**
   * Recommendation (Statut art. 27, not in the prototype): an applied measure is stated (alin. 9);
   * `exceptieDomiciliu` records a letter issued during an investigation for a move (alin. 6).
   * Administrators only reach these; without them the letter says "nu are măsuri disciplinare".
   */
  discipline?: { forma: string; dataInceput: string } | null;
  exceptieDomiciliu?: boolean;
}

const BLANK_NAME = "____________________";
const BLANK = "____________";

/**
 * Generează textul documentului — portarea șabloanelor din `genDocText` (prototip), cu aceleași
 * formulări și acorduri de gen (născut/născută, membru/membră, fratele/sora, dânsul/dânsa ...).
 */
export function generateDocumentText({
  tip,
  person: m,
  family,
  familyHeadId,
  church: c,
  catre,
  scop,
  reportText,
  discipline,
  exceptieDomiciliu,
}: DocumentTemplateInput): string {
  const f = m?.gen === "F";
  const nume = m ? memberName(m) : BLANK_NAME;
  const nascut = m?.dataNasterii ? `, născut${f ? "ă" : ""} la data de ${fmtL(m.dataNasterii)}` : "";
  const bis = `Biserica ${c.nume || BLANK}`;
  // The parents are the family's head and spouse (the prototype also took rudenie "Părinte", by family name).
  const fromFamily =
    m && m.familyId
      ? family
          .filter((p) => p.id !== m.id && p.familyId === m.familyId && (p.id === familyHeadId || PARENT_RELATIONS.includes(p.rudenie)))
          .sort((a, b) => Number(b.id === familyHeadId) - Number(a.id === familyHeadId))
          .map(memberName)
          .join(" și ")
      : "";
  // Without parents in the register, the parents' names written on the person (not in the prototype).
  const parinti = fromFamily || [m?.numeTata?.trim(), m?.numeMama?.trim()].filter(Boolean).join(" și ");

  // Baptism church and officiant (not in the prototype): mentioned only when known.
  const botezBis = m?.botezBiserica.trim() ? churchName(m.botezBiserica) : "";
  const botezLoc = m?.locBotez.trim() ?? "";
  const botezOf = m?.botezOficiant.trim() ?? "";
  // A baptism known only by its year (not in the prototype) reads "în anul 2010".
  const botezAn = m && !m.dataBotez ? m.botezAn : null;
  const botezWhen = (datePrefix: string) => (m?.dataBotez ? ` ${datePrefix}${fmtL(m.dataBotez)}` : botezAn ? ` în anul ${botezAn}` : "");
  const botezatInApa = (prefix: string, datePrefix = "la data de ") =>
    m?.dataBotez || botezAn || botezBis
      ? `${prefix}botezat${f ? "ă" : ""} în apă${botezWhen(datePrefix)}${botezBis ? `, în ${botezBis}` : ""}`
      : "";

  switch (tip) {
    case "adeverinta":
      return `${bis}, cu sediul în ${c.adresa || BLANK}, adeverește prin prezenta că ${nume}${nascut}, este membr${f ? "ă" : "u"} al bisericii noastre${m?.dataMembru ? ` din data de ${fmtL(m.dataMembru)}` : ""}${botezatInApa(", fiind ")}.\n\nPrezenta adeverință se eliberează la cererea ${f ? "dânsei" : "dânsului"}, pentru ${scop || "a-i servi la cele legale"}.`;
    case "botez":
      return `Se certifică prin prezenta că ${nume}${nascut}, a fost botezat${f ? "ă" : ""} în apă, prin cufundare, în Numele Tatălui, al Fiului și al Sfântului Duh, ${botezAn ? `în anul ${botezAn}` : `la data de ${m?.dataBotez ? fmtL(m.dataBotez) : BLANK}`}${
        botezBis ? `, în ${botezBis}${botezLoc ? ` din ${botezLoc}` : ""}` : `${botezLoc ? `, la ${botezLoc}` : ""}, în cadrul ${bis}`
      }${botezOf ? `, de către ${botezOf}` : ""}.\n\nPrezentul certificat se eliberează pentru ${scop || "a-i servi la cele de trebuință"}.`;
    case "binecuvantare":
      return `Se certifică prin prezenta că ${f ? "copila" : "copilul"} ${nume}${nascut}${parinti ? `, din părinții ${parinti}` : ""}, a fost adus${f ? "ă" : ""} înaintea Domnului și binecuvântat${f ? "ă" : ""} în cadrul ${bis}, la data de ${m?.dataBinecuvantare ? fmtL(m.dataBinecuvantare) : BLANK}.\n\n„Lăsați copilașii să vină la Mine și nu-i opriți, căci Împărăția lui Dumnezeu este a celor ca ei.” (Marcu 10:14)`;
    case "recomandare":
      return `Către ${catre || BLANK_NAME},\n\nHar și pace de la Dumnezeu, Tatăl nostru, și de la Domnul Isus Hristos!\n\n${bis} recomandă cu drag pe ${f ? "sora" : "fratele"} ${nume}${nascut}, membr${f ? "ă" : "u"} al bisericii noastre${m?.dataMembru ? ` din ${fmtL(m.dataMembru)}` : ""}${botezatInApa(", ", "la ")}, care ${scop || "se mută în localitatea dumneavoastră"}. ${
        discipline
          ? `Conform Statutului Cultului (art. 27 alin. 9), menționăm că ${f ? "sorei" : "fratelui"} i s-a aplicat măsura disciplinară „${discipline.forma}” din ${fmtL(discipline.dataInceput)}.`
          : `${f ? "Sora" : "Fratele"} a avut o purtare frumoasă și o mărturie bună în mijlocul nostru și nu are măsuri disciplinare.`
      }${exceptieDomiciliu ? " Recomandarea se eliberează pentru schimbarea domiciliului în altă localitate (excepție, Statut art. 27 alin. 6)." : ""}\n\nVă rugăm să ${f ? "o" : "îl"} primiți în părtășia frățească și să-i acordați toată dragostea în Domnul.\n\nCu salutări frățești,`;
    case "scrisoare":
      return `Către ${catre || BLANK_NAME},\n\n${scop ? `Ref.: ${scop}\n\n` : ""}`;
    case "raport":
      return reportText ?? "";
  }
}

/** Titlul implicit în registru: tipul documentului, urmat de persoană sau destinatar. */
export function defaultDocumentTitle(tip: DocumentTypeKey, person: { nume: string; prenume: string } | null, catre: string): string {
  return `${DOCUMENT_TYPE_LABEL[tip]}${person ? ` — ${memberName(person)}` : catre ? ` — ${catre}` : ""}`;
}
