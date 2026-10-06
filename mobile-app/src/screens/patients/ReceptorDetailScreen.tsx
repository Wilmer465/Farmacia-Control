import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface RouteParams {
  receptor: any;
}

export default function ReceptorDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation();
  const { receptor } = route.params;

  const PRIORIDAD_COLORS: Record<string, string> = {
    ALTA: '#dc2626',
    MEDIA: '#ea580c',
    BAJA: '#059669',
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{receptor.nombre}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{receptor.nombre?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <View style={styles.profileNameRow}>
                <Text style={styles.profileName}>{receptor.nombre}</Text>
                <View style={[styles.prioridadBadge, { backgroundColor: PRIORIDAD_COLORS[receptor.prioridad] }]}>
                  <Text style={styles.prioridadText}>{receptor.prioridad}</Text>
                </View>
              </View>
              <Text style={styles.profileDocument}>{receptor.documento}</Text>
              <Text style={styles.profilePhone}>{receptor.telefono}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Medicamentos de Uso</Text>
          <View style={styles.medicamentosList}>
            {receptor.medicamentos?.map((med: string, index: number) => (
              <View key={index} style={styles.medicamentoItem}>
                <MaterialCommunityIcons name="pill" size={20} color="#2563eb" />
                <Text style={styles.medicamentoText}>{med}</Text>
              </View>
            ))}
          </View>
        </View>

        {receptor.notas && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notas</Text>
            <Text style={styles.notasText}>{receptor.notas}</Text>
          </View>
        )}

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="create-outline" size={20} color="#2563eb" />
            <Text style={styles.actionButtonText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#dc2626' }]}>
            <Ionicons name="trash-outline" size={20} color="white" />
            <Text style={styles.actionButtonText}>Eliminar</Text>
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
  profileHeader: { padding: 20 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 24, fontWeight: '700', color: 'white' },
  profileInfo: { flex: 1 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  profileName: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  prioridadBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  prioridadText: { fontSize: 11, fontWeight: '700', color: 'white' },
  profileDocument: { fontSize: 14, color: '#64748b', marginTop: 2 },
  profilePhone: { fontSize: 14, color: '#64748b' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  medicamentosList: { padding: 20 },
  medicamentoItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  medicamentoText: { fontSize: 14, color: '#1e293b' },
  notasText: { fontSize: 14, color: '#334155', padding: 20, lineHeight: 22 },
  actionsContainer: { padding: 16, gap: 12 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f5f9' },
  actionButtonText: { fontSize: 14, fontWeight: '600', color: '#2563eb' },
});
