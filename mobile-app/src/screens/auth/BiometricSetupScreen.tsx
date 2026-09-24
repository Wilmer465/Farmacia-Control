import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '../../hooks';

export default function BiometricSetupScreen() {
  const { logout } = useAuth();
  const [available, setAvailable] = React.useState(false);
  const [enrolled, setEnrolled] = React.useState(false);

  React.useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    setAvailable(hasHardware);
    setEnrolled(isEnrolled);
    
    console.log('Biometrics:', { hasHardware, isEnrolled, supportedTypes });
  };

  const enableBiometrics = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Autentíquese para habilitar biometría',
      fallbackLabel: 'Usar PIN',
      cancelLabel: 'Cancelar',
    });

    if (result.success) {
      Alert.alert('Éxito', 'Biometría habilitada correctamente');
      // Save preference to secure storage
    } else {
      Alert.alert('Error', 'No se pudo habilitar la biometría');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9', padding: 24, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', marginBottom: 48 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: '#1e293b', marginBottom: 8 }}>
          Autenticación Biométrica
        </Text>
        <Text style={{ fontSize: 16, color: '#64748b', textAlign: 'center' }}>
          Acceso rápido y seguro con huella dactilar o Face ID
        </Text>
      </View>

      <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: available ? '#d1fae5' : '#fee2e2', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 36 }}>{available ? '🔐' : '🔓'}</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#1e293b', marginTop: 16, marginBottom: 8 }}>
            {available ? 'Biometría disponible' : 'Biometría no disponible'}
          </Text>
          <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>
            {available 
              ? enrolled 
                ? 'Su dispositivo tiene biometría configurada' 
                : 'Configure biometría en ajustes del sistema'
              : 'Su dispositivo no soporta autenticación biométrica'}
          </Text>
        </View>

        {available && enrolled && (
          <TouchableOpacity
            style={{ width: '100%', backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
            onPress={enableBiometrics}
          >
            <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>Habilitar acceso biométrico</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{ width: '100%', backgroundColor: '#64748b', marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
          onPress={() => Alert.alert('Configuración', 'Puede habilitar biometría más tarde en ajustes')}
        >
          <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>Omitir por ahora</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

