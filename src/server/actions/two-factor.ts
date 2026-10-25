"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";
import type { FormState } from "@/lib/form-state";
import { prisma } from "../db";
import { isEmailConfigured, sendLoginCodeEmail } from "../email";
import { verifyPassword } from "../password";
import { getCurrentUser } from "../session";
import { finishSignIn } from "../sign-in";
import { hitIpLimit, IP_LIMIT_MESSAGE } from "../ip-limits";
import { otpauthUrl, newTotpSecret, verifyTotp } from "../totp";
import {
  clearChallengeCookie,
  currentChallenge,
  decryptSecret,
  EMAIL_CODE_MINUTES,
  encryptSecret,
  hasSecondFactor,
  looksLikeRecoveryCode,
  MAX_CODE_ATTEMPTS,
  newEmailCode,
  newRecoveryCodes,
  safeEqual,
  spendRecoveryCode,
} from "../two-factor";
import { hashToken } from "../tokens";

export interface TwoFactorState extends FormState {
  /** Shown once, right after they are created. */
  recoveryCodes?: string[];
  /** TOTP setup: the QR code (SVG) and the secret to type by hand. */
  qrSvg?: string;
  secret?: string;
}

/** An audit entry about account security (no session yet at login, so written directly). */
async function securityAudit(user: { id: string; churchId: string; name: string }, label: string, changes: Record<string, string>) {
  await prisma.auditLog.create({
    data: { churchId: user.churchId, userId: user.id, userName: user.name, entity: "SECURITY", entityId: user.id, entityLabel: label, action: "UPDATE", changes },
  });
}

const issuer = (churchName: string) => `Secretariat ${churchName}`.slice(0, 60);

async function qrFor(secret: string, email: string, churchName: string): Promise<string> {
  return QRCode.toString(otpauthUrl(secret, email, issuer(churchName)), { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" });
}

// ---------- At login: the code step ----------

/** "Confirmă": a TOTP code, an e-mail code or a recovery code. Five wrong codes end the attempt. */
export async function verifyLoginCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const challenge = await currentChallenge();
  if (!challenge || challenge.setupRequired) redirect("/autentificare?expirat=1");
  const user = challenge.user;
  const code = String(formData.get("cod") ?? "").trim();
  if (!code) return { message: "Introduceți codul." };
  if (!(await hitIpLimit("code"))) return { message: IP_LIMIT_MESSAGE };

  let ok = false;
  let usedRecovery = false;
  if (user.totpEnabled && user.totpSecretEnc && /^\d{6}$/.test(code.replace(/\s/g, ""))) {
    const step = verifyTotp(decryptSecret(user.totpSecretEnc), code, { lastStep: user.totpLastStep });
    if (step !== null) {
      ok = true;
      await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    }
  }
  if (!ok && challenge.emailCodeHash && challenge.emailCodeExpiresAt && challenge.emailCodeExpiresAt > new Date()) {
    if (safeEqual(challenge.emailCodeHash, hashToken(code.replace(/\s/g, "")))) ok = true;
  }
  if (!ok && looksLikeRecoveryCode(code)) {
    const left = spendRecoveryCode(user.recoveryCodes, code);
    if (left) {
      ok = true;
      usedRecovery = true;
      await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: left } });
      await securityAudit(user, user.name, { codRecuperare: "folosit", coduriRamase: String(left.length) });
    }
  }

  if (!ok) {
    const attempts = challenge.attempts + 1;
    await securityAudit(user, user.name, { codGresit: `${attempts} din ${MAX_CODE_ATTEMPTS}` });
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await prisma.loginChallenge.deleteMany({ where: { id: challenge.id } });
      await clearChallengeCookie();
      redirect("/autentificare?coduri=1");
    }
    await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { attempts } });
    return { message: `Cod greșit. Mai aveți ${MAX_CODE_ATTEMPTS - attempts} ${MAX_CODE_ATTEMPTS - attempts === 1 ? "încercare" : "încercări"}.` };
  }

  // The e-mail code works once.
  await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date(), emailCodeHash: null } });
  await clearChallengeCookie();
  const callback = usedRecovery && user.recoveryCodes.length <= 3 ? "/cont?recuperare=putine" : challenge.callbackUrl;
  return (await finishSignIn(challenge.token, callback, user.email)) ?? {};
}

