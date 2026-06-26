import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { registerWorkspace } from "../../lib/authActions";
import { Alert } from "./Alert";

export function RegisterForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setIssuedKey(null);
    setCopied(false);

    const res = await registerWorkspace(name.trim(), email.trim(), "/");
    if (!res.ok) {
      setError(res.error.message);
      setSubmitting(false);
      return;
    }
    setIssuedKey(res.value.apiKey);
    setTimeout(() => navigate("/"), 2500);
  }

  async function copyKey() {
    if (!issuedKey) return;
    try {
      await navigator.clipboard.writeText(issuedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="register-form">
      <label className="block">
        <span className="text-sm text-slate-300">Workspace name</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme AI Lab"
          className="input w-full mt-1"
          autoFocus
          data-testid="register-name"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-300">Admin email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          className="input w-full mt-1"
          data-testid="register-email"
        />
      </label>

      {error && <Alert tone="error">{error}</Alert>}

      {issuedKey && (
        <Alert tone="success">
          <div className="space-y-2">
            <div className="font-medium">Workspace registered. You are now signed in.</div>
            <div className="text-xs text-slate-300">
              Save this API key now — it will not be shown again.
            </div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 break-all rounded bg-black/40 px-2 py-1 font-mono text-xs text-emerald-200"
                data-testid="register-issued-key"
              >
                {issuedKey}
              </code>
              <button
                type="button"
                onClick={copyKey}
                className="btn-ghost text-xs"
                data-testid="register-copy"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </Alert>
      )}

      <button
        type="submit"
        disabled={submitting || !name || !email}
        className="btn-primary w-full"
        data-testid="register-submit"
      >
        {submitting ? "Registering…" : "Register workspace"}
      </button>

      <p className="text-xs text-slate-500">
        A fresh workspace API key is generated. Anyone holding this key has full admin
        access to the workspace — keep it secret.
      </p>
    </form>
  );
}
