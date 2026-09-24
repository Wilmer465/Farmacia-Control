import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export class SecureStorage {
  static async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (error) {
      console.error(`SecureStorage setItem error for ${key}:`, error);
      throw error;
    }
  }

  static async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(key);
      } else {
        return await SecureStore.getItemAsync(key);
      }
    } catch (error) {
      console.error(`SecureStorage getItem error for ${key}:`, error);
      return null;
    }
  }

  static async deleteItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (error) {
      console.error(`SecureStorage deleteItem error for ${key}:`, error);
      throw error;
    }
  }

  static async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.clear();
      } else {
        // Note: expo-secure-store doesn't have a clear method
        // We'd need to delete known keys individually
      }
    } catch (error) {
      console.error('SecureStorage clear error:', error);
      throw error;
    }
  }
}