/** "Trimite codul pe e-mail" (at most one per minute). Also used to confirm the e-mail method at setup. */
export async function sendLoginEmailCodeAction(): Promise<FormState> {
  const challenge = await currentChallenge();
  if (!challenge) redirect("/autentificare?expirat=1");
  const user = challenge.user;
  if (!isEmailConfigured() || (!user.emailOtpEnabled && !challenge.setupRequired)) return { message: "Codul pe e-mail nu este disponibil pentru acest cont." };
  if (challenge.emailCodeExpiresAt && challenge.emailCodeExpiresAt.getTime() - Date.now() > (EMAIL_CODE_MINUTES - 1) * 60_000) {
    return { message: "Un cod a fost trimis acum câteva secunde. Verificați e-mailul sau încercați din nou peste un minut." };
  }
  const { code, hash } = newEmailCode();
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: { emailCodeHash: hash, emailCodeExpiresAt: new Date(Date.now() + EMAIL_CODE_MINUTES * 60_000) },
  });
  const sent = await sendLoginCodeEmail({ to: user.email, code, churchName: user.church.nume, validMinutes: EMAIL_CODE_MINUTES });
  return sent === "sent"
    ? { ok: true, message: "Codul a fost trimis la adresa contului." }
    : { message: "Codul nu a putut fi trimis. Folosiți aplicația de autentificare sau un cod de recuperare." };
}

// ---------- At login: setup required by the church ----------

/** The QR code for the setup page (a pending secret, saved on the user until confirmed). */
export async function startSetupTotpAction(): Promise<TwoFactorState> {
  const challenge = await currentChallenge();
  if (!challenge?.setupRequired) redirect("/autentificare?expirat=1");
  const secret = newTotpSecret();
  await prisma.user.update({ where: { id: challenge.user.id }, data: { totpSecretEnc: encryptSecret(secret), totpEnabled: false } });
  return { ok: true, secret, qrSvg: await qrFor(secret, challenge.user.email, challenge.user.church.nume) };
}

/** Confirms the setup with a code from the app (method "totp") or from the e-mail (method "email"). */
export async function confirmSetupAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const challenge = await currentChallenge();
  if (!challenge?.setupRequired) redirect("/autentificare?expirat=1");
  const user = challenge.user;
  const method = formData.get("metoda") === "email" ? "email" : "totp";
  const code = String(formData.get("cod") ?? "").replace(/\s/g, "");
  let data: { totpEnabled?: boolean; totpLastStep?: number; emailOtpEnabled?: boolean } | null = null;
  if (method === "totp" && user.totpSecretEnc) {
    const step = verifyTotp(decryptSecret(user.totpSecretEnc), code);
    if (step !== null) data = { totpEnabled: true, totpLastStep: step };
  } else if (method === "email" && challenge.emailCodeHash && challenge.emailCodeExpiresAt && challenge.emailCodeExpiresAt > new Date()) {
    if (safeEqual(challenge.emailCodeHash, hashToken(code))) data = { emailOtpEnabled: true };
  }
  if (!data) {
    await securityAudit(user, user.name, { codGresit: "la configurare" });
    return { message: "Codul nu este corect. Încercați din nou.", qrSvg: _prev.qrSvg, secret: _prev.secret };
  }
  const recovery = newRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { ...data, recoveryCodes: recovery.hashes } });
  await prisma.loginChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date(), setupRequired: false, emailCodeHash: null } });
  await securityAudit(user, user.name, { doiFactori: method === "totp" ? "aplicație activată" : "cod pe e-mail activat", coduriRecuperare: "generate" });
  return { ok: true, recoveryCodes: recovery.codes };
}

/** "Continuă" after the recovery codes were shown. */
export async function finishSetupAction(): Promise<FormState> {
  const challenge = await currentChallenge();
  if (!challenge?.verifiedAt) redirect("/autentificare?expirat=1");
  await clearChallengeCookie();
  return (await finishSignIn(challenge.token, challenge.callbackUrl, challenge.user.email)) ?? {};
}

