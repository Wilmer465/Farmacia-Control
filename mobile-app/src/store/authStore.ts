import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Usuario } from '../types/domain';

interface AuthState {
  usuario: Usuario | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number;
  isAuthenticated: boolean;
  setAuth: (data: { 
    usuario: Usuario; 
    accessToken: string; 
    refreshToken: string; 
    expiresIn: number 
  }) => void;
  clearAuth: () => void;
  updateTokens: (accessToken: string, refreshToken: string, expiresIn: number) => void;
  hasRole: (roles: string | string[]) => boolean;
  canAccessSede: (sedeId: number) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: 0,
      isAuthenticated: false,

      setAuth: ({ usuario, accessToken, refreshToken, expiresIn }) => {
        const expiry = Date.now() + expiresIn * 1000;
        set({
          usuario,
          accessToken,
          refreshToken,
          tokenExpiry: expiry,
          isAuthenticated: true,
        });
      },

      clearAuth: () => {
        set({
          usuario: null,
          accessToken: null,
          refreshToken: null,
          tokenExpiry: 0,
          isAuthenticated: false,
        });
      },

      updateTokens: (accessToken, refreshToken, expiresIn) => {
        const expiry = Date.now() + expiresIn * 1000;
        set({ accessToken, refreshToken, tokenExpiry: expiry });
      },

      hasRole: (roles) => {
        const { usuario } = get();
        if (!usuario) return false;
        const roleArray = Array.isArray(roles) ? roles : [roles];
        return roleArray.includes(usuario.rol_nombre);
      },

      canAccessSede: (sedeId) => {
        const { usuario } = get();
        if (!usuario) return false;
        if (usuario.rol_nombre === 'SUPERADMIN') return true;
        return usuario.sede_id === sedeId;
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          // This will be replaced by SecureStorage in the actual implementation
          return null;
        },
        setItem: async () => {},
        removeItem: async () => {},
      })),
      partialize: (state) => ({
        usuario: state.usuario,
        // Don't persist tokens - they're in SecureStorage
      }),
    }
  )
);