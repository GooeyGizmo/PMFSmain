import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';

const scrollPositions = new Map<string, number>();
const visitedPaths = new Set<string>();

export function useScrollRestoration() {
  const [location] = useLocation();
  const prevLocationRef = useRef<string | null>(null);
  
  const saveScrollPosition = useCallback((path: string) => {
    scrollPositions.set(path, window.scrollY);
  }, []);

  useEffect(() => {
    if (prevLocationRef.current && prevLocationRef.current !== location) {
      saveScrollPosition(prevLocationRef.current);
    }
    
    const hasVisited = visitedPaths.has(location);
    
    if (hasVisited) {
      const savedPosition = scrollPositions.get(location) || 0;
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
      });
    } else {
      visitedPaths.add(location);
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    }
    
    prevLocationRef.current = location;
  }, [location, saveScrollPosition]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (prevLocationRef.current) {
        saveScrollPosition(prevLocationRef.current);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveScrollPosition]);
}

export function ScrollRestoration() {
  useScrollRestoration();
  return null;
}
