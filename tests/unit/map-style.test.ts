import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMapAssets } from "@/components/map/style/assets";
import { buildAttributions, escapeHtml, FALLBACK_ATTRIBUTION } from "@/components/map/style/attribution";
import { buildBasemapStyle, BASEMAP_SOURCE, DROPPED_LAYERS } from "@/components/map/style/basemap-style";
import { buildFallbackStyle, countriesFromTopology, FRANCE_ID, type WorldTopology } from "@/components/map/style/fallback-style";
import { ORTHO_SOURCE } from "@/components/map/style/ortho";
import { ACCENT, ACCENT_VOLUME, MAP_NEUTRAL, NEUTRAL, STATUS_COLORS } from "@/components/map/style/theme";
import { CLUSTER_WORST_STATUS, CLUSTER_PROPERTIES, haloAt, POINTS_LAYER, SITE_LAYERS } from "@/components/map/layers/sites";
import { readSiteParam, withSiteParam } from "@/components/map/url-state";

const CSS = readFileSync(join(__dirname, "../../src/app/globals.css"), "utf8");
const FORBIDDEN_IN_BASEMAP = [STATUS_COLORS.ok, STATUS_COLORS.warning, STATUS_COLORS.critical, ACCENT, ACCENT_VOLUME].map((c) => c.toLowerCase());

const json = (v: unknown) => JSON.stringify(v).toLowerCase();

describe("theme = CSS design tokens", () => {
  it.each([
    ["--color-bg", NEUTRAL.bg],
    ["--color-surface-1", NEUTRAL.surface1],
    ["--color-surface-2", NEUTRAL.surface2],
    ["--color-surface-3", NEUTRAL.surface3],
    ["--color-border", NEUTRAL.border],
    ["--color-border-strong", NEUTRAL.borderStrong],
    ["--color-text", NEUTRAL.text],
    ["--color-text-muted", NEUTRAL.textMuted],
    ["--color-accent", ACCENT],
    ["--color-status-ok", STATUS_COLORS.ok],
    ["--color-status-warning", STATUS_COLORS.warning],
    ["--color-status-critical", STATUS_COLORS.critical],
    ["--color-status-unknown", STATUS_COLORS.unknown],
  ])("%s", (token, value) => {
    expect(CSS).toMatch(new RegExp(`${token}:\\s*${value}\\b`, "i"));
  });
});

