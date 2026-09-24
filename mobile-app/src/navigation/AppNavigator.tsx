import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../hooks';
import { useSyncStatus } from '../hooks';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import PinSetupScreen from '../screens/auth/PinSetupScreen';
import BiometricSetupScreen from '../screens/auth/BiometricSetupScreen';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import InventoryScreen from '../screens/inventory/InventoryScreen';
import LoteDetailScreen from '../screens/inventory/LoteDetailScreen';
import ScannerScreen from '../screens/inventory/ScannerScreen';

import OrdersScreen from '../screens/orders/OrdersScreen';
import OrderDetailScreen from '../screens/orders/OrderDetailScreen';
import CreateOrderScreen from '../screens/orders/CreateOrderScreen';
import DespachoScreen from '../screens/orders/DespachoScreen';
import EntregaScreen from '../screens/orders/EntregaScreen';

import RequestsScreen from '../screens/requests/RequestsScreen';
import SolicitudEliminacionScreen from '../screens/requests/SolicitudEliminacionScreen';
import SolicitudIntercambioScreen from '../screens/requests/SolicitudIntercambioScreen';

import PatientsScreen from '../screens/patients/PatientsScreen';
import ReceptorDetailScreen from '../screens/patients/ReceptorDetailScreen';

import AuditScreen from '../screens/audit/AuditScreen';

import SettingsScreen from '../screens/settings/SettingsScreen';
import SyncSettingsScreen from '../screens/settings/SyncSettingsScreen';
import AccountScreen from '../screens/settings/AccountScreen';

import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import MessagesScreen from '../screens/notifications/MessagesScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PinSetup" component={PinSetupScreen} />
      <Stack.Screen name="BiometricSetup" component={BiometricSetupScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const syncStatus = useSyncStatus();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;
          let IconComponent: typeof Ionicons | typeof MaterialCommunityIcons = Ionicons;

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Inventario':
              iconName = focused ? 'cube' : 'cube-outline';
              break;
            case 'Órdenes':
              iconName = focused ? 'document-text' : 'document-text-outline';
              break;
            case 'Solicitudes':
              iconName = focused ? 'clipboard' : 'clipboard-outline';
              break;
            case 'Pacientes':
              iconName = focused ? 'people' : 'people-outline';
              break;
            case 'Notificaciones':
              iconName = focused ? 'notifications' : 'notifications-outline';
              break;
            default:
              iconName = 'help';
          }
          
          return <IconComponent name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Inventario" component={InventoryScreen} />
      <Tab.Screen name="Órdenes" component={OrdersScreen} />
      <Tab.Screen name="Solicitudes" component={RequestsScreen} />
      <Tab.Screen name="Pacientes" component={PatientsScreen} />
      <Tab.Screen 
        name="Notificaciones" 
        component={NotificationsScreen}
        options={{
          tabBarBadge: 3, // Would come from notification store
        }}
      />
    </Tab.Navigator>
  );
}

function MainDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="Main"
      screenOptions={{
        drawerActiveTintColor: '#2563eb',
        drawerInactiveTintColor: '#64748b',
        drawerItemStyle: { marginVertical: 4 },
      }}
    >
      <Drawer.Screen name="Main" component={MainTabs} />
      <Drawer.Screen name="Configuración" component={SettingsScreen} />
      <Drawer.Screen name="Sincronización" component={SyncSettingsScreen} />
      <Drawer.Screen name="Cuenta" component={AccountScreen} />
      <Drawer.Screen name="Auditoría" component={AuditScreen} />
      <Drawer.Screen name="Mensajes" component={MessagesScreen} />
    </Drawer.Navigator>
  );
}

function AppNavigator() {
  const { usuario, inicializado } = useAuth();
  
  if (!inicializado) {
    return null; // Or show splash screen
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {usuario ? (
          <>
            <Stack.Screen name="Main" component={MainDrawer} />
            <Stack.Screen name="LoteDetail" component={LoteDetailScreen} />
            <Stack.Screen name="Scanner" component={ScannerScreen} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="CreateOrder" component={CreateOrderScreen} />
            <Stack.Screen name="Despacho" component={DespachoScreen} />
            <Stack.Screen name="Entrega" component={EntregaScreen} />
            <Stack.Screen name="SolicitudEliminacion" component={SolicitudEliminacionScreen} />
            <Stack.Screen name="SolicitudIntercambio" component={SolicitudIntercambioScreen} />
            <Stack.Screen name="ReceptorDetail" component={ReceptorDetailScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default AppNavigator;
