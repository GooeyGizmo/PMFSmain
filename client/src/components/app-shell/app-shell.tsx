import { ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { useShellPreference } from '@/hooks/use-preferences';
import { getDefaultShell, getAvailableShells, canSwitchShell, type ShellType } from '@/lib/capabilities';
import { CustomerShell } from './customer-shell';
import { OperatorShell } from './operator-shell';
import { OwnerShell } from './owner-shell';

interface AppShellProps {
  children: ReactNode;
  forceShell?: ShellType;
}

export function AppShell({ children, forceShell }: AppShellProps) {
  const { user } = useAuth();
  const layout = useLayoutMode();
  const { preferredShell, autoSwitchOnMobile, setShell } = useShellPreference();
  const [location] = useLocation();

  const role = user?.role;
  const availableShells = getAvailableShells(role);
  const defaultShell = getDefaultShell(role);
  const canSwitch = canSwitchShell(role);

  const determineActiveShell = (): ShellType => {
    if (forceShell && availableShells.includes(forceShell)) {
      return forceShell;
    }

    if (location.startsWith('/app/') || location.startsWith('/customer')) {
      return 'customer';
    }
    
    if (location.startsWith('/ops/today') || 
        (location.startsWith('/ops/') && role === 'operator')) {
      return 'operator';
    }
    
    if (location.startsWith('/owner/') || 
        (location.startsWith('/ops/') && (role === 'owner' || role === 'admin'))) {
      if (canSwitch && preferredShell === 'operator') {
        return 'operator';
      }
      return 'owner';
    }

    if (canSwitch) {
      if (autoSwitchOnMobile && layout.isMobile && preferredShell === 'owner') {
        return 'operator';
      }
      return preferredShell;
    }

    return defaultShell;
  };

  const activeShell = determineActiveShell();

  const handleModeChange = (newMode: ShellType) => {
    if (canSwitch) {
      setShell(newMode);
    }
  };

  const showModeToggle = canSwitch;

  if (activeShell === 'customer') {
    return <CustomerShell>{children}</CustomerShell>;
  }

  if (activeShell === 'operator') {
    return (
      <OperatorShell
        currentMode={preferredShell}
        onModeChange={handleModeChange}
        showModeToggle={showModeToggle}
      >
        {children}
      </OperatorShell>
    );
  }

  return (
    <OwnerShell
      currentMode={preferredShell}
      onModeChange={handleModeChange}
      showModeToggle={showModeToggle}
    >
      {children}
    </OwnerShell>
  );
}
