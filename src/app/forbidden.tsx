import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl mb-2">Acces restricționat</h1>
      <p className="hint mb-6">Rolul dumneavoastră nu permite accesul la această pagină.</p>
      <Link href="/" className="btn">
        Înapoi la pagina principală
      </Link>
    </main>
  );
}
