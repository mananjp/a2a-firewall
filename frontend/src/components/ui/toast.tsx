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
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
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
    border: "border-success/30",
    icon: <CheckCircle2 size={15} className="text-success" />,
    title: "text-success",
    desc: "text-success/70",
  },
  error: {
    border: "border-danger/30",
    icon: <AlertTriangle size={15} className="text-danger" />,
    title: "text-danger",
    desc: "text-danger/70",
  },
  warning: {
    border: "border-warning/30",
    icon: <AlertTriangle size={15} className="text-warning" />,
    title: "text-warning",
    desc: "text-warning/70",
  },
  info: {
    border: "border-accent/30",
    icon: <Info size={15} className="text-accent" />,
    title: "text-accent",
    desc: "text-accent/70",
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
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`pointer-events-auto w-80 rounded-lg border ${s.border} bg-background shadow-lg shadow-black/20`}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span className="mt-0.5 shrink-0">{s.icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium ${s.title}`}>{toast.title}</div>
          {toast.description && (
            <div className={`mt-0.5 text-xs ${s.desc} leading-relaxed`}>
              {toast.description}
            </div>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
