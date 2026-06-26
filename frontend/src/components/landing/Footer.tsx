import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-slate-950/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo size={22} />
          <span className="text-xs text-slate-500">
            A2A Firewall MVP · inter-agent governance mesh
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#pipeline" className="hover:text-white">Pipeline</a>
          <a href="#auth" className="hover:text-white">Sign in</a>
          <a href="/docs" className="hover:text-white">API docs</a>
          <span className="text-slate-600">·</span>
          <span>v0.1.0</span>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-7xl px-4 py-3 text-center text-[11px] text-slate-600 sm:px-6">
          DEV ONLY — localStorage key storage, key rotation on login. Set DEBUG=false in production
          and replace the dev auth endpoint with a proper password or SSO flow.
        </div>
      </div>
    </footer>
  );
}
