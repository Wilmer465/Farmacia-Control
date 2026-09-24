import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { useAuth } from '../../hooks';
import { syncEngine } from '../../services';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function SyncSettingsScreen() {
  const { usuario } = useAuth();
  const navigation = useNavigation();
  const [autoSync, setAutoSync] = React.useState(true);
  const [wifiOnly, setWifiOnly] = React.useState(false);
  const [syncInterval, setSyncInterval] = React.useState(5);
  const [lastSync, setLastSync] = React.useState<Date | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncEngine.sync({ direction: 'BOTH' });
      setLastSync(new Date());
      Alert.alert(result.success ? 'Éxito' : 'Error', result.error || `${result.pushed} subidos, ${result.pulled} bajados`);
    } catch (error) {
      Alert.alert('Error', 'Error en sincronización');
    } finally {
      setSyncing(false);
    }
  };

  const handlePush = async () => {
    setSyncing(true);
    try {
      await syncEngine.sync({ direction: 'PUSH' });
      Alert.alert('Éxito', 'Cambios locales enviados');
    } catch (error) {
      Alert.alert('Error', 'Error en envío');
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    setSyncing(true);
    try {
      await syncEngine.sync({ direction: 'PULL' });
      setLastSync(new Date());
      Alert.alert('Éxito', 'Cambios del servidor descargados');
    } catch (error) {
      Alert.alert('Error', 'Error en descarga');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sincronización</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Estado Actual</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Última sincronización</Text>
              <Text style={styles.statusValue}>{lastSync ? lastSync.toLocaleString() : 'Nunca'}</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={styles.statusLabel}>Intervalo</Text>
              <Text style={styles.statusValue}>{syncInterval} min</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Configuración</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Sincronización Automática</Text>
              <Text style={styles.settingDescription}>Cada {syncInterval} minutos</Text>
            </View>
            <Switch value={autoSync} onValueChange={setAutoSync} thumbColor="#2563eb" trackColor={{ false: '#cbd5e1', true: '#2563eb' }} />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Solo WiFi</Text>
              <Text style={styles.settingDescription}>No usar datos móviles</Text>
            </View>
            <Switch value={wifiOnly} onValueChange={setWifiOnly} thumbColor="#2563eb" trackColor={{ false: '#cbd5e1', true: '#2563eb' }} />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Intervalo</Text>
              <Text style={styles.settingDescription}>Minutos entre sincronizaciones</Text>
            </View>
            <TouchableOpacity style={styles.intervalButton} onPress={() => Alert.alert('Intervalo', 'Funcionalidad en desarrollo')}>
              <Text style={styles.intervalButtonText}>{syncInterval} min</Text>
              <Ionicons name="chevron-forward-outline" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Acciones</Text>
          
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#2563eb' }]} onPress={handleSync} disabled={syncing}>
            <MaterialCommunityIcons name={syncing ? 'loading' : 'sync'} size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>{syncing ? 'Sincronizando...' : 'Sincronizar Todo (Push + Pull)'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#059669' }]} onPress={handlePush} disabled={syncing}>
            <MaterialCommunityIcons name="upload-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>Solo Enviar (Push)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#7c3aed' }]} onPress={handlePull} disabled={syncing}>
            <MaterialCommunityIcons name="download-outline" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>Solo Descargar (Pull)</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Configuración Avanzada</Text>
          
          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('Conflictos', 'Funcionalidad en desarrollo')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Resolver Conflictos</Text>
              <Text style={styles.settingDescription}>Gestionar conflictos pendientes</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('Logs', 'Funcionalidad en desarrollo')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Ver Logs de Sync</Text>
              <Text style={styles.settingDescription}>Historial detallado de sincronizaciones</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  statusRow: { flexDirection: 'row', padding: 20, gap: 16 },
  statusItem: { flex: 1 },
  statusLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 2 },
  statusValue: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  settingDescription: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  intervalButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 8 },
  intervalButtonText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 12 },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: 'white' },
});

