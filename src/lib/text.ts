/** Normalizare de text pentru căutare și ordonare alfabetică românească. */

/** Litere mici, fără diacritice (ș/ş → s, ț/ţ → t, ă/â → a, î → i), spații comprimate. */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Împarte o căutare în termeni (fiecare trebuie să apară în text). */
export function searchTerms(q: string): string[] {
  return normalizeSearch(q)
    .split(" ")
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

// Ordinea alfabetului românesc: a ă â b c d e f g h i î j k l m n o p q r s ș t ț u v w x y z.
const RO_ALPHABET = "aăâbcdefghiîjklmnopqrsștțuvwxyz";
const RANK = new Map<string, number>();
[...RO_ALPHABET].forEach((ch, i) => RANK.set(ch, 100 + i * 3));
// Variantele cu sedilă (ş, ţ) sunt tratate ca ș, ț.
RANK.set("ş", RANK.get("ș")!);
RANK.set("ţ", RANK.get("ț")!);

/** Ponderea primară (litera) și secundară (accent străin, ex. é, ö) a unui caracter. */
function weights(ch: string): [number, number] {
  if (ch === " ") return [10, 0];
  if (ch === "-" || ch === "'" || ch === "’" || ch === ".") return [11, 0];
  if (ch >= "0" && ch <= "9") return [20 + (ch.charCodeAt(0) - 48), 0];
  const r = RANK.get(ch);
  if (r !== undefined) return [r, 0];
  // Alte litere accentuate (é, ö, ...) au aceeași pondere primară ca litera de bază.
  const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const rb = RANK.get(base);
  if (rb !== undefined) return [rb, 1];
  return [999, 0];
}

const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * Cheie de ordonare independentă de colaționarea bazei de date. Fiecare caracter devine un cod de
 * 3 cifre după poziția în alfabetul românesc (ă, â, î, ș, ț sunt litere distincte); urmează un
 * separator și ponderile secundare (accente străine). Compararea lexicografică a cheilor reproduce
 * ordinea `localeCompare(…, "ro")` din prototip, fără diferențe de majuscule.
 */
export function romanianSortKey(s: string): string {
  const w = [...s.toLowerCase().normalize("NFC")].map(weights);
  return w.map(([p]) => pad3(p)).join("") + "000" + w.map(([, sec]) => pad3(sec)).join("");
}

export function personSortKey(nume: string, prenume: string): string {
  return romanianSortKey(`${nume} ${prenume}`.trim());
}

export function compareRo(a: string, b: string): number {
  return a.localeCompare(b, "ro");
}
