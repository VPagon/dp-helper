export const THEME_STORAGE_KEY = 'dp-helper-theme';

export function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // localStorage may be unavailable
  }
  return null;
}

export function resolveTheme() {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(resolveTheme());
}
