import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { BarCodeScanner } from 'expo-barcode-scanner';

export type PermissionType = 
  | 'camera' 
  | 'notifications' 
  | 'location' 
  | 'biometrics' 
  | 'storage';

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

export class PermissionsService {
  private static instance: PermissionsService;

  static getInstance(): PermissionsService {
    if (!PermissionsService.instance) {
      PermissionsService.instance = new PermissionsService();
    }
    return PermissionsService.instance;
  }

  async requestPermission(type: PermissionType): Promise<PermissionResult> {
    switch (type) {
      case 'camera':
        return this.requestCameraPermission();
      case 'notifications':
        return this.requestNotificationPermission();
      case 'location':
        return this.requestLocationPermission();
      case 'biometrics':
        return this.requestBiometricPermission();
      case 'storage':
        return this.requestStoragePermission();
      default:
        return { granted: false, canAskAgain: false, status: 'denied' };
    }
  }

  async requestMultiplePermissions(types: PermissionType[]): Promise<Record<PermissionType, PermissionResult>> {
    const results: Record<PermissionType, PermissionResult> = {} as any;
    
    for (const type of types) {
      results[type] = await this.requestPermission(type);
    }
    
    return results;
  }

  async checkPermission(type: PermissionType): Promise<PermissionResult> {
    switch (type) {
      case 'camera':
        return this.checkCameraPermission();
      case 'notifications':
        return this.checkNotificationPermission();
      case 'location':
        return this.checkLocationPermission();
      case 'biometrics':
        return { granted: false, canAskAgain: true, status: 'undetermined' };
      case 'storage':
        return { granted: true, canAskAgain: true, status: 'granted' };
      default:
        return { granted: false, canAskAgain: false, status: 'denied' };
    }
  }

  private async requestCameraPermission(): Promise<PermissionResult> {
    if (Platform.OS === 'web') {
      return { granted: true, canAskAgain: true, status: 'granted' };
    }

    try {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      return {
        granted: status === 'granted',
        canAskAgain: status !== 'denied',
        status: status as any,
      };
    } catch (error) {
      console.error('Camera permission error:', error);
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  }

  private async checkCameraPermission(): Promise<PermissionResult> {
    if (Platform.OS === 'web') {
      return { granted: true, canAskAgain: true, status: 'granted' };
    }

    try {
      const { status } = await BarCodeScanner.getPermissionsAsync();
      return {
        granted: status === 'granted',
        canAskAgain: status !== 'denied',
        status: status as any,
      };
    } catch (error) {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  }

  private async requestNotificationPermission(): Promise<PermissionResult> {
    if (Platform.OS === 'web') {
      return { granted: true, canAskAgain: true, status: 'granted' };
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      return {
        granted: status === 'granted',
        canAskAgain: status !== 'denied',
        status: status as any,
      };
    } catch (error) {
      console.error('Notification permission error:', error);
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  }

  private async checkNotificationPermission(): Promise<PermissionResult> {
    if (Platform.OS === 'web') {
      return { granted: true, canAskAgain: true, status: 'granted' };
    }

    try {
      const { status } = await Notifications.getPermissionsAsync();
      return {
        granted: status === 'granted',
        canAskAgain: status !== 'denied',
        status: status as any,
      };
    } catch (error) {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  }

  private async requestLocationPermission(): Promise<PermissionResult> {
    if (Platform.OS === 'web') {
      return { granted: true, canAskAgain: true, status: 'granted' };
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return {
        granted: status === 'granted',
        canAskAgain: status !== 'denied',
        status: status as any,
      };
    } catch (error) {
      console.error('Location permission error:', error);
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  }

  private async checkLocationPermission(): Promise<PermissionResult> {
    if (Platform.OS === 'web') {
      return { granted: true, canAskAgain: true, status: 'granted' };
    }

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return {
        granted: status === 'granted',
        canAskAgain: status !== 'denied',
        status: status as any,
      };
    } catch (error) {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  }

  private async requestBiometricPermission(): Promise<PermissionResult> {
    // Biometric permission is handled by expo-local-authentication
    // which doesn't require a separate permission request
    return { granted: true, canAskAgain: true, status: 'granted' };
  }

  private async requestStoragePermission(): Promise<PermissionResult> {
    if (Platform.OS === 'ios') {
      return { granted: true, canAskAgain: true, status: 'granted' };
    }

    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        // Android 13+ uses read media permissions
        return { granted: true, canAskAgain: true, status: 'granted' };
      }
      
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          {
            title: 'Permiso de almacenamiento',
            message: 'La aplicación necesita acceso al almacenamiento para guardar archivos',
            buttonNeutral: 'Preguntar luego',
            buttonNegative: 'Cancelar',
            buttonPositive: 'Aceptar',
          }
        );
        return {
          granted: granted === PermissionsAndroid.RESULTS.GRANTED,
          canAskAgain: granted !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
          status: granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied',
        };
      } catch (error) {
        console.error('Storage permission error:', error);
        return { granted: false, canAskAgain: true, status: 'denied' };
      }
    }

    return { granted: true, canAskAgain: true, status: 'granted' };
  }

  async openSettings(): Promise<void> {
    if (Platform.OS === 'ios') {
      // iOS doesn't have a direct API to open app settings
      // User must manually go to Settings
    } else if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.openSettings();
      } catch (error) {
        console.error('Error opening settings:', error);
      }
    }
  }
}

export const permissionsService = PermissionsService.getInstance();
