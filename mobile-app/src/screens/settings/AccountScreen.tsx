import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView } from 'react-native';
import { useAuth } from '../../hooks';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function AccountScreen() {
  const { usuario } = useAuth();
  const navigation = useNavigation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Todos los campos son obligatorios');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setChanging(true);
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      Alert.alert('Éxito', 'Contraseña cambiada correctamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert('Error', 'No se pudo cambiar la contraseña');
    } finally {
      setChanging(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mi Cuenta</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{usuario?.nombre?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{usuario?.nombre}</Text>
              <Text style={styles.profileEmail}>{usuario?.username}</Text>
              <Text style={styles.profileRole}>{usuario?.rol_nombre} • {usuario?.sede_nombre || 'Todas las sedes'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cambiar Contraseña</Text>
          
          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Contraseña Actual *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Ingrese contraseña actual"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              autoComplete="current-password"
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Nueva Contraseña *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.fieldLabel}>Confirmar Nueva Contraseña *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Repita la nueva contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          <TouchableOpacity style={[styles.submitButton, changing && styles.submitButtonDisabled]} onPress={handleChangePassword} disabled={changing}>
            <MaterialCommunityIcons name={changing ? 'loading' : 'key-change'} size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={styles.submitButtonText}>{changing ? 'Cambiando...' : 'Cambiar Contraseña'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Información de la Cuenta</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Rol</Text>
            <Text style={styles.infoValue}>{usuario?.rol_nombre}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sede</Text>
            <Text style={styles.infoValue}>{usuario?.sede_nombre || 'Todas las sedes'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Usuario</Text>
            <Text style={styles.infoValue}>{usuario?.username}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Estado</Text>
            <Text style={styles.infoValue}>{usuario?.estado || 'ACTIVO'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          
          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('Idioma', 'Funcionalidad en desarrollo')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Idioma</Text>
              <Text style={styles.settingDescription}>Español (Colombia)</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} onPress={() => Alert.alert('Tema', 'Funcionalidad en desarrollo')}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Tema</Text>
              <Text style={styles.settingDescription}>Claro (por defecto del sistema)</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={20} color="#94a3b8" />
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
  profileSection: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 22, fontWeight: '700', color: 'white' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  profileEmail: { fontSize: 13, color: '#64748b' },
  profileRole: { fontSize: 13, color: '#64748b' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  formField: { padding: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 8 },
  fieldInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 16, color: '#1e293b' },
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, backgroundColor: '#2563eb', marginTop: 16 },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { fontSize: 15, fontWeight: '600', color: 'white' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  infoLabel: { fontSize: 14, color: '#64748b' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
});

