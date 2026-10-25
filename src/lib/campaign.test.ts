import { describe, expect, it } from "vitest";
import { campaignMessage, campaignOpen, isCampaignAdult, linkStatus } from "./campaign";

const none = { sentAt: null, openedAt: null, verifiedAt: null, submittedAt: null, lockedAt: null };
const t = new Date("2026-11-01T10:00:00Z");

describe("data-update campaign", () => {
  it("shows the furthest step of a link; a locked link stays locked", () => {
    expect(linkStatus(none)).toBe("NETRIMIS");
    expect(linkStatus({ ...none, sentAt: t })).toBe("TRIMIS");
    expect(linkStatus({ ...none, sentAt: t, openedAt: t })).toBe("DESCHIS");
    expect(linkStatus({ ...none, openedAt: t, verifiedAt: t })).toBe("VERIFICAT");
    expect(linkStatus({ ...none, verifiedAt: t, submittedAt: t })).toBe("COMPLETAT");
    expect(linkStatus({ ...none, submittedAt: t, approved: true })).toBe("APROBAT");
    expect(linkStatus({ ...none, openedAt: t, lockedAt: t })).toBe("BLOCAT");
  });

  it("gives a link to adults and to persons without a birth date", () => {
    expect(isCampaignAdult({ dataNasterii: "2008-11-01" }, "2026-11-01")).toBe(true);
    expect(isCampaignAdult({ dataNasterii: "2008-11-02" }, "2026-11-01")).toBe(false);
    expect(isCampaignAdult({ dataNasterii: null }, "2026-11-01")).toBe(true);
  });

  it("writes the share message with the first name, the church, the deadline and the link", () => {
    expect(campaignMessage("Ana", "Maranata Stavanger", "2026-12-01", "https://x/actualizare/abc")).toBe(
      "Bună ziua, Ana! Vă rugăm să verificați datele dumneavoastră din evidența Bisericii Maranata Stavanger până la 1 decembrie 2026. La deschidere vi se cer numele complet și numărul de telefon: https://x/actualizare/abc",
    );
  });

  it("is open while active and not past the deadline", () => {
    expect(campaignOpen({ status: "ACTIVE", deadline: "2026-12-01" }, "2026-12-01")).toBe(true);
    expect(campaignOpen({ status: "ACTIVE", deadline: "2026-12-01" }, "2026-12-02")).toBe(false);
    expect(campaignOpen({ status: "CLOSED", deadline: "2026-12-01" }, "2026-11-01")).toBe(false);
  });
});
