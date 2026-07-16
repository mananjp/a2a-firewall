"use client";

import { useCallback, useEffect, useState } from "react";
import { clearApiKey, getApiKey, setApiKey as storeKey } from "@/lib/api";

export function useApiKey(): {
  apiKey: string | null;
  setKey: (key: string) => void;
  clear: () => void;
} {
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  useEffect(() => {
    setApiKeyState(getApiKey());
  }, []);

  useEffect(() => {
    const sync = () => setApiKeyState(getApiKey());
    window.addEventListener("storage", sync);
    window.addEventListener("apikey-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("apikey-change", sync);
    };
  }, []);

  const setKey = useCallback((key: string) => {
    storeKey(key);
    setApiKeyState(key);
  }, []);

  const clear = useCallback(() => {
    clearApiKey();
    setApiKeyState(null);
  }, []);

  return { apiKey, setKey, clear };
}
