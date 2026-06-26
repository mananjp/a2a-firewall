import { useCallback, useEffect, useState } from "react";
import { clearApiKey, getApiKey, setApiKey } from "../api/client";

export function useApiKey(): {
  apiKey: string | null;
  setKey: (key: string) => void;
  clear: () => void;
} {
  const [apiKey, setApiKeyState] = useState<string | null>(getApiKey());

  // Keep state in sync when the key changes — covers both cross-tab
  // (storage event) and same-tab updates (custom apikey-change event
  // dispatched by setApiKey / clearApiKey in client.ts).
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
    setApiKey(key);
    setApiKeyState(key);
  }, []);

  const clear = useCallback(() => {
    clearApiKey();
    setApiKeyState(null);
  }, []);

  return { apiKey, setKey, clear };
}
