import { describe, it, expect } from "vitest";
import { DEMO_ROLES, getDemoRole } from "../lib/demoRoles";

describe("DEMO_ROLES", () => {
  it("contains exactly four roles with unique ids and emails", () => {
    expect(DEMO_ROLES).toHaveLength(4);
    const ids = DEMO_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const emails = DEMO_ROLES.map((r) => r.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("every role has a non-empty title, tagline and at least one capability", () => {
    for (const r of DEMO_ROLES) {
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.tagline.length).toBeGreaterThan(0);
      expect(r.capabilities.length).toBeGreaterThan(0);
      expect(r.landingRoute.startsWith("/")).toBe(true);
    }
  });

  it("getDemoRole returns the matching role", () => {
    expect(getDemoRole("admin").id).toBe("admin");
  });

  it("getDemoRole throws on unknown id", () => {
    expect(() => getDemoRole("nope" as never)).toThrow();
  });
});
