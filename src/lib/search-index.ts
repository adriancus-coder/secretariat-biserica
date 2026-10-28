import { permissions, type Permission, type Who } from "./permissions";
import { normalizeSearch, searchTerms } from "./text";

/*
 * GLOBAL-SEARCH: the „Pagini și setări” group of the search — every page and important section of the
 * app, with its breadcrumb, link (an anchor to the section where there is one) and Romanian keywords /
 * synonyms. Each entry carries the permission of its page: a user never sees an entry he cannot open.
 * Every route of NAV_ITEMS and every section of Setări / Contul meu has an entry (search-index.test.ts).
 * Pure.
 */

export interface SearchEntry {
  title: string;
  /** „Setări › Utilizatori și roluri”. */
  path: string;
  href: string;
  keywords: string;
  /** Who may open it (any of them). */
  permission: Permission | Permission[];
}

const e = (title: string, path: string, href: string, permission: SearchEntry["permission"], keywords: string): SearchEntry => ({ title, path, href, permission, keywords });

export const SEARCH_INDEX: readonly SearchEntry[] = [
  // The main pages (NAV_ITEMS).
  e("Acasă", "Acasă", "/", "read", "acasa tablou de bord panou prima pagina aniversari zile de nastere cifre"),
  e("Persoane", "Persoane", "/persoane", "read", "registru membri evidenta persoana fisa cautare membrii lista"),
  e("Persoană nouă", "Persoane › Persoană nouă", "/persoane/nou", "write", "adauga persoana membru nou inregistrare"),
  e("Exportul persoanelor", "Persoane › Export", "/persoane/export", "export", "export excel csv pdf lista categorii date personale"),
  e("Familii", "Familii", "/familii", "read", "familii cap de familie familie sot sotie copii alte familii"),
  e("Calendar", "Calendar", "/calendar", "read", "calendar evenimente agapa program nunta botez inmormantare binecuvantare cina domnului"),
  e("Ședințe", "Ședințe", "/procese-verbale", "read", "pv proces verbal procese verbale sedinta sedinte adunare generala ag cvorum comitet prezenta voturi"),
  e("Ședință nouă", "Ședințe › Ședință nouă", "/procese-verbale/nou", "write", "pv nou proces verbal nou sedinta noua adunare generala"),
  e("Import procese-verbale din Word", "Ședințe › Import", "/procese-verbale/import", "write", "import word docx procese verbale vechi pv vechi"),
  e("Statistici", "Statistici", "/statistici", "read", "statistici copii apartinatori prieteni grafice evolutie varste piramida membri botezati stare civila"),
  e("Neamuri", "Statistici › Neamuri", "/statistici/neamuri", "read", "rudenie neam neamuri frati parinti arbore genealogic rude"),
  e("Documente", "Documente", "/documente", "read", "documente adeverinta scrisoare recomandare certificat registru de iesire numar document"),
  e("Dare de seamă", "Documente › Dare de seamă", "/documente/nou?tip=raport", "write", "dare de seama raport anual situatia membrala raport"),
  e("Documente de semnat", "Documente › De semnat", "/documente/de-semnat", "pastor", "de semnat semnatura pastor aprobare documente aprobare"),
  e("Corespondență", "Corespondență", "/corespondenta", "read", "corespondenta registru intrare iesire scrisori primite trimise registratura"),
  e("Patrimoniu", "Patrimoniu", "/patrimoniu", "read", "inventar patrimoniu poze bunuri obiecte mobilier instrumente sonorizare"),
  e("Grupuri", "Grupuri", "/grupuri", "read", "grupuri cor tineret copii echipe slujiri"),
  e("Mențiuni", "Mențiuni", "/mentiuni", "read", "mentiuni note observatii"),
  e("Cereri", "Cereri", "/cereri", "read", "cereri cerere de membru solicitari inscriere propuneri"),
  e("De verificat", "De verificat", "/de-verificat", "write", "de verificat raspunsuri campanie adrese fara cod postal familii de verificat"),
  e("Rudenie de verificat", "De verificat › Rudenie", "/de-verificat#rudenie", "write", "rudenie neam frati parinti legaturi de rudenie propuneri numele parintilor"),
  e("Rugăciune", "Rugăciune", "/rugaciune", "rugaciune", "rugaciune familia saptamanii mesaj whatsapp pomenire"),
  e("Disciplină", "Disciplină", "/disciplina", "disciplina", "disciplina masuri excludere suspendare mustrare contestatie"),
  e("Setări", "Setări", "/setari", "read", "setari configurare optiuni"),
  // Setări: sections and pages.
  e("Organizația", "Setări › Organizația", "/setari#organizatia", "read", "nume biserica adresa org nr organizatia pastor secretar telefon email securitate autentificare obligatorie semnatura"),
  e("Nota de informare", "Setări › Confidențialitate", "/setari#confidentialitate", "read", "nota de informare gdpr confidentialitate date personale privacy"),
  e("Nota de informare: diferențe", "Setări › Nota de informare", "/setari/nota-informare", "admin", "nota de informare model nou diferente gdpr confidentialitate versiune"),
  e("Nomenclatoare", "Setări › Nomenclatoare", "/setari#nomenclatoare", "read", "nomenclator nomenclatoare tipuri sedinte tipuri evenimente tipuri mentiuni grade de rudenie categorii patrimoniu"),
  e("Funcții și slujiri", "Setări › Nomenclatoare › Funcții și slujiri", "/setari/functii", "read", "nomenclator functii slujiri pastor diacon prezbiter roluri biserica"),
  e("Categorii de patrimoniu", "Setări › Nomenclatoare › Categorii de patrimoniu", "/setari/patrimoniu", "read", "nomenclator categorii patrimoniu subcategorii inventar"),
  e("Linkul cererii de membru", "Setări › Linkul cererii de membru", "/setari#cerere", "write", "cerere de membru qr cod qr afis link formular online"),
  e("Comitetul bisericii", "Setări › Comitetul bisericii", "/setari#comitet", "read", "comitet mandat alegeri prelungire art 45"),
  e("Rugăciunea săptămânală: modelele mesajului", "Setări › Rugăciunea săptămânală", "/setari#rugaciune", "read", "rugaciune familia saptamanii mesaj model text whatsapp"),
  e("Statute", "Setări › Statute", "/setari#statute", "read", "statut statute statutul cultului statut intern pdf"),
  e("Extrase din statut", "Setări › Extrase din statut", "/setari#extrase", "read", "statut extrase drepturi obligatii membru"),
  e("Tema", "Setări › Aspect", "/setari#aspect", "read", "tema intunecat luminos dark mode aspect culori"),
  e("Utilizatori și roluri", "Setări › Utilizatori și roluri", "/setari/utilizatori", ["admin", "pastor"], "utilizatori roluri invitatie cont nou administrator secretar vizualizare pastor dezactivare"),
  e("Acces la disciplină", "Setări › Utilizatori și roluri", "/setari/utilizatori", ["admin", "pastor"], "acces disciplina masuri disciplinare art 44"),
  e("Copie de siguranță", "Setări › Copie de siguranță", "/setari/date", "export", "backup copie de siguranta export import restaurare json salvare date"),
  e("Actualizare date", "Setări › Actualizare date", "/setari/actualizare-date", "write", "campanie actualizare date link personal whatsapp acorduri gdpr formular"),
  e("Jurnal de modificări", "Setări › Jurnal de modificări", "/setari/jurnal", "audit", "jurnal audit modificari istoric cine a modificat"),
  // Contul meu.
  e("Contul meu", "Contul meu", "/cont", "account", "cont profil contul meu email"),
  e("Schimbă parola", "Contul meu › Parola", "/cont#parola", "account", "parola schimba parola parola noua"),
  e("Aspect", "Contul meu › Aspect", "/cont#aspect", "account", "marime text font litere mari a+ aspect tema zoom scris mare"),
  e("Securitate", "Contul meu › Securitate", "/cont#securitate", "account", "parola 2fa autentificare doi pasi passkey cheie de acces cod coduri de rezerva totp securitate"),
  e("Face ID / amprentă", "Contul meu › Face ID / amprentă", "/cont#passkeys", "account", "passkey cheie de acces face id amprenta pin telefon"),
  e("Notificări", "Contul meu › Notificări", "/cont#notificari", "account", "notificari push alerte telefon"),
  e("Semnătura mea", "Contul meu › Semnătura mea", "/cont#semnatura", "read", "semnatura semnatura salvata desen"),
  e("Profil", "Contul meu", "/cont#profil", "account", "profil nume deconectare toate dispozitivele"),
];

export function canOpen(entry: SearchEntry, who: Who): boolean {
  return (Array.isArray(entry.permission) ? entry.permission : [entry.permission]).some((p) => permissions[p](who));
}

/**
 * The entries this user may open that match every word of `q` (without diacritics), best first: the
 * title starting with the query, then the title containing it, then the keywords.
 */
export function searchPages(q: string, who: Who, limit = Infinity): SearchEntry[] {
  const terms = searchTerms(q);
  if (!terms.length) return [];
  const query = normalizeSearch(q);
  const scored = SEARCH_INDEX.filter((x) => canOpen(x, who))
    .map((x) => {
      const title = normalizeSearch(x.title);
      const hay = `${title} ${normalizeSearch(x.path)} ${x.keywords}`;
      if (!terms.every((t) => hay.includes(t))) return null;
      const score = title.startsWith(query) ? 0 : title.includes(query) ? 1 : x.keywords.includes(query) ? 2 : 3;
      return { x, score };
    })
    .filter((s): s is { x: SearchEntry; score: number } => s !== null)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.x);
}
