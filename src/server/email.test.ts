import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  DEFAULT_EMAIL_FROM,
  dedupeRecipients,
  invitationEmail,
  MAX_ATTACHMENT_BYTES,
  minutesEmail,
  isEmailConfigured,
  newApplicationEmail,
  passwordResetEmail,
  sendInvitationEmail,
  sendMinutesEmail,
  sendNewApplicationEmail,
  sendPasswordResetEmail,
} from "./email";

// The Resend SDK is replaced by a fake: no test ever reaches the real API.
const { send, apiKeys } = vi.hoisted(() => ({ send: vi.fn(), apiKeys: [] as string[] }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
    constructor(key: string) {
      apiKeys.push(key);
    }
  },
}));

const TOKEN = "tok_Zm9vYmFyLXNlY3JldC0wMTIzNDU2Nzg5";
const APP_URL = "https://secretariat.example.org";
const FAKE_KEY = "re_test_fake_key_not_real";

const invitation = {
  to: "ana@example.org",
  token: TOKEN,
  churchName: "Maranata Stavanger",
  invitedBy: "Daniel Mureșan",
  roleLabel: "Secretar",
  validDays: 7,
};
const reset = { to: "ana@example.org", token: TOKEN, churchName: "Maranata Stavanger", name: "Ana Pop", validHours: 1 };

let logSpies: MockInstance[] = [];

/** Everything written to the console during a test, as one string. */
function loggedText(): string {
  return JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
}

beforeEach(() => {
  logSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
  vi.stubEnv("RESEND_API_KEY", FAKE_KEY);
  vi.stubEnv("APP_URL", APP_URL);
  vi.stubEnv("EMAIL_FROM", undefined);
  send.mockReset();
  send.mockResolvedValue({ data: { id: "em_123" }, error: null, headers: null });
});

afterEach(() => {
  // No token may ever reach the logs, whatever happened in the test.
  expect(loggedText()).not.toContain(TOKEN);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("is off without RESEND_API_KEY: nothing is sent and nothing throws", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    expect(isEmailConfigured()).toBe(false);
    await expect(sendInvitationEmail(invitation)).resolves.toBe("disabled");
    await expect(sendPasswordResetEmail(reset)).resolves.toBe("disabled");
    expect(send).not.toHaveBeenCalled();
  });

  it("is off without a valid APP_URL (links are never built from request headers)", async () => {
    vi.stubEnv("APP_URL", undefined);
    expect(isEmailConfigured()).toBe(false);
    vi.stubEnv("APP_URL", "not a url");
    expect(isEmailConfigured()).toBe(false);
    await expect(sendInvitationEmail(invitation)).resolves.toBe("disabled");
    expect(send).not.toHaveBeenCalled();
  });

  it("is on with RESEND_API_KEY and APP_URL", () => {
    expect(isEmailConfigured()).toBe(true);
  });
});

describe("sending (mocked Resend client)", () => {
  it("sends the invitation with the link built from APP_URL", async () => {
    await expect(sendInvitationEmail(invitation)).resolves.toBe("sent");
    expect(apiKeys.at(-1)).toBe(FAKE_KEY);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    const link = `${APP_URL}/invitatie/${TOKEN}`;
    expect(payload).toMatchObject({ from: DEFAULT_EMAIL_FROM, to: "ana@example.org" });
    expect(payload.subject).toBe("Invitație în secretariatul bisericii Maranata Stavanger");
    expect(payload.text).toContain(link);
    expect(payload.html).toContain(`href="${link}"`);
    expect(payload.text).toContain("Daniel Mureșan vă invită");
    expect(payload.text).toContain("cu rolul Secretar");
    expect(payload.text).toContain("valabil 7 zile");
  });

  it("sends the password reset with its link", async () => {
    await expect(sendPasswordResetEmail(reset)).resolves.toBe("sent");
    const payload = send.mock.calls[0][0];
    const link = `${APP_URL}/resetare-parola/${TOKEN}`;
    expect(payload.to).toBe("ana@example.org");
    expect(payload.subject).toBe("Parolă nouă pentru secretariatul bisericii Maranata Stavanger");
    expect(payload.text).toContain(link);
    expect(payload.html).toContain(`href="${link}"`);
    expect(payload.text).toContain("Bună ziua, Ana Pop,");
    expect(payload.text).toContain("valabil o oră");
  });

  it("uses EMAIL_FROM when set", async () => {
    vi.stubEnv("EMAIL_FROM", "Biserica Maranata <noreply@maranata.example>");
    await sendInvitationEmail(invitation);
    expect(send.mock.calls[0][0].from).toBe("Biserica Maranata <noreply@maranata.example>");
  });

  it("reports an API error as failed, without the token in the logs", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", statusCode: 422, message: `Invalid html near /invitatie/${TOKEN}` },
      headers: null,
    });
    await expect(sendInvitationEmail(invitation)).resolves.toBe("failed");
    expect(loggedText()).toContain("validation_error (422)");
    expect(loggedText()).toContain("[redacted]");
  });

  it("reports a network error or an exception as failed, without the token in the logs", async () => {
    send.mockRejectedValue(new Error(`fetch failed for ${APP_URL}/resetare-parola/${TOKEN}`));
    await expect(sendPasswordResetEmail(reset)).resolves.toBe("failed");
    expect(loggedText()).toContain("password reset not sent");
  });

  it("logs a successful send without recipient details or token", async () => {
    await sendPasswordResetEmail(reset);
    expect(loggedText()).toContain("password reset sent (id em_123)");
    expect(loggedText()).not.toContain("ana@example.org");
  });
});

