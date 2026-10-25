import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isEmailConfigured } from "@/server/email";
import { currentChallenge } from "@/server/two-factor";
import { CodeForm } from "./code-form";
import { PasskeySecondFactor } from "../passkey-login";
import { prisma } from "@/server/db";
import { isPasskeyConfigured, passkeyPolicyApplies } from "@/server/passkeys";

export const metadata: Metadata = { title: "Cod de autentificare" };

/** The second step of the login (after a correct password). */
export default async function CodePage() {
  const challenge = await currentChallenge();
  if (!challenge) redirect("/autentificare?expirat=1");
  if (challenge.setupRequired) redirect("/autentificare/configurare");
  const { user } = challenge;
  const passkeys = isPasskeyConfigured() ? await prisma.userPasskey.count({ where: { userId: user.id } }) : 0;
  // Under the policy "parolă + Face ID / amprentă" the codes are only a recovery (audited).
  const policy = passkeys > 0 && passkeyPolicyApplies(user, user.church);
  const hasCodes = user.totpEnabled || user.emailOtpEnabled || user.recoveryCodes.length > 0;
  return (
    <>
      <h2 className="text-2xl mb-1">Cod de autentificare</h2>
      {passkeys ? (
        <>
          <p className="hint mb-3">Confirmați cu Face ID, amprenta sau PIN-ul acestui dispozitiv.</p>
          <PasskeySecondFactor />
        </>
      ) : null}
      {hasCodes ? (
        passkeys ? (
          <details className="mt-5">
            <summary className="cursor-pointer min-h-11 flex items-center">{policy ? "Nu am dispozitivul la mine (cod de rezervă)" : "Folosește un cod"}</summary>
            {policy ? <p className="hint">Intrarea cu un cod de rezervă este înregistrată și văzută de administratori.</p> : null}
            <CodeForm canEmail={user.emailOtpEnabled && isEmailConfigured()} />
          </details>
        ) : (
          <>
            <p className="hint mb-5">
              {user.totpEnabled
                ? "Introduceți codul de 6 cifre din aplicația de autentificare de pe telefon."
                : "Trimiteți codul pe e-mail și introduceți-l mai jos."}
            </p>
            <CodeForm canEmail={user.emailOtpEnabled && isEmailConfigured()} />
          </>
        )
      ) : null}
      <p className="text-center mt-4">
        <Link href="/autentificare" className="inline-flex min-h-11 items-center px-2">
          Înapoi la autentificare
        </Link>
      </p>
    </>
  );
}
