import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../api/auth';

export default function Layout() {
  const { username, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Pagekit</h2>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">📦</span> 服务列表
          </NavLink>
          <NavLink to="/credentials" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">🔑</span> 凭证管理
          </NavLink>
          <NavLink to="/logs" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">📋</span> 操作日志
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon">⚙️</span> 系统设置
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="user-info">👤 {username}</span>
          <button className="btn btn-sm btn-ghost" onClick={logout}>退出</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
