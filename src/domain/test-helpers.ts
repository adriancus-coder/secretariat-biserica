import type { EventRecord, PersonRecord } from "./types";

let n = 0;

/** Persoană de test cu valori implicite goale. */
export function person(p: Partial<PersonRecord> & Pick<PersonRecord, "nume">): PersonRecord {
  n++;
  return {
    id: p.id ?? `p${n}`,
    prenume: "",
    statut: "MEMBRU",
    gen: null,
    familie: "",
    rudenie: "",
    dataNasterii: null,
    dataMembru: null,
    modIntrare: null,
    bisericaProvenienta: "",
    dataBotez: null,
    locBotez: "",
    dataBinecuvantare: null,
    dataIesire: null,
    modIesire: null,
    bisericaDestinatie: "",
    createdAt: "2020-01-01",
    ...p,
  };
}

export function event(e: Partial<EventRecord> & Pick<EventRecord, "tip" | "data">): EventRecord {
  n++;
  return { id: e.id ?? `e${n}`, titlu: e.titlu ?? e.tip, ...e };
}
