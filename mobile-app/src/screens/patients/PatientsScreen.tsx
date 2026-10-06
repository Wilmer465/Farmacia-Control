import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks';
import { useNavigation } from '@react-navigation/native';

const PRIORIDAD_COLORS = {
  ALTA: '#dc2626',
  MEDIA: '#ea580c',
  BAJA: '#059669',
};

export default function PatientsScreen() {
  const { usuario } = useAuth();
  const navigation = useNavigation();
  const [receptores, setReceptores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      // Mock data
      setReceptores([
        { id: 1, nombre: 'Juan Pérez', documento: '12345678', telefono: '3001234567', prioridad: 'ALTA', medicamentos: ['Paracetamol', 'Ibuprofeno'] },
        { id: 2, nombre: 'María López', documento: '87654321', telefono: '3007654321', prioridad: 'MEDIA', medicamentos: ['Amoxicilina'] },
        { id: 3, nombre: 'Carlos Ruiz', documento: '11223344', telefono: '3001122334', prioridad: 'BAJA', medicamentos: ['Omeprazol', 'Loratadina'] },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar los receptores');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const filtered = receptores.filter(r => 
    !search || 
    r.nombre.toLowerCase().includes(search.toLowerCase()) ||
    r.documento.includes(search)
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Documento de Usuarios</Text>
        <TouchableOpacity onPress={() => Alert.alert('Nuevo', 'Funcionalidad en desarrollo')}>
          <View style={styles.addButton}>
            <Ionicons name="add" size={24} color="white" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={20} color="#94a3b8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o documento..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94a3b8"
        />
      </View>

      <FlatList
        data={filtered}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.itemCard} onPress={() => navigation.navigate('ReceptorDetail', { receptor: item })}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.nombre}</Text>
              <View style={[styles.prioridadBadge, { backgroundColor: PRIORIDAD_COLORS[item.prioridad as keyof typeof PRIORIDAD_COLORS] }]}>
                <Text style={styles.prioridadText}>{item.prioridad}</Text>
              </View>
            </View>
            <View style={styles.itemDetails}>
              <Text style={styles.itemDetail}>{item.documento}</Text>
              <Text style={styles.itemDetail}>{item.telefono}</Text>
              <Text style={styles.itemDetail}>{item.medicamentos.join(', ')}</Text>
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No hay receptores</Text></View>}
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
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#1e293b' },
  itemCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  prioridadBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  prioridadText: { fontSize: 11, fontWeight: '700', color: 'white' },
  itemDetails: { gap: 4 },
  itemDetail: { fontSize: 13, color: '#64748b' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
});

