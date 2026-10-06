import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks';
import { useNavigation } from '@react-navigation/native';

const ESTADO_COLORS = {
  PENDIENTE: '#2563eb',
  PARCIAL: '#ea580c',
  COMPLETADA: '#059669',
  CANCELADA: '#64748b',
};

export default function OrdersScreen() {
  const { usuario } = useAuth();
  const navigation = useNavigation();
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterEstado, setFilterEstado] = useState<'TODOS' | 'PENDIENTE' | 'PARCIAL' | 'COMPLETADA' | 'CANCELADA'>('TODOS');

  const loadData = async () => {
    try {
      setLoading(true);
      // Mock data - replace with actual API call
      setOrdenes([
        { id: 1, numero: 'ORD2409150001', estado: 'PENDIENTE', fecha_creacion: '2024-09-15', total_items: 5, receptor_nombre: 'Juan Pérez' },
        { id: 2, numero: 'ORD2409150002', estado: 'PARCIAL', fecha_creacion: '2024-09-15', total_items: 3, receptor_nombre: 'María López' },
        { id: 3, numero: 'ORD2409140001', estado: 'COMPLETADA', fecha_creacion: '2024-09-14', total_items: 8, receptor_nombre: 'Carlos Ruiz' },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las órdenes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filteredOrdenes = ordenes.filter(o => filterEstado === 'TODOS' || o.estado === filterEstado);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Órdenes</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateOrder')}>
          <View style={styles.addButton}>
            <Ionicons name="add" size={24} color="white" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {['TODOS', 'PENDIENTE', 'PARCIAL', 'COMPLETADA', 'CANCELADA'].map(estado => (
          <TouchableOpacity
            key={estado}
            style={[styles.filterChip, filterEstado === estado && { backgroundColor: '#2563eb', borderColor: '#2563eb' }]}
            onPress={() => setFilterEstado(estado as any)}
          >
            <Text style={[styles.filterChipText, filterEstado === estado && { color: 'white' }]}>{estado}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredOrdenes}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.orderCard} onPress={() => navigation.navigate('OrderDetail', { orden: item })}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderNumber}>{item.numero}</Text>
              <View style={[styles.estadoBadge, { backgroundColor: ESTADO_COLORS[item.estado as keyof typeof ESTADO_COLORS] }]}>
                <Text style={styles.estadoText}>{item.estado}</Text>
              </View>
            </View>
            <View style={styles.orderDetails}>
              <Text style={styles.orderReceptor}>{item.receptor_nombre}</Text>
              <Text style={styles.orderDate}>{item.fecha_creacion}</Text>
              <Text style={styles.orderItems}>{item.total_items} items</Text>
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No hay órdenes</Text></View>}
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
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: 'white' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  orderCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNumber: { fontSize: 16, fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' },
  estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  estadoText: { fontSize: 11, fontWeight: '700', color: 'white' },
  orderDetails: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  orderReceptor: { fontSize: 13, color: '#334155' },
  orderDate: { fontSize: 13, color: '#64748b' },
  orderItems: { fontSize: 13, color: '#64748b' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  listContent: { paddingBottom: 24 },
});

