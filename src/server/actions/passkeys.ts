"use server";

import { redirect } from "next/navigation";
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { FormState } from "@/lib/form-state";
import { safeCallbackUrl } from "@/lib/schemas/auth";
import { confirmPasswordSchema } from "@/lib/schemas/two-factor";
import { idSchema } from "@/lib/validation";
import { prisma } from "../db";
import { clientIp, hitIpLimit, IP_LIMIT_MESSAGE } from "../ip-limits";
import {
  assertionOptions,
  hitPasskeyLimit,
  PasskeyError,
  passkeyPolicyApplies,
  PURPOSE,
  registrationOptions,
  verifyAssertion,
  verifyRegistration,
  verifyUserPresence,
} from "../passkeys";
import { verifyPassword } from "../password";
import { getCurrentUser } from "../session";
import { finishSignIn } from "../sign-in";
import { grantStepUp } from "../step-up";
import { clearChallengeCookie, currentChallenge, startChallenge } from "../two-factor";

export type OptionsResult<T> = { options: T } | { error: string };

async function securityAudit(user: { id: string; churchId: string; name: string }, changes: Record<string, string>) {
  await prisma.auditLog.create({
    data: { churchId: user.churchId, userId: user.id, userName: user.name, entity: "SECURITY", entityId: user.id, entityLabel: user.name, action: "UPDATE", changes },
  });
}

const message = (e: unknown) => (e instanceof PasskeyError ? e.message : "Confirmarea pe dispozitiv nu a reușit. Încercați din nou.");

async function me() {
  const current = await getCurrentUser();
  if (!current) redirect("/autentificare");
  return current;
}

async function passwordOk(userId: string, raw: unknown): Promise<boolean> {
  const parsed = confirmPasswordSchema.safeParse(raw);
  if (!parsed.success) return false;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  return verifyPassword(parsed.data, user.passwordHash);
}

// ---------- Cont → Securitate: devices ----------

