"use client";

import * as React from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "tournament-os-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => undefined,
  toggle: () => undefined,
});

/**
 * Light is the primary experience; dark is opt-in for night events, venue
 * displays and broadcast. The choice persists per device.
 */
export function ThemeProvider({
  children,
  forced,
}: {
  children: React.ReactNode;
  /** Locks the theme — used by broadcast/TV routes that are always dark. */
  forced?: Theme;
}) {
  /*
   * The blocking init script has already stamped the correct theme onto <html>
   * before paint, so state is initialised lazily from the DOM rather than being
   * corrected inside an effect. This avoids a cascading re-render on mount.
   */
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (forced) return forced;
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (!forced) window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, forced]);

  // Restore the app theme when a forced-theme route unmounts.
  React.useEffect(() => {
    if (!forced) return;
    return () => {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
      document.documentElement.dataset.theme = stored ?? "light";
    };
  }, [forced]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (t) => !forced && setThemeState(t),
      toggle: () => !forced && setThemeState((t) => (t === "light" ? "dark" : "light")),
    }),
    [theme, forced],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => React.useContext(ThemeContext);

/**
 * Applies the stored theme before first paint, so a dark-mode user never sees a
 * light flash. Injected as a blocking inline script in the root layout.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});document.documentElement.dataset.theme=(t==="dark"?"dark":"light");}catch(e){document.documentElement.dataset.theme="light";}})();`;
