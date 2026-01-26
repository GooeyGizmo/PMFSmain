import { useState, useEffect, useCallback } from 'react';

export type LayoutMode = 'compact' | 'tall' | 'medium' | 'wide' | 'square';

interface LayoutModeInfo {
  mode: LayoutMode;
  isCompact: boolean;
  isTall: boolean;
  isMedium: boolean;
  isWide: boolean;
  isSquare: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  aspectRatio: number;
}

const BREAKPOINTS = {
  compact: 480,
  medium: 768,
  wide: 1024,
};

const ASPECT_RATIO_THRESHOLDS = {
  square: { min: 0.85, max: 1.15 },
  tall: { max: 0.75 },
};

function calculateLayoutMode(width: number, height: number): LayoutMode {
  const aspectRatio = width / height;
  
  if (aspectRatio >= ASPECT_RATIO_THRESHOLDS.square.min && 
      aspectRatio <= ASPECT_RATIO_THRESHOLDS.square.max) {
    return 'square';
  }
  
  if (width < BREAKPOINTS.compact) {
    if (aspectRatio < ASPECT_RATIO_THRESHOLDS.tall.max) {
      return 'compact';
    }
    return 'tall';
  }
  
  if (width < BREAKPOINTS.medium) {
    if (aspectRatio < ASPECT_RATIO_THRESHOLDS.tall.max) {
      return 'compact';
    }
    return 'tall';
  }
  
  if (width < BREAKPOINTS.wide) {
    return 'medium';
  }
  
  return 'wide';
}

export function useLayoutMode(): LayoutModeInfo {
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));

  const handleResize = useCallback(() => {
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const { width, height } = dimensions;
  const aspectRatio = width / height;
  const mode = calculateLayoutMode(width, height);

  return {
    mode,
    isCompact: mode === 'compact',
    isTall: mode === 'tall',
    isMedium: mode === 'medium',
    isWide: mode === 'wide',
    isSquare: mode === 'square',
    isMobile: mode === 'compact' || mode === 'tall' || mode === 'square',
    isTablet: mode === 'medium',
    isDesktop: mode === 'wide',
    width,
    height,
    aspectRatio,
  };
}

export function getLayoutModeClass(mode: LayoutMode): string {
  return `layout-${mode}`;
}

export function useResponsiveValue<T>(values: {
  compact?: T;
  tall?: T;
  medium?: T;
  wide?: T;
  square?: T;
  mobile?: T;
  tablet?: T;
  desktop?: T;
  default: T;
}): T {
  const layout = useLayoutMode();
  
  if (layout.isCompact && values.compact !== undefined) return values.compact;
  if (layout.isTall && values.tall !== undefined) return values.tall;
  if (layout.isMedium && values.medium !== undefined) return values.medium;
  if (layout.isWide && values.wide !== undefined) return values.wide;
  if (layout.isSquare && values.square !== undefined) return values.square;
  
  if (layout.isMobile && values.mobile !== undefined) return values.mobile;
  if (layout.isTablet && values.tablet !== undefined) return values.tablet;
  if (layout.isDesktop && values.desktop !== undefined) return values.desktop;
  
  return values.default;
}
