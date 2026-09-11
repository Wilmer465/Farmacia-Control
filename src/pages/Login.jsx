import React, { useState } from 'react';

export default function Login({ onLogin, cargando, error }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!username.trim() || !password || cargando) return;
    onLogin(username.trim(), password);
  }

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Farmacia Control</h1>
        <p className="login-subtitle">Gestión y trazabilidad de medicamentos</p>

        <label htmlFor="login-username">Usuario</label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Ingrese su usuario..."
          autoFocus
          required
          autoComplete="username"
        />

        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Ingrese su contraseña..."
          required
          autoComplete="current-password"
        />

        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={cargando}>
          {cargando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
