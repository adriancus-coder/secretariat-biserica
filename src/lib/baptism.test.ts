import { describe, expect, it } from "vitest";
import { baptismSentence } from "./baptism";

const none = { data: "", botezBiserica: "", botezLocalitate: "", botezOficiant: "" };

describe("baptismSentence", () => {
  it("joins every known part", () => {
    expect(baptismSentence({ data: "15 iun. 2008", botezBiserica: "Betel", botezLocalitate: "Oslo", botezOficiant: "Ioan Pop" })).toBe(
      "Botezat la 15 iun. 2008, în Biserica Betel, Oslo, de Ioan Pop",
    );
  });
  it("leaves out missing parts without dangling commas", () => {
    expect(baptismSentence({ ...none, data: "1 mai 2000" })).toBe("Botezat la 1 mai 2000");
    expect(baptismSentence({ ...none, botezLocalitate: "Oradea" })).toBe("Botezat în Oradea");
    expect(baptismSentence({ ...none, botezBiserica: "Biserica Emanuel", botezOficiant: "Vasile Talpoș" })).toBe(
      "Botezat în Biserica Emanuel, de Vasile Talpoș",
    );
    expect(baptismSentence(none)).toBe("");
  });
});
