/**
 * Church slugs: the public address of the membership application form, /cerere/<slug>.
 * The backfill in prisma/migrations/*_applications mirrors slugify() and slugVariant() in SQL;
 * keep the two in sync.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Letters that NFD does not decompose into an ASCII letter plus combining marks. */
const EXTRA_LETTERS: Record<string, string> = {
  ß: "ss",
  ẞ: "ss",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  þ: "th",
  Þ: "th",
  ø: "o",
  Ø: "o",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  ł: "l",
  Ł: "l",
  ı: "i",
};
const EXTRA_RE = new RegExp(`[${Object.keys(EXTRA_LETTERS).join("")}]`, "g");

/** "Biserica Maranata Ștei" → "biserica-maranata-stei"; always 3–40 characters matching SLUG_PATTERN. */
export function slugify(name: string): string {
  let s = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(EXTRA_RE, (c) => EXTRA_LETTERS[c]).toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX) s = s.slice(0, SLUG_MAX).replace(/-+$/, "");
  if (!s) return "biserica";
  return s.length < SLUG_MIN ? `biserica-${s}` : s;
}

/** The variant tried when `base` is taken: base-2, base-3, … (still at most SLUG_MAX characters). */
export function slugVariant(base: string, n: number): string {
  const suffix = `-${n}`;
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
}

export function isValidSlug(value: string): boolean {
  return value.length >= SLUG_MIN && value.length <= SLUG_MAX && SLUG_PATTERN.test(value);
}
