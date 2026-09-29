import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { LiveSnapshot, LiveStore } from '../store/liveStore.ts';

export const LiveStoreContext = createContext<LiveStore | null>(null);

export function useLiveStore(): LiveStore {
  const store = useContext(LiveStoreContext);
  if (!store) throw new Error('useLiveStore must be used inside LiveStoreContext');
  return store;
}

/**
 * Subscribes a component to one slice of the store. The component re-renders only when the selected value
 * changes by identity, or by isEqual when a selector derives a new object.
 */
export function useLiveSelector<T>(
  selector: (snapshot: LiveSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useLiveStore();
  const cache = useRef<{ snapshot: LiveSnapshot; value: T } | null>(null);

  // Memoizing per snapshot keeps getSnapshot stable, which useSyncExternalStore requires to avoid loops.
  const getSelection = useCallback((): T => {
    const snapshot = store.getSnapshot();
    const cached = cache.current;
    if (cached?.snapshot === snapshot) return cached.value;
    const next = selector(snapshot);
    const value = cached && isEqual(cached.value, next) ? cached.value : next;
    cache.current = { snapshot, value };
    return value;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
