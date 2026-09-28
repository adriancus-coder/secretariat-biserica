import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABEL } from "@/lib/labels";
import { findValidInvitation } from "@/server/queries/auth";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitație" };

export default async function InvitationPage({ params }: PageProps<"/invitatie/[token]">) {
  const { token } = await params;
  const invitation = await findValidInvitation(token);
  if (!invitation) {
    return (
      <>
        <h2 className="text-2xl mb-2">Invitație expirată</h2>
        <p className="hint">
          Linkul nu mai este valabil (a expirat, a fost folosit sau anulat). Cereți administratorului bisericii o
          invitație nouă.
        </p>
        <p className="mt-6">
          <Link href="/autentificare">Autentificare</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h2 className="text-2xl mb-1">Bun venit!</h2>
      <p className="hint mb-5">
        Ați fost invitat(ă) în secretariatul bisericii <b>{invitation.churchName}</b>, cu rolul{" "}
        <b>{ROLE_LABEL[invitation.role]}</b>. Contul va fi creat pentru adresa <b>{invitation.email}</b>.
      </p>
      <AcceptInvitationForm token={token} />
    </>
  );
}
