import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hash-uri de parolă cu scrypt (node:crypto), parametri conform recomandărilor OWASP
 * (N=2^15, r=8, p=3 ≈ 32 MiB). Format stocat: `scrypt$N$r$p$salt$hash` (base64).
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 32;
const MAX_MEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function normalize(password: string) {
  return password.normalize("NFKC");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(normalize(password), salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P) || expected.length === 0) return false;
  const actual = await scrypt(normalize(password), Buffer.from(saltB64, "base64"), expected.length, {
    N,
    r: R,
    p: P,
    maxmem: MAX_MEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Adevărat dacă hash-ul a fost creat cu alți parametri decât cei actuali (se recalculează la login). */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  return !(parts[0] === "scrypt" && Number(parts[1]) === PARAMS.N && Number(parts[2]) === PARAMS.r && Number(parts[3]) === PARAMS.p);
}

/** Un hash fictiv, folosit pentru a egaliza timpul de răspuns când utilizatorul nu există. */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("parola-fictiva-pentru-timp-constant");
  await verifyPassword(password, await dummyHash);
}
