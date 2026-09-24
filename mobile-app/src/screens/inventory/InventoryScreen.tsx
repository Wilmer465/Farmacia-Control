import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks';
import { MedicamentoRepository, LoteRepository } from '../../services';
import { getLoteEstado } from '../../utils/date';
import { useNavigation } from '@react-navigation/native';

const ESTADO_COLORS = {
  DISPONIBLE: '#059669',
  PROXIMO_VENCER: '#ea580c',
  VENCIDO: '#dc2626',
  AGOTADO: '#64748b',
  DADO_DE_BAJA: '#991b1b',
};

export default function InventoryScreen() {
  const { usuario } = useAuth();
  const navigation = useNavigation();
  const [medicamentos, setMedicamentos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<'TODOS' | 'DISPONIBLE' | 'PROXIMO_VENCER' | 'VENCIDO' | 'AGOTADO'>('TODOS');
  const [showScanner, setShowScanner] = useState(false);

  const medRepo = new MedicamentoRepository();
  const loteRepo = new LoteRepository();

  const loadData = async () => {
    try {
      setLoading(true);
      const [meds, lots] = await Promise.all([
        medRepo.findAll(),
        loteRepo.findBySede(usuario.sede_id || 1),
      ]);
      setMedicamentos(meds);
      setLotes(lots.map(l => ({ ...l, estado: getLoteEstado(l.fecha_vencimiento, l.cantidad_total_unidades, l.estado_manual) })));
    } catch (error) {
      console.error('Error loading inventory:', error);
      Alert.alert('Error', 'No se pudo cargar el inventario');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredLotes = lotes.filter(lote => {
    const matchesSearch = !search || 
      lote.medicamento_nombre?.toLowerCase().includes(search.toLowerCase()) ||
      lote.medicamento_codigo?.toLowerCase().includes(search.toLowerCase()) ||
      lote.numero_lote?.toLowerCase().includes(search.toLowerCase());
    
    const matchesEstado = filterEstado === 'TODOS' || lote.estado === filterEstado;
    
    return matchesSearch && matchesEstado;
  });

  const handleLotePress = (lote: any) => {
    navigation.navigate('LoteDetail', { lote });
  };

  const handleScanner = () => {
    setShowScanner(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Cargando inventario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inventario y Lotes</Text>
          <Text style={styles.subtitle}>{lotes.length} lotes • {medicamentos.length} medicamentos</Text>
        </View>
        <TouchableOpacity style={styles.scanButton} onPress={handleScanner}>
          <Ionicons name="qr-code-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={20} color="#94a3b8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar medicamento, lote o código..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94a3b8"
        />
        {search && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filters}>
        {['TODOS', 'DISPONIBLE', 'PROXIMO_VENCER', 'VENCIDO', 'AGOTADO'].map(estado => (
          <TouchableOpacity
            key={estado}
            style={[
              styles.filterChip,
              filterEstado === estado && { backgroundColor: '#2563eb', borderColor: '#2563eb' }
            ]}
            onPress={() => setFilterEstado(estado as any)}
          >
            <Text style={[
              styles.filterChipText,
              filterEstado === estado && { color: 'white' }
            ]}>
              {estado === 'TODOS' ? 'Todos' : estado === 'PROXIMO_VENCER' ? 'Próx. Vencer' : estado}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredLotes}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.loteCard} onPress={() => handleLotePress(item)}>
            <View style={styles.loteHeader}>
              <View style={styles.loteInfo}>
                <Text style={styles.loteCodigo}>{item.medicamento_codigo}</Text>
                <Text style={styles.loteNombre}>{item.medicamento_nombre}</Text>
              </View>
              <View style={[styles.estadoBadge, { backgroundColor: ESTADO_COLORS[item.estado as keyof typeof ESTADO_COLORS] || '#64748b' }]}>
                <Text style={styles.estadoText}>{item.estado}</Text>
              </View>
            </View>
            <View style={styles.loteDetails}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Lote</Text>
                <Text style={styles.detailValue}>{item.numero_lote}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Vence</Text>
                <Text style={styles.detailValue}>{item.fecha_vencimiento}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Stock</Text>
                <Text style={styles.detailValue}>{item.cantidad_total_unidades} unds</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyText}>No se encontraron lotes</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#64748b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b' },
  scanButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 12, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#1e293b' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: 'white' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  loteCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  loteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  loteInfo: { flex: 1, marginRight: 12 },
  loteCodigo: { fontSize: 13, fontWeight: '600', color: '#2563eb', fontFamily: 'monospace' },
  loteNombre: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginTop: 2 },
  estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  estadoText: { fontSize: 11, fontWeight: '700', color: 'white' },
  loteDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  detailItem: { alignItems: 'flex-start' },
  detailLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 2 },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyText: { marginTop: 12, fontSize: 14, color: '#94a3b8' },
  listContent: { paddingBottom: 24 },
});


