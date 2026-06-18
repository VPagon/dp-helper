import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import './AppHeader.scss';

function AppHeader() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__start">
          <Link to="/" className="app-header__brand">
            <span className="app-header__logo" aria-hidden="true">
              DP
            </span>
            <span className="app-header__title">DP Helper</span>
          </Link>
        </div>
        <div className="app-header__end">
          {!isHome && (
            <Link to="/" className="app-header__home-link">
              Home
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
