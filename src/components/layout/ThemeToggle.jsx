import React from 'react';
import { useTheme } from '../../theme/ThemeContext';
import './ThemeToggle.scss';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggleTheme}
    >
      <span className="theme-toggle__label">{isDark ? 'Light' : 'Dark'}</span>
      <span className="theme-toggle__track" aria-hidden="true">
        <span className={`theme-toggle__thumb ${isDark ? 'theme-toggle__thumb--dark' : ''}`} />
      </span>
    </button>
  );
}

export default ThemeToggle;
