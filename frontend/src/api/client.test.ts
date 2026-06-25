import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clearApiKey, getApiKey, setApiKey } from "./client";

describe("api key storage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("starts null", () => {
    expect(getApiKey()).toBeNull();
  });

  it("set then get round-trips", () => {
    setApiKey("ws_abc123");
    expect(getApiKey()).toBe("ws_abc123");
  });

  it("clear removes the key", () => {
    setApiKey("ws_abc123");
    clearApiKey();
    expect(getApiKey()).toBeNull();
  });
});
