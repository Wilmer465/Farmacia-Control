import { BarCodeScanner } from 'expo-barcode-scanner';
import { Platform } from 'react-native';
import { SCANNER_CONFIG } from '../../constants/config';
import { MedicamentoRepository, LoteRepository } from '../database/repositories';
import { apiClient } from '../api/ApiClient';

export interface ScanResult {
  type: string;
  data: string;
}

export interface ScannedMedicamento {
  medicamento: any;
  lote?: any;
  existsInLocal: boolean;
  existsInRemote: boolean;
  fromCatalogoCUM?: boolean;
}

export class ScannerService {
  private static instance: ScannerService;
  private hasPermission = false;
  private medicamentoRepo = new MedicamentoRepository();
  private loteRepo = new LoteRepository();

  static getInstance(): ScannerService {
    if (!ScannerService.instance) {
      ScannerService.instance = new ScannerService();
    }
    return ScannerService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') {
      this.hasPermission = true;
      return true;
    }

    try {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      this.hasPermission = status === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      this.hasPermission = false;
      return false;
    }
  }

  hasCameraPermission(): boolean {
    return this.hasPermission;
  }

  async scanFromCamera(): Promise<ScanResult | null> {
    if (!this.hasPermission) {
      const granted = await this.requestPermissions();
      if (!granted) {
        throw new Error('Permiso de cámara denegado');
      }
    }

    // This would be used with BarCodeScanner component
    // The actual scanning is done via the React component
    return null;
  }

  async processBarcode(barcode: string): Promise<ScannedMedicamento> {
    // 1. Search in local SQLite first
    let medicamento = await this.medicamentoRepo.findByGtin(barcode);
    let existsInLocal = !!medicamento;
    let existsInRemote = false;
    let fromCatalogoCUM = false;

    if (medicamento) {
      // Check if there's a lote for this medicamento in user's sede
      // This would need the current user's sede
      return {
        medicamento,
        existsInLocal: true,
        existsInRemote: false,
      };
    }

    // 2. Search in local by codigo
    medicamento = await this.medicamentoRepo.findByCodigo(barcode);
    if (medicamento) {
      return {
        medicamento,
        existsInLocal: true,
        existsInRemote: false,
      };
    }

    // 3. If online, search in backend / catalogo CUM
    try {
      const response = await apiClient.get<{ ok: boolean; data?: any }>(`/catalogoCum/buscarPorGTIN`, { gtin: barcode });
      if (response.ok && response.data) {
        fromCatalogoCUM = true;
        existsInRemote = true;
        return {
          medicamento: response.data,
          existsInLocal: false,
          existsInRemote: true,
          fromCatalogoCUM: true,
        };
      }
    } catch (error) {
      console.warn('Error searching remote catalog:', error);
    }

    // 4. Search by CUM
    try {
      const response = await apiClient.get<{ ok: boolean; data?: any }>(`/catalogoCum/buscarPorCUM`, { cum: barcode });
      if (response.ok && response.data) {
        fromCatalogoCUM = true;
        existsInRemote = true;
        return {
          medicamento: response.data,
          existsInLocal: false,
          existsInRemote: true,
          fromCatalogoCUM: true,
        };
      }
    } catch (error) {
      console.warn('Error searching by CUM:', error);
    }

    // 5. Search by product name
    try {
      const response = await apiClient.get<{ ok: boolean; data?: any[] }>(`/catalogoCum/buscarPorProducto`, { 
        texto: barcode, 
        limite: 5 
      });
      if (response.ok && response.data && response.data.length > 0) {
        existsInRemote = true;
        return {
          medicamento: response.data[0],
          existsInLocal: false,
          existsInRemote: true,
        };
      }
    } catch (error) {
      console.warn('Error searching by product:', error);
    }

    return {
      medicamento: null,
      existsInLocal: false,
      existsInRemote: false,
    };
  }

  async registerMedicamentoFromScan(data: any): Promise<any> {
    const response = await apiClient.post('/medicamentos/crear', data);
    if (!response.ok) {
      throw new Error(response.error || 'Error creando medicamento');
    }
    return response.data;
  }

  async registerLoteFromScan(data: any): Promise<any> {
    const response = await apiClient.post('/lotes/crear', data);
    if (!response.ok) {
      throw new Error(response.error || 'Error creando lote');
    }
    return response.data;
  }

  getSupportedFormats(): string[] {
    return [...SCANNER_CONFIG.formats];
  }

  isFormatSupported(format: string): boolean {
    return SCANNER_CONFIG.formats.includes(format as any);
  }
}

export const scannerService = ScannerService.getInstance();