// ---------- Cont → Securitate ----------

async function accountUser(formData: FormData) {
  const current = await getCurrentUser();
  if (!current) redirect("/autentificare");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id }, include: { church: { select: { nume: true, require2fa: true } } } });
  const password = String(formData.get("parola") ?? "");
  if (!password || !(await verifyPassword(password, user.passwordHash))) return { user, error: "Parola nu este corectă." };
  return { user, error: null };
}

/** Step 1 of the app setup: password, then the QR code and the secret. */
export async function startTotpAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const { user, error } = await accountUser(formData);
  if (error) return { message: error };
  const secret = newTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecretEnc: encryptSecret(secret), totpEnabled: false } });
  return { ok: true, secret, qrSvg: await qrFor(secret, user.email, user.church.nume) };
}

/** Step 2: the first code from the app turns it on (and creates recovery codes if there are none). */
export async function confirmTotpAction(prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const current = await getCurrentUser();
  if (!current) redirect("/autentificare");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id } });
  const step = user.totpSecretEnc ? verifyTotp(decryptSecret(user.totpSecretEnc), String(formData.get("cod") ?? "")) : null;
  if (step === null) return { ...prev, ok: false, message: "Codul nu este corect. Verificați ora telefonului și încercați din nou." };
  const recovery = user.recoveryCodes.length ? null : newRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true, totpLastStep: step, ...(recovery ? { recoveryCodes: recovery.hashes } : {}) } });
  await securityAudit(user, user.name, { doiFactori: "aplicație activată", ...(recovery ? { coduriRecuperare: "generate" } : {}) });
  return { ok: true, message: "Aplicația de autentificare este activă.", recoveryCodes: recovery?.codes };
}

async function refuseIfLast(user: { totpEnabled: boolean; emailOtpEnabled: boolean; church: { require2fa: boolean } }, leaving: "totp" | "email") {
  const left = leaving === "totp" ? user.emailOtpEnabled : user.totpEnabled;
  return user.church.require2fa && !left ? "Biserica cere autentificarea în doi pași: activați întâi cealaltă metodă." : null;
}

export async function disableTotpAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const { user, error } = await accountUser(formData);
  if (error) return { message: error };
  const refused = await refuseIfLast(user, "totp");
  if (refused) return { message: refused };
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null } });
  await securityAudit(user, user.name, { doiFactori: "aplicație dezactivată" });
  return { ok: true, message: "Aplicația de autentificare a fost dezactivată." };
}

export async function setEmailOtpAction(enable: boolean, _prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const { user, error } = await accountUser(formData);
  if (error) return { message: error };
  if (enable && !isEmailConfigured()) return { message: "Trimiterea pe e-mail nu este configurată; folosiți aplicația de autentificare." };
  if (!enable) {
    const refused = await refuseIfLast(user, "email");
    if (refused) return { message: refused };
  }
  const recovery = enable && !user.recoveryCodes.length ? newRecoveryCodes() : null;
  await prisma.user.update({ where: { id: user.id }, data: { emailOtpEnabled: enable, ...(recovery ? { recoveryCodes: recovery.hashes } : {}) } });
  await securityAudit(user, user.name, { doiFactori: enable ? "cod pe e-mail activat" : "cod pe e-mail dezactivat" });
  return { ok: true, message: enable ? "Codul pe e-mail este activ." : "Codul pe e-mail a fost dezactivat.", recoveryCodes: recovery?.codes };
}

export async function regenerateRecoveryCodesAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const { user, error } = await accountUser(formData);
  if (error) return { message: error };
  if (!hasSecondFactor(user)) return { message: "Activați întâi o metodă de autentificare în doi pași." };
  const recovery = newRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: recovery.hashes } });
  await securityAudit(user, user.name, { coduriRecuperare: "regenerate" });
  return { ok: true, message: "Codurile vechi nu mai sunt valabile.", recoveryCodes: recovery.codes };
}
