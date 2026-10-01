"use client";

import { useCallback, useEffect, useState } from "react";
import { clearAuth, getApiKey, getSessionToken, setApiKey as storeKey } from "@/lib/api";

export function useApiKey(): {
  apiKey: string | null;
  sessionToken: string | null;
  setKey: (key: string) => void;
  clear: () => void;
} {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);

  useEffect(() => {
    setApiKeyState(getApiKey());
    setSessionTokenState(getSessionToken());
  }, []);

  useEffect(() => {
    const sync = () => {
      setApiKeyState(getApiKey());
      setSessionTokenState(getSessionToken());
    };
    window.addEventListener("storage", sync);
    window.addEventListener("apikey-change", sync);
    window.addEventListener("session-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("apikey-change", sync);
      window.removeEventListener("session-change", sync);
    };
  }, []);

  const setKey = useCallback((key: string) => {
    storeKey(key);
    setApiKeyState(key);
  }, []);

  const clear = useCallback(() => {
    clearAuth();
    setApiKeyState(null);
    setSessionTokenState(null);
  }, []);

  // Return apiKey or sessionToken as fallback so any auth check succeeds
  return { apiKey: apiKey || sessionToken, sessionToken, setKey, clear };
}

