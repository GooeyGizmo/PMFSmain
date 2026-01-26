import { useState, useEffect, useCallback } from 'react';
import type { ShellType } from '@/lib/capabilities';

const PREFERENCES_KEY = 'pmfs_user_preferences';

export interface UserPreferences {
  lastVehicleId: string | null;
  preferredAddressId: string | null;
  lastOrderTemplate: {
    vehicleIds?: string[];
    fuelTypes?: Record<string, string>;
    fillAmounts?: Record<string, number>;
  } | null;
  
  lastTruckId: string | null;
  lastRouteId: string | null;
  lastStopId: string | null;
  
  lastFinanceTab: string | null;
  lastReportType: string | null;
  lastDateRange: { start: string; end: string } | null;
  
  preferredShell: ShellType;
  lastShellUsed: ShellType | null;
  autoSwitchOnMobile: boolean;
  
  lastOperationsTab: string | null;
  lastBusinessTab: string | null;
  lastAccountTab: string | null;
  lastMyStuffTab: string | null;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  lastVehicleId: null,
  preferredAddressId: null,
  lastOrderTemplate: null,
  
  lastTruckId: null,
  lastRouteId: null,
  lastStopId: null,
  
  lastFinanceTab: null,
  lastReportType: null,
  lastDateRange: null,
  
  preferredShell: 'owner',
  lastShellUsed: null,
  autoSwitchOnMobile: true,
  
  lastOperationsTab: null,
  lastBusinessTab: null,
  lastAccountTab: null,
  lastMyStuffTab: null,
};

function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (error) {
    console.warn('Failed to load preferences:', error);
  }
  return DEFAULT_PREFERENCES;
}

function savePreferences(preferences: UserPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn('Failed to save preferences:', error);
  }
}

export function usePreferences() {
  const [preferences, setPreferencesState] = useState<UserPreferences>(loadPreferences);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const setPreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferencesState(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferencesState(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferencesState(DEFAULT_PREFERENCES);
    localStorage.removeItem(PREFERENCES_KEY);
  }, []);

  const setShell = useCallback((shell: ShellType) => {
    setPreferencesState(prev => ({
      ...prev,
      preferredShell: shell,
      lastShellUsed: shell,
    }));
  }, []);

  return {
    preferences,
    setPreference,
    updatePreferences,
    resetPreferences,
    setShell,
  };
}

export function useShellPreference() {
  const { preferences, setShell } = usePreferences();
  
  return {
    preferredShell: preferences.preferredShell,
    lastShellUsed: preferences.lastShellUsed,
    autoSwitchOnMobile: preferences.autoSwitchOnMobile,
    setShell,
  };
}
