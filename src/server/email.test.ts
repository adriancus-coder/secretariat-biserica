import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  DEFAULT_EMAIL_FROM,
  invitationEmail,
  isEmailConfigured,
  passwordResetEmail,
  sendInvitationEmail,
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
