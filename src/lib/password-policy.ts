/** Password rules that need no list (shared by the forms and the server). Pure. */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The password contains the e-mail (or its part before @) or a part of the name (3+ letters). */
export function containsPersonalData(password: string, p: { email?: string; name?: string }): boolean {
  const pw = fold(password);
  const email = fold(p.email ?? "").trim();
  const local = email.split("@")[0] ?? "";
  const parts = [email, local, ...fold(p.name ?? "").split(/[^a-z0-9]+/)].filter((x) => x.length >= 3);
  return parts.some((x) => pw.includes(x));
}
