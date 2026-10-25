import { z } from "zod";
import { longText } from "../validation";
import { NOTE_MAX, splitAddresses } from "./meeting-send";

export const LINK_SEND_MAX_RECIPIENTS = 20;

const isEmail = (a: string) => z.email().safeParse(a).success;

/** "Trimite linkul pe e-mail": one or more addresses and the optional note (subject and frame are fixed). */
export const applicationLinkSendSchema = z
  .object({
    adrese: z.string(),
    nota: longText(NOTE_MAX, "Mesajul"),
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
    return { to, nota: v.nota };
  });

export function applicationLinkSendInput(formData: FormData) {
  return { adrese: String(formData.get("adrese") ?? ""), nota: formData.get("nota") };
}
