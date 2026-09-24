import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../hooks';
import { useNotificationStore } from '../../store/notificationStore';

export default function NotificationsScreen() {
  const { usuario } = useAuth();
  const { notificaciones, unreadNotificaciones, setNotificaciones, markNotificacionAsRead, markAllNotificacionesAsRead } = useNotificationStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      // Mock data
      const mockNotifs = [
        { id: 1, tipo: 'SYSTEM', titulo: 'Bienvenido a Farmacia Control', mensaje: 'Su cuenta ha sido configurada correctamente', leida: 1, fecha: '2024-09-23 08:00', datos_json: null },
        { id: 2, tipo: 'PUSH', titulo: 'Stock Bajo', mensaje: 'Paracetamol 500mg tiene solo 50 unidades', leida: 0, fecha: '2024-09-23 10:30', datos_json: '{"medicamento":"Paracetamol","cantidad":50}' },
        { id: 3, tipo: 'LOCAL', titulo: 'Próximo a Vencer', mensaje: 'Ibuprofeno 400mg (Lote LTE-005) vence en 15 días', leida: 0, fecha: '2024-09-23 09:15', datos_json: '{"lote":"LTE-005","dias":15}' },
        { id: 4, tipo: 'SYSTEM', titulo: 'Solicitud Procesada', mensaje: 'Su solicitud de baja fue APROBADA', leida: 1, fecha: '2024-09-22 16:45', datos_json: '{"solicitud_id":5}' },
      ];
      setNotificaciones(mockNotifs);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las notificaciones');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handlePress = (notif: any) => {
    if (!notif.leida) {
      markNotificacionAsRead(notif.id);
    }
    // Navigate based on notification type
    Alert.alert(notif.titulo, notif.mensaje);
  };

  const handleMarkAllRead = () => {
    if (unreadNotificaciones > 0) {
      Alert.alert('Marcar todas como leídas', `¿Marcar ${unreadNotificaciones} notificaciones como leídas?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Marcar', onPress: markAllNotificacionesAsRead },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { /* navigation handled by drawer */ }}>
          <Ionicons name="chevron-back-outline" size={28} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificaciones</Text>
        {unreadNotificaciones > 0 && (
          <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllRead}>
            <Text style={styles.markAllButtonText}>Marcar todas</Text>
          </TouchableOpacity>
        )}
      </View>

      {unreadNotificaciones > 0 && (
        <View style={styles.unreadBanner}>
          <MaterialCommunityIcons name="bell-outline" size={20} color="#2563eb" />
          <Text style={styles.unreadText}>Tienes {unreadNotificaciones} notificación{unreadNotificaciones > 1 ? 'es' : ''} sin leer</Text>
        </View>
      )}

      <FlatList
        data={notificaciones}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.itemCard, !item.leida && styles.itemCardUnread]} onPress={() => handlePress(item)}>
            <View style={styles.itemHeader}>
              <View style={[styles.tipoBadge, { backgroundColor: item.tipo === 'PUSH' ? '#2563eb' : item.tipo === 'LOCAL' ? '#ea580c' : '#059669' }]}>
                <Text style={styles.tipoText}>{item.tipo}</Text>
              </View>
              <Text style={[styles.itemTime, !item.leida && styles.itemTimeUnread]}>{item.fecha}</Text>
            </View>
            <Text style={[styles.itemTitle, !item.leida && styles.itemTitleUnread]}>{item.titulo}</Text>
            <Text style={styles.itemMessage}>{item.mensaje}</Text>
            {!item.leida && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No hay notificaciones</Text></View>}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1e293b' },
  markAllButton: { paddingHorizontal: 12, paddingVertical: 6 },
  markAllButtonText: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
  unreadBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#dbeafe', padding: 12, marginHorizontal: 16, marginBottom: 12, borderRadius: 8 },
  unreadText: { fontSize: 13, color: '#1e40af' },
  itemCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  itemCardUnread: { borderLeftWidth: 4, borderLeftColor: '#2563eb' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tipoBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  tipoText: { fontSize: 10, fontWeight: '700', color: 'white' },
  itemTime: { fontSize: 12, color: '#94a3b8' },
  itemTimeUnread: { fontWeight: '600', color: '#2563eb' },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 4 },
  itemTitleUnread: { fontWeight: '700' },
  itemMessage: { fontSize: 13, color: '#64748b' },
  unreadDot: { position: 'absolute', top: 16, right: 16, width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  listContent: { paddingBottom: 24 },
});


