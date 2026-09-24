import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks';
import { useNavigation } from '@react-navigation/native';

export default function CreateOrderScreen() {
  const { usuario } = useAuth();
  const navigation = useNavigation();
  const [numeroOrden, setNumeroOrden] = useState('');
  const [receptorNombre, setReceptorNombre] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateOrder = async () => {
    if (!numeroOrden || !receptorNombre) {
      Alert.alert('Validación', 'Por favor complete los campos obligatorios');
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement order creation via API
      Alert.alert('Éxito', 'Orden creada correctamente', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'No se pudo crear la orden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva Orden</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Número de Orden *</Text>
          <TextInput
            style={styles.input}
            value={numeroOrden}
            onChangeText={setNumeroOrden}
            placeholder="Ingrese el número de orden"
            autoComplete="off"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Receptor *</Text>
          <TextInput
            style={styles.input}
            value={receptorNombre}
            onChangeText={setReceptorNombre}
            placeholder="Nombre del receptor"
            autoComplete="name"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Notas</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            value={notas}
            onChangeText={setNotas}
            placeholder="Observaciones adicionales"
            multiline
            autoComplete="off"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleCreateOrder}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Creando...' : 'Crear Orden'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1e3a8a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: 'white' },
  content: { flex: 1, backgroundColor: '#f1f5f9', padding: 24 },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: 'white',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: { backgroundColor: '#93c5fb' },
  submitButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
