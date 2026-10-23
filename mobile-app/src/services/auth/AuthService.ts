import bcrypt from 'bcryptjs';
import * as Crypto from 'expo-crypto';
import { Usuario } from '../../types/domain';
import { LoginRequest, LoginResponse, RefreshTokenResponse } from '../../types/api';
import { sqliteService } from '../database/SQLiteService';
import { SecureStorage } from '../storage/SecureStorage';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { apiClient } from '../api/ApiClient';
import { SUPABASE_CONFIG, supabaseHabilitado } from '../../constants/config';
import { SB_KEYS } from '../sync/SupabaseSyncProvider';

export type LoginCredentials = LoginRequest;

export interface LoginResult {
  usuario: Usuario;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// bcryptjs necesita una fuente de entropia para generar la sal. En Hermes no
// existen ni el modulo `crypto` de Node ni WebCrypto, asi que sin este fallback
// `genSaltSync` lanza "Neither WebCryptoAPI nor a crypto module is available".
// expo-crypto aporta bytes aleatorios criptograficamente seguros.
bcrypt.setRandomFallback((bytes: number) => Array.from(Crypto.getRandomBytes(bytes)));

// Verificacion local contra `usuarios.password_hash`, que es bcrypt (coste 12)
// tanto en el seed de esta app como en la base central. El mismo formato que
// usa el backend, asi que un usuario sincronizado tambien valida aqui.
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return bcrypt.compareSync(password, hash);
  } catch (error) {
    console.warn('[AuthService] hash de password local con formato desconocido:', error);
    return false;
  }
}

