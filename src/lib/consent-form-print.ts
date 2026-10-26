import type { Block, PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";
import { CONSENT_QUESTION, OPTIONAL_CONSENTS } from "./labels";

/**
 * The paper form of the consents ("Înregistrează acord pe hârtie" records what was ticked on it):
 * the notice confirmation, the four optional consents (Da / Nu) and the weekly prayer for families,
 * the same two rows as in the online campaign. Blank, nothing about a person is printed. Pure.
 */
export const PRAYER_FORM_ROWS = ["Nu doresc ca familia mea să fie pomenită pe grupul bisericii", "Pot fi pomeniți și copiii noștri"] as const;

const BOX = "[   ]";
const para = (text: string, bold = false): Block => ({ type: "para", runs: [{ text, bold }] });

export function consentFormPrint(church: ChurchInfo): PrintSpec {
  return {
    title: "Formular acorduri",
    church,
    blocks: [
      { type: "title", text: "Acorduri privind datele personale" },
      para("Nume și prenume: ______________________________________________"),
      para("Pentru copilul (dacă este cazul): ______________________________"),
      para(`${BOX} Am citit nota de informare privind prelucrarea datelor`),
      para("Acorduri opționale (bifați Da sau Nu la fiecare; un „Nu” nu vă afectează în niciun fel):", true),
      { type: "table", columns: ["Acord", "Da", "Nu"], rows: OPTIONAL_CONSENTS.map((k) => [CONSENT_QUESTION[k], BOX, BOX]) },
      para("Rugăciunea săptămânală pentru familii", true),
      para(
        "În fiecare săptămână biserica se roagă pentru o familie. O persoană desemnată de comitet o anunță pe grupul bisericii, doar cu numele familiei și prenumele părinților. Puteți cere oricând să nu fiți pomeniți, fără nicio explicație. Prenumele copiilor apar numai cu acordul dumneavoastră.",
      ),
      ...PRAYER_FORM_ROWS.map((r) => para(`${BOX} ${r}`)),
      para("Data: ____________________          Semnătura: ____________________"),
    ],
  };
}
