import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../api/client";
import type { ApiError } from "../api/client";
import { useApiKey } from "../hooks/useApiKey";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setKey } = useApiKey();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setWarning(null);
    try {
      const res = await auth.login(email);
      setKey(res.api_key);
      setWarning(res.warning);
      // Brief delay so user sees the warning, then redirect.
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 404) {
        setError("No workspace found for that email. Register one via the backend API first.");
      } else if (apiErr.status === 403) {
        setError("Login disabled. Set DEBUG=true on the backend.");
      } else {
        setError(apiErr.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">A2A Firewall</h1>
        <p className="text-slate-400 text-sm mb-6">
          Sign in with the email you registered your workspace under.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm text-slate-300">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input w-full mt-1"
              autoFocus
            />
          </label>

          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {warning && (
            <div className="bg-amber-900/40 border border-amber-700 rounded p-3 text-sm text-amber-200">
              {warning}
            </div>
          )}

          <button type="submit" disabled={submitting || !email} className="btn-primary w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-xs text-slate-500 mt-6">
          DEV ONLY. The backend rotates your workspace API key on every login. Set{" "}
          <code>DEBUG=false</code> in production and use a proper password flow.
        </p>
      </div>
    </div>
  );
}
