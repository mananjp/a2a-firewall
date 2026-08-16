"use client";

import { useCallback, useEffect, useState, useRef } from "react";

export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  enabled = true,
  minInitialDelayMs = 400
): {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const startTime = Date.now();
    setLoading(true);

    fetcherRef
      .current(controller.signal)
      .then((d) => {
        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, minInitialDelayMs - elapsed);
        setTimeout(() => {
          setData(d);
          setError(null);
          setLoading(false);
        }, remainingDelay);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") {
          const elapsed = Date.now() - startTime;
          const remainingDelay = Math.max(0, minInitialDelayMs - elapsed);
          setTimeout(() => {
            setError(e);
            setLoading(false);
          }, remainingDelay);
        }
      });

    const id = setInterval(() => {
      const c = new AbortController();
      fetcherRef
        .current(c.signal)
        .then((d) => setData(d))
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e);
        });
    }, intervalMs);

    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [enabled, intervalMs, tick, minInitialDelayMs]);

  return { data, error, loading, refresh };
}
