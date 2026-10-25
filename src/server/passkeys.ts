import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "./db";
import { sharedRateLimiter } from "./rate-limit";
import { hashToken } from "./tokens";

/**
 * Passkeys (WebAuthn): the device's own unlock — Face ID, fingerprint or the screen PIN — for sign-in,
 * as a second factor and to confirm sensitive steps. Only the credential's public key and counter are
 * stored; no biometric data ever reaches the server. Every assertion needs a server-issued challenge
 * (stored hashed, single use, 2 minutes) bound to its purpose and, except for the passkey-only sign-in,
 * to the user; user verification (UV) is required, the counter must not go backwards, and the origin
 * and RP ID must be APP_URL's.
 */

export const CHALLENGE_SECONDS = 120;
export const PURPOSE = {
  register: "inregistrare",
  login: "login",
  secondFactor: "login-factor-2",
  stepUp: "confirmare",
  savedSignature: "semnatura-salvata",
  signDocument: (documentId: string) => `semnatura:${documentId}`,
} as const;

export class PasskeyError extends Error {}

/** RP ID (APP_URL's host) and expected origin (APP_URL); null when APP_URL is missing or invalid. */
export function relyingParty(): { rpID: string; origin: string; rpName: string } | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return { rpID: url.hostname, origin: url.origin, rpName: "Secretariat Biserică" };
  } catch {
    return null;
  }
}

export const isPasskeyConfigured = () => relyingParty() !== null;

function rpOrThrow() {
  const rp = relyingParty();
  if (!rp) throw new PasskeyError("Confirmarea pe dispozitiv nu este configurată pentru această aplicație.");
  return rp;
}

/** 10 assertions per user (or per IP for the passkey-only sign-in) per 15 minutes. */
const limiter = () => sharedRateLimiter("passkey-assertions", { limit: 10, windowMs: 15 * 60_000 });
export function hitPasskeyLimit(key: string): boolean {
  return limiter().hit(key);
}

async function storeChallenge(challenge: string, purpose: string, userId: string | null) {
  // Expired challenges are cleaned up as new ones are issued.
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.webAuthnChallenge.create({
    data: { challengeHash: hashToken(challenge), purpose, userId, expiresAt: new Date(Date.now() + CHALLENGE_SECONDS * 1000) },
  });
}

/** The challenge the browser signed, read from clientDataJSON (base64url JSON). */
function signedChallenge(clientDataJSON: string): string | null {
  try {
    const data = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as { challenge?: unknown };
    return typeof data.challenge === "string" ? data.challenge : null;
  } catch {
    return null;
  }
}

/** Consumes the challenge once: it must exist, be unexpired and match the purpose and the user. */
async function consumeChallenge(challenge: string, purpose: string, userId: string | null): Promise<boolean> {
  const row = await prisma.webAuthnChallenge.findUnique({ where: { challengeHash: hashToken(challenge) } });
  if (!row) return false;
  // Deleted whatever the outcome: a challenge is never used twice.
  const { count } = await prisma.webAuthnChallenge.deleteMany({ where: { id: row.id } });
  if (count !== 1 || row.expiresAt < new Date() || row.purpose !== purpose) return false;
  return userId === null ? row.userId === null : row.userId === userId;
}

// ---------- Registration ----------

export async function registrationOptions(user: { id: string; email: string; name: string }): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const rp = rpOrThrow();
  const existing = await prisma.userPasskey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    timeout: CHALLENGE_SECONDS * 1000,
  });
  await storeChallenge(options.challenge, PURPOSE.register, user.id);
  return options;
}

