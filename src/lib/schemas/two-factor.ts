import { z } from "zod";

/** A 6-digit code (app or e-mail) or a recovery code, with spaces allowed; bounded before any work. */
export const CODE_MAX = 32;
export const codeSchema = z.preprocess(
  (v) => (typeof v === "string" ? v : ""),
  z.string().trim().min(1, "Introduceți codul.").max(CODE_MAX, "Codul este prea lung."),
);

/** The password re-entered in Cont → Securitate. */
export const confirmPasswordSchema = z.preprocess(
  (v) => (typeof v === "string" ? v : ""),
  z.string().min(1, "Parola nu este corectă.").max(200, "Parola nu este corectă."),
);

/** The code field of a form, or the first validation message. */
export function readCode(formData: FormData): { code: string; error?: undefined } | { code?: undefined; error: string } {
  const r = codeSchema.safeParse(formData.get("cod"));
  return r.success ? { code: r.data } : { error: r.error.issues[0].message };
}
