import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NOTIFICATION_CONFIG } from '../../constants/config';
import { Notificacion } from '../../types/domain';
import { NotificacionRepository } from '../database/repositories/NotificacionRepository';

export interface LocalNotification {
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: boolean;
}

export class NotificationService {
  private static instance: NotificationService;
  private notificacionRepo = new NotificacionRepository();
  private initialized = false;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    // Create channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CONFIG.channelId, {
        name: NOTIFICATION_CONFIG.channelName,
        description: NOTIFICATION_CONFIG.channelDescription,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: NOTIFICATION_CONFIG.vibrationPattern,
        sound: 'default',
        enableVibrate: true,
        enableLights: true,
      });
    }

    // Request permissions
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowAnnouncements: true,
      },
    });

    if (status !== 'granted') {
      console.warn('Notification permissions not granted');
    }

    this.initialized = true;
  }

  async showLocalNotification(notification: LocalNotification): Promise<string | null> {
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          sound: notification.sound !== false,
          badge: 1,
        },
        trigger: null, // Show immediately
      });
      return identifier;
    } catch (error) {
      console.error('Error showing local notification:', error);
      return null;
    }
  }

  async scheduleNotification(notification: LocalNotification, trigger: Notifications.NotificationTriggerInput): Promise<string | null> {
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          sound: notification.sound !== false,
        },
        trigger,
      });
      return identifier;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  async scheduleExpirationNotification(medicamentoNombre: string, loteNumero: string, fechaVencimiento: string, diasRestantes: number): Promise<void> {
    const triggerDate = new Date();
    triggerDate.setHours(9, 0, 0, 0); // 9 AM
    
    // If today is already past trigger time, schedule for tomorrow
    if (triggerDate <= new Date()) {
      triggerDate.setDate(triggerDate.getDate() + 1);
    }

    await this.scheduleNotification({
      title: 'Medicamento próximo a vencer',
      body: `${medicamentoNombre} (Lote: ${loteNumero}) vence en ${diasRestantes} días (${fechaVencimiento})`,
      data: { tipo: 'VENCIMIENTO', lote_numero: loteNumero },
    }, {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      repeats: false,
    } as any);
  }

  async scheduleStockLowNotification(medicamentoNombre: string, cantidadActual: number, umbral: number): Promise<void> {
    await this.showLocalNotification({
      title: 'Stock bajo',
      body: `${medicamentoNombre} tiene solo ${cantidadActual} unidades (umbral: ${umbral})`,
      data: { tipo: 'STOCK_BAJO', medicamento: medicamentoNombre },
    });
  }

  async scheduleOrderReadyNotification(ordenNumero: string): Promise<void> {
    await this.showLocalNotification({
      title: 'Orden lista para despacho',
      body: `La orden ${ordenNumero} está lista para ser despachada`,
      data: { tipo: 'ORDEN_LISTA', orden_numero: ordenNumero },
    });
  }

  async scheduleSolicitudProcessedNotification(tipo: string, estado: string): Promise<void> {
    await this.showLocalNotification({
      title: `Solicitud ${estado}`,
      body: `Su solicitud de ${tipo} ha sido ${estado.toLowerCase()}`,
      data: { tipo: 'SOLICITUD_PROCESADA', solicitud_tipo: tipo, estado },
    });
  }

  async saveNotification(remoteNotif: Notificacion): Promise<number> {
    return this.notificacionRepo.create(remoteNotif);
  }

  async getNotifications(filters?: { leida?: number; limit?: number; offset?: number }): Promise<Notificacion[]> {
    return this.notificacionRepo.findAll(filters);
  }

  async getUnreadCount(): Promise<number> {
    return this.notificacionRepo.findUnreadCount();
  }

  async markAsRead(ids: number[]): Promise<void> {
    return this.notificacionRepo.markAsRead(ids);
  }

  async markAllAsRead(): Promise<void> {
    return this.notificacionRepo.markAllAsRead();
  }

  async cancelAllScheduled(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async cancelNotification(identifier: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }

  addNotificationReceivedListener(listener: (notification: Notifications.Notification) => void): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(listener);
  }

  addNotificationResponseListener(listener: (response: Notifications.NotificationResponse) => void): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener(listener);
  }

  async getExpoPushToken(): Promise<string | null> {
    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-project-id', // Replace with actual Expo project ID
      });
      return token.data;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }
}

export const notificationService = NotificationService.getInstance();
