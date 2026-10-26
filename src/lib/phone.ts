/**
 * A register phone number in the international form WhatsApp's wa.me links need: digits only, with
 * the country code and no "+" or "00". Pure.
 *
 * - 8 digits (a Norwegian number written locally) → 47 + the number;
 * - +47 / 0047 → 47…;
 * - +40 / 0040, or a Romanian mobile written locally (07…, 10 digits) → 40…;
 * - any other +<code> / 00<code> is kept as it is.
 *
 * Anything else (too short, too long, letters, a local number of another length) gives null.
 */
export function internationalPhone(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || /[^\d\s+().\-/]/.test(s)) return null;
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  if (plus && s.indexOf("+", 1) !== -1) return null;
  let intl: string;
  if (plus) intl = digits;
  else if (digits.startsWith("00")) intl = digits.slice(2);
  else if (/^\d{8}$/.test(digits)) intl = `47${digits}`;
  else if (/^07\d{8}$/.test(digits)) intl = `40${digits.slice(1)}`;
  else return null;
  // E.164: a country code that does not start with 0, at most 15 digits; at least 8 for a usable number.
  return /^[1-9]\d{7,14}$/.test(intl) ? intl : null;
}

/** "Trimite pe WhatsApp" to one person: their number and the ready text, or null without a valid number. */
export function whatsappDirectUrl(phone: string | null | undefined, text: string): string | null {
  const n = internationalPhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
