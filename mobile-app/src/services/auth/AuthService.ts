import { Usuario } from '../../types/domain';
import { sqliteService } from '../database/SQLiteService';
import { SecureStorage } from '../storage/SecureStorage';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { apiClient } from '../api/ApiClient';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  usuario: Usuario;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: Usuario | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async initialize(): Promise<void> {
    const savedToken = await SecureStorage.getItem('access_token');
    const savedRefresh = await SecureStorage.getItem('refresh_token');
    const savedUser = await SecureStorage.getItem('user_session');
    const expiry = await SecureStorage.getItem('token_expiry');

    if (savedToken && savedRefresh && savedUser && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        this.accessToken = savedToken;
        this.refreshToken = savedRefresh;
        this.currentUser = JSON.parse(savedUser);
        this.tokenExpiry = expiryTime;
        apiClient.setAuthToken(savedToken);
      } else {
        await this.clearSession();
      }
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const response = await apiClient.post<LoginResult>('/auth/login', credentials);
    
    if (!response.ok || !response.data) {
      throw new Error(response.error || 'Error de autenticación');
    }

    const { usuario, access_token, refresh_token, expires_in } = response.data;
    
    this.currentUser = usuario;
    this.accessToken = access_token;
    this.refreshToken = refresh_token;
    this.tokenExpiry = Date.now() + expires_in * 1000;

    await this.persistSession(usuario, access_token, refresh_token, this.tokenExpiry);
    apiClient.setAuthToken(access_token);

    return { usuario, accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in };
  }

  async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No hay refresh token disponible');
    }

    const response = await apiClient.post<{ access_token: string; refresh_token: string; expires_in: number }>(
      '/auth/refresh',
      { refresh_token: this.refreshToken }
    );

    if (!response.ok || !response.data) {
      await this.logout();
      throw new Error(response.error || 'Sesión expirada');
    }

    const { access_token, refresh_token, expires_in } = response.data;
    this.accessToken = access_token;
    this.refreshToken = refresh_token;
    this.tokenExpiry = Date.now() + expires_in * 1000;

    await SecureStorage.setItem('access_token', access_token);
    await SecureStorage.setItem('refresh_token', refresh_token);
    await SecureStorage.setItem('token_expiry', this.tokenExpiry.toString());
    apiClient.setAuthToken(access_token);

    return access_token;
  }

  async logout(): Promise<void> {
    if (this.currentUser && this.accessToken) {
      try {
        await apiClient.post('/auth/logout', { session_token: this.accessToken });
      } catch (error) {
        console.warn('Logout server error:', error);
      }
    }
    await this.clearSession();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });

    if (!response.ok) {
      throw new Error(response.error || 'Error al cambiar contraseña');
    }
  }

  getCurrentUser(): Usuario | null {
    return this.currentUser;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !!this.currentUser && !!this.accessToken && Date.now() < this.tokenExpiry;
  }

  async ensureValidToken(): Promise<string> {
    if (!this.isAuthenticated()) {
      if (this.refreshToken) {
        return this.refreshAccessToken();
      }
      throw new Error('No autenticado');
    }
    
    // Refresh 5 minutes before expiry
    if (Date.now() > this.tokenExpiry - 5 * 60 * 1000) {
      return this.refreshAccessToken();
    }
    
    return this.accessToken!;
  }

  private async persistSession(
    usuario: Usuario, 
    accessToken: string, 
    refreshToken: string, 
    expiry: number
  ): Promise<void> {
    await Promise.all([
      SecureStorage.setItem('access_token', accessToken),
      SecureStorage.setItem('refresh_token', refreshToken),
      SecureStorage.setItem('user_session', JSON.stringify(usuario)),
      SecureStorage.setItem('token_expiry', expiry.toString()),
    ]);
  }

  private async clearSession(): Promise<void> {
    this.currentUser = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
    
    await Promise.all([
      SecureStorage.deleteItem('access_token'),
      SecureStorage.deleteItem('refresh_token'),
      SecureStorage.deleteItem('user_session'),
      SecureStorage.deleteItem('token_expiry'),
    ]);
    apiClient.clearAuthToken();
  }

  hasRole(roles: string | string[]): boolean {
    if (!this.currentUser) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(this.currentUser.rol_nombre);
  }

  canAccessSede(sedeId: number): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.rol_nombre === 'SUPERADMIN') return true;
    return this.currentUser.sede_id === sedeId;
  }
}

export const authService = AuthService.getInstance();
