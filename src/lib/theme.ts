import { STORAGE_KEYS } from "../config";
import type { ThemeMode } from "../types";

/** Apply the theme to <html> and persist the choice. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("dark", mode === "dark");
  localStorage.setItem(STORAGE_KEYS.theme, mode);
}

export function getTheme(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  if (saved === "light" || saved === "dark") return saved;
  // Default — dark (as the original design); a media query can be added later.
  return "dark";
}

export function toggleTheme(current: ThemeMode): ThemeMode {
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
