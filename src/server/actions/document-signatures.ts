"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { FormState } from "@/lib/form-state";
import { DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { confirmPasswordSchema } from "@/lib/schemas/two-factor";
import { idSchema } from "@/lib/validation";
import { prisma } from "../db";
import { signatureImage, writeDocumentSignature, type SignInput, type SignatureRoleKey } from "../document-signatures";
import { PasskeyError, PURPOSE, verifyUserPresence } from "../passkeys";
import { verifyPassword } from "../password";
import { actionCtx, ActionError, getCurrentUser } from "../session";
import { normalizeSignature, SignatureImageError } from "../signature-image";
import { runFormAction } from "./run";

/**
 * Cont → "Semnătura mea": saves or replaces the user's signature (drawn or a PNG), normalised like
 * meeting signatures. Needs a device confirmation (purpose "semnatura-salvata"), or the password for a
 * user without a passkey; audited without the image.
 */
export async function saveMySignatureAction(input: { png: string; response?: AuthenticationResponseJSON; password?: string }): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) redirect("/autentificare");
  let png: Buffer;
  try {
    png = await normalizeSignature(String(input?.png ?? ""));
  } catch (e) {
    return { message: e instanceof SignatureImageError ? e.message : "Semnătura nu este o imagine validă." };
  }
  const hasPasskey = (await prisma.userPasskey.count({ where: { userId: me.id } })) > 0;
  if (hasPasskey) {
    if (!input.response) return { message: "Confirmați cu Face ID / amprenta dispozitivului." };
    try {
      await verifyUserPresence(me, PURPOSE.savedSignature, input.response);
    } catch (e) {
      return { message: e instanceof PasskeyError ? e.message : "Confirmarea pe dispozitiv nu a reușit." };
    }
  } else {
    const password = confirmPasswordSchema.safeParse(input.password);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { passwordHash: true } });
    if (!password.success || !(await verifyPassword(password.data, user.passwordHash))) return { message: "Parola nu este corectă." };
  }
  const before = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { signatureSavedAt: true } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { signaturePng: new Uint8Array(png), signatureSavedAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        churchId: me.churchId,
        userId: me.id,
        userName: me.name,
        entity: "SECURITY",
        entityId: me.id,
        entityLabel: me.name,
        action: "UPDATE",
        changes: { semnaturaSalvata: before.signatureSavedAt ? "înlocuită" : "salvată", confirmare: hasPasskey ? "pe dispozitiv" : "cu parola" },
      },
    }),
  ]);
  revalidatePath("/cont");
  return { ok: true, message: "Semnătura a fost salvată." };
}

/** "Șterge semnătura salvată". */
export async function deleteMySignatureAction(): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) redirect("/autentificare");
  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { signaturePng: null, signatureSavedAt: null } }),
    prisma.auditLog.create({
      data: { churchId: me.churchId, userId: me.id, userName: me.name, entity: "SECURITY", entityId: me.id, entityLabel: me.name, action: "UPDATE", changes: { semnaturaSalvata: "ștearsă" } },
    }),
  ]);
  revalidatePath("/cont");
  return { ok: true, message: "Semnătura salvată a fost ștearsă." };
}

/**
 * Signs a document in the secretary's place (write roles) or the pastor's (pastors): drawn now, or
 * the saved signature after a device confirmation for this exact document.
 */
export async function signDocumentAction(documentId: string, role: SignatureRoleKey, input: SignInput): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx();
    if (!idSchema.safeParse(documentId).success || (role !== "PASTOR" && role !== "SECRETAR")) throw new ActionError("Document necunoscut.");
    if (!input || (input.mode !== "UNICA" && input.mode !== "SALVATA")) throw new ActionError("Semnătură invalidă.");
    // Through the church-scoped client: a document of another church is simply not found.
    const doc = await ctx.db.document.findUnique({ where: { id: documentId }, select: { id: true, tip: true, nr: true, anRegistru: true, titlu: true } });
    if (!doc) throw new ActionError("Documentul nu mai există.");
    const image = await signatureImage(ctx, doc.id, doc.tip, input);
    const label = `${doc.titlu || DOCUMENT_TYPE_LABEL[doc.tip]} nr. ${doc.nr}/${doc.anRegistru}`;
    await ctx.db.$transaction((tx) => writeDocumentSignature(tx, ctx, { id: doc.id, label }, role, image, input.mode));
    return { ok: true, message: "Documentul a fost semnat." };
  });
  if (state.ok) revalidatePath(`/documente/${documentId}`);
  return state;
}
