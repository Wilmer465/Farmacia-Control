import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../../hooks';

export default function PinSetupScreen() {
  const { logout } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'create' | 'confirm'>('create');

  const handleSubmit = () => {
    if (step === 'create') {
      if (pin.length !== 6) {
        Alert.alert('Error', 'El PIN debe tener 6 dígitos');
        return;
      }
      setStep('confirm');
      setPin('');
    } else {
      if (pin !== confirmPin) {
        Alert.alert('Error', 'Los PINs no coinciden');
        setPin('');
        setConfirmPin('');
        return;
      }
      Alert.alert('Éxito', 'PIN configurado correctamente');
      // Save PIN to secure storage
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: '#1e293b', marginBottom: 8 }}>
            {step === 'create' ? 'Crear PIN de 6 dígitos' : 'Confirmar PIN'}
          </Text>
          <Text style={{ fontSize: 16, color: '#64748b', textAlign: 'center' }}>
            {step === 'create' 
              ? 'Este PIN se usará para acceso rápido' 
              : 'Vuelva a ingresar el mismo PIN'}
          </Text>
        </View>

        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={{
                  width: 48,
                  height: 48,
                  borderWidth: 2,
                  borderColor: (step === 'create' ? pin : confirmPin).length > i ? '#2563eb' : '#cbd5e1',
                  borderRadius: 12,
                  backgroundColor: (step === 'create' ? pin : confirmPin).length > i ? '#dbeafe' : 'transparent',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {(step === 'create' ? pin : confirmPin).length > i && (
                  <Text style={{ fontSize: 24, fontWeight: '700', color: '#2563eb' }}>●</Text>
                )}
              </View>
            ))}
          </View>

          <TextInput
            style={{ position: 'absolute', left: -1000 }}
            autoFocus
            keyboardType="numeric"
            maxLength={6}
            secureTextEntry
            onChangeText={step === 'create' ? setPin : setConfirmPin}
            value={step === 'create' ? pin : confirmPin}
            blurOnSubmit={false}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
              <Button
                key={num}
                title={num.toString()}
                onPress={() => {
                  const current = step === 'create' ? pin : confirmPin;
                  if (current.length < 6) {
                    if (step === 'create') setPin(current + num);
                    else setConfirmPin(current + num);
                  }
                }}
                color="#2563eb"
                accessibilityLabel={num.toString()}
              />
            ))}
            <Button
              title="⌫"
              onPress={() => {
                const current = step === 'create' ? pin : confirmPin;
                if (step === 'create') setPin(current.slice(0, -1));
                else setConfirmPin(current.slice(0, -1));
              }}
              color="#dc2626"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

