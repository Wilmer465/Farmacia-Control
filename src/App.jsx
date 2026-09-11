import React from 'react';
import { useAuth } from './hooks/useAuth.js';
import Login from './pages/Login.jsx';
import AppShell from './pages/AppShell.jsx';

export default function App() {
  const { usuario, login, logout, cargando, error } = useAuth();

  if (!usuario) {
    return <Login onLogin={login} cargando={cargando} error={error} />;
  }

  return <AppShell usuario={usuario} onLogout={logout} />;
}
