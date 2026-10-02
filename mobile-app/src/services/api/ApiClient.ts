import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { API_CONFIG } from '../../constants/config';

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

class ApiClient {
  private client: AxiosInstance;
  private authToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.baseURL,
      timeout: API_CONFIG.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle 401 and refresh token
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Un 401 de /auth/login es "credenciales incorrectas", no "token vencido":
        // reintentar con refresh solo producing un fallo mas unhelpful. El refresh
        // solo aplica a peticiones que ya viajan con un Bearer.
        const esRutaDeAuth = /\/auth\/(login|refresh|logout)/.test(originalRequest?.url || '');
        const puedeRenovar = !!this.authToken && !esRutaDeAuth;

        if (error.response?.status === 401 && !originalRequest._retry && puedeRenovar) {
          originalRequest._retry = true;

          try {
            const newToken = await this.renovarTokenUnico();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, redirect to login
            try {
              const { authService } = await import('../auth/AuthService');
              await authService.logout();
            } catch {}
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(this.normalizeError(error));
      }
    );
  }

  // Single-flight: varias peticiones pueden recibir 401 a la vez y todas deben
  // compartir un unico refresh en lugar de disparar N peticiones simultaneas.
  private renovarTokenUnico(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = import('../auth/AuthService')
        .then(({ authService }) => authService.refreshAccessToken())
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  private normalizeError(error: AxiosError): Error & { code?: string; status?: number } {
    const data = error.response?.data as { error?: string; code?: string } | undefined;
    const normalizedError = new Error(
      data?.error || error.message || 'Error de red'
    ) as Error & { code?: string; status?: number };

    normalizedError.code = data?.code;
    normalizedError.status = error.response?.status;

    return normalizedError;
  }

  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = null;
  }

  getAuthToken(): string | null {
    return this.authToken;
  }

  async get<T>(url: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.get<ApiResponse<T>>(url, { params });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async post<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.post<ApiResponse<T>>(url, data);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async put<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.put<ApiResponse<T>>(url, data);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async patch<T>(url: string, data?: any): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.patch<ApiResponse<T>>(url, data);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.delete<ApiResponse<T>>(url);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private handleError(error: any): ApiResponse {
    const data = error?.response?.data;
    if (data) {
      return {
        ok: false,
        error: data.error || 'Error del servidor',
        code: data.code,
      };
    }
    // El interceptor de respuestas ya normalizo el error: `code` y `status`
    // vienen como propiedades del Error, no dentro de `response`.
    const message: string | undefined = error?.message;
    if (message) {
      return { ok: false, error: message, code: error.code };
    }
    return { ok: false, error: 'Error desconocido' };
  }
}

export const apiClient = new ApiClient();
export default apiClient;
