import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { useAuth } from '../../hooks';
import { useSyncStatus } from '../../hooks';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function SettingsScreen() {
  const { usuario, logout } = useAuth();
  const syncStatus = useSyncStatus();
  const navigation = useNavigation();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = React.useState(true);
  const [biometricEnabled, setBiometricEnabled] = React.useState(false);

  const handleLogout = () => {
    Alert.alert('Cerrar Sesión', '¿Está seguro de que desea cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar Sesión', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{usuario?.nombre?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{usuario?.nombre}</Text>
              <Text style={styles.profileRole}>{usuario?.rol_nombre} • {usuario?.sede_nombre || 'Todas las sedes'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sincronización</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Estado</Text>
              <Text style={styles.settingValue}>
                {syncStatus === 'SYNCING' ? 'Sincronizando...' : syncStatus === 'ONLINE' ? 'En línea' : 'Sin conexión'}
              </Text>
            </View>
            <MaterialCommunityIcons 
              name={syncStatus === 'SYNCING' ? 'sync' : syncStatus === 'ONLINE' ? 'cloud-check' : 'cloud-off'} 
              size={24} 
              color={syncStatus === 'ONLINE' ? '#059669' : syncStatus === 'SYNCING' ? '#2563eb' : '#dc2626'} 
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Sincronización Automática</Text>
              <Text style={styles.settingDescription}>Sincroniza cambios cada 5 minutos</Text>
            </View>
            <Switch value={autoSyncEnabled} onValueChange={setAutoSyncEnabled} thumbColor="#2563eb" trackColor={{ false: '#cbd5e1', true: '#2563eb' }} />
          </View>

          <TouchableOpacity style={styles.syncButton}>
            <MaterialCommunityIcons name="sync" size={20} color="#2563eb" />
            <Text style={styles.syncButtonText}>Sincronizar Ahora</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Seguridad</Text>
          
          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('PIN', 'Funcionalidad en desarrollo')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Cambiar PIN</Text>
              <Text style={styles.settingDescription}>Modificar PIN de acceso rápido</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Biometría</Text>
              <Text style={styles.settingDescription}>Huella dactilar / Face ID</Text>
            </View>
            <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} thumbColor="#2563eb" trackColor={{ false: '#cbd5e1', true: '#2563eb' }} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Notificaciones Push</Text>
              <Text style={styles.settingDescription}>Recibir alertas de stock, vencimientos, etc.</Text>
            </View>
            <Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} thumbColor="#2563eb" trackColor={{ false: '#cbd5e1', true: '#2563eb' }} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Acerca de</Text>
          
          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('Versión', 'Farmacia Control v1.0.0')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Versión de la App</Text>
              <Text style={styles.settingDescription}>1.0.0 (Build 1)</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('Licencias', 'Licencias de código abierto utilizadas')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Licencias de Código Abierto</Text>
              <Text style={styles.settingDescription}>Ver licencias de dependencias</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="logout-outline" size={20} color="#dc2626" />
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3, overflow: 'hidden', marginBottom: 16 },
  profileSection: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 22, fontWeight: '700', color: 'white' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  profileRole: { fontSize: 13, color: '#64748b' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  settingDescription: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  settingValue: { fontSize: 14, fontWeight: '600', color: '#334155' },
  syncButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, marginHorizontal: 20, marginTop: 8, backgroundColor: '#2563eb', borderRadius: 12 },
  syncButtonText: { fontSize: 14, fontWeight: '600', color: 'white' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, marginTop: 16 },
  logoutButtonText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },
});

