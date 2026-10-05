import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const themeBlock = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

function token(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(themeBlock);
  if (!match?.[1]) throw new Error(`token ${name} introuvable dans @theme`);
  return match[1].trim().toLowerCase();
}

/** WCAG 2.x relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const EXPECTED: Record<string, string> = {
  "--color-bg": "#f5f2ec",
  "--color-surface-1": "#ffffff",
  "--color-surface-2": "#faf8f4",
  "--color-surface-3": "#efeae1",
  "--color-border": "#e7e1d7",
  "--color-border-strong": "#cfc5b5",
  "--color-text": "#1d1b18",
  "--color-text-muted": "#635d54",
  "--color-text-subtle": "#8a8378",
  "--color-accent": "#1b4f9c",
  "--color-on-accent": "#ffffff",
  "--color-status-ok": "#2f8f5b",
  "--color-status-warning": "#c98512",
  "--color-status-critical": "#cf3b32",
  "--color-status-unknown": "#8b867d",
};

describe("design tokens", () => {
  it.each(Object.entries(EXPECTED))("%s = %s", (name, value) => {
    expect(token(name)).toBe(value);
  });

  it("defines the 8 / 12 / 16 px radii", () => {
    expect([token("--radius-sm"), token("--radius-md"), token("--radius-lg")]).toEqual([
      "8px",
      "12px",
      "16px",
    ]);
  });

  it("maps shadcn variables onto Vigie tokens", () => {
    expect(css).toMatch(/--background:\s*var\(--color-bg\)/);
    expect(css).toMatch(/--primary:\s*var\(--color-accent\)/);
    expect(css).toMatch(/--ring:\s*var\(--color-accent\)/);
    expect(css).not.toMatch(/oklch\(/);
  });
});

describe("text contrast (WCAG AA)", () => {
  const surfaces = ["--color-bg", "--color-surface-1", "--color-surface-2", "--color-surface-3"];

  it.each(surfaces)("text and text-muted reach 4.5:1 on %s", (surface) => {
    expect(contrast(token("--color-text"), token(surface))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-text-muted"), token(surface))).toBeGreaterThanOrEqual(4.5);
  });

  it("accent reaches 4.5:1 as text on panels, and as a button background", () => {
    expect(contrast(token("--color-accent"), token("--color-surface-1"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("--color-on-accent"), token("--color-accent"))).toBeGreaterThanOrEqual(4.5);
  });

  it("text-subtle reaches 3:1 (large text / non-text only) on bg and surface-1", () => {
    expect(contrast(token("--color-text-subtle"), token("--color-bg"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("--color-text-subtle"), token("--color-surface-1"))).toBeGreaterThanOrEqual(3);
  });
});
