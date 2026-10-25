import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeCallbackUrl } from "@/lib/schemas/auth";
import { signupAllowed } from "@/server/queries/auth";
import { getCurrentUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Autentificare" };

export default async function LoginPage({ searchParams }: PageProps<"/autentificare">) {
  const sp = await searchParams;
  const callbackUrl = safeCallbackUrl(typeof sp.callbackUrl === "string" ? sp.callbackUrl : "/");
  // Redirecționăm doar dacă sesiunea e validă în baza de date (evită bucle cu sesiuni expirate).
  if (await getCurrentUser()) redirect(callbackUrl);
  const allowSignup = await signupAllowed();
  return (
    <>
      <h2 className="text-2xl mb-1">Autentificare</h2>
      <p className="hint mb-5">Intrați în contul secretariatului bisericii.</p>
      {sp.coduri ? (
        <div className="alert" role="status">
          Prea multe coduri greșite. Autentificați-vă din nou cu e-mailul și parola.
        </div>
      ) : null}
      {sp.expirat ? (
        <div className="alert" role="status">
          Pasul de verificare a expirat. Autentificați-vă din nou.
        </div>
      ) : null}
      <LoginForm callbackUrl={callbackUrl} />
      <p className="text-center mt-2">
        <Link href="/am-uitat-parola" className="inline-flex min-h-11 items-center px-2">
          Ați uitat parola?
        </Link>
      </p>
      {allowSignup ? (
        <p className="hint mt-4">
          Biserica dumneavoastră nu are încă un cont? <Link href="/inregistrare">Înregistrați biserica</Link>.
        </p>
      ) : (
        <p className="hint mt-4">Conturile noi se creează prin invitație de la administratorul bisericii.</p>
      )}
      <p className="hint mt-2">
        <Link href="/confidentialitate">Confidențialitatea datelor</Link>
      </p>
    </>
  );
}
