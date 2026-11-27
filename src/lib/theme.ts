// Gerenciador de Tema (Modo Escuro e Modo Claro)
// Persiste a preferência em localStorage e sincroniza a classe 'dark' no elemento raiz (<html>).

import { useEffect, useState } from "react";
import { safeLocalStorageSet } from "./storage-guard.ts";

const THEME_STORAGE_KEY = "desafios-theme-v1";
export type ThemeMode = "light" | "dark";

export function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
    // Caso não tenha preferência salva, verifica a do sistema ou padrão 'dark'
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

function syncDocumentThemeClass(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function applyTheme(theme: ThemeMode, options?: { emitEvent?: boolean }): void {
  syncDocumentThemeClass(theme);
  try {
    safeLocalStorageSet(THEME_STORAGE_KEY, theme);
    if (options?.emitEvent !== false && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("desafios:theme-changed", { detail: theme }));
    }
  } catch {
    /* ignore */
  }
}

export function useTheme(): {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
} {
  const [theme, setLocalTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    syncDocumentThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const custom = e as CustomEvent<ThemeMode>;
      if (custom.detail === "light" || custom.detail === "dark") {
        setLocalTheme(custom.detail);
      }
    };
    window.addEventListener("desafios:theme-changed", handler);
    return () => window.removeEventListener("desafios:theme-changed", handler);
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setLocalTheme(mode);
    applyTheme(mode);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return { theme, toggleTheme, setTheme };
}
