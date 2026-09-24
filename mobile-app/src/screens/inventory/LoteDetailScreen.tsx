import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { MedicamentoRepository, LoteRepository } from '../../services';
import { getLoteEstado } from '../../utils/date';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface RouteParams {
  lote: any;
}

export default function LoteDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation();
  const { lote } = route.params;
  const [loteData, setLoteData] = useState<any>(lote);
  const [loading, setLoading] = useState(false);

  const loteRepo = new LoteRepository();

  useEffect(() => {
    if (lote?.id) {
      loadLote();
    }
  }, []);

  const loadLote = async () => {
    if (!lote?.id) return;
    try {
      setLoading(true);
      const data = await loteRepo.findById(lote.id);
      if (data) {
        setLoteData({ ...data, estado: getLoteEstado(data.fecha_vencimiento, data.cantidad_total_unidades, data.estado_manual) });
      }
    } catch (error) {
      console.error('Error loading lote:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = () => {
    Alert.alert(
      'Ajustar Stock',
      'Funcionalidad en desarrollo',
      [{ text: 'OK' }]
    );
  };

  const handleBaja = () => {
    Alert.alert(
      'Solicitar Baja',
      'Funcionalidad en desarrollo',
      [{ text: 'OK' }]
    );
  };

  if (loading && !loteData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const estado = loteData?.estado || 'DESCONOCIDO';
  const ESTADO_COLORS: Record<string, string> = {
    DISPONIBLE: '#059669',
    PROXIMO_VENCER: '#ea580c',
    VENCIDO: '#dc2626',
    AGOTADO: '#64748b',
    DADO_DE_BAJA: '#991b1b',
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerTitle}>Detalle de Lote</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.estadoBadge, { backgroundColor: ESTADO_COLORS[estado] || '#64748b' }]}>
              <Text style={styles.estadoText}>{estado}</Text>
            </View>
            <Text style={styles.loteNumber}>Lote: {loteData?.numero_lote}</Text>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Medicamento</Text>
              <Text style={styles.infoValue}>{loteData?.medicamento_codigo} - {loteData?.medicamento_nombre}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Sede</Text>
              <Text style={styles.infoValue}>{loteData?.sede_nombre}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Vencimiento</Text>
              <Text style={styles.infoValue}>{loteData?.fecha_vencimiento}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Expedición</Text>
              <Text style={styles.infoValue}>{loteData?.fecha_expedicion}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Cajas</Text>
              <Text style={styles.infoValue}>{loteData?.cantidad_cajas}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Unidades Sueltas</Text>
              <Text style={styles.infoValue}>{loteData?.cantidad_unidades_sueltas}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Total Unidades</Text>
              <Text style={styles.infoValue}>{loteData?.cantidad_total_unidades}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#2563eb' }]} onPress={handleAdjust}>
              <MaterialCommunityIcons name="package-variant" size={20} color="white" />
              <Text style={styles.actionButtonText}>Ajustar Stock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#dc2626' }]} onPress={handleBaja}>
              <MaterialCommunityIcons name="delete-outline" size={20} color="white" />
              <Text style={styles.actionButtonText}>Solicitar Baja</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerLeft: { width: 48 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  headerRight: { width: 48 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3, overflow: 'hidden' },
  cardHeader: { alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  estadoBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 8 },
  estadoText: { fontSize: 13, fontWeight: '700', color: 'white' },
  loteNumber: { fontSize: 16, fontWeight: '600', color: '#334155', fontFamily: 'monospace' },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', padding: 16 },
  infoItem: { width: '50%', paddingHorizontal: 8, marginBottom: 12 },
  infoLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginHorizontal: 16 },
  actionsRow: { flexDirection: 'row', gap: 12, padding: 16 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: 'white' },
});