/** "Adaugă acest dispozitiv", step 1: the password, then the registration options. */
export async function passkeyRegistrationOptionsAction(password: string): Promise<OptionsResult<PublicKeyCredentialCreationOptionsJSON>> {
  const user = await me();
  if (!(await passwordOk(user.id, password))) return { error: "Parola nu este corectă." };
  try {
    return { options: await registrationOptions(user) };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Step 2: the device's answer; the passkey is saved under the given name. */
export async function passkeyRegisterAction(response: RegistrationResponseJSON, deviceName: string): Promise<FormState> {
  const user = await me();
  try {
    const passkey = await verifyRegistration(user.id, response, String(deviceName ?? ""));
    await securityAudit(user, { dispozitiv: `adăugat: ${passkey.deviceName}` });
    return { ok: true, message: "Dispozitivul a fost adăugat." };
  } catch (e) {
    return { message: message(e) };
  }
}

/** "Elimină" (password again); the last passkey stays while the church policy requires one. */
export async function removePasskeyAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await me();
  if (!idSchema.safeParse(id).success) return { message: "Dispozitiv necunoscut." };
  if (!(await passwordOk(user.id, formData.get("parola")))) return { message: "Parola nu este corectă." };
  const passkey = await prisma.userPasskey.findFirst({ where: { id, userId: user.id } });
  if (!passkey) return { message: "Dispozitivul nu mai există." };
  const church = await prisma.church.findUniqueOrThrow({ where: { id: user.churchId }, select: { passkeyPolicy: true } });
  if (passkeyPolicyApplies(user, church) && (await prisma.userPasskey.count({ where: { userId: user.id } })) === 1) {
    return { message: "Biserica cere intrarea cu parolă + Face ID / amprentă: adăugați întâi alt dispozitiv." };
  }
  await prisma.userPasskey.delete({ where: { id: passkey.id } });
  await securityAudit(user, { dispozitiv: `eliminat: ${passkey.deviceName}` });
  return { ok: true, message: "Dispozitivul a fost eliminat." };
}

// ---------- Confirmations while signed in ----------

/** Options for a confirmation on the device: step-up, a saved signature, signing a document. */
export async function presenceOptionsAction(purpose: string): Promise<OptionsResult<PublicKeyCredentialRequestOptionsJSON>> {
  const user = await me();
  const allowed = purpose === PURPOSE.stepUp || purpose === PURPOSE.savedSignature || /^semnatura:[A-Za-z0-9_-]{1,64}$/.test(purpose);
  if (!allowed) return { error: "Confirmare necunoscută." };
  try {
    return { options: await assertionOptions(user.id, purpose) };
  } catch (e) {
    return { error: message(e) };
  }
}

/** The step-up: a device confirmation (or the password when the user has no passkey) for 15 minutes. */
export async function confirmStepUpAction(input: { response?: AuthenticationResponseJSON; password?: string }): Promise<FormState> {
  const user = await me();
  if (input.response) {
    try {
      await verifyUserPresence(user, PURPOSE.stepUp, input.response);
    } catch (e) {
      return { message: message(e) };
    }
  } else {
    if (!hitPasskeyLimit(`user:${user.id}`)) return { message: "Prea multe încercări. Încercați din nou peste câteva minute." };
    if ((await prisma.userPasskey.count({ where: { userId: user.id } })) > 0) return { message: "Confirmați cu Face ID / amprenta dispozitivului." };
    if (!(await passwordOk(user.id, input.password))) return { message: "Parola nu este corectă." };
    await securityAudit(user, { confirmare: "confirmare cu parola" });
  }
  await grantStepUp(user);
  return { ok: true };
}

// ---------- Sign-in ----------

/** "Intră cu Face ID / amprentă": options for a discoverable credential (no e-mail typed). */
export async function loginPasskeyOptionsAction(): Promise<OptionsResult<PublicKeyCredentialRequestOptionsJSON>> {
  if (!(await hitIpLimit("login"))) return { error: IP_LIMIT_MESSAGE };
  try {
    return { options: await assertionOptions(null, PURPOSE.login) };
  } catch (e) {
    return { error: message(e) };
  }
}

/**
 * The passkey-only sign-in: possession and user verification, so it counts as two factors and
 * satisfies the church's 2FA requirement. Refused for pastors and administrators under the policy
 * "parolă + Face ID / amprentă".
 */
export async function loginPasskeyAction(response: AuthenticationResponseJSON, callbackUrl: string): Promise<FormState> {
  if (!hitPasskeyLimit(`ip:${await clientIp()}`)) return { message: IP_LIMIT_MESSAGE };
  let userId: string;
  try {
    userId = (await verifyAssertion(response, PURPOSE.login, null)).userId;
  } catch (e) {
    return { message: message(e) };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { church: { select: { passkeyPolicy: true } } } });
  if (!user || !user.active) return { message: "Autentificarea a eșuat. Încercați din nou." };
  if (passkeyPolicyApplies(user, user.church)) {
    return { message: "Pentru contul dumneavoastră biserica cere parola, apoi Face ID / amprenta. Introduceți e-mailul și parola." };
  }
  await securityAudit(user, { intrare: "cu Face ID / amprentă" });
  const token = await startChallenge(user.id, { verified: true, setupRequired: false, callbackUrl: safeCallbackUrl(callbackUrl) });
  return (await finishSignIn(token, safeCallbackUrl(callbackUrl), user.email)) ?? {};
}

/** The second step after the password: options bound to the challenge's user. */
export async function secondFactorPasskeyOptionsAction(): Promise<OptionsResult<PublicKeyCredentialRequestOptionsJSON>> {
  const challenge = await currentChallenge();
  if (!challenge || challenge.setupRequired) return { error: "Sesiunea de autentificare a expirat. Reîncepeți." };
  try {
    return { options: await assertionOptions(challenge.user.id, PURPOSE.secondFactor) };
  } catch (e) {
    return { error: message(e) };
  }
}

/** "Confirmă cu Face ID / amprentă" in the code step. */
export async function secondFactorPasskeyAction(response: AuthenticationResponseJSON): Promise<FormState> {
  const challenge = await currentChallenge();
  if (!challenge || challenge.setupRequired) redirect("/autentificare?expirat=1");
  const user = challenge.user;
  if (!hitPasskeyLimit(`user:${user.id}`)) return { message: "Prea multe încercări. Încercați din nou peste câteva minute." };
  try {
    await verifyAssertion(response, PURPOSE.secondFactor, user.id);
  } catch (e) {
    return { message: message(e) };
  }
  await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date(), emailCodeHash: null } });
  await clearChallengeCookie();
  return (await finishSignIn(challenge.token, challenge.callbackUrl, user.email)) ?? {};
}