describe("basemap-style", () => {
  const style = buildBasemapStyle({ origin: "", ortho: false, attributions: ["© OSM"] });

  it("no absolute URL written in the style (origin given at runtime)", () => {
    expect(json(style)).not.toMatch(/https?:\/\//);
    const withOrigin = buildBasemapStyle({ origin: "http://vigie.interne", ortho: true, attributions: [] });
    const urls = [withOrigin.glyphs, withOrigin.sprite, (withOrigin.sources[BASEMAP_SOURCE] as { url: string }).url, (withOrigin.sources[ORTHO_SOURCE] as { url: string }).url];
    for (const u of urls) expect(String(u)).toMatch(/^(pmtiles:\/\/)?http:\/\/vigie\.interne\/api\/map-assets\//);
  });

  it("references the right sources and assets", () => {
    expect(style.glyphs).toBe("/api/map-assets/fonts/{fontstack}/{range}.pbf");
    expect(style.sprite).toBe("/api/map-assets/sprites/v4/dark");
    expect(style.sources[BASEMAP_SOURCE]).toMatchObject({ type: "vector", url: "pmtiles:///api/map-assets/france.pmtiles" });
    expect(style.layers.every((l) => l.type === "background" || (l as { source?: string }).source === BASEMAP_SOURCE)).toBe(true);
  });

  it("no status color and no accent in the basemap", () => {
    const text = json(style);
    for (const c of FORBIDDEN_IN_BASEMAP) expect(text).not.toContain(c);
  });

  it("theme: land/water, highlighted motorways, dashed regions, extruded buildings from z15, no POI", () => {
    const layer = (id: string) => style.layers.find((l) => l.id === id) as { paint?: Record<string, unknown>; minzoom?: number; type: string } | undefined;
    expect(layer("background")?.paint?.["background-color"]).toBe(MAP_NEUTRAL.water);
    expect(layer("earth")?.paint?.["fill-color"]).toBe(MAP_NEUTRAL.land);
    expect(layer("roads_highway")?.paint?.["line-color"]).toBe(MAP_NEUTRAL.highway);
    expect(layer("roads_highway_glow")).toBeDefined();
    expect(layer("boundaries")?.paint?.["line-dasharray"]).toBeDefined();
    expect(layer("buildings")).toMatchObject({ type: "fill-extrusion", minzoom: 15 });
    for (const id of DROPPED_LAYERS) expect(layer(id)).toBeUndefined();
  });

  it("the ortho layer is present only when the manifest declares it", () => {
    expect(style.sources[ORTHO_SOURCE]).toBeUndefined();
    expect(style.layers.find((l) => l.id === "ortho")).toBeUndefined();
    const withOrtho = buildBasemapStyle({ origin: "", ortho: true, attributions: [] });
    const ortho = withOrtho.layers.find((l) => l.id === "ortho") as unknown as { minzoom?: number; paint: Record<string, number> };
    expect(ortho.minzoom).toBe(14);
    expect(ortho.paint["raster-saturation"]).toBeCloseTo(-0.7);
    expect(ortho.paint["raster-brightness-max"]).toBeCloseTo(0.55);
    expect(ortho.paint["raster-contrast"]).toBeGreaterThan(0);
    // Below the first label layer.
    const i = withOrtho.layers.findIndex((l) => l.id === "ortho");
    expect(withOrtho.layers.slice(0, i).some((l) => l.type === "symbol")).toBe(false);
  });
});

describe("fallback-style", () => {
  const topology = JSON.parse(readFileSync(join(__dirname, "../../node_modules/world-atlas/countries-50m.json"), "utf8")) as WorldTopology;
  const countries = countriesFromTopology(topology);

  it("Western Europe only, France flagged", () => {
    expect(countries.features.length).toBeGreaterThan(20);
    expect(countries.features.length).toBeLessThan(80);
    expect(countries.features.filter((f) => f.properties.isFrance)).toHaveLength(1);
    expect(countries.features.find((f) => String(f.id) === FRANCE_ID)?.properties.isFrance).toBe(true);
    expect(countries.features.some((f) => f.properties.name === "Japan")).toBe(false);
  });

  it("no glyphs, no sprite, no text layer, no absolute URL, no status color", () => {
    const style = buildFallbackStyle({ countries, origin: "", ortho: false, attributions: [FALLBACK_ATTRIBUTION] });
    expect(style).not.toHaveProperty("glyphs");
    expect(style).not.toHaveProperty("sprite");
    expect(style.layers.some((l) => l.type === "symbol")).toBe(false);
    const text = json({ ...style, sources: {} });
    expect(text).not.toMatch(/https?:\/\//);
    for (const c of FORBIDDEN_IN_BASEMAP) expect(text).not.toContain(c);
    expect(style.layers.find((l) => l.id === "background")).toMatchObject({ paint: { "background-color": NEUTRAL.bg } });
  });

  it("ortho optional in the fallback too", () => {
    expect(buildFallbackStyle({ countries, origin: "", ortho: true, attributions: [] }).sources[ORTHO_SOURCE]).toBeDefined();
  });
});

describe("attributions and assets", () => {
  it("plain text, escaped, deduplicated, no link", () => {
    const out = buildAttributions(
      [
        { name: "a", licence: "ODbL", attribution: '<a href="x">© contributeurs OpenStreetMap</a>' },
        { name: "b", licence: "Etalab", attribution: "© IGN – BD ORTHO" },
        { name: "c", licence: "Etalab", attribution: "© IGN – BD ORTHO" },
      ],
      false,
    );
    expect(out).toEqual(["© contributeurs OpenStreetMap", "© IGN – BD ORTHO"]);
    expect(out.join("")).not.toMatch(/<a|href/);
    expect(escapeHtml("A & <b>")).toBe("A &amp; &lt;b&gt;");
    expect(buildAttributions([], true)).toEqual([FALLBACK_ATTRIBUTION]);
  });

  it("full basemap only with france.pmtiles, glyphs and sprites", () => {
    const files = (paths: string[]) => ({ name: "b", sources: [], files: paths.map((path) => ({ path, size: 10 })) });
    expect(resolveMapAssets(null)).toMatchObject({ basemap: false, ortho: false });
    expect(resolveMapAssets(files(["sprites/v4/dark.json", "sprites/v4/dark.png", "fonts/Noto Sans Regular/0-255.pbf"])).basemap).toBe(false);
    const full = resolveMapAssets(files(["france.pmtiles", "sprites/v4/dark.json", "sprites/v4/dark.png", "fonts/Noto Sans Regular/0-255.pbf", "ortho-sites.pmtiles"]));
    expect(full).toMatchObject({ basemap: true, ortho: true });
    // The fixtures bundle has an EMPTY glyph file → fallback.
    expect(resolveMapAssets({ name: "b", sources: [], files: [{ path: "france.pmtiles", size: 5 }, { path: "sprites/v4/dark.json", size: 3 }, { path: "sprites/v4/dark.png", size: 3 }, { path: "fonts/Noto Sans Regular/0-255.pbf", size: 0 }] }).basemap).toBe(false);
  });
});

describe("site layers", () => {
  /** Minimal evaluator for the cluster expressions used here. */
  const evaluate = (expr: unknown, props: Record<string, number>): unknown => {
    if (!Array.isArray(expr)) return expr;
    const [op, ...args] = expr as [string, ...unknown[]];
    if (op === "get") return props[args[0] as string];
    if (op === ">") return (evaluate(args[0], props) as number) > (evaluate(args[1], props) as number);
    if (op === "case") {
      for (let i = 0; i < args.length - 1; i += 2) if (evaluate(args[i], props)) return evaluate(args[i + 1], props);
      return evaluate(args[args.length - 1], props);
    }
    throw new Error(op);
  };

  it("cluster color = most severe status of the cluster", () => {
    expect(evaluate(CLUSTER_WORST_STATUS, { critical: 1, warning: 5, unknown: 2 })).toBe("critical");
    expect(evaluate(CLUSTER_WORST_STATUS, { critical: 0, warning: 1, unknown: 2 })).toBe("warning");
    expect(evaluate(CLUSTER_WORST_STATUS, { critical: 0, warning: 0, unknown: 2 })).toBe("unknown");
    expect(evaluate(CLUSTER_WORST_STATUS, { critical: 0, warning: 0, unknown: 0 })).toBe("ok");
    expect(Object.keys(CLUSTER_PROPERTIES).sort()).toEqual(["critical", "unknown", "warning"]);
  });

  it("points: hierarchy and critical sites on top", () => {
    expect(POINTS_LAYER.layout?.["circle-sort-key"]).toEqual(["get", "statusRank"]);
    expect(JSON.stringify(POINTS_LAYER.paint?.["circle-radius"])).toBe(JSON.stringify(["match", ["get", "status"], "critical", 7, "warning", 6, "unknown", 4.5, 3.5]));
    expect(SITE_LAYERS.map((l) => l.id).indexOf("site-points")).toBeGreaterThan(SITE_LAYERS.map((l) => l.id).indexOf("site-critical-halo"));
  });

  it("halo pulse", () => {
    expect(haloAt(0)).toEqual({ radius: 8, opacity: 0.45 });
    expect(haloAt(0.5).radius).toBe(14);
    expect(haloAt(1)).toEqual(haloAt(0));
  });
});

describe("?site= in the URL", () => {
  it("reads a valid code, rejects a malformed one", () => {
    expect(readSiteParam("?site=SMP-001")).toBe("SMP-001");
    expect(readSiteParam(new URLSearchParams("site=DEMO-P01&x=1"))).toBe("DEMO-P01");
    expect(readSiteParam("?site=")).toBeNull();
    expect(readSiteParam("?site=%3Cscript%3E")).toBeNull();
    expect(readSiteParam("?other=1")).toBeNull();
  });

  it("writes and removes the parameter, keeping the others", () => {
    expect(withSiteParam("http://h/?x=1", "A-1")).toBe("/?x=1&site=A-1");
    expect(withSiteParam("/?site=A-1&x=1", null)).toBe("/?x=1");
    expect(withSiteParam("/?site=A-1", null)).toBe("/");
    expect(withSiteParam("/#h", "B")).toBe("/?site=B#h");
  });
});
