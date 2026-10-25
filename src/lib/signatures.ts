/** Document signatures: pure helpers shared by the server and the pages. */
import { dotDateTime } from "./dates";

/** "Semnătura se desenează de fiecare dată": for every document, or for the chosen types. */
export function freshSignatureRequired(church: { semnaturaUnica: string; semnaturaUnicaTipuri: string[] }, tip: string): boolean {
  return church.semnaturaUnica === "TOATE" || (church.semnaturaUnica === "TIPURI" && church.semnaturaUnicaTipuri.includes(tip));
}

/** The PDF / Word note under a signature. */
export function signatureNote(s: { mode: "SALVATA" | "UNICA"; signedAt: Date }): string {
  return `semnat la ${dotDateTime(s.signedAt)}${s.mode === "SALVATA" ? " · confirmat pe dispozitivul titularului" : ""}`;
}
