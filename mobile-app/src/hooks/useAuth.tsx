import { useState, useEffect, useCallback } from 'react';
import { authService, LoginCredentials, LoginResult } from '../services';
import { Usuario } from '../types/domain';

export function useAuth() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inicializado, setInicializado] = useState(false);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = useCallback(async () => {
    try {
      await authService.initialize();
      const user = authService.getCurrentUser();
      setUsuario(user);
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      setCargando(false);
      setInicializado(true);
    }
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setCargando(true);
    setError(null);
    
    try {
      const result = await authService.login(credentials);
      setUsuario(result.usuario);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de autenticación';
      setError(message);
      return false;
    } finally {
      setCargando(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setCargando(true);
    try {
      await authService.logout();
      setUsuario(null);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setCargando(false);
    }
  }, []);

  const refreshUser = useCallback(() => {
    const user = authService.getCurrentUser();
    setUsuario(user);
  }, []);

  return { 
    usuario, 
    login, 
    logout, 
    cargando, 
    error, 
    inicializado,
    isAuthenticated: authService.isAuthenticated(),
    refreshUser,
  };
}

export function useRequireAuth() {
  const { usuario, cargando, inicializado } = useAuth();
  
  return {
    usuario,
    cargando,
    inicializado,
    isAuthenticated: !!usuario,
  };
}
