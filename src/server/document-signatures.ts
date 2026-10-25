import "server-only";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { dotDateTime } from "@/lib/dates";
import { freshSignatureRequired, signatureNote } from "@/lib/signatures";
import { permissions } from "@/lib/permissions";
import { writeAudit } from "./audit";
import { prisma } from "./db";
import { PasskeyError, PURPOSE, verifyUserPresence } from "./passkeys";
import { ActionError, type Ctx } from "./session";
import { normalizeSignature, SignatureImageError } from "./signature-image";

type Tx = Parameters<Parameters<Ctx["db"]["$transaction"]>[0]>[0];

export type SignatureRoleKey = "PASTOR" | "SECRETAR";

/** How a signature is given: drawn now for this document only, or the saved one after a device unlock. */
export type SignInput = { mode: "UNICA"; png: string } | { mode: "SALVATA"; response: AuthenticationResponseJSON };

export const SIGNATURE_ROLE_LABEL: Record<SignatureRoleKey, string> = { PASTOR: "pastor", SECRETAR: "secretar" };

/**
 * The image of a signature: drawn now (normalised like meeting signatures), or the user's saved one,
 * which ALWAYS needs a fresh device confirmation for this exact document (purpose
 * "semnatura:<documentId>") and is refused when the church wants a drawing each time.
 */
export async function signatureImage(ctx: Ctx, documentId: string, tip: string, input: SignInput): Promise<{ png: Buffer; passkeyCredentialId: string | null }> {
  if (input.mode === "UNICA") {
    try {
      return { png: await normalizeSignature(input.png), passkeyCredentialId: null };
    } catch (e) {
      throw new ActionError(e instanceof SignatureImageError ? e.message : "Semnătura nu este o imagine validă.");
    }
  }
  const church = await prisma.church.findUniqueOrThrow({ where: { id: ctx.user.churchId }, select: { semnaturaUnica: true, semnaturaUnicaTipuri: true } });
  if (freshSignatureRequired(church, tip)) throw new ActionError("Pentru acest document semnătura se desenează de fiecare dată.");
  const me = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { signaturePng: true } });
  if (!me.signaturePng) throw new ActionError("Nu aveți o semnătură salvată (Cont → Semnătura mea).");
  if (!input.response) throw new ActionError("Semnătura salvată se folosește doar după confirmarea pe dispozitiv.");
  try {
    const passkey = await verifyUserPresence(ctx.user, PURPOSE.signDocument(documentId), input.response);
    return { png: Buffer.from(me.signaturePng), passkeyCredentialId: passkey.credentialId };
  } catch (e) {
    throw new ActionError(e instanceof PasskeyError ? e.message : "Confirmarea pe dispozitiv nu a reușit.");
  }
}

/**
 * Writes the signature of `role` on the document (replacing an earlier one of that role) in the
 * caller's transaction, audited on the document: who signed, how and when — never the image.
 */
export async function writeDocumentSignature(
  tx: Tx,
  ctx: Ctx,
  doc: { id: string; label: string },
  role: SignatureRoleKey,
  image: { png: Buffer; passkeyCredentialId: string | null },
  mode: "UNICA" | "SALVATA",
) {
  if (role === "PASTOR" && !permissions.pastor(ctx.user)) throw new ActionError("Doar pastorul poate semna în locul pastorului.");
  if (role === "SECRETAR" && !permissions.write(ctx.user)) throw new ActionError("Nu aveți drepturi pentru această operațiune.");
  const before = await tx.documentSignature.findUnique({ where: { documentId_role: { documentId: doc.id, role } } });
  await tx.documentSignature.deleteMany({ where: { documentId: doc.id, role } });
  const created = await tx.documentSignature.create({
    data: { documentId: doc.id, role, userId: ctx.user.id, name: ctx.user.name, imagePng: new Uint8Array(image.png), mode, passkeyCredentialId: image.passkeyCredentialId },
  });
  const text = (s: { name: string; mode: string; signedAt: Date } | null) =>
    s ? `${s.name}, ${s.mode === "SALVATA" ? "semnătura salvată, confirmată pe dispozitiv" : "desenată pentru acest document"}, ${dotDateTime(s.signedAt)}` : "";
  await writeAudit(tx, ctx.user, {
    entity: "DOCUMENT",
    entityId: doc.id,
    entityLabel: doc.label,
    action: "UPDATE",
    fields: [role === "PASTOR" ? "semnaturaPastor" : "semnaturaSecretar"],
    before: { [role === "PASTOR" ? "semnaturaPastor" : "semnaturaSecretar"]: text(before) },
    after: { [role === "PASTOR" ? "semnaturaPastor" : "semnaturaSecretar"]: text(created) },
  });
  return created;
}

/** The document's signatures for the PDF / Word (`DocumentPrint.signatures`). */
export async function printSignatures(documentId: string) {
  const rows = await prisma.documentSignature.findMany({ where: { documentId } });
  return Object.fromEntries(rows.map((r) => [r.role, { name: r.name, image: new Uint8Array(r.imagePng), note: signatureNote(r) }])) as Partial<
    Record<SignatureRoleKey, { name: string; image: Uint8Array; note: string }>
  >;
}
