import { describe, expect, it } from "vitest";
import { defaultDocumentTitle, generateDocumentText, type DocPerson } from "./documents";

const base: DocPerson = {
  id: "x",
  nume: "Popescu",
  prenume: "Ion",
  gen: "M",
  familie: "Popescu",
  rudenie: "Fiu",
  dataNasterii: "2010-03-05",
  dataMembru: "2020-06-10",
  dataBotez: "2020-06-10",
  locBotez: "baptisteriul bisericii",
  dataBinecuvantare: "2010-09-12",
};
const church = { nume: "Maranata Stavanger", adresa: "Kongsgårdbakken 1, Stavanger" };
const gen = (p: Partial<DocPerson>, tip: Parameters<typeof generateDocumentText>[0]["tip"], extra = {}) =>
  generateDocumentText({ tip, person: { ...base, ...p }, family: [], church, catre: "", scop: "", ...extra });

describe("șabloanele de documente", () => {
  it("adeverința, cu acordurile de gen", () => {
    expect(gen({}, "adeverinta")).toBe(
      "Biserica Maranata Stavanger, cu sediul în Kongsgårdbakken 1, Stavanger, adeverește prin prezenta că Popescu Ion, născut la data de 5 martie 2010, este membru al bisericii noastre din data de 10 iunie 2020, fiind botezat în apă la data de 10 iunie 2020.\n\nPrezenta adeverință se eliberează la cererea dânsului, pentru a-i servi la cele legale.",
    );
    const f = gen({ prenume: "Maria", gen: "F" }, "adeverinta", { scop: "a-i servi la bancă" });
    expect(f).toContain("născută la data de");
    expect(f).toContain("este membră al bisericii noastre");
    expect(f).toContain("fiind botezată în apă");
    expect(f).toContain("la cererea dânsei, pentru a-i servi la bancă.");
  });

  it("certificatul de botez cu locul botezului", () => {
    expect(gen({ gen: "F", prenume: "Ana" }, "botez")).toBe(
      "Se certifică prin prezenta că Popescu Ana, născută la data de 5 martie 2010, a fost botezată în apă, prin cufundare, în Numele Tatălui, al Fiului și al Sfântului Duh, la data de 10 iunie 2020, la baptisteriul bisericii, în cadrul Biserica Maranata Stavanger.\n\nPrezentul certificat se eliberează pentru a-i servi la cele de trebuință.",
    );
  });

  it("certificatul de binecuvântare menționează părinții din familie", () => {
    const family: DocPerson[] = [
      { ...base, id: "t", prenume: "Petru", rudenie: "Cap de familie" },
      { ...base, id: "m", prenume: "Rut", gen: "F", rudenie: "Soție" },
      { ...base, id: "s", prenume: "Ana", gen: "F", rudenie: "Fiică" },
      { ...base, id: "o", familie: "Alta", prenume: "Străin", rudenie: "Părinte" },
    ];
    const text = generateDocumentText({ tip: "binecuvantare", person: { ...base, gen: "F", prenume: "Lia" }, family, church, catre: "", scop: "" });
    expect(text).toBe(
      "Se certifică prin prezenta că copila Popescu Lia, născută la data de 5 martie 2010, din părinții Popescu Petru și Popescu Rut, a fost adusă înaintea Domnului și binecuvântată în cadrul Biserica Maranata Stavanger, la data de 12 septembrie 2010.\n\n„Lăsați copilașii să vină la Mine și nu-i opriți, căci Împărăția lui Dumnezeu este a celor ca ei.” (Marcu 10:14)",
    );
  });

  it("scrisoarea de recomandare", () => {
    const text = gen({ gen: "F", prenume: "Maria" }, "recomandare", { catre: "Biserica Betel Oslo" });
    expect(text.startsWith("Către Biserica Betel Oslo,\n\nHar și pace")).toBe(true);
    expect(text).toContain("recomandă cu drag pe sora Popescu Maria, născută la data de 5 martie 2010, membră al bisericii noastre din 10 iunie 2020, botezată în apă la 10 iunie 2020, care se mută în localitatea dumneavoastră. Sora a avut");
    expect(text).toContain("Vă rugăm să o primiți");
    expect(gen({}, "recomandare")).toContain("Vă rugăm să îl primiți");
  });

  it("fără persoană și fără date ale bisericii, rămân spații de completat", () => {
    const t = generateDocumentText({ tip: "adeverinta", person: null, family: [], church: { nume: "", adresa: "" }, catre: "", scop: "" });
    expect(t.startsWith("Biserica ____________, cu sediul în ____________, adeverește prin prezenta că ____________________, este membru")).toBe(true);
    expect(generateDocumentText({ tip: "scrisoare", person: null, family: [], church, catre: "", scop: "Invitație" })).toBe(
      "Către ____________________,\n\nRef.: Invitație\n\n",
    );
  });

  it("titlul implicit din registru", () => {
    expect(defaultDocumentTitle("adeverinta", base, "")).toBe("Adeverință de membru — Popescu Ion");
    expect(defaultDocumentTitle("scrisoare", null, "Primăria Cluj")).toBe("Scrisoare / adresă oficială — Primăria Cluj");
    expect(defaultDocumentTitle("raport", null, "")).toBe("Dare de seamă anuală");
  });
});
