export type Theme = "auto" | "light" | "dark";

/** Preferința de temă se păstrează într-un cookie, ca pagina să fie randată de server direct în tema corectă. */
export const THEME_COOKIE = "tema";

export function parseTheme(value: string | undefined | null): Theme {
  return value === "light" || value === "dark" ? value : "auto";
}
