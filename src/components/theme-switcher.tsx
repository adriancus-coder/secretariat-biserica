"use client";

import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "auto", label: "Automat" },
  { value: "light", label: "Luminos" },
  { value: "dark", label: "Întunecat" },
];

/** Aplică tema imediat și o memorează într-un cookie de un an (citit de server la randare). */
function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "auto") {
    delete root.dataset.theme;
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.dataset.theme = t;
    document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }
}

/** Alegerea temei pentru acest dispozitiv. */
export function ThemeSwitcher({ current }: { current: Theme }) {
  const [theme, setTheme] = useState<Theme>(current);

  function choose(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  return (
    <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Temă">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          className={`btn btn-sm ${theme === o.value ? "btn-primary" : ""}`}
          onClick={() => choose(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
