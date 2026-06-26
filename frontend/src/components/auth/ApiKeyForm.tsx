import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithApiKey } from "../../lib/authActions";
import { Alert } from "./Alert";

export function ApiKeyForm() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await signInWithApiKey(key, "/");
    if (!res.ok) {
      setError(res.error.message);
      setSubmitting(false);
      return;
    }
    navigate(res.value.route);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="apikey-form">
      <label className="block">
        <span className="text-sm text-slate-300">Workspace API key</span>
        <div className="mt-1 flex gap-2">
          <input
            type={show ? "text" : "password"}
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ws_…"
            className="input flex-1 font-mono"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            data-testid="apikey-input"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="btn-ghost text-xs"
            aria-label={show ? "Hide API key" : "Show API key"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {error && <Alert tone="error">{error}</Alert>}

      <button
        type="submit"
        disabled={submitting || !key.trim()}
        className="btn-primary w-full"
        data-testid="apikey-submit"
      >
        {submitting ? "Verifying…" : "Use this key"}
      </button>

      <p className="text-xs text-slate-500">
        Paste any workspace API key. We will verify it against <code>/v1/workspaces/me</code>{" "}
        before completing the sign-in.
      </p>
    </form>
  );
}
