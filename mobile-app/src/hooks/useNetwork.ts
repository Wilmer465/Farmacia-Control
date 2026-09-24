import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';

export type NetworkState = 'connected' | 'disconnected' | 'unknown';

interface NetworkInfo {
  isConnected: boolean;
  type: NetworkState;
  isInternetReachable: boolean | null;
}

export function useNetwork(): NetworkInfo & { refresh: () => Promise<void> } {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({
    isConnected: true,
    type: 'unknown',
    isInternetReachable: null,
  });

  const checkNetwork = useCallback(async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      setNetworkInfo({
        isConnected: networkState.isConnected ?? false,
        type: networkState.type as NetworkState,
        isInternetReachable: networkState.isInternetReachable ?? null,
      });
    } catch (error) {
      console.error('Network check error:', error);
      setNetworkInfo({
        isConnected: false,
        type: 'disconnected',
        isInternetReachable: false,
      });
    }
  }, []);

  useEffect(() => {
    checkNetwork();

    const subscription = Network.addNetworkStateListener((state) => {
      setNetworkInfo({
        isConnected: state.isConnected ?? false,
        type: state.type as NetworkState,
        isInternetReachable: state.isInternetReachable ?? null,
      });
    });

    return () => {
      subscription.remove();
    };
  }, [checkNetwork]);

  return { ...networkInfo, refresh: checkNetwork };
}

export function useOnlineStatus(): boolean {
  const { isConnected, isInternetReachable } = useNetwork();
  return isConnected && (isInternetReachable !== false);
}
