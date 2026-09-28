import { z } from "zod";
import { isIsoDate } from "./dates";

z.config(z.locales.ro());

/** Valorile din FormData pot lipsi (null) — le tratăm ca șir gol. */
const str = z.preprocess((v) => (v === null || v === undefined ? "" : v), z.string());

export function text(max: number, label = "Câmpul") {
  return str.transform((s) => s.trim()).pipe(z.string().max(max, `${label} poate avea cel mult ${max} de caractere.`));
}

export function requiredText(max: number, message: string, label = "Câmpul") {
  return text(max, label).pipe(z.string().min(1, message));
}

/** Text lung (note, hotărâri, conținutul documentelor): păstrează rândurile, elimină spațiile de la capete. */
export function longText(max: number, label = "Textul") {
  return str
    .transform((s) => s.replace(/\r\n/g, "\n").trim())
    .pipe(z.string().max(max, `${label} poate avea cel mult ${max} de caractere.`));
}

export const optionalDate = str
  .transform((s) => s.trim())
  .refine((s) => s === "" || isIsoDate(s), "Dată invalidă.")
  .refine((s) => s === "" || (s >= "1850-01-01" && s <= "2200-12-31"), "Dată în afara intervalului acceptat.")
  .transform((s) => (s === "" ? null : s));

export function requiredDate(message = "Data este obligatorie.") {
  return optionalDate.refine((s): s is string => s !== null, message).transform((s) => s as string);
}

export const optionalTime = str
  .transform((s) => s.trim())
  .refine((s) => s === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(s), "Oră invalidă (HH:MM).");

export const optionalEmail = str
  .transform((s) => s.trim())
  .refine((s) => s === "" || z.email().safeParse(s).success, "Adresă de e-mail invalidă.")
  .pipe(z.string().max(200));

export function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return str
    .transform((s) => s.trim())
    .refine((s) => s === "" || (values as readonly string[]).includes(s), "Valoare invalidă.")
    .transform((s) => (s === "" ? null : (s as T[number])));
}

export function requiredEnum<T extends readonly [string, ...string[]]>(values: T, message = "Alegeți o valoare.") {
  return str.pipe(z.enum(values, { error: message }));
}

export function optionalInt(min: number, max: number) {
  return str
    .transform((s) => s.trim())
    .refine((s) => s === "" || /^\d+$/.test(s), "Introduceți un număr întreg.")
    .transform((s) => (s === "" ? null : Number(s)))
    .refine((n) => n === null || (n >= min && n <= max), `Numărul trebuie să fie între ${min} și ${max}.`);
}

/** ID-uri generate de aplicație (cuid) sau păstrate din importul prototipului. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identificator invalid.");

/** Transformă erorile zod într-un dicționar câmp → primul mesaj. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Valorile trimise dintr-un formular, ca șiruri (pentru repopularea câmpurilor după o eroare). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string") out[k] = out[k] !== undefined ? `${out[k]}\n${v}` : v;
  }
  return out;
}
