import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchMobileAppConfig, DEFAULT_CONFIG } from '../lib/config';
import type { MobileAppConfig } from '../types/config';

interface AppConfigContextValue {
  config: MobileAppConfig;
  isLoading: boolean;
  tenantId: string | null;
  reload: () => void;
}

const AppConfigContext = createContext<AppConfigContextValue>({
  config: DEFAULT_CONFIG,
  isLoading: true,
  tenantId: null,
  reload: () => {},
});

export function useAppConfig() {
  return useContext(AppConfigContext);
}

interface AppConfigProviderProps {
  children: React.ReactNode;
  /**
   * The tenant (business) ID. In a real deployment this comes from:
   * - EXPO_PUBLIC_TENANT_ID env var (baked in at build time per client)
   * - OR a deep link / QR code scan that sets the tenant dynamically
   */
  tenantId: string | null;
}

export function AppConfigProvider({ children, tenantId }: AppConfigProviderProps) {
  const [config, setConfig] = useState<MobileAppConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchMobileAppConfig(tenantId)
      .then((fetched) => {
        if (fetched) setConfig(fetched);
      })
      .finally(() => setIsLoading(false));
  }, [tenantId, tick]);

  const reload = () => setTick((t) => t + 1);

  return (
    <AppConfigContext.Provider value={{ config, isLoading, tenantId, reload }}>
      {children}
    </AppConfigContext.Provider>
  );
}
