/**
 * Vigie logo (brand kit « vigie-brand »): a lighthouse in a rounded tile,
 * cyan lantern and beams, name in Unbounded 600 (self-hosted through
 * @fontsource/unbounded — never loaded from the internet).
 *
 * Below 48 px the simplified drawings of the favicon are used; never shrink
 * the full symbol to 16 px. Green, amber and red are FORBIDDEN in the logo
 * (reserved for compliance statuses).
 *
 * Server-compatible (no hook): the clip-path id is derived from the drawing,
 * identical tiles simply share the same definition.
 */
import { APP_NAME } from "@/config/app";

/** Logo layout. */
export type VigieLogoVariant = "icon" | "horizontal" | "vertical";
/** Logo theme. */
export type VigieLogoTheme = "dark" | "light" | "mono";

/** Brand colors of each theme (brand kit tokens). */
export const LOGO_THEMES: Readonly<Record<VigieLogoTheme, { bg: string; fg: string; beam: string; beamOpacity: number; lantern: string; text: string }>> = {
  dark: { bg: "#141A21", fg: "#EEF1F3", beam: "#7CC8E0", beamOpacity: 0.5, lantern: "#7CC8E0", text: "#EEF1F3" },
  light: { bg: "#E2E7EB", fg: "#0B0E12", beam: "#2F6F86", beamOpacity: 0.55, lantern: "#2F6F86", text: "#0B0E12" },
  mono: { bg: "#141A21", fg: "#EEF1F3", beam: "#EEF1F3", beamOpacity: 0.3, lantern: "#EEF1F3", text: "#EEF1F3" },
};

/** Drawing used for a size: full (≥ 48 px), simplified 32 (24–47) or 16 (< 24). */
export function logoDrawing(size: number): "full" | "32" | "16" {
  return size < 24 ? "16" : size < 48 ? "32" : "full";
}

/** Props of {@link VigieIcon}. */
export interface VigieIconProps {
  /** Tile size in px. */
  size?: number;
  theme?: VigieLogoTheme;
  /** Hide from assistive technologies (when the name is written next to it). */
  decorative?: boolean;
  className?: string;
}

/** The symbol in its tile. */
export function VigieIcon({ size = 48, theme = "dark", decorative = false, className }: VigieIconProps) {
  const t = LOGO_THEMES[theme];
  const drawing = logoDrawing(size);
  const clip = `vigie-clip-${drawing}-${theme}`;
  const rx = drawing === "full" ? 46 : 50;
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": APP_NAME };

  const shapes =
    drawing === "16" ? (
      <>
        <polygon points="80,56 80,96 -20,80 -20,10" fill={t.beam} fillOpacity={0.8} />
        <polygon points="120,56 120,96 220,80 220,10" fill={t.beam} fillOpacity={0.8} />
        <rect x="76" y="48" width="48" height="48" fill={t.lantern} />
        <polygon points="72,104 128,104 144,202 56,202" fill={t.fg} />
      </>
    ) : drawing === "32" ? (
      <>
        <polygon points="86,64 86,90 -20,76 -20,14" fill={t.beam} fillOpacity={0.7} />
        <polygon points="114,64 114,90 220,76 220,14" fill={t.beam} fillOpacity={0.7} />
        <polygon points="80,62 120,62 100,38" fill={t.fg} />
        <rect x="86" y="62" width="28" height="28" fill={t.lantern} />
        <polygon points="80,96 120,96 132,202 68,202" fill={t.fg} />
      </>
    ) : (
      <>
        <polygon points="88,70 88,86 -20,72 -20,18" fill={t.beam} fillOpacity={t.beamOpacity} />
        <polygon points="112,70 112,86 220,72 220,18" fill={t.beam} fillOpacity={t.beamOpacity} />
        <polygon points="84,66 116,66 100,46" fill={t.fg} />
        <rect x="88" y="66" width="24" height="22" fill={t.lantern} />
        <rect x="80" y="88" width="40" height="8" rx="2" fill={t.fg} />
        <polygon points="86,102 114,102 124,202 76,202" fill={t.fg} />
        <rect x="70" y="146" width="60" height="10" fill={t.bg} />
      </>
    );

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      data-slot="vigie-icon"
      data-drawing={drawing}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
      {...a11y}
    >
      <defs>
        <clipPath id={clip}>
          <rect width="200" height="200" rx={rx} />
        </clipPath>
      </defs>
      <rect width="200" height="200" rx={rx} fill={t.bg} />
      <g clipPath={`url(#${clip})`}>{shapes}</g>
    </svg>
  );
}

/** Props of {@link VigieLogo}. */
export interface VigieLogoProps {
  variant?: VigieLogoVariant;
  theme?: VigieLogoTheme;
  /** Tile height in px. */
  size?: number;
  className?: string;
}

/** Full logo: symbol + name (horizontal or vertical), or symbol only. */
export function VigieLogo({ variant = "horizontal", theme = "dark", size = 40, className }: VigieLogoProps) {
  if (variant === "icon") return <VigieIcon size={size} theme={theme} className={className} />;
  const t = LOGO_THEMES[theme];
  const vertical = variant === "vertical";
  return (
    <span
      role="img"
      aria-label={APP_NAME}
      data-slot="vigie-logo"
      className={className}
      style={{ display: "inline-flex", flexDirection: vertical ? "column" : "row", alignItems: "center", gap: vertical ? size * 0.2 : size * 0.24 }}
    >
      <VigieIcon size={size} theme={theme} decorative />
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-brand)",
          fontWeight: 600,
          lineHeight: 1,
          color: t.text,
          fontSize: vertical ? size * 0.36 : size * 0.62,
          letterSpacing: vertical ? "0.12em" : "0.02em",
        }}
      >
        {APP_NAME.toLocaleUpperCase("fr-FR")}
      </span>
    </span>
  );
}
