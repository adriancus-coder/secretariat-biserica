import { z } from "zod";
import { longText, requiredText } from "../validation";

export const SEND_MAX_RECIPIENTS = 50;

/** Free addresses: separated by commas, semicolons, spaces or new lines. */
export function splitAddresses(value: string): string[] {
  return value.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean);
}

const isEmail = (a: string) => z.email().safeParse(a).success;

/**
 * The "Trimite" dialog: the ticked recipients (`catre`, one value per chip), the free
 * `alte` addresses, the subject, the message and the PDF checkbox. Recipients come out
 * lower-case and deduplicated.
 */
export const meetingSendSchema = z
  .object({
    catre: z.array(z.string()),
    alte: z.string(),
    subiect: requiredText(200, "Subiectul este obligatoriu.", "Subiectul"),
    mesaj: longText(5000, "Mesajul"),
    pdf: z.boolean(),
  })
  .transform((v, ctx) => {
    const invalid = [...v.catre, ...splitAddresses(v.alte)].map((a) => a.trim()).filter((a) => a && !isEmail(a));
    if (invalid.length) {
      ctx.addIssue({ code: "custom", path: ["alte"], message: `Adresă de e-mail invalidă: ${invalid.join(", ")}` });
      return z.NEVER;
    }
    const to = [...new Set([...v.catre, ...splitAddresses(v.alte)].map((a) => a.trim().toLowerCase()).filter(Boolean))];
    if (!to.length) {
      ctx.addIssue({ code: "custom", path: ["alte"], message: "Alegeți cel puțin un destinatar." });
      return z.NEVER;
    }
    if (to.length > SEND_MAX_RECIPIENTS) {
      ctx.addIssue({ code: "custom", path: ["alte"], message: `Cel mult ${SEND_MAX_RECIPIENTS} de destinatari într-un mesaj.` });
      return z.NEVER;
    }
    return { to, subiect: v.subiect, mesaj: v.mesaj, pdf: v.pdf };
  });

export function meetingSendInput(formData: FormData) {
  return {
    catre: formData.getAll("catre").filter((x): x is string => typeof x === "string"),
    alte: String(formData.get("alte") ?? ""),
    subiect: formData.get("subiect"),
    mesaj: formData.get("mesaj"),
    pdf: formData.get("pdf") === "on",
  };
}

/** Default subject: "Proces-verbal nr. 16/2026 — Maranata Stavanger" (without number: the date). */
export function defaultSendSubject(m: { nr: number | null; anRegistru: number | null; dataLabel: string }, churchName: string): string {
  const what = m.nr !== null ? `Proces-verbal nr. ${m.nr}/${m.anRegistru}` : `Proces-verbal din ${m.dataLabel}`;
  return churchName ? `${what} — ${churchName}` : what;
}

export function defaultSendMessage(m: { tip: string; dataLabel: string }, churchName: string): string {
  return [
    "Bună ziua,",
    "",
    `Vă transmitem atașat procesul-verbal al ședinței (${m.tip}) din ${m.dataLabel}.`,
    "",
    "Cu stimă,",
    churchName ? `Secretariatul bisericii ${churchName}` : "Secretariatul bisericii",
  ].join("\n");
}
