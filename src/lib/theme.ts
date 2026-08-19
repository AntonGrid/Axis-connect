import { STORAGE_KEYS } from "../config";
import type { ThemeMode } from "../types";

/** Применить тему к <html> и сохранить выбор. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("dark", mode === "dark");
  localStorage.setItem(STORAGE_KEYS.theme, mode);
}

export function getTheme(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  if (saved === "light" || saved === "dark") return saved;
  // Дефолт — тёмная (как был дизайн); по желанию можно media-запрос.
  return "dark";
}

export function toggleTheme(current: ThemeMode): ThemeMode {
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
