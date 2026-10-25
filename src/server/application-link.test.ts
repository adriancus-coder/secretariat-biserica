import { describe, expect, it, vi } from "vitest";
import { printApplicationPoster, printToText } from "@/domain/print";
import { applicationQrPng, applicationQrSvg, applicationUrl, qrPayload } from "./application-link";

vi.mock("./request-origin", () => ({ requestOrigin: async () => null }));

describe("application link and QR code", () => {
  it("encodes ${APP_URL}/cerere/<slug> and follows the slug", async () => {
    vi.stubEnv("APP_URL", "https://secretariat.example.org");
    const url = await applicationUrl("maranata-stavanger");
    expect(url).toBe("https://secretariat.example.org/cerere/maranata-stavanger");
    expect(qrPayload(url)).toBe(url);
    const renamed = await applicationUrl("maranata");
    expect(qrPayload(renamed)).toBe("https://secretariat.example.org/cerere/maranata");
    expect(await applicationQrSvg(url)).not.toBe(await applicationQrSvg(renamed));
    vi.unstubAllEnvs();
  });

  it("renders an SVG and a PNG locally", async () => {
    const url = "https://secretariat.example.org/cerere/x";
    expect(await applicationQrSvg(url)).toMatch(/^<svg[^>]*viewBox/);
    const png = await applicationQrPng(url, 400);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });

  it("the A5 poster has the church name, the title, the QR and the link as text", () => {
    const church = { nume: "Maranata Stavanger", adresa: "", orgNr: "", telefon: "", email: "", pastor: "", secretar: "" };
    const spec = printApplicationPoster(church, "https://x.org/cerere/m", new Uint8Array([1]));
    expect(spec.size).toBe("A5");
    expect(printToText(spec)).toBe(
      [
        "Biserica Maranata Stavanger",
        "Cerere de membru online",
        "Scanați codul cu telefonul pentru a completa cererea.",
        "[cod QR: https://x.org/cerere/m]",
        "https://x.org/cerere/m",
      ].join("\n"),
    );
  });
});