export async function verifyRegistration(userId: string, response: RegistrationResponseJSON, deviceName: string) {
  const rp = rpOrThrow();
  const challenge = signedChallenge(response?.response?.clientDataJSON ?? "");
  if (!challenge || !(await consumeChallenge(challenge, PURPOSE.register, userId))) throw new PasskeyError("Cererea a expirat. Încercați din nou.");
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new PasskeyError("Dispozitivul nu a putut fi înregistrat.");
  }
  if (!result.verified) throw new PasskeyError("Dispozitivul nu a putut fi înregistrat.");
  const { credential, credentialBackedUp } = result.registrationInfo;
  return prisma.userPasskey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? response.response.transports ?? [],
      deviceName: deviceName.trim().slice(0, 60) || "Dispozitiv",
      backedUp: credentialBackedUp,
    },
  });
}

// ---------- Assertions ----------

/** Options for an assertion: bound to `userId` (its passkeys allowed) or, for the passkey-only sign-in, to nobody. */
export async function assertionOptions(userId: string | null, purpose: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const rp = rpOrThrow();
  const allow = userId ? await prisma.userPasskey.findMany({ where: { userId }, select: { credentialId: true, transports: true } }) : [];
  if (userId && !allow.length) throw new PasskeyError("Nu aveți niciun dispozitiv înregistrat.");
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    userVerification: "required",
    allowCredentials: allow.map((c) => ({ id: c.credentialId, transports: c.transports })),
    timeout: CHALLENGE_SECONDS * 1000,
  });
  await storeChallenge(options.challenge, purpose, userId);
  return options;
}

/**
 * Verifies an assertion for `purpose`. `userId`: the expected user (null for the passkey-only sign-in,
 * which identifies the user by the credential). Returns the user and the passkey used, or throws.
 */
export async function verifyAssertion(response: AuthenticationResponseJSON, purpose: string, userId: string | null) {
  const rp = rpOrThrow();
  const challenge = signedChallenge(response?.response?.clientDataJSON ?? "");
  if (!challenge || !(await consumeChallenge(challenge, purpose, userId))) throw new PasskeyError("Confirmarea a expirat sau nu este valabilă. Încercați din nou.");
  const passkey = await prisma.userPasskey.findUnique({ where: { credentialId: String(response.id ?? "") } });
  if (!passkey || (userId !== null && passkey.userId !== userId)) throw new PasskeyError("Dispozitivul nu este înregistrat pentru acest cont.");
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: { id: passkey.credentialId, publicKey: new Uint8Array(passkey.publicKey), counter: passkey.counter, transports: passkey.transports },
    });
  } catch {
    // Includes a counter that went backwards (a possibly cloned authenticator) and a missing UV flag.
    throw new PasskeyError("Confirmarea pe dispozitiv nu a reușit.");
  }
  if (!result.verified || !result.authenticationInfo.userVerified) throw new PasskeyError("Confirmarea pe dispozitiv nu a reușit.");
  await prisma.userPasskey.update({ where: { id: passkey.id }, data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() } });
  return { userId: passkey.userId, passkey };
}

/**
 * Confirms that the user is present on one of their devices for `purpose` (sign a document, save a
 * signature, step-up), rate limited per user, audited with the device name only.
 */
export async function verifyUserPresence(user: { id: string; churchId: string; name: string }, purpose: string, response: AuthenticationResponseJSON) {
  if (!hitPasskeyLimit(`user:${user.id}`)) throw new PasskeyError("Prea multe confirmări într-un timp scurt. Încercați din nou peste câteva minute.");
  const { passkey } = await verifyAssertion(response, purpose, user.id);
  await prisma.auditLog.create({
    data: {
      churchId: user.churchId,
      userId: user.id,
      userName: user.name,
      entity: "SECURITY",
      entityId: user.id,
      entityLabel: user.name,
      action: "UPDATE",
      changes: { confirmare: `confirmare pe dispozitiv: ${passkey.deviceName}`, scop: purpose.split(":")[0] },
    },
  });
  return passkey;
}

/** Does the policy "parolă + Face ID / amprentă" apply to this user (pastor or administrator)? */
export function passkeyPolicyApplies(user: { role: string; isPastor: boolean }, church: { passkeyPolicy: boolean }): boolean {
  return church.passkeyPolicy && (user.isPastor || user.role === "ADMIN");
}
