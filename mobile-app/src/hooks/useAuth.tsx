import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authService, LoginCredentials, LoginResult } from '../services';
import { Usuario } from '../types/domain';

interface AuthContextValue {
  usuario: Usuario | null;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => Promise<void>;
  cargando: boolean;
  error: string | null;
  inicializado: boolean;
  isAuthenticated: boolean;
  refreshUser: () => void;
}

// El estado de sesion debe ser UNO solo para toda la app. Antes era un hook con
// useState propio, de modo que cada pantalla que llamaba a useAuth() obtenia una
// copia independiente: LoginScreen actualizaba su `usuario` y AppNavigator (que
// decide entre AuthStack y MainDrawer) nunca lo veia, por lo que la app no
// avanzaba mas alla del login. Un contexto resuelve las dos cosas a la vez.
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inicializado, setInicializado] = useState(false);

  const initAuth = useCallback(async () => {
    try {
      await authService.initialize();
      setUsuario(authService.getCurrentUser());
    } catch (initError) {
      console.error('Auth init error:', initError);
    } finally {
      setCargando(false);
      setInicializado(true);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setCargando(true);
    setError(null);

    try {
      const result: LoginResult = await authService.login(credentials);
      setUsuario(result.usuario);
      return true;
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Error de autenticación');
      return false;
    } finally {
      setCargando(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setCargando(true);
    try {
      await authService.logout();
    } catch (logoutError) {
      console.error('Logout error:', logoutError);
    } finally {
      setUsuario(null);
      setCargando(false);
    }
  }, []);

  const refreshUser = useCallback(() => {
    setUsuario(authService.getCurrentUser());
  }, []);

  return (
    <AuthContext.Provider
      value={{
        usuario,
        login,
        logout,
        cargando,
        error,
        inicializado,
        isAuthenticated: !!usuario,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>. Revisa App.tsx.');
  }
  return ctx;
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
