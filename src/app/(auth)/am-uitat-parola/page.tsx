import type { Metadata } from "next";
import { connection } from "next/server";
import { isEmailConfigured } from "@/server/email";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Am uitat parola" };

export default async function ForgotPasswordPage() {
  await connection(); // the e-mail setting is read at request time, not baked in at build
  const emailEnabled = isEmailConfigured();
  return (
    <>
      <h2 className="text-2xl mb-1">Am uitat parola</h2>
      <p className="hint mb-5">
        Scrieți adresa de e-mail a contului. Vă trimitem un link cu care vă alegeți o parolă nouă.
      </p>
      {emailEnabled ? null : (
        <p className="alert">
          Trimiterea pe e-mail nu este configurată. Dacă nu primiți e-mailul, cereți administratorului bisericii un link
          de resetare a parolei.
        </p>
      )}
      <ForgotPasswordForm />
    </>
  );
}
