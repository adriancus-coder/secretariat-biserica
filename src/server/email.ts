import "server-only";
import { Resend } from "resend";

export const DEFAULT_EMAIL_FROM = "Secretariat Biserică <secretariat@sanctuaryvoice.com>";

/** The admin waits for the send in the UI; after this the link is still shown for manual sending. */
const SEND_TIMEOUT_MS = 10_000;

/** Outcome of a send. The senders never throw; callers decide what to tell the user. */
export type EmailResult = "sent" | "disabled" | "failed";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface EmailConfig {
  apiKey: string;
  from: string;
  appUrl: URL;
}

function parseAppUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * E-mail is on when RESEND_API_KEY and a valid APP_URL are set. Links in e-mails are built only
 * from APP_URL, never from request headers: a forged Host header must not reach a reset e-mail.
 */
function emailConfig(): EmailConfig | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const appUrl = parseAppUrl(process.env.APP_URL);
  if (!apiKey || !appUrl) return null;
  return { apiKey, appUrl, from: process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM };
}

export function isEmailConfigured(): boolean {
  return emailConfig() !== null;
}

let warnedDisabled = false;

function disabled(): EmailResult {
  if (!warnedDisabled) {
    warnedDisabled = true;
    console.warn("[email] sending is disabled: set RESEND_API_KEY and APP_URL to enable it");
  }
  return "disabled";
}

let cachedClient: { apiKey: string; client: Resend } | undefined;

function resendClient(apiKey: string): Resend {
  if (cachedClient?.apiKey !== apiKey) cachedClient = { apiKey, client: new Resend(apiKey) };
  return cachedClient.client;
}

/** Keeps tokens out of the logs, even when an error message echoes the request. */
function redact(message: string, secret: string): string {
  return message.split(secret).join("[redacted]").replace(/\s+/g, " ").trim();
}

async function deliver(config: EmailConfig, kind: string, to: string, content: EmailContent, secret: string): Promise<EmailResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${SEND_TIMEOUT_MS} ms`)), SEND_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([resendClient(config.apiKey).emails.send({ from: config.from, to, ...content }), timeout]);
    if (res.error) {
      console.error(`[email] ${kind} not sent: ${res.error.name} (${res.error.statusCode ?? "no status"}): ${redact(res.error.message, secret)}`);
      return "failed";
    }
    console.info(`[email] ${kind} sent (id ${res.data.id})`);
    return "sent";
  } catch (error) {
    console.error(`[email] ${kind} not sent: ${redact(error instanceof Error ? error.message : String(error), secret)}`);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Content (Romanian, plain text + simple HTML) ----------

/** Romanian quantities: "o oră", "7 zile", "48 de ore" (from 20 up the noun takes "de"). */
function quantity(n: number, one: string, many: string): string {
  if (n === 1) return one;
  const lastTwo = n % 100;
  return `${n} ${lastTwo === 0 || lastTwo >= 20 ? "de " : ""}${many}`;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const MUTED = "margin:0 0 16px;font-size:13px;color:#4c5468";

/** `blocks` are HTML fragments whose dynamic parts are already escaped. */
function htmlLayout(blocks: string[]): string {
  return (
    '<!doctype html><html lang="ro"><body style="margin:0;padding:24px 16px;background:#fbfaf6;color:#1e2436;' +
    `font:16px/1.5 Arial,Helvetica,sans-serif"><div style="max-width:520px;margin:0 auto">${blocks.join("")}</div></body></html>`
  );
}

function htmlParagraph(html: string, style = "margin:0 0 16px"): string {
  return `<p style="${style}">${html}</p>`;
}

function htmlButton(link: string, label: string): string {
  const href = esc(link);
  return (
    htmlParagraph(
      `<a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#243458;` +
        `color:#ffffff;font-weight:bold;text-decoration:none">${esc(label)}</a>`,
    ) +
    htmlParagraph(
      `Dacă butonul nu funcționează, copiați adresa în browser:<br><a href="${href}" style="color:#243458;word-break:break-all">${href}</a>`,
      MUTED,
    )
  );
}

export function invitationEmail(p: {
  link: string;
  churchName: string;
  invitedBy: string;
  roleLabel: string;
  validDays: number;
}): EmailContent {
  const closing = `Linkul este personal și este valabil ${quantity(p.validDays, "o zi", "zile")}. Dacă nu vă așteptați la această invitație, puteți ignora mesajul.`;
  return {
    subject: `Invitație în secretariatul bisericii ${p.churchName}`,
    text: [
      "Bună ziua,",
      "",
      `${p.invitedBy} vă invită să folosiți aplicația de secretariat a bisericii ${p.churchName}, cu rolul ${p.roleLabel}.`,
      "",
      "Pentru a vă crea contul, deschideți linkul de mai jos și alegeți-vă o parolă:",
      p.link,
      "",
      closing,
    ].join("\n"),
    html: htmlLayout([
      htmlParagraph("Bună ziua,"),
      htmlParagraph(
        `<b>${esc(p.invitedBy)}</b> vă invită să folosiți aplicația de secretariat a bisericii <b>${esc(p.churchName)}</b>, cu rolul <b>${esc(p.roleLabel)}</b>.`,
      ),
      htmlParagraph("Pentru a vă crea contul, deschideți linkul de mai jos și alegeți-vă o parolă."),
      htmlButton(p.link, "Creează contul"),
      htmlParagraph(esc(closing), MUTED),
    ]),
  };
}

export function passwordResetEmail(p: { link: string; churchName: string; name: string; validHours: number }): EmailContent {
  const closing =
    `Linkul este valabil ${quantity(p.validHours, "o oră", "ore")} și poate fi folosit o singură dată. ` +
    "Dacă nu ați cerut dumneavoastră o parolă nouă, ignorați mesajul: parola actuală rămâne neschimbată.";
  return {
    subject: `Parolă nouă pentru secretariatul bisericii ${p.churchName}`,
    text: [
      `Bună ziua, ${p.name},`,
      "",
      `A fost cerută o parolă nouă pentru contul dumneavoastră din aplicația de secretariat a bisericii ${p.churchName}.`,
      "",
      "Pentru a alege parola nouă, deschideți linkul de mai jos:",
      p.link,
      "",
      closing,
    ].join("\n"),
    html: htmlLayout([
      htmlParagraph(`Bună ziua, ${esc(p.name)},`),
      htmlParagraph(
        `A fost cerută o parolă nouă pentru contul dumneavoastră din aplicația de secretariat a bisericii <b>${esc(p.churchName)}</b>.`,
      ),
      htmlButton(p.link, "Alege parola nouă"),
      htmlParagraph(esc(closing), MUTED),
    ]),
  };
}

// ---------- Senders ----------

export async function sendInvitationEmail(p: {
  to: string;
  token: string;
  churchName: string;
  invitedBy: string;
  roleLabel: string;
  validDays: number;
}): Promise<EmailResult> {
  const config = emailConfig();
  if (!config) return disabled();
  const link = new URL(`/invitatie/${p.token}`, config.appUrl).toString();
  return deliver(config, "invitation", p.to, invitationEmail({ ...p, link }), p.token);
}

export async function sendPasswordResetEmail(p: {
  to: string;
  token: string;
  churchName: string;
  name: string;
  validHours: number;
}): Promise<EmailResult> {
  const config = emailConfig();
  if (!config) return disabled();
  const link = new URL(`/resetare-parola/${p.token}`, config.appUrl).toString();
  return deliver(config, "password reset", p.to, passwordResetEmail({ ...p, link }), p.token);
}
