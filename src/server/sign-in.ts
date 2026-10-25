import "server-only";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import type { FormState } from "@/lib/form-state";

/** Signs in with a verified login challenge (see src/auth.ts); not a server action. */
export async function finishSignIn(token: string, redirectTo: string, email = ""): Promise<FormState | void> {
  try {
    await signIn("credentials", { challenge: token, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) return { message: "Autentificarea a eșuat. Încercați din nou.", values: { email } };
    throw error; // the redirect after a successful sign-in
  }
}
