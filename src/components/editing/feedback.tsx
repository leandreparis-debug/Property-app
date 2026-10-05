"use client";

import { CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
  detail?: string;
}

const ToastContext = createContext<(message: string, detail?: string) => void>(() => {});

/** Shows a short notification (« 2 modifications enregistrées »), announced politely. */
export function useToast() {
  return useContext(ToastContext);
}

/**
 * Notification area (bottom right, `role="status"`): messages disappear after
 * 6 s or on « Fermer ». No dependency.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback((message: string, detail?: string) => {
    const id = next.current++;
    setToasts((t) => [...t, { id, message, detail }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2 print:hidden" data-slot="toasts">
        {toasts.map((t) => (
          <div key={t.id} data-slot="toast" className="glass pointer-events-auto flex items-start gap-2 rounded-md px-3 py-2.5 text-sm shadow-panel">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.message}</p>
              {t.detail && <p className="text-text-muted">{t.detail}</p>}
            </div>
            <button type="button" aria-label="Fermer la notification" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="rounded-xs text-text-muted hover:text-text">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unsaved changes guard
// ─────────────────────────────────────────────────────────────────────────────

/** Question asked before leaving unsaved changes. */
export const LEAVE_QUESTION = "Des modifications ne sont pas enregistrées. Les abandonner ?";

interface EditGuard {
  /** Declares (or clears) unsaved changes of an editor. */
  setDirty(id: string, dirty: boolean): void;
  /** `true` when leaving is allowed (nothing unsaved, or the user confirmed). */
  confirmLeave(): boolean;
}

const GuardContext = createContext<EditGuard>({ setDirty: () => {}, confirmLeave: () => true });

/** Access to the unsaved-changes guard of the page. */
export function useEditGuard() {
  return useContext(GuardContext);
}

/**
 * Guards unsaved changes: confirmation before closing or reloading the page
 * (`beforeunload`), before following an internal link, and on request
 * (`confirmLeave`, used by the tabs).
 */
export function EditGuardProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<string>());
  const guard = useMemo<EditGuard>(
    () => ({
      setDirty(id, value) {
        if (value) dirty.current.add(id);
        else dirty.current.delete(id);
      },
      confirmLeave() {
        if (dirty.current.size === 0) return true;
        if (!window.confirm(LEAVE_QUESTION)) return false;
        dirty.current.clear();
        return true;
      },
    }),
    [],
  );

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    // Client navigations (links of the breadcrumb, previous / next, rail…).
    const click = (event: MouseEvent) => {
      if (dirty.current.size === 0 || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return;
      if (!guard.confirmLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [guard]);

  return <GuardContext.Provider value={guard}>{children}</GuardContext.Provider>;
}
