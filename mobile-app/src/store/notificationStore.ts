import { create } from 'zustand';
import { Notificacion, Mensaje } from '../types/domain';

interface NotificationStore {
  notificaciones: Notificacion[];
  mensajes: Mensaje[];
  unreadNotificaciones: number;
  unreadMensajes: number;
  
  setNotificaciones: (notificaciones: Notificacion[]) => void;
  addNotificacion: (notificacion: Notificacion) => void;
  markNotificacionAsRead: (id: number) => void;
  markAllNotificacionesAsRead: () => void;
  
  setMensajes: (mensajes: Mensaje[]) => void;
  addMensaje: (mensaje: Mensaje) => void;
  markMensajeAsRead: (id: number) => void;
  markAllMensajesAsRead: () => void;
  
  refreshCounts: () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notificaciones: [],
  mensajes: [],
  unreadNotificaciones: 0,
  unreadMensajes: 0,

  setNotificaciones: (notificaciones) => {
    const unread = notificaciones.filter(n => !n.leida).length;
    set({ notificaciones, unreadNotificaciones: unread });
  },

  addNotificacion: (notificacion) => set((state) => ({
    notificaciones: [notificacion, ...state.notificaciones],
    unreadNotificaciones: notificacion.leida ? state.unreadNotificaciones : state.unreadNotificaciones + 1,
  })),

  markNotificacionAsRead: (id) => set((state) => ({
    notificaciones: state.notificaciones.map(n => 
      n.id === id ? { ...n, leida: 1 } : n
    ),
    unreadNotificaciones: Math.max(0, state.unreadNotificaciones - 1),
  })),

  markAllNotificacionesAsRead: () => set((state) => ({
    notificaciones: state.notificaciones.map(n => ({ ...n, leida: 1 })),
    unreadNotificaciones: 0,
  })),

  setMensajes: (mensajes) => {
    const unread = mensajes.filter(m => !m.leido).length;
    set({ mensajes, unreadMensajes: unread });
  },

  addMensaje: (mensaje) => set((state) => ({
    mensajes: [mensaje, ...state.mensajes],
    unreadMensajes: mensaje.leido ? state.unreadMensajes : state.unreadMensajes + 1,
  })),

  markMensajeAsRead: (id) => set((state) => ({
    mensajes: state.mensajes.map(m => 
      m.id === id ? { ...m, leido: 1 } : m
    ),
    unreadMensajes: Math.max(0, state.unreadMensajes - 1),
  })),

  markAllMensajesAsRead: () => set((state) => ({
    mensajes: state.mensajes.map(m => ({ ...m, leido: 1 })),
    unreadMensajes: 0,
  })),

  refreshCounts: () => set((state) => ({
    unreadNotificaciones: state.notificaciones.filter(n => !n.leida).length,
    unreadMensajes: state.mensajes.filter(m => !m.leido).length,
  })),
}));