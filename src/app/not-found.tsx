import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl mb-2">Pagina nu există</h1>
      <p className="hint mb-6">Înregistrarea căutată nu a fost găsită sau a fost ștearsă.</p>
      <Link href="/" className="btn">
        Înapoi la pagina principală
      </Link>
    </main>
  );
}
