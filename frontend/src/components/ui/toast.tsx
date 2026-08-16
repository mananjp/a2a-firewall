"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, X, Info } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

// ─── Context ────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────────

const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput): string => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = input.duration ?? 4000;
      const newToast: Toast = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant ?? "info",
        duration,
      };
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), newToast]);

      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  const ctx = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Container ──────────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

// ─── Item ───────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; icon: React.ReactNode; title: string; desc: string }
> = {
  success: {
    border: "border-success/25",
    icon: <CheckCircle2 size={15} className="text-success" />,
    title: "text-foreground",
    desc: "text-muted-foreground",
  },
  error: {
    border: "border-danger/25",
    icon: <AlertTriangle size={15} className="text-danger" />,
    title: "text-foreground",
    desc: "text-muted-foreground",
  },
  warning: {
    border: "border-warning/25",
    icon: <AlertTriangle size={15} className="text-warning" />,
    title: "text-foreground",
    desc: "text-muted-foreground",
  },
  info: {
    border: "border-info/25",
    icon: <Info size={15} className="text-info" />,
    title: "text-foreground",
    desc: "text-muted-foreground",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const s = VARIANT_STYLES[toast.variant];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ type: "spring", bounce: 0.18, duration: 0.32 }}
      className={`pointer-events-auto w-80 rounded-xl border ${s.border} bg-surface shadow-[var(--shadow-toast)]`}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span className="mt-0.5 shrink-0">{s.icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] font-medium ${s.title}`}>{toast.title}</div>
          {toast.description && (
            <div className={`mt-0.5 text-[12px] leading-relaxed ${s.desc}`}>
              {toast.description}
            </div>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 mt-0.5 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </motion.div>
  );
}
