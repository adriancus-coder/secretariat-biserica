"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { FormState } from "@/lib/form-state";
import { initialFormState } from "@/lib/form-state";

/**
 * Trimite un formular către o acțiune de server fără resetarea automată pe care React o face
 * după `<form action>`: dacă validarea eșuează, tot ce a introdus utilizatorul (inclusiv bife,
 * rânduri adăugate dinamic, liste de selecție) rămâne neschimbat.
 */
export function useActionForm(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, dispatch, pending] = useActionState(action, initialFormState);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    // Butoanele marcate `data-native-submit` (ex. previzualizarea PDF într-o filă nouă) trimit
    // formularul direct, către adresa din `formAction`.
    if (submitter?.dataset.nativeSubmit !== undefined) return;
    e.preventDefault();
    const formData = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }
  return { state, pending, onSubmit };
}
