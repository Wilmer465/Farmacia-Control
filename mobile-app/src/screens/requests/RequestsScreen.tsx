import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks';
import { useNavigation } from '@react-navigation/native';

const ESTADO_COLORS = {
  PENDIENTE: '#f59e0b',
  APROBADA: '#059669',
  RECHAZADA: '#dc2626',
};

export default function RequestsScreen() {
  const { usuario } = useAuth();
  const navigation = useNavigation();
  const [eliminaciones, setEliminaciones] = useState<any[]>([]);
  const [intercambios, setIntercambios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'eliminaciones' | 'intercambios'>('eliminaciones');

  const loadData = async () => {
    try {
      setLoading(true);
      // Mock data
      setEliminaciones([
        { id: 1, motivo: 'Lote vencido', estado: 'PENDIENTE', fecha_solicitud: '2024-09-20', medicamento: 'Paracetamol 500mg', lote: 'LTE-001' },
        { id: 2, motivo: 'Frascos rotos', estado: 'APROBADA', fecha_solicitud: '2024-09-18', medicamento: 'Ibuprofeno 400mg', lote: 'LTE-002' },
      ]);
      setIntercambios([
        { id: 1, tipo: 'ENVIO', sede_origen: 'Sede Quibdó', sede_destino: 'Sede Medellín', estado: 'PENDIENTE', fecha_solicitud: '2024-09-19', medicamento: 'Amoxicilina 500mg', cantidad: 100 },
        { id: 2, tipo: 'INTERCAMBIO', sede_origen: 'Sede Medellín', sede_destino: 'Sede Bogotá', estado: 'APROBADA', fecha_solicitud: '2024-09-15', medicamento: 'Omeprazol 20mg', cantidad: 50 },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las solicitudes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const data = activeTab === 'eliminaciones' ? eliminaciones : intercambios;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Solicitudes</Text>
        {usuario.rol_nombre === 'SUPERADMIN' || usuario.rol_nombre === 'ADMIN' ? (
          <TouchableOpacity onPress={() => navigation.navigate(activeTab === 'eliminaciones' ? 'SolicitudEliminacion' : 'SolicitudIntercambio')}>
            <View style={styles.addButton}>
              <Ionicons name="add" size={24} color="white" />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, activeTab === 'eliminaciones' && styles.tabActive]} onPress={() => setActiveTab('eliminaciones')}>
          <Text style={[styles.tabText, activeTab === 'eliminaciones' && styles.tabTextActive]}>Bajas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'intercambios' && styles.tabActive]} onPress={() => setActiveTab('intercambios')}>
          <Text style={[styles.tabText, activeTab === 'intercambios' && styles.tabTextActive]}>Intercambios</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>{item.medicamento}</Text>
              <View style={[styles.estadoBadge, { backgroundColor: ESTADO_COLORS[item.estado as keyof typeof ESTADO_COLORS] }]}>
                <Text style={styles.estadoText}>{item.estado}</Text>
              </View>
            </View>
            <View style={styles.itemDetails}>
              <Text style={styles.itemDetail}>📦 Lote: {item.lote}</Text>
              <Text style={styles.itemDetail}>📅 {item.fecha_solicitud}</Text>
              {activeTab === 'intercambios' && (
                <>
                  <Text style={styles.itemDetail}>🔄 {item.tipo}</Text>
                  <Text style={styles.itemDetail}>📍 {item.sede_origen} → {item.sede_destino}</Text>
                  <Text style={styles.itemDetail}>📊 Cantidad: {item.cantidad}</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No hay solicitudes</Text></View>}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  addButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4, marginHorizontal: 16, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#2563eb' },
  itemCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  estadoText: { fontSize: 11, fontWeight: '700', color: 'white' },
  itemDetails: { gap: 4 },
  itemDetail: { fontSize: 13, color: '#64748b' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
});

