import type { Metadata } from "next";
import Link from "next/link";
import { findValidPasswordReset } from "@/server/queries/auth";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Parolă nouă" };

export default async function ResetPasswordPage({ params }: PageProps<"/resetare-parola/[token]">) {
  const { token } = await params;
  const reset = await findValidPasswordReset(token);
  if (!reset) {
    return (
      <>
        <h2 className="text-2xl mb-2">Link expirat</h2>
        <p className="hint">Linkul de resetare nu mai este valabil. Cereți administratorului bisericii unul nou.</p>
        <p className="mt-6">
          <Link href="/autentificare">Autentificare</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h2 className="text-2xl mb-1">Parolă nouă</h2>
      <p className="hint mb-5">
        Setați o parolă nouă pentru contul <b>{reset.email}</b>. Sesiunile deschise pe alte dispozitive vor fi închise.
      </p>
      <ResetPasswordForm token={token} />
    </>
  );
}
