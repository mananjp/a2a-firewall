import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { loginByEmail } from "../../lib/authActions";
import { Alert } from "./Alert";

interface SignInFormProps {
  /** Optional override of the post-login route (used by the TestRoleGrid pattern). */
  redirectTo?: string;
}

export function SignInForm({ redirectTo = "/" }: SignInFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setWarning(null);
    const res = await loginByEmail(email, redirectTo);
    if (!res.ok) {
      setError(res.error.message);
      setSubmitting(false);
      return;
    }
    setWarning(res.value.warning ?? null);
    setTimeout(() => navigate(res.value.route), 800);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="signin-form">
      <label className="block">
        <span className="text-sm text-slate-300">Workspace email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input w-full mt-1"
          autoFocus
          data-testid="signin-email"
        />
      </label>

      {error && <Alert tone="error">{error}</Alert>}
      {warning && <Alert tone="warning">{warning}</Alert>}

      <button
        type="submit"
        disabled={submitting || !email}
        className="btn-primary w-full"
        data-testid="signin-submit"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-xs text-slate-500">
        DEV ONLY — the backend rotates your workspace API key on every successful login.
      </p>
    </form>
  );
}