describe("content", () => {
  it("escapes names in the HTML version", () => {
    const { html, text } = invitationEmail({
      link: `${APP_URL}/invitatie/x`,
      churchName: `<script>alert("x")</script> & Co`,
      invitedBy: "Ion",
      roleLabel: "Secretar",
      validDays: 7,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co");
    expect(text).toContain(`<script>alert("x")</script> & Co`); // plain text is not HTML
  });

  it("uses correct Romanian quantities", () => {
    const p = { link: "https://x.example/r/t", churchName: "B", name: "N" };
    expect(passwordResetEmail({ ...p, validHours: 1 }).text).toContain("valabil o oră");
    expect(passwordResetEmail({ ...p, validHours: 2 }).text).toContain("valabil 2 ore");
    expect(passwordResetEmail({ ...p, validHours: 48 }).text).toContain("valabil 48 de ore");
    const i = { link: "https://x.example/i/t", churchName: "B", invitedBy: "I", roleLabel: "R" };
    expect(invitationEmail({ ...i, validDays: 1 }).text).toContain("valabil o zi");
    expect(invitationEmail({ ...i, validDays: 7 }).text).toContain("valabil 7 zile");
  });
});

describe("new application notice", () => {
  it("sends one message per administrator with the link to the application", async () => {
    const r = await sendNewApplicationEmail({
      to: ["a@example.org", "b@example.org"],
      applicationId: "app123",
      churchName: "Maranata Stavanger",
      applicantName: "Munteanu Andrei",
      kindLabel: "Transfer de la altă biserică",
    });
    expect(r).toBe("sent");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((c) => c[0].to)).toEqual(["a@example.org", "b@example.org"]);
    expect(send.mock.calls[0][0].text).toContain(`${APP_URL}/cereri/app123`);
    expect(send.mock.calls[0][0].subject).toBe("Cerere nouă de membru: Munteanu Andrei");
  });

  it("escapes the applicant name in HTML", () => {
    const { html } = newApplicationEmail({ link: "https://x.example/cereri/1", churchName: "B", applicantName: "<b>X</b>", kindLabel: "Altul" });
    expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});

describe("minutes", () => {
  const SECRET_TEXT = "Punctul confidențial nr. 7";
  const minutes = {
    to: ["Pastor@Example.org", "secretar@example.org", " pastor@example.org ", ""],
    subject: "Proces-verbal nr. 16/2026 — Maranata Stavanger",
    message: `Bună ziua,\n\nVă trimit procesul-verbal.\n${SECRET_TEXT}`,
    attachment: { filename: "PV-16-2026-maranata-stavanger.pdf", content: Buffer.from("%PDF-1.7 fake") },
  };

  it("sends one message to the deduplicated recipients with the PDF attached", async () => {
    const r = await sendMinutesEmail(minutes);
    expect(r).toEqual({ result: "sent", id: "em_123" });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.to).toEqual(["pastor@example.org", "secretar@example.org"]);
    expect(payload.subject).toBe(minutes.subject);
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe("PV-16-2026-maranata-stavanger.pdf");
    expect(Buffer.isBuffer(payload.attachments[0].content)).toBe(true);
  });

  it("sends without attachment when none is given", async () => {
    await sendMinutesEmail({ ...minutes, attachment: undefined });
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
  });

  it("logs neither the recipients, the content nor the key", async () => {
    await sendMinutesEmail(minutes);
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", statusCode: 422, message: "Invalid `to`: secretar@example.org" },
      headers: null,
    });
    await expect(sendMinutesEmail(minutes)).resolves.toEqual({ result: "failed", error: "validation_error" });
    const logs = loggedText();
    expect(logs).toContain("minutes sent (id em_123)");
    expect(logs).toContain("minutes not sent");
    for (const hidden of ["pastor@example.org", "secretar@example.org", SECRET_TEXT, minutes.subject, FAKE_KEY]) {
      expect(logs).not.toContain(hidden);
    }
  });

  it("refuses an oversized attachment or no recipients without calling the API", async () => {
    const big = { filename: "x.pdf", content: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) };
    await expect(sendMinutesEmail({ ...minutes, attachment: big })).resolves.toMatchObject({ result: "failed" });
    await expect(sendMinutesEmail({ ...minutes, to: [" "] })).resolves.toMatchObject({ result: "failed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("is disabled without the key", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    await expect(sendMinutesEmail(minutes)).resolves.toEqual({ result: "disabled" });
    expect(send).not.toHaveBeenCalled();
  });

  it("dedupes case-insensitively and escapes the message in HTML", () => {
    expect(dedupeRecipients(["A@x.ro", "a@X.ro", "b@x.ro"])).toEqual(["a@x.ro", "b@x.ro"]);
    const { html, text } = minutesEmail({ subject: "S", message: "<b>Salut</b>\nrând 2\n\nParagraf" });
    expect(text).toBe("<b>Salut</b>\nrând 2\n\nParagraf");
    expect(html).toContain("&lt;b&gt;Salut&lt;/b&gt;<br>rând 2</p>");
    expect(html).toContain(">Paragraf</p>");
  });
});
