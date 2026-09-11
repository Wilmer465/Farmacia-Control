import { useState, useCallback } from 'react';

export function useAuth() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (username, password) => {
    setCargando(true);
    setError(null);
    const respuesta = await window.api.auth.login({ username, password });
    setCargando(false);

    if (!respuesta.ok) {
      setError(respuesta.error);
      return false;
    }
    setUsuario(respuesta.data);
    return true;
  }, []);

  const logout = useCallback(async () => {
    if (usuario) {
      await window.api.auth.logout(usuario);
    }
    setUsuario(null);
  }, [usuario]);

  return { usuario, login, logout, cargando, error };
}
