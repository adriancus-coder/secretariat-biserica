import "server-only";
import { Resend } from "resend";
import { churchTitle } from "@/lib/church-name";

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

/** Keeps tokens (and recipients) out of the logs, even when an error message echoes the request. */
function redact(message: string, secrets: string | readonly string[]): string {
  let out = message;
  for (const secret of typeof secrets === "string" ? [secrets] : secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out.replace(/\s+/g, " ").trim();
}

interface Attachment {
  filename: string;
  content: Buffer;
}

interface Delivery {
  result: EmailResult;
  /** The provider's message id, when sent. */
  id?: string;
  /** The provider's error name (e.g. "validation_error"), when it refused the message. */
  error?: string;
}

async function send(
  config: EmailConfig,
  kind: string,
  to: string | string[],
  content: EmailContent,
  secrets: string | readonly string[],
  attachments?: Attachment[],
): Promise<Delivery> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${SEND_TIMEOUT_MS} ms`)), SEND_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([
      resendClient(config.apiKey).emails.send({ from: config.from, to, ...content, ...(attachments?.length ? { attachments } : {}) }),
      timeout,
    ]);
    if (res.error) {
      console.error(`[email] ${kind} not sent: ${res.error.name} (${res.error.statusCode ?? "no status"}): ${redact(res.error.message, secrets)}`);
      return { result: "failed", error: res.error.name };
    }
    console.info(`[email] ${kind} sent (id ${res.data.id})`);
    return { result: "sent", id: res.data.id };
  } catch (error) {
    console.error(`[email] ${kind} not sent: ${redact(error instanceof Error ? error.message : String(error), secrets)}`);
    return { result: "failed", error: "no_answer" };
  } finally {
    clearTimeout(timer);
  }
}

async function deliver(config: EmailConfig, kind: string, to: string, content: EmailContent, secret: string): Promise<EmailResult> {
  return (await send(config, kind, to, content, secret)).result;
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

export function newApplicationEmail(p: { link: string; churchName: string; applicantName: string; kindLabel: string }): EmailContent {
  return {
    subject: `Cerere nouă de membru: ${p.applicantName}`,
    text: [
      "Bună ziua,",
      "",
      `${p.applicantName} a trimis o cerere de membru (${p.kindLabel}) prin formularul online al bisericii ${p.churchName}.`,
      "",
      "Cererea poate fi văzută aici:",
      p.link,
    ].join("\n"),
    html: htmlLayout([
      htmlParagraph("Bună ziua,"),
      htmlParagraph(
        `<b>${esc(p.applicantName)}</b> a trimis o cerere de membru (${esc(p.kindLabel)}) prin formularul online al bisericii <b>${esc(p.churchName)}</b>.`,
      ),
      htmlButton(p.link, "Vezi cererea"),
    ]),
  };
}

/** Tells the church administrators about a new application; one message per recipient. */
export async function sendNewApplicationEmail(p: {
  to: string[];
  applicationId: string;
  churchName: string;
  applicantName: string;
  kindLabel: string;
}): Promise<EmailResult> {
  const config = emailConfig();
  if (!config) return disabled();
  const link = new URL(`/cereri/${p.applicationId}`, config.appUrl).toString();
  const content = newApplicationEmail({ ...p, link });
  let result: EmailResult = "sent";
  for (const to of p.to) {
    if ((await deliver(config, "new application", to, content, p.applicationId)) !== "sent") result = "failed";
  }
  return result;
}

// ---------- Pastor approval of documents ----------

/** No personal data in the message: only that a document waits, and the link. */
export function documentApprovalEmail(p: { link: string; churchName: string; kind: "trimis" | "aprobat" | "respins" }): EmailContent {
  const line =
    p.kind === "trimis"
      ? "Un document din registrul bisericii așteaptă aprobarea și semnătura dumneavoastră."
      : p.kind === "aprobat"
        ? "Un document trimis spre semnare a fost aprobat de pastor."
        : "Un document trimis spre semnare a fost respins de pastor; motivul este în aplicație.";
  return {
    subject: p.kind === "trimis" ? "Un document așteaptă semnătura dumneavoastră" : p.kind === "aprobat" ? "Document aprobat de pastor" : "Document respins de pastor",
    text: ["Bună ziua,", "", line, "", p.link, "", `Secretariatul bisericii ${p.churchName}`].join("\n"),
    html: htmlLayout([htmlParagraph("Bună ziua,"), htmlParagraph(esc(line)), htmlButton(p.link, "Deschide documentul"), htmlParagraph(`Secretariatul bisericii ${esc(p.churchName)}`)]),
  };
}

/** Tells the pastors (or the secretary) about a document waiting or decided; one message per recipient. */
export async function sendDocumentApprovalEmail(p: { to: string[]; documentId: string; churchName: string; kind: "trimis" | "aprobat" | "respins" }): Promise<EmailResult> {
  const config = emailConfig();
  if (!config) return disabled();
  const link = new URL(`/documente/${p.documentId}`, config.appUrl).toString();
  const content = documentApprovalEmail({ link, churchName: p.churchName, kind: p.kind });
  let result: EmailResult = "sent";
  for (const to of p.to) {
    if ((await deliver(config, `document ${p.kind}`, to, content, p.documentId)) !== "sent") result = "failed";
  }
  return result;
}

// ---------- Minutes ----------

/** Resend accepts up to 40 MB per message; minutes PDFs are far smaller, so 10 MB is a safe cap. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Resend accepts at most 50 recipients per message. */
export const MAX_RECIPIENTS = 50;

/** Trimmed, lower-case, without empties or duplicates, in first-seen order. */
export function dedupeRecipients(list: readonly string[]): string[] {
  return [...new Set(list.map((a) => a.trim().toLowerCase()).filter(Boolean))];
}

/** The editable part of a message sent from the app (plain text; escaped in the HTML). */
export const EMAIL_NOTE_MAX = 1000;

/**
 * A message sent from the app to free addresses (minutes, application link): only the middle note is
 * written by the user; the greeting, the fixed lines (with the link) and the signature with the church
 * name and "trimis din Secretariat Biserică" are always the same, so the app cannot be used to send
 * arbitrary mail in the church's name.
 */
export function framedEmail(p: { subject: string; churchName: string; lines: string[]; note: string }): EmailContent {
  const note = p.note.replace(/\r\n/g, "\n").trim().slice(0, EMAIL_NOTE_MAX);
  const signature = p.churchName ? `Secretariatul bisericii ${p.churchName}` : "Secretariatul bisericii";
  const footer = "— trimis din Secretariat Biserică";
  const noteParagraphs = note ? note.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean) : [];
  return {
    subject: p.subject,
    text: ["Bună ziua,", "", ...p.lines, ...(note ? ["", note] : []), "", "Cu stimă,", signature, "", footer].join("\n"),
    html: htmlLayout([
      htmlParagraph("Bună ziua,"),
      ...p.lines.map((l) => htmlParagraph(/^https?:\/\//.test(l) ? `<a href="${esc(l)}">${esc(l)}</a>` : esc(l))),
      ...noteParagraphs.map((b) => htmlParagraph(esc(b).replace(/\n/g, "<br>"))),
      htmlParagraph(`Cu stimă,<br>${esc(signature)}`),
      htmlParagraph(esc(footer), MUTED),
    ]),
  };
}

/** The fixed lines of the minutes e-mail. */
export function minutesLines(p: { tip: string; dataLabel: string; withPdf: boolean }): string[] {
  return [`Vă transmitem procesul-verbal al ședinței (${p.tip}) din ${p.dataLabel}.`, ...(p.withPdf ? ["Îl găsiți atașat, în format PDF."] : [])];
}

/**
 * E-mails the minutes to all recipients in one message, with the PDF attached when given. Fixed
 * subject and frame; only `note` is the user's. Never throws; the log line carries only the outcome
 * and the provider's id, never the recipients or the content.
 */
export async function sendMinutesEmail(p: {
  to: string[];
  subject: string;
  churchName: string;
  tip: string;
  dataLabel: string;
  note: string;
  attachment?: Attachment;
}): Promise<Delivery> {
  const config = emailConfig();
  if (!config) return { result: disabled() };
  const to = dedupeRecipients(p.to);
  if (!to.length || to.length > MAX_RECIPIENTS) return { result: "failed", error: "recipients" };
  if (p.attachment && p.attachment.content.length > MAX_ATTACHMENT_BYTES) return { result: "failed", error: "attachment_too_large" };
  const content = framedEmail({ subject: p.subject, churchName: p.churchName, lines: minutesLines({ tip: p.tip, dataLabel: p.dataLabel, withPdf: Boolean(p.attachment) }), note: p.note });
  return send(config, "minutes", to, content, to, p.attachment ? [p.attachment] : undefined);
}

// ---------- Public application link ----------

export function applicationLinkSubject(churchName: string): string {
  return churchName ? `Cerere de membru — ${churchTitle(churchName)}` : "Cerere de membru";
}

/**
 * E-mails the link of the public membership application to all recipients in one message. Fixed
 * subject and frame; the link is built only from APP_URL; only `note` is the user's. Never throws;
 * recipients are never logged.
 */
export async function sendApplicationLinkEmail(p: { to: string[]; churchName: string; note: string; slug: string }): Promise<Delivery> {
  const config = emailConfig();
  if (!config) return { result: disabled() };
  const to = dedupeRecipients(p.to);
  if (!to.length || to.length > MAX_RECIPIENTS) return { result: "failed", error: "recipients" };
  const link = new URL(`/cerere/${p.slug}`, config.appUrl).toString();
  const lines = [`Puteți completa cererea de membru a bisericii${p.churchName ? ` ${p.churchName}` : ""} online, la adresa:`, link];
  return send(config, "application-link", to, framedEmail({ subject: applicationLinkSubject(p.churchName), churchName: p.churchName, lines, note: p.note }), to);
}

// ---------- Signup with an address that already has an account ----------

export function signupExistsEmail(p: { link: string; name: string }): EmailContent {
  const intro = "Cineva a încercat să înregistreze o biserică nouă cu adresa dumneavoastră de e-mail, care are deja un cont în aplicația de secretariat.";
  const closing = "Dacă ați fost dumneavoastră, autentificați-vă cu contul existent sau alegeți o parolă nouă. Dacă nu, ignorați mesajul: contul rămâne neschimbat.";
  return {
    subject: "Adresa dumneavoastră are deja un cont",
    text: [`Bună ziua, ${p.name},`, "", intro, "", "Parolă nouă:", p.link, "", closing].join("\n"),
    html: htmlLayout([htmlParagraph(`Bună ziua, ${esc(p.name)},`), htmlParagraph(esc(intro)), htmlButton(p.link, "Alege o parolă nouă"), htmlParagraph(esc(closing), MUTED)]),
  };
}

/** Sent instead of telling the signup form that the address is taken. Never throws; nothing logged but the outcome. */
export async function sendSignupExistsEmail(p: { to: string; name: string }): Promise<EmailResult> {
  const config = emailConfig();
  if (!config) return disabled();
  const link = new URL("/am-uitat-parola", config.appUrl).toString();
  return deliver(config, "signup with existing address", p.to, signupExistsEmail({ ...p, link }), p.to);
}

// ---------- Login code (second factor) ----------

export function loginCodeEmail(p: { code: string; churchName: string; validMinutes: number }): EmailContent {
  const closing = `Codul este valabil ${quantity(p.validMinutes, "un minut", "minute")} și poate fi folosit o singură dată. Dacă nu încercați să vă autentificați, schimbați-vă parola.`;
  return {
    // The code is only in the body: subjects show up in notifications and mail logs.
    subject: "Codul dumneavoastră de autentificare",
    text: [`Codul de autentificare în secretariatul bisericii ${p.churchName} este:`, "", p.code, "", closing].join("\n"),
    html: htmlLayout([
      htmlParagraph(`Codul de autentificare în secretariatul bisericii <b>${esc(p.churchName)}</b> este:`),
      htmlParagraph(esc(p.code), "margin:0 0 16px;font-size:28px;font-weight:bold;letter-spacing:6px"),
      htmlParagraph(esc(closing), MUTED),
    ]),
  };
}

/** The 6-digit login code; never logged (redacted even from error messages). */
export async function sendLoginCodeEmail(p: { to: string; code: string; churchName: string; validMinutes: number }): Promise<EmailResult> {
  const config = emailConfig();
  if (!config) return disabled();
  return deliver(config, "login code", p.to, loginCodeEmail(p), p.code);
}
