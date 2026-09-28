import { fmtL, memberName } from "@/lib/format";
import { DOCUMENT_TYPE_LABEL, PARENT_RELATIONS, type DocumentTypeKey, type GenderKey } from "@/lib/labels";
import type { ChurchInfo } from "./types";

/** Datele unei persoane necesare șabloanelor de documente. */
export interface DocPerson {
  id: string;
  nume: string;
  prenume: string;
  gen: GenderKey | null;
  familie: string;
  rudenie: string;
  dataNasterii: string | null;
  dataMembru: string | null;
  dataBotez: string | null;
  locBotez: string;
  dataBinecuvantare: string | null;
}

export interface DocumentTemplateInput {
  tip: DocumentTypeKey;
  person: DocPerson | null;
  /** Membrii familiei persoanei (pentru „din părinții …” în certificatul de binecuvântare). */
  family: DocPerson[];
  church: Pick<ChurchInfo, "nume" | "adresa">;
  catre: string;
  scop: string;
  /** Textul dării de seamă (pentru tipul „raport”), calculat separat. */
  reportText?: string;
}

const BLANK_NAME = "____________________";
const BLANK = "____________";

/**
 * Generează textul documentului — portarea șabloanelor din `genDocText` (prototip), cu aceleași
 * formulări și acorduri de gen (născut/născută, membru/membră, fratele/sora, dânsul/dânsa ...).
 */
export function generateDocumentText({ tip, person: m, family, church: c, catre, scop, reportText }: DocumentTemplateInput): string {
  const f = m?.gen === "F";
  const nume = m ? memberName(m) : BLANK_NAME;
  const nascut = m?.dataNasterii ? `, născut${f ? "ă" : ""} la data de ${fmtL(m.dataNasterii)}` : "";
  const bis = `Biserica ${c.nume || BLANK}`;
  const parinti =
    m && m.familie
      ? family
          .filter((p) => p.id !== m.id && p.familie === m.familie && PARENT_RELATIONS.includes(p.rudenie))
          .map(memberName)
          .join(" și ")
      : "";

  switch (tip) {
    case "adeverinta":
      return `${bis}, cu sediul în ${c.adresa || BLANK}, adeverește prin prezenta că ${nume}${nascut}, este membr${f ? "ă" : "u"} al bisericii noastre${m?.dataMembru ? ` din data de ${fmtL(m.dataMembru)}` : ""}${m?.dataBotez ? `, fiind botezat${f ? "ă" : ""} în apă la data de ${fmtL(m.dataBotez)}` : ""}.\n\nPrezenta adeverință se eliberează la cererea ${f ? "dânsei" : "dânsului"}, pentru ${scop || "a-i servi la cele legale"}.`;
    case "botez":
      return `Se certifică prin prezenta că ${nume}${nascut}, a fost botezat${f ? "ă" : ""} în apă, prin cufundare, în Numele Tatălui, al Fiului și al Sfântului Duh, la data de ${m?.dataBotez ? fmtL(m.dataBotez) : BLANK}${m?.locBotez ? `, la ${m.locBotez}` : ""}, în cadrul ${bis}.\n\nPrezentul certificat se eliberează pentru ${scop || "a-i servi la cele de trebuință"}.`;
    case "binecuvantare":
      return `Se certifică prin prezenta că ${f ? "copila" : "copilul"} ${nume}${nascut}${parinti ? `, din părinții ${parinti}` : ""}, a fost adus${f ? "ă" : ""} înaintea Domnului și binecuvântat${f ? "ă" : ""} în cadrul ${bis}, la data de ${m?.dataBinecuvantare ? fmtL(m.dataBinecuvantare) : BLANK}.\n\n„Lăsați copilașii să vină la Mine și nu-i opriți, căci Împărăția lui Dumnezeu este a celor ca ei.” (Marcu 10:14)`;
    case "recomandare":
      return `Către ${catre || BLANK_NAME},\n\nHar și pace de la Dumnezeu, Tatăl nostru, și de la Domnul Isus Hristos!\n\n${bis} recomandă cu drag pe ${f ? "sora" : "fratele"} ${nume}${nascut}, membr${f ? "ă" : "u"} al bisericii noastre${m?.dataMembru ? ` din ${fmtL(m.dataMembru)}` : ""}${m?.dataBotez ? `, botezat${f ? "ă" : ""} în apă la ${fmtL(m.dataBotez)}` : ""}, care ${scop || "se mută în localitatea dumneavoastră"}. ${f ? "Sora" : "Fratele"} a avut o purtare frumoasă și o mărturie bună în mijlocul nostru și nu are datorii sau abateri de disciplină față de biserică.\n\nVă rugăm să ${f ? "o" : "îl"} primiți în părtășia frățească și să-i acordați toată dragostea în Domnul.\n\nCu salutări frățești,`;
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
