"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { signOut } from "@/auth";
import type { FormState } from "@/lib/form-state";
import {
  acceptInvitationSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  newPasswordFields,
  safeCallbackUrl,
  signupSchema,
} from "@/lib/schemas/auth";
import { formValues } from "@/lib/validation";
import { defaultRoleGroupsData } from "@/lib/roles";
import { uniqueChurchSlug } from "../church-slug";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "../password";
import { passwordResetRequests, requestPasswordReset, RESET_REQUEST_WINDOW_MINUTES } from "../password-reset";
import { ActionError, getCurrentUser } from "../session";
import { hashToken } from "../tokens";
import { checkPassword } from "../login";
import { hitIpLimit, IP_LIMIT_MESSAGE } from "../ip-limits";
import { passwordProblem } from "../password-policy";
import { hasSecondFactor, setChallengeCookie, startChallenge } from "../two-factor";
import { sendSignupExistsEmail } from "../email";
import { finishSignIn } from "../sign-in";
import { isPasskeyConfigured, passkeyPolicyApplies } from "../passkeys";
import { parseOrThrow, runFormAction, ValidationError } from "./run";
import { signupAllowed } from "../queries/auth";
import { logError } from "../log";

/**
 * Signs in after the password: a user with a second factor (or whose church requires one) goes to
 * the code step (/autentificare/cod or the setup); the others are signed in at once. `trusted`: the
 * user is already signed in and has just confirmed the password (password change), so no code is asked.
 */
async function signInOrMessage(email: string, password: string, redirectTo: string, trusted = false): Promise<FormState | void> {
  const check = await checkPassword(email, password);
  if (!check.ok) {
    return {
      message:
        check.reason === "locked"
          ? "Contul a fost blocat temporar după încercări eșuate; reîncercați în 15 minute."
          : "Adresa de e-mail sau parola nu sunt corecte.",
      values: { email },
    };
  }
  const user = check.user;
  // A passkey is a second factor too (Face ID / fingerprint / screen PIN after the password).
  const hasPasskey = user._count.passkeys > 0 && isPasskeyConfigured();
  const needsCode = !trusted && (hasSecondFactor(user) || hasPasskey);
  const needsSetup = !trusted && !needsCode && user.church.require2fa;
  // Under the policy "parolă + Face ID / amprentă", a pastor or administrator without a passkey is sent
  // to register one right after this sign-in.
  const callbackUrl = !hasPasskey && passkeyPolicyApplies(user, user.church) && isPasskeyConfigured() ? "/cont?dispozitiv=necesar#dispozitive" : redirectTo;
  const token = await startChallenge(user.id, { verified: !needsCode && !needsSetup, setupRequired: needsSetup, callbackUrl });
  if (needsCode || needsSetup) {
    await setChallengeCookie(token);
    redirect(needsSetup ? "/autentificare/configurare" : "/autentificare/cod");
  }
  return finishSignIn(token, callbackUrl, email);
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { message: "Introduceți adresa de e-mail și parola.", values: { email } };
  }
  if (!(await hitIpLimit("login"))) return { message: IP_LIMIT_MESSAGE, values: { email } };
  return (await signInOrMessage(email, password, safeCallbackUrl(formData.get("callbackUrl")))) ?? {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/autentificare" });
}

/** "Deconectează-te de pe toate dispozitivele": every session of the user ends, this one too. */
export async function logoutEverywhereAction() {
  const me = await getCurrentUser();
  if (me) {
    await prisma.user.update({ where: { id: me.id }, data: { sessionVersion: { increment: 1 } } });
    await prisma.auditLog.create({
      data: { churchId: me.churchId, userId: me.id, userName: me.name, entity: "SECURITY", entityId: me.id, entityLabel: me.name, action: "UPDATE", changes: { sesiuni: "închise pe toate dispozitivele" } },
    });
  }
  await signOut({ redirectTo: "/autentificare" });
}

/** The neutral answer of the signup form for an address that already has an account. */
const SIGNUP_NEUTRAL = "Dacă adresa poate fi folosită, veți primi un e-mail.";

/**
 * Înregistrarea unei biserici noi, împreună cu primul administrator. An address that already has an
 * account gets the neutral answer (and, when e-mail is configured, a message to that account), so the
 * form does not reveal which addresses are registered.
 */
export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let credentials: { email: string; password: string } | undefined;
  const state = await runFormAction(formData, async () => {
    if (!(await signupAllowed())) {
      return { message: "Înregistrarea de biserici noi este dezactivată pe acest server." };
    }
    if (!(await hitIpLimit("signup"))) throw new ActionError(IP_LIMIT_MESSAGE);
    const data = parseOrThrow(signupSchema, Object.fromEntries(formData));
    const weak = passwordProblem(data.password, { email: data.email, name: data.name });
    if (weak) throw new ValidationError({ password: weak });
    const passwordHash = await hashPassword(data.password);
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { email: true, name: true } });
    if (existing) {
      after(async () => {
        await sendSignupExistsEmail({ to: existing.email, name: existing.name });
      });
      return { ok: true, message: SIGNUP_NEUTRAL };
    }
    await prisma.$transaction(async (tx) => {
      const slug = await uniqueChurchSlug(tx, data.churchName);
      const church = await tx.church.create({ data: { nume: data.churchName, slug } });
      const defaults = defaultRoleGroupsData(church.id, () => randomUUID());
      await tx.roleGroup.createMany({ data: defaults.groups });
      await tx.churchRole.createMany({ data: defaults.roles });
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
    const weak = passwordProblem(data.password, { email: invitation.email, name: data.name });
    if (weak) throw new ValidationError({ password: weak });
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

/**
 * "Forgot password": always the same neutral answer, so the page does not reveal which addresses
 * have an account. The lookup, the token and the e-mail run after the response (`after`).
 */
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(formData, async () => {
    const { email } = parseOrThrow(forgotPasswordSchema, Object.fromEntries(formData));
    if (!(await hitIpLimit("forgot"))) throw new ActionError(IP_LIMIT_MESSAGE);
    if (!passwordResetRequests.hit(email)) {
      throw new ActionError(
        `Prea multe cereri pentru această adresă. Încercați din nou peste ${RESET_REQUEST_WINDOW_MINUTES} minute.`,
      );
    }
    after(async () => {
      try {
        await requestPasswordReset(email);
      } catch (error) {
        logError("password-reset", error);
      }
    });
    return { ok: true, message: "Dacă adresa există, veți primi un e-mail.", values: { email } };
  });
}

/** Setarea unei parole noi pe baza unui link de resetare (trimis pe e-mail sau emis de administrator). */
export async function resetPasswordAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let credentials: { email: string; password: string } | undefined;
  const state = await runFormAction(formData, async () => {
    const data = parseOrThrow(newPasswordFields, Object.fromEntries(formData));
    const reset = await prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) {
      return { message: "Linkul de resetare nu mai este valabil. Cereți unul nou din pagina „Am uitat parola”." };
    }
    const weak = passwordProblem(data.password, reset.user);
    if (weak) throw new ValidationError({ password: weak });
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
    const weak = passwordProblem(data.password, user);
    if (weak) throw new ValidationError({ password: weak });
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await hashPassword(data.password), sessionVersion: { increment: 1 } },
    });
    credentials = { email: user.email, password: data.password };
  });
  if (!credentials) return state;
  return (await signInOrMessage(credentials.email, credentials.password, "/cont?parola=schimbata", true)) ?? {};
}
