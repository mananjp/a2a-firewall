import { ApiError, auth, setApiKey, workspaces } from "../api/client";
import type { WorkspaceRegisterResponse } from "../api/types";
import { getDemoRole, type DemoRole, type DemoRoleId } from "./demoRoles";

export interface AuthSuccess {
  apiKey: string;
  workspaceId?: string;
  warning?: string;
  /** Route the caller should navigate to on success. */
  route: string;
}

export interface AuthFailure {
  status: number;
  message: string;
}

/**
 * Result type that lets the UI distinguish a hard failure from a soft warning
 * (e.g. "key rotated" notice) without throwing.
 */
export type AuthResult =
  | { ok: true; value: AuthSuccess }
  | { ok: false; error: AuthFailure };

export async function loginByEmail(email: string, route: string): Promise<AuthResult> {
  try {
    const res = await auth.login(email);
    setApiKey(res.api_key);
    return {
      ok: true,
      value: {
        apiKey: res.api_key,
        workspaceId: res.workspace_id,
        warning: res.warning,
        route,
      },
    };
  } catch (err) {
    return { ok: false, error: toAuthFailure(err) };
  }
}

/**
 * Register a brand-new workspace. Used by the manual "Register" tab.
 */
export async function registerWorkspace(
  name: string,
  email: string,
  route = "/",
): Promise<AuthResult & { registered?: WorkspaceRegisterResponse }> {
  try {
    const res = await workspaces.register({ name, admin_email: email });
    setApiKey(res.api_key);
    return {
      ok: true,
      value: { apiKey: res.api_key, workspaceId: res.workspace_id, route },
      registered: res,
    };
  } catch (err) {
    return { ok: false, error: toAuthFailure(err) };
  }
}

/**
 * Use a known API key directly (no backend call required to "log in").
 * Validates by fetching /v1/workspaces/me; on failure the caller can fall
 * back to a typed-key form.
 */
export async function signInWithApiKey(rawKey: string, route = "/"): Promise<AuthResult> {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return { ok: false, error: { status: 0, message: "API key is required" } };
  }
  setApiKey(trimmed);
  try {
    const me = await workspaces.me();
    return {
      ok: true,
      value: { apiKey: trimmed, workspaceId: me.id, route },
    };
  } catch (err) {
    // Clear the bad key so the UI doesn't think we're logged in.
    setApiKey("");
    return { ok: false, error: toAuthFailure(err) };
  }
}

/**
 * One-click demo role login.
 *
 * On first click the workspace does not exist yet — we POST /v1/workspaces/register.
 * On a 409 we fall back to /v1/auth/login which rotates and returns the key.
 */
export async function loginAsDemoRole(id: DemoRoleId): Promise<AuthResult> {
  const role: DemoRole = getDemoRole(id);
  const reg = await workspaces.register({
    name: role.workspaceName,
    admin_email: role.email,
  }).catch((err: unknown) => ({ error: err as ApiError }));

  if ("error" in reg) {
    const failure = toAuthFailure(reg.error);
    // 409 means the demo workspace already exists — switch to login.
    if (failure.status === 409) {
      return loginByEmail(role.email, role.landingRoute);
    }
    return { ok: false, error: failure };
  }

  setApiKey(reg.api_key);
  return {
    ok: true,
    value: {
      apiKey: reg.api_key,
      workspaceId: reg.workspace_id,
      route: role.landingRoute,
    },
  };
}

function toAuthFailure(err: unknown): AuthFailure {
  if (err instanceof ApiError) {
    return { status: err.status, message: friendlyMessage(err) };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { status: 0, message: message || "Unexpected error" };
}

function friendlyMessage(err: ApiError): string {
  switch (err.status) {
    case 404:
      return "No workspace found for that email. Register one first.";
    case 403:
      return "Login disabled. Set DEBUG=true on the backend.";
    case 409:
      return "Email already registered.";
    case 401:
      return "Invalid or expired API key.";
    default: {
      // FastAPI returns {"detail": "..."} but the raw body is opaque here —
      // strip JSON wrapping if present for a tidier message.
      const raw = err.message || "";
      try {
        const parsed = JSON.parse(raw) as { detail?: string };
        if (parsed?.detail) return parsed.detail;
      } catch {
        // not JSON — return raw
      }
      return raw || "Authentication failed";
    }
  }
}
