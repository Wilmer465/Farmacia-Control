import { create } from 'zustand';
import { SyncEngineState } from '../types/sync';

interface SyncStore extends SyncEngineState {
  setState: (state: Partial<SyncEngineState>) => void;
  updateProgress: (progress: SyncEngineState['progress']) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'IDLE',
  lastSync: undefined,
  nextSync: undefined,
  pendingCount: 0,
  syncingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  error: undefined,
  progress: undefined,

  setState: (partial) => set((state) => ({ ...state, ...partial })),
  
  updateProgress: (progress) => set((state) => ({ ...state, progress })),
}));