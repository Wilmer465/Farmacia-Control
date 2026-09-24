import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNotificationStore } from '../../store/notificationStore';

export default function MessagesScreen() {
  const { mensajes, unreadMensajes, setMensajes, markMensajeAsRead, markAllMensajesAsRead } = useNotificationStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      // Mock data
      const mockMsgs = [
        { id: 1, asunto: 'Solicitud de baja aprobada', contenido: 'Su solicitud de baja para el lote LTE-001 ha sido aprobada por el Superadmin.', leido: 0, fecha: '2024-09-23 08:00', solicitud_relacionada_id: 1 },
        { id: 2, asunto: 'Nueva orden asignada', contenido: 'Se le ha asignado la orden ORD2409150003 para despacho.', leido: 1, fecha: '2024-09-22 14:30', solicitud_relacionada_id: 3 },
        { id: 3, asunto: 'Recordatorio de vencimiento', contenido: 'El lote LTE-005 de Amoxicilina vence en 30 días. Programe su uso.', leido: 0, fecha: '2024-09-21 09:00', solicitud_relacionada_id: null },
        { id: 4, asunto: 'Actualización de catálogo CUM', contenido: 'Se ha actualizado el catálogo CUM con 1,245 nuevos registros.', leido: 1, fecha: '2024-09-20 12:00', solicitud_relacionada_id: null },
      ];
      setMensajes(mockMsgs);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar los mensajes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handlePress = (msg: any) => {
    if (!msg.leido) {
      markMensajeAsRead(msg.id);
    }
    Alert.alert(msg.asunto, msg.contenido);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mensajes</Text>
        {unreadMensajes > 0 && (
          <TouchableOpacity onPress={() => markAllMensajesAsRead()}>
            <Text style={styles.markAllButtonText}>Marcar todas</Text>
          </TouchableOpacity>
        )}
      </View>

      {unreadMensajes > 0 && (
        <View style={styles.unreadBanner}>
          <MaterialCommunityIcons name="email-outline" size={20} color="#7c3aed" />
          <Text style={styles.unreadText}>Tienes {unreadMensajes} mensaje{unreadMensajes > 1 ? 's' : ''} sin leer</Text>
        </View>
      )}

      <FlatList
        data={mensajes}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.itemCard, !item.leido && styles.itemCardUnread]} onPress={() => handlePress(item)}>
            <View style={styles.itemHeader}>
              <Text style={[styles.itemSubject, !item.leido && styles.itemSubjectUnread]}>{item.asunto}</Text>
              <Text style={[styles.itemTime, !item.leido && styles.itemTimeUnread]}>{item.fecha}</Text>
            </View>
            <Text style={styles.itemPreview}>{item.contenido}</Text>
            {!item.leido && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        )}
        keyExtractor={item => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>No hay mensajes</Text></View>}
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
  markAllButtonText: { fontSize: 13, fontWeight: '600', color: '#7c3aed' },
  unreadBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ede9fe', padding: 12, marginHorizontal: 16, marginBottom: 12, borderRadius: 8 },
  unreadText: { fontSize: 13, color: '#6d28d9' },
  itemCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  itemCardUnread: { borderLeftWidth: 4, borderLeftColor: '#7c3aed' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemSubject: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  itemSubjectUnread: { fontWeight: '700' },
  itemTime: { fontSize: 12, color: '#94a3b8' },
  itemTimeUnread: { fontWeight: '600', color: '#7c3aed' },
  itemPreview: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 20 },
  unreadDot: { position: 'absolute', top: 16, right: 16, width: 10, height: 10, borderRadius: 5, backgroundColor: '#7c3aed' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
});

