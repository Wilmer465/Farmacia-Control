import React, { useEffect } from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { authService, sqliteService, notificationService, permissionsService } from './src/services';
import { theme } from './src/constants/theme';
import { registerRootComponent } from 'expo';

export default function App() {
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize SQLite
      await sqliteService.initialize();
      
      // Initialize services
      await authService.initialize();
      await notificationService.initialize();
      await permissionsService.requestMultiplePermissions(['camera', 'notifications']);
      
      console.log('[App] Initialization complete');
    } catch (error) {
      console.error('[App] Initialization error:', error);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <AppNavigator />
          <StatusBar style="auto" />
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

registerRootComponent(App);