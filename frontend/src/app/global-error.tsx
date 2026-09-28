"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary. Catches throws in the root layout itself, which
 * the nested dashboard boundary cannot see. Must render its own <html>/<body>
 * because the root layout that would normally provide them has already failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global render error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          background: "#0a0a0a",
          color: "#e5e5e5",
        }}
      >
        <div style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Application error
          </h1>
          <p style={{ fontSize: "0.75rem", lineHeight: 1.6, opacity: 0.7, marginTop: "0.75rem" }}>
            A client-side exception occurred and the app could not render.
          </p>
          <pre
            style={{
              fontSize: "0.6875rem",
              textAlign: "left",
              opacity: 0.7,
              marginTop: "1rem",
              padding: "0.75rem",
              border: "1px solid #333",
              borderRadius: "0.5rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message || "Unknown error"}
            {error.digest ? `\nDigest: ${error.digest}` : ""}
          </pre>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              fontSize: "0.75rem",
              fontFamily: "inherit",
              color: "#0a0a0a",
              background: "#e5e5e5",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
