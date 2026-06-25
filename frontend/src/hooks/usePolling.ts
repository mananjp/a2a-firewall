import { useCallback, useEffect, useState } from "react";

/**
 * Generic polling hook. Calls `fetcher` every `intervalMs` until `enabled` is false.
 * Cancels in-flight requests via AbortController when effect re-runs or unmounts.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  enabled = true,
): { data: T | null; error: Error | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    fetcher(controller.signal)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e);
      })
      .finally(() => setLoading(false));

    const id = setInterval(() => {
      const c = new AbortController();
      fetcher(c.signal)
        .then((d) => setData(d))
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e);
        });
    }, intervalMs);

    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [enabled, intervalMs, tick, fetcher]);

  return { data, error, loading, refresh };
}
