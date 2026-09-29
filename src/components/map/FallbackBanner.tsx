/** Discreet banner shown when the detailed basemap is not installed. */
export function FallbackBanner({ isAdmin }: { isAdmin: boolean }) {
  return (
    <p
      role="status"
      data-slot="fallback-banner"
      className="glass pointer-events-auto absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-xs text-text-subtle shadow-panel"
    >
      Fond de carte détaillé non installé
      {isAdmin && (
        <>
          {" — "}
          <span className="text-text-muted">
            voir la procédure d&apos;installation (<code className="numeric">docs/offline-bundle.md</code>)
          </span>
        </>
      )}
    </p>
  );
}
