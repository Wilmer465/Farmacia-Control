import React, { useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../../hooks';
import { useUIStore } from '../../store/uiStore';

export default function LoginScreen() {
  const { login, cargando } = useAuth();
  const { addToast } = useUIStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      addToast({ type: 'error', message: 'Usuario y contraseña son obligatorios' });
      return;
    }

    const success = await login({ username: username.trim(), password });
    if (success) {
      addToast({ type: 'success', message: 'Bienvenido a Farmacia Control' });
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 36, color: 'white' }}>💊</Text>
          </View>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#1e293b', marginBottom: 4 }}>Farmacia Control</Text>
          <Text style={{ fontSize: 16, color: '#64748b' }}>Gestión & Trazabilidad</Text>
        </View>

        <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: '#1e293b', marginBottom: 24, textAlign: 'center' }}>Iniciar Sesión</Text>

          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Usuario</Text>
            <TextInput
              style={{ 
                borderWidth: 1, 
                borderColor: '#cbd5e1', 
                borderRadius: 8, 
                padding: 14, 
                fontSize: 16,
                backgroundColor: '#f8fafc',
                color: '#1e293b',
              }}
              placeholder="Ingrese su usuario"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoComplete="username"
              textContentType="username"
            />
          </View>

          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Contraseña</Text>
            <TextInput
              style={{ 
                borderWidth: 1, 
                borderColor: '#cbd5e1', 
                borderRadius: 8, 
                padding: 14, 
                fontSize: 16,
                backgroundColor: '#f8fafc',
                color: '#1e293b',
              }}
              placeholder="Ingrese su contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
            />
          </View>

           <TouchableOpacity
             style={{
               width: '100%',
               paddingVertical: 14,
               borderRadius: 12,
               backgroundColor: cargando ? '#93c5fd' : '#2563eb',
               alignItems: 'center',
             }}
             onPress={handleLogin}
             disabled={cargando}
           >
             <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>
               {cargando ? 'Iniciando sesión...' : 'Iniciar Sesión'}
             </Text>
           </TouchableOpacity>

          {cargando && (
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              <ActivityIndicator size="large" color="#2563eb" />
            </View>
          )}
        </View>

        <View style={{ marginTop: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>Versión 1.0.0</Text>
          <Text style={{ fontSize: 12, color: '#94a3b8' }}>Modo Offline-First</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


