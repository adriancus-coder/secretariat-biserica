import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isEmailConfigured } from "@/server/email";
import { currentChallenge } from "@/server/two-factor";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Autentificare în doi pași" };

/** The church requires a second factor and the user has none: setup before the first sign-in. */
export default async function SetupPage() {
  const challenge = await currentChallenge();
  if (!challenge) redirect("/autentificare?expirat=1");
  if (!challenge.setupRequired && !challenge.verifiedAt) redirect("/autentificare/cod");
  return (
    <>
      <h2 className="text-2xl mb-1">Autentificare în doi pași</h2>
      <p className="hint mb-5">
        Biserica {challenge.user.church.nume} cere, pe lângă parolă, un cod la fiecare autentificare. Alegeți cum îl primiți.
      </p>
      <SetupForm canEmail={isEmailConfigured()} />
    </>
  );
}
