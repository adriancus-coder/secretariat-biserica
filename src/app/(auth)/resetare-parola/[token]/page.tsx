import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/shell/icons";
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
        <p className="hint mb-5">Linkul de resetare nu mai este valabil sau a fost deja folosit. Puteți cere unul nou.</p>
        <Link href="/am-uitat-parola" className="btn btn-primary w-full min-h-11">
          <Icon name="email" className="size-[18px]" />
          Cere un link nou
        </Link>
        <Link href="/autentificare" className="btn w-full min-h-11 mt-3">
          Înapoi la autentificare
        </Link>
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
