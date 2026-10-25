/** Size of the app's own text on this device (not the printed documents): 100 %, 115 % or 130 %. Pure. */
export const TEXT_SIZES_UI = ["100", "115", "130"] as const;
export type UiTextSize = (typeof TEXT_SIZES_UI)[number];

/** Kept in a cookie like the theme, so the server renders the page at the right size. */
export const TEXT_SIZE_COOKIE = "text";

export function parseUiTextSize(value: string | undefined | null): UiTextSize {
  return value === "115" || value === "130" ? value : "100";
}
