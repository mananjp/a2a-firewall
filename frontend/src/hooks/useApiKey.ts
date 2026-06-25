import { useCallback, useEffect, useState } from "react";
import { clearApiKey, getApiKey, setApiKey } from "../api/client";

export function useApiKey(): {
  apiKey: string | null;
  setKey: (key: string) => void;
  clear: () => void;
} {
  const [apiKey, setApiKeyState] = useState<string | null>(getApiKey());

  // Keep state in sync if another tab changes localStorage.
  useEffect(() => {
    const onStorage = () => setApiKeyState(getApiKey());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setKey = useCallback((key: string) => {
    setApiKey(key);
    setApiKeyState(key);
  }, []);

  const clear = useCallback(() => {
    clearApiKey();
    setApiKeyState(null);
  }, []);

  return { apiKey, setKey, clear };
}
