import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface RouteParams {
  orden: any;
}

export default function EntregaScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const { orden } = route.params;
  const [receptorNombre, setReceptorNombre] = useState('');
  const [receptorDocumento, setReceptorDocumento] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  const [huella, setHuella] = useState(false);

  const handleEntregar = () => {
    if (!receptorNombre.trim() || !receptorDocumento.trim()) {
      Alert.alert('Error', 'Nombre y documento del receptor son obligatorios');
      return;
    }

    Alert.alert(
      'Confirmar Entrega',
      `¿Confirmar entrega a ${receptorNombre} (${receptorDocumento})?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar', 
          onPress: () => {
            Alert.alert('Éxito', 'Entrega registrada correctamente');
            navigation.goBack();
          }
        }
      ]
    );
  };

  const captureSignature = () => {
    Alert.alert('Firma', 'Funcionalidad de captura de firma en desarrollo');
  };

  const captureFingerprint = () => {
    Alert.alert('Huella', 'Funcionalidad de captura de huella en desarrollo');
    setHuella(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Registrar Entrega</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Orden: {orden.numero}</Text>
          <Text style={styles.orderInfo}>{orden.receptor_nombre} • {orden.total_items} items</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos del Receptor</Text>
          
          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Nombre Completo *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Nombre del receptor"
              value={receptorNombre}
              onChangeText={setReceptorNombre}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Documento *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Número de documento"
              value={receptorDocumento}
              onChangeText={setReceptorDocumento}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Firma</Text>
            <TouchableOpacity style={[styles.captureButton, { backgroundColor: firma ? '#059669' : '#2563eb' }]} onPress={captureSignature}>
              <MaterialCommunityIcons name={firma ? 'check-circle-outline' : 'signature'} size={20} color="white" />
              <Text style={styles.captureButtonText}>{firma ? 'Firma capturada' : 'Capturar Firma'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Huella Dactilar</Text>
            <TouchableOpacity style={[styles.captureButton, { backgroundColor: huella ? '#059669' : '#ea580c' }]} onPress={captureFingerprint}>
              <MaterialCommunityIcons name={huella ? 'check-circle-outline' : 'fingerprint'} size={20} color="white" />
              <Text style={styles.captureButtonText}>{huella ? 'Huella capturada' : 'Capturar Huella'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleEntregar}>
          <MaterialCommunityIcons name="package-variant-closed-check" size={20} color="white" />
          <Text style={styles.submitButtonText}>Confirmar Entrega</Text>
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
  formField: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  fieldInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 16, color: '#1e293b' },
  captureButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  captureButtonText: { fontSize: 14, fontWeight: '600', color: 'white' },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: '#059669', marginTop: 16 },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: 'white' },
});
