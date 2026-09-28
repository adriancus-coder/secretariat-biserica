/**
 * Date demo: o biserică completă (familii, botezuri pe mai mulți ani, transferuri, ieșiri,
 * evenimente cu agapă, procese-verbale, documente, grupuri, mențiuni) și trei utilizatori:
 *
 *   admin@demo.ro        (Administrator)
 *   secretar@demo.ro     (Secretar)
 *   vizualizare@demo.ro  (Vizualizare)
 *
 * Parola pentru toți: demo1234
 *
 * Rulare: npm run db:seed  (sau `npx prisma db seed`). Scriptul este idempotent: șterge și
 * recreează doar biserica demo (id „demo”); celelalte biserici nu sunt atinse.
 * Datele sunt relative la anul curent, ca statistica și darea de seamă să aibă conținut.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { defaultDocumentTitle, generateDocumentText, type DocPerson } from "../src/domain/documents";
import { buildReportText } from "../src/domain/report";
import { computeStats } from "../src/domain/stats";
import type { PersonRecord } from "../src/domain/types";
import { inYear, todayIso } from "../src/lib/dates";
import { noteSearchText, personDerived } from "../src/lib/person-derived";
import { hashPassword } from "../src/server/password";

const DEMO_CHURCH_ID = "demo";
const PASSWORD = "demo1234";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const TODAY = todayIso();
const Y = Number(TODAY.slice(0, 4));
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Dată relativă: anul curent minus `ago`, lună, zi. */
const d = (ago: number, month: number, day: number) =>
  `${Y - ago}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const addDays = (iso: string, n: number) => new Date(date(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const clampPast = (iso: string) => (iso > TODAY ? TODAY : iso);

type P = {
  key: string;
  nume: string;
  prenume: string;
  gen: "M" | "F";
  statut?: "MEMBRU" | "APARTINATOR" | "PRIETEN" | "COPIL" | "FOST_MEMBRU";
  familie?: string;
  rudenie?: string;
  dataNasterii?: string;
  telefon?: string;
  email?: string;
  adresa?: string;
  dataMembru?: string;
  modIntrare?: "BOTEZ" | "TRANSFER" | "NASCUT_IN_BISERICA" | "REPRIMIRE" | "ALTUL";
  bisericaProvenienta?: string;
  dataBotez?: string;
  locBotez?: string;
  dataBinecuvantare?: string;
  dataIesire?: string;
  modIesire?: "TRANSFER" | "RETRAGERE" | "DECES" | "EXCLUDERE" | "ALTUL";
  bisericaDestinatie?: string;
  slujire?: string;
  note?: string;
  /** Data la care persoana a fost trecută în registru (pentru cei fără dată de intrare). */
  inregistrat?: string;
};

const BAPTISTERIU = "baptisteriul bisericii";

const PERSONS: P[] = [
  // Familia Mureșan (pastorul)
  { key: "daniel", nume: "Mureșan", prenume: "Daniel", gen: "M", familie: "Mureșan", rudenie: "Cap de familie", dataNasterii: "1968-11-11", telefon: "+47 912 34 501", email: "daniel.muresan@example.org", adresa: "Kongsgårdbakken 3, Stavanger", dataMembru: d(18, 9, 1), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Betel Oslo", dataBotez: "1986-06-22", locBotez: "Biserica Emanuel Oradea", slujire: "pastor" },
  { key: "rodica", nume: "Mureșan", prenume: "Rodica", gen: "F", familie: "Mureșan", rudenie: "Soție", dataNasterii: "1970-03-15", telefon: "+47 912 34 502", adresa: "Kongsgårdbakken 3, Stavanger", dataMembru: d(18, 9, 1), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Betel Oslo", dataBotez: "1988-07-10", slujire: "cor, școala duminicală" },
  { key: "lidia", nume: "Mureșan", prenume: "Lidia", gen: "F", familie: "Mureșan", rudenie: "Fiică", dataNasterii: "2001-05-20", telefon: "+47 912 34 503", dataMembru: d(10, 5, 15), modIntrare: "BOTEZ", dataBotez: d(10, 5, 15), locBotez: BAPTISTERIU, slujire: "tineret, cor" },
  // Familia Popescu
  { key: "ion", nume: "Popescu", prenume: "Ion", gen: "M", familie: "Popescu", rudenie: "Cap de familie", dataNasterii: "1972-04-12", telefon: "+47 913 11 201", email: "ion.popescu@example.org", adresa: "Madlaveien 14, Stavanger", dataMembru: d(20, 3, 2), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Harul Cluj", dataBotez: "1992-06-14", locBotez: "Râul Someș, Cluj", slujire: "diacon, comitet" },
  { key: "maria", nume: "Popescu", prenume: "Maria", gen: "F", familie: "Popescu", rudenie: "Soție", dataNasterii: "1975-09-03", telefon: "+47 913 11 202", adresa: "Madlaveien 14, Stavanger", dataMembru: d(20, 3, 2), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Harul Cluj", dataBotez: "1994-08-21", slujire: "cor" },
  { key: "andrei", nume: "Popescu", prenume: "Andrei", gen: "M", familie: "Popescu", rudenie: "Fiu", dataNasterii: "2005-02-10", dataMembru: d(3, 6, 18), modIntrare: "BOTEZ", dataBotez: d(3, 6, 18), locBotez: BAPTISTERIU, slujire: "tineret, sunet" },
  { key: "anapopescu", nume: "Popescu", prenume: "Ana", gen: "F", statut: "COPIL", familie: "Popescu", rudenie: "Fiică", dataNasterii: "2012-07-19", dataMembru: "2012-07-19", modIntrare: "NASCUT_IN_BISERICA", dataBinecuvantare: "2012-10-07" },
  // Familia Ionescu
  { key: "mihai", nume: "Ionescu", prenume: "Mihai", gen: "M", familie: "Ionescu", rudenie: "Cap de familie", dataNasterii: "1980-01-25", telefon: "+47 918 20 301", email: "mihai.ionescu@example.org", adresa: "Hillevågsveien 22, Stavanger", dataMembru: d(12, 5, 20), modIntrare: "BOTEZ", dataBotez: d(12, 5, 20), locBotez: BAPTISTERIU, slujire: "comitet, casier" },
  { key: "elena", nume: "Ionescu", prenume: "Elena", gen: "F", familie: "Ionescu", rudenie: "Soție", dataNasterii: "1983-06-30", telefon: "+47 918 20 302", adresa: "Hillevågsveien 22, Stavanger", dataMembru: d(12, 5, 20), modIntrare: "BOTEZ", dataBotez: d(12, 5, 20), locBotez: BAPTISTERIU, slujire: "școala duminicală" },
  { key: "david", nume: "Ionescu", prenume: "David", gen: "M", statut: "COPIL", familie: "Ionescu", rudenie: "Fiu", dataNasterii: d(4, 3, 8), dataMembru: d(4, 3, 8), modIntrare: "NASCUT_IN_BISERICA", dataBinecuvantare: d(4, 6, 12) },
  { key: "sara", nume: "Ionescu", prenume: "Sara", gen: "F", statut: "COPIL", familie: "Ionescu", rudenie: "Fiică", dataNasterii: d(1, 11, 2), dataMembru: d(1, 11, 2), modIntrare: "NASCUT_IN_BISERICA", dataBinecuvantare: clampPast(d(0, 2, 15)) },
  // Familia Pop (secretara)
  { key: "vasile", nume: "Pop", prenume: "Vasile", gen: "M", familie: "Pop", rudenie: "Cap de familie", dataNasterii: "1985-02-02", telefon: "+47 920 44 101", adresa: "Tjensvollveien 7, Stavanger", dataMembru: d(9, 9, 12), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Speranța Timișoara", dataBotez: "2004-05-30", slujire: "muzică" },
  { key: "ioana", nume: "Pop", prenume: "Ioana", gen: "F", familie: "Pop", rudenie: "Soție", dataNasterii: "1988-08-08", telefon: "+47 920 44 102", email: "ioana.pop@example.org", adresa: "Tjensvollveien 7, Stavanger", dataMembru: d(9, 9, 12), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Speranța Timișoara", dataBotez: "2006-06-11", slujire: "secretară, comitet" },
  { key: "iosif", nume: "Pop", prenume: "Iosif", gen: "M", statut: "COPIL", familie: "Pop", rudenie: "Fiu", dataNasterii: "2015-09-09", dataMembru: "2015-09-09", modIntrare: "NASCUT_IN_BISERICA", dataBinecuvantare: "2016-01-17" },
  // Familia Ștefănescu
  { key: "petru", nume: "Ștefănescu", prenume: "Petru", gen: "M", familie: "Ștefănescu", rudenie: "Cap de familie", dataNasterii: "1958-12-01", telefon: "+47 915 00 111", adresa: "Eiganesveien 40, Stavanger", dataMembru: d(22, 1, 10), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Baptistă Brașov", dataBotez: "1980-08-17", slujire: "prezbiter, comitet" },
  { key: "viorica", nume: "Ștefănescu", prenume: "Viorica", gen: "F", familie: "Ștefănescu", rudenie: "Soție", dataNasterii: "1961-04-04", telefon: "+47 915 00 112", adresa: "Eiganesveien 40, Stavanger", dataMembru: d(22, 1, 10), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Baptistă Brașov", dataBotez: "1982-09-05", slujire: "surori, vizite" },
  // Familia Țurcanu
  { key: "radu", nume: "Țurcanu", prenume: "Radu", gen: "M", familie: "Țurcanu", rudenie: "Cap de familie", dataNasterii: "1990-10-10", telefon: "+47 921 10 001", dataMembru: d(2, 6, 16), modIntrare: "BOTEZ", dataBotez: d(2, 6, 16), locBotez: "Lacul Mosvatnet" },
  { key: "cristina", nume: "Țurcanu", prenume: "Cristina", gen: "F", statut: "PRIETEN", familie: "Țurcanu", rudenie: "Soție", dataNasterii: "1992-12-12", telefon: "+47 921 10 002", inregistrat: d(3, 2, 1) },
  { key: "matei", nume: "Țurcanu", prenume: "Matei", gen: "M", statut: "COPIL", familie: "Țurcanu", rudenie: "Fiu", dataNasterii: d(2, 1, 5), dataMembru: d(2, 1, 5), modIntrare: "NASCUT_IN_BISERICA", dataBinecuvantare: d(2, 4, 21) },
  // Familia Lungu
  { key: "gheorghe", nume: "Lungu", prenume: "Gheorghe", gen: "M", familie: "Lungu", rudenie: "Cap de familie", dataNasterii: "1950-05-05", dataMembru: d(25, 5, 5), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Baptistă Suceava", dataBotez: "1970-07-19", dataIesire: d(1, 11, 20), modIesire: "DECES" },
  { key: "ecaterina", nume: "Lungu", prenume: "Ecaterina", gen: "F", familie: "Lungu", rudenie: "Soție", dataNasterii: "1953-07-07", telefon: "+47 516 77 889", dataMembru: d(25, 5, 5), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Baptistă Suceava", dataBotez: "1972-08-13" },
  // Familia Barbu (transferați în alt oraș)
  { key: "florin", nume: "Barbu", prenume: "Florin", gen: "M", statut: "FOST_MEMBRU", familie: "Barbu", rudenie: "Cap de familie", dataNasterii: "1987-03-03", dataMembru: d(8, 4, 1), modIntrare: "BOTEZ", dataBotez: d(8, 4, 1), dataIesire: d(1, 8, 31), modIesire: "TRANSFER", bisericaDestinatie: "Biserica Emanuel Bergen" },
  { key: "adina", nume: "Barbu", prenume: "Adina", gen: "F", statut: "FOST_MEMBRU", familie: "Barbu", rudenie: "Soție", dataNasterii: "1989-09-19", dataMembru: d(8, 4, 1), modIntrare: "BOTEZ", dataBotez: d(8, 4, 1), dataIesire: d(1, 8, 31), modIesire: "TRANSFER", bisericaDestinatie: "Biserica Emanuel Bergen" },
  { key: "ruth", nume: "Barbu", prenume: "Ruth", gen: "F", statut: "FOST_MEMBRU", familie: "Barbu", rudenie: "Fiică", dataNasterii: "2014-11-30", dataMembru: "2014-11-30", modIntrare: "NASCUT_IN_BISERICA", dataBinecuvantare: "2015-03-08", dataIesire: d(1, 8, 31), modIesire: "TRANSFER", bisericaDestinatie: "Biserica Emanuel Bergen" },
  // Familia Avram (reprimire)
  { key: "nicolae", nume: "Avram", prenume: "Nicolae", gen: "M", familie: "Avram", rudenie: "Cap de familie", dataNasterii: "1978-06-06", telefon: "+47 930 12 345", dataMembru: d(1, 3, 9), modIntrare: "REPRIMIRE", dataBotez: "1999-05-23" },
  { key: "lucia", nume: "Avram", prenume: "Lucia", gen: "F", familie: "Avram", rudenie: "Soție", dataNasterii: "1980-02-14", telefon: "+47 930 12 346", dataMembru: d(15, 10, 4), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Harul Cluj", dataBotez: "2000-06-18", slujire: "agape" },
  // Familia Ciobanu
  { key: "emanuel", nume: "Ciobanu", prenume: "Emanuel", gen: "M", familie: "Ciobanu", rudenie: "Cap de familie", dataNasterii: "1983-08-18", telefon: "+47 940 55 010", email: "emanuel.ciobanu@example.org", dataMembru: d(14, 7, 6), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Betel Oslo", dataBotez: "2002-07-07", slujire: "comitet, tineret" },
  { key: "naomi", nume: "Ciobanu", prenume: "Naomi", gen: "F", familie: "Ciobanu", rudenie: "Soție", dataNasterii: "1986-10-01", telefon: "+47 940 55 011", dataMembru: d(7, 9, 1), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Betel Oslo", dataBotez: "2005-08-28", slujire: "școala duminicală" },
  { key: "beniamin", nume: "Ciobanu", prenume: "Beniamin", gen: "M", familie: "Ciobanu", rudenie: "Fiu", dataNasterii: "2010-12-24", dataMembru: clampPast(d(0, 5, 24)), modIntrare: "BOTEZ", dataBotez: clampPast(d(0, 5, 24)), locBotez: BAPTISTERIU, slujire: "tineret" },
  { key: "estera", nume: "Ciobanu", prenume: "Estera", gen: "F", statut: "COPIL", familie: "Ciobanu", rudenie: "Fiică", dataNasterii: d(7, 3, 30), dataMembru: d(7, 3, 30), modIntrare: "NASCUT_IN_BISERICA", dataBinecuvantare: d(7, 6, 9) },
  // Familia Dumitru (tineri căsătoriți)
  { key: "alin", nume: "Dumitru", prenume: "Alin", gen: "M", familie: "Dumitru", rudenie: "Cap de familie", dataNasterii: "1999-02-28", telefon: "+47 945 00 777", dataMembru: d(5, 7, 4), modIntrare: "BOTEZ", dataBotez: d(5, 7, 4), locBotez: BAPTISTERIU, slujire: "tineret, muzică" },
  { key: "bianca", nume: "Dumitru", prenume: "Bianca", gen: "F", familie: "Dumitru", rudenie: "Soție", dataNasterii: "2000-07-31", telefon: "+47 945 00 778", dataMembru: d(3, 6, 18), modIntrare: "BOTEZ", dataBotez: d(3, 6, 18), locBotez: BAPTISTERIU },
  // Persoane singure, prieteni, aparținători
  { key: "samuel", nume: "Munteanu", prenume: "Samuel", gen: "M", familie: "Munteanu", dataNasterii: "2003-04-04", telefon: "+47 950 01 234", dataMembru: clampPast(d(0, 5, 24)), modIntrare: "BOTEZ", dataBotez: clampPast(d(0, 5, 24)), locBotez: BAPTISTERIU, slujire: "tineret" },
  { key: "ruxandra", nume: "Enache", prenume: "Ruxandra", gen: "F", familie: "Enache", dataNasterii: "1994-11-11", telefon: "+47 951 22 333", email: "ruxandra.enache@example.org", dataMembru: clampPast(d(0, 3, 1)), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Harul Cluj", dataBotez: "2012-06-03", slujire: "cor" },
  { key: "timotei", nume: "Rusu", prenume: "Timotei", gen: "M", statut: "PRIETEN", familie: "Rusu", dataNasterii: "1995-01-15", telefon: "+47 952 10 010", inregistrat: d(2, 9, 10) },
  { key: "debora", nume: "Rusu", prenume: "Debora", gen: "F", statut: "APARTINATOR", familie: "Rusu", dataNasterii: "1997-05-05", dataMembru: d(4, 1, 15), modIntrare: "ALTUL", dataBotez: "2015-07-12", locBotez: "Biserica Penticostală Iași" },
  { key: "ilie", nume: "Georgescu", prenume: "Ilie", gen: "M", familie: "Georgescu", rudenie: "Cap de familie", dataNasterii: "1945-01-01", telefon: "+47 516 00 100", dataMembru: d(24, 2, 2), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Baptistă Arad", dataBotez: "1965-06-06" },
  { key: "mariag", nume: "Georgescu", prenume: "Maria", gen: "F", familie: "Georgescu", rudenie: "Soție", dataNasterii: "1948-03-03", dataMembru: d(24, 2, 2), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Baptistă Arad", dataBotez: "1967-06-11", dataIesire: d(2, 3, 3), modIesire: "DECES" },
  { key: "stefan", nume: "Marin", prenume: "Ștefan", gen: "M", statut: "FOST_MEMBRU", dataNasterii: "1965-09-09", dataMembru: d(16, 5, 5), modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Betel Oslo", dataBotez: "1990-05-20", dataIesire: d(3, 2, 1), modIesire: "RETRAGERE" },
  { key: "kari", nume: "Olsen", prenume: "Kari", gen: "F", statut: "PRIETEN", dataNasterii: "1991-06-21", telefon: "+47 470 12 345", note: "Colegă de serviciu a Ioanei Pop; vine la serviciile de duminică seara.", inregistrat: d(1, 10, 5) },
  { key: "erik", nume: "Nilsen", prenume: "Erik", gen: "M", statut: "PRIETEN", dataNasterii: "1988-02-17", inregistrat: clampPast(d(0, 4, 2)) },
  { key: "iacob", nume: "Ardelean", prenume: "Iacob", gen: "M", statut: "APARTINATOR", dataNasterii: "1976-12-05", telefon: "+47 960 03 030", dataMembru: d(6, 5, 1), modIntrare: "ALTUL", dataBotez: "1998-09-13", note: "Membru al Bisericii Harul Cluj; locuiește temporar în Stavanger." },
];

async function main() {
  console.log(`Seed pentru biserica demo (azi = ${TODAY})…`);
  await prisma.church.deleteMany({ where: { id: DEMO_CHURCH_ID } });
  await prisma.user.deleteMany({ where: { email: { in: ["admin@demo.ro", "secretar@demo.ro", "vizualizare@demo.ro"] } } });

  const church = await prisma.church.create({
    data: {
      id: DEMO_CHURCH_ID,
      nume: "Maranata Stavanger",
      adresa: "Kongsgårdbakken 1, 4005 Stavanger, Norvegia",
      orgNr: "912 345 678",
      telefon: "+47 51 00 00 00",
      email: "secretariat@maranata-stavanger.no",
      pastor: "Daniel Mureșan",
      secretar: "Ioana Pop",
    },
  });
  const churchId = church.id;

  const passwordHash = await hashPassword(PASSWORD);
  const [admin] = await Promise.all([
    prisma.user.create({ data: { churchId, email: "admin@demo.ro", name: "Daniel Mureșan", passwordHash, role: "ADMIN" } }),
    prisma.user.create({ data: { churchId, email: "secretar@demo.ro", name: "Ioana Pop", passwordHash, role: "SECRETAR" } }),
    prisma.user.create({ data: { churchId, email: "vizualizare@demo.ro", name: "Emanuel Ciobanu", passwordHash, role: "VIZUALIZARE" } }),
  ]);

  // Persoane
  const ids = new Map<string, string>();
  for (const p of PERSONS) {
    const data: Prisma.PersonUncheckedCreateInput = {
      churchId,
      nume: p.nume,
      prenume: p.prenume,
      statut: p.statut ?? "MEMBRU",
      gen: p.gen,
      familie: p.familie ?? "",
      rudenie: p.rudenie ?? "",
      dataNasterii: p.dataNasterii ? date(p.dataNasterii) : null,
      telefon: p.telefon ?? "",
      email: p.email ?? "",
      adresa: p.adresa ?? "",
      dataMembru: p.dataMembru ? date(p.dataMembru) : null,
      modIntrare: p.modIntrare ?? null,
      bisericaProvenienta: p.bisericaProvenienta ?? "",
      dataBotez: p.dataBotez ? date(p.dataBotez) : null,
      locBotez: p.locBotez ?? "",
      dataBinecuvantare: p.dataBinecuvantare ? date(p.dataBinecuvantare) : null,
      dataIesire: p.dataIesire ? date(p.dataIesire) : null,
      modIesire: p.modIesire ?? null,
      bisericaDestinatie: p.bisericaDestinatie ?? "",
      slujire: p.slujire ?? "",
      note: p.note ?? "",
      ...personDerived({ nume: p.nume, prenume: p.prenume, familie: p.familie ?? "", telefon: p.telefon ?? "", email: p.email ?? "" }),
      ...(p.inregistrat ? { createdAt: date(p.inregistrat) } : {}),
    };
    const created = await prisma.person.create({ data });
    ids.set(p.key, created.id);
  }
  const pid = (k: string) => {
    const id = ids.get(k);
    if (!id) throw new Error(`persoană necunoscută: ${k}`);
    return id;
  };

  // Evenimente (trecute și viitoare)
  type E = Omit<Prisma.EventUncheckedCreateInput, "churchId" | "data"> & { data: string; contributii?: [string, string][] };
  const events: E[] = [
    { titlu: "Nunta Alin și Bianca Dumitru", tip: "Nuntă", data: d(2, 8, 17), ora: "14:00", loc: "Sala bisericii", responsabil: "Daniel Mureșan" },
    { titlu: "Nunta Samuel Munteanu și Lidia Mureșan", tip: "Nuntă", data: clampPast(d(0, 8, 15)), ora: "15:00", loc: "Sala bisericii", responsabil: "Daniel Mureșan", agapaActiva: true, agapaResponsabil: "Lucia Avram", agapaPersoane: 140 },
    { titlu: "Înmormântarea sorei Maria Georgescu", tip: "Înmormântare", data: d(2, 3, 7), ora: "12:00", loc: "Cimitirul Eiganes" },
    { titlu: "Înmormântarea fratelui Gheorghe Lungu", tip: "Înmormântare", data: d(1, 11, 24), ora: "12:00", loc: "Cimitirul Eiganes", responsabil: "Petru Ștefănescu" },
    { titlu: "Botez nou-testamentar", tip: "Botez", data: d(3, 6, 18), ora: "10:00", loc: BAPTISTERIU, descriere: "Botezul lui Andrei Popescu și al Biancăi Dumitru." },
    { titlu: "Botez la lac", tip: "Botez", data: d(2, 6, 16), ora: "11:00", loc: "Lacul Mosvatnet", agapaActiva: true, agapaResponsabil: "Rodica Mureșan", agapaPersoane: 90, contributii: [["Familia Popescu", "sarmale"], ["Familia Ionescu", "prăjituri"], ["Tineretul", "băuturi"]] },
    { titlu: "Botez nou-testamentar", tip: "Botez", data: clampPast(d(0, 5, 24)), ora: "10:00", loc: BAPTISTERIU, descriere: "Botezul lui Samuel Munteanu și al lui Beniamin Ciobanu." },
    { titlu: "Conferința familiilor", tip: "Conferință", data: d(1, 4, 12), ora: "10:00", loc: "Sala bisericii", invitat: "Pastor Vasile Talpoș", agapaActiva: true, agapaResponsabil: "Lucia Avram", agapaPersoane: 120, contributii: [["Surorile", "ciorbă și friptură"], ["Familia Ciobanu", "cozonac"]] },
    { titlu: "Seară de evanghelizare", tip: "Evanghelizare", data: d(1, 10, 18), ora: "18:00", loc: "Sala bisericii", invitat: "Fratele Beni Fărcaș" },
    { titlu: "Tabăra de tineret", tip: "Tineret", data: clampPast(d(0, 7, 4)), loc: "Sirdal", responsabil: "Emanuel Ciobanu" },
    { titlu: "Serviciu de mulțumire", tip: "Serviciu divin", data: d(1, 10, 5), ora: "10:00", agapaActiva: true, agapaResponsabil: "Viorica Ștefănescu", agapaPersoane: 110, contributii: [["Familia Pop", "salate"], ["Familia Țurcanu", "desert"]] },
    // viitoare (relative la azi)
    { titlu: "Ziua Recoltei — serviciu de mulțumire", tip: "Serviciu divin", data: addDays(TODAY, 5), ora: "10:00", loc: "Sala bisericii", agapaActiva: true, agapaResponsabil: "Lucia Avram", agapaPersoane: 120, contributii: [["Familia Popescu", "sarmale"], ["Familia Ionescu", "salată de boeuf"], ["Familia Pop", "cozonac"], ["Tineretul", "aranjarea meselor"]] },
    { titlu: "Seară de evanghelizare", tip: "Evanghelizare", data: addDays(TODAY, 12), ora: "18:00", loc: "Sala bisericii", invitat: "Pastor Ioan Bunaciu", responsabil: "Daniel Mureșan" },
    { titlu: "Conferința tinerilor", tip: "Conferință", data: addDays(TODAY, 26), ora: "17:00", loc: "Sala bisericii", responsabil: "Emanuel Ciobanu", descriere: "Tema: „Credincioși în lucrurile mici”." },
    { titlu: "Ordinarea fratelui Mihai Ionescu ca diacon", tip: "Ordinare", data: addDays(TODAY, 40), ora: "10:00" },
    { titlu: "Serbarea copiilor", tip: "Serviciu divin", data: addDays(TODAY, 75), ora: "16:00", responsabil: "Naomi Ciobanu" },
  ];
  for (const { contributii, data, ...e } of events) {
    await prisma.event.create({
      data: {
        ...e,
        churchId,
        data: date(data),
        contributii: contributii ? { create: contributii.map(([cine, ce], i) => ({ pozitie: i, cine, ce })) } : undefined,
      },
    });
  }

  // Procese-verbale
  const comitet = ["daniel", "ion", "petru", "mihai", "emanuel", "ioana"];
  type M = { titlu: string; tip: string; data: string; prezenti: string[]; ordine: string; discutii?: string; hotarari?: string; invitati?: string };
  const meetings: M[] = [
    { titlu: "Adunarea generală anuală", tip: "Adunare generală", data: d(1, 1, 28), prezenti: [...ids.keys()].filter((k) => !["anapopescu", "david", "sara", "iosif", "matei", "estera", "ruth", "kari", "erik", "timotei", "cristina"].includes(k)).filter((k) => k !== "mariag" && k !== "stefan"), ordine: "1. Darea de seamă a secretarului\n2. Raportul financiar\n3. Planul de activitate", hotarari: "Se aprobă darea de seamă și raportul financiar.\nSe aprobă planul de activitate pentru anul în curs." },
    { titlu: "Planificarea conferinței familiilor", tip: "Comitet", data: d(1, 2, 20), prezenti: comitet, ordine: "1. Conferința familiilor\n2. Diverse", hotarari: "Conferința va avea loc în aprilie; responsabilă agapă: sora Lucia Avram." },
    { titlu: "Reprimirea fratelui Nicolae Avram", tip: "Frați slujitori", data: d(1, 3, 2), prezenti: ["daniel", "ion", "petru", "mihai"], ordine: "1. Cererea de reprimire a fratelui Nicolae Avram", discutii: "Fratele Avram și-a exprimat pocăința și dorința de a reveni în părtășie.", hotarari: "Se propune bisericii reprimirea fratelui Nicolae Avram în duminica de 9 martie." },
    { titlu: "Transferul familiei Barbu", tip: "Comitet", data: d(1, 8, 24), prezenti: comitet, ordine: "1. Cererea de transfer a familiei Barbu la Biserica Emanuel Bergen", hotarari: "Se aprobă eliberarea scrisorii de recomandare pentru familia Barbu." },
    { titlu: "Adunarea generală anuală", tip: "Adunare generală", data: clampPast(d(0, 1, 26)), prezenti: [...comitet, "rodica", "maria", "elena", "vasile", "viorica", "lucia", "naomi", "alin", "bianca", "radu", "ecaterina", "ilie", "lidia", "andrei"], ordine: "1. Darea de seamă pe anul trecut\n2. Raportul financiar\n3. Alegerea comitetului", hotarari: "Se aprobă darea de seamă.\nComitetul este reales pentru doi ani." },
    { titlu: "Pregătirea botezului", tip: "Comitet", data: clampPast(d(0, 4, 27)), prezenti: comitet, ordine: "1. Candidații la botez\n2. Organizarea agapei", discutii: "Au fost ascultate mărturiile candidaților Samuel Munteanu și Beniamin Ciobanu.", hotarari: "Botezul va avea loc pe 24 mai." },
    { titlu: "Planificare toamnă", tip: "Comitet", data: addDays(TODAY, -10), prezenti: comitet.filter((k) => k !== "petru"), invitati: "Lucia Avram (agape)", ordine: "1. Ziua Recoltei\n2. Seara de evanghelizare\n3. Conferința tinerilor", hotarari: "Ziua Recoltei cu agapă comună.\nInvitat la evanghelizare: pastor Ioan Bunaciu." },
  ];
  for (const m of meetings) {
    await prisma.meeting.create({
      data: {
        churchId,
        titlu: m.titlu,
        tip: m.tip,
        data: date(m.data),
        ora: "18:30",
        loc: "Sala mică",
        presedinte: "Daniel Mureșan",
        invitati: m.invitati ?? "",
        ordine: m.ordine,
        discutii: m.discutii ?? "",
        hotarari: m.hotarari ?? "",
        prezenti: { create: m.prezenti.map((k) => ({ personId: pid(k) })) },
      },
    });
  }

  // Grupuri
  const groups: [string, string, string, string[]][] = [
    ["Comitet", "Daniel Mureșan", "Comitetul bisericii, ales de adunarea generală.", comitet],
    ["Cor", "Vasile Pop", "Repetiții joi seara, ora 19:00.", ["rodica", "maria", "lidia", "vasile", "ruxandra", "elena", "alin", "naomi"]],
    ["Tineret", "Emanuel Ciobanu", "Întâlniri vineri seara.", ["lidia", "andrei", "samuel", "beniamin", "alin", "bianca", "timotei"]],
    ["Școala duminicală", "Naomi Ciobanu", "Învățătorii grupelor de copii.", ["rodica", "elena", "naomi"]],
  ];
  for (const [nume, responsabil, descriere, membri] of groups) {
    await prisma.group.create({
      data: { churchId, nume, responsabil, descriere, membri: { create: membri.map((k) => ({ personId: pid(k) })) } },
    });
  }

  // Mențiuni
  const notes: [string, string, string | null, string, string][] = [
    [d(1, 11, 27), "Pastorală", "ecaterina", "", "Vizită după înmormântarea fratelui Gheorghe. Are nevoie de ajutor la cumpărături — s-au oferit familiile Pop și Ionescu."],
    [d(1, 3, 9), "Disciplină", "nicolae", "", "Reprimit în biserică în urma hotărârii fraților slujitori din 2 martie."],
    [clampPast(d(0, 6, 1)), "Slujire", "samuel", "", "Dorește să se implice la sonorizare și la grupul de tineret."],
    [clampPast(d(0, 2, 15)), "Familie", null, "Ionescu", "Binecuvântarea fetiței Sara; familia mulțumește bisericii pentru ajutorul după naștere."],
    [addDays(TODAY, -3), "Generală", null, "", "De actualizat datele de contact pentru familiile venite prin transfer anul acesta."],
  ];
  for (const [data, tip, who, familie, text] of notes) {
    await prisma.note.create({
      data: { churchId, data: date(data), tip, personId: who ? pid(who) : null, familie, text, searchText: noteSearchText({ text, tip, familie }) },
    });
  }

  // Documente (registrul de ieșire), cu texte generate din șabloane
  const personRecords: PersonRecord[] = (
    await prisma.person.findMany({ where: { churchId }, orderBy: [{ sortKey: "asc" }, { id: "asc" }] })
  ).map((p) => ({
    id: p.id,
    nume: p.nume,
    prenume: p.prenume,
    statut: p.statut,
    gen: p.gen,
    familie: p.familie,
    rudenie: p.rudenie,
    dataNasterii: p.dataNasterii?.toISOString().slice(0, 10) ?? null,
    dataMembru: p.dataMembru?.toISOString().slice(0, 10) ?? null,
    modIntrare: p.modIntrare,
    bisericaProvenienta: p.bisericaProvenienta,
    dataBotez: p.dataBotez?.toISOString().slice(0, 10) ?? null,
    locBotez: p.locBotez,
    dataBinecuvantare: p.dataBinecuvantare?.toISOString().slice(0, 10) ?? null,
    dataIesire: p.dataIesire?.toISOString().slice(0, 10) ?? null,
    modIesire: p.modIesire,
    bisericaDestinatie: p.bisericaDestinatie,
    createdAt: p.createdAt.toISOString().slice(0, 10),
  }));
  const byId = new Map(personRecords.map((p) => [p.id, p]));
  const docPerson = (k: string): DocPerson => {
    const p = byId.get(pid(k))!;
    return { ...p };
  };
  const statEvents = (await prisma.event.findMany({ where: { churchId }, orderBy: { data: "asc" } })).map((e) => ({
    id: e.id,
    titlu: e.titlu,
    tip: e.tip,
    data: e.data.toISOString().slice(0, 10),
  }));
  const allMeetings = await prisma.meeting.findMany({ where: { churchId }, select: { data: true } });

  type Dk = { tip: "adeverinta" | "botez" | "binecuvantare" | "recomandare" | "scrisoare" | "raport"; data: string; who?: string; catre?: string; scop?: string; an?: number };
  const docs: Dk[] = [
    { tip: "raport", data: d(1, 1, 20), an: Y - 2 },
    { tip: "adeverinta", data: d(1, 2, 3), who: "ion", scop: "a-i servi la NAV (Norges arbeids- og velferdsetat)" },
    { tip: "recomandare", data: d(1, 8, 25), who: "florin", catre: "Biserica Emanuel Bergen", scop: "se mută împreună cu familia în localitatea dumneavoastră" },
    { tip: "recomandare", data: d(1, 8, 25), who: "adina", catre: "Biserica Emanuel Bergen", scop: "se mută împreună cu familia în localitatea dumneavoastră" },
    { tip: "botez", data: d(1, 9, 30), who: "radu" },
    { tip: "raport", data: clampPast(d(0, 1, 20)), an: Y - 1 },
    { tip: "binecuvantare", data: clampPast(d(0, 2, 16)), who: "sara" },
    { tip: "adeverinta", data: clampPast(d(0, 4, 10)), who: "ruxandra", scop: "a-i servi la bancă" },
    { tip: "scrisoare", data: addDays(TODAY, -7), catre: "Primăria Stavanger", scop: "Solicitare de închiriere a sălii de sport pentru Conferința tinerilor" },
  ];
  const counters = new Map<number, number>();
  for (const doc of docs) {
    const an = Number(doc.data.slice(0, 4));
    const nr = (counters.get(an) ?? 0) + 1;
    counters.set(an, nr);
    const person = doc.who ? docPerson(doc.who) : null;
    let reportText: string | undefined;
    if (doc.tip === "raport") {
      const year = doc.an!;
      const stats = computeStats(personRecords, statEvents, { year, today: TODAY });
      reportText = buildReportText(year, stats, {
        evenimente: statEvents.filter((e) => inYear(e.data, year)).length,
        sedinte: allMeetings.filter((m) => inYear(m.data.toISOString(), year)).length,
        documente: docs.filter((x) => inYear(x.data, year) && x.tip !== "raport").length,
      });
    }
    const text = generateDocumentText({
      tip: doc.tip,
      person,
      family: personRecords,
      church,
      catre: doc.catre ?? "",
      scop: doc.scop ?? "",
      reportText,
    });
    const created = await prisma.document.create({
      data: {
        churchId,
        tip: doc.tip,
        nr,
        anRegistru: an,
        data: date(doc.data),
        personId: person?.id ?? null,
        persoana: person ? `${person.nume} ${person.prenume}` : "",
        catre: doc.catre ?? "",
        scop: doc.scop ?? "",
        titlu: doc.tip === "raport" ? `Dare de seamă anuală ${doc.an}` : defaultDocumentTitle(doc.tip, person, doc.catre ?? ""),
        text,
        anRaport: doc.an ?? null,
      },
    });
    await prisma.auditLog.create({
      data: {
        churchId,
        userId: admin.id,
        userName: admin.name,
        entity: "DOCUMENT",
        entityId: created.id,
        entityLabel: `Nr. ${nr}/${an} — ${created.titlu}`,
        action: "CREATE",
        changes: { sursa: "date demo" },
      },
    });
  }

  const counts = {
    persoane: await prisma.person.count({ where: { churchId } }),
    evenimente: await prisma.event.count({ where: { churchId } }),
    sedinte: await prisma.meeting.count({ where: { churchId } }),
    documente: await prisma.document.count({ where: { churchId } }),
    grupuri: await prisma.group.count({ where: { churchId } }),
    mentiuni: await prisma.note.count({ where: { churchId } }),
  };
  console.log("Gata:", counts);
  console.log(`Autentificare: admin@demo.ro / secretar@demo.ro / vizualizare@demo.ro — parola „${PASSWORD}”.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
