import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  applyTheme,
  getStoredTheme,
  persistTheme,
  resolveTheme,
} from './themeStorage';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(resolveTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!getStoredTheme()) {
        const next = media.matches ? 'dark' : 'light';
        setThemeState(next);
        applyTheme(next);
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = (next) => {
    setThemeState(next);
    persistTheme(next);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function useThemeOptional() {
  return useContext(ThemeContext);
}
