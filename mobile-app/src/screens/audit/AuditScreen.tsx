import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks';

export default function AuditScreen() {
  const { usuario } = useAuth();
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      // Mock data
      setAuditoria([
        { id: 1, accion: 'CREAR_LOTE', modulo: 'INVENTARIO', usuario: 'Wilmer', fecha: '2024-09-23 10:30', resultado: 'EXITO', detalle: 'Lote LTE-001 creado' },
        { id: 2, accion: 'DESPACHAR_MEDICAMENTO', modulo: 'DESPACHOS', usuario: 'inv_quibdo', fecha: '2024-09-23 09:15', resultado: 'EXITO', detalle: 'Orden ORD2409150001 despachada' },
        { id: 3, accion: 'LOGIN', modulo: 'AUTH', usuario: 'superadmin', fecha: '2024-09-23 08:00', resultado: 'EXITO', detalle: 'Inicio de sesión exitoso' },
        { id: 4, accion: 'SOLICITAR_ELIMINACION', modulo: 'SOLICITUDES', usuario: 'inv_medellin', fecha: '2024-09-22 16:45', resultado: 'EXITO', detalle: 'Solicitud baja lote LTE-005' },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudo cargar la auditoría');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Auditoría</Text>
      </View>

      <FlatList
        data={auditoria}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemAction}>{item.accion}</Text>
              <View style={[styles.resultadoBadge, { backgroundColor: item.resultado === 'EXITO' ? '#059669' : item.resultado === 'FALLIDO' ? '#dc2626' : '#f59e0b' }]}>
                <Text style={styles.resultadoText}>{item.resultado}</Text>
              </View>
            </View>
            <View style={styles.itemDetails}>
              <Text style={styles.itemDetail}>📦 {item.modulo}</Text>
              <Text style={styles.itemDetail}>👤 {item.usuario}</Text>
              <Text style={styles.itemDetail}>📅 {item.fecha}</Text>
            </View>
            <Text style={styles.itemDetalle}>{item.detalle}</Text>
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No hay registros de auditoría</Text></View>}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  itemCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemAction: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  resultadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  resultadoText: { fontSize: 11, fontWeight: '700', color: 'white' },
  itemDetails: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  itemDetail: { fontSize: 12, color: '#64748b' },
  itemDetalle: { fontSize: 13, color: '#334155', fontStyle: 'italic' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
});

