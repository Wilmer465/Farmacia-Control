import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { scannerService } from '../../services';
import { useAuth } from '../../hooks';

interface RouteParams {
  onScan?: (data: any) => void;
}

export default function ScannerScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const { usuario } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const granted = await scannerService.requestPermissions();
    setHasPermission(granted);
  };

  const handleBarCodeScanned = async ({ data, type }: { data: string; type: string }) => {
    if (scanned) return;
    
    setScanned(true);
    setProcessing(true);
    
    try {
      const scanResult = await scannerService.processBarcode(data);
      setResult(scanResult);
      
      if (route.params?.onScan) {
        route.params.onScan(scanResult);
        navigation.goBack();
      } else {
        // Navigate to appropriate screen based on result
        if (scanResult.existsInLocal && scanResult.medicamento) {
          navigation.navigate('LoteDetail', { lote: { ...scanResult.medicamento, id: scanResult.medicamento.id } });
        } else {
          Alert.alert(
            'Resultado del Escaneo',
            scanResult.existsInRemote 
              ? `Medicamento encontrado en catálogo: ${scanResult.medicamento?.producto || scanResult.medicamento?.nombre}`
              : 'Medicamento no encontrado',
            [
              { text: 'Escanear otro', onPress: resetScanner },
              { text: 'OK', onPress: () => navigation.goBack() }
            ]
          );
        }
      }
    } catch (error) {
      console.error('Scan error:', error);
      Alert.alert('Error', 'No se pudo procesar el código');
      resetScanner();
    } finally {
      setProcessing(false);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setResult(null);
  };

  if (hasPermission === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Solicitando permisos de cámara...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.noPermissionContainer}>
        <MaterialCommunityIcons name="camera-off-outline" size={64} color="#94a3b8" />
        <Text style={styles.noPermissionTitle}>Permiso de cámara requerido</Text>
        <Text style={styles.noPermissionText}>
          Para escanear códigos de barras, necesita otorgar permiso de cámara
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={requestPermissions}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back-outline" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Escanear Código</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.scannerContainer}>
        <BarCodeScanner
          onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
          barCodeTypes={scannerService.getSupportedFormats() as any}
          {...({ torch: torchEnabled ? 'on' : 'off' } as any)}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.scanOverlay}>
          <View style={styles.scanFrame}>
            <View style={styles.corner} />
            <View style={styles.corner} />
            <View style={styles.corner} />
            <View style={styles.corner} />
          </View>
          
          {processing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="white" />
              <Text style={styles.processingText}>Procesando...</Text>
            </View>
          )}
          
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>Apunte la cámara al código de barras</Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.flashButton} onPress={() => setTorchEnabled(!torchEnabled)}>
          <MaterialCommunityIcons name="flash" size={28} color="white" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetButton} onPress={resetScanner} disabled={!scanned}>
          <Ionicons name="refresh-outline" size={28} color={scanned ? 'white' : '#64748b'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.galleryButton} onPress={() => Alert.alert('Galería', 'Funcionalidad en desarrollo')}>
          <Ionicons name="image-outline" size={28} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  loadingText: { marginTop: 12, color: '#64748b' },
  noPermissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f1f5f9' },
  noPermissionTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginTop: 16, marginBottom: 8 },
  noPermissionText: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24 },
  retryButton: { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'rgba(0,0,0,0.7)' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: 'white' },
  scannerContainer: { flex: 1 },
  scanOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 280, height: 180, borderWidth: 2, borderColor: '#2563eb', borderRadius: 12, overflow: 'hidden' },
  corner: { position: 'absolute', width: 20, height: 20, borderWidth: 4, borderColor: '#2563eb' },
  processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  processingText: { color: 'white', marginTop: 12, fontSize: 16 },
  hintContainer: { position: 'absolute', bottom: 120, paddingHorizontal: 24 },
  hintText: { color: 'white', fontSize: 14, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  bottomControls: { flexDirection: 'row', justifyContent: 'space-around', padding: 24, backgroundColor: 'rgba(0,0,0,0.7)' },
  flashButton: { padding: 16 },
  resetButton: { padding: 16 },
  galleryButton: { padding: 16 },
});

