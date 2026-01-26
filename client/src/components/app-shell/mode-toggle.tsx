import { motion } from 'framer-motion';
import { Truck, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShellType } from '@/lib/capabilities';

interface ModeToggleProps {
  currentMode: ShellType;
  onModeChange: (mode: ShellType) => void;
  className?: string;
}

export function ModeToggle({ currentMode, onModeChange, className }: ModeToggleProps) {
  const isOwnerMode = currentMode === 'owner';

  return (
    <button
      onClick={() => onModeChange(isOwnerMode ? 'operator' : 'owner')}
      className={cn(
        "relative flex items-center gap-2 px-3 py-1.5 rounded-full",
        "bg-muted/50 border border-border hover:bg-muted transition-colors",
        "min-h-[36px]",
        className
      )}
      data-testid="button-mode-toggle"
      title={isOwnerMode ? "Switch to Delivering Mode" : "Switch to Owner Mode"}
    >
      <motion.div
        className="absolute inset-y-1 rounded-full bg-primary/20"
        initial={false}
        animate={{
          left: isOwnerMode ? '4px' : 'calc(50% - 2px)',
          right: isOwnerMode ? 'calc(50% - 2px)' : '4px',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
      
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full z-10 transition-colors",
        isOwnerMode ? "text-primary" : "text-muted-foreground"
      )}>
        <Building2 className="w-4 h-4" />
        <span className="text-xs font-medium hidden sm:inline">Owner</span>
      </div>
      
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full z-10 transition-colors",
        !isOwnerMode ? "text-primary" : "text-muted-foreground"
      )}>
        <Truck className="w-4 h-4" />
        <span className="text-xs font-medium hidden sm:inline">Delivering</span>
      </div>
    </button>
  );
}
