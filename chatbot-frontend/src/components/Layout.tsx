import { NavLink } from 'react-router-dom'
import type { PropsWithChildren } from 'react'

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-main">
            <span className="brand-badge">C</span>
            <span className="brand-name">Calisto</span>
          </div>
          <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>‹</span>
        </div>
        <div className="sidebar-search">
          <div className="search-shell">Quick Search</div>
        </div>
        <nav className="nav">
          <a className="nav-item" href="#">
            <span className="nav-dot">D</span>
            Dashboard
          </a>
          <NavLink className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} to="/leads">
            <span className="nav-dot">L</span>
            Leads
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} to="/products">
            <span className="nav-dot">P</span>
            Products
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} to="/knowledge">
            <span className="nav-dot">K</span>
            Knowledge
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} to="/webchat">
            <span className="nav-dot">W</span>
            Webchat
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <nav className="nav" style={{ padding: 0, marginBottom: 14 }}>
            <a className="nav-item" href="#">
              <span className="nav-dot">?</span>
              Support
            </a>
            <a className="nav-item" href="#">
              <span className="nav-dot">S</span>
              Settings
            </a>
          </nav>
          <div className="sidebar-user">
            <div className="user-avatar">JS</div>
            <div>
              <div className="user-name">John Smith</div>
              <div className="user-email">john@filtocrm.com</div>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
