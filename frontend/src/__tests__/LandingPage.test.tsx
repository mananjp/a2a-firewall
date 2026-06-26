import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../pages/LandingPage";
import { DEMO_ROLES } from "../lib/demoRoles";

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {
  beforeEach(() => {
    localStorage.clear();
    // Provide a fetch stub so the api client doesn't throw on module load.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({}),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders hero, auth panel and demo role grid", () => {
    renderLanding();
    expect(screen.getByTestId("landing-page")).toBeInTheDocument();
    expect(screen.getByTestId("auth-panel")).toBeInTheDocument();
    expect(screen.getByTestId("test-role-grid")).toBeInTheDocument();
    for (const role of DEMO_ROLES) {
      expect(screen.getByTestId(`role-${role.id}`)).toBeInTheDocument();
    }
  });

  it("switches between auth tabs", () => {
    renderLanding();
    expect(screen.getByTestId("signin-form")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("auth-tab-register"));
    expect(screen.getByTestId("register-form")).toBeInTheDocument();
    expect(screen.queryByTestId("signin-form")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("auth-tab-apikey"));
    expect(screen.getByTestId("apikey-form")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("auth-tab-signin"));
    expect(screen.getByTestId("signin-form")).toBeInTheDocument();
  });

  it("submits signin form and stores key in localStorage on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        workspace_id: "ws-1",
        admin_email: "demo@a2afirewall.local",
        api_key: "ws_testkey",
        warning: "rotated",
      }),
      text: async () => "",
    });

    renderLanding();
    fireEvent.change(screen.getByTestId("signin-email"), {
      target: { value: "demo@a2afirewall.local" },
    });
    fireEvent.click(screen.getByTestId("signin-submit"));

    await waitFor(() => {
      expect(localStorage.getItem("a2a_workspace_key")).toBe("ws_testkey");
    });
  });

  it("one-click role login registers then navigates", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ workspace_id: "ws-2", api_key: "ws_rolekey", name: "demo-admin" }),
      text: async () => "",
    });

    renderLanding();
    fireEvent.click(screen.getByTestId("role-admin"));

    await waitFor(() => {
      expect(localStorage.getItem("a2a_workspace_key")).toBe("ws_rolekey");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/workspaces/register");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "demo-admin",
      admin_email: "demo-admin@a2afirewall.local",
    });
  });

  it("falls back to /v1/auth/login when role workspace already exists", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // First call: register -> 409 already exists
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Email already registered" }),
      text: async () => JSON.stringify({ detail: "Email already registered" }),
    });
    // Second call: login -> ok
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        workspace_id: "ws-3",
        admin_email: "demo-auditor@a2afirewall.local",
        api_key: "ws_auditkey",
        warning: "rotated",
      }),
      text: async () => "",
    });

    renderLanding();
    fireEvent.click(screen.getByTestId("role-auditor"));

    await waitFor(() => {
      expect(localStorage.getItem("a2a_workspace_key")).toBe("ws_auditkey");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][0] as string)).toContain("/v1/auth/login");
  });

  it("renders all pipeline layers", () => {
    renderLanding();
    const list = screen.getByTestId("pipeline-list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
  });
});
