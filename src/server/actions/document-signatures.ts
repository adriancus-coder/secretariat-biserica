"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { FormState } from "@/lib/form-state";
import { DOCUMENT_STATE_LABEL, DOCUMENT_TYPE_LABEL } from "@/lib/labels";
import { confirmPasswordSchema } from "@/lib/schemas/two-factor";
import { idSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { sendDocumentApprovalEmail } from "../email";
import { signatureImage, writeDocumentSignature, type SignInput, type SignatureRoleKey } from "../document-signatures";
import { PasskeyError, PURPOSE, verifyUserPresence } from "../passkeys";
import { verifyPassword } from "../password";
import { hasActivePastor } from "../pastor-approval";
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
 * Signs a document in the secretary's place (write roles): drawn now, or the saved signature after a
 * device confirmation for this exact document. The pastor's place is signed only by the approval.
 */
export async function signDocumentAction(documentId: string, role: SignatureRoleKey, input: SignInput): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx();
    if (!idSchema.safeParse(documentId).success || (role !== "PASTOR" && role !== "SECRETAR")) throw new ActionError("Document necunoscut.");
    if (!input || (input.mode !== "UNICA" && input.mode !== "SALVATA")) throw new ActionError("Semnătură invalidă.");
    // Through the church-scoped client: a document of another church is simply not found.
    const doc = await ctx.db.document.findUnique({ where: { id: documentId }, select: { id: true, tip: true, nr: true, anRegistru: true, titlu: true, stare: true } });
    if (!doc) throw new ActionError("Documentul nu mai există.");
    // The pastor signs by approving; an approved document is changed only by editing it (back to a draft).
    if (role === "PASTOR") throw new ActionError("Pastorul semnează prin „Aprobă și semnează”.");
    if (doc.stare === "APROBAT" && (await hasActivePastor(ctx.user.churchId))) throw new ActionError("Documentul este aprobat; modificați-l întâi (devine ciornă).");
    const image = await signatureImage(ctx, doc.id, doc.tip, input);
    const label = `${doc.titlu || DOCUMENT_TYPE_LABEL[doc.tip]} nr. ${doc.nr}/${doc.anRegistru}`;
    await ctx.db.$transaction((tx) => writeDocumentSignature(tx, ctx, { id: doc.id, label }, role, image, input.mode));
    return { ok: true, message: "Documentul a fost semnat." };
  });
  if (state.ok) revalidatePath(`/documente/${documentId}`);
  return state;
}

// ---------- Pastor approval (Statut art. 38–39) ----------

const docLabel = (d: { titlu: string; tip: keyof typeof DOCUMENT_TYPE_LABEL; nr: number; anRegistru: number }) =>
  `${d.titlu || DOCUMENT_TYPE_LABEL[d.tip]} nr. ${d.nr}/${d.anRegistru}`;

/** "Trimite pastorului spre semnare" (write): CIORNA / RESPINS → DE_SEMNAT; the pastors get an e-mail with the link. */
export async function sendToPastorAction(documentId: string): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("write");
    if (!idSchema.safeParse(documentId).success) throw new ActionError("Document necunoscut.");
    const doc = await ctx.db.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new ActionError("Documentul nu mai există.");
    if (doc.stare !== "CIORNA" && doc.stare !== "RESPINS") throw new ActionError(doc.stare === "APROBAT" ? "Documentul este deja aprobat." : "Documentul a fost deja trimis pastorului.");
    const pastors = await prisma.user.findMany({ where: { churchId: ctx.user.churchId, isPastor: true, active: true }, select: { email: true } });
    if (!pastors.length) throw new ActionError("Biserica nu are niciun utilizator marcat ca pastor (Setări → Utilizatori).");
    await ctx.db.$transaction(async (tx) => {
      await tx.document.update({ where: { id: doc.id }, data: { stare: "DE_SEMNAT", trimisLaSemnatLa: new Date(), motivRespingere: "" } });
      await writeAudit(tx, ctx.user, {
        entity: "DOCUMENT",
        entityId: doc.id,
        entityLabel: docLabel(doc),
        action: "UPDATE",
        fields: ["stare"],
        before: { stare: DOCUMENT_STATE_LABEL[doc.stare] },
        after: { stare: DOCUMENT_STATE_LABEL.DE_SEMNAT },
      });
    });
    const sent = await sendDocumentApprovalEmail({ to: pastors.map((p) => p.email), documentId: doc.id, churchName: ctx.user.churchName, kind: "trimis" });
    return {
      ok: true,
      message: sent === "sent" ? "Trimis pastorului; a primit un e-mail cu linkul." : "Trimis pastorului. Documentul apare la „De semnat”.",
    };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** "Aprobă și semnează" (pastors): signs in the pastor's place (fresh or saved after the device unlock) and approves. */
