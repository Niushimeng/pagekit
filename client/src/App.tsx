import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './api/auth';
import Layout from './components/Layout';
import Login from './components/Login';
import ServiceList from './components/ServiceList';
import ServiceForm from './components/ServiceForm';
import Credentials from './components/Credentials';
import Logs from './components/Logs';
import Settings from './components/Settings';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  // 带 redirect_uri 时是 CLI 登录流程,即便已登录也要进入 Login 完成 token 铸造与重定向
  const hasCliRedirect = new URLSearchParams(window.location.search).has('redirect_uri');
  return isAuthenticated && !hasCliRedirect ? <Navigate to="/" replace /> : <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route path="/" element={<ServiceList />} />
        <Route path="/services/new" element={<ServiceForm />} />
        <Route path="/services/:id" element={<ServiceForm />} />
        <Route path="/credentials" element={<Credentials />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
