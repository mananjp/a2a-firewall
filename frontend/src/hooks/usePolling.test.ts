import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolling } from "./usePolling";

describe("usePolling", () => {
  it("calls fetcher once on mount when enabled", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    renderHook(() => usePolling(fetcher, 60_000, true));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });

  it("does not call fetcher when disabled", () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    renderHook(() => usePolling(fetcher, 60_000, false));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("exposes refresh that re-triggers fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => usePolling(fetcher, 60_000, true));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    result.current.refresh();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
});
