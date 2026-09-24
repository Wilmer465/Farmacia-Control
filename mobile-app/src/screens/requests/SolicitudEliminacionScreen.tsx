import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface RouteParams {
  lote?: any;
}

export default function SolicitudEliminacionScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const { lote } = route.params;
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!motivo.trim()) {
      Alert.alert('Error', 'El motivo es obligatorio');
      return;
    }
    if (motivo.trim().length < 10) {
      Alert.alert('Error', 'El motivo debe tener al menos 10 caracteres');
      return;
    }

    setSubmitting(true);
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      Alert.alert('Éxito', 'Solicitud de baja enviada al Superadmin');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'No se pudo enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Solicitar Baja de Lote</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.loteInfo}>
            <Text style={styles.loteLabel}>Lote a dar de baja</Text>
            <Text style={styles.loteNumber}>{lote?.numero_lote || 'Seleccionar lote'}</Text>
            <Text style={styles.loteMedicamento}>{lote?.medicamento_nombre || 'Medicamento'}</Text>
            <Text style={styles.loteStock}>Stock: {lote?.cantidad_total_unidades || 0} unidades</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Motivo de la Baja</Text>
          
          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Descripción detallada *</Text>
            <TextInput
              style={styles.fieldInputMultiline}
              placeholder="Ej: Lote vencido / Frascos deteriorados en transporte / Retiro por alerta sanitaria..."
              value={motivo}
              onChangeText={setMotivo}
              multiline
              numberOfLines={5}
              autoCapitalize="sentences"
            />
            <Text style={styles.charCount}>{motivo.length}/500</Text>
          </View>

          <View style={styles.warningBox}>
            <MaterialCommunityIcons name="alert-outline" size={20} color="#ea580c" />
            <Text style={styles.warningText}>
              Esta solicitud será revisada por el Superadmin. No se elimina ningún registro directamente.
              La solicitud quedará registrada en la bitácora inmutable.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
          <MaterialCommunityIcons name={submitting ? 'loading' : 'send-outline'} size={20} color="white" style={{ marginRight: 8 }} />
          <Text style={styles.submitButtonText}>{submitting ? 'Enviando...' : 'Enviar Solicitud'}</Text>
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
  loteInfo: { padding: 20, backgroundColor: '#fef3c7', borderRadius: 12, margin: 16 },
  loteLabel: { fontSize: 12, color: '#92400e', marginBottom: 4 },
  loteNumber: { fontSize: 18, fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' },
  loteMedicamento: { fontSize: 14, color: '#334155', marginTop: 2 },
  loteStock: { fontSize: 13, color: '#64748b', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  formField: { padding: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  fieldInputMultiline: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 16, color: '#1e293b', textAlignVertical: 'top', minHeight: 120 },
  charCount: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 4 },
  warningBox: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, marginTop: 12 },
  warningText: { flex: 1, fontSize: 12, color: '#991b1b', lineHeight: 18 },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: '#dc2626', marginTop: 16 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: 'white' },
});
