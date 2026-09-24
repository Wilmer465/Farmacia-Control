import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Picker } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export default function SolicitudIntercambioScreen() {
  const navigation = useNavigation();
  const [tipo, setTipo] = useState<'ENVIO' | 'INTERCAMBIO'>('ENVIO');
  const [sedeDestino, setSedeDestino] = useState('');
  const [medicamento, setMedicamento] = useState('');
  const [cantidadCajas, setCantidadCajas] = useState('');
  const [cantidadUnidades, setCantidadUnidades] = useState('');
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sedes = [
    { id: 1, nombre: 'Sede Principal - Bogotá' },
    { id: 2, nombre: 'Sede Quibdó' },
    { id: 3, nombre: 'Sede Medellín' },
  ];

  const handleSubmit = async () => {
    if (!sedeDestino) { Alert.alert('Error', 'Seleccione sede destino'); return; }
    if (!medicamento) { Alert.alert('Error', 'Seleccione medicamento'); return; }
    const cajas = parseInt(cantidadCajas) || 0;
    const unidades = parseInt(cantidadUnidades) || 0;
    if (cajas === 0 && unidades === 0) { Alert.alert('Error', 'Ingrese cantidad'); return; }
    if (!motivo.trim() || motivo.length < 10) { Alert.alert('Error', 'Motivo mínimo 10 caracteres'); return; }

    setSubmitting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      Alert.alert('Éxito', 'Solicitud de intercambio enviada');
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
        <Text style={styles.headerTitle}>Nueva Solicitud de Intercambio</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tipo de Solicitud</Text>
          <View style={styles.typeSelector}>
            <TouchableOpacity style={[styles.typeButton, tipo === 'ENVIO' && styles.typeButtonActive]} onPress={() => setTipo('ENVIO')}>
              <MaterialCommunityIcons name="send-outline" size={24} color={tipo === 'ENVIO' ? 'white' : '#64748b'} />
              <Text style={[styles.typeButtonText, tipo === 'ENVIO' && styles.typeButtonTextActive]}>Envío</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeButton, tipo === 'INTERCAMBIO' && styles.typeButtonActive]} onPress={() => setTipo('INTERCAMBIO')}>
              <MaterialCommunityIcons name="swap-horizontal" size={24} color={tipo === 'INTERCAMBIO' ? 'white' : '#64748b'} />
              <Text style={[styles.typeButtonText, tipo === 'INTERCAMBIO' && styles.typeButtonTextActive]}>Intercambio</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sede Destino</Text>
          <Picker
            selectedValue={sedeDestino}
            onValueChange={setSedeDestino}
            style={styles.picker}
            itemStyle={styles.pickerItem}
            dropdownIconColor="#2563eb"
          >
            <Picker.Item label="Seleccionar sede..." value="" />
            {sedes.map(s => (
              <Picker.Item key={s.id} label={s.nombre} value={s.id.toString()} />
            ))}
          </Picker>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Medicamento</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Buscar medicamento..."
            value={medicamento}
            onChangeText={setMedicamento}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cantidad</Text>
          <View style={styles.quantityRow}>
            <View style={styles.quantityField}>
              <Text style={styles.quantityLabel}>Cajas</Text>
              <TextInput
                style={styles.quantityInput}
                placeholder="0"
                value={cantidadCajas}
                onChangeText={setCantidadCajas}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.quantityField}>
              <Text style={styles.quantityLabel}>Unidades</Text>
              <TextInput
                style={styles.quantityInput}
                placeholder="0"
                value={cantidadUnidades}
                onChangeText={setCantidadUnidades}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Motivo</Text>
          <TextInput
            style={styles.fieldInputMultiline}
            placeholder="Explique el motivo del intercambio..."
            value={motivo}
            onChangeText={setMotivo}
            multiline
            numberOfLines={4}
            autoCapitalize="sentences"
          />
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  typeSelector: { padding: 20, flexDirection: 'row', gap: 12 },
  typeButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  typeButtonActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  typeButtonText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  typeButtonTextActive: { color: 'white' },
  fieldInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 16, color: '#1e293b', marginTop: 8 },
  fieldInputMultiline: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 16, color: '#1e293b', textAlignVertical: 'top', minHeight: 100, marginTop: 8 },
  quantityRow: { flexDirection: 'row', gap: 12, padding: 20 },
  quantityField: { flex: 1 },
  quantityLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 4 },
  quantityInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 16, color: '#1e293b', textAlign: 'center' },
  picker: { height: 50, marginTop: 8 },
  pickerItem: { fontSize: 16 },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: '#2563eb', marginTop: 16 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: 'white' },
});
