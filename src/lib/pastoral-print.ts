import { para, pre, type Block, type PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";

export interface PastoralPrintPerson {
  name: string;
  notes: { author: string; when: string; text: string | null }[];
}

/**
 * "Note pastorale" as a PDF (pastors only, after the step-up): per person, each note with its author
 * and date. A note that cannot be decrypted is marked, never shown garbled. Pure.
 */
export function pastoralNotesPrint(persons: PastoralPrintPerson[], today: string, church: ChurchInfo): PrintSpec {
  const blocks: Block[] = [
    { type: "title", text: "Note pastorale" },
    para(`Document confidențial (Statut art. 39 alin. 3), generat la ${today}. A nu se transmite.`),
  ];
  if (!persons.length) blocks.push(para("Nu există note pastorale."));
  for (const p of persons) {
    blocks.push({ type: "para", runs: [{ text: p.name, bold: true }] });
    for (const n of p.notes) {
      blocks.push({ type: "para", runs: [{ text: `${n.author}, ${n.when}`, bold: false }] });
      blocks.push(pre(n.text ?? "[Nota nu poate fi citită: cheia de criptare s-a schimbat.]"));
    }
  }
  return { title: "Note pastorale", church, blocks };
}
