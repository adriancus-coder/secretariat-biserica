"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { FormState } from "@/lib/form-state";
import { cx } from "./fields";

export function SubmitButton({
  children,
  className,
  pendingLabel,
  name,
  value,
  formAction,
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={cx("btn btn-primary", className)}
      disabled={pending}
      name={name}
      value={value}
      formAction={formAction}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState | undefined }) {
  if (!state?.message) return null;
  return (
    <div className={cx("alert", state.ok && "alert-ok")} role={state.ok ? "status" : "alert"} aria-live="polite">
      {state.message}
    </div>
  );
}
