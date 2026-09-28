"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="empty">
      <h3>A apărut o eroare</h3>
      <p className="mb-4">Pagina nu a putut fi încărcată. Încercați din nou; dacă problema persistă, anunțați administratorul.</p>
      {error.digest ? <p className="hint mb-4">Cod: {error.digest}</p> : null}
      <button type="button" className="btn btn-primary" onClick={() => reset()}>
        Reîncearcă
      </button>
    </div>
  );
}
