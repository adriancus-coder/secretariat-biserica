"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import type { FormState } from "@/lib/form-state";
import {
  acceptInvitationSchema,
  changePasswordSchema,
  newPasswordFields,
  safeCallbackUrl,
  signupSchema,
} from "@/lib/schemas/auth";
import { formValues } from "@/lib/validation";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "../password";
import { getCurrentUser } from "../session";
import { hashToken } from "../tokens";
import { parseOrThrow, runFormAction, ValidationError } from "./run";
import { signupAllowed } from "../queries/auth";

async function signInOrMessage(email: string, password: string, redirectTo: string): Promise<FormState | void> {
  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return {
        message:
          error.code === "blocat"
            ? "Prea multe încercări eșuate. Contul este blocat temporar — reîncercați peste 15 minute."
            : "Adresa de e-mail sau parola nu sunt corecte.",
        values: { email },
      };
    }
    if (error instanceof AuthError) return { message: "Autentificarea a eșuat. Încercați din nou.", values: { email } };
    throw error; // redirect după autentificare reușită
  }
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { message: "Introduceți adresa de e-mail și parola.", values: { email } };
  }
  return (await signInOrMessage(email, password, safeCallbackUrl(formData.get("callbackUrl")))) ?? {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/autentificare" });
}

/** Înregistrarea unei biserici noi, împreună cu primul administrator. */
export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let credentials: { email: string; password: string } | undefined;
  const state = await runFormAction(formData, async () => {
    if (!(await signupAllowed())) {
      return { message: "Înregistrarea de biserici noi este dezactivată pe acest server." };
    }
    const data = parseOrThrow(signupSchema, Object.fromEntries(formData));
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new ValidationError({ email: "Există deja un cont cu această adresă de e-mail." });
    }
    const passwordHash = await hashPassword(data.password);
    await prisma.$transaction(async (tx) => {
      const church = await tx.church.create({ data: { nume: data.churchName } });
      await tx.user.create({
        data: { churchId: church.id, email: data.email, name: data.name, passwordHash, role: "ADMIN" },
      });
    });
    credentials = { email: data.email, password: data.password };
  });
  if (!credentials) return { ...state, values: { ...formValues(formData), password: "", confirm: "" } };
  return (await signInOrMessage(credentials.email, credentials.password, "/setari")) ?? {};
}

/** Acceptarea unei invitații: creează contul în biserica invitației. */
export async function acceptInvitationAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let credentials: { email: string; password: string } | undefined;
  const state = await runFormAction(formData, async () => {
    const data = parseOrThrow(acceptInvitationSchema, Object.fromEntries(formData));
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
      return { message: "Invitația nu mai este valabilă. Cereți administratorului o invitație nouă." };
    }
    if (await prisma.user.findUnique({ where: { email: invitation.email } })) {
      return { message: "Există deja un cont cu această adresă de e-mail." };
    }
    const passwordHash = await hashPassword(data.password);
    await prisma.$transaction(async (tx) => {
      // Marcarea condiționată previne folosirea dublă a aceleiași invitații.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ValidationError({}, "Invitația a fost deja folosită.");
      const user = await tx.user.create({
        data: {
          churchId: invitation.churchId,
          email: invitation.email,
          name: data.name,
          passwordHash,
          role: invitation.role,
        },
      });
      await tx.auditLog.create({
        data: {
          churchId: invitation.churchId,
          userId: user.id,
          userName: user.name,
          entity: "USER",
          entityId: user.id,
          entityLabel: `${user.name} <${user.email}>`,
          action: "CREATE",
          changes: { rol: user.role, sursa: "invitație" },
        },
      });
    });
    credentials = { email: invitation.email, password: data.password };
  });
  if (!credentials) return state;
  return (await signInOrMessage(credentials.email, credentials.password, "/")) ?? {};
}

/** Setarea unei parole noi pe baza unui link de resetare emis de administrator. */
export async function resetPasswordAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let credentials: { email: string; password: string } | undefined;
  const state = await runFormAction(formData, async () => {
    const data = parseOrThrow(newPasswordFields, Object.fromEntries(formData));
    const reset = await prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) {
      return { message: "Linkul de resetare nu mai este valabil. Cereți administratorului unul nou." };
    }
    const passwordHash = await hashPassword(data.password);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ValidationError({}, "Linkul de resetare a fost deja folosit.");
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, sessionVersion: { increment: 1 }, failedLoginCount: 0, lastFailedLoginAt: null },
      });
    });
    credentials = { email: reset.user.email, password: data.password };
  });
  if (!credentials) return state;
  return (await signInOrMessage(credentials.email, credentials.password, "/")) ?? {};
}

/** Schimbarea propriei parole; celelalte sesiuni ale utilizatorului sunt invalidate. */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let credentials: { email: string; password: string } | undefined;
  const state = await runFormAction(null, async () => {
    const me = await getCurrentUser();
    if (!me) redirect("/autentificare");
    const data = parseOrThrow(changePasswordSchema, Object.fromEntries(formData));
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (!(await verifyPassword(data.current, user.passwordHash))) {
      throw new ValidationError({ current: "Parola actuală nu este corectă." });
    }
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(data.password), sessionVersion: { increment: 1 } },
    });
    credentials = { email: user.email, password: data.password };
  });
  if (!credentials) return state;
  return (await signInOrMessage(credentials.email, credentials.password, "/cont?parola=schimbata")) ?? {};
}
