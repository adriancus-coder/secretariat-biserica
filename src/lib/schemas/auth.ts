import { z } from "zod";
import { requiredText } from "../validation";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const password = z
  .string()
  .min(PASSWORD_MIN, `Parola trebuie să aibă cel puțin ${PASSWORD_MIN} caractere.`)
  .max(PASSWORD_MAX, `Parola poate avea cel mult ${PASSWORD_MAX} de caractere.`);

export const emailField = z
  .string({ error: "Adresa de e-mail este obligatorie." })
  .trim()
  .toLowerCase()
  .min(1, "Adresa de e-mail este obligatorie.")
  .max(200)
  .pipe(z.email("Adresă de e-mail invalidă."));

export const newPasswordFields = z
  .object({
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Parolele nu coincid." });

export const signupSchema = z
  .object({
    churchName: requiredText(160, "Numele bisericii este obligatoriu."),
    name: requiredText(120, "Numele dumneavoastră este obligatoriu."),
    email: emailField,
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Parolele nu coincid." });

export const acceptInvitationSchema = z
  .object({
    name: requiredText(120, "Numele este obligatoriu."),
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Parolele nu coincid." });

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Introduceți parola actuală."),
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Parolele nu coincid." });

/** Acceptă doar căi relative din aplicație ca destinație după autentificare. */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string") return "/";
  try {
    // Auth.js poate trimite un URL absolut al aplicației; păstrăm doar calea.
    const url = new URL(value, "http://local");
    if (url.origin !== "http://local" && !/^https?:\/\//.test(value)) return "/";
    const path = `${url.pathname}${url.search}`;
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/autentificare")) return "/";
    return path;
  } catch {
    return "/";
  }
}