export async function approveDocumentAction(documentId: string, input: SignInput): Promise<FormState> {
  const state = await runFormAction(null, async () => {
    const ctx = await actionCtx("pastor");
    if (!idSchema.safeParse(documentId).success) throw new ActionError("Document necunoscut.");
    if (!input || (input.mode !== "UNICA" && input.mode !== "SALVATA")) throw new ActionError("Semnătură invalidă.");
    const doc = await ctx.db.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new ActionError("Documentul nu mai există.");
    if (doc.stare !== "DE_SEMNAT") throw new ActionError("Documentul nu este trimis spre semnare.");
    const image = await signatureImage(ctx, doc.id, doc.tip, input);
    await ctx.db.$transaction(async (tx) => {
      await writeDocumentSignature(tx, ctx, { id: doc.id, label: docLabel(doc) }, "PASTOR", image, input.mode);
      const { count } = await tx.document.updateMany({ where: { id: doc.id, stare: "DE_SEMNAT" }, data: { stare: "APROBAT", aprobatDeUserId: ctx.user.id, aprobatLa: new Date() } });
      if (count !== 1) throw new ActionError("Documentul a fost modificat între timp. Reîncărcați pagina.");
      await writeAudit(tx, ctx.user, {
        entity: "DOCUMENT",
        entityId: doc.id,
        entityLabel: docLabel(doc),
        action: "UPDATE",
        fields: ["stare"],
        before: { stare: DOCUMENT_STATE_LABEL.DE_SEMNAT },
        after: { stare: DOCUMENT_STATE_LABEL.APROBAT },
      });
    });
    await notifySecretary(ctx, doc.id, "aprobat");
    return { ok: true, message: "Documentul a fost aprobat și semnat." };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** "Respinge" (pastors) with a reason: back to the secretary as RESPINS. */
export async function rejectDocumentAction(documentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("pastor");
    if (!idSchema.safeParse(documentId).success) throw new ActionError("Document necunoscut.");
    const motiv = String(formData.get("motiv") ?? "").trim().slice(0, 1000);
    if (!motiv) return { message: "Scrieți motivul respingerii.", errors: { motiv: "Scrieți motivul respingerii." } };
    const doc = await ctx.db.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new ActionError("Documentul nu mai există.");
    if (doc.stare !== "DE_SEMNAT") throw new ActionError("Documentul nu este trimis spre semnare.");
    await ctx.db.$transaction(async (tx) => {
      await tx.document.update({ where: { id: doc.id }, data: { stare: "RESPINS", motivRespingere: motiv } });
      await writeAudit(tx, ctx.user, {
        entity: "DOCUMENT",
        entityId: doc.id,
        entityLabel: docLabel(doc),
        action: "UPDATE",
        fields: ["stare", "motivRespingere"],
        before: { stare: DOCUMENT_STATE_LABEL.DE_SEMNAT, motivRespingere: "" },
        after: { stare: DOCUMENT_STATE_LABEL.RESPINS, motivRespingere: motiv },
      });
    });
    await notifySecretary(ctx, doc.id, "respins");
    return { ok: true, message: "Documentul a fost respins și trimis înapoi secretariatului." };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}

/** The secretary who sent the document (from the audit log), or nobody. */
async function notifySecretary(ctx: Awaited<ReturnType<typeof actionCtx>>, documentId: string, kind: "aprobat" | "respins") {
  const sent = await ctx.db.auditLog.findFirst({
    where: { entity: "DOCUMENT", entityId: documentId, changes: { path: ["stare", "1"], equals: DOCUMENT_STATE_LABEL.DE_SEMNAT } },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
  });
  const user = sent?.userId ? await prisma.user.findFirst({ where: { id: sent.userId, churchId: ctx.user.churchId, active: true }, select: { email: true } }) : null;
  if (user) await sendDocumentApprovalEmail({ to: [user.email], documentId, churchName: ctx.user.churchName, kind });
}

