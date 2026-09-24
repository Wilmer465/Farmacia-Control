import React from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../../hooks';
import { useSyncStatus } from '../../hooks';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const QuickAction = ({ icon, label, color, onPress }: { 
  icon: string; 
  label: string; 
  color: string; 
  onPress: () => void; 
}) => (
  <TouchableOpacity style={[styles.actionCard, { backgroundColor: color }]} onPress={onPress}>
    <Ionicons name={icon} size={28} color="white" />
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

export default function DashboardScreen({ navigation }: any) {
  const { usuario } = useAuth();
  const syncStatus = useSyncStatus();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh data
    setTimeout(() => setRefreshing(false), 1000);
  };

  const stats = [
    { label: 'Medicamentos', value: '1,234', icon: 'cube', color: '#2563eb' },
    { label: 'Lotes Activos', value: '567', icon: 'package-variant', color: '#059669' },
    { label: 'Órdenes Pendientes', value: '23', icon: 'clipboard-text', color: '#dc2626' },
    { label: 'Próximos a Vencer', value: '12', icon: 'alert-circle', color: '#ea580c' },
  ];

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={styles.container}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {usuario?.nombre?.split(' ')[0] || 'Usuario'}</Text>
          <Text style={styles.subtitle}>{usuario?.rol_nombre} • {usuario?.sede_nombre || 'Todas las sedes'}</Text>
        </View>
        <View style={styles.syncBadge}>
          <MaterialCommunityIcons 
            name={syncStatus === 'SYNCING' ? 'sync' : syncStatus === 'ONLINE' ? 'cloud-check' : 'cloud-off'} 
            size={20} 
            color={syncStatus === 'ONLINE' ? '#059669' : syncStatus === 'SYNCING' ? '#2563eb' : '#dc2626'} 
          />
          <Text style={{ 
            marginLeft: 4, 
            fontSize: 12, 
            fontWeight: '600',
            color: syncStatus === 'ONLINE' ? '#059669' : syncStatus === 'SYNCING' ? '#2563eb' : '#dc2626'
          }}>
            {syncStatus === 'ONLINE' ? 'En línea' : syncStatus === 'SYNCING' ? 'Sincronizando' : 'Sin conexión'}
          </Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        {stats.map((stat, index) => (
          <View key={index} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: stat.color }]}>
              <MaterialCommunityIcons name={stat.icon} size={24} color="white" />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Accesos Rápidos</Text>
      </View>

      <View style={styles.actionsGrid}>
        <QuickAction 
          icon="cube-outline" 
          label="Inventario" 
          color="#2563eb" 
          onPress={() => navigation.navigate('Inventario')} 
        />
        <QuickAction 
          icon="document-text-outline" 
          label="Órdenes" 
          color="#059669" 
          onPress={() => navigation.navigate('Órdenes')} 
        />
        <QuickAction 
          icon="camera-outline" 
          label="Escanear" 
          color="#7c3aed" 
          onPress={() => navigation.navigate('Scanner')} 
        />
        <QuickAction 
          icon="clipboard-outline" 
          label="Solicitudes" 
          color="#dc2626" 
          onPress={() => navigation.navigate('Solicitudes')} 
        />
        <QuickAction 
          icon="package-variant" 
          label="Entradas" 
          color="#ea580c" 
          onPress={() => navigation.navigate('Inventario')} 
        />
        <QuickAction 
          icon="chart-line" 
          label="Reportes" 
          color="#0891b2" 
          onPress={() => Alert.alert('Próximamente', 'Reportes en desarrollo')} 
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Alertas Recientes</Text>
      </View>

      <View style={styles.alertCard}>
        <Text style={styles.alertTitle}>⚠️ 5 lotes próximos a vencer</Text>
        <Text style={styles.alertBody}>Revisar inventario para gestionar vencimientos</Text>
      </View>

      <View style={styles.alertCard}>
        <Text style={styles.alertTitle}>📦 3 órdenes pendientes de despacho</Text>
        <Text style={styles.alertBody}>Procesar despachos para evitar retrasos</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f1f5f9',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#ffffff',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  actionCard: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionLabel: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  alertCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  alertBody: {
    fontSize: 13,
    color: '#64748b',
  },
});

