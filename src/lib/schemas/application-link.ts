import { z } from "zod";
import { longText, requiredText } from "../validation";
import { splitAddresses } from "./meeting-send";

export const LINK_SEND_MAX_RECIPIENTS = 20;

const isEmail = (a: string) => z.email().safeParse(a).success;

/** "Trimite linkul pe e-mail": one or more addresses, the subject and the editable message. */
export const applicationLinkSendSchema = z
  .object({
    adrese: z.string(),
    subiect: requiredText(200, "Subiectul este obligatoriu.", "Subiectul"),
    mesaj: longText(3000, "Mesajul"),
  })
  .transform((v, ctx) => {
    const list = splitAddresses(v.adrese);
    const invalid = list.filter((a) => !isEmail(a));
    if (invalid.length) {
      ctx.addIssue({ code: "custom", path: ["adrese"], message: `Adresă de e-mail invalidă: ${invalid.join(", ")}` });
      return z.NEVER;
    }
    const to = [...new Set(list.map((a) => a.toLowerCase()))];
    if (!to.length) {
      ctx.addIssue({ code: "custom", path: ["adrese"], message: "Scrieți cel puțin o adresă de e-mail." });
      return z.NEVER;
    }
    if (to.length > LINK_SEND_MAX_RECIPIENTS) {
      ctx.addIssue({ code: "custom", path: ["adrese"], message: `Cel mult ${LINK_SEND_MAX_RECIPIENTS} de adrese într-un mesaj.` });
      return z.NEVER;
    }
    return { to, subiect: v.subiect, mesaj: v.mesaj };
  });

export function applicationLinkSendInput(formData: FormData) {
  return { adrese: String(formData.get("adrese") ?? ""), subiect: formData.get("subiect"), mesaj: formData.get("mesaj") };
}

export function defaultLinkSubject(churchName: string): string {
  return churchName ? `Cerere de membru — Biserica ${churchName}` : "Cerere de membru";
}

/** The default message; `[link]` is replaced by the application link when sending. */
export function defaultLinkMessage(churchName: string): string {
  return [
    "Bună ziua,",
    "",
    `Puteți completa cererea de membru a bisericii${churchName ? ` ${churchName}` : ""} online, la adresa:`,
    "[link]",
    "",
    "Cu stimă,",
    churchName ? `Secretariatul bisericii ${churchName}` : "Secretariatul bisericii",
  ].join("\n");
}
