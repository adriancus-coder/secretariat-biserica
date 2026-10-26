import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM under a key derived (HKDF-SHA256) from a base secret (AUTH_SECRET) and a purpose,
 * the same derivation as the TOTP secrets (src/server/two-factor.ts). No `server-only` import, so
 * the re-encryption script for an AUTH_SECRET rotation (scripts/reencrypt-secrets.ts) can use it.
 */
export function deriveKey(base: string, info: string): Buffer {
  if (!base) throw new Error("AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", base, "secretariat-biserica", info, 32));
}

/** "v1.<iv>.<tag>.<ciphertext>" (base64url). */
export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

/** The plain text; throws on another key, a changed ciphertext or an unknown format. */
export function unseal(key: Buffer, enc: string): string {
  const [v, iv, tag, ct] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("unknown format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** The purposes of the keys derived from AUTH_SECRET for data stored encrypted. */
export const KEY_INFO = { totp: "totp-secret-v1", pastoralNote: "pastoral-note-v1" } as const;
