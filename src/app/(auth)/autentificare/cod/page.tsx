import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isEmailConfigured } from "@/server/email";
import { currentChallenge } from "@/server/two-factor";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Cod de autentificare" };

/** The second step of the login (after a correct password). */
export default async function CodePage() {
  const challenge = await currentChallenge();
  if (!challenge) redirect("/autentificare?expirat=1");
  if (challenge.setupRequired) redirect("/autentificare/configurare");
  const { user } = challenge;
  return (
    <>
      <h2 className="text-2xl mb-1">Cod de autentificare</h2>
      <p className="hint mb-5">
        {user.totpEnabled
          ? "Introduceți codul de 6 cifre din aplicația de autentificare de pe telefon."
          : "Trimiteți codul pe e-mail și introduceți-l mai jos."}
      </p>
      <CodeForm canEmail={user.emailOtpEnabled && isEmailConfigured()} />
      <p className="text-center mt-4">
        <Link href="/autentificare" className="inline-flex min-h-11 items-center px-2">
          Înapoi la autentificare
        </Link>
      </p>
    </>
  );
}
