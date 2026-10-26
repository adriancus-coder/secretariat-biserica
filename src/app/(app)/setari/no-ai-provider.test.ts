import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PrivacyText } from "@/app/(auth)/confidentialitate/privacy-text";
import { resolveNomen } from "@/lib/labels";
import { privacyTemplate } from "@/lib/privacy";
import { SettingsForm } from "./settings-form";

// The form's server action needs the session; the render only needs its reference.
vi.mock("@/server/actions/settings", () => ({ saveChurchSettingsAction: async () => ({ ok: false }) }));

// Reading scanned documents was withdrawn (2026-10): no page may name an AI provider any more.
// The names are assembled so that a repository-wide search for them stays empty.
const NO_AI = new RegExp(["anth" + "ropic", "cla" + "ude"].join("|"), "i");

const church = {
  nume: "Maranata Stavanger",
  adresa: "Stavanger",
  codPostal: "4005",
  localitate: "Stavanger",
  orgNr: "",
  telefon: "",
  email: "secretariat@example.no",
  pastor: "",
  secretar: "",
  pastorEmail: "",
  secretarEmail: "",
  slug: "maranata-stavanger",
  comunitate: "",
  applicationsOpen: true,
  require2fa: false,
  passkeyPolicy: false,
  semnaturaUnica: "",
  semnaturaUnicaTipuri: [],
};

describe("no AI provider in the published texts", () => {
  it("the rendered privacy notice names no AI provider", () => {
    const html = renderToStaticMarkup(createElement(PrivacyText, { text: privacyTemplate(church) }));
    expect(html).toContain("Resend, Inc.");
    expect(html).toContain("Biserica nu folosește servicii de inteligență artificială");
    expect(html).not.toMatch(NO_AI);
  });

  it("the rendered Setări form names no AI provider", () => {
    const html = renderToStaticMarkup(
      createElement(SettingsForm, {
        church,
        privacyText: privacyTemplate(church),
        privacyUrl: "https://example.no/confidentialitate/maranata-stavanger",
        nomen: resolveNomen({}),
        attendanceRules: {},
        tipuriAG: [],
        tipuriCvorum: [],
        formUrl: "https://example.no/cerere/maranata-stavanger",
        readOnly: false,
      }),
    );
    expect(html).toContain("Nota de confidențialitate");
    expect(html).toContain("versiunea 1.0");
    expect(html).not.toMatch(NO_AI);
  });
});
