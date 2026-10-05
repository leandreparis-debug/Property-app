import { cn } from "@/lib/utils";

/**
 * Classes shared by the native inputs, selects and text areas (tokens only,
 * error = dashed border). A plain module: usable from server AND client
 * components (a constant exported by a "use client" module is not a string
 * on the server).
 */
export const INPUT_CLASS = cn(
  "w-full min-w-0 rounded-sm border border-input bg-secondary px-3 py-1.5 text-sm text-foreground outline-none transition-colors",
  "hover:border-border-strong focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
  "aria-invalid:border-dashed aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
);
