import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { hashToken } from "./tokens";

/**
 * Tokens of the data-update campaign are never stored. A personal link's token is an HMAC of the
 * link id and its random nonce (and the general link's of the campaign id and its nonce), under a key
 * derived from AUTH_SECRET; the database keeps only the nonce and the sha256 of the token. So the
 * secretary can copy a link again, a database copy alone cannot rebuild it, and a new nonce revokes it.
 *
 * The 30-minute "identity confirmed" state of the public form is a cookie: for a personal link an
 * HMAC-signed value bound to the link; for the general link an AES-256-GCM encrypted value (it holds
 * the typed name and phone, which must not be readable in the browser).
 */

function key(info: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing");
  return Buffer.from(hkdfSync("sha256", secret, "secretariat-biserica", info, 32));
}

export const newNonce = () => randomBytes(16).toString("base64url");

/** The token of a personal link (43 characters, URL-safe). */
export function linkToken(linkId: string, nonce: string): string {
  return createHmac("sha256", key("campaign-link-v1")).update(`link.${linkId}.${nonce}`).digest("base64url");
}

/** The token of a campaign's general link. */
export function generalToken(campaignId: string, nonce: string): string {
  return createHmac("sha256", key("campaign-link-v1")).update(`general.${campaignId}.${nonce}`).digest("base64url");
}

export { hashToken };

/** A syntactically valid token (base64url, 43 characters): anything else is not looked up. */
export const isTokenShape = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

export const IDENTITY_SECONDS = 30 * 60;
export const identityCookieName = (scope: "p" | "g", id: string) => `du_${scope}_${id.slice(0, 32)}`;

/** Personal link: "identity confirmed" for this link, signed, 30 minutes. */
export function personalIdentityValue(linkId: string, nonce: string, now = Date.now()): string {
  const payload = `${linkId}.${nonce}.${Math.floor(now / 1000) + IDENTITY_SECONDS}`;
  const mac = createHmac("sha256", key("campaign-identity-v1")).update(payload).digest("base64url");
  return `${Math.floor(now / 1000) + IDENTITY_SECONDS}.${mac}`;
}

export function hasPersonalIdentity(value: string | undefined, linkId: string, nonce: string, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, mac] = value.split(".");
  if (!exp || !mac || Number(exp) * 1000 < now) return false;
  const expected = createHmac("sha256", key("campaign-identity-v1")).update(`${linkId}.${nonce}.${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface GeneralIdentity {
  campaignId: string;
  nume: string;
  telefon: string;
  exp: number;
}

/** General link: the typed name and phone, encrypted, 30 minutes (matched against the register only on submit). */
export function sealGeneralIdentity(campaignId: string, nume: string, telefon: string, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("campaign-general-v1"), iv);
  const body = JSON.stringify({ campaignId, nume, telefon, exp: Math.floor(now / 1000) + IDENTITY_SECONDS } satisfies GeneralIdentity);
  const enc = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function openGeneralIdentity(value: string | undefined, campaignId: string, now = Date.now()): GeneralIdentity | null {
  if (!value) return null;
  try {
    const [iv, tag, enc] = value.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key("campaign-general-v1"), iv);
    decipher.setAuthTag(tag);
    const g = JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")) as GeneralIdentity;
    return g.campaignId === campaignId && g.exp * 1000 >= now ? g : null;
  } catch {
    return null;
  }
}
