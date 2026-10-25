import "server-only";
import { containsPersonalData } from "@/lib/password-policy";
import { COMMON_PASSWORDS } from "./common-passwords";

/**
 * New passwords: at least 10 characters (zod schemas), not one of the 10,000 most common passwords,
 * and without the e-mail address or the user's name in it.
 */
export function passwordProblem(password: string, p: { email?: string; name?: string }): string | null {
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "Parola este prea des folosită. Alegeți una mai greu de ghicit.";
  if (containsPersonalData(password, p)) return "Parola nu trebuie să conțină adresa de e-mail sau numele dumneavoastră.";
  return null;
}
