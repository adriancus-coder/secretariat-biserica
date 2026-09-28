import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signupAllowed } from "@/server/queries/auth";
import { getCurrentUser } from "@/server/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Înregistrare biserică" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  if (!(await signupAllowed())) {
    return (
      <>
        <h2 className="text-2xl mb-2">Înregistrare dezactivată</h2>
        <p className="hint">
          Pe acest server, conturile noi se creează doar prin invitație de la administratorul bisericii.
        </p>
        <p className="mt-6">
          <Link href="/autentificare">Înapoi la autentificare</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h2 className="text-2xl mb-1">Înregistrați biserica</h2>
      <p className="hint mb-5">
        Creați spațiul de lucru al bisericii și contul de administrator. Ulterior puteți invita secretari și alți
        utilizatori.
      </p>
      <SignupForm />
      <p className="hint mt-6">
        Aveți deja cont? <Link href="/autentificare">Autentificare</Link>
      </p>
    </>
  );
}