// Un fallo de credenciales trae un `code` de la API (CREDENCIALES_INVALIDAS,
// CUENTA_BLOQUEADA, SEDE_NO_ASIGNADA, VALIDACION). Cualquier otro error significa
// que la API central no respondio y se puede probar el login local.
function esFalloDeConectividad(error: unknown): boolean {
  const codigo = (error as { code?: string } | null)?.code;
  if (codigo) return false;
  const mensaje = error instanceof Error ? error.message : String(error);
  return !mensaje || /network|timeout|ECONN|ENOTFOUND|socket hang up|Network Error/i.test(mensaje);
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: Usuario | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;
  // Sesión Supabase nativa (nube). Separada de la LAN: no pisa accessToken.
  private sbAccessToken: string | null = null;
  private sbRefreshToken: string | null = null;
  private sbExpiry: number = 0;

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
    const sbAccess = await SecureStorage.getItem(SB_KEYS.ACCESS);
    const sbRefresh = await SecureStorage.getItem(SB_KEYS.REFRESH);
    const sbExpiry = await SecureStorage.getItem(SB_KEYS.EXPIRY);

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
    if (sbAccess && sbExpiry && Date.now() < parseInt(sbExpiry, 10)) {
      this.sbAccessToken = sbAccess;
      this.sbRefreshToken = sbRefresh;
      this.sbExpiry = parseInt(sbExpiry, 10);
      if (savedUser && !this.currentUser) {
        try {
          this.currentUser = JSON.parse(savedUser);
        } catch {
          // sesión corrupta: se repara en el próximo login
        }
      }
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      const response = await apiClient.post<LoginResponse['data']>('/auth/login', credentials);
      
      if (response.ok && response.data) {
        const { usuario, access_token, refresh_token, expires_in } = response.data;
        
        this.currentUser = usuario;
        this.accessToken = access_token;
        this.refreshToken = refresh_token;
        this.tokenExpiry = Date.now() + expires_in * 1000;

        await this.persistSession(usuario, access_token, refresh_token, this.tokenExpiry);
        apiClient.setAuthToken(access_token);

        return { usuario, accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in };
      }
      
      const error = new Error(response.error || 'Error de autenticación') as Error & { code?: string };
      if (response.code) error.code = response.code;
      throw error;
    } catch (apiError) {
      // Solo cae a la base local cuando la API central no respondio (sin red o
      // servidor caido). Un 401 por credenciales se propaga: `apiClient.post`
      // resuelve { ok: false } y el throw de arriba entra aqui, pero se
      // distingue por el codigo que devuelve la API.
      if (esFalloDeConectividad(apiError)) {
        console.warn('[AuthService] API de autenticacion no disponible, login local:', apiError);
        return this.loginLocal(credentials);
      }
      throw apiError;
    }
  }

  private async loginLocal(credentials: LoginCredentials): Promise<LoginResult> {
    const db = sqliteService.getDatabase();
    
    const userRow = await db.getFirstAsync<{
      id: number;
      nombre: string;
      username: string;
      password_hash: string;
      rol_id: number;
      rol_nombre: string;
      sede_id: number | null;
      sede_nombre: string | null;
      estado: string;
      es_superadmin_principal: number;
      created_at: string;
    }>(
      `SELECT u.id, u.nombre, u.username, u.password_hash, u.rol_id, u.estado, u.es_superadmin_principal, u.created_at,
              r.nombre as rol_nombre,
              s.nombre as sede_nombre
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       LEFT JOIN sedes s ON u.sede_id = s.id
       WHERE u.username = ? AND u.estado = 'ACTIVO'`,
      [credentials.username]
    );

    if (!userRow) {
      throw new Error('Usuario no encontrado o inactivo');
    }

    const isValid = await verifyPassword(credentials.password, userRow.password_hash);
    if (!isValid) {
      throw new Error('Contraseña incorrecta');
    }

    const usuario: Usuario = {
      id: userRow.id,
      nombre: userRow.nombre,
      username: userRow.username,
      rol_id: userRow.rol_id,
      rol_nombre: userRow.rol_nombre,
      sede_id: userRow.sede_id,
      sede_nombre: userRow.sede_nombre || undefined,
      estado: userRow.estado as 'ACTIVO' | 'INACTIVO',
      es_superadmin_principal: userRow.es_superadmin_principal,
      created_at: userRow.created_at,
    };

    const accessToken = `local_${generateIdempotencyKey()}`;
    const refreshToken = `local_refresh_${generateIdempotencyKey()}`;
    const expiresIn = 24 * 60 * 60;
    const tokenExpiry = Date.now() + expiresIn * 1000;

    this.currentUser = usuario;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = tokenExpiry;

    await this.persistSession(usuario, accessToken, refreshToken, tokenExpiry);
    apiClient.setAuthToken(accessToken);

    return { usuario, accessToken, refreshToken, expiresIn };
  }

  async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No hay refresh token disponible');
    }

    const response = await apiClient.post<NonNullable<RefreshTokenResponse['data']>>(
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

  // ---- Supabase Auth nativo (Fase 1) ----
  // Email sintético provisionado por scripts/provisionar-auth.js (desktop).
  static emailSintetico(username: string): string {
    return `${username.trim().toLowerCase()}@farmacia.local`;
  }

  esSupabaseConfigurado(): boolean {
    return supabaseHabilitado();
  }

  isSupabaseAutenticado(): boolean {
    return !!this.sbAccessToken && Date.now() < this.sbExpiry;
  }

  getSupabaseToken(): string | null {
    return this.isSupabaseAutenticado() ? this.sbAccessToken : null;
  }

  // Login contra Supabase Auth. Exige fila local ACTIVO (sincronizada): la nube
  // autentica, el dispositivo autoriza con rol/sede locales. Sin red: sesión
  // cacheada vigente, o loginLocal bcrypt como último recurso. Instalación
  // fresca sin red no puede entrar (no hay hash sincronizado por diseño).
  async loginSupabase(credentials: LoginCredentials): Promise<LoginResult> {
    if (!supabaseHabilitado()) {
      throw new Error('Supabase no configurado en este dispositivo.');
    }
    const email = AuthService.emailSintetico(credentials.username);
    let respuesta: Response;
    try {
      respuesta = await fetch(
        `${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_CONFIG.anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password: credentials.password }),
        }
      );
    } catch (error) {
      console.warn('[AuthService] Supabase inalcanzable, fallback local:', error);
      return this.loginSupabaseOffline(credentials);
    }
    if (!respuesta.ok) {
      const codigo = await this.codigoErrorSupabase(respuesta);
      if (codigo === 'CONECTIVIDAD') {
        return this.loginSupabaseOffline(credentials);
      }
      throw new Error('Credenciales incorrectas');
    }
    const datos = (await respuesta.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    const usuario = await this.usuarioLocalPorUsername(credentials.username);
    if (!usuario) {
      throw new Error('Cuenta no sincronizada en este dispositivo. Sincronice con conexión.');
    }
    this.currentUser = usuario;
    this.sbAccessToken = datos.access_token;
    this.sbRefreshToken = datos.refresh_token;
    this.sbExpiry = Date.now() + datos.expires_in * 1000;
    await Promise.all([
      SecureStorage.setItem(SB_KEYS.ACCESS, datos.access_token),
      SecureStorage.setItem(SB_KEYS.REFRESH, datos.refresh_token),
      SecureStorage.setItem(SB_KEYS.EXPIRY, String(this.sbExpiry)),
      SecureStorage.setItem('user_session', JSON.stringify(usuario)),
    ]);
    return {
      usuario,
      accessToken: datos.access_token,
      refreshToken: datos.refresh_token,
      expiresIn: datos.expires_in,
    };
  }

  private async codigoErrorSupabase(respuesta: Response): Promise<string> {
    try {
      const cuerpo = (await respuesta.json()) as { error?: string; msg?: string };
      const texto = `${cuerpo.error || ''} ${cuerpo.msg || ''}`.toLowerCase();
      if (/invalid login|invalid_grant|email not confirmed/.test(texto)) return 'CREDENCIALES';
    } catch {
      return 'CONECTIVIDAD';
    }
    return respuesta.status >= 500 ? 'CONECTIVIDAD' : 'CREDENCIALES';
  }

  private async loginSupabaseOffline(credentials: LoginCredentials): Promise<LoginResult> {
    if (this.currentUser && this.isSupabaseAutenticado()) {
      return {
        usuario: this.currentUser,
        accessToken: this.sbAccessToken as string,
        refreshToken: this.sbRefreshToken as string,
        expiresIn: Math.floor((this.sbExpiry - Date.now()) / 1000),
      };
    }
    // Último recurso: bcrypt contra la fila sincronizada (requiere un login
    // online previo que la haya traído; emite tokens locales, no de nube).
    return this.loginLocal(credentials);
  }

  private async usuarioLocalPorUsername(username: string): Promise<Usuario | null> {
    const db = sqliteService.getDatabase();
    const fila = await db.getFirstAsync<{
      id: number;
      nombre: string;
      username: string;
      rol_id: number;
      rol_nombre: string;
      sede_id: number | null;
      sede_nombre: string | null;
      estado: string;
      es_superadmin_principal: number;
      created_at: string;
    }>(
      `SELECT u.id, u.nombre, u.username, u.rol_id, u.estado, u.sede_id,
              u.es_superadmin_principal, u.created_at,
              r.nombre as rol_nombre, s.nombre as sede_nombre
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       LEFT JOIN sedes s ON u.sede_id = s.id
       WHERE u.username = ? AND u.estado = 'ACTIVO'`,
      [username]
    );
    if (!fila) return null;
    return {
      id: fila.id,
      nombre: fila.nombre,
      username: fila.username,
      rol_id: fila.rol_id,
      rol_nombre: fila.rol_nombre,
      sede_id: fila.sede_id,
      sede_nombre: fila.sede_nombre || undefined,
      estado: fila.estado as 'ACTIVO' | 'INACTIVO',
      es_superadmin_principal: fila.es_superadmin_principal,
      created_at: fila.created_at,
    };
  }

  async refreshSupabaseToken(): Promise<string> {
    if (!this.sbRefreshToken) throw new Error('No hay sesión Supabase.');
    const respuesta = await fetch(
      `${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_CONFIG.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: this.sbRefreshToken }),
      }
    );
    if (!respuesta.ok) {
      await this.logoutSupabase();
      throw new Error('Sesión Supabase expirada');
    }
    const datos = (await respuesta.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    this.sbAccessToken = datos.access_token;
    this.sbRefreshToken = datos.refresh_token;
    this.sbExpiry = Date.now() + datos.expires_in * 1000;
    await Promise.all([
      SecureStorage.setItem(SB_KEYS.ACCESS, datos.access_token),
      SecureStorage.setItem(SB_KEYS.REFRESH, datos.refresh_token),
      SecureStorage.setItem(SB_KEYS.EXPIRY, String(this.sbExpiry)),
    ]);
    return datos.access_token;
  }

  async logoutSupabase(): Promise<void> {
    if (this.sbAccessToken) {
      try {
        await fetch(`${SUPABASE_CONFIG.url}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${this.sbAccessToken}`,
          },
        });
      } catch (error) {
        console.warn('Logout Supabase omitido (sin red):', error);
      }
    }
    this.sbAccessToken = null;
    this.sbRefreshToken = null;
    this.sbExpiry = 0;
    await Promise.all([
      SecureStorage.deleteItem(SB_KEYS.ACCESS),
      SecureStorage.deleteItem(SB_KEYS.REFRESH),
      SecureStorage.deleteItem(SB_KEYS.EXPIRY),
    ]);
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
