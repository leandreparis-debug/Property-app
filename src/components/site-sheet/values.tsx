"use client";

import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Provenance of a value, resolved on the server. */
export interface ProvenanceHint {
  label: string;
  enrichment: boolean;
}

/** Text of the tooltip of an external link. */
export const EXTERNAL_LINK_HINT = "Nécessite un accès internet depuis votre poste";

function TooltipLines({ lines }: { lines: readonly string[] }) {
  return (
    <span className="flex flex-col gap-0.5">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </span>
  );
}

/** Neutral « source publique » mark of the values written by the enrichment. */
function PublicSourceMark() {
  return (
    <span className="inline-flex text-text-muted" data-slot="public-source">
      <Globe className="size-3.5" aria-hidden="true" />
      <span className="sr-only"> (source publique)</span>
    </span>
  );
}

/**
 * A value with its provenance tooltip (hover or keyboard focus). Without
 * provenance, the value is rendered as is.
 */
export function WithProvenance({ hint, children, className }: { hint: ProvenanceHint | null; children: ReactNode; className?: string }) {
  if (!hint) return <span className={className}>{children}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-slot="provenance"
          data-provenance={hint.label}
          className={cn("inline-flex max-w-full items-baseline gap-1 rounded-xs outline-none focus-visible:outline-2 focus-visible:outline-ring", className)}
        >
          <span className="min-w-0">{children}</span>
          {hint.enrichment && <PublicSourceMark />}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {hint.label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * External link: http/https only (validated on the server), new tab,
 * `noopener noreferrer`, external-link icon and a tooltip reminding that it
 * needs internet access from the workstation. The server never fetches it.
 */
export function ExternalAnchor({ href, children, hint }: { href: string; children: ReactNode; hint?: ProvenanceHint | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-slot="external-link"
          className="inline-flex max-w-full items-baseline gap-1 break-all text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span>{children}</span>
          <ExternalLink className="size-3.5 shrink-0 self-center" aria-hidden="true" />
          <span className="sr-only"> (lien externe, nouvel onglet)</span>
          {hint?.enrichment && <PublicSourceMark />}
        </a>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <TooltipLines lines={hint ? [EXTERNAL_LINK_HINT, hint.label] : [EXTERNAL_LINK_HINT]} />
      </TooltipContent>
    </Tooltip>
  );
}

/** Copies a text: Clipboard API, or a hidden textarea on a non-secure (http) intranet origin. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } finally {
    area.remove();
  }
}

/**
 * A network (`\\serveur\partage`) or local path: plain text in mono with a
 * « Copier » button — never a `file://` link.
 */
export function CopyableText({ text, kindLabel, hint }: { text: string; kindLabel: string; hint?: ProvenanceHint | null }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    setState((await copyText(text)) ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 2000);
  };
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2" data-slot="copyable-path">
      <WithProvenance hint={hint ?? null}>
        <code className="font-mono text-[13px] break-all">{text}</code>
      </WithProvenance>
      <span className="text-xs text-text-muted">{kindLabel}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copier le chemin ${text}`}
        className="inline-flex h-6 items-center gap-1 rounded-sm border border-border px-2 text-xs text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-ring print:hidden"
      >
        {state === "copied" ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        Copier
      </button>
      <span role="status" className="text-xs text-text-muted">
        {state === "copied" ? "Copié" : state === "failed" ? "Copie impossible" : ""}
      </span>
    </span>
  );
}

/** A focusable value with an informative tooltip (several lines). */
export function InfoTooltip({ lines, children }: { lines: readonly string[]; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} data-slot="info-tooltip" className="inline-flex cursor-help rounded-xs underline decoration-dotted underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-ring">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end">
        <TooltipLines lines={lines} />
      </TooltipContent>
    </Tooltip>
  );
}
