import { useEffect, useRef, useState } from 'react';

/**
 * Deep comparison function to check if two values are equal
 */
function deepEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a) as Array<keyof T>;
  const keysB = Object.keys(b) as Array<keyof T>;

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Hook for background polling that only updates state when data changes
 * @param fetchFn Function that fetches the data
 * @param dependencies Array of dependencies that should trigger a refetch
 * @param interval Polling interval in milliseconds (default: 5000)
 * @param enabled Whether polling is enabled (default: true)
 */
export function useBackgroundPolling<T>(
  fetchFn: () => Promise<T>,
  dependencies: any[] = [],
  interval: number = 5000,
  enabled: boolean = true
): { data: T | null; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const previousDataRef = useRef<T | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let isInitialLoad = true;

    const fetchData = async () => {
      if (!mountedRef.current) return;

      try {
        const result = await fetchFn();

        if (!mountedRef.current) return;

        // Only update state if data actually changed
        if (!deepEqual(previousDataRef.current, result)) {
          previousDataRef.current = result;
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        console.error('Background polling error:', error);
      } finally {
        if (mountedRef.current) {
          if (isInitialLoad) {
            setLoading(false);
            isInitialLoad = false;
          }
        }
      }
    };

    // Initial fetch
    fetchData();

    // Set up polling interval
    if (interval > 0) {
      intervalId = setInterval(fetchData, interval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [enabled, interval, ...dependencies]);

  return { data, loading, error };
}

