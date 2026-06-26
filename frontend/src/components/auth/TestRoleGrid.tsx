import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginAsDemoRole } from "../../lib/authActions";
import { DEMO_ROLES, type DemoRoleId } from "../../lib/demoRoles";
import { Alert } from "./Alert";

export function TestRoleGrid() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<DemoRoleId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(id: DemoRoleId) {
    setBusy(id);
    setError(null);
    const res = await loginAsDemoRole(id);
    if (!res.ok) {
      setError(res.error.message);
      setBusy(null);
      return;
    }
    navigate(res.value.route);
  }

  return (
    <div className="space-y-4" data-testid="test-role-grid">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          One-click demo workspaces
        </h3>
        <span className="chip">No email required</span>
      </div>
      <p className="text-xs text-slate-400">
        Click any role to instantly provision (or re-enter) a demo workspace and sign in.
        Each role maps to a deterministic email so the same workspace is reused across clicks.
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DEMO_ROLES.map((role) => {
          const isBusy = busy === role.id;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onPick(role.id)}
              disabled={busy !== null}
              data-testid={`role-${role.id}`}
              className={`group relative overflow-hidden rounded-lg border ${role.accent.border} bg-slate-900/60 p-4 text-left transition-all hover:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-60`}
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${role.accent.glow} opacity-0 transition-opacity group-hover:opacity-100`}
              />
              <div className="relative space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`chip ${role.accent.chip}`}>{role.title}</span>
                  {isBusy ? (
                    <span className="text-xs text-slate-400">Signing in…</span>
                  ) : (
                    <span className={`text-xs font-medium ${role.accent.text} opacity-0 transition-opacity group-hover:opacity-100`}>
                      Sign in →
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-100">{role.tagline}</p>
                <p className="text-xs text-slate-400">{role.description}</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {role.capabilities.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
