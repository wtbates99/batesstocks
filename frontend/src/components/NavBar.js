import React from 'react';
import { NavLink } from 'react-router-dom';
import '../styles.css';

const NavBar = () => (
  <nav className="header-nav">
    <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      CHARTS
    </NavLink>
    <NavLink to="/heatmap" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      HEATMAP
    </NavLink>
    <NavLink to="/screener" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      SCREENER
    </NavLink>
    <NavLink to="/watchlist" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      WATCHLIST
    </NavLink>
  </nav>
);

export default NavBar;
