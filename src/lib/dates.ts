/**
 * Utilitare pentru date calendaristice în format ISO „AAAA-LL-ZZ”.
 * Toată logica de domeniu (statistici, documente) lucrează cu șiruri ISO, exact ca prototipul,
 * ceea ce evită problemele de fus orar ale obiectelor Date.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo - 1);
}

/** Numărul de zile din lună (luna 0–11). */
export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Fusul orar folosit pentru „azi” (configurabil prin APP_TIME_ZONE). */
export function appTimeZone(): string {
  return process.env.APP_TIME_ZONE || "Europe/Bucharest";
}

/** Data de azi (AAAA-LL-ZZ) în fusul orar al aplicației. */
export function todayIso(timeZone: string = appTimeZone(), now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Echivalentul `inYear` din prototip: data începe cu anul dat. */
export function inYear(iso: string | null | undefined, year: number | string): boolean {
  return (iso || "").startsWith(String(year));
}

/** Vârsta împlinită la data `at` pentru o persoană născută la `birth` (ambele ISO). */
export function ageAt(birth: string, at: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ay, am, ad] = at.split("-").map(Number);
  let a = ay - by;
  if (am < bm || (am === bm && ad < bd)) a--;
  return a;
}

/** Conversie din coloana `date` (Prisma întoarce Date la miezul nopții UTC) în șir ISO. */
export function fromDbDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Conversie din șir ISO în valoare pentru o coloană `date`. */
export function toDbDate(iso: string | null | undefined): Date | null {
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
}

/** Adaugă `n` luni la o lună dată (an, lună 0–11). */
export function addMonths(year: number, month0: number, n: number): { year: number; month0: number } {
  const total = year * 12 + month0 + n;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
}

/** Ziua săptămânii cu luni = 0 ... duminică = 6. */
export function weekdayMondayFirst(year: number, month0: number, day: number): number {
  return (new Date(Date.UTC(year, month0, day)).getUTCDay() + 6) % 7;
}

export function isoFromParts(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "11.09.2026 14:03" in the app's time zone (signatures, closing time of the minutes). */
export function dotDateTime(d: Date, timeZone: string = appTimeZone()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Whole days from one ISO date to another (calendar arithmetic on the strings; negative if earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** The same day `n` months earlier (clamped to the month's last day): "2026-08-31", 6 → "2026-02-28". */
export function monthsBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = addMonths(y, m - 1, -n);
  return isoFromParts(t.year, t.month0, Math.min(d, daysInMonth(t.year, t.month0)));
}
