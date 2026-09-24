import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export default function DespachoScreen() {
  const navigation = useNavigation();
  const route = React.useRoute<any>();
  const { orden } = route.params;

  const handleComplete = () => {
    Alert.alert(
      'Crear Despacho',
      'Funcionalidad en desarrollo - Seleccionar lote y cantidad',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Despachar Orden</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Orden: {orden.numero}</Text>
          <Text style={styles.orderInfo}>{orden.receptor_nombre} • {orden.total_items} items</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Medicamentos a Despachar</Text>
          <View style={styles.itemsList}>
            {orden.items?.map((item: any, index: number) => (
              <View key={index} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemCodigo}>{item.medicamento_codigo}</Text>
                  <Text style={styles.itemNombre}>{item.medicamento_nombre}</Text>
                </View>
                <View style={styles.itemActions}>
                  <Text style={styles.itemSolicitado}>Solicitado: {item.cantidad_total_solicitada}</Text>
                  <TouchableOpacity style={styles.selectLoteButton}>
                    <Text style={styles.selectLoteButtonText}>Seleccionar Lote</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <MaterialCommunityIcons name="check-circle-outline" size={20} color="white" />
          <Text style={styles.completeButtonText}>Confirmar Despacho</Text>
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  orderInfo: { padding: 20, fontSize: 14, color: '#64748b' },
  itemsList: { padding: 20 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  itemInfo: { flex: 1 },
  itemCodigo: { fontSize: 13, fontWeight: '600', color: '#2563eb', fontFamily: 'monospace' },
  itemNombre: { fontSize: 14, color: '#1e293b', marginTop: 2 },
  itemActions: { alignItems: 'flex-end', gap: 8 },
  itemSolicitado: { fontSize: 13, color: '#64748b' },
  selectLoteButton: { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  selectLoteButtonText: { fontSize: 13, fontWeight: '600', color: 'white' },
  completeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: '#059669', marginTop: 16 },
  completeButtonText: { fontSize: 15, fontWeight: '600', color: 'white' },
});
