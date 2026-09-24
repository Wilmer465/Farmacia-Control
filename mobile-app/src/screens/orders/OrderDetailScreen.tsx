import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface RouteParams {
  orden: any;
}

export default function OrderDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation();
  const { orden } = route.params;

  const handleDespachar = () => {
    navigation.navigate('Despacho', { orden });
  };

  const handleEntregar = () => {
    navigation.navigate('Entrega', { orden });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Orden {orden.numero}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderNumber}>{orden.numero}</Text>
            <View style={[styles.estadoBadge, { backgroundColor: '#2563eb' }]}>
              <Text style={styles.estadoText}>{orden.estado}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Receptor</Text>
              <Text style={styles.infoValue}>{orden.receptor_nombre}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Documento</Text>
              <Text style={styles.infoValue}>{orden.receptor_documento}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fecha</Text>
              <Text style={styles.infoValue}>{orden.fecha_creacion}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Items</Text>
              <Text style={styles.infoValue}>{orden.total_items}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Medicamentos</Text>
          <View style={styles.medicamentosList}>
            {orden.items?.map((item: any, index: number) => (
              <View key={index} style={styles.medicamentoRow}>
                <Text style={styles.medicamentoCodigo}>{item.medicamento_codigo}</Text>
                <Text style={styles.medicamentoNombre}>{item.medicamento_nombre}</Text>
                <Text style={styles.medicamentoCantidad}>{item.cantidad_total_solicitada} unds</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actionsContainer}>
          {['PENDIENTE', 'PARCIAL'].includes(orden.estado) && (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#059669' }]} onPress={handleDespachar}>
              <MaterialCommunityIcons name="truck-outline" size={20} color="white" />
              <Text style={styles.actionButtonText}>Despachar</Text>
            </TouchableOpacity>
          )}
          {orden.documentacion_completa === 0 && (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#ea580c' }]} onPress={handleEntregar}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="white" />
              <Text style={styles.actionButtonText}>Completar Entrega</Text>
            </TouchableOpacity>
          )}
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
  card: { backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3, overflow: 'hidden' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  orderNumber: { fontSize: 18, fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' },
  estadoBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  estadoText: { fontSize: 12, fontWeight: '700', color: 'white' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 20 },
  infoItem: { width: '50%', paddingHorizontal: 8, marginBottom: 12 },
  infoLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginHorizontal: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', paddingHorizontal: 16, marginTop: 16, marginBottom: 12 },
  medicamentosList: { paddingHorizontal: 16 },
  medicamentoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  medicamentoCodigo: { width: 80, fontSize: 13, fontWeight: '600', color: '#2563eb', fontFamily: 'monospace' },
  medicamentoNombre: { flex: 1, fontSize: 14, color: '#1e293b', marginLeft: 12 },
  medicamentoCantidad: { fontSize: 14, fontWeight: '600', color: '#059669' },
  actionsContainer: { padding: 16, gap: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12 },
  actionButtonText: { fontSize: 15, fontWeight: '600', color: 'white' },
});
