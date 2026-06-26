import { useState, type ReactNode } from "react";
import { SignInForm } from "./SignInForm";
import { RegisterForm } from "./RegisterForm";
import { ApiKeyForm } from "./ApiKeyForm";
import { TestRoleGrid } from "./TestRoleGrid";

type TabId = "signin" | "register" | "apikey";

interface TabDef {
  id: TabId;
  label: string;
  hint: string;
  body: ReactNode;
}

const TABS: TabDef[] = [
  {
    id: "signin",
    label: "Sign in",
    hint: "Use an existing workspace email.",
    body: <SignInForm />,
  },
  {
    id: "register",
    label: "Register",
    hint: "Create a brand-new workspace.",
    body: <RegisterForm />,
  },
  {
    id: "apikey",
    label: "Use API key",
    hint: "Paste a ws_… key directly.",
    body: <ApiKeyForm />,
  },
];

export function AuthPanel() {
  const [active, setActive] = useState<TabId>("signin");

  return (
    <div className="glass-strong ring-soft rounded-2xl p-6 sm:p-8" data-testid="auth-panel">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Authentication</h2>
          <p className="text-xs text-slate-400">
            Choose how you want to identify yourself to the firewall.
          </p>
        </div>
        <span className="chip">v0.1 · DEV ONLY</span>
      </div>

      <div role="tablist" aria-label="Authentication method" className="mb-6 flex gap-1 rounded-lg bg-slate-900/70 p-1">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActive(tab.id)}
              data-testid={`auth-tab-${tab.id}`}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tab-panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== active}
        >
          {tab.id === active && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">{tab.hint}</p>
              {tab.body}
            </div>
          )}
        </div>
      ))}

      <div className="my-6 divider-soft" />

      <TestRoleGrid />
    </div>
  );
}
