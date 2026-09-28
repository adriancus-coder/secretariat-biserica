/** Rezultatul unei acțiuni de formular, afișat de componentele client prin useActionState. */
export interface FormState {
  ok?: boolean;
  /** Mesaj general (eroare sau confirmare). */
  message?: string;
  /** Erori pe câmpuri: nume câmp → mesaj. */
  errors?: Record<string, string>;
  /** Valorile trimise, pentru repopularea formularului după o eroare. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};
