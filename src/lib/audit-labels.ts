import { DOCUMENT_TYPE_LABEL, ENTRY_LABEL, EXIT_LABEL, GENDER_LABEL, ROLE_LABEL, STATUS_LABEL } from "./labels";
import { fmt } from "./format";

/** Etichetele câmpurilor afișate în jurnalul de modificări. */
export const FIELD_LABELS: Record<string, string> = {
  nume: "Nume",
  prenume: "Prenume",
  statut: "Statut",
  gen: "Gen",
  familie: "Familie",
  rudenie: "Grad de rudenie",
  dataNasterii: "Data nașterii",
  telefon: "Telefon",
  email: "E-mail",
  adresa: "Adresă",
  dataMembru: "Data intrării",
  modIntrare: "Mod de intrare",
  bisericaProvenienta: "Biserica de proveniență",
  dataBotez: "Botez în apă",
  locBotez: "Locul botezului",
  dataBinecuvantare: "Binecuvântare ca copil",
  dataIesire: "Data ieșirii",
  modIesire: "Mod de ieșire",
  bisericaDestinatie: "Biserica de destinație",
  slujire: "Slujire",
  note: "Note",
  tip: "Tip",
  nr: "Număr",
  data: "Data",
  persoana: "Persoana",
  catre: "Către",
  scop: "Scop",
  titlu: "Titlu",
  text: "Conținut",
  anRaport: "Anul raportat",
  ora: "Ora",
  loc: "Locul",
  presedinte: "Președinte",
  invitati: "Invitați",
  ordine: "Ordinea de zi",
  discutii: "Discuții",
  hotarari: "Hotărâri",
  prezenti: "Prezenți",
  invitat: "Invitat",
  responsabil: "Responsabil",
  descriere: "Descriere",
  agapaActiva: "Agapă",
  agapaResponsabil: "Responsabil agapă",
  agapaPersoane: "Persoane la agapă",
  contributii: "Contribuții",
  membri: "Persoane",
  rol: "Rol",
  role: "Rol",
  active: "Activ",
  sursa: "Sursa",
  adresaOrg: "Adresă",
  orgNr: "Org.nr.",
  pastor: "Pastor",
  secretar: "Secretar",
  nomenclatoare: "Nomenclatoare",
  inregistrari: "Înregistrări",
  mod: "Mod",
};

const DATE_FIELDS = new Set(["dataNasterii", "dataMembru", "dataBotez", "dataBinecuvantare", "dataIesire", "data"]);

/** Valoarea afișată pentru un câmp din jurnal (etichete românești pentru enumerări și date). */
export function displayAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const v = String(value);
  if (DATE_FIELDS.has(field) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmt(v);
  if (field === "statut") return STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v;
  if (field === "modIntrare") return ENTRY_LABEL[v as keyof typeof ENTRY_LABEL] ?? v;
  if (field === "modIesire") return EXIT_LABEL[v as keyof typeof EXIT_LABEL] ?? v;
  if (field === "gen") return GENDER_LABEL[v as keyof typeof GENDER_LABEL] ?? v;
  if (field === "role" || field === "rol") return ROLE_LABEL[v as keyof typeof ROLE_LABEL] ?? v;
  if (field === "tip" && v in DOCUMENT_TYPE_LABEL) return DOCUMENT_TYPE_LABEL[v as keyof typeof DOCUMENT_TYPE_LABEL];
  if (typeof value === "boolean") return value ? "da" : "nu";
  return v.length > 160 ? `${v.slice(0, 157)}…` : v;
}

export const ACTION_LABEL = { CREATE: "a adăugat", UPDATE: "a modificat", DELETE: "a șters" } as const;
export const ENTITY_LABEL = {
  PERSON: "Persoană",
  DOCUMENT: "Document",
  MEETING: "Proces-verbal",
  EVENT: "Eveniment",
  GROUP: "Grup",
  NOTE: "Mențiune",
  SETTINGS: "Setări",
  USER: "Utilizator",
  IMPORT: "Import",
} as const;
