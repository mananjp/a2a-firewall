import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useApiKey } from "../hooks/useApiKey";

interface LayoutProps {
  children: ReactNode;
}

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/violations", label: "Violations" },
  { to: "/agents", label: "Agents" },
  { to: "/policies", label: "Policies" },
  { to: "/review", label: "Review Queue" },
  { to: "/demo", label: "🔥 Live Demo" },
];

export default function Layout({ children }: LayoutProps) {
  const { clear } = useApiKey();
  const navigate = useNavigate();

  function onLogout() {
    clear();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-firewall-panel border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">
            A2A Firewall
          </Link>
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm ${
                    isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-700"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button onClick={onLogout} className="btn-ghost text-xs">
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">{children}</main>
      <footer className="border-t border-slate-700 py-3 text-center text-xs text-slate-500">
        A2A Firewall MVP — inter-agent governance mesh
      </footer>
    </div>
  );
}
