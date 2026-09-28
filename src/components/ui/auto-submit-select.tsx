"use client";

import type { SelectHTMLAttributes } from "react";

/** Un <select> care trimite formularul părinte la schimbare (filtre GET). */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
