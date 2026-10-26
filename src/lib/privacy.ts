import { fmtL } from "./format";
import { PRIVACY_NOTICE_1_2 } from "./privacy-notice";

export interface PrivacyChurch {
  nume: string;
  email: string;
  adresa: string;
  orgNr?: string;
  telefon?: string;
  comunitate?: string;
  /** When the church adopted the model (Church.privacyAdoptedAt), "[data]" in the notice. */
  privacyAdoptedAt?: string | null;
}

/**
 * The model privacy notice (version 1.2, docs/privacy-notice-1.2.md) filled with the church's
 * settings; an empty setting leaves its bracketed placeholder visible. Pure.
 */
export function privacyTemplate(c: PrivacyChurch): string {
  const fill = (placeholder: string, value: string | undefined | null) => (text: string) => (value?.trim() ? text.split(placeholder).join(value.trim()) : text);
  // The model names Maranata Stavanger; another church gets its own name, the general model a placeholder.
  const name = c.nume.trim() ? (/^biserica\b/i.test(c.nume.trim()) ? c.nume.trim() : `Biserica Penticostală ${c.nume.trim()}`) : "Biserica [numele bisericii]";
  return [
    fill("Biserica Penticostală Maranata Stavanger", name),
    fill("[adresa]", c.adresa),
    fill("[nr.]", c.orgNr),
    fill("[e-mail]", c.email),
    fill("[telefon]", c.telefon),
    fill("[Comunitatea de care aparține biserica]", c.comunitate),
    fill("[data]", c.privacyAdoptedAt ? fmtL(c.privacyAdoptedAt) : ""),
  ].reduce((t, f) => f(t), PRIVACY_NOTICE_1_2);
}

export type PrivacyBlock = { type: "h"; text: string } | { type: "p"; text: string } | { type: "li"; text: string };

/**
 * "## Titlu" → heading; other non-empty lines (joined until a blank line) → paragraph. A text without
 * "## " headings (the 1.1 / 1.2 models) is read line by line: "1. Cine suntem" and an all-capitals line are
 * headings, "- …" lines are list items, every other line is a paragraph.
 */
export function privacyBlocks(text: string): PrivacyBlock[] {
  const out: PrivacyBlock[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((l) => l.trim().startsWith("## "))) {
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\d{1,2}\.\s+\S/.test(line) && line.length <= 80 && !/[.;:]$/.test(line)) out.push({ type: "h", text: line });
      else if (line.length <= 120 && line === line.toLocaleUpperCase("ro") && /\p{L}/u.test(line)) out.push({ type: "h", text: line });
      else if (line.startsWith("- ")) out.push({ type: "li", text: line.slice(2).trim() });
      else out.push({ type: "p", text: line });
    }
    return out;
  }
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flush();
      out.push({ type: "h", text: line.slice(3).trim() });
    } else if (!line) flush();
    else para.push(line);
  }
  flush();
  return out;
}
