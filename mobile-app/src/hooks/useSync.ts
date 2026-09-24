import { useState, useEffect, useCallback } from 'react';
import { syncEngine } from '../services';
import { SyncEngineState, SyncOptions } from '../types/sync';

export function useSync() {
  const [state, setState] = useState<SyncEngineState>({
    status: 'IDLE',
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    conflictCount: 0,
  });

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(setState);
    syncEngine.getState().then(setState);
    return unsubscribe;
  }, []);

  const sync = useCallback(async (options?: SyncOptions) => {
    return syncEngine.sync(options);
  }, []);

  const push = useCallback(async () => {
    return syncEngine.sync({ direction: 'PUSH' });
  }, []);

  const pull = useCallback(async () => {
    return syncEngine.sync({ direction: 'PULL' });
  }, []);

  const getConflicts = useCallback(async () => {
    return syncEngine.getConflicts();
  }, []);

  const resolveConflict = useCallback(async (
    conflictId: number, 
    resolution: 'SERVER_WINS' | 'LOCAL_WINS' | 'MANUAL_MERGE',
    mergedData?: any
  ) => {
    return syncEngine.resolveConflict(conflictId, resolution, mergedData);
  }, []);

  return {
    ...state,
    sync,
    push,
    pull,
    getConflicts,
    resolveConflict,
    isSyncing: state.status === 'SYNCING',
    isOnline: state.status !== 'OFFLINE',
  };
}

export function useSyncStatus() {
  const [status, setStatus] = useState<'ONLINE' | 'OFFLINE' | 'SYNCING' | 'ERROR'>('ONLINE');

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((state) => {
      setStatus(state.status === 'SYNCING' ? 'SYNCING' : 
                state.status === 'ERROR' ? 'ERROR' : 
                state.status === 'IDLE' ? 'ONLINE' : 'OFFLINE');
    });
    return unsubscribe;
  }, []);

  return status;
}
